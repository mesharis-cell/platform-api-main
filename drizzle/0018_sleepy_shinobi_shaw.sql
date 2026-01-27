CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"country_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cities_platform_country_name_unique" UNIQUE("platform_id","country_id","name")
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "countries_platform_name_unique" UNIQUE("platform_id","name")
);
--> statement-breakpoint
ALTER TABLE "transport_rates" RENAME COLUMN "emirate" TO "city_id";--> statement-breakpoint
ALTER TABLE "transport_rates" DROP CONSTRAINT "transport_rates_unique";--> statement-breakpoint
DROP INDEX "transport_rates_lookup_idx";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "warehouse_ops_rate" numeric(10, 2) DEFAULT '25.20' NOT NULL;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cities_platform_idx" ON "cities" USING btree ("platform_id");--> statement-breakpoint
CREATE INDEX "cities_country_idx" ON "cities" USING btree ("country_id");--> statement-breakpoint
CREATE INDEX "countries_platform_idx" ON "countries" USING btree ("platform_id");--> statement-breakpoint
ALTER TABLE "transport_rates" ADD CONSTRAINT "transport_rates_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transport_rates_lookup_idx" ON "transport_rates" USING btree ("platform","city_id","trip_type","vehicle_type");--> statement-breakpoint
ALTER TABLE "transport_rates" ADD CONSTRAINT "transport_rates_unique" UNIQUE("platform","company","city_id","area","trip_type","vehicle_type");