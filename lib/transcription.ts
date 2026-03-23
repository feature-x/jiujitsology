import { AssemblyAI } from "assemblyai";

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY!,
});

export interface TranscriptionSegment {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  durationSec: number;
}

/**
 * Transcribe a video using AssemblyAI.
 * Accepts a URL (e.g., Supabase signed URL) — AssemblyAI handles
 * audio extraction and processing internally.
 */
export async function transcribeVideo(
  videoUrl: string
): Promise<TranscriptionResult> {
  const transcript = await client.transcripts.transcribe({
    audio_url: videoUrl,
    speech_models: ["universal-3-pro"],
  });

  if (transcript.status === "error") {
    throw new Error(
      transcript.error || "Transcription failed with unknown error"
    );
  }

  // Fetch sentences for natural chunk boundaries
  const sentences = await client.transcripts.sentences(transcript.id);
  const segments: TranscriptionSegment[] = sentences.sentences.map((s) => ({
    start: s.start / 1000, // ms to seconds
    end: s.end / 1000,
    text: s.text,
  }));

  // If no sentences available, fall back to full text as single segment
  if (segments.length === 0 && transcript.text) {
    segments.push({
      start: 0,
      end: transcript.audio_duration ?? 0,
      text: transcript.text,
    });
  }

  return {
    text: transcript.text || "",
    segments,
    durationSec: transcript.audio_duration ?? 0,
  };
}
