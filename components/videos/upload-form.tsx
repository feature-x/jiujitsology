"use client";

import { useState, useRef, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as tus from "tus-js-client";
import { createBrowserClient } from "@/lib/supabase/client";
import { hashFile } from "@/lib/hash";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

interface UploadFormProps {
  onUploadComplete: () => void;
}

type FileStatus = "pending" | "hashing" | "checking" | "uploading" | "saving" | "complete" | "duplicate" | "error";

interface QueuedFile {
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  duplicateTitle?: string;
}

function tusUpload(
  file: File,
  storagePath: string,
  supabase: SupabaseClient,
  onProgress: (pct: number) => void
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const bucketName = "videos";

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: (file) =>
        Promise.resolve(
          `${storagePath}-${(file as File).size}-${(file as File).type}`
        ),
      metadata: {
        bucketName,
        objectName: storagePath,
        contentType: file.type,
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024,
      onBeforeRequest: async (req) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          req.setHeader("Authorization", `Bearer ${session.access_token}`);
        }
      },
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess: () => resolve(),
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });
  });
}

export function UploadForm({ onUploadComplete }: UploadFormProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instructor, setInstructor] = useState("");
  const [instructional, setInstructional] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateFile = useCallback((index: number, updates: Partial<QueuedFile>) => {
    setQueue((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  }, []);

  function addFiles(files: FileList | File[]) {
    const newFiles: QueuedFile[] = Array.from(files)
      .filter((f) => f.type.startsWith("video/"))
      .filter((f) => f.size <= MAX_FILE_SIZE)
      .map((file) => ({ file, status: "pending" as FileStatus, progress: 0 }));

    if (newFiles.length === 0) {
      setError("No valid video files selected. Only video files under 5GB are accepted.");
      return;
    }

    setError(null);
    setQueue((prev) => [...prev, ...newFiles]);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  }

  function removeFile(index: number) {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }

  async function processQueue() {
    if (!instructor.trim()) {
      setError("Instructor is required.");
      return;
    }
    if (!instructional.trim()) {
      setError("Instructional is required.");
      return;
    }
    if (queue.length === 0) {
      setError("No files to upload.");
      return;
    }

    setError(null);
    setUploading(true);

    const supabase = createBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      setError("You must be logged in to upload.");
      setUploading(false);
      return;
    }

    for (let i = 0; i < queue.length; i++) {
      const qf = queue[i];
      if (qf.status === "complete" || qf.status === "duplicate") continue;

      try {
        // Hash
        updateFile(i, { status: "hashing", progress: 0 });
        const contentHash = await hashFile(qf.file);

        // Duplicate check
        updateFile(i, { status: "checking" });
        const dupResponse = await fetch("/api/videos/check-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content_hash: contentHash }),
        });

        if (dupResponse.ok) {
          const dupData = await dupResponse.json();
          if (dupData.duplicate) {
            updateFile(i, {
              status: "duplicate",
              duplicateTitle: dupData.existing_title,
            });
            continue;
          }
        }

        // Upload
        updateFile(i, { status: "uploading", progress: 0 });
        const fileId = crypto.randomUUID();
        const safeName = qf.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${session.user.id}/${fileId}_${safeName}`;

        await tusUpload(qf.file, storagePath, supabase, (pct) => {
          updateFile(i, { progress: pct });
        });

        // Save record
        updateFile(i, { status: "saving" });
        const response = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: qf.file.name.replace(/\.[^/.]+$/, ""),
            filename: qf.file.name,
            storage_path: storagePath,
            content_hash: contentHash,
            instructor: instructor.trim(),
            instructional: instructional.trim(),
          }),
        });

        if (!response.ok) {
          await supabase.storage.from("videos").remove([storagePath]);
          const data = await response.json();
          throw new Error(data.error || "Failed to save video record.");
        }

        // Auto-start ingestion (returns 202 immediately, pipeline runs async)
        const videoData = await response.json();
        if (videoData?.id) {
          fetch(`/api/ingest/${videoData.id}`, { method: "POST" }).catch(() => {});
        }

        updateFile(i, { status: "complete", progress: 100 });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed.";
        updateFile(i, { status: "error", error: message });
      }
    }

    setUploading(false);
    onUploadComplete();
  }

  const completedCount = queue.filter((f) => f.status === "complete").length;
  const totalCount = queue.length;
  const hasFiles = queue.length > 0;
  const pendingFiles = queue.filter((f) => f.status === "pending" || f.status === "error");

  return (
    <div className="flex flex-col gap-3">
      {/* Metadata fields */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="instructor">Instructor <span className="text-destructive">*</span></Label>
          <Input
            id="instructor"
            type="text"
            placeholder="e.g., John Danaher"
            value={instructor}
            onChange={(e) => setInstructor(e.target.value)}
            disabled={uploading}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="instructional">Instructional <span className="text-destructive">*</span></Label>
          <Input
            id="instructional"
            type="text"
            placeholder="e.g., Enter the System"
            value={instructional}
            onChange={(e) => setInstructional(e.target.value)}
            disabled={uploading}
            required
          />
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50"
        } ${uploading ? "pointer-events-none opacity-50" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          disabled={uploading}
        />
        <p className="text-sm text-muted-foreground">
          {dragOver
            ? "Drop video files here"
            : "Drag & drop video files here, or click to select"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Multiple files supported. Max 5GB per file.
        </p>
      </div>

      {/* Batch banner */}
      {hasFiles && instructor.trim() && instructional.trim() && (
        <p className="text-xs text-muted-foreground">
          Uploading {totalCount} {totalCount === 1 ? "video" : "videos"} as{" "}
          <span className="font-medium text-foreground">{instructor.trim()}</span> —{" "}
          <span className="font-medium text-foreground">{instructional.trim()}</span>
        </p>
      )}

      {/* File queue */}
      {hasFiles && (
        <div className="flex flex-col gap-1.5">
          {queue.map((qf, i) => (
            <div
              key={`${qf.file.name}-${i}`}
              className="flex items-center gap-2 text-xs border rounded px-2 py-1.5"
            >
              <span className="flex-1 truncate">{qf.file.name}</span>
              {qf.status === "pending" && !uploading && (
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeFile(i)}
                >
                  Remove
                </button>
              )}
              {qf.status === "pending" && uploading && (
                <span className="text-muted-foreground">Waiting...</span>
              )}
              {qf.status === "hashing" && (
                <span className="text-muted-foreground">Hashing...</span>
              )}
              {qf.status === "checking" && (
                <span className="text-muted-foreground">Checking...</span>
              )}
              {qf.status === "uploading" && (
                <span className="text-muted-foreground">{qf.progress}%</span>
              )}
              {qf.status === "saving" && (
                <span className="text-muted-foreground">Saving...</span>
              )}
              {qf.status === "complete" && (
                <span className="text-emerald-600">Done</span>
              )}
              {qf.status === "duplicate" && (
                <span className="text-amber-600" title={`Already uploaded as "${qf.duplicateTitle}"`}>
                  Duplicate
                </span>
              )}
              {qf.status === "error" && (
                <span className="text-destructive" title={qf.error}>
                  Error
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Overall progress */}
      {uploading && (
        <p className="text-sm text-muted-foreground">
          {completedCount}/{totalCount} complete
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="button"
        disabled={uploading || !hasFiles || pendingFiles.length === 0}
        onClick={processQueue}
      >
        {uploading
          ? `Uploading... (${completedCount}/${totalCount})`
          : hasFiles
            ? `Upload ${pendingFiles.length} ${pendingFiles.length === 1 ? "video" : "videos"}`
            : "Upload video"}
      </Button>
    </div>
  );
}
