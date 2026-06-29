# Reports System — Direction & Refactor Plan

Authoritative direction for the reports refactor/cleanup. This supersedes the
ad-hoc export churn. The two locked canonical reports (`reports-canonical.md`)
are the **quality bar**; this doc is the **system** that brings every report up
to that bar under one coherent, pluggable framework.

Status: **direction locked + workflow-hardened, implementation not started.**
A 39-agent design/adversarial-verify pass (§2A) reviewed all 12 reports against
live code — 0 came back BROKEN, 11/12 need a row cap, 3 carry client-leak
columns. Per-report specs + verdicts live in `reports-spec-appendix.md`. Numbers
cannot be verified until the staging refresh (prod → staging copy); §6 + §2A
list exactly what to sanity-check then.

---

## 1. The situation (why this is a consolidation, not a greenfield)

A reports system **already exists** and is weak — which is why nobody uses it:

- **API:** `src/app/modules/export/` — 12 live endpoints, **all flat CSV** via
  `Papa.unparse()`. No formatting, no subtotals, no formulas. Plus
  `/export/asset-catalog` **stubbed (503)** since the 2026-04-23 OOM incident.
- **Admin:** `admin/src/app/reports/page.tsx` already renders 12 cards in 3
  sections, with a working blob-download pattern and `analytics:view_reports_page`
  gating. The card list is **hardcoded** (`EXPORT_CARDS` array).
- Nav entry + page permission already exist in `admin-route-registry.tsx` /
  `permission-map.ts`.

Every report brainstormed for this effort is **already half-present** as a thin CSV:

| Target report                   | Today                                                                    |
| ------------------------------- | ------------------------------------------------------------------------ |
| Accounts reconciliation         | `/export/accounts-reconciliation` — CSV, admin-only                      |
| Asset utilization               | `/export/asset-utilization` — CSV                                        |
| Current stock / state of assets | split across `/export/stock-report` + `/export/assets-out` — CSV         |
| Asset catalogue (±photos)       | `/export/asset-catalog` — **stubbed** since the OOM                      |
| Issuance                        | `/export/client-issuance-log` — CSV — _canonical XLSX script supersedes_ |
| Stock movements                 | `/export/stock-movements` — CSV — _canonical XLSX script supersedes_     |

The two canonical XLSX scripts (`src/db/scripts/export-issuance.ts`,
`export-stock-movements.ts`) are the reference implementations for what "good"
looks like. They share ~150 lines of duplicated helpers (CLI parsing, company
lookup, ExcelJS setup, date/column helpers, filename logic) — and they already
diverge (two different column-letter algorithms, two date-fn names, two color
palettes, two filename conventions). That divergence is the coherence problem
in miniature; the shared toolkit (§4.2) fixes it.

---

## 2. Locked decisions

| #   | Decision              | Choice                                                                                                                                                                                                                  |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Output format         | **XLSX everywhere.** One styling toolkit, applied uniformly. No CSV branch. (If a raw-CSV need ever surfaces, the `formats` field on a definition makes it a one-line add — but default and only format today is XLSX.) |
| 2   | Heavy / photo reports | **Asset Catalogue WITH photos stays a CLI script** (`export-asset-catalog.ts`), permanently out-of-band. The photo-embedding path never runs in the API process. A no-photo catalogue is a normal dashboard report.     |
| 3   | Audience              | **Admin dashboard first; client portal as fast-follow** on the same framework. Cost / revenue / accounts-recon-margin reports are **admin-only forever** — never exposed to the client subset.                          |
| 4   | Scope                 | **Big-bang.** Every dashboard report is rebuilt as a canonical XLSX on the new registry in one cutover (phased internally, §11). No leaving old CSVs in place.                                                          |

---

## 2A. Workflow hardening — verified findings, escalations & cross-cutting constants

A 39-agent workflow (12 design → 24 adversarial numbers/safety skeptics → 3
synthesizers) reviewed every report against live code. **0 reports came back
BROKEN; 11/12 need a row cap; 3 carry client-leak columns.** Full per-report
specs + verdicts: `reports-spec-appendix.md`. The findings below are part of the
direction, not commentary.

### 2A.1 Verified must-fix (grounded in code)

