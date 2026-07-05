import { pgTable, uuid, text, jsonb, timestamp, boolean, numeric, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    title: text("title").notNull(),
    mode: text("mode").notNull(),
    status: text("status").default("draft"),
    storyboard: jsonb("storyboard"),
    youtubeVideoId: text("youtube_video_id"),
    /** ResearchBrief JSON stored for audit trail and re-use (FEATURE-05) */
    researchBrief: jsonb("research_brief"),
    researchCompletedAt: timestamp("research_completed_at", { withTimezone: true }),
    /** Reference video URL and analysis brief (FEATURE-06) */
    referenceVideoUrl: text("reference_video_url"),
    referenceAnalysis: jsonb("reference_analysis"),
    /** Quality gate results (FEATURE-07) */
    preRenderValidation: jsonb("pre_render_validation"),
    postRenderQuality: jsonb("post_render_quality"),
    renderQualityScore: numeric("render_quality_score", { precision: 3, scale: 2 }),
    /** Cumulative spend across all per-action approvals (FEATURE-09) */
    totalSpentUsd: numeric("total_spent_usd", { precision: 10, scale: 4 }).default("0.0000"),
    /** Localization & Dubbing (FEATURE-10) — parent/child project relationship */
    parentProjectId: uuid("parent_project_id").references((): any => projects.id, { onDelete: "set null" }),
    language: text("language").default("en"),
    isLocalization: boolean("is_localization").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    idx_projects_parent_project_id: index("idx_projects_parent_project_id").on(t.parentProjectId),
  }),
);

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id),
  jobType: text("job_type").notNull(),
  status: text("status").default("pending"),
  payload: jsonb("payload"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const youtubeChannels = pgTable("youtube_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  channelId: text("channel_id").notNull(),
  channelName: text("channel_name"),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  monthlyBudgetUsd: text("monthly_budget_usd").default("0"),       // 0 = unlimited
  currentMonthSpendUsd: text("current_month_spend_usd").default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const costRecords = pgTable("cost_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id),
  sceneId: text("scene_id"),
  assetType: text("asset_type").notNull(), // audio | video | image
  provider: text("provider").notNull(),    // elevenlabs | runway | pexels | dalle3 | stable-diffusion
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 6 }).notNull(),
  actualCostUsd: numeric("actual_cost_usd", { precision: 10, scale: 6 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").array().notNull(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const thumbnailExperiments = pgTable("thumbnail_experiments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id),
  youtubeVideoId: text("youtube_video_id").notNull(),
  channelId: text("channel_id").notNull(),
  variants: jsonb("variants").notNull().default([]),
  currentVariantIndex: text("current_variant_index").default("0"),
  winnerId: text("winner_id"),
  status: text("status").default("running"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  isEncrypted: boolean("is_encrypted").default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type AppSetting = typeof appSettings.$inferSelect;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type CostRecord = typeof costRecords.$inferSelect;
export type NewCostRecord = typeof costRecords.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type ThumbnailExperiment = typeof thumbnailExperiments.$inferSelect;

export const archivalFootageCache = pgTable("archival_footage_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptHash: text("prompt_hash").notNull().unique(),
  results: jsonb("results").notNull().default([]),
  s3Url: text("s3_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type ArchivalFootageCache = typeof archivalFootageCache.$inferSelect;
export type NewArchivalFootageCache = typeof archivalFootageCache.$inferInsert;

export const subtitleCache = pgTable("subtitle_cache", {
  id: uuid("id").primaryKey().defaultRandom(),
  audioHash: text("audio_hash").notNull().unique(),
  words: jsonb("words").notNull().default([]),
  language: text("language").notNull().default("en"),
  srtS3Url: text("srt_s3_url").notNull(),
  vttS3Url: text("vtt_s3_url").notNull(),
  provider: text("provider").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type SubtitleCache = typeof subtitleCache.$inferSelect;
export type NewSubtitleCache = typeof subtitleCache.$inferInsert;

export const musicCache = pgTable("music_cache", {
  id:              uuid("id").primaryKey().defaultRandom(),
  paramsHash:      text("params_hash").notNull().unique(),
  s3Url:           text("s3_url").notNull(),
  provider:        text("provider").notNull(),
  mood:            text("mood").notNull(),
  title:           text("title").notNull(),
  artist:          text("artist"),
  license:         text("license").notNull().default("CC-BY"),
  durationSeconds: numeric("duration_seconds", { precision: 10, scale: 2 }).notNull(),
  createdAt:       timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type MusicCache = typeof musicCache.$inferSelect;
export type NewMusicCache = typeof musicCache.$inferInsert;

/** Per-action approval audit log (FEATURE-09). */
export const approvalLog = pgTable(
  "approval_log",
  {
    id:            uuid("id").primaryKey().defaultRandom(),
    projectId:     uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    sceneId:       text("scene_id"),
    action:        text("action").notNull(),    // "regenerate_visual" | "update_voice" | "render"
    provider:      text("provider").notNull(),
    estimatedCost: numeric("estimated_cost", { precision: 8, scale: 4 }),
    actualCost:    numeric("actual_cost",    { precision: 8, scale: 4 }),
    approvedBy:    text("approved_by"),        // "user" | "auto"
    decision:      text("decision").notNull(), // "approved" | "rejected"
    decidedAt:     timestamp("decided_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ idx_approval_log_project_id: index("idx_approval_log_project_id").on(t.projectId) }),
);

export type ApprovalLog    = typeof approvalLog.$inferSelect;
export type NewApprovalLog = typeof approvalLog.$inferInsert;
