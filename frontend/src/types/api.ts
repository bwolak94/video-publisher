/**
 * Shared API types — single source of truth for frontend ↔ backend contract.
 *
 * P4: replaces ad-hoc inline types scattered across page components.
 * Future: generate from OpenAPI spec via `npm run generate:types` once
 * `@nestjs/swagger` is added to the backend.
 */

// ── Projects ────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  title: string;
  mode: "creator" | "worker";
  status: "draft" | "running" | "completed" | "failed" | "idle";
  storyboard: {
    scenes?: unknown[];
    meta?: { aspectRatio?: string; title?: string };
    timeline?: unknown[];
  } | null;
  language?: string;
  updatedAt: string;
  createdAt: string;
}

export interface ProjectStats {
  totalProjects: number;
  totalScenes: number;
  projectsByStatus: Record<string, number>;
  cacheHitRate?: number;
  totalDuration?: number;
}

// ── Scenes (S9: Shot Lifecycle) ──────────────────────────────────────────────

export type ShotStatus = "pending_review" | "approved" | "generating" | "done" | "failed";

// ── Entities (P1: Visual Consistency) ───────────────────────────────────────

export type EntityType = "character" | "location" | "prop" | "costume";

export interface Entity {
  id: string;
  projectId: string;
  name: string;
  type: EntityType;
  description?: string | null;
  referenceImageUrls: string[];
  /** S3: Approved reference image for visual conditioning in generation pipeline */
  approvedReferenceImageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEntityDto {
  name: string;
  type: EntityType;
  description?: string;
  referenceImageUrls?: string[];
}

export interface UpdateEntityDto {
  name?: string;
  type?: EntityType;
  description?: string;
  referenceImageUrls?: string[];
}

// ── Characters (CHAR-02: Character Bible) ────────────────────────────────────

export interface CharacterImage {
  id: string;
  s3Url: string;
  sortOrder: number;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  style: string;
  voiceId?: string;
  consentType: "original" | "likeness";
  deletedAt?: string;
  createdAt: string;
  version: number;
  images?: CharacterImage[];
}

// ── Settings ─────────────────────────────────────────────────────────────────

export interface WorkerSettings {
  enabled: boolean;
  cronSchedule: string;
}

export interface AppSettings {
  worker?: WorkerSettings;
  integrations?: Record<string, string>;
}

// ── Jobs / Render ────────────────────────────────────────────────────────────

export interface RenderJobResponse {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
}

// ── MCP (P3) ─────────────────────────────────────────────────────────────────

export interface McpToolCall {
  method: "tools/call";
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface McpToolResult {
  result: {
    content: Array<{ type: "text"; text: string }>;
  };
}

// -- Shorts / Keyframes (FIX-04, FIX-07) ------------------------------------

export interface ShortJobSummary {
  id: string
  brief: string
  status: string
  sceneCount: number
  costUsd: number
  createdAt: string
}

export interface KeyframeVariant {
  id: string
  s3Url: string
  seed: number
  status: 'generating' | 'ready' | 'failed'
}

// -- Source Clips (FIX-06) ----------------------------------------------------

export interface SourceClip {
  id: string
  /** Original filename provided on upload */
  name?: string | null
  /** S3 URI in format s3://bucket/key */
  s3Url: string
  /** Total video duration in seconds (populated by ffprobe on server-side upload) */
  durationS?: string | null
  /** Frame rate (fps) populated by ffprobe */
  fps?: string | null
  /** Resolution string e.g. "1920x1080" */
  resolution?: string | null
  /** Trim in point (seconds) */
  inPointS?: string | null
  /** Trim out point (seconds) */
  outPointS?: string | null
  createdAt?: string | null
}
