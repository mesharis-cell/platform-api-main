ALTER TABLE "account" ALTER COLUMN "user_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "asset_condition_history" ALTER COLUMN "updated_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "updated_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "scan_events" ALTER COLUMN "scanned_by" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "user_id" SET DATA TYPE uuid;