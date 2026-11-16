"use client";

import * as React from "react";
import {
  Play,
  Pause,
  SpeakerHigh,
  SpeakerSimpleSlash,
  CornersOut,
  CornersIn,
  DeviceMobile,
  FilmSlate,
  ClosedCaptioning,
} from "phosphor-react";
import { AspectRatio } from "@clipforge/shared-types";

export interface VideoPreviewPlayerProps {
  videoUrl?: string | null;
  aspectRatio: AspectRatio;
  currentTime: number;
  duration: number;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onSeek: (time: number) => void;
  captionText?: string;
  captionPreset?: string;
  captionFontSize?: number;
  captionPosition?: "TOP" | "CENTER" | "BOTTOM_SAFE" | "BOTTOM";
  cropMode?: string;
  focusX?: number; // 0.0 to 1.0
  showCaptions?: boolean;
  onToggleCaptions?: () => void;
}

export const VideoPreviewPlayer: React.FC<VideoPreviewPlayerProps> = ({
  videoUrl,
  aspectRatio,
  currentTime,
  duration,
  onTimeUpdate,
  onDurationChange,
  onSeek,
  captionText,
  captionPreset = "viral-highlight",
  captionFontSize = 64,
  captionPosition = "BOTTOM_SAFE",
  showCaptions = true,
  onToggleCaptions,
}) => {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isMuted, setIsMuted] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [showSafeZones, setShowSafeZones] = React.useState(false);

  // Sync internal video element time with external prop
  React.useEffect(() => {
    if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.4) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  const togglePlay = React.useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // Keyboard shortcut listener: Space to toggle play, Arrow keys to seek
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT"
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "KeyC") {
        e.preventDefault();
        onToggleCaptions?.();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        onSeek(Math.max(0, currentTime - 1));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        onSeek(Math.min(duration, currentTime + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, onSeek, currentTime, duration, onToggleCaptions]);

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().catch(() => {});
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  // Compute aspect ratio classes
  const aspectClass =
    aspectRatio === AspectRatio.RATIO_9_16
      ? "aspect-[9/16] max-w-[270px] sm:max-w-[300px]"
      : aspectRatio === AspectRatio.RATIO_1_1
      ? "aspect-square max-w-[360px]"
      : "aspect-video max-w-[480px]";

  // Format seconds to mm:ss.ms
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${mins < 10 ? "0" : ""}${mins}:${s < 10 ? "0" : ""}${s}.${ms}`;
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center justify-center w-full h-full p-4 bg-zinc-950 rounded-2xl select-none"
    >
      {/* Player Frame */}
      <div
        className={`relative w-full ${aspectClass} rounded-xl overflow-hidden bg-black border border-zinc-800 shadow-2xl flex items-center justify-center transition-all`}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            playsInline
            preload="auto"
            crossOrigin="anonymous"
            muted={isMuted}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={() => {
              if (videoRef.current) {
                onTimeUpdate(videoRef.current.currentTime);
              }
            }}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                onDurationChange(videoRef.current.duration);
              }
            }}
            onEnded={() => setIsPlaying(false)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-zinc-600 p-6 text-center">
            <FilmSlate size={36} className="mb-2" />
            <span className="text-xs">No video stream source</span>
          </div>
        )}

        {/* Center Clickable Play/Pause Overlay */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause video (Space)" : "Play video (Space)"}
          className="absolute inset-0 w-full h-full flex items-center justify-center bg-black/10 hover:bg-black/30 transition-colors group cursor-pointer focus:outline-none"
        >
          <div
            className={`w-12 h-12 rounded-full bg-white/90 text-zinc-950 flex items-center justify-center shadow-lg transition-transform ${
              isPlaying ? "opacity-0 group-hover:opacity-100 scale-90" : "opacity-100 scale-100"
            }`}
          >
            {isPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" className="ml-0.5" />}
          </div>
        </button>

        {/* Mask bottom burned-in subtitles when captions are turned off OR when position is moved to Top/Center */}
        {(!showCaptions || captionPosition === "TOP" || captionPosition === "CENTER") && (
          <div className="absolute left-0 right-0 bottom-6 h-20 bg-black/95 pointer-events-none transition-all flex items-center justify-center">
            {!showCaptions && (
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
                Captions Off
              </span>
            )}
          </div>
        )}

        {/* Live Subtitle Overlay Preview - ONLY displayed when position is customized to TOP or CENTER (to avoid double caption over bottom burned subtitles) */}
        {showCaptions && (captionPosition === "TOP" || captionPosition === "CENTER") && captionText && (
          <div
            className={`absolute left-0 right-0 px-4 text-center pointer-events-none transition-all ${
              captionPosition === "TOP"
                ? "top-8"
                : "top-1/2 -translate-y-1/2"
            }`}
          >
            <span
              style={{ fontSize: `${Math.max(12, Math.min(22, captionFontSize / 3.2))}px` }}
              className={`inline-block px-3 py-1 rounded-md font-bold uppercase tracking-wide leading-tight shadow-sm transition-all ${
                captionPreset === "boxed"
                  ? "bg-black/90 text-yellow-400 border border-yellow-400/50"
                  : captionPreset === "clean"
                  ? "text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                  : "text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
              }`}
            >
              {captionPreset === "viral-highlight" ? (
                <span>
                  {captionText.split(" ").map((w, idx) => (
                    <span
                      key={idx}
                      className={idx === 1 || idx === 0 ? "text-yellow-400 font-extrabold mr-1" : "mr-1"}
                    >
                      {w}
                    </span>
                  ))}
                </span>
              ) : (
                captionText
              )}
            </span>
          </div>
        )}

        {/* TikTok / Reels / Shorts Platform Safe Zones Overlay */}
        {showSafeZones && aspectRatio === AspectRatio.RATIO_9_16 && (
          <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-red-500/40 rounded-xl flex flex-col justify-between p-3">
            {/* Top Bar Safe Zone */}
            <div className="h-10 border-b border-red-500/30 bg-red-500/10 flex items-center justify-center">
              <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">
                Top Platform Header Zone
              </span>
            </div>

            {/* Right Side Interaction Rail */}
            <div className="self-end w-12 h-36 border border-red-500/30 bg-red-500/10 rounded flex flex-col items-center justify-center text-[8px] text-red-400 font-semibold text-center p-1">
              <span>Like, Comment, Share Rail</span>
            </div>

            {/* Bottom Caption & Audio Safe Zone */}
            <div className="h-14 border-t border-red-500/30 bg-red-500/10 flex items-center justify-center">
              <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">
                Bottom Caption & Audio Safe Zone
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Floating Scrub & Media Controls Toolbar */}
      <div className="w-full max-w-md mt-4 flex items-center justify-between gap-3 text-xs text-zinc-400 bg-zinc-900/90 border border-zinc-800 px-3.5 py-2 rounded-xl backdrop-blur-xs">
        {/* Play/Pause */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="text-zinc-200 hover:text-white transition-colors focus:outline-none"
        >
          {isPlaying ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
        </button>

        {/* Timecodes */}
        <div className="font-mono text-[11px] tabular-nums text-zinc-300">
          <span>{formatTime(currentTime)}</span>
          <span className="text-zinc-600 mx-1">/</span>
          <span className="text-zinc-500">{formatTime(duration)}</span>
        </div>

        {/* Mini Scrub Slider */}
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          aria-label="Seek video position"
          className="flex-1 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white"
        />

        {/* Closed Captions Toggle */}
        {onToggleCaptions && (
          <button
            type="button"
            onClick={onToggleCaptions}
            title={showCaptions ? "Turn off captions (C)" : "Turn on captions (C)"}
            aria-label={showCaptions ? "Turn off captions" : "Turn on captions"}
            className={`p-1 rounded-md transition-colors ${
              showCaptions ? "bg-amber-500/20 text-amber-400 font-bold" : "text-zinc-500 hover:text-white"
            }`}
          >
            <ClosedCaptioning size={15} weight={showCaptions ? "fill" : "regular"} />
          </button>
        )}

        {/* Safe Zones Toggle */}
        <button
          type="button"
          onClick={() => setShowSafeZones(!showSafeZones)}
          title="Toggle TikTok / Reels Safe Zone Overlay"
          aria-label="Toggle safe zone overlay"
          className={`p-1 rounded-md transition-colors ${
            showSafeZones ? "bg-red-950 text-red-400" : "text-zinc-400 hover:text-white"
          }`}
        >
          <DeviceMobile size={15} />
        </button>

        {/* Mute Toggle */}
        <button
          type="button"
          onClick={toggleMute}
          aria-label={isMuted ? "Unmute" : "Mute"}
          className="text-zinc-400 hover:text-white transition-colors focus:outline-none"
        >
          {isMuted ? <SpeakerSimpleSlash size={15} /> : <SpeakerHigh size={15} />}
        </button>

        {/* Fullscreen Toggle */}
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          className="text-zinc-400 hover:text-white transition-colors focus:outline-none"
        >
          {isFullscreen ? <CornersIn size={15} /> : <CornersOut size={15} />}
        </button>
      </div>
    </div>
  );
};

