-- Jiujitsology Initial Schema
-- Creates all core tables, RLS policies, and indexes.

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded',
  duration_sec INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN videos.status IS 'uploaded | transcribing | extracting | complete | error';

CREATE TABLE transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  segments JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN transcriptions.segments IS 'Array of {start, end, text} timestamped segments';

CREATE TABLE nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  source_video_id UUID REFERENCES videos(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN nodes.type IS 'From ontology: Technique, Position, Guard, Submission, etc.';

CREATE TABLE edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  source_id UUID REFERENCES nodes(id) ON DELETE CASCADE NOT NULL,
  target_id UUID REFERENCES nodes(id) ON DELETE CASCADE NOT NULL,
  relationship TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  source_video_id UUID REFERENCES videos(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN edges.relationship IS 'From ontology: TRANSITIONS_TO, STARTS_FROM, IS_VARIANT_OF, etc.';

CREATE TABLE ontology_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  properties_schema JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category, name)
);

COMMENT ON COLUMN ontology_entries.category IS 'node_type or edge_type';
COMMENT ON COLUMN ontology_entries.properties_schema IS 'JSON Schema for valid properties on this type';

-- =============================================================================
-- Row Level Security
-- =============================================================================

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE ontology_entries ENABLE ROW LEVEL SECURITY;

-- Videos: users see only their own
CREATE POLICY "Users manage own videos"
  ON videos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Transcriptions: users see transcriptions for their own videos
CREATE POLICY "Users see own transcriptions"
  ON transcriptions FOR ALL
  USING (video_id IN (SELECT id FROM videos WHERE user_id = auth.uid()))
  WITH CHECK (video_id IN (SELECT id FROM videos WHERE user_id = auth.uid()));

-- Nodes: users see only their own
CREATE POLICY "Users manage own nodes"
  ON nodes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Edges: users see only their own
CREATE POLICY "Users manage own edges"
  ON edges FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Ontology: readable by all authenticated users, not writable via RLS
CREATE POLICY "Authenticated users can read ontology"
  ON ontology_entries FOR SELECT
  USING (auth.role() = 'authenticated');

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_nodes_user_type ON nodes(user_id, type);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_videos_user_status ON videos(user_id, status);
