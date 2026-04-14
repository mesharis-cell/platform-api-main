# E2E Testing Suite + Demo Seed for Docs

End-to-end tests for the Kadence API, plus a rich demo seed shared with the
docs-tutorials Playwright workflow. Full architectural spec:
`api/docs/e2e-testing-system.md`.

## Two consumers, one seed

This codebase has two distinct workflows that share the same test DB and
the same seed:

1. **E2E flow tests** (this suite). `bun run test:e2e` wipes the test DB,
   re-seeds, then runs scenarios that create their own orders via the real
   API. Verifies the request → DB → events → notifications → Resend
   delivery loop end-to-end.

2. **Docs site Playwright captures** (`/client/src/app/docs/...`). The seed
   contains 6 demo orders + scan events + a service request all owned by a
   readable demo user (Alex Chen) so screenshots have realistic content.

Both share `bun run db:seed:test`. The discipline is: **whoever runs first
should reseed before they start, and don't interleave runs**. `test:e2e`
truncates business tables in `beforeAll`, so demo orders disappear during a
test scenario run — re-seed before the next docs screenshot session.

## Prereqs (one-time)

Populate `.env.testing` with the test DB credentials. Env loading is unified
via `src/bootstrap/env.ts`, which loads `.env.testing` (when APP_ENV=testing)
then falls back to `.env` for shared defaults. See `api/docs/env-setup.md`
for the full env model.

1. Provision a dedicated testing PostgreSQL database. Add its URL to
   `.env.testing` as `DATABASE_URL` (and to `.env.dbops` as
   `TEST_DATABASE_URL` if you also need cross-env dbops access).
2. Generate a dedicated Resend API key (testing-scoped, same verified
   sending domain). Add as `RESEND_API_KEY` in `.env.testing`.
3. Verify these Outlook aliases receive mail:
   `e2e.kadence.admin@homeofpmg.com`, `e2e.kadence.logistics@homeofpmg.com`,
   `e2e.kadence.client@homeofpmg.com`. (E2E tests send real mail to these.)
4. Add the test DB Supabase project ref to
   `DB_DESTRUCTIVE_ALLOWED_SUPABASE_REFS` in `.env.testing`.

```bash
cp .env.test.example .env.testing
# fill in DATABASE_URL + RESEND_API_KEY for your test DB
```

## Bootstrap (one-time per fresh test DB)

```bash
bun run db:bootstrap:test
```

Writes the marker row to `_e2e_test_db_marker` proving the DB has been
explicitly sanctioned. Uses the existing destructive-guard:

- Refuses if the target Supabase project ref isn't in
  `DB_DESTRUCTIVE_ALLOWED_SUPABASE_REFS`.
- Refuses if `APP_ENV` is in the blocked list (default blocks `production`).
- Requires a typed confirmation phrase (or `DB_DESTRUCTIVE_CONFIRM` env var
  for non-TTY shells).

Subsequent destructive ops check for the marker and refuse if missing —
hard guarantee against wiping the wrong DB.

## Routine commands

```bash
bun run db:seed:test     # wipe + reseed (full demo state)
bun run test:e2e         # reseed + run scenarios (E2E flow)
bun run dev:test         # boot API on port 9100 against test DB (for docs Playwright)
```

`dev:test` runs the Express server with `--hot` reload, env preloaded from
`.env.testing` + `.env` (via `src/bootstrap/env.ts`), `APP_ENV=testing`, and
`PORT=9100` (from `.env.testing`, or override by editing that file). Logs
`APP_ENV=testing` at startup so it's instantly obvious you're hitting the
test DB.

## Test inbox emails

E2E scenarios send REAL emails through Resend to the three e2e Outlook
aliases. Subjects are prefixed `[TESTING → CLIENT]:` / `[TESTING → ADMIN]:`
/ `[TESTING → LOGISTICS]:` so you can filter by recipient role in the
inbox.

## Seed contents

After `bun run db:seed:test`:

| Entity | Count | Notes |
|---|---|---|
| Platform | 1 | "Kadence" on `demo.kadence.test` |
| Company | 1 | "Kadence Demo" |
| Users | 4 | Morgan Lee (admin), Jordan Maxwell (logistics), one E2E client (real Outlook alias), Alex Chen (docs client, fake email) |
| Brands | 2 | Kadence Events, Kadence Studio |
| Asset families | 3 | Event Chairs (POOLED), Backdrop Panels (SERIALIZED, GREEN+ORANGE+RED mix), LED Screens (SERIALIZED) |
| Assets | 8 | 1 batch chair (qty 30) + 4 backdrop panels + 3 LED screens |
| Collection | 1 | "Corporate Event Package" with 4 items |
| Orders | 6 | All on Alex Chen — see table below |
| Scan events | 6 | Order 4: OUTBOUND, OUTBOUND_TRUCK_PHOTOS, ON_SITE_CAPTURE, DERIG_CAPTURE. Order 5: RETURN_TRUCK_PHOTOS, INBOUND-with-discrepancy. Covers every `scan_type` enum value. |
| Service requests | 1 | MAINTENANCE on Order 5 (cracked backdrop), QUOTED commercial status |

Demo order set (all Alex Chen):

| Public ID | order_status | financial_status | Notes |
|---|---|---|---|
| ORD-DEMO-001 | PRICING_REVIEW | PENDING_QUOTE | Just submitted; no line items yet |
| ORD-DEMO-002 | QUOTED | QUOTE_SENT | 2 catalog lines + BASE_OPS, ready for client approval |
| ORD-DEMO-003 | CONFIRMED | QUOTE_ACCEPTED | po_number set, asset bookings active |
| ORD-DEMO-004 | DELIVERED | QUOTE_ACCEPTED | Full status history, scan events with truck + derig photos |
| ORD-DEMO-005 | CLOSED | PENDING_INVOICE | Full lifecycle, inbound scan with one discrepancy |
| ORD-DEMO-006 | CANCELLED | CANCELLED | Cancelled from QUOTED — "client declined" |

