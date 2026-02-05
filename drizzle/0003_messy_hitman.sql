ALTER TABLE "inbound_request_items" RENAME COLUMN "total_quantity" TO "quantity";--> statement-breakpoint
ALTER TABLE "inbound_request_items" ADD COLUMN "inbound_request_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_request_items" ADD CONSTRAINT "inbound_request_items_inbound_request_id_inbound_requests_id_fk" FOREIGN KEY ("inbound_request_id") REFERENCES "public"."inbound_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_request_items" DROP COLUMN "available_quantity";