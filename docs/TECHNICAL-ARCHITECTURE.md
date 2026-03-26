# Technical Architecture

## Overview

JiuJitsology is a Next.js web application that ingests BJJ instructional videos, extracts transcriptions, builds a knowledge graph from the extracted content, and exposes that graph through an interactive visualization and natural language chat interface. The system is deployed on Render with Supabase as the primary database and auth provider.

## Technology Stack

### Frontend

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript 5.x
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS
- **Graph Visualization**: Cytoscape.js (via react-cytoscapejs)
- **Chat UI**: Vercel AI SDK (useChat hook)
- **Testing**: Vitest + React Testing Library

### Backend

- **Runtime**: Node.js 20+
- **Framework**: Next.js API Routes (App Router)
- **Language**: TypeScript
- **AI SDK**: Vercel AI SDK (supports OpenAI, Anthropic, others)
- **Graph Operations**: graphology (in-memory graph traversal)
- **Testing**: Vitest

### Database

- **Primary**: Supabase (PostgreSQL + pgvector)
  - User data, video metadata, ingestion state
  - Knowledge graph storage (nodes + edges tables)
  - Ontology definitions
  - Embedding vectors for semantic search (chunks table with pgvector)
  - Row-level security for user data isolation
- **Auth**: Supabase Auth (magic link)
- **Storage**: Supabase Storage (video file uploads)

### External Services

- **Transcription**: OpenAI Whisper API ($0.006/min)
- **Embeddings**: OpenAI Embeddings API (text-embedding-3-small, 1536 dimensions, ~$0.02/1M tokens)
- **LLM**: Vercel AI SDK with configurable provider (start with OpenAI GPT-4o or Anthropic Claude)
- **Error Tracking**: Sentry (self-receiver pattern, already configured)

### Infrastructure

- **Hosting**: Render (free tier, standalone Next.js output)
- **CI/CD**: GitHub Actions (existing workflows)
- **Monitoring**: Sentry (error tracking via self-receiver)

