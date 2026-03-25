"use client";

import { useState, useRef } from "react";
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

/**
 * Upload a file to Supabase Storage using the TUS resumable upload protocol.
 * Refreshes the access token before each chunk request to prevent expiry
 * errors on long-running uploads.
 */
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
      // Include storagePath in the fingerprint so retries with a new UUID
      // don't accidentally resume a previous upload under a different path.
      fingerprint: (file, options) =>
        Promise.resolve(
          `${storagePath}-${(file as File).size}-${(file as File).type}`
        ),
      metadata: {
        bucketName,
        objectName: storagePath,
        contentType: file.type,
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024, // 6MB — Supabase required chunk size
      onBeforeRequest: async (req) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          req.setHeader("Authorization", `Bearer ${session.access_token}`);
        }
      },
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => {
        const pct = Math.round((bytesUploaded / bytesTotal) * 100);
        onProgress(pct);
      },
      onSuccess: () => resolve(),
    });

    // Check for previous uploads to enable resume within the same storagePath
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });
  });
}

export function UploadForm({ onUploadComplete }: UploadFormProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [instructor, setInstructor] = useState("");
  const [instructional, setInstructional] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setProgress(null);
    setUploadPct(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Please select a video file.");
      return;
    }

    if (!file.type.startsWith("video/")) {
      setError("Only video files are accepted.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("File size exceeds 5GB limit.");
      return;
    }

    setUploading(true);

    // Step 1: Compute content hash
    setProgress("Computing file hash...");
    let contentHash: string;
    try {
      contentHash = await hashFile(file);
    } catch {
      setError("Failed to compute file hash.");
      setUploading(false);
      setProgress(null);
      return;
    }

    // Step 2: Check for duplicate
    setProgress("Checking for duplicates...");
    const dupResponse = await fetch("/api/videos/check-duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content_hash: contentHash }),
    });

    if (dupResponse.ok) {
      const dupData = await dupResponse.json();
      if (dupData.duplicate) {
        setError(
          `This video has already been uploaded as "${dupData.existing_title}".`
        );
        setUploading(false);
        setProgress(null);
        return;
      }
    }

    // Step 3: Upload to storage via TUS resumable protocol
    setProgress("Uploading...");
    setUploadPct(0);

    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError("You must be logged in to upload.");
      setUploading(false);
      setProgress(null);
      setUploadPct(null);
      return;
    }

    const fileId = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${session.user.id}/${fileId}_${safeName}`;

    try {
      await tusUpload(file, storagePath, supabase, (pct) => {
        setUploadPct(pct);
        setProgress(`Uploading... ${pct}%`);
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed unexpectedly.";
      setError(`Upload failed: ${message}`);
      setUploading(false);
      setProgress(null);
      setUploadPct(null);
      return;
    }

    // Step 4: Create database record
    setProgress("Saving video record...");
    setUploadPct(null);

    const response = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: file.name.replace(/\.[^/.]+$/, ""),
        filename: file.name,
        storage_path: storagePath,
        content_hash: contentHash,
        instructor: instructor.trim() || null,
        instructional: instructional.trim() || null,
      }),
    });

    if (!response.ok) {
      await supabase.storage.from("videos").remove([storagePath]);
      const data = await response.json();
      setError(data.error || "Failed to save video record.");
      setUploading(false);
      setProgress(null);
      return;
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setInstructor("");
    setInstructional("");
    setUploading(false);
    setProgress(null);
    setUploadPct(null);
    onUploadComplete();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="video-file">Video file</Label>
        <Input
          id="video-file"
          type="file"
          accept="video/*"
          ref={fileInputRef}
          disabled={uploading}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="instructor">Instructor</Label>
          <Input
            id="instructor"
            type="text"
            placeholder="e.g., John Danaher"
            value={instructor}
            onChange={(e) => setInstructor(e.target.value)}
            disabled={uploading}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="instructional">Instructional</Label>
          <Input
            id="instructional"
            type="text"
            placeholder="e.g., Enter the System"
            value={instructional}
            onChange={(e) => setInstructional(e.target.value)}
            disabled={uploading}
          />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {progress && (
        <p className="text-sm text-muted-foreground">{progress}</p>
      )}
      {uploadPct !== null && (
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${uploadPct}%` }}
          />
        </div>
      )}
      <Button type="submit" disabled={uploading}>
        {uploading ? "Uploading..." : "Upload video"}
      </Button>
    </form>
  );
}
