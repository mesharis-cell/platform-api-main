ALTER TABLE "order_prices" RENAME TO "prices";--> statement-breakpoint
ALTER TABLE "prices" DROP CONSTRAINT "order_prices_platform_id_platforms_id_fk";
--> statement-breakpoint
ALTER TABLE "prices" DROP CONSTRAINT "order_prices_calculated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_order_pricing_id_order_prices_id_fk";
--> statement-breakpoint
ALTER TABLE "inbound_requests" ADD COLUMN "request_pricing_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_requests" ADD CONSTRAINT "inbound_requests_request_pricing_id_prices_id_fk" FOREIGN KEY ("request_pricing_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_calculated_by_users_id_fk" FOREIGN KEY ("calculated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_pricing_id_prices_id_fk" FOREIGN KEY ("order_pricing_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;