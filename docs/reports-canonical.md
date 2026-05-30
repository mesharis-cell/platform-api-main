# Canonical Reports — Spec Brief

Authoritative spec for the two reports we run regularly out-of-band against
prod for client deliverables. Reference implementations live as CLI scripts
under `src/db/scripts/`:

- `export-issuance.ts` — issuance log
- `export-stock-movements.ts` — stock movements ledger

These exist as CLI scripts (not `/export` endpoints) for the same reasons the
asset-catalog export does: they run against the chosen APP_ENV's DB locally,
have no t2.micro memory ceiling, and are explicitly out-of-band. The spec
below is the contract — both scripts are the reference implementations,
ready to be lifted into proper `/export` endpoints + admin Reports tab cards
when that work is prioritized.

---

## Shared design rules (apply to both reports)

### Multi-tenant first

- Every report takes `--company-id` (required). **Nothing hard-coded to any
  tenant.** Title bar, "<COMPANY> ITEM CODE" header, etc. all derive from
  the company name fetched at runtime.

### Category filter is generic, never tenant-specific

- `--exclude-category <name>` (repeatable, case-insensitive) and
  `--include-category <name>` (repeatable, mutually exclusive with exclude).
- Default: include everything. The category exclusion exists because Red Bull
  doesn't want Beverages in _their_ issuance log — **but the report must work
  identically for tenants who don't have a Beverages category at all** (no
  match → no exclusion, silent). The string is matched against
  `assets.category` (post-squash that's where the curated category lives,
  after migration 0061 + the Red Bull category fix).

### Date filter is optional

- `--date-from YYYY-MM-DD` and `--date-to YYYY-MM-DD` are both optional.
  Default: all-time. Title labels reflect whichever bounds are set.

### Run path

```
APP_ENV=<env> bun src/db/scripts/<script>.ts -- <flags>
```

APP_ENV must be set; scripts call `assertAppEnv(["staging","production","testing"])`
at module load.

### Output

- Defaults to `./<company>-<report>-<YYYY-MM-DD>.xlsx` in the cwd.
- `--out <path>` overrides.

---

## Report 1 — Issuance Log

**Audience.** Client-facing. PMG runs it on-demand and shares the XLSX.

**Purpose.** Per-document log of every physical item that has been issued
(delivered for orders, picked up for self-pickups), with the lifecycle
outcome (OUT / RETURNED / PARTIAL / CONSUMED), the asset's owning team,
and the permanent-placement flag. Grouped by document with subtotals.

### Scope (status filter)

- **Orders:** `order_status ∈ {READY_FOR_DELIVERY, IN_TRANSIT, DELIVERED,
IN_USE, DERIG, AWAITING_RETURN, RETURN_IN_TRANSIT, CLOSED}` — i.e. the
  outbound scan has happened. Excludes pre-dispatch (DRAFT..IN_PREPARATION) - DECLINED + CANCELLED.
- **Self-pickups:** `self_pickup_status ∈ {PICKED_UP, AWAITING_RETURN,
CLOSED}` — collector has physically taken the gear. Excludes pre-pickup +
  DECLINED + CANCELLED.
