import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";
import { requireAuth, optionalAuth } from "../middlewares/auth.js";
import {
  registerLimiter,
  loginLimiter,
  forgotPasswordLimiter,
  refreshLimiter,
} from "../middlewares/rate-limit.js";

export const authRouter: Router = Router();

authRouter.post("/register", registerLimiter, (req, res, next) => {
  authController.register(req, res, next);
});

authRouter.post("/login", loginLimiter, (req, res, next) => {
  authController.login(req, res, next);
});

authRouter.post("/refresh", refreshLimiter, (req, res, next) => {
  authController.refresh(req, res, next);
});

authRouter.post("/logout", optionalAuth, (req, res, next) => {
  authController.logout(req, res, next);
});

authRouter.post("/forgot-password", forgotPasswordLimiter, (req, res, next) => {
  authController.forgotPassword(req, res, next);
});

authRouter.post("/reset-password", (req, res, next) => {
  authController.resetPassword(req, res, next);
});

authRouter.get("/verify-email", (req, res, next) => {
  authController.verifyEmail(req, res, next);
});

authRouter.post("/verify-email", (req, res, next) => {
  authController.verifyEmail(req, res, next);
});

authRouter.post("/resend-verification", optionalAuth, (req, res, next) => {
  authController.resendVerification(req, res, next);
});

authRouter.get("/me", requireAuth, (req, res, next) => {
  authController.getMe(req, res, next);
});
