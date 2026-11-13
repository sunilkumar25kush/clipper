import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "@clipforge/database";

describe("ClipForge AI Video Upload & Storage Lifecycle Tests", () => {
  const testEmail = `upload_tester_${Date.now()}@example.com`;
  const otherEmail = `other_user_${Date.now()}@example.com`;
  const testPassword = "UploadPassword#2026";
  let accessToken: string;
  let otherAccessToken: string;
  let userId: string;
  let otherUserId: string;

  let currentProjectId: string;
  let currentAssetId: string;
  let directUploadUrl: string;

  before(async () => {
    // Register primary user
    const regRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: testEmail,
        password: testPassword,
        fullName: "Primary Upload Tester",
      });
    assert.equal(regRes.status, 201);
    accessToken = regRes.body.data.accessToken;
    userId = regRes.body.data.user.id;

    // Register secondary user for tenant isolation tests
    const otherRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: otherEmail,
        password: testPassword,
        fullName: "Secondary User",
      });
    assert.equal(otherRes.status, 201);
    otherAccessToken = otherRes.body.data.accessToken;
    otherUserId = otherRes.body.data.user.id;
  });

  after(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });
  });

  it("1. Should reject upload initiation without authentication", async () => {
    const res = await request(app)
      .post("/api/v1/videos/upload/initiate")
      .send({
        filename: "podcast_ep1.mp4",
        fileSizeBytes: 1024 * 1024 * 50,
        mimeType: "video/mp4",
        rightsAttested: true,
      });

    assert.equal(res.status, 401);
  });

  it("2. Should reject upload initiation without rights attestation", async () => {
    const res = await request(app)
      .post("/api/v1/videos/upload/initiate")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        filename: "podcast_ep1.mp4",
        fileSizeBytes: 1024 * 1024 * 50,
        mimeType: "video/mp4",
        rightsAttested: false,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  it("3. Should reject unsupported video mime types (e.g. video/avi, text/plain)", async () => {
    const res = await request(app)
      .post("/api/v1/videos/upload/initiate")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        filename: "malicious.exe",
        fileSizeBytes: 1024 * 1024 * 5,
        mimeType: "application/x-msdownload",
        rightsAttested: true,
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  it("4. Should reject files exceeding free tier size limit (> 500 MB)", async () => {
    const res = await request(app)
      .post("/api/v1/videos/upload/initiate")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        filename: "massive_raw_camera.mp4",
        fileSizeBytes: 600 * 1024 * 1024, // 600 MB (Free limit is 500 MB)
        mimeType: "video/mp4",
        rightsAttested: true,
      });

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /exceeds the 500 MB limit/);
  });

  it("5. Should successfully initiate upload for valid MP4 within tier limit", async () => {
    const res = await request(app)
      .post("/api/v1/videos/upload/initiate")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        filename: "startup_pitch_2026.mp4",
        fileSizeBytes: 1024 * 1024 * 10, // 10 MB
        mimeType: "video/mp4",
        title: "Startup Pitch Presentation",
        targetAspect: "RATIO_9_16",
        minClipDuration: 15,
        maxClipDuration: 60,
        maxClipsToGen: 5,
        rightsAttested: true,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.projectId);
    assert.ok(res.body.data.assetId);
    assert.ok(res.body.data.storageKey.startsWith(`users/${userId}/projects/`));
    assert.ok(res.body.data.uploadUrl);

    currentProjectId = res.body.data.projectId;
    currentAssetId = res.body.data.assetId;
    directUploadUrl = res.body.data.uploadUrl;
  });

  it("6. Should reject direct stream upload from unauthorized user", async () => {
    const fakeChunk = Buffer.from("FAKE_VIDEO_BINARY_DATA_CHUNK");

    const res = await request(app)
      .put(`/api/v1/videos/upload/direct/${currentAssetId}`)
      .set("Authorization", `Bearer ${otherAccessToken}`)
      .set("Content-Type", "video/mp4")
      .send(fakeChunk);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  it("7. Should successfully stream upload video bytes", async () => {
    const videoPayload = Buffer.alloc(1024 * 64, 0x00); // 64 KB mock video payload

    const res = await request(app)
      .put(directUploadUrl)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("Content-Type", "video/mp4")
      .send(videoPayload);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.assetId, currentAssetId);
    assert.equal(res.body.data.bytesWritten, 1024 * 64);
  });

  it("8. Should reject complete upload attempt by unauthorized user", async () => {
    const res = await request(app)
      .post("/api/v1/videos/upload/complete")
      .set("Authorization", `Bearer ${otherAccessToken}`)
      .send({
        projectId: currentProjectId,
        assetId: currentAssetId,
        durationSeconds: 120.5,
        width: 1920,
        height: 1080,
      });

    assert.equal(res.status, 403);
  });

  it("9. Should successfully complete upload and attach metadata", async () => {
    const res = await request(app)
      .post("/api/v1/videos/upload/complete")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        projectId: currentProjectId,
        assetId: currentAssetId,
        durationSeconds: 124.8,
        width: 1920,
        height: 1080,
        fps: 30.0,
        videoCodec: "h264",
        audioCodec: "aac",
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.project.status, "UPLOADED");
    assert.equal(res.body.data.asset.status, "UPLOADED");
    assert.equal(res.body.data.asset.durationSeconds, 124.8);
    assert.equal(res.body.data.asset.width, 1920);
    assert.equal(res.body.data.asset.height, 1080);
    assert.equal(res.body.data.asset.fps, 30.0);
    assert.equal(res.body.data.asset.videoCodec, "h264");
    assert.equal(res.body.data.asset.audioCodec, "aac");
  });

  it("10. Should return accurate upload status", async () => {
    const res = await request(app)
      .get(`/api/v1/videos/${currentProjectId}/assets/${currentAssetId}/status`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.project.status, "UPLOADED");
    assert.equal(res.body.data.asset.status, "UPLOADED");
  });
});
