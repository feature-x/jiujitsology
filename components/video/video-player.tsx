"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface VideoPlayerProps {
  videoId: string;
  title: string;
  /** Node label to search for in chunks — used to find the timestamp */
  searchLabel?: string;
  onClose: () => void;
}

export function VideoPlayer({
  videoId,
  title,
  searchLabel,
  onClose,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      if (data.startTime != null) {
        setStartTime(data.startTime);
      }
      setLoading(false);
    }
    fetchSignedUrl();
  }, [videoId, searchLabel]);

  useEffect(() => {
    if (url && videoRef.current && startTime != null) {
      videoRef.current.currentTime = startTime;
    }
  }, [url, startTime]);

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
            {startTime ? ` — ${formatTime(startTime)}` : ""}
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
        <div className="bg-black rounded-lg overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <p className="text-sm text-white/60">Loading video...</p>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-64">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
          {url && (
            <video
              ref={videoRef}
              src={url}
              controls
              className="w-full"
              controlsList="nodownload"
            />
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
