ALTER TABLE "user" ADD COLUMN "google_id" varchar(255);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "apple_id" varchar(255);--> statement-breakpoint

-- Preserve social links created before provider-specific columns existed.
UPDATE "user"
SET "google_id" = "auth_provider_id"
WHERE "auth_provider" = 'GOOGLE' AND "auth_provider_id" IS NOT NULL;--> statement-breakpoint
UPDATE "user"
SET "apple_id" = "auth_provider_id"
WHERE "auth_provider" = 'APPLE' AND "auth_provider_id" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "user" ADD CONSTRAINT "user_google_id_unique" UNIQUE("google_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_apple_id_unique" UNIQUE("apple_id");
