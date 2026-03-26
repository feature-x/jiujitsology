# Product Roadmap

## Overview

JiuJitsology will launch as an MVP within 2-3 months, focused on delivering a knowledge graph-powered learning tool for BJJ instructional video libraries. The product is budget-constrained, hosted on Render with Supabase, and targets 10 active users in the first 3 months post-launch.

## Phase 1: MVP

- **Target**: May 2026
- **Goal**: Deliver core value — upload BJJ instructional videos, extract knowledge, and query it via natural language

### Features

| Feature | Priority | Status |
|---------|----------|--------|
| User authentication (Supabase Auth) | P0 | Backlog |
| Video upload and ingestion pipeline | P0 | Backlog |
| Ingestion pipeline status tracking | P0 | Backlog |
| Knowledge graph construction from transcriptions | P0 | Backlog |
| Knowledge graph visualization and navigation | P0 | Backlog |
| Natural language chat interface | P0 | Backlog |
| Operator-defined ontology for semantic guidance | P1 | Backlog |

### Success Criteria

- [ ] 10 monthly active users within 3 months of launch
- [ ] Users can upload a video and query its content via chat within minutes
- [ ] Knowledge graph accurately represents technique relationships from transcriptions

## Phase 2: Iteration

- **Target**: June-July 2026 (1-2 months post-launch)
- **Goal**: Improve knowledge quality and user experience based on feedback

### Features

| Feature | Priority | Status |
|---------|----------|--------|
| Improved transcription accuracy and correction tools | TBD | Backlog |
| Knowledge graph refinement based on user feedback | TBD | Backlog |
| Enhanced chat capabilities (follow-up questions, drill recommendations) | TBD | Backlog |
| Bulk video upload | TBD | Backlog |

### Success Criteria

- [ ] User retention — returning users query the system weekly
- [ ] Knowledge graph quality validated by domain practitioners

## Phase 3: Growth

- **Target**: August-November 2026 (3-6 months post-launch)
- **Goal**: Expand capabilities and grow user base

### Features

| Feature | Priority | Status |
|---------|----------|--------|
| Community-contributed ontology refinements | TBD | Backlog |
| Study plan generation from knowledge graph | TBD | Backlog |
| Integration with popular BJJ instructional platforms | TBD | Backlog |
| Mobile-responsive experience | TBD | Backlog |

## Milestone Definitions

| Milestone | Criteria | Target Date |
|-----------|----------|-------------|
| M1: MVP Launch | Core features live, first users onboarded | May 2026 |
| M2: Product-Market Fit | 10 MAU, weekly returning users | August 2026 |
| M3: Growth | Expanded feature set, growing user base | November 2026 |

## Constraints and Risks

| Risk | Phase | Mitigation |
|------|-------|------------|
| Transcription quality limits knowledge extraction | 1 | Evaluate transcription services early; budget for best option |
| Budget limits AI API costs at scale | 1-2 | Batch processing, caching, cost monitoring |
| Knowledge graph accuracy for BJJ domain | 1 | Operator-defined ontology provides semantic guardrails |
| Single developer velocity | 1 | Ruthless scope control; MVP features only |

## Dependencies

```text
Phase 1: MVP
    |
    v
Phase 2: Iteration (requires user feedback from Phase 1)
    |
    v
Phase 3: Growth (requires product-market fit from Phase 2)
```

## Revision History

| Date | Change | Author |
|------|--------|--------|
| 2026-03-21 | Initial roadmap creation | Teddy Kim |
