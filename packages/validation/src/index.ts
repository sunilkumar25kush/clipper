import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must not exceed 72 characters")
  .regex(/[A-Z]/, "Must contain at least 1 uppercase letter")
  .regex(/[a-z]/, "Must contain at least 1 lowercase letter")
  .regex(/[0-9!@#$%^&*]/, "Must contain at least 1 number or special character");

export const registerSchema = z.object({
  email: z.string().email("Invalid email address").max(255).transform((v) => v.toLowerCase().trim()),
  password: passwordSchema,
  fullName: z.string().min(2, "Name must be at least 2 characters").max(120, "Name must not exceed 120 characters").trim(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address").transform((v) => v.toLowerCase().trim()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export const resendVerificationSchema = z.object({
  email: z.string().email("Invalid email address").transform((v) => v.toLowerCase().trim()),
});

export const createProjectSchema = z.object({
  title: z.string().min(1).max(255),
  sourceType: z.enum(["FILE_UPLOAD", "AUTHORIZED_URL"]),
  rightsAttested: z.literal(true, {
    errorMap: () => ({ message: "You must attest rights to the video content" }),
  }),
  targetAspect: z.enum(["RATIO_9_16", "RATIO_16_9", "RATIO_1_1"]).default("RATIO_9_16"),
  minClipDuration: z.number().int().min(10).max(120).default(15),
  maxClipDuration: z.number().int().min(15).max(180).default(60),
  maxClipsToGen: z.number().int().min(1).max(50).default(10),
});

export const initiateUploadSchema = z.object({
  filename: z.string().min(1, "Filename is required").max(255),
  fileSizeBytes: z
    .number()
    .int("File size must be an integer")
    .positive("File size must be greater than 0")
    .max(10 * 1024 * 1024 * 1024, "File size exceeds the 10 GB platform limit"),
  mimeType: z.enum(
    [
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "video/x-matroska",
    ],
    {
      errorMap: () => ({
        message: "Unsupported video format. Allowed formats: MP4, MOV, WebM",
      }),
    },
  ),
  title: z.string().min(1).max(255).optional(),
  targetAspect: z.enum(["RATIO_9_16", "RATIO_16_9", "RATIO_1_1"]).default("RATIO_9_16"),
  minClipDuration: z.number().int().min(10).max(120).default(15),
  maxClipDuration: z.number().int().min(15).max(180).default(60),
  maxClipsToGen: z.number().int().min(1).max(50).default(10),
  rightsAttested: z.literal(true, {
    errorMap: () => ({ message: "You must attest rights to the video content" }),
  }),
});

export const completeUploadSchema = z.object({
  projectId: z.string().uuid("Invalid projectId UUID"),
  assetId: z.string().uuid("Invalid assetId UUID"),
  durationSeconds: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  videoCodec: z.string().max(50).optional(),
  audioCodec: z.string().max(50).optional(),
});

export const createProcessingJobSchema = z.object({
  projectId: z.string().uuid("Invalid projectId UUID"),
  targetAspect: z.enum(["RATIO_9_16", "RATIO_16_9", "RATIO_1_1"]).optional(),
  minClipDuration: z.number().int().min(10).max(120).optional(),
  maxClipDuration: z.number().int().min(15).max(180).optional(),
  maxClipsToGen: z.number().int().min(1).max(50).optional(),
});

export const cancelProcessingJobSchema = z.object({
  reason: z.string().max(255).optional(),
});

export const clipCategorySchema = z.enum([
  "funny",
  "educational",
  "important",
  "interesting",
  "motivational",
  "storytelling",
  "emotional",
  "strong_opinions",
  "potentially_viral",
]);

export const aiClipScoresSchema = z.object({
  hook: z.number().int().min(0).max(100),
  engagement: z.number().int().min(0).max(100),
  context: z.number().int().min(0).max(100),
  overall: z.number().int().min(0).max(100),
});

export const aiClipCandidateSchema = z
  .object({
    start: z.number().nonnegative(),
    end: z.number().positive(),
    title: z.string().min(3).max(150),
    category: clipCategorySchema,
    reason: z.string().min(10).max(600),
    scores: aiClipScoresSchema,
  })
  .refine((c) => c.end > c.start, {
    message: "end timestamp must be strictly greater than start timestamp",
  });

export const detectClipsRequestSchema = z.object({
  projectId: z.string().uuid().optional(),
  transcriptId: z.string().optional(),
  videoDuration: z.number().positive(),
  minDuration: z.number().int().min(10).max(120).default(15),
  maxDuration: z.number().int().min(15).max(180).default(60),
  maxClips: z.number().int().min(1).max(50).default(10),
  targetCategories: z.array(clipCategorySchema).optional(),
});

export const updateClipSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  category: z.enum([
    "HOOK",
    "FUNNY",
    "EDUCATIONAL",
    "EMOTIONAL",
    "STORYTELLING",
    "MOTIVATIONAL",
    "DISCUSSION",
    "INSIGHT",
  ]).optional(),
  startTime: z.number().nonnegative().optional(),
  endTime: z.number().positive().optional(),
  presetId: z.string().max(50).optional(),
  fontSize: z.number().int().min(12).max(140).optional(),
  position: z.enum(["TOP", "CENTER", "BOTTOM", "BOTTOM_SAFE"]).optional(),
  primaryColorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  highlightColorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type InitiateUploadInput = z.infer<typeof initiateUploadSchema>;
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;
export type CreateProcessingJobInput = z.infer<typeof createProcessingJobSchema>;
export type CancelProcessingJobInput = z.infer<typeof cancelProcessingJobSchema>;
export type UpdateClipInput = z.infer<typeof updateClipSchema>;
export type ClipCategory = z.infer<typeof clipCategorySchema>;
export type AiClipScores = z.infer<typeof aiClipScoresSchema>;
export type AiClipCandidate = z.infer<typeof aiClipCandidateSchema>;
export type DetectClipsRequest = z.infer<typeof detectClipsRequestSchema>;
