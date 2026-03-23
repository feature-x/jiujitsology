-- Default BJJ Ontology Seed Data
-- 9 node types + 8 edge types = 17 entries
-- Matches TECHNICAL-ARCHITECTURE.md ontology specification

INSERT INTO ontology_entries (category, name, description, properties_schema) VALUES
  -- Node Types
  ('node_type', 'Technique', 'A specific BJJ technique', '{"belt_level": "string", "gi_nogi": "string"}'),
  ('node_type', 'Position', 'A control position', '{"top_bottom": "string", "dominance": "string"}'),
  ('node_type', 'Concept', 'A principle or strategy', '{"category": "string"}'),
  ('node_type', 'Submission', 'A finishing technique', '{"type": "string"}'),
  ('node_type', 'Sweep', 'A reversal from bottom', '{"direction": "string"}'),
  ('node_type', 'Guard', 'A specific guard type', '{"open_closed": "string"}'),
  ('node_type', 'Pass', 'A guard passing technique', '{"style": "string"}'),
  ('node_type', 'Instructor', 'A BJJ instructor or coach', '{"lineage": "string"}'),
  ('node_type', 'Instructional', 'A video course', '{"publisher": "string", "year": "integer"}'),
  -- Edge Types
  ('edge_type', 'TRANSITIONS_TO', 'Movement from one position/technique to another', null),
  ('edge_type', 'STARTS_FROM', 'Technique begins from this position', null),
  ('edge_type', 'IS_VARIANT_OF', 'Alternative version of a technique', null),
  ('edge_type', 'COUNTERS', 'Defensive response to a technique', null),
  ('edge_type', 'REQUIRES', 'Prerequisite concept or position', null),
  ('edge_type', 'TAUGHT_BY', 'Instructor teaches this technique', null),
  ('edge_type', 'APPEARS_IN', 'Technique covered in this instructional', null),
  ('edge_type', 'CHAINS_TO', 'Common follow-up in a sequence', null)
ON CONFLICT (category, name) DO NOTHING;
