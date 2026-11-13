"use client";

import * as React from "react";
import Image from "next/image";
import {
  UploadSimple,
  FileVideo,
  CheckCircle,
  WarningCircle,
  X,
  ArrowCounterClockwise,
  StopCircle,
  CircleNotch,
} from "phosphor-react";
import { fetchApi, getMemoryAccessToken, ApiError } from "@/lib/api-client";
import {
  VideoProjectDTO,
  InitiateUploadResponse,
  CompleteUploadResponse,
  AspectRatio,
} from "@clipforge/shared-types";

const MAX_FREE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB
const ALLOWED_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  aspectRatio: string;
  thumbnailDataUrl: string | null;
}

interface VideoUploaderProps {
  targetAspect: AspectRatio;
  minClipDuration: number;
  maxClipDuration: number;
  rightsAttested: boolean;
  onUploadSuccess: (project: VideoProjectDTO) => void;
  onCancel?: () => void;
}

type UploadState = "idle" | "inspecting" | "ready" | "uploading" | "completing" | "success" | "error";

export function VideoUploader({
  targetAspect,
  minClipDuration,
  maxClipDuration,
  rightsAttested,
  onUploadSuccess,
  onCancel,
}: VideoUploaderProps) {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [metadata, setMetadata] = React.useState<VideoMetadata | null>(null);
  const [uploadState, setUploadState] = React.useState<UploadState>("idle");
  const [progressPercent, setProgressPercent] = React.useState(0);
  const [uploadSpeedMbps, setUploadSpeedMbps] = React.useState<number | null>(null);
  const [bytesUploaded, setBytesUploaded] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const activeXhrRef = React.useRef<XMLHttpRequest | null>(null);
  const uploadStartTimeRef = React.useRef<number>(0);
  const previewVideoRef = React.useRef<HTMLVideoElement | null>(null);

  // Clean up object URLs on unmount
  React.useEffect(() => {
    return () => {
      if (activeXhrRef.current) {
        activeXhrRef.current.abort();
      }
    };
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Inspect video locally using HTML5 Video and Canvas
  const inspectFile = async (file: File): Promise<VideoMetadata> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      const objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;

      video.onloadedmetadata = () => {
        const duration = video.duration;
        // Seek to 1 second (or 10% for very short videos) to grab thumbnail
        video.currentTime = Math.min(1.0, duration * 0.1);
      };

      video.onseeked = () => {
        let thumbnailDataUrl: string | null = null;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.min(video.videoWidth, 640);
          canvas.height = Math.round((canvas.width * video.videoHeight) / video.videoWidth);
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            thumbnailDataUrl = canvas.toDataURL("image/jpeg", 0.75);
          }
        } catch {
          // Canvas capture might fail if codec is unsupported; resolve metadata anyway
        }

        URL.revokeObjectURL(objectUrl);
        resolve({
          durationSeconds: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          aspectRatio: ratioStr(video.videoWidth, video.videoHeight),
          thumbnailDataUrl,
        });
      };

      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Unable to parse video stream. Please ensure the file is an uncorrupted MP4, MOV, or WebM."));
      };
    });
  };

  const ratioStr = (w: number, h: number): string => {
    if (!w || !h) return "Unknown";
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(w, h);
    return `${w / divisor}:${h / divisor}`;
  };

  const handleFileSelection = async (file: File) => {
    setErrorMessage(null);

    // 1. MIME type validation
    if (!ALLOWED_MIME_TYPES.includes(file.type) && !file.name.match(/\.(mp4|mov|webm)$/i)) {
      setErrorMessage("Unsupported format. Please select an MP4, MOV, or WebM video file.");
      return;
    }

    // 2. Size validation (Free Tier baseline)
    if (file.size > MAX_FREE_SIZE_BYTES) {
      setErrorMessage(
        `File size (${formatFileSize(file.size)}) exceeds the Free plan limit of 500 MB. Please choose a smaller recording or upgrade your plan.`,
      );
      return;
    }

    setSelectedFile(file);
    setUploadState("inspecting");

    try {
      const meta = await inspectFile(file);
      setMetadata(meta);
      setUploadState("ready");
    } catch {
      // Fallback if client-side video decoding is not supported in this browser
      setMetadata({
        durationSeconds: 0,
        width: 0,
        height: 0,
        aspectRatio: "Auto",
        thumbnailDataUrl: null,
      });
      setUploadState("ready");
    }
  };

  const startUpload = async () => {
    if (!selectedFile) return;

    if (!rightsAttested) {
      setErrorMessage("You must confirm that you have permission or rights to process this video.");
      return;
    }

    setErrorMessage(null);
    setUploadState("uploading");
    setProgressPercent(0);
    setBytesUploaded(0);
    uploadStartTimeRef.current = Date.now();

    try {
      // 1. Call Backend to Initiate Upload
      const initiateRes = await fetchApi<InitiateUploadResponse>("/api/v1/videos/upload/initiate", {
        method: "POST",
        body: JSON.stringify({
          filename: selectedFile.name,
          fileSizeBytes: selectedFile.size,
          mimeType: selectedFile.type || "video/mp4",
          targetAspect,
          minClipDuration,
          maxClipDuration,
          rightsAttested: true,
        }),
      });

      const { uploadUrl, assetId, projectId, isDirectEndpoint } = initiateRes;

      // 2. Upload file binary via XMLHttpRequest to report progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        activeXhrRef.current = xhr;

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
            setProgressPercent(percent);
            setBytesUploaded(event.loaded);

            const elapsedSeconds = (Date.now() - uploadStartTimeRef.current) / 1000;
            if (elapsedSeconds > 0.5) {
              const mbps = (event.loaded * 8) / (elapsedSeconds * 1000 * 1000);
              setUploadSpeedMbps(Math.round(mbps * 10) / 10);
            }
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setProgressPercent(100);
            resolve();
          } else {
            reject(new Error(`Storage server returned error status ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error("Network connection lost during file upload. Please retry."));
        };

        xhr.onabort = () => {
          reject(new Error("Upload cancelled by user."));
        };

        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", selectedFile.type || "video/mp4");

        // If direct local endpoint, attach authorization bearer token
        if (isDirectEndpoint) {
          const token = getMemoryAccessToken();
          if (token) {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          }
        }

        xhr.send(selectedFile);
      });

      // 3. Complete Upload & Register Technical Metadata
      setUploadState("completing");
      const completeRes = await fetchApi<CompleteUploadResponse>("/api/v1/videos/upload/complete", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          assetId,
          durationSeconds: metadata?.durationSeconds || undefined,
          width: metadata?.width || undefined,
          height: metadata?.height || undefined,
        }),
      });

      setUploadState("success");
      onUploadSuccess(completeRes.project);
    } catch (err) {
      if (err instanceof Error && err.message.includes("cancelled")) {
        setUploadState("ready");
        setProgressPercent(0);
        setUploadSpeedMbps(null);
      } else {
        setUploadState("error");
        if (err instanceof ApiError) {
          setErrorMessage(err.message);
        } else if (err instanceof Error) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage("Failed to upload video. Please check your connection and retry.");
        }
      }
    } finally {
      activeXhrRef.current = null;
    }
  };

  const handleCancelUpload = () => {
    if (activeXhrRef.current) {
      activeXhrRef.current.abort();
    }
    setUploadState("ready");
    setProgressPercent(0);
  };

  const handleResetFile = () => {
    if (activeXhrRef.current) {
      activeXhrRef.current.abort();
    }
    setSelectedFile(null);
    setMetadata(null);
    setUploadState("idle");
    setProgressPercent(0);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files[0]) {
            handleFileSelection(files[0]);
          }
        }}
      />

      {/* Hidden Video for offscreen inspection */}
      <video ref={previewVideoRef} className="hidden" aria-hidden="true" />

      {/* Dropzone Container (when no file is selected yet) */}
      {!selectedFile && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload video file dropzone. Click or drag file here"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileSelection(e.dataTransfer.files[0]);
            }
          }}
          className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-100 ${
            isDragOver
              ? "border-zinc-900 bg-zinc-100/80 dark:border-zinc-200 dark:bg-zinc-800/60 scale-[0.99]"
              : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#1C1C1C] hover:border-zinc-300 dark:hover:border-zinc-700"
          }`}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 mb-3.5">
            <UploadSimple size={24} weight="bold" />
          </div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Drag &amp; drop your recording here, or{" "}
            <span className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2">browse</span>
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Supported formats: MP4, MOV, WebM &bull; Up to 500 MB on Free plan
          </p>
        </div>
      )}

      {/* Selected File Card & Video Inspection Preview */}
      {selectedFile && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#1E1E1E] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {metadata?.thumbnailDataUrl ? (
                <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 bg-black">
                  <Image
                    src={metadata.thumbnailDataUrl}
                    alt="Video thumbnail frame"
                    fill
                    sizes="80px"
                    className="object-cover"
                    unoptimized
                  />
                  {metadata.durationSeconds > 0 && (
                    <span className="absolute bottom-1 right-1 rounded-sm bg-black/80 px-1 py-0.2 text-[10px] font-mono font-medium text-white">
                      {formatDuration(metadata.durationSeconds)}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  <FileVideo size={28} />
                </div>
              )}

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {selectedFile.name}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{formatFileSize(selectedFile.size)}</span>
                  {metadata && metadata.width > 0 && (
                    <>
                      <span>&bull;</span>
                      <span>{metadata.width}x{metadata.height}</span>
                      <span>&bull;</span>
                      <span className="rounded-md bg-zinc-200/60 dark:bg-zinc-800 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                        {metadata.aspectRatio}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {uploadState !== "uploading" && uploadState !== "completing" && (
              <button
                type="button"
                onClick={handleResetFile}
                aria-label="Remove selected file"
                className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Progress / Status Bar during active upload */}
          {(uploadState === "uploading" || uploadState === "completing") && (
            <div className="mt-4 space-y-2 border-t border-zinc-200/60 dark:border-zinc-800/80 pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <CircleNotch size={14} className="animate-spin text-indigo-500" />
                  {uploadState === "completing" ? "Finalizing storage asset..." : "Uploading video directly to storage..."}
                </span>
                <span className="font-mono text-zinc-950 dark:text-zinc-100 font-semibold">
                  {progressPercent}%
                </span>
              </div>

              {/* Accessible HTML5 Progress Bar */}
              <div
                role="progressbar"
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
              >
                <div
                  className="h-full bg-indigo-600 transition-all duration-150 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span>
                  {formatFileSize(bytesUploaded)} of {formatFileSize(selectedFile.size)}
                  {uploadSpeedMbps !== null && ` &bull; ${uploadSpeedMbps} Mbps`}
                </span>
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="text-red-500 hover:text-red-600 font-medium flex items-center gap-1"
                >
                  <StopCircle size={13} />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          )}

          {/* Success State */}
          {uploadState === "success" && (
            <div className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle size={16} weight="fill" />
              <span>Video successfully uploaded and registered!</span>
            </div>
          )}
        </div>
      )}

      {/* Error Alert Box */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-600 dark:text-red-400"
        >
          <WarningCircle size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {selectedFile && uploadState !== "uploading" && uploadState !== "completing" && uploadState !== "success" && (
        <div className="flex items-center justify-end gap-3 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors"
            >
              Cancel
            </button>
          )}

          {uploadState === "error" ? (
            <button
              type="button"
              onClick={startUpload}
              className="flex items-center gap-1.5 rounded-xl bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-50 dark:text-zinc-950 hover:opacity-90 transition-opacity"
            >
              <ArrowCounterClockwise size={14} />
              <span>Retry upload</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={startUpload}
              className="flex items-center gap-1.5 rounded-xl bg-zinc-950 dark:bg-zinc-100 px-5 py-2.5 text-xs font-semibold text-zinc-50 dark:text-zinc-950 shadow-xs hover:opacity-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-100"
            >
              <UploadSimple size={14} weight="bold" />
              <span>Upload video</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
