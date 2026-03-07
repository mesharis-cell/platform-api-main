ALTER TABLE "collections" ADD COLUMN IF NOT EXISTS "team" uuid;

DO $$
BEGIN
    ALTER TABLE "collections"
    ADD CONSTRAINT "collections_team_teams_id_fk"
    FOREIGN KEY ("team")
    REFERENCES "public"."teams"("id")
    ON DELETE set null
    ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "collections_team_idx" ON "collections" USING btree ("team");
