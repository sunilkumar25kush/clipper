import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "@clipforge/database";

describe("ClipForge AI Authentication System Tests", () => {
  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = "ValidPassword#2026";
  const newPassword = "UpdatedPassword#2026";
  let accessToken: string;
  let refreshTokenCookie: string;
  let verificationToken: string;
  let resetToken: string;

  before(async () => {
    // Clean up any test user if existed
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
  });

  after(async () => {
    // Cleanup test data
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
  });

  it("1. Should fail registration with invalid email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: "not-an-email",
        password: testPassword,
        fullName: "Test User",
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });

  it("2. Should successfully register a new user", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: testEmail,
        password: testPassword,
        fullName: "ClipForge Tester",
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.user);
    assert.equal(res.body.data.user.email, testEmail);
    assert.equal(res.body.data.user.fullName, "ClipForge Tester");
    assert.equal(res.body.data.user.role, "USER");
    assert.ok(res.body.data.accessToken);

    accessToken = res.body.data.accessToken;
    verificationToken = res.body.data.devVerificationToken;

    const cookies = res.headers["set-cookie"];
    assert.ok(cookies, "Should set refresh cookie");
    const cookieHeader = Array.isArray(cookies) ? cookies.join("; ") : cookies;
    assert.match(cookieHeader, /cf_refresh_token=/);
    refreshTokenCookie = cookieHeader;
  });

  it("3. Should reject duplicate email registration", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: testEmail,
        password: testPassword,
        fullName: "Another User",
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "EMAIL_ALREADY_EXISTS");
  });

  it("4. Should reject login with incorrect password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testEmail,
        password: "WrongPassword#123",
      });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
  });

  it("5. Should successfully login with valid credentials", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testEmail,
        password: testPassword,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, testEmail);
    assert.ok(res.body.data.accessToken);

    accessToken = res.body.data.accessToken;
    const cookies = res.headers["set-cookie"];
    refreshTokenCookie = Array.isArray(cookies) ? cookies.join("; ") : cookies;
  });

  it("6. Should access protected profile route with valid token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.user.email, testEmail);
    assert.equal(res.body.data.subscription.planTier, "FREE");
    assert.equal(res.body.data.credits.totalAllocated, 60);
    assert.equal(res.body.data.credits.availableCredits, 60);
  });

  it("7. Should block unauthorized access without token", async () => {
    const res = await request(app).get("/api/v1/auth/me");

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "UNAUTHORIZED");
  });

  it("8. Should successfully verify user email", async () => {
    assert.ok(verificationToken, "Verification token should have been captured");

    const res = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: verificationToken });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.user.emailVerifiedAt);
  });

  it("9. Should rotate refresh token and issue new access token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshTokenCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.accessToken);

    accessToken = res.body.data.accessToken;
    const cookies = res.headers["set-cookie"];
    refreshTokenCookie = Array.isArray(cookies) ? cookies.join("; ") : cookies;
  });

  it("10. Should successfully request forgot password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: testEmail });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.devResetToken);
    resetToken = res.body.data.devResetToken;
  });

  it("11. Should successfully reset password with valid token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        token: resetToken,
        password: newPassword,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  it("12. Old sessions should be revoked after password reset", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshTokenCookie);

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "SESSION_EXPIRED_OR_REVOKED");
  });

  it("13. Should login with newly reset password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: testEmail,
        password: newPassword,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const cookies = res.headers["set-cookie"];
    refreshTokenCookie = Array.isArray(cookies) ? cookies.join("; ") : cookies;
  });

  it("14. Should successfully logout and clear session", async () => {
    const res = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", refreshTokenCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.loggedOut, true);

    // Cleared cookie
    const cookies = res.headers["set-cookie"];
    const cookieHeader = Array.isArray(cookies) ? cookies.join("; ") : cookies;
    assert.match(cookieHeader, /cf_refresh_token=;/);
  });
});

