-- Pre-cutover audit queries for migration 0061_squash_families.
--
-- RUN ON STAGING (refreshed from prod) BEFORE applying migration 0061.
-- All queries return diagnostic data; nothing here mutates state.
-- Expected results are documented inline. Halt the migration if any of the
-- "must-be-zero" queries return rows.

-- ─── Q1. Total live assets, segmented by tracking_method ────────────────────
SELECT tracking_method, COUNT(*) AS live_count
FROM assets
WHERE deleted_at IS NULL
GROUP BY tracking_method;
-- Expected: counts per INDIVIDUAL / BATCH. No NULLs (column is NOT NULL today).

-- ─── Q2. Asset families breakdown by stock_mode + company ──────────────────
SELECT company_id, stock_mode, COUNT(*) AS family_count
FROM asset_families
WHERE deleted_at IS NULL
GROUP BY company_id, stock_mode
ORDER BY company_id, stock_mode;
-- Sanity check: matches admin "Families" tab counts per tenant.

-- ─── Q3. Raw asset count (family_id IS NULL — will stay raw post-squash) ────
SELECT COUNT(*) AS raw_asset_count
FROM assets
WHERE deleted_at IS NULL AND family_id IS NULL;
-- Expected: small or zero. Each raw asset must have category/weight/volume
-- defined directly. Spot-check a few to confirm.

-- ─── Q4. Orphan assets (family_id points to deleted/missing family) ─────────
SELECT COUNT(*) AS orphan_count
FROM assets a
WHERE a.deleted_at IS NULL
  AND a.family_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM asset_families af
    WHERE af.id = a.family_id AND af.deleted_at IS NULL
  );
-- MUST BE ZERO. If > 0: orphans will end up with group_id pointing at a
-- deleted family row. Either clean up before migration OR accept that those
-- orphans will be NULL group_id post-migration (effectively raw).

-- ─── Q5. Cross-mode drift within a family (must not exist; verify) ─────────
SELECT a.family_id, COUNT(DISTINCT a.tracking_method) AS mode_variants
FROM assets a
WHERE a.deleted_at IS NULL AND a.family_id IS NOT NULL
GROUP BY a.family_id
HAVING COUNT(DISTINCT a.tracking_method) > 1;
-- MUST BE ZERO. Mixed-mode siblings would violate the post-squash invariant
-- "siblings in a group share stock_mode". Manual cleanup required if any rows
-- return (likely a tracking_method drift on an INDIVIDUAL-tagged batch row).

-- ─── Q6. Family-level low_stock_threshold usage ────────────────────────────
SELECT COUNT(*) AS families_with_threshold
FROM asset_families
WHERE deleted_at IS NULL AND low_stock_threshold IS NOT NULL;
-- Per-asset migration of threshold runs in Stage B.

-- ─── Q7. stock_movements rows linked via asset_family_id ───────────────────
SELECT COUNT(*) AS stock_movement_family_links
FROM stock_movements
WHERE asset_family_id IS NOT NULL AND asset_id IS NOT NULL;
-- Audit info: these rows keep asset_id linkage (primary). The
-- asset_family_id FK is dropped post-migration; column kept as plain uuid.

-- ─── Q8. Commerce rules with target.kind = 'FAMILY' ────────────────────────
SELECT COUNT(*) AS family_kind_target_rules
FROM commerce_rules
WHERE deleted_at IS NULL AND target->>'kind' = 'FAMILY';
-- Stage B rewrite turns these into kind='GROUP', family_id → group_id.
-- If 0, the UPDATE is a no-op.

-- ─── Q9. Commerce rules with predicate.companion_target.kind = 'FAMILY' ────
SELECT COUNT(*) AS companion_family_rules
FROM commerce_rules
WHERE deleted_at IS NULL
  AND predicate->>'kind' = 'COMPANION_REQUIRED'
  AND predicate->'companion_target'->>'kind' = 'FAMILY';
-- Stage B nested rewrite covers these.

-- ─── Q10. Family name uniqueness sanity (UNIQUE constraint should make 0) ──
SELECT platform_id, company_id, name, COUNT(*) AS dups
FROM asset_families
WHERE deleted_at IS NULL
GROUP BY platform_id, company_id, name
HAVING COUNT(*) > 1;
-- MUST BE ZERO (the existing DB UNIQUE constraint guarantees this).
-- If any rows return: hard-stop. Manual de-dup required before squash.

-- ─── Q11. Per-tenant size summary (estimate migration UPDATE scope) ────────
SELECT p.id AS platform_id, c.id AS company_id, c.name AS company_name,
       COUNT(af.id) AS family_count,
       COUNT(DISTINCT a.id) AS asset_count
FROM platforms p
JOIN companies c ON c.platform_id = p.id
LEFT JOIN asset_families af ON af.company_id = c.id AND af.deleted_at IS NULL
LEFT JOIN assets a ON a.family_id = af.id AND a.deleted_at IS NULL
GROUP BY p.id, c.id, c.name
ORDER BY c.name;
-- Visibility of data shape per tenant. Helps estimate Stage B UPDATE wall-clock.

-- ─── Q12. Confirm collection_items has tracking-method-aware references ───
SELECT a.tracking_method, COUNT(ci.id) AS collection_items_count
FROM collection_items ci
JOIN assets a ON a.id = ci.asset
WHERE ci.deleted_at IS NULL AND a.deleted_at IS NULL
GROUP BY a.tracking_method;
-- Sanity: validates collection items that depend on stock_mode-based qty
-- enforcement (SERIALIZED items must have default_quantity = 1).
