#!/usr/bin/env npx tsx
/**
 * CLI tool to split instructional videos into segments by scene and silence detection.
 *
 * Usage:
 *   npx tsx scripts/split-video.ts input.mp4 --output ./segments/
 *   npx tsx scripts/split-video.ts input.mp4 --dry-run
 *   npx tsx scripts/split-video.ts input.mp4 --scene-threshold 0.3 --silence-duration 2.0
 */

import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import {
  getVideoDuration,
  detectSceneChanges,
  detectSilence,
  mergeDetections,
  buildSegments,
  splitVideo,
  formatTime,
} from "../lib/video-splitter";

interface Args {
  inputPath: string;
  outputDir: string;
  dryRun: boolean;
  sceneThreshold: number;
  silenceDuration: number;
  noiseTolerance: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: npx tsx scripts/split-video.ts <input> [options]

Options:
  --output <dir>           Output directory (default: ./segments/)
  --dry-run                Show detected segments without splitting
  --scene-threshold <n>    Scene change threshold 0-1 (default: 0.4)
  --silence-duration <n>   Minimum silence duration in seconds (default: 1.5)
  --noise-tolerance <dB>   Noise floor for silence detection (default: -30dB)
  --help                   Show this help
`);
    process.exit(0);
  }

  // Resolve ~ to home directory (execFile doesn't expand shell shortcuts)
  const inputPath = args[0].startsWith("~")
    ? path.join(os.homedir(), args[0].slice(1))
    : args[0];
  let outputDir = "./segments/";
  let dryRun = false;
  let sceneThreshold = 0.4;
  let silenceDuration = 1.5;
  let noiseTolerance = "-30dB";

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--output":
        outputDir = args[++i];
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--scene-threshold":
        sceneThreshold = parseFloat(args[++i]);
        break;
      case "--silence-duration":
        silenceDuration = parseFloat(args[++i]);
        break;
      case "--noise-tolerance":
        noiseTolerance = args[++i];
        break;
    }
  }

  return { inputPath, outputDir, dryRun, sceneThreshold, silenceDuration, noiseTolerance };
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [Y/n] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() !== "n");
    });
  });
}

async function main() {
  const args = parseArgs();

  console.log(`\nAnalyzing: ${path.basename(args.inputPath)}`);
  console.log(`Scene threshold: ${args.sceneThreshold}, Silence duration: ${args.silenceDuration}s\n`);

  // Step 1: Get duration
  console.log("Getting video duration...");
  const duration = await getVideoDuration(args.inputPath);
  console.log(`Duration: ${formatTime(duration)} (${Math.round(duration)}s)\n`);

  // Step 2: Detect scene changes
  console.log("Detecting scene changes...");
  const sceneTimestamps = await detectSceneChanges(args.inputPath, args.sceneThreshold);
  console.log(`Found ${sceneTimestamps.length} scene changes\n`);

  // Step 3: Detect silence gaps
  console.log("Detecting silence gaps...");
  const silenceTimestamps = await detectSilence(args.inputPath, args.noiseTolerance, args.silenceDuration);
  console.log(`Found ${silenceTimestamps.length} silence gaps\n`);

  // Step 4: Merge detections
  let boundaries = mergeDetections(sceneTimestamps, silenceTimestamps);
  console.log(`Merged: ${boundaries.length} segment boundaries\n`);

  // Fallback: if combined detection finds too few boundaries, use scene-only
  if (boundaries.length < 2 && sceneTimestamps.length >= 2) {
    console.log("Few combined boundaries found — falling back to scene detection only.\n");
    // Filter scene changes to those with reasonable segment spacing (>60s apart)
    const filtered: number[] = [];
    for (const t of sceneTimestamps) {
      if (filtered.length === 0 || t - filtered[filtered.length - 1] > 60) {
        filtered.push(t);
      }
    }
    boundaries = filtered;
    console.log(`Scene-only: ${boundaries.length} boundaries (>60s apart)\n`);
  }

  // Step 5: Build segments
  const segments = buildSegments(boundaries, duration);

  console.log(`Detected ${segments.length} segments:`);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const num = String(i + 1).padStart(3, " ");
    console.log(
      `  ${num}. ${formatTime(seg.startTime)} — ${formatTime(seg.endTime)}  (${formatTime(seg.duration)})`
    );
  }

  if (args.dryRun) {
    console.log("\n--dry-run: No files written.");
    process.exit(0);
  }

  // Step 6: Confirm and split
  console.log("");
  const proceed = await confirm(`Split into ${segments.length} segments in ${args.outputDir}?`);

  if (!proceed) {
    console.log("Cancelled.");
    process.exit(0);
  }

  console.log(`\nSplitting into ${args.outputDir}...\n`);
  const results = await splitVideo(args.inputPath, segments, args.outputDir);

  console.log(`\nDone! ${results.length} segments written to ${args.outputDir}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