- **Self-pickup items:** `NOT spi.skipped` (skipped lines = collector chose
  not to take that item — don't log as issued).

### Document date (`doc_date`)

- For orders: `MAX(scan_events.scanned_at WHERE scan_type='OUTBOUND')`,
  fallback to `o.created_at`.
- For SPs: same pattern via `scan_events.self_pickup_id`.

### Outcome derivation (per item)

| Condition                                                    | Outcome  |
| ------------------------------------------------------------ | -------- |
| `returned_qty >= delivered_qty`                              | RETURNED |
| `returned_qty > 0`                                           | PARTIAL  |
| `consumed_qty > 0` (WRITE_OFF/CONSUMED on this asset+entity) | CONSUMED |
| otherwise                                                    | OUT      |

`returned_qty` = `SUM(scan_event_assets.quantity)` where the scan is INBOUND
and the parent is the same order / SP. `consumed_qty` = `SUM(ABS(delta))`
from `stock_movements` where `movement_type='WRITE_OFF' AND
write_off_reason='CONSUMED'` linked to that entity + asset.

### Layout — single tab "Issuance"

Title row 1 (merged): `<Company> — Issuance Log (<range label>)`
Header row 2 (frozen). Beneath: one block per document — data rows + a
bold `Subtotal — <REF>` row + 1 empty spacer row. Grand total at the foot.

**Columns (14):**

| #   | Header                | Notes                                                                                                          |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | DATE                  | DD.MM.YYYY                                                                                                     |
| 2   | TYPE                  | DELIVERY / SELF-PICKUP                                                                                         |
| 3   | KADENCE REFERENCE     | ORD-… / SPK-…                                                                                                  |
| 4   | VENUE                 | order.venue_name (empty for SPs)                                                                               |
| 5   | CITY                  | (empty for SPs)                                                                                                |
| 6   | USER                  | order.created_by user; for SPs `COALESCE(creator, collector_name)`                                             |
| 7   | PERMANENT             | YES / NO from `is_permanent_placement`                                                                         |
| 8   | `<COMPANY>` ITEM CODE | `legacy_asset_families.company_item_code` (via `assets.group_id = laf.id`). Header text uppercase-companyName. |
| 9   | ITEM DESCRIPTION      | `COALESCE(legacy_asset_families.name, asset_name snapshot)`                                                    |
| 10  | TEAM                  | `teams.name` via `assets.team_id`                                                                              |
| 11  | QUANTITY              | `delivered_qty`                                                                                                |
| 12  | OUTCOME               | colored cell: RETURNED green / PARTIAL yellow / CONSUMED orange / OUT red                                      |
| 13  | RETURNED QTY          | int                                                                                                            |
| 14  | COMMENTS              | `Collector: <name>` for SPs, else empty                                                                        |

### Subtotal row

- "Subtotal — `<REF>`" label in the DESCRIPTION column (#9).
- QUANTITY (#11) = live `=SUM(…)` over that group's rows.
- RETURNED QTY (#13) = live `=SUM(…)` over that group's rows.
- Bold + light-gray fill.

### Grand total

- "GRAND TOTAL — `<Company>`" label, amber fill, bold.
- QUANTITY + RETURNED QTY = live SUM over the per-doc subtotal cells.

### Visual rules

- No wrapText anywhere.
- Frozen rows 1+2.
- 1 empty spacer row after each subtotal (before the next document's block).
- Sort: `doc_date ASC` (oldest → newest).

### CLI

```
APP_ENV=<env> bun src/db/scripts/export-issuance.ts -- \
    --company-id <uuid>                    # required
    [--date-from YYYY-MM-DD]
    [--date-to YYYY-MM-DD]
    [--exclude-category <name>]            # repeatable
    [--include-category <name>]            # repeatable; mutually exclusive
    [--out <path>]
```

---

## Report 2 — Stock Movements Ledger

**Audience.** Internal + client for stock reconciliation. Pivoted "Cans-Mar"
layout: rows are events, columns are asset families.

**Purpose.** Show every quantity-impacting movement against a chosen set of
families (typically all families in one category for one company), with
opening + closing anchors so finance can sum any column and self-validate
via `Closing = Opening + Σ(events)`.

### Scope

- `--company-id` (required) — scopes families + movements to one tenant.
- One of:
    - `--category <name>` — pivot over all families (=groups) whose assets
      fall in this category.
    - `--group-id <uuid>` (repeatable) — explicit groups to pivot.
- Beverages excluded? **No — never built in.** If the user wants to scope
  to beverages they pass `--category Beverages`; to exclude beverages from
  a larger run they… don't; this report is always category- or group-scoped
  by design (pivot tables only make sense when scoped).

### Date filter

- `--date-from`, `--date-to` optional (in-window movements are rendered as
  event rows; out-of-window movements drive the opening/closing rewinds).

### Family selection mechanics (post-squash)

- Pivot columns = distinct `(assets.group_id, assets.group_name)` after the
  scope filter is applied. Same group_id across multiple asset rows
  collapses to one column.
- `assets.group_id` carries the historical family id (backfilled in
  migration 0061), so we can still join to `legacy_asset_families` for the
  curated category, opening/closing arithmetic, etc.
- Per-family closing read = `SUM(assets.available_quantity)` over the group's
  live assets.

### Layout

Title row, header row, then in order:

1. **OPENING STOCK** (`opening stock (<date>)` when `--date-from` set) — always
   populated. When opening_qty isn't supplied by caller, it's derived:
   `opening = closing − Σ(in-window event deltas)` so the closing formula
   has an anchor.
2. **Event rows** — one row per leg of one event. Columns: `Date | Requested
By | Purpose & Details | <family deltas…>`. Sorted by `created_at ASC`.
3. **closing stock** (`closing stock (<date>)` when `--date-to` set) — live
   formula `=opening + SUM(events)` per family column. Cached result also
   written for visual sanity before Excel recomputes.
4. **stock count on the `<today>`** — blank, for manual physical count.
5. **DIFFERENCE** — live formula `=IF(count="","",count-closing)`.

### What's NOT rendered

- `WRITE_OFF / CONSUMED` rows are dropped entirely. `|CONSUMED| = |OUT| −
|RET| − |WO|` and showing CONSUMED on top would double-count and pollute
  the equation. Removing it makes `Closing = Opening + ADJ − OUT + RET −
WO` clean and self-validating.
- **No** TOTAL rows (TOTAL OUT / TOTAL RETURNED / TOTAL CONSUMED / TOTAL
  ADJUSTMENTS / TOTAL WRITE-OFFS / OPEN AT VENUE). All deliberately
  removed. Only two formula rows remain: closing + DIFFERENCE.

### Visual rules

- Frozen title + header + first 3 columns (`xSplit: 3, ySplit: 2`).
- Positive deltas green, negative red.
- Light-gray fill on the opening / closing rows.

### Leg-key + grouping semantics

Each movement is grouped into a leg row by `(entity, movement_type,
write_off_reason, outbound_ad_hoc_reason)`. Same order's OUTBOUND, INBOUND,
and any WRITE_OFFs become **separate rows** in the chronological list. Same
order's multiple OUTBOUND scans (across a multi-day dispatch) collapse to
one OUTBOUND row, summing the deltas.

### Closing/opening rewind formula

`closing(T) = current_available − Σ(deltas where movement_type ∈ {OUTBOUND,
INBOUND, WRITE_OFF (non-CONSUMED), OUTBOUND_AD_HOC, ADJUSTMENT, INITIAL}
AND created_at > T)`.

This is "rewind the post-T warehouse-count deltas from today's count". It
excludes CONSUMED (those cans never returned to warehouse so excluding
respects the equation). Opening uses the same formula at `T = date_from`,
or is derived from `closing − Σevents` when no `date_from` is given.

### CLI

```
APP_ENV=<env> bun src/db/scripts/export-stock-movements.ts -- \
    --company-id <uuid>                    # required
    (--category <name> | --group-id <uuid>)# at least one required
    [--group-id <uuid>] …                  # repeatable
    [--date-from YYYY-MM-DD]
    [--date-to YYYY-MM-DD]
    [--out <path>]
```

---

## Open work to lift these into the product properly

Both scripts are runnable today, but the longer-term goal is to land them
as proper `/export` endpoints + admin Reports tab cards. Outstanding items
for that work:

1. **Service layer.** Lift each script's query + XLSX build into a service
   under `src/app/modules/export/` (sibling to `exportAccountsReconciliationService`
   etc.). Reuse the existing CSV/XLSX response helpers.
2. **Route + controller.** Wire `/export/issuance` and `/export/stock-movements`.
   Auth: `ADMIN` only for both (these expose internal context — keep gated).
   Permissions: re-use `ORDERS_EXPORT` for issuance, `STOCK_MOVEMENTS_READ`
   for the ledger.
3. **Admin Reports tab.** Card per report with company picker + date pickers
    - the dynamic category filter. Mirror the layout pattern in
      `admin/src/app/reports/page.tsx`.
4. **Row-count + size guards.** The asset-catalog OOM is the cautionary tale.
   Issuance will be small (a few thousand rows worst case). Stock movements
   pivot widens fast with many families — cap at ~50 families per export and
   tell the user to narrow the category/group filter.
5. **Pernod data quality.** Pernod's `assets.category` holds brand names, not
   categories. The category-exclude filter silently no-ops there. Pernod
   needs a re-categorisation pass before its reports are reliable. Separate
   work item — not blocking these scripts for Red Bull / Bacardi.

---

## Why these two and not the others

| Report                      | Status                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Issuance log (this spec)    | Canonical — locked.                                                                                                                        |
| Stock movements (this spec) | Canonical — locked.                                                                                                                        |
| Charges / cost view         | **Shelved.** Was Tab 2 of the issuance workbook briefly; dropped per the lock-in conversation. Easy to revive later off the same patterns. |
| Accounts reconciliation     | Lives on `feature/reports-xlsx-client-friendly` (pre-squash, stale). Not refreshed here; revive when needed.                               |
| Asset catalog with photos   | Has its own CLI on master historically; safe to recreate when needed.                                                                      |
