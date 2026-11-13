import { prisma, TokenType, PlanTier as DbPlanTier, SubStatus } from "@clipforge/database";
import { RegisterInput, LoginInput } from "@clipforge/validation";
import { UserDTO, UserProfileResponse, PlanTier as SharedPlanTier } from "@clipforge/shared-types";
import {
  hashPassword,
  verifyPassword,
  hashTokenSha256,
  generateSecureRandomToken,
  signAccessToken,
} from "../utils/crypto.js";
import { AppError } from "../middlewares/error.js";

export interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthResult {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
  verificationToken?: string;
}

export class AuthService {
  /**
   * Register a new user with default subscription, free credits, and email verification token.
   */
  async register(input: RegisterInput, clientInfo: ClientInfo): Promise<AuthResult> {
    const normalizedEmail = input.email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new AppError(409, "EMAIL_ALREADY_EXISTS", "An account with this email already exists");
    }

    const passwordHash = await hashPassword(input.password);
    const rawRefreshToken = generateSecureRandomToken(32);
    const refreshTokenHash = hashTokenSha256(rawRefreshToken);
    const rawVerificationToken = generateSecureRandomToken(32);
    const verificationTokenHash = hashTokenSha256(rawVerificationToken);

    const now = new Date();
    const sessionExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const verificationExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const { user, session } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          fullName: input.fullName.trim(),
          role: "USER",
        },
      });

      // Default Free Plan Subscription
      await tx.subscription.create({
        data: {
          userId: newUser.id,
          planTier: DbPlanTier.FREE,
          status: SubStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      // Default Free Usage Credits (60 minutes)
      await tx.usageCredit.create({
        data: {
          userId: newUser.id,
          totalAllocated: 60,
          usedCredits: 0,
          heldCredits: 0,
          bonusCredits: 0,
          resetAt: periodEnd,
        },
      });

      // Email verification token
      await tx.verificationToken.create({
        data: {
          identifier: normalizedEmail,
          tokenHash: verificationTokenHash,
          type: TokenType.EMAIL_VERIFICATION,
          expiresAt: verificationExpiresAt,
        },
      });

      // Initial Refresh Session
      const newSession = await tx.session.create({
        data: {
          userId: newUser.id,
          refreshTokenHash,
          userAgent: clientInfo.userAgent,
          ipAddress: clientInfo.ipAddress,
          expiresAt: sessionExpiresAt,
        },
      });

      return { user: newUser, session: newSession };
    });

    const userDTO: UserDTO = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as "USER" | "ADMIN",
      emailVerifiedAt: null,
    };

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    });

    return {
      user: userDTO,
      accessToken,
      refreshToken: rawRefreshToken,
      verificationToken: rawVerificationToken,
    };
  }

  /**
   * Log in user, verify credentials, and create a new session.
   */
  async login(input: LoginInput, clientInfo: ClientInfo): Promise<AuthResult> {
    const normalizedEmail = input.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.passwordHash) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const isPasswordValid = await verifyPassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    if (!user.isActive) {
      throw new AppError(403, "ACCOUNT_DISABLED", "Your account has been deactivated. Please contact support.");
    }

    const rawRefreshToken = generateSecureRandomToken(32);
    const refreshTokenHash = hashTokenSha256(rawRefreshToken);
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        userAgent: clientInfo.userAgent,
        ipAddress: clientInfo.ipAddress,
        expiresAt: sessionExpiresAt,
      },
    });

    const userDTO: UserDTO = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as "USER" | "ADMIN",
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    };

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    });

    return {
      user: userDTO,
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  /**
   * Rotate refresh token and issue a new access token.
   */
  async refreshToken(rawRefreshToken: string, clientInfo: ClientInfo): Promise<AuthResult> {
    if (!rawRefreshToken) {
      throw new AppError(401, "MISSING_REFRESH_TOKEN", "Refresh token cookie is required");
    }

    const tokenHash = hashTokenSha256(rawRefreshToken);

    const session = await prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new AppError(401, "SESSION_EXPIRED_OR_REVOKED", "Session has expired or has been revoked");
    }

    if (!session.user || !session.user.isActive) {
      throw new AppError(403, "ACCOUNT_DISABLED", "Account has been deactivated");
    }

    // Token Rotation: generate a fresh refresh token
    const newRawRefreshToken = generateSecureRandomToken(32);
    const newRefreshTokenHash = hashTokenSha256(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const updatedSession = await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: newExpiresAt,
        userAgent: clientInfo.userAgent ?? session.userAgent,
        ipAddress: clientInfo.ipAddress ?? session.ipAddress,
      },
    });

    const userDTO: UserDTO = {
      id: session.user.id,
      email: session.user.email,
      fullName: session.user.fullName,
      role: session.user.role as "USER" | "ADMIN",
      emailVerifiedAt: session.user.emailVerifiedAt ? session.user.emailVerifiedAt.toISOString() : null,
    };

    const accessToken = signAccessToken({
      userId: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: updatedSession.id,
    });

    return {
      user: userDTO,
      accessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  /**
   * Log out session by revoking the refresh token.
   */
  async logout(rawRefreshToken?: string, userId?: string): Promise<boolean> {
    if (rawRefreshToken) {
      const tokenHash = hashTokenSha256(rawRefreshToken);
      await prisma.session.updateMany({
        where: { refreshTokenHash: tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return true;
    }

    if (userId) {
      await prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return true;
    }

    return true;
  }

  /**
   * Request password reset token. Always resolves without leaking email existence.
   */
  async forgotPassword(email: string): Promise<{ token?: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return {};
    }

    const rawToken = generateSecureRandomToken(32);
    const tokenHash = hashTokenSha256(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Clean up older reset tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier: normalizedEmail, type: TokenType.PASSWORD_RESET },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        tokenHash,
        type: TokenType.PASSWORD_RESET,
        expiresAt,
      },
    });

    return { token: rawToken };
  }

  /**
   * Reset user password using token, then invalidate all previous sessions.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashTokenSha256(rawToken);

    const tokenRecord = await prisma.verificationToken.findUnique({
      where: { tokenHash },
    });

    if (!tokenRecord || tokenRecord.type !== TokenType.PASSWORD_RESET || tokenRecord.expiresAt <= new Date()) {
      throw new AppError(400, "INVALID_OR_EXPIRED_TOKEN", "Password reset token is invalid or has expired");
    }

    const user = await prisma.user.findUnique({
      where: { email: tokenRecord.identifier },
    });

    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User associated with this token was not found");
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      prisma.verificationToken.delete({
        where: { id: tokenRecord.id },
      }),
      // Revoke all active sessions upon password reset for security
      prisma.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /**
   * Verify user email via token.
   */
  async verifyEmail(rawToken: string): Promise<UserDTO> {
    const tokenHash = hashTokenSha256(rawToken);

    const tokenRecord = await prisma.verificationToken.findUnique({
      where: { tokenHash },
    });

    if (!tokenRecord || tokenRecord.type !== TokenType.EMAIL_VERIFICATION || tokenRecord.expiresAt <= new Date()) {
      throw new AppError(400, "INVALID_OR_EXPIRED_TOKEN", "Verification link is invalid or has expired");
    }

    const user = await prisma.user.findUnique({
      where: { email: tokenRecord.identifier },
    });

    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User associated with this token was not found");
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });

      await tx.verificationToken.delete({
        where: { id: tokenRecord.id },
      });

      return u;
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      fullName: updatedUser.fullName,
      role: updatedUser.role as "USER" | "ADMIN",
      emailVerifiedAt: updatedUser.emailVerifiedAt ? updatedUser.emailVerifiedAt.toISOString() : null,
    };
  }

  /**
   * Resend email verification token.
   */
  async resendVerification(email: string): Promise<{ token?: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || user.emailVerifiedAt) {
      return {};
    }

    const rawToken = generateSecureRandomToken(32);
    const tokenHash = hashTokenSha256(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.verificationToken.deleteMany({
      where: { identifier: normalizedEmail, type: TokenType.EMAIL_VERIFICATION },
    });

    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        tokenHash,
        type: TokenType.EMAIL_VERIFICATION,
        expiresAt,
      },
    });

    return { token: rawToken };
  }

  /**
   * Fetch authenticated user's profile with active subscription & available credits.
   */
  async getProfile(userId: string): Promise<UserProfileResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
        usageCredit: true,
      },
    });

    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User profile not found");
    }

    const userDTO: UserDTO = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as "USER" | "ADMIN",
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    };

    const credits = user.usageCredit
      ? {
          totalAllocated: user.usageCredit.totalAllocated,
          usedCredits: user.usageCredit.usedCredits,
          heldCredits: user.usageCredit.heldCredits,
          bonusCredits: user.usageCredit.bonusCredits,
          availableCredits: Math.max(
            0,
            user.usageCredit.totalAllocated +
              user.usageCredit.bonusCredits -
              user.usageCredit.usedCredits -
              user.usageCredit.heldCredits,
          ),
        }
      : null;

    const subscription = user.subscription
      ? {
          planTier: user.subscription.planTier as unknown as SharedPlanTier,
          status: user.subscription.status,
          currentPeriodEnd: user.subscription.currentPeriodEnd.toISOString(),
        }
      : null;

    return {
      user: userDTO,
      subscription,
      credits,
    };
  }
}

export const authService = new AuthService();
