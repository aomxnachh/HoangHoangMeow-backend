CREATE TYPE "public"."auth_provider" AS ENUM('EMAIL', 'GOOGLE', 'APPLE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'ADMIN');--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'REFUNDED';--> statement-breakpoint

ALTER TABLE "user" ADD COLUMN "password_hash" varchar(255) NOT NULL DEFAULT '!unset!';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone" varchar(30);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" "user_role" NOT NULL DEFAULT 'USER';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "auth_provider" "auth_provider" NOT NULL DEFAULT 'EMAIL';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "auth_provider_id" varchar(255);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint

ALTER TABLE "pet" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "pet" ADD COLUMN "color" varchar(100);--> statement-breakpoint
ALTER TABLE "pet" ADD COLUMN "allergies" text;--> statement-breakpoint
ALTER TABLE "pet" ADD COLUMN "notes" text;--> statement-breakpoint

ALTER TABLE "activity" ADD COLUMN "entry_type" varchar(30) NOT NULL DEFAULT 'HEALTH_RECORD';--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "scheduled_at" timestamp;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "reminder_minutes" integer;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "recurrence_days" integer;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "snoozed_until" timestamp;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "provider" varchar(255);--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "cost" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "product_url" text;--> statement-breakpoint

ALTER TABLE "expense" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "provider" varchar(50);--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "reference" varchar(255);--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "period_end" timestamp;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint

ALTER TABLE "ads" ADD COLUMN "title" varchar(255);--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "target_url" text;--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "is_active" boolean NOT NULL DEFAULT true;--> statement-breakpoint

CREATE TABLE "password_reset_token" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_token_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint

CREATE TABLE "care_plan" (
	"id" serial PRIMARY KEY NOT NULL,
	"pet_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"detail" text,
	"frequency_days" integer,
	"next_due_at" timestamp,
	"status" "activity_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_plan" ADD CONSTRAINT "care_plan_pet_id_pet_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("pet_id") ON DELETE cascade ON UPDATE no action;
