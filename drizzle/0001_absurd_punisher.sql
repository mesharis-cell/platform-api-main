ALTER TABLE "companies" ADD COLUMN "platform_margin_percent" numeric(5, 2) DEFAULT '25.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "contact_email" varchar(255);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "contact_phone" varchar(50);