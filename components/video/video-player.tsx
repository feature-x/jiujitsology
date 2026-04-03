"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface VideoPlayerProps {
  videoId: string;
  title: string;
  /** Node label to search for in chunks — used to find the timestamp */
  searchLabel?: string;
  /** Explicit start time — skips the label search when provided */
  initialStartTime?: number;
  onClose: () => void;
}

export function VideoPlayer({
  videoId,
  title,
  searchLabel,
  initialStartTime,
  onClose,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [posterReady, setPosterReady] = useState(false);

  useEffect(() => {
    async function fetchSignedUrl() {
      const params = new URLSearchParams();
      if (searchLabel) params.set("label", searchLabel);
      const qs = params.toString();
      const response = await fetch(
        `/api/videos/${videoId}/signed-url${qs ? `?${qs}` : ""}`
      );
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to load video.");
        setLoading(false);
        return;
      }
      const data = await response.json();
      setUrl(data.url);
      if (initialStartTime != null) {
        setStartTime(initialStartTime);
      } else if (data.startTime != null && data.startTime > 0) {
        setStartTime(data.startTime);
      }
      setLoading(false);
    }
    fetchSignedUrl();
  }, [videoId, searchLabel, initialStartTime]);

  useEffect(() => {
    if (url && videoRef.current && startTime != null) {
      videoRef.current.currentTime = startTime;
    }
  }, [url, startTime]);

  // Capture a poster frame when the video seeks to the start time.
  // This shows the actual video frame while the rest of the video buffers.
  function handleSeeked() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || posterReady) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      setPosterReady(true);
    }
  }

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl mx-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-white font-medium truncate pr-4">
            {title}
            {startTime != null ? ` — ${formatTime(startTime)}` : ""}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:text-white/80 h-7 px-2"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
        <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
          {(loading || (url && buffering)) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="h-6 w-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <p className="text-sm text-white/60">
                  {loading ? "Loading video..." : "Buffering..."}
                </p>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
          {url && (
            <>
              <video
                ref={videoRef}
                src={url}
                controls
                preload="metadata"
                className="w-full h-full"
                controlsList="nodownload"
                onCanPlay={() => setBuffering(false)}
                onSeeked={handleSeeked}
              />
              {/* Poster frame — shows the captured frame while video buffers */}
              <canvas
                ref={canvasRef}
                className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-300 ${
                  posterReady && buffering ? "opacity-100" : "opacity-0"
                }`}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
