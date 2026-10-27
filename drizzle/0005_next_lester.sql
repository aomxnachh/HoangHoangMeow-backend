ALTER TABLE "care_recommend" ADD COLUMN IF NOT EXISTS "title" varchar(255);--> statement-breakpoint
ALTER TABLE "care_recommend" ADD COLUMN IF NOT EXISTS "image_url" text;