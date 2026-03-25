-- Add instructor and instructional metadata to videos table.
-- Users tag these at upload time so the extraction pipeline can
-- create reliable Instructor/Instructional nodes and edges.

ALTER TABLE videos ADD COLUMN IF NOT EXISTS instructor TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS instructional TEXT;
