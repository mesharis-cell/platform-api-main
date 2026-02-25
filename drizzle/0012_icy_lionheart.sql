ALTER TABLE "assets" ADD COLUMN "on_display_image" text;--> statement-breakpoint
ALTER TABLE "scan_events" ADD COLUMN "latest_return_images" text[] DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "scan_events" ADD COLUMN "damage_report_photos" text[] DEFAULT ARRAY[]::text[];