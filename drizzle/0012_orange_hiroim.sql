CREATE TABLE "otp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"otp" varchar(6) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "otp" ADD CONSTRAINT "otp_platform_platforms_id_fk" FOREIGN KEY ("platform") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_email_idx" ON "otp" USING btree ("email");--> statement-breakpoint
CREATE INDEX "otp_platform_idx" ON "otp" USING btree ("platform");