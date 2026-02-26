ALTER TABLE "prices" ADD COLUMN "margin_percent" decimal(5,2) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "margin_is_override" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "margin_override_reason" text;--> statement-breakpoint

UPDATE "prices" SET
  "margin_percent" = COALESCE((margin->>'percent')::decimal, 0),
  "margin_is_override" = COALESCE((margin->>'is_override')::boolean, false),
  "margin_override_reason" = margin->>'override_reason';
