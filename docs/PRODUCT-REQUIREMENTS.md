# Product Requirements Document

## Product Overview

- **Name**: JiuJitsology
- **Type**: Web application
- **Category**: B2C Consumer app
- **Domain**: A knowledge graph tool for organizing, searching, and summarizing BJJ instructional video libraries

## Vision and Problem Statement

### Problem

BJJ practitioners invest thousands of dollars in instructional videos but struggle to retrieve specific information when they need it. Finding answers requires manually searching through DVD indexes, loading discs, or clicking around instructional sites — a painful, time-consuming process that creates friction in a learning domain that already carries enormous cognitive load. Most instructional content is padded with irrelevant preamble that doesn't directly answer the learner's question.

### Vision

Make existing investments in BJJ instructional videos dramatically more valuable by extracting their knowledge into a structured graph that can be queried and reasoned over using natural language.

### How People Solve This Today

They don't — they just live with the pain. There is no tool that extracts structured knowledge from BJJ instructional video libraries. Users either rewatch entire videos to find specific techniques or rely on memory.

## Target Audience

### Primary Users

- **Who**: A BJJ student with a substantial investment in instructional videos who wants to get more value from their purchases
- **Pain Point**: Having to invest huge amounts of time watching instructional videos, most of which contain irrelevant preamble that doesn't directly answer their question
- **Current Solution**: Manual browsing, rewatching, and relying on memory

### Secondary Users

None — single user type

## Features

### MVP (Must Have)

- [ ] User authentication (email/password login)
- [ ] Video upload for system ingestion (transcription extraction)
- [ ] Ingestion pipeline status tracking (progress visibility per video)
- [ ] Knowledge graph construction from ingested transcription data
- [ ] Knowledge graph visualization and interactive navigation
- [ ] Natural language chat interface to interrogate the knowledge graph
- [ ] Operator-defined ontology for semantic guidance to the system

### Out of Scope (v1)

- Video playback or display within the application
- Multi-modal AI processing (transcriptions only, no visual analysis)

### Core Value Proposition

Organize BJJ instructional data in a knowledge graph that agents can reliably traverse for knowledge retrieval and reasoning tasks.

## Success Metrics

| Metric | Target (3 months) |
|--------|-------------------|
| Primary: Monthly active users | 10 |

## Competitive Analysis

| Competitor | Strength | Weakness | Your Differentiator |
|-----------|----------|----------|---------------------|
| BJJ Fanatics | Massive content library, well-known brand | Focused on selling more content, no knowledge extraction or search beyond basic navigation | Extracts more value from existing purchases instead of pushing users to buy more |

## Constraints and Requirements

- **Timeline**: 2-3 months to launch
- **Budget**: Limited resources
- **Technical**: Must use Render (hosting) and Supabase (database/auth)

## Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Security | Supabase Auth, user data isolation |
| Performance | Chat responses within reasonable latency for conversational UX |
| Scalability | Support 10 concurrent users initially |
| Accessibility | Standard web accessibility practices |

## Dependencies

- Supabase (authentication, database, storage)
- Render (application hosting)
- Speech-to-text transcription service (for video ingestion)
- LLM provider (for natural language chat and knowledge extraction)
- Graph database or graph layer (for knowledge graph storage and traversal)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Transcription quality varies across video sources | High | Evaluate multiple transcription services; allow manual correction |
| Knowledge graph extraction accuracy from unstructured transcripts | High | Operator-defined ontology provides semantic guardrails; iterative refinement |
| Budget constraints limit AI API usage at scale | Medium | Batch processing, caching, and rate limiting to control costs |
| Copyright concerns around video content processing | Medium | System processes user-owned content only; no redistribution of source material |

## Glossary

| Term | Definition |
|------|------------|
| BJJ | Brazilian Jiu-Jitsu, a martial art focused on grappling and ground fighting |
| Instructional | A video course teaching BJJ techniques, typically sold as DVD sets or digital downloads |
| Knowledge Graph | A structured representation of concepts and their relationships extracted from video transcriptions |
| Ontology | A formal definition of categories, properties, and relationships that guides how the system organizes BJJ knowledge |
| Ingestion | The process of uploading a video, extracting its transcription, and incorporating the knowledge into the graph |
