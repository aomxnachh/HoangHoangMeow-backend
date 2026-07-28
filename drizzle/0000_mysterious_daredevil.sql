CREATE TYPE "public"."activity_status" AS ENUM('PENDING', 'DONE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('MALE', 'FEMALE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCESS', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('FREE', 'PREMIUM');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"pet_id" integer NOT NULL,
	"activity_type" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"detail" text,
	"activity_date" date NOT NULL,
	"status" "activity_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" serial PRIMARY KEY NOT NULL,
	"pet_category_id" integer NOT NULL,
	"location" varchar(255),
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_recommend" (
	"id" serial PRIMARY KEY NOT NULL,
	"pet_category_id" integer NOT NULL,
	"age_range" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense" (
	"id" serial PRIMARY KEY NOT NULL,
	"pet_id" integer NOT NULL,
	"date" date NOT NULL,
	"category" varchar(100) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_category" (
	"id" serial PRIMARY KEY NOT NULL,
	"species" varchar(100) NOT NULL,
	"breed" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet" (
	"pet_id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"pet_category_id" integer NOT NULL,
	"gender" "gender" DEFAULT 'UNKNOWN' NOT NULL,
	"name" varchar(100) NOT NULL,
	"weight" numeric(6, 2),
	"birthdate" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"plan_type" "plan_type" DEFAULT 'FREE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_pet_id_pet_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("pet_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_pet_category_id_pet_category_id_fk" FOREIGN KEY ("pet_category_id") REFERENCES "public"."pet_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_recommend" ADD CONSTRAINT "care_recommend_pet_category_id_pet_category_id_fk" FOREIGN KEY ("pet_category_id") REFERENCES "public"."pet_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_pet_id_pet_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pet"("pet_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet" ADD CONSTRAINT "pet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet" ADD CONSTRAINT "pet_pet_category_id_pet_category_id_fk" FOREIGN KEY ("pet_category_id") REFERENCES "public"."pet_category"("id") ON DELETE restrict ON UPDATE no action;