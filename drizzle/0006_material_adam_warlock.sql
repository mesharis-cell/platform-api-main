CREATE TABLE "financial_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"order" uuid NOT NULL,
	"status" "financial_status" NOT NULL,
	"notes" text,
	"updated_by" uuid NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_status_history" ADD CONSTRAINT "financial_status_history_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_status_history" ADD CONSTRAINT "financial_status_history_order_orders_id_fk" FOREIGN KEY ("order") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_status_history" ADD CONSTRAINT "financial_status_history_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_status_history_order_idx" ON "financial_status_history" USING btree ("order");--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "financial_status_history";