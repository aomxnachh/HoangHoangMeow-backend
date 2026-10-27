-- Application and social fields already exist from 0001 and 0002.
-- Only these nullability changes are new.
ALTER TABLE "ads" ALTER COLUMN "pet_category_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "care_recommend" ALTER COLUMN "pet_category_id" DROP NOT NULL;
