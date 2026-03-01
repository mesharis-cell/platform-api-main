ALTER TABLE "platforms"
ADD COLUMN "vat_percent" numeric(5, 2) DEFAULT '0.00' NOT NULL;

ALTER TABLE "companies"
ADD COLUMN "vat_percent_override" numeric(5, 2);

ALTER TABLE "prices"
ADD COLUMN "vat_percent" numeric(5, 2) DEFAULT '0' NOT NULL;

UPDATE "prices" AS p
SET "vat_percent" = COALESCE(c."vat_percent_override", pl."vat_percent", 0)
FROM "orders" AS o
INNER JOIN "companies" AS c ON c."id" = o."company"
INNER JOIN "platforms" AS pl ON pl."id" = o."platform_id"
WHERE p."entity_type" = 'ORDER'
  AND p."entity_id" = o."id";

UPDATE "prices" AS p
SET "vat_percent" = COALESCE(c."vat_percent_override", pl."vat_percent", 0)
FROM "inbound_requests" AS ir
INNER JOIN "companies" AS c ON c."id" = ir."company_id"
INNER JOIN "platforms" AS pl ON pl."id" = ir."platform_id"
WHERE p."entity_type" = 'INBOUND_REQUEST'
  AND p."entity_id" = ir."id";

UPDATE "prices" AS p
SET "vat_percent" = COALESCE(c."vat_percent_override", pl."vat_percent", 0)
FROM "service_requests" AS sr
INNER JOIN "companies" AS c ON c."id" = sr."company_id"
INNER JOIN "platforms" AS pl ON pl."id" = sr."platform_id"
WHERE p."entity_type" = 'SERVICE_REQUEST'
  AND p."entity_id" = sr."id";
