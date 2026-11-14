import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma, UserRole, PlanTier, SubStatus, PaymentProvider } from "@clipforge/database";
import { projectService } from "../src/services/project.service.js";
import { queueService } from "../src/services/queue.service.js";

describe("ClipForge AI Project Modes & Custom Instructions Tests", () => {
  let testUserId: string;

  before(async () => {
    // Create test user
    const user = await prisma.user.create({
      data: {
        email: `mode-test-${Date.now()}@clipforge.local`,
        fullName: "Mode Test User",
        passwordHash: "hash_placeholder",
        role: UserRole.USER,
        subscription: {
          create: {
            planTier: PlanTier.FREE,
            status: SubStatus.ACTIVE,
            provider: PaymentProvider.STRIPE,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
        usageCredit: {
          create: {
            totalAllocated: 60,
            usedCredits: 0,
            heldCredits: 0,
            bonusCredits: 0,
            resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
    });
    testUserId = user.id;
  });

  after(async () => {
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } });
    }
  });

  test("1. Successfully creates project in PARTS mode with custom instructions", async () => {
    const project = await projectService.createProject(testUserId, {
      title: "Podcasting Masterclass - Full Episode",
      sourceType: "FILE_UPLOAD",
      targetAspect: "RATIO_9_16",
      minClipDuration: 45,
      maxClipDuration: 180,
      maxClipsToGen: 10,
      generationMode: "PARTS",
      customInstructions: "Break down into complete cohesive parts covering all topic shifts",
      rightsAttested: true,
    });

    assert.equal(project.title, "Podcasting Masterclass - Full Episode");
    assert.equal(project.generationMode, "PARTS");
    assert.equal(project.customInstructions, "Break down into complete cohesive parts covering all topic shifts");

    // Fetch from DB to confirm persistence
    const saved = await prisma.videoProject.findUnique({
      where: { id: project.id },
    });
    assert.ok(saved);
    assert.equal(saved.generationMode, "PARTS");
    assert.equal(saved.customInstructions, "Break down into complete cohesive parts covering all topic shifts");
  });

  test("2. Successfully creates project in HIGHLIGHTS mode with category instructions", async () => {
    const project = await projectService.createProject(testUserId, {
      title: "Tech Comedy Hour",
      sourceType: "FILE_UPLOAD",
      targetAspect: "RATIO_9_16",
      minClipDuration: 15,
      maxClipDuration: 60,
      maxClipsToGen: 10,
      generationMode: "HIGHLIGHTS",
      customInstructions: "Find funny moments, jokes, and witty banter",
      rightsAttested: true,
    });

    assert.equal(project.generationMode, "HIGHLIGHTS");
    assert.equal(project.customInstructions, "Find funny moments, jokes, and witty banter");
  });

  test("3. Successfully creates processing job preserving project generation mode and instructions", async () => {
    const project = await projectService.createProject(testUserId, {
      title: "Lecture on AI",
      sourceType: "FILE_UPLOAD",
      targetAspect: "RATIO_9_16",
      minClipDuration: 30,
      maxClipDuration: 90,
      maxClipsToGen: 10,
      generationMode: "PARTS",
      customInstructions: "Divide chronologically",
      rightsAttested: true,
    });

    const job = await queueService.enqueueProjectAnalysis({
      jobId: `job_${Date.now()}`,
      projectId: project.id,
      userId: testUserId,
      userTier: PlanTier.FREE,
      targetAspect: "RATIO_9_16",
      minClipDuration: 30,
      maxClipDuration: 90,
      maxClipsToGen: 10,
      generationMode: "PARTS",
      customInstructions: "Divide chronologically",
    });

    assert.ok(job.id);
    assert.equal(job.data.projectId, project.id);
    assert.equal(job.data.generationMode, "PARTS");
    assert.equal(job.data.customInstructions, "Divide chronologically");
  });
});
