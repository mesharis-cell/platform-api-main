DROP INDEX "order_line_items_order_idx";--> statement-breakpoint
DROP INDEX "order_line_items_reskin_idx";--> statement-breakpoint
DROP INDEX "order_line_items_active_idx";--> statement-breakpoint
CREATE INDEX "line_items_order_idx" ON "line_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "line_items_inbound_request_idx" ON "line_items" USING btree ("inbound_request_id");--> statement-breakpoint
CREATE INDEX "line_items_reskin_request_idx" ON "line_items" USING btree ("reskin_request_id");--> statement-breakpoint
CREATE INDEX "line_items_active_idx" ON "line_items" USING btree ("order_id","is_voided");