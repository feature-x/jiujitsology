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
  detectChapters,
  chaptersToSegments,
  detectBlackFrames,
  detectFreezeFrames,
  mergeTitleDetections,
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
  --output <dir>           Output directory (default: {filename}_segments/ next to input)
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
  const baseName = path.basename(inputPath, path.extname(inputPath));
  let outputDir = path.join(path.dirname(inputPath), `${baseName}_segments`);
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

  console.log(`\nAnalyzing: ${path.basename(args.inputPath)}\n`);

  // Step 1: Get duration
  console.log("Getting video duration...");
  const duration = await getVideoDuration(args.inputPath);
  console.log(`Duration: ${formatTime(duration)} (${Math.round(duration)}s)\n`);

  // Step 2: Check for embedded chapter markers (most reliable)
  console.log("Checking for embedded chapters...");
  const chapters = await detectChapters(args.inputPath);

  let segments: ReturnType<typeof buildSegments>;

  if (chapters.length >= 2) {
    console.log(`Found ${chapters.length} embedded chapters:\n`);
    for (const ch of chapters) {
      console.log(`  ${formatTime(ch.startTime)} — ${formatTime(ch.endTime)}  ${ch.title}`);
    }
    console.log("");
    segments = chaptersToSegments(chapters);
  } else {
    console.log("No embedded chapters found — using visual detection.\n");

    // Step 3: Title card detection (black frames + freeze frames)
    console.log("Detecting black frames (chapter transitions)...");
    const blackTimestamps = await detectBlackFrames(args.inputPath);
    console.log(`Found ${blackTimestamps.length} black frame transitions\n`);

    console.log("Detecting freeze frames (title cards)...");
    const freezeTimestamps = await detectFreezeFrames(args.inputPath);
    console.log(`Found ${freezeTimestamps.length} freeze frame transitions\n`);

    let boundaries = mergeTitleDetections(blackTimestamps, freezeTimestamps);
    console.log(`Title card boundaries: ${boundaries.length}\n`);

    // Fallback: scene + silence
    if (boundaries.length < 2) {
      console.log("Few title cards found — trying scene + silence detection...\n");

      console.log("Detecting scene changes...");
      const sceneTimestamps = await detectSceneChanges(args.inputPath, args.sceneThreshold);
      console.log(`Found ${sceneTimestamps.length} scene changes\n`);

      console.log("Detecting silence gaps...");
      const silenceTimestamps = await detectSilence(args.inputPath, args.noiseTolerance, args.silenceDuration);
      console.log(`Found ${silenceTimestamps.length} silence gaps\n`);

      boundaries = mergeDetections(sceneTimestamps, silenceTimestamps);
      console.log(`Scene+silence boundaries: ${boundaries.length}\n`);

      // Final fallback: scene-only
      if (boundaries.length < 2 && sceneTimestamps.length >= 2) {
        console.log("Falling back to scene-only detection (>60s spacing)...\n");
        const filtered: number[] = [];
        for (const t of sceneTimestamps) {
          if (filtered.length === 0 || t - filtered[filtered.length - 1] > 60) {
            filtered.push(t);
          }
        }
        boundaries = filtered;
      }
    }

    segments = buildSegments(boundaries, duration);
  }

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
