-- Enable pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Chunks table: stores transcription text chunks with embeddings
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
  transcription_id UUID REFERENCES transcriptions(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  start_time FLOAT,
  end_time FLOAT,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chunks"
  ON chunks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_chunks_user ON chunks(user_id);
CREATE INDEX idx_chunks_video ON chunks(video_id);

-- Vector similarity search function for use with supabase.rpc()
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 10,
  filter_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  video_id UUID,
  content TEXT,
  start_time FLOAT,
  end_time FLOAT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.video_id,
    c.content,
    c.start_time,
    c.end_time,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM chunks c
  WHERE c.user_id = filter_user_id
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
