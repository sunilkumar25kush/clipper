import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "@clipforge/database";
import { JobStateMachine } from "../src/services/job-state-machine.js";
import { ProcessingState } from "@clipforge/shared-types";
import { jobService } from "../src/services/job.service.js";

describe("ClipForge AI Background Job Processing & BullMQ Tests", () => {
  const testEmail = `job_tester_${Date.now()}@example.com`;
  const otherEmail = `job_other_${Date.now()}@example.com`;
  const testPassword = "JobTestPassword#2026";

  let accessToken: string;
  let otherAccessToken: string;
  let userId: string;
  let otherUserId: string;

  let testProjectId: string;
  let createdJobId: string;

  before(async () => {
    // 1. Register main tester
    const regRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: testEmail,
        password: testPassword,
        fullName: "Job Pipeline Tester",
      });
    assert.equal(regRes.status, 201);
    accessToken = regRes.body.data.accessToken;
    userId = regRes.body.data.user.id;

    // 2. Register secondary user for tenant isolation
    const otherRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: otherEmail,
        password: testPassword,
        fullName: "Secondary Job User",
      });
    assert.equal(otherRes.status, 201);
    otherAccessToken = otherRes.body.data.accessToken;
    otherUserId = otherRes.body.data.user.id;

    // 3. Create a project and uploaded asset
    const uploadRes = await request(app)
      .post("/api/v1/videos/upload/initiate")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        filename: "podcast_video.mp4",
        fileSizeBytes: 1024 * 1024 * 25,
        mimeType: "video/mp4",
        rightsAttested: true,
      });
    assert.equal(uploadRes.status, 201);
    testProjectId = uploadRes.body.data.projectId;
  });

  after(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });
  });

  it("1. Should validate job state machine transition rules", () => {
    // Valid linear transition
    assert.equal(
      JobStateMachine.canTransition(ProcessingState.PENDING, ProcessingState.VALIDATING),
      true,
    );
    assert.equal(
      JobStateMachine.canTransition(ProcessingState.VALIDATING, ProcessingState.EXTRACTING),
      true,
    );
    assert.equal(
      JobStateMachine.canTransition(ProcessingState.EXTRACTING, ProcessingState.TRANSCRIBING),
      true,
    );
    assert.equal(
      JobStateMachine.canTransition(ProcessingState.TRANSCRIBING, ProcessingState.ANALYZING),
      true,
    );
    assert.equal(
      JobStateMachine.canTransition(ProcessingState.ANALYZING, ProcessingState.SELECTING_CLIPS),
      true,
    );
    assert.equal(
      JobStateMachine.canTransition(ProcessingState.SELECTING_CLIPS, ProcessingState.RENDERING),
      true,
    );
    assert.equal(
      JobStateMachine.canTransition(ProcessingState.RENDERING, ProcessingState.UPLOADING),
      true,
    );
    assert.equal(
      JobStateMachine.canTransition(ProcessingState.UPLOADING, ProcessingState.COMPLETED),
      true,
    );

    // Any non-terminal state can fail or cancel
    assert.equal(
      JobStateMachine.canTransition(ProcessingState.VALIDATING, ProcessingState.FAILED),
      true,
    );
    assert.equal(
      JobStateMachine.canTransition(ProcessingState.TRANSCRIBING, ProcessingState.CANCELLED),
      true,
    );

    // Invalid transition jumps should be rejected
    assert.equal(
      JobStateMachine.canTransition(ProcessingState.PENDING, ProcessingState.COMPLETED),
      false,
    );
    assert.equal(
      JobStateMachine.canTransition(ProcessingState.COMPLETED, ProcessingState.VALIDATING),
      false,
    );
  });

  it("2. Should reject job creation for unauthenticated request", async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${testProjectId}/process`)
      .send({});

    assert.equal(res.status, 401);
  });

  it("3. Should reject job creation by unauthorized user (IDOR prevention)", async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${testProjectId}/process`)
      .set("Authorization", `Bearer ${otherAccessToken}`)
      .send({});

    assert.equal(res.status, 404);
  });

  it("4. Should successfully create and enqueue background job and hold credits", async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${testProjectId}/process`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    assert.equal(res.status, 202);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.id);
    assert.equal(res.body.data.projectId, testProjectId);
    assert.equal(res.body.data.status, "pending");
    assert.equal(res.body.data.progressPercent, 0);
    assert.ok(res.body.data.creditsHeld > 0);

    createdJobId = res.body.data.id;

    // Verify credits were held in wallet
    const wallet = await prisma.usageCredit.findUnique({
      where: { userId },
    });
    assert.ok(wallet!.heldCredits > 0);
  });

  it("5. Should prevent duplicate in-flight jobs for the same project (idempotency)", async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${testProjectId}/process`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    assert.equal(res.status, 202);
    // Returns existing active job ID rather than creating a duplicate
    assert.equal(res.body.data.id, createdJobId);
  });

  it("6. Should retrieve job details and progress for authorized user", async () => {
    const res = await request(app)
      .get(`/api/v1/jobs/${createdJobId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, createdJobId);
    assert.equal(res.body.data.projectId, testProjectId);
  });

  it("7. Should reject job details query by unauthorized user", async () => {
    const res = await request(app)
      .get(`/api/v1/jobs/${createdJobId}`)
      .set("Authorization", `Bearer ${otherAccessToken}`);

    assert.equal(res.status, 404);
  });

  it("8. Should transition stages, track progress and commit credits on completion", async () => {
    // Transition validating -> extracting -> completed
    await jobService.transitionJobStage(createdJobId, ProcessingState.VALIDATING, 10);
    await jobService.transitionJobStage(createdJobId, ProcessingState.EXTRACTING, 20);
    await jobService.transitionJobStage(createdJobId, ProcessingState.TRANSCRIBING, 40);
    await jobService.transitionJobStage(createdJobId, ProcessingState.ANALYZING, 60);
    await jobService.transitionJobStage(createdJobId, ProcessingState.SELECTING_CLIPS, 75);
    await jobService.transitionJobStage(createdJobId, ProcessingState.RENDERING, 90);
    await jobService.transitionJobStage(createdJobId, ProcessingState.UPLOADING, 98);
    const completedJob = await jobService.transitionJobStage(
      createdJobId,
      ProcessingState.COMPLETED,
      100,
    );

    assert.equal(completedJob.status, "completed");
    assert.equal(completedJob.progressPercent, 100);

    // Verify credits transitioned from held to used
    const wallet = await prisma.usageCredit.findUnique({
      where: { userId },
    });
    assert.equal(wallet!.heldCredits, 0);
    assert.ok(wallet!.usedCredits > 0);
  });

  it("9. Should allow job cancellation for in-flight job and refund held credits", async () => {
    // Create a new project for cancellation test
    const uploadRes = await request(app)
      .post("/api/v1/videos/upload/initiate")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        filename: "cancel_test.mp4",
        fileSizeBytes: 1024 * 1024 * 10,
        mimeType: "video/mp4",
        rightsAttested: true,
      });
    const cancelProjectId = uploadRes.body.data.projectId;

    const jobRes = await request(app)
      .post(`/api/v1/projects/${cancelProjectId}/process`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    const jobToCancelId = jobRes.body.data.id;

    // Cancel job
    const cancelRes = await request(app)
      .post(`/api/v1/jobs/${jobToCancelId}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "User changed mind" });

    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.data.status, "cancelled");

    // Verify held credits were refunded
    const wallet = await prisma.usageCredit.findUnique({
      where: { userId },
    });
    assert.equal(wallet!.heldCredits, 0);
  });

  it("10. Should reject cancellation of already completed job", async () => {
    const res = await request(app)
      .post(`/api/v1/jobs/${createdJobId}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /already in terminal state/);
  });
});

