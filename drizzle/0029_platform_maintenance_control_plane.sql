ALTER TABLE "platforms"
ADD COLUMN IF NOT EXISTS "maintenance_mode" boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS "maintenance_message" text,
ADD COLUMN IF NOT EXISTS "maintenance_until" timestamp,
ADD COLUMN IF NOT EXISTS "maintenance_updated_at" timestamp,
ADD COLUMN IF NOT EXISTS "maintenance_updated_by" uuid;

