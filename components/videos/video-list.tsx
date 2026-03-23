"use client";

import { useState } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PipelineStatus } from "@/components/videos/pipeline-status";

interface Video {
  id: string;
  title: string;
  filename: string;
  status: string;
  duration_sec: number | null;
  error_message: string | null;
  created_at: string;
}

interface VideoListProps {
  videos: Video[];
  onDelete: () => void;
}

export function VideoList({ videos, onDelete }: VideoListProps) {
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(video: Video) {
    const confirmed = window.confirm(
      `Delete '${video.title}'? This will remove the video and all associated data (transcriptions, knowledge graph entries). This cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting(video.id);

    const response = await fetch(`/api/videos/${video.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data.error || "Failed to delete video.");
    }

    setDeleting(null);
    onDelete();
  }

  if (videos.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No videos uploaded yet. Upload your first BJJ instructional video to get
        started.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {videos.map((video) => (
        <Card key={video.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{video.title}</CardTitle>
              <div className="flex items-center gap-3">
                <PipelineStatus
                  status={video.status}
                  errorMessage={video.error_message}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive h-7 px-2"
                  onClick={() => handleDelete(video)}
                  disabled={deleting === video.id}
                >
                  {deleting === video.id ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
            <CardDescription>{video.filename}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
