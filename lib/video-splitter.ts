import { execFile } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";

const exec = promisify(execFile);

export interface SegmentBoundary {
  startTime: number;
  endTime: number;
  duration: number;
}

export interface SplitResult {
  segmentNumber: number;
  filePath: string;
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * Get video duration via ffprobe.
 */
export async function getVideoDuration(inputPath: string): Promise<number> {
  const { stdout } = await exec("ffprobe", [
    "-v", "quiet",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ]);
  return parseFloat(stdout.trim());
}

/**
 * Detect scene changes using ffmpeg's scene detection filter.
 * Returns timestamps where visual transitions occur.
 */
export async function detectSceneChanges(
  inputPath: string,
  threshold: number = 0.4
): Promise<number[]> {
  const { stderr } = await exec("ffmpeg", [
    "-i", inputPath,
    "-filter:v", `select='gt(scene,${threshold})',showinfo`,
    "-f", "null",
    "-",
  ], { maxBuffer: 50 * 1024 * 1024 });

  const timestamps: number[] = [];
  const regex = /pts_time:(\d+\.?\d*)/g;
  let match;
  while ((match = regex.exec(stderr)) !== null) {
    timestamps.push(parseFloat(match[1]));
  }
  return timestamps;
}

/**
 * Detect black frames using ffmpeg's blackdetect filter.
 * Returns timestamps where black segments end (transition from title card to content).
 * Most BJJ instructionals use black frames or fades between chapters.
 */
export async function detectBlackFrames(
  inputPath: string,
  minDuration: number = 0.3,
  pixelThreshold: number = 0.1
): Promise<number[]> {
  const { stderr } = await exec("ffmpeg", [
    "-i", inputPath,
    "-vf", `blackdetect=d=${minDuration}:pix_th=${pixelThreshold}`,
    "-an",
    "-f", "null",
    "-",
  ], { maxBuffer: 50 * 1024 * 1024 });

  const timestamps: number[] = [];
  const regex = /black_end:(\d+\.?\d*)/g;
  let match;
  while ((match = regex.exec(stderr)) !== null) {
    timestamps.push(parseFloat(match[1]));
  }
  return timestamps;
}

/**
 * Detect freeze frames (static/title cards) using ffmpeg's freezedetect filter.
 * Returns timestamps where freeze segments end (transition from static title to motion).
 */
export async function detectFreezeFrames(
  inputPath: string,
  noiseTolerance: number = 0.003,
  minDuration: number = 1.0
): Promise<number[]> {
  const { stderr } = await exec("ffmpeg", [
    "-i", inputPath,
    "-vf", `freezedetect=n=${noiseTolerance}:d=${minDuration}`,
    "-an",
    "-f", "null",
    "-",
  ], { maxBuffer: 50 * 1024 * 1024 });

  const timestamps: number[] = [];
  const regex = /freeze_end:(\d+\.?\d*)/g;
  let match;
  while ((match = regex.exec(stderr)) !== null) {
    timestamps.push(parseFloat(match[1]));
  }
  return timestamps;
}

/**
 * Detect title card boundaries by combining black frame and freeze frame detection.
 * Title cards typically involve: black fade → static graphic → black fade → content.
 */
export function mergeTitleDetections(
  blackTimestamps: number[],
  freezeTimestamps: number[],
  tolerance: number = 5.0
): number[] {
  // If we have black frames, use them (most reliable for chapter boundaries)
  if (blackTimestamps.length >= 2) {
    // Deduplicate within 5 seconds
    const deduped: number[] = [];
    for (const t of blackTimestamps.sort((a, b) => a - b)) {
      if (deduped.length === 0 || t - deduped[deduped.length - 1] > tolerance) {
        deduped.push(t);
      }
    }
    return deduped;
  }

  // Fall back to freeze frames if no black frames found
  if (freezeTimestamps.length >= 2) {
    const deduped: number[] = [];
    for (const t of freezeTimestamps.sort((a, b) => a - b)) {
      if (deduped.length === 0 || t - deduped[deduped.length - 1] > tolerance) {
        deduped.push(t);
      }
    }
    return deduped;
  }

  return [];
}

/**
 * Detect silence gaps using ffmpeg's silencedetect filter.
 * Returns timestamps where silence ends (i.e., start of a new segment).
 */
export async function detectSilence(
  inputPath: string,
  noiseTolerance: string = "-30dB",
  minDuration: number = 1.5
): Promise<number[]> {
  const { stderr } = await exec("ffmpeg", [
    "-i", inputPath,
    "-af", `silencedetect=noise=${noiseTolerance}:d=${minDuration}`,
    "-f", "null",
    "-",
  ], { maxBuffer: 50 * 1024 * 1024 });

  const timestamps: number[] = [];
  const regex = /silence_end: (\d+\.?\d*)/g;
  let match;
  while ((match = regex.exec(stderr)) !== null) {
    timestamps.push(parseFloat(match[1]));
  }
  return timestamps;
}

/**
 * Merge scene and silence timestamps — a segment boundary is where
 * both a scene change AND a silence gap occur within `tolerance` seconds.
 */
export function mergeDetections(
  sceneTimestamps: number[],
  silenceTimestamps: number[],
  tolerance: number = 3.0
): number[] {
  const merged: number[] = [];

  for (const scene of sceneTimestamps) {
    const nearestSilence = silenceTimestamps.find(
      (s) => Math.abs(s - scene) <= tolerance
    );
    if (nearestSilence !== undefined) {
      // Use the silence timestamp (more precise — marks the start of audio)
      merged.push(nearestSilence);
    }
  }

  // Deduplicate (within 2 seconds)
  const deduped: number[] = [];
  for (const t of merged.sort((a, b) => a - b)) {
    if (deduped.length === 0 || t - deduped[deduped.length - 1] > 2) {
      deduped.push(t);
    }
  }

  return deduped;
}

/**
 * Build segment boundaries from boundary timestamps.
 */
export function buildSegments(
  boundaries: number[],
  totalDuration: number,
  minSegmentDuration: number = 30
): SegmentBoundary[] {
  const segments: SegmentBoundary[] = [];
  const times = [0, ...boundaries, totalDuration];

  for (let i = 0; i < times.length - 1; i++) {
    const startTime = times[i];
    const endTime = times[i + 1];
    const duration = endTime - startTime;

    // Skip very short segments (likely false positives)
    if (duration < minSegmentDuration && i > 0 && i < times.length - 2) {
      // Merge into previous segment
      if (segments.length > 0) {
        segments[segments.length - 1].endTime = endTime;
        segments[segments.length - 1].duration =
          endTime - segments[segments.length - 1].startTime;
      }
      continue;
    }

    segments.push({ startTime, endTime, duration });
  }

  return segments;
}

/**
 * Split a video into segments using ffmpeg.
 * Uses -c copy for lossless splitting (no re-encoding).
 */
export async function splitVideo(
  inputPath: string,
  segments: SegmentBoundary[],
  outputDir: string
): Promise<SplitResult[]> {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  fs.mkdirSync(outputDir, { recursive: true });

  const results: SplitResult[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segNum = String(i + 1).padStart(3, "0");
    const outputPath = path.join(outputDir, `${baseName}_segment_${segNum}.mp4`);

    await exec("ffmpeg", [
      "-i", inputPath,
      "-ss", String(seg.startTime),
      "-to", String(seg.endTime),
      "-c", "copy",
      "-avoid_negative_ts", "make_zero",
      "-y",
      outputPath,
    ]);

    const stat = fs.statSync(outputPath);
    results.push({
      segmentNumber: i + 1,
      filePath: outputPath,
      startTime: seg.startTime,
      endTime: seg.endTime,
      duration: seg.duration,
    });

    console.log(
      `  ${segNum}. ${formatTime(seg.startTime)} — ${formatTime(seg.endTime)} ` +
      `(${formatTime(seg.duration)}) → ${(stat.size / 1024 / 1024).toFixed(1)}MB`
    );
  }

  return results;
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
