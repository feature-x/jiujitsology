"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { UploadForm } from "@/components/videos/upload-form";
import { VideoList } from "@/components/videos/video-list";
import { Separator } from "@/components/ui/separator";
import { isTerminalStatus } from "@/components/videos/pipeline-status";

interface Video {
  id: string;
  title: string;
  filename: string;
  status: string;
  duration_sec: number | null;
  error_message: string | null;
  created_at: string;
  instructor: string | null;
  instructional: string | null;
}

const POLL_INTERVAL = 5000; // 5 seconds

export default function VideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchVideos = useCallback(async () => {
    const response = await fetch("/api/videos");
    if (response.ok) {
      const data = await response.json();
      setVideos(data);
    }
    setLoading(false);
  }, []);

  // Poll when any video is in a non-terminal state
  useEffect(() => {
    const hasActiveVideos = videos.some(
      (v) => !isTerminalStatus(v.status) && v.status !== "uploaded"
    );

    if (hasActiveVideos && !pollRef.current) {
      pollRef.current = setInterval(fetchVideos, POLL_INTERVAL);
    } else if (!hasActiveVideos && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [videos, fetchVideos]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Videos</h1>
        <p className="text-muted-foreground mt-2">
          Upload and manage your BJJ instructional videos.
        </p>
      </div>

      <UploadForm onUploadComplete={fetchVideos} />

      <Separator className="my-6" />

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-4 animate-pulse">
              <div className="flex items-center justify-between mb-2">
                <div className="h-5 w-48 bg-muted rounded" />
                <div className="h-5 w-20 bg-muted rounded" />
              </div>
              <div className="h-4 w-64 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <VideoList videos={videos} onDelete={fetchVideos} onRefresh={fetchVideos} />
      )}
    </div>
  );
}
