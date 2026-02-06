CREATE TYPE "public"."invoice_type" AS ENUM('ORDER', 'INBOUND_REQUEST');--> statement-breakpoint
ALTER TABLE "account" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "account" CASCADE;--> statement-breakpoint
DROP TABLE "session" CASCADE;--> statement-breakpoint
DROP TABLE "verification" CASCADE;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "inbound_request_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "type" "invoice_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_inbound_request_id_inbound_requests_id_fk" FOREIGN KEY ("inbound_request_id") REFERENCES "public"."inbound_requests"("id") ON DELETE cascade ON UPDATE no action;