## System Design

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                        Frontend                          │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Auth UI  │  │  Upload &    │  │  Graph Explorer   │  │
│  │  (login)  │  │  Pipeline    │  │  (Cytoscape.js)   │  │
│  └──────────┘  │  Status      │  └───────────────────┘  │
│                └──────────────┘                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Chat Interface                       │   │
│  │              (Vercel AI SDK useChat)              │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   API Routes                             │
│                                                          │
│  /api/auth/*        Supabase Auth helpers                │
│  /api/videos        Upload, list, delete videos          │
│  /api/ingest        Trigger & monitor ingestion          │
│  /api/graph         Query knowledge graph                │
│  /api/chat          Natural language chat (streaming)    │
│  /api/ontology      CRUD ontology definitions            │
│  /api/health        Health check                         │
│  /api/error-events  Sentry self-receiver                 │
└──────────────────────┬──────────────────────────────────┘
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
        ┌──────┐ ┌──────────┐ ┌──────────┐
        │Supa- │ │ OpenAI   │ │ Vercel   │
        │base  │ │ Whisper  │ │ AI SDK   │
        │      │ │ API      │ │ (LLM)   │
        │- DB  │ └──────────┘ └──────────┘
        │- Auth│
        │- Stor│
        └──────┘
```

### Data Flow

#### Video Ingestion Pipeline

```
1. User uploads video file
   └─→ Supabase Storage (file stored)
   └─→ videos table (metadata record, status: "uploaded")

2. Ingestion triggered (async)
   └─→ Status: "transcribing"
   └─→ OpenAI Whisper API (audio → text)
   └─→ transcriptions table (raw text stored)
   └─→ Status: "embedding"

3. Chunk & embed transcription
   └─→ Split transcription into chunks (by segment boundaries)
   └─→ OpenAI Embeddings API (text → vectors)
   └─→ chunks table (text + embedding + timestamps stored)
   └─→ Status: "extracting"

4. Knowledge extraction
   └─→ LLM processes transcription against ontology
   └─→ Extracts entities (techniques, positions, concepts)
   └─→ Extracts relationships (transitions, variants, prerequisites)
   └─→ Writes to nodes + edges tables
   └─→ Status: "complete"
```

#### Chat Query Flow (Hybrid: RAG + Knowledge Graph)

```
1. User sends natural language question
2. Embed the question via OpenAI Embeddings API
3. Vector similarity search against chunks table (pgvector) → retrieve relevant passages
4. Load relevant subgraph from nodes/edges into graphology
5. Ontology definitions loaded as context
6. LLM receives: question + relevant chunks (RAG) + graph context + ontology
7. LLM reasons over both structured graph AND raw instructor commentary
8. Response streamed back to user via Vercel AI SDK
```

### API Design

All APIs are Next.js App Router route handlers. REST patterns with JSON payloads.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/callback` | GET | Supabase Auth OAuth callback |
| `/api/videos` | GET | List user's videos |
| `/api/videos` | POST | Upload video (multipart) |
| `/api/videos/[id]` | GET | Video details + status |
| `/api/videos/[id]` | DELETE | Remove video and associated data |
| `/api/ingest/[videoId]` | POST | Trigger ingestion pipeline |
| `/api/ingest/[videoId]/status` | GET | Pipeline progress |
| `/api/graph` | GET | Query knowledge graph (with filters) |
| `/api/graph/nodes` | GET | List nodes (paginated, filtered) |
| `/api/graph/edges` | GET | List edges (by node neighborhood) |
| `/api/search` | POST | Semantic search against chunks (pgvector) |
| `/api/chat` | POST | Streaming chat (Vercel AI SDK) |
| `/api/ontology` | GET | List ontology definitions |
| `/api/ontology` | POST | Create/update ontology |
| `/api/health` | GET | Health check |

## Data Models

### Core Entities

```
┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│    User      │     │    Video      │     │ Transcription│
│              │1───*│               │1───1│              │
│ id           │     │ id            │     │ id           │
│ email        │     │ user_id (FK)  │     │ video_id(FK) │
│ created_at   │     │ title         │     │ text         │
└──────────────┘     │ filename      │     │ segments[]   │
                     │ storage_path  │     │ created_at   │
                     │ status        │     └──────────────┘
                     │ duration_sec  │
                     │ created_at    │
                     └───────────────┘

┌──────────────┐     ┌───────────────┐
│    Node      │     │    Edge       │
│              │     │               │
│ id           │     │ id            │
│ user_id (FK) │     │ user_id (FK)  │
│ type         │◄────│ source_id(FK) │
│ label        │◄────│ target_id(FK) │
│ properties   │     │ relationship  │
│ source_video │     │ properties    │
│ created_at   │     │ source_video  │
└──────────────┘     │ created_at    │
                     └───────────────┘

┌──────────────────┐
│    Chunk         │
│                  │
│ id               │
│ user_id (FK)     │
│ video_id (FK)    │
│ transcription_id │
│ content          │  (text passage)
│ start_time       │  (float, seconds)
│ end_time         │  (float, seconds)
│ embedding        │  (vector(1536))
│ created_at       │
└──────────────────┘

┌──────────────────┐
│  OntologyEntry   │
│                  │
│ id               │
│ category         │  (e.g., "node_type", "edge_type")
│ name             │  (e.g., "Technique", "TRANSITIONS_TO")
│ description      │
│ properties_schema│  (JSON Schema for allowed properties)
│ created_at       │
│ updated_at       │
└──────────────────┘
```

### Database Schema

```sql
-- Managed by Supabase Auth
-- auth.users (built-in)

CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded',
  -- status: uploaded | transcribing | extracting | complete | error
  duration_sec INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  segments JSONB, -- [{start: 0, end: 5.2, text: "..."}, ...]
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  type TEXT NOT NULL,        -- from ontology (Technique, Position, etc.)
  label TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  source_video_id UUID REFERENCES videos(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  source_id UUID REFERENCES nodes(id) ON DELETE CASCADE NOT NULL,
  target_id UUID REFERENCES nodes(id) ON DELETE CASCADE NOT NULL,
  relationship TEXT NOT NULL, -- from ontology (TRANSITIONS_TO, etc.)
  properties JSONB DEFAULT '{}',
  source_video_id UUID REFERENCES videos(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

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

CREATE TABLE ontology_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,    -- 'node_type' or 'edge_type'
  name TEXT NOT NULL,
  description TEXT,
  properties_schema JSONB,   -- JSON Schema for valid properties
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category, name)
);

-- Row Level Security
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own videos"
  ON videos FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own transcriptions"
  ON transcriptions FOR ALL
  USING (video_id IN (SELECT id FROM videos WHERE user_id = auth.uid()));

CREATE POLICY "Users see own chunks"
  ON chunks FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own nodes"
  ON nodes FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own edges"
  ON edges FOR ALL USING (auth.uid() = user_id);

-- ontology_entries is readable by all authenticated users
-- writable by operators (managed via Supabase dashboard or admin API)

-- Indexes
CREATE INDEX idx_nodes_user_type ON nodes(user_id, type);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_videos_user_status ON videos(user_id, status);
CREATE INDEX idx_chunks_user ON chunks(user_id);
CREATE INDEX idx_chunks_video ON chunks(video_id);
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops);
```

### Ontology — Default BJJ Seed Data

The system ships with a default BJJ ontology that operators can customize:

**Node Types:**

| Type | Description | Example Properties |
|------|-------------|-------------------|
| Technique | A specific BJJ technique | belt_level, gi/nogi |
| Position | A control position | top/bottom, dominant/neutral |
| Concept | A principle or strategy | category |
| Submission | A finishing technique | joint/choke |
| Sweep | A reversal from bottom | direction |
| Guard | A specific guard type | open/closed |
| Pass | A guard passing technique | pressure/speed |
| Pin | Restrains an opponent's upper body | gi/nogi |
| Takedown | Grounds a standing opponent | style |
| Instructor | A BJJ instructor/coach | lineage |
| Instructional | A video course | publisher, year |

**Edge Types:**

| Relationship | Description | Example |
|-------------|-------------|---------|
| TRANSITIONS_TO | Movement from one position/technique to another | Closed Guard → Armbar |
| STARTS_FROM | Technique begins from this position | Armbar STARTS_FROM Closed Guard |
| IS_VARIANT_OF | Alternative version of a technique | No-gi armbar IS_VARIANT_OF Armbar |
| COUNTERS | Defensive response to a technique | Posture up COUNTERS Closed Guard |
| REQUIRES | Prerequisite concept/position | Berimbolo REQUIRES Inverted Guard |
| TAUGHT_BY | Instructor teaches this technique | Armbar TAUGHT_BY John Danaher |
| APPEARS_IN | Technique covered in this instructional | Armbar APPEARS_IN "Enter the System" |
| CHAINS_TO | Common follow-up in a sequence | Armbar CHAINS_TO Triangle |

## Development Standards

### Code Style

- TypeScript strict mode (already configured)
- ESLint with Next.js config (already configured)
- Prettier for formatting
- Path aliases: `@/*` maps to project root

### Naming Conventions

- Files: kebab-case (`graph-explorer.tsx`)
- Components: PascalCase (`GraphExplorer`)
- Functions/variables: camelCase (`loadSubgraph`)
- Database columns: snake_case (`user_id`)
- API routes: kebab-case (`/api/error-events`)

### Testing Requirements

- Unit tests for graph operations and data transformations
- Integration tests for API routes
- Component tests for key UI interactions (upload, chat)
- Minimum: every API route has at least one test
- Framework: Vitest + React Testing Library (already configured)

### Documentation

- API routes: JSDoc comments on route handlers
- Complex logic: inline comments explaining "why"
- No auto-generated docs in v1

### Code Review

- All changes via PR
- Tests must pass
- No lint errors
- Type-safe (no `any` without justification)

## Security

### Authentication

- Supabase Auth with magic link (email OTP)
- Cookie-based sessions managed by @supabase/ssr
- Middleware protects all routes except auth pages and health check

### Authorization

- Row-Level Security (RLS) on all user-owned tables
- Users can only access their own data
- Ontology is readable by all authenticated users
- Ontology management is operator-only (via Supabase dashboard or admin role)

### Data Protection

- Videos stored in Supabase Storage with per-user bucket policies
- No PII beyond email address
- Transcriptions are derived from user-owned content
- No content redistribution

## Scalability

### Current Targets

- 10 concurrent users
- ~100 videos per user (tens of thousands of graph nodes per user)
- Graph subgraphs loaded into memory per request

### Scaling Strategy

- **Phase 1 (MVP)**: Single Render instance, Supabase free/pro tier
- **Phase 2**: If graph queries become bottleneck, migrate graph layer to Neo4j AuraDB (free tier: 200K nodes). Data model maps directly — swap query layer only.
- **Phase 3**: If ingestion volume grows, move pipeline to background workers (Render background workers or BullMQ)

## Architecture Decision Records

### ADR-001: Supabase Tables for Knowledge Graph (not Neo4j)

- **Status**: Accepted
- **Context**: The product's core is a knowledge graph. Neo4j is the industry standard for graph databases, but adds infrastructure cost and complexity. At MVP scale (10 users, ~100 videos each), the graph per user is small enough to load into memory.
- **Decision**: Store graph as nodes/edges tables in Supabase PostgreSQL. Use graphology (JS library) for in-memory traversal. Migrate to Neo4j if/when scale demands it.
- **Consequences**: Simpler infrastructure, zero additional cost. Graph query complexity is handled in application code. Migration path to Neo4j is clean because the data model is identical.

### ADR-002: OpenAI Whisper API for Transcription

- **Status**: Accepted
- **Context**: Need accurate speech-to-text for BJJ instructional videos with domain-specific terminology (guard, kimura, berimbolo). Self-hosted Whisper requires GPU compute. Deepgram is cheaper but less accurate on niche vocabulary.
- **Decision**: Use OpenAI Whisper API. Cost: ~$1.44 per 4-hour instructional.
- **Consequences**: Per-video cost is manageable at MVP scale. Best accuracy for domain terminology. External API dependency.

### ADR-003: Vercel AI SDK for LLM Abstraction

- **Status**: Accepted
- **Context**: Need LLM for chat interface and knowledge extraction. Want flexibility to switch providers (OpenAI, Anthropic) without rewriting code.
- **Decision**: Use Vercel AI SDK. Provider-agnostic, native Next.js streaming support, built-in useChat React hook.
- **Consequences**: Thin abstraction layer. Can start with any provider and switch easily. Streaming chat works out of the box.

### ADR-004: Cytoscape.js for Graph Visualization

- **Status**: Accepted
- **Context**: Need interactive graph visualization for knowledge exploration. Options ranged from React Flow (structured layouts) to D3 (maximum customization) to Sigma.js (WebGL performance).
- **Decision**: Use Cytoscape.js via react-cytoscapejs. Purpose-built for network/graph visualization with built-in layout algorithms and graph analysis.
- **Consequences**: Rich graph exploration UX. Many layout options for different views of the knowledge graph. Mature ecosystem with plugins.

### ADR-005: In-Memory Graph Operations via graphology

- **Status**: Accepted
- **Context**: Need to perform graph traversal, pathfinding, and analysis for chat queries and visualization. With graph data in PostgreSQL, need an application-layer graph library.
- **Decision**: Use graphology for in-memory graph operations. Load relevant subgraphs from Supabase per request.
- **Consequences**: BFS, DFS, shortest path, neighborhood queries available out of the box. Per-request memory usage scales with subgraph size — acceptable at MVP scale.

### ADR-006: Hybrid RAG + Knowledge Graph for Chat (pgvector Embeddings)

- **Status**: Accepted
- **Context**: The knowledge graph captures structured relationships (technique → position, counters, chains) but loses the raw instructor commentary — the "why", teaching cues, and contextual explanation. Semantic queries like "what does Danaher say about grip fighting philosophy?" can't be answered from the graph alone.
- **Decision**: Add an embedding pipeline using OpenAI text-embedding-3-small (1536 dimensions) stored in Supabase via pgvector. Chat queries use both vector similarity search (RAG for relevant passages) and graph traversal (structured relationships). The LLM receives both as context.
- **Consequences**: Richer answers that combine structured technique relationships with raw instructor commentary. Minimal additional cost (~$0.02/1M tokens for embeddings). Requires a `chunks` table and an embedding step in the ingestion pipeline. pgvector is native to Supabase PostgreSQL — no additional infrastructure.
