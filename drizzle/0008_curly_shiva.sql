CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"order" uuid NOT NULL,
	"invoice_id" varchar(50) NOT NULL,
	"invoice_pdf_url" varchar(255) NOT NULL,
	"invoice_paid_at" timestamp,
	"payment_method" varchar(50),
	"payment_reference" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "platform_invoice_id_unique" UNIQUE("platform","invoice_id")
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_platform_invoice_id_unique";--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_orders_id_fk" FOREIGN KEY ("order") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoices_order_idx" ON "invoices" USING btree ("order");--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "invoice_id";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "invoice_generated_at";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "invoice_paid_at";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "invoice_pdf_url";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "payment_method";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "payment_reference";