All UUIDs + order numbers + timestamps come from
`src/db/seeds/demo-deterministic.ts` (pinned epoch `2026-04-01T00:00:00Z`),
so screenshots stay diff-stable across reseeds.

## Demo CLIENT credentials (for docs Playwright)

```
email:    alex.chen@kadence-demo.com
password: DocsPass!Client1
role:     CLIENT
company:  Kadence Demo (id 00000000-0000-4000-8002-000000000001)
platform: Kadence (id 00000000-0000-4000-8001-000000000001, domain demo.kadence.test)
```

The other CLIENT user (`e2e.kadence.client@homeofpmg.com`) is reserved for
the E2E suite's real-email flow — leave it alone for screenshots.

## Folder layout

```
test/
├── setup/                 suite lifecycle — preload, env, DB reset
├── support/               http client, db handle, polling helper
├── matchers/              domain-specific expect() extensions
├── scenarios/             one file per user journey
└── README.md              this file
```

The shared seed modules live under `src/db/seeds/`:

- `demo-deterministic.ts` — pinned epoch + fixed UUIDs + order numbers
- `demo-catalog.ts` — 3 families, 8 assets, 1 collection
- `demo-orders.ts` — 6 orders with full status histories + line items + bookings
- `demo-scan-events.ts` — scan events with photos
- `demo-service-request.ts` — QUOTED MAINTENANCE SR linked to Order 5
- (plus the original scaffolding modules: `access-policies`, `service-types`,
  `attachment-types`, `workflow-definitions`, `notification-rules`)

## Conventions

See §8 of `api/docs/e2e-testing-system.md` for the full rulebook. Highlights:

- One scenario file = one user journey. Name after the journey.
- Each scenario asserts on HTTP + DB + events + Resend `delivered` status + `notification_logs` row.
- Never `setTimeout` — use `pollUntil` from `test/support/poll.ts`.
- All subjects auto-prefixed by env (`[TESTING → ROLE]: ...`) via
  `src/app/services/email.service.ts`.

## Troubleshooting

- **Schema drift**: bootstrap drops + re-pushes the schema via
  `drizzle-kit push --force`. If you change `schema.ts`, re-bootstrap to
  resync.
- **Emails not arriving**: check Resend dashboard for the test API key.
  Confirm `notifications.staging.kadence.ae` is verified. Look for SENT
  status + `message_id` in `notification_logs`.
- **Resend suppression**: bounced addresses get auto-suppressed by Resend.
  Clear in dashboard → Suppressions if needed.
- **Resend quota**: each E2E run sends ~8 emails. Free tier = 3,000/month.
- **Demo orders missing**: they got truncated by a `test:e2e` run. Reseed
  with `bun run db:seed:test`.
- **dev:test port collision**: 9100 default; override with
  `PORT=9200 bun run dev:test`.

---

## Message to the docs agent (poll for this)

> Hey — the shared seed + `bun run dev:test` are in. Here's everything you need:
>
> **Pull latest, then:**
>
> ```bash
> bun install                       # if anything new
> bun run db:bootstrap:test         # one-time per fresh test DB; safe to skip if marker already exists
> bun run db:seed:test              # full reseed
> bun run dev:test                  # API on port 9100 against the test DB
> ```
>
> Server logs `APP_ENV=testing` at startup so you can confirm you're not
> hitting staging.
>
> **Wire your client app to it:**
> - `NEXT_PUBLIC_API_URL=http://localhost:9100`
> - On every API request, send `x-platform: 00000000-0000-4000-8001-000000000001`
>   (the seeded platform UUID for "Kadence" / `demo.kadence.test`). If your
>   client app already has a tenant-resolution flow, hit
>   `GET /auth/context` once with `x-dev-host: demo.kadence.test` to get the
>   platform_id dynamically — same flow as production.
>
> **Login as Alex Chen for screenshots:**
>
> ```
> email:    alex.chen@kadence-demo.com
> password: DocsPass!Client1
> ```
>
> She owns 6 orders covering every status hero variant (SUBMITTED, QUOTED,
> CONFIRMED, DELIVERED with scans, CLOSED with inbound discrepancy,
> CANCELLED). See the table above for the full breakdown. The other CLIENT
> user (`e2e.kadence.client@homeofpmg.com`) is reserved for my E2E
> email-delivery tests — please don't use it in screenshots.
>
> **Cadence discipline:** Don't run `bun run test:e2e` between your
> Playwright sessions — it truncates business tables (orders, scans,
> bookings) and the demo state will look empty. Always reseed before a
> screenshot session if anyone else has touched the DB:
> `bun run db:seed:test`.
>
> **Your `?next=` redirect on login is already in** per [stakeholder] — your
> branch should already have it.
>
> **Determinism:** every UUID, order number, and timestamp comes from
> `src/db/seeds/demo-deterministic.ts` (pinned epoch
> `2026-04-01T00:00:00Z`). Screenshot diffs across reseeds will reflect only
> UI changes, not data churn.
>
> **What's NOT seeded** (out of scope for now per stakeholder): self-pickup,
> stock alerts, invoicing flows, fabrication. Tutorials covering those wait
> until the underlying features ship.
>
> Ping me if anything's off when you wire up Playwright — should be a
> straight shot from here.
