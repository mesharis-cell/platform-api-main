ALTER TABLE "order_line_items" RENAME TO "line_items";--> statement-breakpoint
ALTER TABLE "line_items" RENAME COLUMN "platform" TO "platform_id";--> statement-breakpoint
ALTER TABLE "line_items" RENAME COLUMN "order" TO "order_id";--> statement-breakpoint
ALTER TABLE "line_items" RENAME COLUMN "inbound_request" TO "inbound_request_id";--> statement-breakpoint
ALTER TABLE "line_items" RENAME COLUMN "service_type" TO "service_type_id";--> statement-breakpoint
ALTER TABLE "line_items" RENAME COLUMN "reskin_request" TO "reskin_request_id";--> statement-breakpoint
ALTER TABLE "line_items" DROP CONSTRAINT "order_line_items_platform_platforms_id_fk";
--> statement-breakpoint
ALTER TABLE "line_items" DROP CONSTRAINT "order_line_items_order_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "line_items" DROP CONSTRAINT "order_line_items_inbound_request_inbound_requests_id_fk";
--> statement-breakpoint
ALTER TABLE "line_items" DROP CONSTRAINT "order_line_items_service_type_service_types_id_fk";
--> statement-breakpoint
ALTER TABLE "line_items" DROP CONSTRAINT "order_line_items_reskin_request_reskin_requests_id_fk";
--> statement-breakpoint
ALTER TABLE "line_items" DROP CONSTRAINT "order_line_items_added_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "line_items" DROP CONSTRAINT "order_line_items_voided_by_users_id_fk";
--> statement-breakpoint
DROP INDEX "order_line_items_order_idx";--> statement-breakpoint
DROP INDEX "order_line_items_reskin_idx";--> statement-breakpoint
DROP INDEX "order_line_items_active_idx";--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_inbound_request_id_inbound_requests_id_fk" FOREIGN KEY ("inbound_request_id") REFERENCES "public"."inbound_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_reskin_request_id_reskin_requests_id_fk" FOREIGN KEY ("reskin_request_id") REFERENCES "public"."reskin_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_items" ADD CONSTRAINT "line_items_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_line_items_order_idx" ON "line_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_line_items_reskin_idx" ON "line_items" USING btree ("reskin_request_id");--> statement-breakpoint
CREATE INDEX "order_line_items_active_idx" ON "line_items" USING btree ("order_id","is_voided");