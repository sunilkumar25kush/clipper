export enum PlanTier {
  FREE = "FREE",
  STARTER = "STARTER",
  PRO = "PRO",
  BUSINESS = "BUSINESS",
}

export enum GenerationMode {
  HIGHLIGHTS = "HIGHLIGHTS",
  PARTS = "PARTS",
}

export enum ProjectStatus {
  DRAFT = "DRAFT",
  UPLOADED = "UPLOADED",
  QUEUED = "QUEUED",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
}

export enum ProcessingState {
  PENDING = "pending",
  VALIDATING = "validating",
  EXTRACTING = "extracting",
  TRANSCRIBING = "transcribing",
  ANALYZING = "analyzing",
  SELECTING_CLIPS = "selecting_clips",
  RENDERING = "rendering",
  UPLOADING = "uploading",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum ExportResolution {
  RES_720P = "RES_720P",
  RES_1080P = "RES_1080P",
}

export interface ProcessingJobDTO {
  id: string;
  projectId: string;
  clipId?: string | null;
  jobType: "FULL_PROJECT_ANALYSIS" | "SINGLE_CLIP_RENDER";
  bullMqJobId: string;
  status: ProcessingState;
  stage: ProcessingState;
  progressPercent: number;
  attemptsMade: number;
  creditsHeld: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProcessingJobRequest {
  projectId: string;
  generationMode?: GenerationMode;
  customInstructions?: string | null;
  targetAspect?: AspectRatio;
  minClipDuration?: number;
  maxClipDuration?: number;
  maxClipsToGen?: number;
}

export interface JobProgressEvent {
  jobId: string;
  projectId: string;
  status: ProcessingState;
  stage: ProcessingState;
  progressPercent: number;
  message?: string;
  updatedAt: string;
}

export enum JobStatus {
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  CANCELLING = "CANCELLING",
  CANCELLED = "CANCELLED",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export enum JobStage {
  QUEUED = "QUEUED",
  VALIDATING_SOURCE = "VALIDATING_SOURCE",
  EXTRACTING_AUDIO = "EXTRACTING_AUDIO",
  TRANSCRIBING = "TRANSCRIBING",
  ANALYZING_SEMANTICS = "ANALYZING_SEMANTICS",
  RENDERING_CLIPS = "RENDERING_CLIPS",
  COMPLETED = "COMPLETED",
}

export enum ClipCategory {
  HOOK = "HOOK",
  FUNNY = "FUNNY",
  EDUCATIONAL = "EDUCATIONAL",
  EMOTIONAL = "EMOTIONAL",
  STORYTELLING = "STORYTELLING",
  MOTIVATIONAL = "MOTIVATIONAL",
  DISCUSSION = "DISCUSSION",
  INSIGHT = "INSIGHT",
  PART = "PART",
}

export enum AspectRatio {
  RATIO_9_16 = "RATIO_9_16",
  RATIO_16_9 = "RATIO_16_9",
  RATIO_1_1 = "RATIO_1_1",
}

export enum CropMode {
  FACE_TRACK = "FACE_TRACK",
  CENTER_CROP = "CENTER_CROP",
  BLUR_PAD = "BLUR_PAD",
}

export interface UserDTO {
  id: string;
  email: string;
  fullName: string;
  role: "USER" | "ADMIN";
  emailVerifiedAt: string | null;
}

export interface AuthResponse {
  user: UserDTO;
  accessToken: string;
}

export interface UserProfileResponse {
  user: UserDTO;
  subscription: {
    planTier: PlanTier;
    status: string;
    currentPeriodEnd: string;
  } | null;
  credits: {
    totalAllocated: number;
    usedCredits: number;
    heldCredits: number;
    bonusCredits: number;
    availableCredits: number;
  } | null;
}

export interface VideoProjectDTO {
  id: string;
  userId: string;
  title: string;
  sourceType: "FILE_UPLOAD" | "AUTHORIZED_URL";
  sourceUrl?: string | null;
  status: ProjectStatus;
  generationMode?: GenerationMode;
  customInstructions?: string | null;
  targetAspect: AspectRatio;
  minClipDuration: number;
  maxClipDuration: number;
  maxClipsToGen: number;
  clipCount?: number;
  activeJobProgress?: number | null;
  activeJobStage?: JobStage | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClipDTO {
  id: string;
  projectId: string;
  projectTitle?: string;
  rankOrder: number;
  partNumber?: number | null;
  title: string;
  description: string;
  category: ClipCategory;
  selectionReason: string;
  startTime: number;
  endTime: number;
  duration: number;
  aspectRatio: AspectRatio;
  cropMode: CropMode;
  thumbnailKey?: string | null;
  overallScore?: number;
  hookScore?: number;
  engagementScore?: number;
  createdAt: string;
}

export interface ClipScoreDTO {
  id: string;
  clipId: string;
  hookScore: number;
  engagementScore: number;
  contextScore: number;
  overallScore: number;
  confidence: number;
  scoringBreakdownJson?: Record<string, unknown> | null;
}

export interface ClipCaptionDTO {
  id: string;
  clipId: string;
  presetId: string;
  fontFamily: string;
  fontSize: number;
  primaryColorHex: string;
  highlightColorHex: string;
  strokeColorHex: string;
  strokeWidth: number;
  position: "TOP" | "CENTER" | "BOTTOM" | "BOTTOM_SAFE";
  wordsPerLine: number;
  captionsJson: unknown;
}

export interface ExportDTO {
  id: string;
  clipId: string;
  storageBucket: string;
  storageKey: string;
  resolution: string;
  aspectRatio: AspectRatio;
  hasWatermark: boolean;
  fileSizeBytes?: number | null;
  status: string;
  downloadUrl?: string;
  createdAt: string;
}

export interface ClipDetailDTO extends ClipDTO {
  contextScore?: number;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  downloadUrl?: string | null;
  score?: ClipScoreDTO | null;
  caption?: ClipCaptionDTO | null;
  exports: ExportDTO[];
}

export interface ProjectDetailDTO extends VideoProjectDTO {
  assets: VideoAssetDTO[];
  jobs: Array<{
    id: string;
    jobType: string;
    status: JobStatus;
    stage: JobStage;
    progressPercent: number;
    errorMessage?: string | null;
    createdAt: string;
    completedAt?: string | null;
  }>;
  clips: ClipDetailDTO[];
}

export interface DashboardMetricsDTO {
  totalProjects: number;
  generatedClips: number;
  processingVideos: number;
  availableCredits: number;
  totalAllocatedCredits: number;
  planTier: PlanTier;
  recentProjects: VideoProjectDTO[];
  recentClips: ClipDTO[];
}

export enum AssetKind {
  SOURCE_VIDEO = "SOURCE_VIDEO",
  EXTRACTED_AUDIO = "EXTRACTED_AUDIO",
}

export enum AssetStatus {
  UPLOADING = "UPLOADING",
  UPLOADED = "UPLOADED",
  READY = "READY",
  DELETED = "DELETED",
}

export interface VideoAssetDTO {
  id: string;
  projectId: string;
  assetKind: AssetKind;
  storageBucket: string;
  storageKey: string;
  uploadId?: string | null;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  status: AssetStatus;
  createdAt: string;
}

export interface InitiateUploadRequest {
  filename: string;
  fileSizeBytes: number;
  mimeType: string;
  title?: string;
  targetAspect?: AspectRatio;
  minClipDuration?: number;
  maxClipDuration?: number;
  maxClipsToGen?: number;
  rightsAttested: boolean;
}

export interface InitiateUploadResponse {
  projectId: string;
  assetId: string;
  storageKey: string;
  uploadUrl: string;
  isDirectEndpoint?: boolean;
  expiresInSeconds: number;
  headers?: Record<string, string>;
}

export interface CompleteUploadRequest {
  projectId: string;
  assetId: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
}

export interface CompleteUploadResponse {
  project: VideoProjectDTO;
  asset: VideoAssetDTO;
}

export interface VideoStreamInfo {
  index: number;
  codecName: string;
  width: number;
  height: number;
  fps: number;
  bitrateKbps?: number;
  durationSeconds?: number;
  pixFmt?: string;
  rotation?: number;
}

export interface AudioStreamInfo {
  index: number;
  codecName: string;
  sampleRate: number;
  channels: number;
  bitrateKbps?: number;
  durationSeconds?: number;
}

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
  hasAudio: boolean;
  fileSizeBytes: number;
  bitrateKbps: number;
  aspectRatio: AspectRatio | "CUSTOM";
  rotation: number;
  videoStreams: VideoStreamInfo[];
  audioStreams: AudioStreamInfo[];
}

export interface AudioExtractionOptions {
  sampleRate?: number;
  channels?: number;
  codec?: "pcm_s16le" | "aac" | "mp3";
  bitrateKbps?: number;
}

export interface SegmentExtractionOptions {
  startTimeSeconds: number;
  endTimeSeconds: number;
  accurate?: boolean;
  videoCodec?: string;
  audioCodec?: string;
  crf?: number;
  preset?: string;
}

export interface AspectRatioCropOptions {
  targetAspect: AspectRatio;
  mode: CropMode;
  targetWidth?: number;
  targetHeight?: number;
  crf?: number;
  preset?: string;
  focusXNormalized?: number; // 0.0 to 1.0 speaker face focal center (fallback to 0.5)
}

export interface ThumbnailGenerationOptions {
  timestampSeconds?: number;
  timestampPercent?: number;
  width?: number;
  height?: number;
  format?: "jpg" | "webp" | "png";
  quality?: number;
}

export interface SubtitleBurnOptions {
  subtitlePath: string;
  fontSize?: number;
  primaryColor?: string;
  highlightColor?: string;
  fontFamily?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Array<{ field?: string; issue: string }>;
    requestId?: string;
  };
  meta?: Record<string, unknown>;
}
