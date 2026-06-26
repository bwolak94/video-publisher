# AI Video Factory

> Distributed SaaS platform for end-to-end autonomous video content production and multi-platform publishing — from trend research through AI-driven scriptwriting, voice synthesis, visual asset generation, programmatic rendering, to direct YouTube publishing.

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Service Decomposition](#service-decomposition)
4. [Agent Pipeline](#agent-pipeline)
5. [Data Flow](#data-flow)
6. [Technology Stack](#technology-stack)
7. [Key Design Decisions](#key-design-decisions)
8. [Database Schema](#database-schema)
9. [API Reference](#api-reference)
10. [Security Model](#security-model)
11. [Observability](#observability)
12. [Project Structure](#project-structure)
13. [Getting Started](#getting-started)
14. [Performance Characteristics](#performance-characteristics)

---

## Overview

AI Video Factory operates in two primary modes:

| Mode | Description | Human Involvement |
|---|---|---|
| **Worker Mode** | Fully autonomous Shorts generator — monitors 100+ news sources, scores virality, selects topics, produces and publishes without human input | None |
| **Creator Mode** | Interactive long-form creator — user defines topic via chat, reviews AI-generated outline and storyboard, edits scenes in a timeline editor | Human-in-the-loop |

### Success Metrics

| Metric | Target |
|---|---|
| Shorts production time (research to published) | < 15 minutes |
| Long-form (15 min video) render time | < 30 minutes |
| API cost per Short | < $0.50 |
| ElevenLabs cache hit rate | > 70% |
| System uptime (worker mode) | 99.5% |

---

## System Architecture

The platform is built on an **Event-Driven Architecture (EDA)** with polyglot microservices. Each service owns its domain with no shared database. Services communicate exclusively through BullMQ job queues, preventing tight coupling and enabling independent horizontal scaling.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                 CLIENT LAYER                                     │
│                     React 18 + TypeScript + Tailwind CSS                         │
│          Chat UI (Creator Mode)  |  Timeline Editor  |  Dashboard                │
│                         Zustand State  |  Socket.IO Client                       │
└───────────────────────────────────┬──────────────────────────────────────────────┘
                                    │ REST + WebSocket (Socket.IO)
┌───────────────────────────────────▼──────────────────────────────────────────────┐
│                              CORE BACKEND                                        │
│                      Node.js 22 + NestJS 10 + Fastify                            │
│                                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐  ┌─────────────┐ │
│  │    Auth    │  │  Projects  │  │  YouTube   │  │ Settings │  │   Webhooks  │ │
│  │ JWT/RS256  │  │    CRUD    │  │  OAuth2    │  │   CRUD   │  │  HMAC-SHA2  │ │
│  └────────────┘  └────────────┘  └────────────┘  └──────────┘  └─────────────┘ │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │                        Queue Manager (BullMQ)                               │ │
│  │    research-queue  |  asset-generation-queue  |  render-queue               │ │
│  │    Bull Board Admin UI  |  DLQ  |  Job Sync Service                         │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌───────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐   │
│  │   ElevenLabs TTS      │  │   Runway / Pexels    │  │    DALL-E 3        │   │
│  │ Circuit Breaker       │  │   Video Assets       │  │  Image Assets      │   │
│  │ sha256 Audio Cache    │  │   sha256 Video Cache │  │  sha256 Img Cache  │   │
│  └───────────────────────┘  └──────────────────────┘  └────────────────────┘   │
└───────────────────────────────────┬──────────────────────────────────────────────┘
                                    │ BullMQ Jobs (Redis Streams)
        ┌───────────────────────────┼────────────────────────┐
        ▼                           ▼                        ▼
┌───────────────┐        ┌──────────────────┐      ┌────────────────────┐
│  AI Backend   │        │  Redis           │      │  Remotion Lambda   │
│  Python 3.12  │        │  BullMQ Queues   │      │  @remotion/lambda  │
│  FastAPI      │        │  Asset Cache     │      │  Distributed Chunk │
│  CrewAI       │        │  Session Store   │      │  Rendering         │
│  LangGraph    │        │  Dedup Index     │      └─────────┬──────────┘
│  pgvector RAG │        └──────────────────┘               │
└───────┬───────┘                                            ▼
        │                                          ┌────────────────────┐
        ▼                                          │   AWS S3 / R2      │
┌───────────────┐                                  │   Audio Assets     │
│  PostgreSQL   │◄────────────────────────────────►│   Video B-roll     │
│  + pgvector   │                                  │   Final MP4        │
│  Drizzle ORM  │                                  │   Thumbnails       │
└───────────────┘                                  └────────────────────┘
```

---

## Service Decomposition

### Core Backend (Node.js / NestJS)

Owns orchestration, user-facing API, queue management, and all external media API integrations.

```
core-backend/src/
├── auth/                    # JWT RS256 guard, JWKS endpoint
├── projects/                # Project CRUD (Drizzle ORM)
├── queue/
│   ├── queue.module.ts      # BullMQ queue registration
│   ├── queue.service.ts     # Job dispatch facade
│   ├── queue.config.ts      # Concurrency, retry, backoff config
│   ├── dlq.service.ts       # Dead Letter Queue management
│   ├── job-sync.service.ts  # PostgreSQL <-> BullMQ state sync
│   └── workers/
│       ├── research.worker.ts         # Calls AI Backend /research
│       ├── asset-generation.worker.ts # Orchestrates TTS + video + image
│       └── render.worker.ts           # Dispatches to Remotion Lambda
├── elevenlabs/
│   ├── audio-cache.service.ts   # sha256(text+voiceId) -> Redis -> S3
│   └── circuit-breaker.ts       # Shared CircuitBreaker (reused across providers)
├── media/
│   ├── video-asset.service.ts   # Runway Gen-3 Alpha + Pexels fallback
│   └── video-cache.service.ts   # sha256(prompt+model+res) -> Redis
├── images/
│   ├── dalle3.service.ts            # DALL-E 3 integration
│   ├── stable-diffusion.service.ts  # Self-hosted fallback
│   └── prompt-safety.service.ts     # Content policy pre-screen
├── storyboard/
│   ├── video-storyboard.ts      # Canonical VideoStoryboard type
│   └── asset-predownloader.ts   # External URL -> S3 (Remotion NFR)
├── storage/                 # AWS S3 presigned URLs
├── render/                  # @remotion/lambda dispatch
├── youtube/
│   ├── youtube-auth.service.ts   # OAuth2 PKCE + token rotation
│   ├── youtube-upload.service.ts # S3 Readable -> googleapis (no RAM buffer)
│   └── token-crypto.service.ts   # AES-256-GCM token encryption
├── publishing/              # Multi-platform: YouTube, TikTok stub, Instagram stub
├── worker-mode/
│   ├── cron-worker.service.ts    # @nestjs/schedule CRON trigger
│   ├── worker-mode.service.ts    # Full autonomous pipeline orchestration
│   ├── deduplication.service.ts  # 48h content-hash Redis dedup
│   └── niche-profile.service.ts  # YAML Niche Profile loader + registry
├── cost/
│   ├── cost-estimator.service.ts # Pre-generation cost preview
│   ├── budget.service.ts         # Monthly spend limits + alerting
│   └── cost-record.service.ts    # Persists per-video cost breakdown
├── thumbnails/              # DALL-E 3 x3 variants + @nestjs/schedule A/B rotation
├── rag/                     # pgvector chunking, embeddings, ingestion
├── webhooks/                # HMAC-SHA256 signed outbound webhooks
├── gateway/
│   └── events.gateway.ts    # Socket.IO WebSocket (job progress, publish events)
├── metrics/                 # Prometheus prom-client exposition
└── alerts/                  # Slack/email alerting (DLQ depth, cost threshold)
```

### AI Backend (Python / FastAPI)

Owns all LLM orchestration, agent logic, and RAG pipeline. Stateless per-request; checkpointing delegated to Redis (LangGraph) and PostgreSQL (pgvector).

```
ai-backend/app/
├── agents/
│   ├── researcher/
│   │   ├── agent.py         # CrewAI Researcher Agent
│   │   ├── scoring.py       # Virality scoring algorithm
│   │   ├── dedup.py         # 48h similarity deduplication
│   │   ├── sanitizer.py     # Prompt injection defense (delimiter strategy)
│   │   └── tools/
│   │       ├── rss_tool.py      # feedparser RSS ingestion
│   │       ├── newsapi_tool.py  # NewsAPI integration
│   │       ├── gdelt_tool.py    # GDELT real-time news graph
│   │       └── trends_tool.py   # Google Trends (pytrends)
│   ├── director/
│   │   ├── worker_mode.py   # CrewAI sequential pipeline
│   │   ├── creator_mode.py  # LangGraph + AsyncRedisSaver (HITL)
│   │   ├── prompts.py       # Prompt templates per tone profile
│   │   └── seo.py           # SEO title / description / tags generator
│   ├── quality_reviewer/
│   │   └── reviewer.py      # Deterministic gate: schema, CTA, duration, prompts
│   └── retry/
│       └── orchestrator.py  # Max-2 rejection loop -> DLQ on 3rd failure
├── niche_profiles/
│   ├── registry.py          # YAML profile loader
│   └── presets/             # tech, finance, health, education, entertainment
├── rag/
│   ├── db.py                # asyncpg + pgvector pool
│   ├── chunker.py           # Semantic text chunker
│   ├── embeddings.py        # OpenAI text-embedding-3-small
│   └── ingestion.py         # Source material -> chunks -> vectors
├── models/                  # Pydantic v2 schemas (VideoStoryboard, ReviewResult...)
├── api/                     # FastAPI routers
│   ├── research.py          # POST /research
│   ├── director.py          # POST /generate-storyboard
│   ├── creator.py           # WebSocket /creator/session (LangGraph HITL)
│   └── sources.py           # POST /projects/:id/sources (RAG ingestion)
├── metrics.py               # Prometheus client exposition
└── main.py                  # App factory, lifespan, X-Request-ID middleware
```

---

## Agent Pipeline

### Worker Mode (Fully Autonomous)

Sequential CrewAI pipeline with a deterministic quality gate before any paid API call.

```
CRON trigger (configurable interval)
        │
        ▼
┌───────────────────┐
│  Researcher Agent │  RSS + NewsAPI + GDELT + Google Trends
│  (CrewAI)         │  Virality Score = f(recency, controversy, velocity, dedup_penalty)
└────────┬──────────┘  Prompt injection defense: delimiter isolation
         │ structured ResearchReport
         ▼
┌───────────────────┐
│  Director Agent   │  Claude 3.5 Sonnet / GPT-4o  (final script)
│  (CrewAI)         │  GPT-4o-mini / Haiku          (outline + filtering)
└────────┬──────────┘  Applies NicheProfile YAML (tone, hook, visual vocabulary)
         │ VideoStoryboard JSON
         ▼
┌───────────────────┐
│ Quality Reviewer  │  DETERMINISTIC -- no LLM, zero API cost
│ (pure function)   │  Checks: schema validity, scene count, CTA presence,
└────────┬──────────┘  duration estimate, visual prompt quality (min 10 words)
         │
    ┌────┴──────┐
    │ APPROVED? │
    └────┬──────┘
  NO ◄───┘  └──► YES
   │                │
   │ inject constraints    ▼
   │ (max 2 retries) ┌───────────────────┐
   └─────────────────│  Asset Manager    │  asyncio.gather (all scenes in parallel)
                     │                   │  ElevenLabs TTS     (sha256 cache)
                     └────────┬──────────┘  Runway Gen-3 Alpha  (sha256 cache)
                              │             Pexels fallback      (sha256 cache)
                              │             DALL-E 3 images      (sha256 cache)
                              │ all videoUrl/audioUrl -> s3://
                              ▼
                     ┌───────────────────┐
                     │ AssetPredownloader│  external CDN -> S3
                     │                   │  enforces s3:// contract
                     └────────┬──────────┘
                              │
                              ▼
                     ┌───────────────────┐
                     │  Render Engine    │  @remotion/lambda
                     │                   │  Distributed chunk rendering
                     └────────┬──────────┘  arm64, eu-central-1
                              │
                              ▼
                     ┌───────────────────┐
                     │  YouTube Publisher│  Data API v3
                     │                   │  S3 Readable stream -> googleapis
                     └───────────────────┘  no video buffered in RAM
```

**Virality Scoring Algorithm:**

```
score = (recency_weight    * recency_score)
      + (controversy_weight * sentiment_polarity)
      + (momentum_weight    * publication_velocity)
      - (duplicate_penalty  * similarity_to_recent_topics)
```

Weights are configurable per Niche Profile YAML.

### Creator Mode (Human-in-the-Loop)

LangGraph state machine with Redis checkpointing via `AsyncRedisSaver`. Session state survives process restarts without sticky sessions.

```
User Prompt
    │
    ▼
[ LangGraph Node: outline_generation ]
    │  GPT-4o-mini outline
    │
    ▼
[ INTERRUPT: await_user_approval ]  <-- WebSocket event pushed to Frontend
    │
    │  user approves / edits outline
    ▼
[ LangGraph Node: storyboard_generation ]
    │  RAG context injected from pgvector
    │  Claude 3.5 Sonnet full script
    │
    ▼
[ LangGraph Node: quality_review ]
    │
    ▼
[ INTERRUPT: timeline_editor ]  <-- Full storyboard rendered in Timeline UI
    │
    │  user edits scenes (dirty-flag per scene, unchanged scenes skip regeneration)
    ▼
[ LangGraph Node: asset_generation ]  -- only dirty scenes regenerated
    │
    ▼
[ LangGraph Node: render_dispatch ]
```

---

## Data Flow

### Content-Addressed Asset Cache

Every external generative API call is guarded by a content-addressed cache. Cache keys are SHA-256 hashes of the inputs — identical content always produces the same key, regardless of when the request is made.

```
Request (narrationText, voiceId)
           │
           ▼
   key = sha256(text + voiceId)
           │
    ┌──────▼──────┐
    │ Redis lookup │   TTL: 7 days
    └──────┬──────┘
           │
      HIT ─┼─ MISS
       │         │
       ▼         ▼
  return S3   ElevenLabs API call
  URL              │
                   ▼
              S3 upload (s3://bucket/audio/{key}.mp3)
                   │
                   ▼
             Redis write (key -> s3 URL)
                   │
                   ▼
              return S3 URL
```

Same pattern for video B-roll (`sha256(visualPrompt + modelId + resolution)`) and images.

### Asset Pre-Download (Remotion Lambda Safety)

Remotion Lambda must never fetch from external CDNs at render time — confirmed `delayRender()` timeout at 28s on Pexels CDN under Lambda network conditions. The `AssetPredownloader` resolves all external URLs to `s3://` before the render job is dispatched. This is enforced at the type level: `renderService.dispatch()` only accepts a `VideoStoryboard` with verified `s3://` URLs.

```
VideoStoryboard (with external URLs)
           │
           ▼
  AssetPredownloader.run()
     ├── scene[0].videoUrl: "https://videos.pexels.com/..." -> S3 -> "s3://..."
     ├── scene[1].videoUrl: "https://runway.ml/..."         -> S3 -> "s3://..."
     └── scene[N].audioUrl: "s3://..."                      -> no-op (already safe)
           │
           ▼
VideoStoryboard (all s3:// URLs -- type-verified)
           │
           ▼
  render-queue job dispatched
           │
           ▼
  @remotion/lambda (fetches exclusively from S3)
```

### YouTube Upload — Zero RAM Buffering

Large MP4 files are never buffered in process memory. An S3 `Readable` is piped directly to the googleapis resumable upload endpoint.

```
S3 Object
    │
    ▼
s3Client.send(GetObjectCommand)
    │  Body: Readable stream
    ▼
youtube.videos.insert({ media: { body: s3Stream } })
    │
    ▼
YouTube CDN
```

---

## Technology Stack

### Core Backend

| Category | Technology | Version | Rationale |
|---|---|---|---|
| Runtime | Node.js | 22 LTS | Long-term support, native ESM, stable V8 |
| Framework | NestJS + Fastify | 10 / 5 | DI container, modular architecture; Fastify for throughput over Express |
| Language | TypeScript | 5.5 | Strict typing, discriminated unions for job payload contracts |
| ORM | Drizzle ORM | 0.33 | Type-safe SQL, schema-as-code, zero runtime overhead vs Prisma |
| Database | PostgreSQL | 16 | ACID, JSONB columns, pgvector for RAG embeddings |
| Task Queue | BullMQ | 5 | Redis-backed, atomic job steps, priority queues, built-in DLQ |
| Cache / Broker | Redis (ioredis) | 5 | BullMQ transport + content-hash asset cache |
| WebSocket | Socket.IO | 4 | Real-time job progress and publish events to frontend |
| File Storage | AWS S3 (SDK v3) | 3 | Presigned URLs, streaming upload/download, S3 lifecycle policies |
| Video Render | @remotion/lambda | 4 | Distributed Lambda chunk rendering, eliminates 15-min timeout for long-form |
| TTS | ElevenLabs API | REST | Voice cloning, emotional parameter control |
| Video AI | Runway Gen-3 Alpha | REST | Cinematic B-roll from visual prompts |
| Stock Video | Pexels API | REST | Zero-cost fallback for B-roll when Runway is rate-limited |
| Image AI | DALL-E 3 | REST | Thumbnail variants, static image scenes |
| Image Fallback | Stable Diffusion | local | Self-hosted fallback, no per-call cost |
| Publishing | YouTube Data API v3 | googleapis | OAuth2 PKCE, resumable upload |
| Scheduling | @nestjs/schedule | 6 | CRON-based autonomous Worker Mode trigger |
| Metrics | prom-client | 15 | Prometheus text exposition for Grafana |
| Logging | pino | 9 | Structured JSON logs, lowest overhead Node.js logger |
| Auth | @nestjs/jwt + RS256 | 10 | Asymmetric signing; public key distributed via JWKS endpoint |
| Testing | Jest + ts-jest | 29 | Unit + integration, runInBand for Redis state isolation |

### AI Backend

| Category | Technology | Version | Rationale |
|---|---|---|---|
| Runtime | Python | 3.12 | Match production constraint, native asyncio |
| Framework | FastAPI | 0.111 | Async-first, Pydantic v2 native, automatic OpenAPI docs |
| Agent Framework | CrewAI | 0.80 | Sequential deterministic agents with tool use (Worker Mode) |
| State Machine | LangGraph | 0.2 | Interruptible HITL graphs with typed state (Creator Mode) |
| LangGraph Persistence | langgraph-checkpoint-redis | latest | `AsyncRedisSaver` — graph checkpoint survives process restarts |
| LLMs | GPT-4o + GPT-4o-mini | openai 1.30 | Tiered: cheap models for filtering, expensive for final script |
| Embeddings | text-embedding-3-small | openai | pgvector RAG context injection into Director prompts |
| Vector Store | pgvector + asyncpg | 0.3 | Co-located with PostgreSQL; no separate vector service to operate |
| Research Tools | feedparser, newsapi-python, pytrends | latest | RSS, NewsAPI, GDELT, Google Trends |
| Validation | Pydantic v2 | 2.7 | Runtime JSON Schema validation of all LLM structured outputs |
| Logging | structlog | 24 | Context-var bound structured logs, JSON renderer in production |
| Metrics | prometheus-client | 0.25 | Agent latency, cache hit rate, per-provider cost tracking |
| Testing | pytest + pytest-asyncio + fakeredis | 8.2 | Full async test support, in-process Redis mock |

### Infrastructure

| Service | Technology | Notes |
|---|---|---|
| Local dev | Docker Compose | PostgreSQL + Redis + pgvector |
| Rendering | AWS Lambda arm64 (eu-central-1) | @remotion/lambda distributed chunks |
| Secrets | HashiCorp Vault / AWS Secrets Manager | Runtime injection; never in committed env files |
| Observability | Prometheus + Grafana + Loki | Metrics, dashboards, structured log aggregation |
| Alerting | PagerDuty + Slack webhooks | DLQ depth, job failure rate, monthly cost thresholds |

---

## Key Design Decisions

### 1. Polyglot Microservices with Strict Domain Ownership

Node.js owns orchestration and all media integrations — strong async I/O, googleapis SDK, the Remotion ecosystem is Node-native. Python owns LLM orchestration — CrewAI, LangGraph, and the langchain ecosystem are Python-first. No shared libraries, no shared database. Services communicate exclusively through typed BullMQ job contracts. A failure in the AI Backend does not take down the Core Backend.

### 2. Content-Addressed Asset Cache

All generative API calls (ElevenLabs, Runway, DALL-E) are keyed by `sha256(inputs)`. Deterministic and storage-efficient — the same narration with the same voice always maps to the same S3 object. Avoids re-calling expensive APIs for repeated or near-identical scene content across projects. 7-day TTL, configurable per asset type. This alone targets > 70% cache hit rate at steady-state volume.

### 3. Deterministic Quality Gate Before API Spend

The `QualityReviewer` is a pure Python function — no LLM call, zero API cost. It runs synchronously in the pipeline before any ElevenLabs or Runway call. Invalid storyboards are rejected with a structured constraint list appended to the Director Agent's next prompt (not a full reset — preserves context). Maximum 2 rejection cycles; 3rd failure routes to DLQ and triggers a human review alert.

### 4. Asset Pre-Download Enforced at the Type Level

`AssetPredownloader` converts all external CDN URLs to `s3://` before a render job is dispatched. This constraint is enforced by the TypeScript type system: `renderService.dispatch()` accepts only a `VideoStoryboard` where all `videoUrl`/`audioUrl` fields have been verified as `s3://` paths. Remotion Lambda never fetches from external URLs at render time. This prevents the confirmed `delayRender()` 28-second timeout that occurs when Pexels CDN rate-limits Lambda function IPs.

### 5. LangGraph + AsyncRedisSaver for Creator Mode Sessions

Creator Mode requires a long-lived stateful session that can be interrupted at human review gates and resumed from any node — potentially after hours or a process restart. `AsyncRedisSaver` persists the full LangGraph checkpoint to Redis after every node execution. Session continuity across horizontal scaling without sticky sessions or client-side state management of agent state.

### 6. YouTube Upload Without RAM Buffering

Finalised MP4 files reach 500MB+. Buffering in the Node.js process under concurrency causes OOM. The upload service streams the S3 `GetObjectCommand` response body (a `Readable`) directly into the googleapis resumable upload — zero RAM buffering, constant memory footprint regardless of video size or concurrent uploads.

### 7. Circuit Breaker on All External Providers

A shared `CircuitBreaker` class wraps every external API client (ElevenLabs, Runway, OpenAI, Pexels). State machine: `CLOSED` → `OPEN` (on failure threshold) → `HALF_OPEN` (probe). Prevents cascading failures when a single provider has an outage. Asset generation across scenes continues via `asyncio.gather` / `Promise.allSettled` — a failure on scene N does not block scene N+1.

### 8. Tiered LLM Cost Model

Cheap models (GPT-4o-mini, Claude 3 Haiku) handle news filtering, outline generation, and quality scoring prompts. Expensive models (Claude 3.5 Sonnet, GPT-4o) are reserved for final script generation only. This reduces per-video LLM spend by ~60-70% for Worker Mode at volume.

---

## Database Schema

```
users
  id             uuid        PK
  email          text        UNIQUE
  created_at     timestamptz

settings
  id             uuid        PK
  user_id        uuid        FK -> users
  key            text
  value_enc      text        AES-256-GCM encrypted for API key values

projects
  id             uuid        PK
  user_id        uuid        FK -> users
  title          text
  status         enum        draft | processing | completed | failed
  storyboard     jsonb       VideoStoryboard (canonical contract)
  niche_profile  text        preset name or custom YAML ref
  created_at     timestamptz

jobs
  id             uuid        PK
  project_id     uuid        FK -> projects
  type           enum        research | asset_generation | render | publish
  status         enum        pending | active | completed | failed | dlq
  bullmq_id      text        BullMQ internal job ID for correlation
  attempts       int
  error          text
  created_at     timestamptz

youtube_channels
  id             uuid        PK
  user_id        uuid        FK -> users
  channel_id     text        YouTube channel ID
  access_token_enc   text    AES-256-GCM
  refresh_token_enc  text    AES-256-GCM  (rotated on every use)

cost_records
  id             uuid        PK
  project_id     uuid        FK -> projects
  provider       text        elevenlabs | runway | openai | pexels
  amount_usd     numeric
  recorded_at    timestamptz

webhooks
  id             uuid        PK
  user_id        uuid        FK -> users
  url            text
  secret_hash    text        HMAC-SHA256 signing secret
  events         text[]      event filter list

thumbnail_experiments
  id             uuid        PK
  project_id     uuid        FK -> projects
  variant_urls   text[]      3 DALL-E 3 generated variants
  active_idx     int         currently live variant index
  ctr_data       jsonb       YouTube Analytics CTR per variant

rag_chunks
  id             uuid        PK
  project_id     uuid        FK -> projects
  content        text
  embedding      vector(1536) pgvector index (IVFFlat)
  source_ref     text        origin file or URL
```

---

## API Reference

### Core Backend

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/login` | JWT login |
| `GET` | `/auth/jwks` | RS256 public key JWKS endpoint |
| `GET/POST` | `/api/projects` | Project list / create |
| `GET/PATCH/DELETE` | `/api/projects/:id` | Project detail / update / delete |
| `POST` | `/api/projects/:id/queue` | Enqueue full pipeline for a project |
| `GET` | `/api/projects/:id/status` | Live job status (polling fallback) |
| `POST` | `/api/projects/:id/sources` | Ingest RAG source material (chunk + embed) |
| `GET` | `/api/projects/:id/cost-breakdown` | Per-video cost breakdown by provider |
| `POST` | `/api/projects/:id/thumbnail-test` | Start A/B thumbnail experiment |
| `POST` | `/api/publish` | Dispatch to publishing registry (YouTube / TikTok / Instagram) |
| `GET/POST/DELETE` | `/api/settings` | Encrypted API key settings management |
| `POST` | `/api/webhooks` | Register outbound HMAC-signed webhook |
| `GET` | `/api/youtube/auth` | Start YouTube OAuth2 PKCE flow |
| `GET` | `/api/youtube/callback` | YouTube OAuth2 callback handler |
| `GET` | `/api/dlq` | Inspect Dead Letter Queue jobs |
| `POST` | `/api/dlq/:id/retry` | Manually retry a DLQ job |
| `GET` | `/queue/admin` | Bull Board job dashboard UI |
| `GET` | `/metrics` | Prometheus text exposition |
| `GET` | `/health` | Liveness probe |

### AI Backend

| Method | Path | Description |
|---|---|---|
| `POST` | `/research` | Run Researcher Agent for a channel config |
| `POST` | `/generate-storyboard` | Run Director Agent + QualityReviewer (Worker Mode) |
| `WS` | `/creator/session` | LangGraph HITL session stream (Creator Mode) |
| `POST` | `/projects/:id/sources` | Ingest source material -> chunk -> embed -> pgvector |
| `GET` | `/metrics` | Prometheus text exposition |
| `GET` | `/health` | Liveness probe |

### VideoStoryboard — Canonical Contract

The `VideoStoryboard` JSON schema is the single source of truth shared between AI agents and the Remotion render engine. The TypeScript type in `core-backend/src/storyboard/video-storyboard.ts` and the Pydantic model in `ai-backend/app/models/storyboard.py` are kept in sync manually — a schema mismatch is a breaking change and requires a version bump.

```typescript
interface VideoStoryboard {
  meta: {
    title: string;            // max 100 chars (YouTube limit)
    description?: string;     // chapter timestamps injected for long-form
    tags?: string[];          // max 15 (YouTube limit)
    aspectRatio: '16:9' | '9:16';
    language: 'pl' | 'en' | 'de' | 'fr' | 'es';
    voiceId: string;          // ElevenLabs voice ID
    toneProfile?: 'informative' | 'comedic' | 'edgy' | 'educational';
  };
  timeline: Array<{
    sceneId: string;           // UUID
    sequenceNumber: number;
    durationInSeconds: number;
    narrationText: string;
    audioUrl?: string;         // s3:// after Asset Manager runs
    audioCacheKey?: string;    // sha256(narrationText + voiceId)
    visualPrompt: string;      // min 10 words (Quality Reviewer enforced)
    videoUrl?: string;         // s3:// after Asset Manager + pre-downloader
    visualCacheKey?: string;   // sha256(visualPrompt + modelId + resolution)
    isDirty?: boolean;         // dirty-flag for selective regeneration in Creator Mode
    textOverlay?: {
      text: string;
      style: 'standard' | 'punchy' | 'funny_sub';
      position: 'top' | 'center' | 'bottom';
    };
  }>;
}
```

---

## Security Model

| Control | Implementation |
|---|---|
| Authentication | JWT RS256 — asymmetric signing; public key served via JWKS endpoint enabling key rotation without secret redistribution |
| Inter-service auth | Short-lived RS256 JWTs on every Core Backend -> AI Backend request |
| Secret storage at rest | All API keys and OAuth2 tokens encrypted with AES-256-GCM before PostgreSQL insert; plaintext never persisted |
| Runtime secrets | Injected via HashiCorp Vault / AWS Secrets Manager; never in `.env` files committed to git |
| YouTube OAuth2 | PKCE flow; refresh tokens rotated on every use; stored encrypted in DB |
| Prompt injection defense | All ingested news content wrapped in `<news_content>...</news_content>` delimiters; system prompt explicitly instructs the model to treat enclosed content as data, not instructions |
| User file uploads | 10MB size limit, content-type validated, stored in isolated S3 prefix with no public access |
| Outbound webhooks | Signed with HMAC-SHA256; receivers can verify `X-Signature` header to ensure authenticity |
| Content policy | Pre-publication content scan before YouTube upload to prevent accidental ToS violations |
| OpenAPI docs | Disabled when `APP_ENV=prod` — no schema or endpoint leakage in production |

---

## Observability

### Prometheus Metrics

| Metric | Type | Labels |
|---|---|---|
| `job_queue_depth` | Gauge | `queue_name` |
| `job_duration_seconds` | Histogram | `job_type`, `status` |
| `external_api_latency_seconds` | Histogram | `provider`, percentile |
| `asset_cache_hits_total` | Counter | `asset_type` (audio / video / image) |
| `api_cost_per_video_usd` | Histogram | `provider` |
| `agent_retry_total` | Counter | `agent_name`, `rejection_reason` |
| `dlq_depth` | Gauge | `queue_name` |

### Structured Logging

Every log record carries: `projectId`, `sceneId`, `jobId`, `agentName`, `durationMs`, `correlationId` (the `X-Request-ID` header is propagated through the full call chain from frontend through Core Backend to AI Backend).

```
Node.js:  pino    -> JSON -> Loki / Datadog
Python:   structlog -> JSON -> Loki / Datadog
```

### Alerting Rules

| Condition | Threshold | Action |
|---|---|---|
| Job failure rate | > 10% in 5-min window | PagerDuty + Slack |
| DLQ depth | > 5 jobs | Slack alert |
| Monthly cost per channel | > 80% of configured limit | Email + Slack warning |
| Monthly cost per channel | 100% of configured limit | Hard pipeline stop + email |
| YouTube OAuth2 token refresh failure | Any | Immediate email alert |

---

## Project Structure

```
video-publisher/
├── core-backend/                  # Node.js / NestJS orchestration service
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── config/configuration.ts
│   │   ├── db/                    # Drizzle ORM + auto-migration on startup
│   │   ├── redis/                 # Global REDIS_CLIENT symbol provider
│   │   ├── auth/                  # JWT RS256 guard + JWKS controller
│   │   ├── projects/
│   │   ├── queue/                 # BullMQ workers + DLQ + job sync
│   │   ├── elevenlabs/            # TTS + circuit breaker + cache
│   │   ├── media/                 # Runway + Pexels + cache
│   │   ├── images/                # DALL-E 3 + SD + safety + cache
│   │   ├── storyboard/            # VideoStoryboard type + pre-downloader
│   │   ├── storage/               # S3 service + presigned URLs
│   │   ├── render/                # @remotion/lambda dispatch
│   │   ├── youtube/               # OAuth2 PKCE + streaming upload + token crypto
│   │   ├── publishing/            # Multi-platform publishing registry
│   │   ├── worker-mode/           # CRON + dedup + niche profiles
│   │   ├── cost/                  # Cost estimator + budget limits + records
│   │   ├── thumbnails/            # DALL-E 3 A/B experiments + @nestjs/schedule rotation
│   │   ├── rag/                   # pgvector source ingestion
│   │   ├── webhooks/              # HMAC-SHA256 outbound webhooks
│   │   ├── gateway/               # Socket.IO WebSocket gateway
│   │   ├── metrics/               # Prometheus prom-client
│   │   ├── alerts/                # Slack + email alert service
│   │   └── settings/              # Encrypted API key management
│   ├── drizzle/migrations/        # SQL migration files (auto-generated)
│   └── package.json
│
├── ai-backend/                    # Python / FastAPI agent service
│   ├── app/
│   │   ├── agents/
│   │   │   ├── researcher/        # CrewAI + RSS/NewsAPI/GDELT/Trends tools
│   │   │   ├── director/          # CrewAI (Worker Mode) + LangGraph (Creator Mode)
│   │   │   ├── quality_reviewer/  # Deterministic validation gate
│   │   │   └── retry/             # Constraint-append retry orchestrator
│   │   ├── niche_profiles/presets/ # YAML channel profiles (tech, finance, health...)
│   │   ├── rag/                   # pgvector chunker + embeddings + ingestion
│   │   ├── models/                # Pydantic v2 shared schemas
│   │   ├── api/                   # FastAPI routers
│   │   └── main.py                # App factory + X-Request-ID middleware
│   ├── tests/
│   └── pyproject.toml
│
├── prd.md                         # Full Product Requirements Document v1.1
└── tasks/                         # Sprint task specifications
    └── sprint-2/
```

---

## Getting Started

### Prerequisites

- Node.js 22 LTS
- Python 3.12 + `uv`
- PostgreSQL 16 with `pgvector` extension enabled
- Redis 7
- AWS account (S3 bucket + Lambda execution role for Remotion)

### Environment Variables

```bash
# core-backend/.env  (never commit — use Vault in production)
DATABASE_URL=postgresql://user:pass@localhost:5432/video_factory
REDIS_URL=redis://localhost:6379
JWT_PRIVATE_KEY=<RS256 PEM>
JWT_PUBLIC_KEY=<RS256 PEM>
AWS_REGION=eu-central-1
AWS_S3_BUCKET=video-factory-assets
ELEVENLABS_API_KEY=<from Vault>
RUNWAY_API_KEY=<from Vault>
OPENAI_API_KEY=<from Vault>
YOUTUBE_CLIENT_ID=<OAuth2 credential>
YOUTUBE_CLIENT_SECRET=<OAuth2 credential>
TOKEN_ENCRYPTION_KEY=<32 bytes hex>

# ai-backend/.env
OPENAI_API_KEY=<from Vault>
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://user:pass@localhost:5432/video_factory
NEWSAPI_KEY=<from Vault>
APP_ENV=development
APP_VERSION=0.1.0
```

### Run (Development)

```bash
# 1. Start PostgreSQL (with pgvector) + Redis
docker compose -f ai-backend/docker-compose.yml up -d

# 2. Core Backend
cd core-backend
npm install
npm run db:migrate
npm run start:dev

# 3. AI Backend
cd ai-backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# 4. Tests
cd core-backend && npm test
cd ai-backend  && uv run pytest
```

---

## Performance Characteristics

| Scenario | Target | Mechanism |
|---|---|---|
| Shorts asset generation (all scenes) | < 3 minutes | `asyncio.gather` — all scenes processed in parallel |
| Short (60s) render | < 5 minutes | @remotion/lambda single-chunk |
| Long-form (15 min) render | < 30 minutes | @remotion/lambda distributed chunks, no Lambda timeout constraint |
| Timeline Editor at 90 scenes | No UI lag | `React.memo` + `useMemo` + `useCallback` per scene; scoped Zustand slices prevent cross-scene re-renders |
| Audio cache hit | Skip ElevenLabs call entirely | sha256 Redis lookup < 1ms |
| Concurrent YouTube uploads | Constant memory | S3 `Readable` stream piped to googleapis; no MP4 buffered in process |
| Creator Mode session after crash | Zero data loss | `AsyncRedisSaver` checkpoints LangGraph state after every node |
| Browser refresh during timeline edit | Zero data loss | `localStorage` / IndexedDB dirty-state persistence |
| Quality Reviewer | Zero API cost | Pure Python function — no LLM call, runs in < 50ms |
