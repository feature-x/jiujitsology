"use client";

import { useState, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB

interface UploadFormProps {
  onUploadComplete: () => void;
}

export function UploadForm({ onUploadComplete }: UploadFormProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setProgress(null);

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
    setProgress("Uploading to storage...");

    const supabase = createBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be logged in to upload.");
      setUploading(false);
      setProgress(null);
      return;
    }

    // Upload directly to Supabase Storage from the browser
    const fileId = crypto.randomUUID();
    const storagePath = `videos/${user.id}/${fileId}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`);
      setUploading(false);
      setProgress(null);
      return;
    }

    // Create the database record via API
    setProgress("Saving video record...");

    const response = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: file.name.replace(/\.[^/.]+$/, ""),
        filename: file.name,
        storage_path: storagePath,
      }),
    });

    if (!response.ok) {
      // Clean up the uploaded file
      await supabase.storage.from("videos").remove([storagePath]);
      const data = await response.json();
      setError(data.error || "Failed to save video record.");
      setUploading(false);
      setProgress(null);
      return;
    }

    // Reset form and notify parent
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setUploading(false);
    setProgress(null);
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
      {error && <p className="text-sm text-destructive">{error}</p>}
      {progress && (
        <p className="text-sm text-muted-foreground">{progress}</p>
      )}
      <Button type="submit" disabled={uploading}>
        {uploading ? "Uploading..." : "Upload video"}
      </Button>
    </form>
  );
}
