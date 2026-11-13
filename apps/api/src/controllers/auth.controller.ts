import { Request, Response, NextFunction } from "express";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from "@clipforge/validation";
import { authService, ClientInfo } from "../services/auth.service.js";
import { config } from "../config/env.js";
import { AppError } from "../middlewares/error.js";

function getClientInfo(req: Request): ClientInfo {
  const userAgent = req.headers["user-agent"];
  const forwardedFor = req.headers["x-forwarded-for"];
  const ipAddress = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === "string"
      ? (forwardedFor.split(",")[0]?.trim() ?? undefined)
      : (req.socket?.remoteAddress ?? undefined);

  return { userAgent, ipAddress };
}

function setRefreshTokenCookie(res: Response, refreshToken: string) {
  res.cookie(config.cookie.name, refreshToken, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: config.cookie.path,
    domain: config.cookie.domain,
  });
}

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = registerSchema.parse(req.body);
      const clientInfo = getClientInfo(req);
      const result = await authService.register(parsed, clientInfo);

      setRefreshTokenCookie(res, result.refreshToken);

      res.status(201).json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken,
          ...(config.env === "development" && { devVerificationToken: result.verificationToken }),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = loginSchema.parse(req.body);
      const clientInfo = getClientInfo(req);
      const result = await authService.login(parsed, clientInfo);

      setRefreshTokenCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.accessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.[config.cookie.name] || req.body?.refreshToken;
      if (!rawRefreshToken) {
        throw new AppError(401, "MISSING_REFRESH_TOKEN", "Refresh token cookie is required");
      }

      const clientInfo = getClientInfo(req);
      const result = await authService.refreshToken(rawRefreshToken, clientInfo);

      setRefreshTokenCookie(res, result.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.[config.cookie.name] || req.body?.refreshToken;
      const userId = req.user?.id;

      await authService.logout(rawRefreshToken, userId);

      res.clearCookie(config.cookie.name, {
        path: config.cookie.path,
        domain: config.cookie.domain,
      });

      res.status(200).json({
        success: true,
        data: {
          loggedOut: true,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = forgotPasswordSchema.parse(req.body);
      const result = await authService.forgotPassword(parsed.email);

      res.status(200).json({
        success: true,
        data: {
          message: "If that account exists, a password reset link has been dispatched.",
          ...(config.env === "development" && result.token && { devResetToken: result.token }),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = resetPasswordSchema.parse(req.body);
      await authService.resetPassword(parsed.token, parsed.password);

      res.clearCookie(config.cookie.name, {
        path: config.cookie.path,
        domain: config.cookie.domain,
      });

      res.status(200).json({
        success: true,
        data: {
          message: "Password reset successful. Please log in with your new password.",
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = (req.query.token as string) || req.body?.token;
      const parsed = verifyEmailSchema.parse({ token });
      const user = await authService.verifyEmail(parsed.token);

      res.status(200).json({
        success: true,
        data: {
          user,
          message: "Email verified successfully.",
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async resendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const email = req.user?.email || req.body?.email;
      const parsed = resendVerificationSchema.parse({ email });
      const result = await authService.resendVerification(parsed.email);

      res.status(200).json({
        success: true,
        data: {
          message: "If your account is unverified, a new verification link has been sent.",
          ...(config.env === "development" && result.token && { devVerificationToken: result.token }),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "UNAUTHORIZED", "Authentication required");
      }

      const profile = await authService.getProfile(req.user.id);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
