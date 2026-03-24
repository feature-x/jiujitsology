-- Add content_hash column for duplicate detection.
-- SHA-256 hash computed client-side before upload.
-- Nullable for existing rows that were uploaded before this feature.

ALTER TABLE videos ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Index for fast duplicate lookups scoped per user
CREATE INDEX IF NOT EXISTS idx_videos_user_hash ON videos(user_id, content_hash);
