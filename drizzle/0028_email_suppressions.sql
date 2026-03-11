ALTER TYPE "public"."notification_status" ADD VALUE IF NOT EXISTS 'SKIPPED';

CREATE TABLE IF NOT EXISTS "email_suppressions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "platform_id" uuid NOT NULL,
    "email" varchar(255) NOT NULL,
    "reason" varchar(100) DEFAULT 'UNSUBSCRIBED' NOT NULL,
    "unsubscribed_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
    ALTER TABLE "email_suppressions"
        ADD CONSTRAINT "email_suppressions_platform_id_platforms_id_fk"
        FOREIGN KEY ("platform_id")
        REFERENCES "public"."platforms"("id")
        ON DELETE cascade
        ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_suppressions_platform_email_idx"
    ON "email_suppressions" USING btree ("platform_id", "email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_suppressions_email_idx"
    ON "email_suppressions" USING btree ("email");
