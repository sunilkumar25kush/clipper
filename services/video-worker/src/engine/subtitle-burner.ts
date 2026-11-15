import path from "path";
import fs from "fs";
import { SubtitleBurnOptions } from "@clipforge/shared-types";
import { workerConfig } from "../config/env.js";
import { executeProcess, validateInputFile } from "./ffmpeg-process.js";
import { secondsToAssTimestamp } from "../utils/time-formatter.js";

export interface AssSubtitleDialogue {
  startSeconds: number;
  endSeconds: number;
  text: string;
  speaker?: string;
}

export interface AssWordToken {
  word: string;
  startSeconds: number;
  endSeconds: number;
  probability?: number;
}

export enum SubtitlePreset {
  CLEAN = "CLEAN",
  VIRAL_HIGHLIGHT = "VIRAL_HIGHLIGHT",
  BOXED = "BOXED",
}

export enum CaptionPosition {
  BOTTOM = "BOTTOM",
  CENTER = "CENTER",
  TOP = "TOP",
}

export interface AssGenerationOptions {
  title?: string;
  fontFamily?: string;
  fontSize?: number;
  primaryColorHex?: string;      // e.g. "#FFFFFF"
  highlightColorHex?: string;    // e.g. "#FACC15" (Yellow/Gold)
  outlineColorHex?: string;      // e.g. "#000000"
  outlineWidth?: number;         // e.g. 3
  shadowDistance?: number;       // e.g. 1
  position?: CaptionPosition | "BOTTOM" | "CENTER" | "TOP";
  stylePreset?: SubtitlePreset | "CLEAN" | "VIRAL_HIGHLIGHT" | "BOXED";
  showSpeakerLabels?: boolean;
  wordsPerLine?: number;         // default 3-4 words per card
  videoWidth?: number;           // default 1080
  videoHeight?: number;          // default 1920
}

/**
 * Converts standard Web Hex (#RRGGBB) to ASS color format (&HAABBGGRR&)
 */
export function hexToAssColor(hex: string, alphaHex = "00"): string {
  const cleanHex = hex.replace("#", "").trim();
  let r = "FF";
  let g = "FF";
  let b = "FF";

  if (cleanHex.length === 6) {
    r = cleanHex.substring(0, 2);
    g = cleanHex.substring(2, 4);
    b = cleanHex.substring(4, 6);
  } else if (cleanHex.length === 3) {
    const c0 = cleanHex[0] || "F";
    const c1 = cleanHex[1] || "F";
    const c2 = cleanHex[2] || "F";
    r = c0 + c0;
    g = c1 + c1;
    b = c2 + c2;
  }

  // In ASS, color format is &HAABBGGRR& (Blue-Green-Red order)
  return `&H${alphaHex}${b}${g}${r}&`.toUpperCase();
}

export class SubtitleBurner {
  private ffmpegPath: string;

  constructor(ffmpegPath = workerConfig.ffmpegPath) {
    this.ffmpegPath = ffmpegPath;
  }