- **LIVE CLIENT LEAK — fix regardless of refactor pace.** The _current_ orders
  CSV already ships `ORDER BASE OPS (BUY)` + `ORDER MARGIN %` on a
  client-reachable export (`export.services.ts:197-198`); inbound-log ships a
  cost-side `BASE OPS TOTAL` (`projectByRole('ADMIN').base_ops_total =
buy_base_ops_total`, `pricing.service.ts:964`). `audience: ADMIN_CLIENT` gates
  the _card_, not _columns_ — `getScopedCompanyId` (`export.services.ts:87`) only
  scopes a CLIENT to its own company. **Fix:** `clientColumns` on the definition
  (§3.1) + a runner that physically drops any header not listed on the client
  mount. Present-tense exposure, not a future risk.
- **`blocked_from`/`blocked_until` are `timestamp(mode:'date')`, NOT date-grain**
  (`schema.ts:2386-2387`). Every date-window report touching `asset_bookings`
  (current-stock OUT-as-of, asset-utilization clip) must compare `::date` on both
  sides (or normalize to start/end-of-day in a pinned TZ) or boundary-day
  bookings silently drop — wrong exactly at the window edges finance eyeballs.
- **SQL injection on port.** Canonical scripts build SQL via `sql.raw` with
  interpolated `companyId`/`category`/`group-id` (`export-stock-movements.ts:166,204,232,320`;
  `export-issuance.ts:106-114`). Fine as CLI; **injectable** as `/reports/:key/run`.
  Re-parameterize ALL queries to bound `sql` placeholders / `inArray()` before HTTP.
- **Bind `ACTIVE_PARENT_STATUSES_FOR_BOOKINGS` from `availability.core.ts`** via
  `inArray()` — never re-type the status list inline (that inline-drift is what
  undercounted DERIG/RETURN_IN_TRANSIT before).
- **`platformId` resolved in `ctx`, never a param.** `assets.platform_id` is a
  literal column; `companies/orders/brands/zones` alias `platform`→`platform_id`.
  The toolkit's `resolveCompanyContext` owns this once.
