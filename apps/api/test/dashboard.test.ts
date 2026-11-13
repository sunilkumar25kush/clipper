import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "@clipforge/database";

describe("ClipForge AI Dashboard & Project API Tests", () => {
  const testEmail = `dash_${Date.now()}@example.com`;
  const testPassword = "DashPassword#2026";
  let accessToken: string;
  let userId: string;

  before(async () => {
    // Register a fresh user
    const regRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: testEmail,
        password: testPassword,
        fullName: "Dashboard Tester",
      });

    assert.equal(regRes.status, 201);
    accessToken = regRes.body.data.accessToken;
    userId = regRes.body.data.user.id;
  });

  after(async () => {
    await prisma.user.deleteMany({
      where: { id: userId },
    });
  });

  it("1. Should return zero state metrics for fresh user", async () => {
    const res = await request(app)
      .get("/api/v1/dashboard/metrics")
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.totalProjects, 0);
    assert.equal(res.body.data.generatedClips, 0);
    assert.equal(res.body.data.processingVideos, 0);
    assert.equal(res.body.data.availableCredits, 60);
    assert.equal(res.body.data.totalAllocatedCredits, 60);
    assert.equal(res.body.data.planTier, "FREE");
    assert.deepEqual(res.body.data.recentProjects, []);
    assert.deepEqual(res.body.data.recentClips, []);
  });

  it("2. Should reject project creation if rights are not attested", async () => {
    const res = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Unauthorized Video Project",
        sourceType: "FILE_UPLOAD",
        rightsAttested: false,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
  });

  it("3. Should create a new video project when rights are attested", async () => {
    const res = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "Scaling SaaS Podcast Episode 42",
        sourceType: "FILE_UPLOAD",
        rightsAttested: true,
        targetAspect: "RATIO_9_16",
        minClipDuration: 20,
        maxClipDuration: 60,
        maxClipsToGen: 10,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.title, "Scaling SaaS Podcast Episode 42");
    assert.equal(res.body.data.status, "DRAFT");
    assert.equal(res.body.data.targetAspect, "RATIO_9_16");
    assert.ok(res.body.data.id);
  });

  it("4. Should update dashboard metrics with created project", async () => {
    const res = await request(app)
      .get("/api/v1/dashboard/metrics")
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.totalProjects, 1);
    assert.equal(res.body.data.recentProjects.length, 1);
    assert.equal(res.body.data.recentProjects[0].title, "Scaling SaaS Podcast Episode 42");
    assert.equal(res.body.data.recentProjects[0].clipCount, 0);
  });

  it("5. Should return paginated list of projects with filtering", async () => {
    const res = await request(app)
      .get("/api/v1/projects?page=1&limit=10&status=DRAFT&search=Podcast")
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.meta.total, 1);
    assert.equal(res.body.meta.page, 1);
    assert.equal(res.body.data[0].title, "Scaling SaaS Podcast Episode 42");
  });
});
