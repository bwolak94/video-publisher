-- Add youtube_video_id to projects
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "youtube_video_id" text;

-- Fix youtube_channels: make refresh_token_encrypted nullable, add budget columns
ALTER TABLE "youtube_channels" ALTER COLUMN "refresh_token_encrypted" DROP NOT NULL;
ALTER TABLE "youtube_channels" ADD COLUMN IF NOT EXISTS "monthly_budget_usd" text DEFAULT '0';
ALTER TABLE "youtube_channels" ADD COLUMN IF NOT EXISTS "current_month_spend_usd" text DEFAULT '0';

-- App settings key-value store (encrypted at rest for sensitive values)
CREATE TABLE IF NOT EXISTS "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"is_encrypted" boolean DEFAULT false,
	"updated_at" timestamp with time zone DEFAULT now()
);