  /**
   * Generates a standard Advanced SubStation Alpha (.ass) subtitle file.
   */
  generateAssFile(
    outputPath: string,
    dialogues: AssSubtitleDialogue[],
    options: AssGenerationOptions = {},
  ): string {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const title = options.title || "ClipForge AI Subtitles";
    const fontFamily = options.fontFamily || "Arial";
    const fontSize = options.fontSize || 24;
    const playResX = options.videoWidth || 1080;
    const playResY = options.videoHeight || 1920;

    const primaryAssColor = hexToAssColor(options.primaryColorHex || "#FFFFFF");
    const outlineAssColor = hexToAssColor(options.outlineColorHex || "#000000");
    const outlineWidth = options.outlineWidth ?? 3;
    const shadowDist = options.shadowDistance ?? 1;

    let alignment = 2; // Bottom
    let marginV = 60;
    const pos = options.position ? String(options.position) : "BOTTOM";
    if (pos === "CENTER") {
      alignment = 5;
      marginV = 0;
    } else if (pos === "TOP") {
      alignment = 8;
      marginV = 60;
    }

    const preset = options.stylePreset ? String(options.stylePreset) : "CLEAN";
    const borderStyle = preset === "BOXED" ? 3 : 1;
    const backColour = borderStyle === 3 ? "&H80000000&" : "&H80000000&";

    let content = `[Script Info]
Title: ${title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None
PlayResX: ${playResX}
PlayResY: ${playResY}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},${primaryAssColor},&H000000FF,${outlineAssColor},${backColour},-1,0,0,0,100,100,0,0,${borderStyle},${outlineWidth},${shadowDist},${alignment},20,20,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    for (const d of dialogues) {
      const start = secondsToAssTimestamp(Math.max(0, d.startSeconds));
      const end = secondsToAssTimestamp(Math.max(d.startSeconds + 0.05, d.endSeconds));
      const speakerPrefix = options.showSpeakerLabels && d.speaker ? `[${d.speaker}]: ` : "";
      const sanitizedText = d.text.replace(/[{}]/g, "").trim();
      if (sanitizedText) {
        content += `Dialogue: 0,${start},${end},Default,,0,0,0,,${speakerPrefix}${sanitizedText}\n`;
      }
    }

    fs.writeFileSync(outputPath, content, "utf8");
    return outputPath;
  }

  /**
   * Generates dynamic word-level highlighted ASS subtitles (Hormozi / Viral video style).
   * Groups words into chunks of N words, and lights up each active word in highlightColorHex.
   */
  generateWordHighlightAssFile(
    outputPath: string,
    words: AssWordToken[],
    options: AssGenerationOptions = {},
  ): string {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const title = options.title || "ClipForge Word Highlight Subtitles";
    const fontFamily = options.fontFamily || "Arial";
    const playResX = options.videoWidth || 1080;
    const playResY = options.videoHeight || 1920;
    const isVertical = playResY > playResX;
    const fontSize = options.fontSize || (isVertical ? 60 : 38);

    const primaryAssColor = hexToAssColor(options.primaryColorHex || "#FFFFFF");
    const highlightAssColor = hexToAssColor(options.highlightColorHex || "#FACC15"); // Gold / Yellow
    const outlineAssColor = hexToAssColor(options.outlineColorHex || "#000000");
    const outlineWidth = options.outlineWidth ?? (isVertical ? 5 : 3);
    const shadowDist = options.shadowDistance ?? 2;

    let alignment = 2; // Bottom Center
    let marginV = isVertical ? 280 : 80;
    const pos = options.position ? String(options.position) : "BOTTOM";
    if (pos === "CENTER") {
      alignment = 5;
      marginV = 0;
    } else if (pos === "TOP") {
      alignment = 8;
      marginV = isVertical ? 280 : 80;
    }

    const preset = options.stylePreset ? String(options.stylePreset) : "VIRAL_HIGHLIGHT";
    const borderStyle = preset === "BOXED" ? 3 : 1;
    const backColour = borderStyle === 3 ? "&H80000000&" : "&H80000000&";

    let content = `[Script Info]
Title: ${title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: None
PlayResX: ${playResX}
PlayResY: ${playResY}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSize},${primaryAssColor},&H000000FF,${outlineAssColor},${backColour},-1,0,0,0,100,100,0,0,${borderStyle},${outlineWidth},${shadowDist},${alignment},30,30,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    if (!words || words.length === 0) {
      fs.writeFileSync(outputPath, content, "utf8");
      return outputPath;
    }

    const wordsPerCard = options.wordsPerLine || 3;
    const isViralPreset = preset !== "CLEAN";

    // Group words into short readable phrases
    for (let c = 0; c < words.length; c += wordsPerCard) {
      const cardWords = words.slice(c, c + wordsPerCard);
      if (cardWords.length === 0) continue;

      const firstWord = cardWords[0];
      const lastWord = cardWords[cardWords.length - 1];
      if (!firstWord || !lastWord) continue;

      if (!isViralPreset) {
        // Plain static subtitle card
        const cardStart = secondsToAssTimestamp(Math.max(0, firstWord.startSeconds));
        const cardEnd = secondsToAssTimestamp(lastWord.endSeconds);
        const text = cardWords.map((w) => w.word.replace(/[{}]/g, "").trim()).join(" ");
        content += `Dialogue: 0,${cardStart},${cardEnd},Default,,0,0,0,,${text}\n`;
      } else {
        // Dynamic Word-level highlighting: emit sub-dialogues for each word interval
        for (let i = 0; i < cardWords.length; i++) {
          const activeWord = cardWords[i];
          if (!activeWord) continue;

          const nextWord = cardWords[i + 1] || words[c + wordsPerCard];
          // Extend wEnd to next word start if within 0.8s to prevent flickering between words and phrases
          const naturalEnd = nextWord && nextWord.startSeconds > activeWord.endSeconds && (nextWord.startSeconds - activeWord.endSeconds) < 0.8
            ? nextWord.startSeconds
            : Math.max(activeWord.startSeconds + 0.1, activeWord.endSeconds);

          const wStart = secondsToAssTimestamp(Math.max(0, activeWord.startSeconds));
          const wEnd = secondsToAssTimestamp(naturalEnd);

          const formattedWords = cardWords.map((w, idx) => {
            const cleanWord = w.word.replace(/[{}]/g, "").trim();
            if (idx === i) {
              // Active highlight tag with bold and gold color
              return `{\\c${highlightAssColor}\\b1}${cleanWord}{\\c${primaryAssColor}\\b0}`;
            }
            return cleanWord;
          });

          const lineText = formattedWords.join(" ");
          content += `Dialogue: 0,${wStart},${wEnd},Default,,0,0,0,,${lineText}\n`;
        }
      }
    }

    fs.writeFileSync(outputPath, content, "utf8");
    return outputPath;
  }

