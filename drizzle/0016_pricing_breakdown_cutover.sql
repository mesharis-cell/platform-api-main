ALTER TABLE "prices" ADD COLUMN "entity_type" "invoice_type";
--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "entity_id" uuid;
--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "breakdown_lines" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint

UPDATE "prices" p
SET
    "entity_type" = 'ORDER',
    "entity_id" = o.id
FROM "orders" o
WHERE o.order_pricing_id = p.id
  AND p.entity_type IS NULL;
--> statement-breakpoint

UPDATE "prices" p
SET
    "entity_type" = 'INBOUND_REQUEST',
    "entity_id" = ir.id
FROM "inbound_requests" ir
WHERE ir.request_pricing_id = p.id
  AND p.entity_type IS NULL;
--> statement-breakpoint

UPDATE "prices" p
SET
    "entity_type" = 'SERVICE_REQUEST',
    "entity_id" = sr.id
FROM "service_requests" sr
WHERE sr.request_pricing_id = p.id
  AND p.entity_type IS NULL;
--> statement-breakpoint

UPDATE "prices"
SET "breakdown_lines" = jsonb_strip_nulls(
    jsonb_build_array(
        jsonb_build_object(
            'line_id', 'BASE_OPS',
            'line_kind', 'BASE_OPS',
            'category', 'BASE_OPS',
            'label', 'Base Operations',
            'quantity', 1,
            'unit', 'service',
            'buy_unit_price', COALESCE(base_ops_total::numeric, 0),
            'buy_total', COALESCE(base_ops_total::numeric, 0),
            'sell_unit_price',
                ROUND(COALESCE(base_ops_total::numeric, 0) * (1 + COALESCE(margin_percent::numeric, 0) / 100), 2),
            'sell_total',
                ROUND(COALESCE(base_ops_total::numeric, 0) * (1 + COALESCE(margin_percent::numeric, 0) / 100), 2),
            'billing_mode', 'BILLABLE',
            'source', jsonb_build_object(
                'mode', 'LEGACY_MIGRATION',
                'service_type_id', NULL,
                'service_type_name_snapshot', NULL,
                'service_type_rate_snapshot', NULL
            ),
            'is_voided', false,
            'notes', NULL,
            'created_by', calculated_by,
            'created_at', calculated_at,
            'updated_by', calculated_by,
            'updated_at', calculated_at,
            'voided_by', NULL,
            'voided_at', NULL,
            'void_reason', NULL
        ),
        CASE
            WHEN COALESCE((line_items->>'catalog_total')::numeric, 0) > 0 THEN
                jsonb_build_object(
                    'line_id', 'LEGACY_RATE_CARD',
                    'line_kind', 'RATE_CARD',
                    'category', 'OTHER',
                    'label', 'Legacy Catalog Services',
                    'quantity', 1,
                    'unit', 'service',
                    'buy_unit_price', COALESCE((line_items->>'catalog_total')::numeric, 0),
                    'buy_total', COALESCE((line_items->>'catalog_total')::numeric, 0),
                    'sell_unit_price',
                        ROUND(COALESCE((line_items->>'catalog_total')::numeric, 0) * (1 + COALESCE(margin_percent::numeric, 0) / 100), 2),
                    'sell_total',
                        ROUND(COALESCE((line_items->>'catalog_total')::numeric, 0) * (1 + COALESCE(margin_percent::numeric, 0) / 100), 2),
                    'billing_mode', 'BILLABLE',
                    'source', jsonb_build_object(
                        'mode', 'LEGACY_MIGRATION',
                        'service_type_id', NULL,
                        'service_type_name_snapshot', 'Legacy Catalog Services',
                        'service_type_rate_snapshot', COALESCE((line_items->>'catalog_total')::numeric, 0)
                    ),
                    'is_voided', false,
                    'notes', NULL,
                    'created_by', calculated_by,
                    'created_at', calculated_at,
                    'updated_by', calculated_by,
                    'updated_at', calculated_at,
                    'voided_by', NULL,
                    'voided_at', NULL,
                    'void_reason', NULL
                )
            ELSE NULL
        END,
        CASE
            WHEN COALESCE((line_items->>'custom_total')::numeric, 0) > 0 THEN
                jsonb_build_object(
                    'line_id', 'LEGACY_CUSTOM',
                    'line_kind', 'CUSTOM',
                    'category', 'OTHER',
                    'label', 'Legacy Custom Services',
                    'quantity', 1,
                    'unit', 'service',
                    'buy_unit_price', COALESCE((line_items->>'custom_total')::numeric, 0),
                    'buy_total', COALESCE((line_items->>'custom_total')::numeric, 0),
                    'sell_unit_price',
                        ROUND(COALESCE((line_items->>'custom_total')::numeric, 0) * (1 + COALESCE(margin_percent::numeric, 0) / 100), 2),
                    'sell_total',
                        ROUND(COALESCE((line_items->>'custom_total')::numeric, 0) * (1 + COALESCE(margin_percent::numeric, 0) / 100), 2),
                    'billing_mode', 'BILLABLE',
                    'source', jsonb_build_object(
                        'mode', 'LEGACY_MIGRATION',
                        'service_type_id', NULL,
                        'service_type_name_snapshot', 'Legacy Custom Services',
                        'service_type_rate_snapshot', COALESCE((line_items->>'custom_total')::numeric, 0)
                    ),
                    'is_voided', false,
                    'notes', NULL,
                    'created_by', calculated_by,
                    'created_at', calculated_at,
                    'updated_by', calculated_by,
                    'updated_at', calculated_at,
                    'voided_by', NULL,
                    'voided_at', NULL,
                    'void_reason', NULL
                )
            ELSE NULL
        END
    )
)
WHERE jsonb_array_length("breakdown_lines") = 0;
--> statement-breakpoint

ALTER TABLE "prices" ALTER COLUMN "entity_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "entity_id" SET NOT NULL;
--> statement-breakpoint

CREATE INDEX "prices_entity_lookup_idx" ON "prices" USING btree ("platform_id","entity_type","entity_id");
--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_platform_entity_unique"
    UNIQUE("platform_id","entity_type","entity_id");
--> statement-breakpoint

ALTER TABLE "prices" DROP COLUMN "warehouse_ops_rate";
--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN "base_ops_total";
--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN "logistics_sub_total";
--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN "transport";
--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN "line_items";
--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN "margin";
--> statement-breakpoint
ALTER TABLE "prices" DROP COLUMN "final_total";
