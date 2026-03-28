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
  instructor: string | null;
  instructional: string | null;
}

interface VideoListProps {
  videos: Video[];
  onDelete: () => void;
  onRefresh: () => void;
}

const MAX_VISIBLE = 5;

// Deterministic color from a string — maps to a fixed Tailwind palette
const BADGE_COLORS = [
  "bg-blue-100 text-blue-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-800",
  "bg-purple-100 text-purple-800",
  "bg-rose-100 text-rose-800",
  "bg-cyan-100 text-cyan-800",
  "bg-orange-100 text-orange-800",
  "bg-indigo-100 text-indigo-800",
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return BADGE_COLORS[Math.abs(hash) % BADGE_COLORS.length];
}

interface InstructionalGroup {
  instructional: string;
  videos: Video[];
}

interface InstructorGroup {
  instructor: string;
  color: string;
  instructionals: InstructionalGroup[];
}

function groupVideos(videos: Video[]): {
  groups: InstructorGroup[];
  ungrouped: Video[];
} {
  const ungrouped: Video[] = [];
  const instructorMap = new Map<string, Map<string, Video[]>>();

  for (const video of videos) {
    if (!video.instructor) {
      ungrouped.push(video);
      continue;
    }
    const instrName = video.instructor;
    const instrlName = video.instructional || "Uncategorized";

    if (!instructorMap.has(instrName)) {
      instructorMap.set(instrName, new Map());
    }
    const instrMap = instructorMap.get(instrName)!;
    if (!instrMap.has(instrlName)) {
      instrMap.set(instrlName, []);
    }
    instrMap.get(instrlName)!.push(video);
  }

  const groups: InstructorGroup[] = [];
  for (const [instructor, instrMap] of instructorMap) {
    const instructionals: InstructionalGroup[] = [];
    for (const [instructional, vids] of instrMap) {
      instructionals.push({ instructional, videos: vids });
    }
    groups.push({
      instructor,
      color: colorForName(instructor),
      instructionals,
    });
  }

  return { groups, ungrouped };
}

export function VideoList({ videos, onDelete, onRefresh }: VideoListProps) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

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

  async function handleIngest(video: Video) {
    setIngesting(video.id);

    const response = await fetch(`/api/ingest/${video.id}`, {
      method: "POST",
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data.error || "Failed to start ingestion.");
      setIngesting(null);
      return;
    }

    // Don't clear ingesting — keep the button disabled until the next
    // poll/refresh updates the video status to "transcribing", at which
    // point canIngest becomes false and the button hides entirely.
    onRefresh();
  }

  function renderVideoCard(video: Video) {
    const canIngest =
      video.status === "uploaded" || video.status === "error";

    return (
      <Card key={video.id}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{video.title}</CardTitle>
            <div className="flex items-center gap-3">
              <PipelineStatus
                status={video.status}
                errorMessage={video.error_message}
              />
              {canIngest && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => handleIngest(video)}
                  disabled={ingesting === video.id}
                >
                  {ingesting === video.id
                    ? "Starting..."
                    : video.status === "error"
                      ? "Retry"
                      : "Ingest"}
                </Button>
              )}
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
    );
  }

  function renderInstructionalGroup(
    group: InstructionalGroup,
    groupKey: string
  ) {
    const isExpanded = expanded.has(groupKey);
    const visibleVideos = isExpanded
      ? group.videos
      : group.videos.slice(0, MAX_VISIBLE);
    const hiddenCount = group.videos.length - MAX_VISIBLE;

    return (
      <div key={groupKey} className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          {group.instructional}
          <span className="ml-2 text-xs font-normal">
            ({group.videos.length} {group.videos.length === 1 ? "video" : "videos"})
          </span>
        </p>
        {visibleVideos.map(renderVideoCard)}
        {hiddenCount > 0 && (
          <button
            type="button"
            className="text-sm text-primary hover:underline text-left px-1"
            onClick={() => toggleExpand(groupKey)}
          >
            {isExpanded
              ? "Show less"
              : `Show ${hiddenCount} more...`}
          </button>
        )}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No videos uploaded yet. Upload your first BJJ instructional video to get
        started.
      </p>
    );
  }

  const { groups, ungrouped } = groupVideos(videos);

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.instructor} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${group.color}`}
            >
              {group.instructor}
            </span>
          </div>
          <div className="flex flex-col gap-4 pl-2">
            {group.instructionals.map((ig) =>
              renderInstructionalGroup(
                ig,
                `${group.instructor}::${ig.instructional}`
              )
            )}
          </div>
        </div>
      ))}
      {ungrouped.length > 0 && (
        <div className="flex flex-col gap-3">
          {groups.length > 0 && (
            <p className="text-sm font-medium text-muted-foreground">
              Ungrouped
            </p>
          )}
          <div className="flex flex-col gap-2">
            {ungrouped.map(renderVideoCard)}
          </div>
        </div>
      )}
    </div>
  );
}
