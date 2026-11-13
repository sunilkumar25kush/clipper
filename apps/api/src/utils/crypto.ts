import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config/env.js";

const BCRYPT_SALT_ROUNDS = 12;

export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

export function hashTokenSha256(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function generateSecureRandomToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("hex");
}

export interface AccessTokenPayload {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: config.jwt.accessExpiresIn as unknown as SignOptions["expiresIn"],
    issuer: "clipforge-api",
    audience: "clipforge-client",
  };
  return jwt.sign(payload, config.jwt.accessSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.jwt.accessSecret, {
    issuer: "clipforge-api",
    audience: "clipforge-client",
  }) as AccessTokenPayload;
}

