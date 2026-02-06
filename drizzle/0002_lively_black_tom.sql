ALTER TABLE "order_line_items" ALTER COLUMN "order" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD COLUMN "inbound_request" uuid;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD COLUMN "purpose_type" "invoice_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_inbound_request_inbound_requests_id_fk" FOREIGN KEY ("inbound_request") REFERENCES "public"."inbound_requests"("id") ON DELETE cascade ON UPDATE no action;