  /**
   * Burn-in ASS or SRT subtitles into a video file using FFmpeg filter.
   */
  async burnSubtitles(
    inputVideoPath: string,
    outputVideoPath: string,
    options: SubtitleBurnOptions,
  ): Promise<{ outputPath: string; durationMs: number }> {
    validateInputFile(inputVideoPath);
    validateInputFile(options.subtitlePath);

    const outputDir = path.dirname(outputVideoPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Windows FFmpeg filter path sanitization:
    // Colons and backslashes in filter paths need forward slashes and escaped drive colons (e.g. C\\:/path/to/sub.ass)
    const normalizedSubPath = path
      .resolve(options.subtitlePath)
      .replace(/\\/g, "/")
      .replace(/^([A-Za-z]):/, "$1\\:");

    const filterName = options.subtitlePath.endsWith(".ass") ? "ass" : "subtitles";
    const filter = `${filterName}='${normalizedSubPath}'`;

    const args = [
      "-y",
      "-i",
      inputVideoPath,
      "-vf",
      filter,
      "-c:v",
      "libx264",
      "-preset",
      workerConfig.defaultPreset,
      "-crf",
      workerConfig.defaultCrf.toString(),
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "copy", // keep original audio untouched
      "-movflags",
      "+faststart",
      "-threads",
      workerConfig.maxThreads.toString(),
      outputVideoPath,
    ];

    const result = await executeProcess(this.ffmpegPath, args);

    if (!fs.existsSync(outputVideoPath) || fs.statSync(outputVideoPath).size === 0) {
      throw new Error(`Subtitle burn-in failed: Output file missing or empty (${outputVideoPath})`);
    }

    return {
      outputPath: outputVideoPath,
      durationMs: result.durationMs,
    };
  }
}

export const subtitleBurner = new SubtitleBurner();
