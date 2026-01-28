CREATE TABLE "order_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"warehouse_ops_rate" numeric(10, 2) NOT NULL,
	"logistics_sub_total" numeric(10, 2) NOT NULL,
	"transport" jsonb NOT NULL,
	"line_items" jsonb NOT NULL,
	"margin" jsonb NOT NULL,
	"final_total" numeric(10, 2) NOT NULL,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"calculated_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "order_prices_platform_order_unique" UNIQUE("platform_id","order_id","id")
);
--> statement-breakpoint
ALTER TABLE "order_prices" ADD CONSTRAINT "order_prices_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_prices" ADD CONSTRAINT "order_prices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_prices" ADD CONSTRAINT "order_prices_calculated_by_users_id_fk" FOREIGN KEY ("calculated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_prices_platform_idx" ON "order_prices" USING btree ("platform_id");--> statement-breakpoint
CREATE INDEX "order_prices_order_idx" ON "order_prices" USING btree ("order_id");