- **Money fan-out double-count.** orders/inbound repeat document-level money on
  every item row; any footer `SUM` over those cells multiplies by item count.
  Aggregate-before-join or sum only distinct-document cells. (Most-likely "totals
  are 5× too big" bug at ship.)

### 2A.2 Spec-vs-code escalations (need a human decision)

- **Stock-movements rewind is a spec-vs-code conflict — the LOCKED canonical doc
  is wrong.** `reports-canonical.md:237` rewinds a `SUM(available_quantity)`
  anchor by deltas including OUTBOUND/INBOUND/INITIAL — but those are
  **audit-only and do NOT move `available_quantity`** (gotcha #39). So on-sheet
  `Closing = Opening + Σ(events)` disagrees with the rewound anchor whenever a
  `date_to` and an OUTBOUND/INBOUND event coexist. Code > doc, so the locked spec
  must be corrected, not "ported faithfully." **DECISION NEEDED:** rewind the
  _available_quantity_ ledger using ADJUSTMENT + OUTBOUND*AD_HOC only, **or**
  rebuild on a \_total_quantity* ledger. Blocks the pivot.
- **`orders` has no `pricing_mode` column.** The cost spec proposed a `PRICING
MODE` column + NO_COST narrative; `pricing_mode` exists only on `self_pickups`
  (`schema.ts:2200`), `resolveEntityContext` hardcodes `'STANDARD'` for ORDER
  (`pricing.service.ts:567-568`), `markEntityAsNoCost` throws for ORDER. Drop the
  column for orders; keep the `buy_total>0` divide-guard.
- **Accounts-recon / revenue must honor `client_sell_override_total`** for
  concession SRs (`getServiceRequestClientTotal`, `service-request.services.ts:117-122`)
  — sourcing SR sell purely from the prices projection reports the
  **pre-concession** (wrong) number on a tie-every-dirham report.
- **Order-grain category filter is coarse + order-history's exclude is
  backwards.** Category lives on `assets` via `order_items`, so on
  orders/cost/revenue/work-summary it's `EXISTS(item matches)` at document grain —
  one multi-category order's full value appears in two per-category runs
  (non-additive; finance double-count footgun). order-history's sketch keeps an
  order if ANY item is non-excluded — the _opposite_ of "remove Beverages". Flip
  to `NOT EXISTS(item IN excluded)` and footnote the coarseness.

### 2A.3 Cross-cutting constants — decide in P0, bake into the toolkit (one answer for all 12)

Deciding these per-report recreates the exact drift the registry exists to kill:

1. **Timezone + end-of-day date bounds.** `parseDateRange` (`export.services.ts:68`)
   does bare `new Date(date_to)` → silently drops the final day. Build
   `fmtDateBounds(from, to, tz)` expanding `date_to` to start-of-next-day (`lt`,
   not `lte`) in the platform feasibility TZ (e.g. Asia/Dubai). Pin it in
   `reports-canonical.md`.
2. **Snapshot stamping.** Snapshot reports (current-stock, asset-catalogue) have
   no native time axis — the title must stamp **"as of <DD.MM.YYYY HH:MM TZ>"**;
   windowed reports stamp "for <range>". Else a client re-running tomorrow sees
   different numbers with no explanation.
3. **Empty-state shape.** A zero-row result is a scaffold workbook (title +
   headers + "No data for these filters") — never a 404, blank file, or throw.
4. **Money/currency format.** One frozen Excel number format + currency label
   (AED-implied). VAT is per-prices-row snapshotted (gotcha #30) so a sheet can
   mix VAT rates — money reports need a "rates may vary by document" footnote.
5. **Audit log of who-ran-what.** Reports dump buy cost, margin, PII, full client
   financials; the 2026-04-22 cross-tenant leak is on record. Write a
   `report_runs` audit row (user, report, company, filters, ts) on every run.
6. **Concurrency gate.** The 2026-04-23 OOM was _concurrency_, not row count — row
   caps alone don't stop N heavy in-process ExcelJS builds stacking. Add a
   per-user/global gate (or queue) on the run endpoint.

### 2A.4 Over-engineering trims (the brief said no over-over-engineering)

- **Don't stream everything.** No streaming precedent exists; most reports are
  sub-5k rows. Keep `wb.xlsx.writeBuffer()` as default; switch to streaming only
  when `rowCap.max` exceeds ~8k. (§7 reflects this.)
- **Defer detail tabs.** current-stock "Out Detail" + asset-utilization per-asset
  tabs are additions — ship summaries first; `tabs[]` lets them land later.
- **Financial v1 = legacy scope.** Don't UNION all four priced entities now.
  Legacy cost/revenue are ORDER-only; accounts-recon is ORDER+SR. Match that for
  v1; the shared prices join makes more entities additive later.
- **Identities are QA aids, NOT runtime asserts.** Many are soft (utilization
    > 100%, AVAILABLE-vs-OUT divergence). Bake into the staging sanity script (§6),
    > never into `run()`.
- **No `formats` CSV branch yet** (decision #1) — leave it off the interface
  until a real CSV need surfaces.

---

## 3. Architecture — "one registry, everything derives"

This mirrors the codebase's existing philosophy (feature flags, workflow
definitions). One registry on the API is the single source of truth; routes,
admin cards, client cards, and the CLI scripts all derive from it.

### 3.1 The report definition

Each report is one file exporting a `ReportDefinition`:

```ts
// Refined against all 12 specs + verified code (§2A). Changes from the first draft:
// rowCap now REQUIRED; clientColumns added (the live-leak fix); operationsRoles
// added (audience doesn't capture LOGISTICS, who runs warehouse reports);
// ReportFilter gained scope/mode/default; tabs[] for per-tab caps; ctx carries
// role + isClientMount so no report re-derives the mount or the platform alias.
export type ReportSection = "INVENTORY" | "OPERATIONS" | "FINANCIAL";
export type ReportAudience = "ADMIN" | "ADMIN_CLIENT";

export interface ReportDefinition<P = Record<string, unknown>> {
    key: string; // kebab — stable id, URL segment, registry key
    label: string; // Title Case card title
    description: string;
    section: ReportSection;
    audience: ReportAudience; // ADMIN_CLIENT = the *report* may mount on client…
    clientColumns?: string[]; // …but ONLY these headers render on the client mount.
    //   Runner drops every header not listed when ctx.isClientMount.
    //   REQUIRED for leak reports: orders, inbound-log, accounts-recon.
    operationsRoles?: ("ADMIN" | "LOGISTICS")[]; // who runs it on the ops mount (default both).
    permissions: string[]; // any-of; gates card + run endpoint
    filters: ReportFilter[]; // declarative controls (admin renders per type)
    paramsSchema: ZodTypeAny; // validates RESOLVED params; MUST enforce date_from<=date_to
    //   and category include⊕exclude mutual exclusion
    rowCap: ReportRowCap; // REQUIRED — uniform OOM guard (11/12 reports need one)
    requiredFeature?: string; // optional: hide card when feature off (resolveEffectiveFeature),
    //   e.g. inbound-log → enable_inbound_requests. NEVER read features[key].
    tabs?: ReportTabSpec[]; // optional multi-sheet; cap per tab. run() still returns one wb.
    run(params: P, ctx: ReportRunContext): Promise<ExcelJS.Workbook>;
}

export interface ReportRowCap {
    max: number; // refusal threshold
    dimension: "rows" | "pivot-columns"; // stock-movements caps on ~50 FAMILY COLUMNS, not rows
    narrowHint: string; // exact "narrow your filter (…)" suffix naming the filters
    //   that actually shrink THIS report (not dates, for a snapshot)
}
export interface ReportTabSpec {
    name: string;
    rowCap?: number;
}

export interface ReportFilter {
    key: string;
    label: string;
    type: "company" | "date" | "category-include-exclude" | "group" | "status" | "team";
    required: boolean;
    scope?: "document" | "item"; // order-grain category/group is coarse EXISTS(items) — UI
    //   shows a "coarse filter" hint when "document"
    mode?: "include-only" | "include-exclude"; // stock-movements pivot is include-only
    default?: unknown; // asset-utilization defaults to trailing-365d (all-time makes
    //   utilization% meaningless); some reports default a status set
    options?: Array<{ value: string; label: string }>;
}

export interface ReportRunContext {
    db: Database;
    platformId: string; // resolved server-side, NEVER a param
    companyId: string; // every report company-scoped (multi-tenant invariant)
    companyName: string; // drives title + "<COMPANY> ITEM CODE" header
    role: "ADMIN" | "LOGISTICS" | "CLIENT";
    isClientMount: boolean; // true on client portal → drives clientColumns drop
    appEnv: AppEnv;
}
```

`filters` is the "dynamic" the brief asked for, without magic: the admin renders
the right control per `type` (a company picker, a date range, the
include/exclude category chips, etc.). Not a generic form-builder framework —
just a typed descriptor list. That's the "no over-over-engineering" line.

### 3.2 The registry

```ts
// src/app/modules/reports/registry.ts
export const reportRegistry: ReportDefinition[] = [
    issuanceReport,
    stockMovementsReport,
    currentStockReport,
    assetUtilizationReport,
    assetCatalogueReport,
    ordersReport,
    orderHistoryReport,
    inboundLogReport,
    // workSummaryReport — REMOVED (reports alignment Phase 1, 2026-06)
    accountsReconciliationReport,
    revenueReport,
    costReport,
];
```

Adding a report = add one definition file + one line here. Nothing else.

### 3.3 Shared XLSX toolkit — the coherence guarantee

`src/app/utils/report-workbook.ts` absorbs every duplicated helper and freezes
one house style. Exported surface:

- `STYLE` — frozen palette: `TITLE_FONT`, `HEADER_FILL` (`FFE0E0E0`),
  `SUBTOTAL_FILL`, `GRAND_FILL`, `SECTION_FILL`, `DIFF_FILL`, `POSITIVE_FONT`,
  `NEGATIVE_FONT`, and the `OUTCOME_FILL`/`OUTCOME_FONT` maps.
- `createReportWorkbook({ companyName, label, rangeLabel, columns })` → `{ wb, sheet }`
  with the title row (merged, bold 14) + header row (bold, `HEADER_FILL`,
  UPPERCASE) pre-built and column widths set.
- `colLetter(n)` — the **multi-letter** algorithm (A…ZZ), not the 26-cap one.
- `fmtDate(d)` → `DD.MM.YYYY`; `fmtRangeLabel(from, to)`.
- `addSubtotalRow`, `addGrandTotalRow`, `addSectionRow` — formula-aware.
- `buildPivot(...)` — the stock-movements families-across pattern.
- `freezeHeader(sheet, { xSplit?, ySplit })`.
- `reportFilename(companyName, key, date)` → `<company>-<key>-<YYYY-MM-DD>.xlsx`.
- `resolveCompanyContext(db, companyId)` → `{ platformId, companyName }` — the
  `SELECT … "platform" AS platform_id …` aliasing fix, centralized **once**.
- `streamWorkbookToResponse(wb, res, filename)` — ExcelJS streaming write to the
  HTTP response (memory §8).

Every report is built through this toolkit. That is what makes them feel like
one product instead of twelve scripts.

### 3.4 One run-path: CLI ⇄ endpoint, no drift

The canonical scripts' query + build logic moves **into the definition's
`run()`**. The CLI scripts become thin wrappers that call the same `run()` and
write the workbook to disk; the endpoint calls the same `run()` and streams it.
One code path → the out-of-band CLI and the in-product dashboard can never
drift. (The photo-catalogue is the deliberate exception: its `run()` is
CLI-only and not registered, per decision #2.)

### 3.5 API routes

```
GET /reports                  → registry metadata, filtered to the caller's
                                 permissions + audience (key, label, description,
                                 section, filters). Drives the admin/client cards.
GET /reports/:key/run?<params> → validate params (paramsSchema) → run() →
                                 stream XLSX (Content-Disposition: attachment).
```

`auth("ADMIN")` (+ `LOGISTICS` where the definition allows); per-report
`requirePermission(any-of definition.permissions)`; the client portal mount
additionally filters `audience === "ADMIN_CLIENT"`. New module
`src/app/modules/reports/`; the old `src/app/modules/export/` is removed once
the admin no longer calls `/export/*` (same cutover).

### 3.6 Admin UI

`admin/src/app/reports/page.tsx`: delete the hardcoded `EXPORT_CARDS`; fetch
`GET /reports` and render cards from the registry metadata. Filter controls
render from each card's `filters`. Reuse the existing blob-download pattern
(`responseType: "blob"`, infer ext from `Content-Type`, `createObjectURL` + `<a>`
click). Keep `AdminHeader` + the Tier-2 section/card layout.

### 3.7 Client portal (fast-follow)

Same `GET /reports`, mounted under the client routes, server-side filtered to
`audience === "ADMIN_CLIENT"`. Build after the admin section is solid.

---

## 4. Final report catalog

Big-bang target — every row is a canonical XLSX on the registry. "Replaces" =
the old CSV endpoint that goes away.

### Section: INVENTORY

| Report                          | key                 | Audience     | Replaces                        | Core source                                                                |
| ------------------------------- | ------------------- | ------------ | ------------------------------- | -------------------------------------------------------------------------- |
| Current Stock / State of Assets | `current-stock`     | ADMIN_CLIENT | `stock-report` + `assets-out`   | `assets` (available/total) + active `asset_bookings` + derived unavailable |
| Stock Movements Ledger          | `stock-movements`   | ADMIN_CLIENT | `stock-movements` (CSV)         | port of `export-stock-movements.ts`                                        |
| Asset Utilization               | `asset-utilization` | ADMIN_CLIENT | `asset-utilization` (CSV)       | `asset_bookings` windows over range, cross-checked vs scans                |
| Asset Catalogue (no photos)     | `asset-catalogue`   | ADMIN_CLIENT | `asset-catalog` (no-photo path) | `assets` + `legacy_asset_families`                                         |

> Asset Catalogue **with photos** = `export-asset-catalog.ts` CLI only (decision #2).

### Section: OPERATIONS

| Report           | key                | Audience     | Replaces                    | Core source                                                                      |
| ---------------- | ------------------ | ------------ | --------------------------- | -------------------------------------------------------------------------------- |
| Issuance Log     | `issuance`         | ADMIN_CLIENT | `client-issuance-log` (CSV) | port of `export-issuance.ts`                                                     |
| Orders Export    | `orders`           | ADMIN_CLIENT | `orders` (CSV)              | `orders` + items                                                                 |
| Order History    | `order-history`    | ADMIN_CLIENT | `order-history` (CSV)       | status history                                                                   |
| Inbound Log      | `inbound-log`      | ADMIN_CLIENT | `inbound-log` (CSV)         | inbound requests / returns                                                       |
| ~~Work Summary~~ | ~~`work-summary`~~ | —            | —                           | **❌ REMOVED — reports alignment Phase 1 (2026-06); overlapped `cost`, retired** |

### Section: FINANCIAL — **admin-only forever**

| Report                  | key                       | Audience | Replaces                        | Core source         |
| ----------------------- | ------------------------- | -------- | ------------------------------- | ------------------- |
| Accounts Reconciliation | `accounts-reconciliation` | ADMIN    | `accounts-reconciliation` (CSV) | invoices / prices   |
| Revenue Report          | `revenue`                 | ADMIN    | `revenue-report` (CSV)          | pricing sell totals |
| Cost Report             | `cost`                    | ADMIN    | `cost-report` (CSV)             | pricing buy/margin  |

12 dashboard reports + the photo-catalogue CLI carve-out.

---

## 5. Coherence standard (applies to every report)

**Naming.** key = kebab-case; `label` = Title Case; column headers = UPPERCASE;
filename = `<company>-<key>-<YYYY-MM-DD>.xlsx`.

**Multi-tenant, always.** `company_id` is a required filter on every report.
Nothing hardcoded to a tenant — title bar, the `"<COMPANY> ITEM CODE"` header,
etc. all derive from the company name resolved at runtime.

**Category filter is generic, never tenant-specific.** Where a report supports
category scoping it uses the same `include`/`exclude` (repeatable,
case-insensitive, mutually exclusive) mechanism matched against `assets.category`.
A tenant with no such category → silent no-op, identical report. (This is the
"no beverages, but not hardcoded" requirement, generalized.)

**Dates optional.** `date_from` / `date_to` optional everywhere; title label
reflects whichever bounds are set; default all-time.

**Visual house style.** Title row (merged, bold 14) → frozen header row (bold,
`HEADER_FILL`, UPPERCASE) → body → subtotal/section rows → grand total. Freeze
header always; freeze leading label columns on pivots (`xSplit`). DD.MM.YYYY
dates. Positive deltas green, negative red. No wrapText. All from `STYLE`.

---

## 6. Data-fidelity caveats — sanity-check on the staging refresh

The brief is explicit that the numbers must make sense. These are the soft
spots found during schema grounding — verify each against the prod→staging copy:

1. **"Unavailable / in-refurb" is derived, not a stored column.** It comes from
   `assets.condition = 'RED'` (+ `refurb_days_estimate`) and/or
   `status = 'MAINTENANCE'` (serialized hard-block) / `status = 'TRANSFORMED'`.
   → On Current Stock, verify the identity **`total = available + out + unavailable`**
   holds per family. If it doesn't, the derivation needs adjusting before the
   report is trustworthy.
2. **Utilization has no single clean source.** `asset_bookings` windows
   (`blocked_from`/`blocked_until` — `timestamp(mode:'date')`, so compare
   `::date`; qty × days) is the chosen signal; cross-check against `scan_events`
   OUTBOUND counts. Bookings with no matching scan = data-quality lag, not
   utilization. Note: orders book at SUBMIT now (gotcha #44) over 13 statuses, so
   booked/out counts run materially higher than the legacy post-dispatch CSVs —
   footnote the semantic shift. Self-bookings move physical units but are in no
   report — utilization under-counts and "scan, no booking" fires falsely on
   them; footnote that too.
3. **`group_id` is an unenforced correlation key** (no FK). Orphan assets
   (group_id pointing at nothing in `legacy_asset_families`) are possible →
   confirm none in scope, or the catalogue/pivot silently drops them.
4. **Stock-movements closing rewind** was spot-verified once (Energy Drink →
   1,609 = live `available_quantity`). Re-verify post-refresh across all
   families: `Closing = Opening + Σ(events)` and Closing == live sum.
5. **Pernod category data** holds brand names, not categories → the category
   filter no-ops there. Pernod needs a re-categorisation pass before its
   inventory reports are reliable. Separate work item; not blocking Red Bull /
   Bacardi.

---

## 7. Memory & safety

XLSX-everywhere + big-bang puts more memory pressure on the t2.micro than the
old CSV path. Guards:

- **Streaming.** Build via ExcelJS streaming writer to the HTTP response
  (`streamWorkbookToResponse`), not a full in-memory buffer, for any report that
  can return many rows.
- **Per-report row caps** declared on the definition; the runner refuses
  oversized jobs with a "narrow your filter" message (the asset-catalog
  pattern: ≤500 rows). Pivots (stock-movements) cap at ~50 families per run.
- **Photo path is out of process** entirely (decision #2) — the single largest
  memory risk never touches the API.
- No report loads images in the API. Ever.

---

## 8. Permissions & audience gating

- Reuse existing: `ORDERS_EXPORT`, `STOCK_MOVEMENTS_READ`, `ASSETS_READ`,
  `ANALYTICS_VIEW_REVENUE`, `ANALYTICS_TRACK_MARGIN`. Page gate stays
  `analytics:view_reports_page`.
- Clean up the dead `SELF_PICKUPS_EXPORT` / `COMPANY_EXPORT` constants (wire or
  delete — they're defined but unused).
- **Client-visibility hard line:** `cost`, `revenue`, and the margin columns of
  `accounts-reconciliation` are `audience: "ADMIN"` and must never be reachable
  from the client mount. The audience filter enforces this server-side; do not
  rely on the UI hiding a card.

---

## 9. Cross-repo ripple

- **API:** new `reports` module (`registry.ts`, controllers, routes, one
  definition file per report) + `report-workbook.ts` toolkit. **Dual-mount** the
  routes under BOTH `/operations/v1/reports` and `/client/v1/reports` — exactly
  as `/export` is dual-mounted today. Delete the entire `export` module + both
  mounts on cutover.
- **Admin:** registry-driven cards (delete `EXPORT_CARDS` + the hardcoded
  filter/option arrays); new `use-reports.ts` hook (fetch registry + blob
  runner); per-`ReportFilter.type` controls — needs a NEW category
  include/exclude chip control + a `useTeams` hook for the team filter; switch
  calls `/export/*` → `/reports/*`.
- **⚠ Warehouse (MISSED in the first draft):** `warehouse/src/app/(admin)/reports/page.tsx`
  is a LIVE LOGISTICS reports page calling 6 export endpoints (work-summary,
  orders, stock-report, stock-movements, inbound-log, client-issuance-log). It
  **404s the moment the export module is deleted** — must migrate to the
  registry-driven pattern in the SAME cutover; align `warehouse/.../permission-map.ts`.
  (Also: `warehouse/src/middleware.tsx` redirects non-LOGISTICS, contradicting
  CLAUDE.md `<app_role_boundaries>` (warehouse = LOGISTICS+ADMIN) — flag to owner;
  load-bearing for `operationsRoles`.)
- **Client (fast-follow):** `client/src/app/reports/page.tsx` ALREADY EXISTS and
  calls the `/operations/v1/export/*` mount — repoint to `/client/v1/reports`
  (audience-filtered to ADMIN_CLIENT) in the same cutover or it 404s. Leak
  columns physically omitted via `clientColumns`.
- **Permissions:** map to existing perms (current-stock/asset-\* → `assets:read`;
  issuance/orders/order-history/inbound/work-summary/accounts-recon →
  `orders:export`; stock-movements → `stock_movements:read`; revenue → any-of
  `analytics:view_revenue` + `orders:export`). **DELETE** dead `SELF_PICKUPS_EXPORT`
  (+ its `backfill-self-pickup-permissions.ts:24` ref). **WIRE** `COMPANY_EXPORT`
  as the client-mount permission for company-manager runs (Company Back Office
  fit), or delete it. **CLIENT grant gap:** `CLIENT_USER` lacks
  `orders:export`/`stock_movements:read` → gate ADMIN_CLIENT reports on read
  perms CLIENT already holds (`orders:read`/`assets:read`) to avoid widening
  defaults.
- **Seed:** ADMIN/LOGISTICS templates already carry the perms (no change). Any
  template change requires `db:access:sync-defaults` (existing platforms' default
  policies don't auto-update). No registry seed rows — reports are code-defined.
- **CLI scripts:** `export-issuance.ts` / `export-stock-movements.ts` become thin
  wrappers over the shared `run()`; `export-asset-catalog.ts` stays standalone
  (photo carve-out).
- **No new event type / notification rule / feature flag** for reports themselves
  (read-only download). Global CORS/CDN `no-store` headers (`app.ts:31-50`)
  already cover the XLSX attachment responses.

---

## 10. Phased plan (big-bang end-state, sequenced to de-risk)

Sequenced per the workflow synthesis (§2A):

- **P0 — Framework + the 6 cross-cutting constants FIRST.** `report-workbook.ts`
    - `ReportDefinition`/registry + dual-mounted `/reports` routes + the runner
      (param-validate → rowCap → `clientColumns` drop → buffer/stream) + admin
      registry-driven cards. Resolve the §2A.3 constants (TZ/date-bounds, as-of
      stamping, empty-state, money format, audit log, concurrency) as toolkit code
      before any report. Behind the existing page permission.
- **P0.5 — Port the 2 canonical reports as the proof — but NOT "faithfully".**
  Force-resolve the §2A.2 escalations during the port: the stock-movements
  rewind units error (blocks the pivot) + the SQL re-parameterization (blocks
  HTTP exposure).
- **P1 — Inventory, current-stock FIRST → immediate staging fidelity pass.**
  current-stock + asset-utilization carry the highest-uncertainty numbers
  (UNAVAILABLE residual, AVAILABLE-vs-OUT divergence, orphan group_ids,
  self-booking invisibility). Get the prod-copy refresh in front of current-stock
  before building the rest, so a wrong availability assumption is caught once.
  Then asset-catalogue.
- **P2 — Operations, leak audit PULLED FORWARD.** issuance (P0.5), orders,
  order-history, inbound-log. Before any ADMIN_CLIENT money report ships, prove
  the `clientColumns` drop physically removes the 3 orders + 2 inbound leak
  columns on the client mount — do NOT defer to P5.
- **P3 — Financial trio as ONE unit.** accounts-reconciliation + revenue + cost
  with a UNIFIED status-gate + date-axis (else cross-tie-outs are decorative) +
  the SR `client_sell_override_total` fix. Decide work-summary's fate (retire vs
  rebuild) before building it.
- **P4 — Cutover & cleanup.** Delete `export` module + old routes once admin +
  **warehouse** + client are all on `/reports/*`; remove `EXPORT_CARDS`; resolve
  dead permissions.
- **P5 — Client portal.** Repoint the existing client reports page to
  `/client/v1/reports`.

Each numeric phase ends with a staging-refresh sanity pass. Net-new reports
(§12) are a fast-follow AFTER cutover — they don't block the big-bang.

---

## 11. Open sub-decisions (now informed by the workflow)

1. **Order History** — the spec proposes a `LAG()`-derived transition timeline, a
   behavior change from the legacy one-row-per-order snapshot (it also fixes a
   Final-Total leak). Confirm the timeline interpretation is wanted before
   investing in the window-function path; else keep the snapshot shape.
2. **Work Summary** — overlaps cost heavily; confirm it's still used and decide
   retire-vs-rebuild before P3. Leaning retire.
3. **Current Stock granularity** — per-family summary first; the per-asset "Out
   Detail" tab is deferred (`tabs[]`), added only if the assets-out
   order-attribution is actually missed. Confirmed: per-family lead.
4. **Catalogue ↔ Current Stock** — keep distinct (catalogue = descriptive/spec +
   image links; current-stock = quantities/state). Confirmed.

## 12. Net-new report backlog (fast-follow after cutover — NOT in the big-bang)

The completeness critic surfaced high-value reports a rental/inventory ops
business needs that aren't CSV replacements. They don't block the cutover:

- **Overdue / Outstanding Returns** — biggest operational gap.
  `selfPickups.expected_return_at` + order return windows +
  `asset_bookings.blocked_until` give the signal; one row per still-out item past
  due, aging buckets, qty outstanding. Money-recovery lever (late fees / lost).
- **Write-off / Damage / Shrinkage** — `stock_movements` records every WRITE_OFF
  with reason (CONSUMED/LOST/DAMAGED/OTHER); no report reads it for
  loss/insurance/depreciation today.
- **Transport / Delivery Manifest** — `orderTransportTrips` is first-class (truck,
  driver, leg sequence); volume/weight on `order_items`. No transport report exists.
- **Aging / Idle Stock** — dead-stock ranking by idle duration (`last_scanned_at`
    - scan_events) for disposal/redeployment.
- **Service Requests operational log** — SRs (dual 7+7 status,
  `blocks_fulfillment`) only appear inside financial UNIONs; ops needs the open-SR
  queue.
- **Invoice / AR Aging** — ⚠ currently **un-buildable**: `invoices` has no money
  columns and there's no payments/ledger table. Surface to product as a "needs a
  payments table" gap rather than shipping a status-only recon and calling
  finance done.
