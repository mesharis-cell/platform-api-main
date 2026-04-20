# Kadence E2E Testing System — Design Document

Status: **Accepted — all decisions locked 2026-04-12**
Owner: Lead engineering
Scope: api repo (`/home/mshari696/apps/kadence/api`)

This is the architectural spec for Kadence's end-to-end testing system. It is the source of truth for how tests are structured, what conventions they follow, and how the system evolves. Any test added to the repo should be explainable by this document.

---

## 1. Purpose

Give us a closed-loop way to prove, repeatedly and on demand, that real user journeys through the Kadence platform work end-to-end — across HTTP, database state, event emission, email dispatch, and inbox delivery.

The system is a **product**, not a script collection. It should outlive any single feature rollout (order flow, self-pickup, stock movements, future modules) and accommodate multiple classes of tests through shared primitives.

---

## 2. Scope

**In scope for the system as a whole:**

- Full user-journey flow tests across all three actor roles (client, admin, logistics)
- Permission-matrix verification (who can hit what)
- State-machine transition verification (every valid transition allowed, every invalid one blocked)
- Notification-matrix verification (every event → correct recipients → correct template → actually delivered)
- Side-effect verification (bookings released on cancel, stock movements on write-off, etc.)
- Feature-flag behavior verification
- Synthetic monitoring against staging (later)

**Out of scope:**

- Frontend UI / browser testing (admin / client / warehouse Next.js apps). The three frontends are API consumers; this suite verifies the contract they consume. Browser-level testing lives elsewhere (future Playwright suite, separate decision).
- Load / performance testing. Separate tool, separate concern.
- Security testing (fuzzing, auth bypass). Handled by existing Snyk setup plus explicit negative tests in this suite.

---

## 3. Principles

1. **Real, not mocked.** Real HTTP calls against a real running API, real Drizzle queries against a real PostgreSQL, real Resend API sending to real Outlook test inboxes that survive the run for manual spot-check.
2. **Isolation over cleverness.** Dedicated test DB. Reset between scenarios, never leak state.
3. **Code-first scenarios.** No Gherkin, no YAML DSL. TypeScript files that read like prose, aided by a thin domain DSL.
4. **Observability by default.** Every step captures what happened on four surfaces (HTTP / DB / email provider / inbox) so failures are debuggable from the test log alone.
5. **Negative paths are first-class.** Forbidden access, blocked transitions, emails that _must not_ fire — all assertable with the same ceremony as happy paths.
6. **Standard practice, not novelty.** Decisions follow 2025-2026 ecosystem consensus (see §7). We deviate only where project context demands it and write down why.
7. **Defer complexity.** Start serial, start with one scenario, start with in-memory email stub. Parallelism, Gmail verification, flakiness tooling come in when they earn their keep.

---

## 4. Architecture

Seven layers, each with a clear responsibility. Implementation should map 1:1 to these.

### 4.1 Environment layer

Binds the suite to a target. Reads env vars. Exposes a typed `TestEnv` object.

- `DATABASE_URL_TEST` — dedicated testing PostgreSQL (separate from staging + prod). Stakeholder provisions and adds to `.env` + `.dbops/`.
- `API_PORT` — random port the Express app binds to at suite start.
- `RESEND_API_KEY_TEST` — dedicated Resend API key for test runs (separate from staging/prod keys so test email metadata stays out of production Resend logs). Reuses the existing verified sending domain.

### 4.2 Database lifecycle layer

Owns the testing DB's state between runs.

- **Before suite:** connect, run migrations, apply the consolidated test seed (see §8).
- **Between scenario files:** truncate business tables (`orders`, `order_items`, `scan_events`, `system_events`, `notification_logs`, `asset_bookings`, `stock_movements`, etc. — full list in implementation), preserve scaffolding tables (`platforms`, `companies`, `users`, `access_policies`, `brands`, `assets`, `asset_families`, `service_types`, `attachment_types`, `workflow_definitions`, `notification_rules`).
- **Never between `it()` blocks within a file** — a scenario file is one coherent story.
- **After suite:** no teardown (DB persists for debugging; next run resets on start).

### 4.3 Actor layer

Typed accessors for each role. Handles real auth.

```ts
const as = await actors({ env, http });
const order = await as.client.post('/client/v1/order/submit-from-cart', { ... });
const approved = await as.admin.post(`/operations/v1/order/${order.id}/admin-approve-quote`, { ... });
```

- Each actor caches its login token per run.
- Named testing users seeded with known credentials (see §8).
- `as.unauthenticated` for unauth tests.

### 4.4 Factory layer

Ad-hoc entity builders used when a scenario needs more than the seed provides. Built on `@praha/drizzle-factory` (or a thin local equivalent if the library doesn't fit).

```ts
const asset = await factories.asset.create({ availableQuantity: 5 });
const order = await factories.order.create({ status: 'SUBMITTED', items: [...] });
```

- One factory per aggregate root.
- Factories compose (an order factory can create its own line items).
- Factories **do not** mock — they INSERT real rows via Drizzle.

### 4.5 Scenario DSL layer

Thin builder helpers that make scenarios read like narrative without becoming a DSL soup.

```ts
await scenario('Order happy path — submission to close')
  .given.aClient('e2e-client')
  .given.aWarehouseLogistics('e2e-logistics')
  .given.anAdmin('e2e-admin')
  .step('client submits order', async (ctx) => { ... })
  .step('logistics prices order', async (ctx) => { ... })
  .run();
```

- Each `step()` returns the HTTP / DB / email snapshots for that step, attached to the scenario report.
- Optional — scenarios can also be written as plain `describe` / `it` blocks if the DSL gets in the way.

### 4.6 Assertion layer

`bun:test`'s `expect` + domain-specific matchers registered via preload.

Domain matchers (minimum set):

- `expect(orderId).toHaveOrderStatus('QUOTED')`
- `expect(orderId).toHaveFinancialStatus('QUOTE_ACCEPTED')`
- `expect(orderId).toHaveEmittedEvent('quote.sent')`
- `expect(orderId).toHaveEmittedEvent('quote.sent', { actor_role: 'ADMIN' })`
- `expect(orderId).toHaveDispatchedEmail({ template: 'quote_sent_client', to: 'e2e-client@…' })`
- `expect(orderId).toHaveNotDispatchedEmail({ template: 'quote_sent_client' })` — negative
- `expect(orderId).toHavePriceBreakdown({ subtotal: 100, vat: 5, total: 105 })`
- `expect(response).toBeDeniedWith(403)` — negative
- `expect(response).toBeForbidden()` — negative

Domain matchers query the DB directly; they know which tables to hit.

### 4.7 Reporting layer

One reporter by default:

- `default` — human-readable for local dev

Failed scenarios print the step-by-step observation log (DB snapshots, HTTP bodies, Resend message statuses) inline. JUnit / github-actions reporters layer in cleanly during Phase 4 when a CI target is chosen.

---

## 5. Folder Structure

```
api/
├── docs/
│   └── e2e-testing-system.md          ← this file
├── src/
│   └── db/
│       ├── seeds/                      ← NEW: shared scaffolding modules
│       │   ├── platform.ts             (platform + access policies)
│       │   ├── service-types.ts        (14 types)
│       │   ├── notification-rules.ts   (platform defaults)
│       │   ├── attachment-types.ts
│       │   ├── workflow-definitions.ts
│       │   └── index.ts
│       ├── seed-test.ts                ← NEW: test-suite seed entrypoint
│       ├── seed.ts                     (existing, refactored to reuse seeds/)
│       ├── seed-pr.ts                  (existing, refactored to reuse seeds/)
│       └── seed-demo-pr.ts             (existing, refactored to reuse seeds/)
└── test/
    ├── README.md                       ← one-page quickstart
    ├── setup/
    │   ├── preload.ts                  ← bun test --preload target
    │   ├── env.ts                      ← typed TestEnv
    │   ├── lifecycle.ts                ← DB reset, app bootstrap
    │   └── register-matchers.ts
    ├── support/
    │   ├── http.ts                     ← typed fetch client + actors
    │   ├── db.ts                       ← Drizzle test-db handle
    │   ├── email.ts                    ← Resend + Gmail observation
    │   └── poll.ts                     ← pollUntil helper
    ├── factories/
    │   ├── asset.factory.ts
    │   ├── order.factory.ts
    │   ├── service-request.factory.ts
    │   └── ...
    ├── matchers/
    │   ├── order.matchers.ts
    │   ├── email.matchers.ts
    │   ├── event.matchers.ts
    │   └── index.ts
    ├── dsl/
    │   └── scenario.ts
    ├── scenarios/                      ← one file per user journey
    │   ├── order-happy-path.test.ts
    │   ├── order-cancellation.test.ts
    │   ├── order-quote-revision.test.ts
    │   └── ...
    ├── permissions/                    ← permission matrix tests (later)
    │   └── order.permissions.test.ts
    └── state-machine/                  ← forbidden-transition tests (later)
        └── order-transitions.test.ts
```

---

## 6. Seed Strategy

### 6.1 Current state (from audit)

Three primary seeds exist — `seed.ts` (demo, 2 companies + full orders), `seed-pr.ts` (production-like, PR only, no orders), `seed-demo-pr.ts` (demo overlay, orders at 15 statuses). All three are **destructive** (wipe + reseed) and **duplicate** significant scaffolding (service types, notification rules, attachment types are seeded identically in all three).

### 6.2 Consolidation plan

**Step 1 — extract shared scaffolding modules** into `src/db/seeds/`:

| Module                    | Responsibility                                                   |
| ------------------------- | ---------------------------------------------------------------- |
| `platform.ts`             | Create platform + access policies via `PlatformBootstrapService` |
| `service-types.ts`        | 14 canonical service types (one source of truth)                 |
| `notification-rules.ts`   | Platform-default notification rules (one source of truth)        |
| `attachment-types.ts`     | 3 canonical attachment types                                     |
| `workflow-definitions.ts` | Default workflow definitions                                     |
| `access-policies.ts`      | Default 3 role policies (wraps bootstrap)                        |

Each module exports `seed{Name}({ platformId, tx }) => Promise<void>` and is **idempotent** (check-then-insert).

**Step 2 — refactor existing seeds** to import from `seeds/` instead of inlining. `seed.ts`, `seed-pr.ts`, `seed-demo-pr.ts` keep working; duplication goes away.

**Step 3 — introduce `seed-test.ts`** as the test-suite entrypoint:

```
seed-test.ts:
  seedPlatform()              // "Kadence Test"
  seedAccessPolicies()
  seedServiceTypes()
  seedAttachmentTypes()
  seedWorkflowDefinitions()
  seedNotificationRules()
  seedTestCompany()           // "E2E Test Tenant"
  seedTestBrands()            // 2-3 brands, enough for tests
  seedTestUsers()             // known emails/passwords
  seedTestWarehouse()
  seedTestAssetFamilies()     // SERIALIZED + POOLED families
  seedTestAssets()             // known quantities, known IDs
  seedTestFeatureFlags()      // enable_attachments, enable_workflows, etc.
  // NO orders — scenarios create their own
```

**Step 4 — testing users** with known credentials, addressed at real Outlook aliases on `homeofpmg.com`:

- `e2e.kadence.admin@homeofpmg.com` / known password
- `e2e.kadence.logistics@homeofpmg.com` / known password
- `e2e.kadence.client@homeofpmg.com` / known password

All three are real inboxes the stakeholder owns. Role-specific notifications arrive at role-specific addresses, enabling automated verification via Resend's `delivered` status + `notification_logs.SENT` row, and manual post-run spot-check by logging into Outlook.

### 6.3 Runtime behavior

```
suite start:
  connect to DATABASE_URL_TEST
  drizzle-kit migrate (if schema drift)
  TRUNCATE all tables CASCADE
  run seedTest()
  start Express on random port

per scenario file (beforeEach at file level, via describe):
  TRUNCATE business tables (preserve scaffolding — see §4.2)
  (no re-seeding; scaffolding survives)

per scenario (it block):
  test body runs against the seeded baseline
  factories create ad-hoc data inline

suite end:
  close DB, close server
  DB state persists for post-mortem inspection
```

Target: full suite seed + reset cycle < 3s.

---

## 7. Decisions (with rationale)

Based on 2025-2026 ecosystem research. Deviations from standard are called out.

| #   | Decision                                                                                                | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Runner: `bun:test`**                                                                                  | Native to Bun runtime, Jest-compatible API, fastest option, supports `--preload`, `--retry`, `--randomize`, `--reporter=junit` natively. No need for Vitest unless a critical dependency demands it.                                                                                                                                                                                                                                                                                                  |
| 2   | **DB isolation: dedicated test DB, truncate-and-reseed between scenario files**                         | Transactional rollback breaks for event-driven async flows (events emitted from the EventBus may be processed on different connections). DB-per-worker is overkill pre-alpha. Start simple; upgrade to template-DB-per-worker when total runtime > 5 min.                                                                                                                                                                                                                                             |
| 3   | **Fixtures: shared seeds + per-scenario factories**                                                     | Two-layer matches ecosystem consensus (builders + scaffolding). Drizzle-factory gives typed overrides. Factories next to scenarios keep the Mystery Guest anti-pattern away.                                                                                                                                                                                                                                                                                                                          |
| 4   | **Scenario format: pure code + thin domain DSL**                                                        | Gherkin is overhead for API-flow tests. Pure `describe`/`it` with a `scenario()` helper for narrative is the 2025 standard in engineering-led teams.                                                                                                                                                                                                                                                                                                                                                  |
| 5   | **Assertions: `bun:test` `expect` + custom domain matchers**                                            | Domain matchers (`toHaveOrderStatus`, `toHaveEmittedEvent`) produce readable failures and encapsulate DB-lookup ceremony. Ecosystem trend is toward domain matcher modules.                                                                                                                                                                                                                                                                                                                           |
| 6   | **HTTP client: native `fetch` against real localhost port**                                             | Matches how the actual frontends call the API (middleware order, CORS, headers all exercised). Typed actor helpers (`as.admin.get(...)`) on top.                                                                                                                                                                                                                                                                                                                                                      |
| 7   | **Reporter: `default` only (local-only execution)**                                                     | Human-readable output is sufficient pre-CI. JUnit / github-actions reporters layer in cleanly during Phase 4 when a CI target is chosen.                                                                                                                                                                                                                                                                                                                                                              |
| 8   | **Execution: local-only via `bun test` commands**                                                       | No CI/deployment wiring yet. Suite runs on developer machines against `DATABASE_URL_TEST`. CI integration deferred to Phase 4.                                                                                                                                                                                                                                                                                                                                                                        |
| 9   | **Secrets: `.env.test` local (gitignored)**                                                             | Local execution means no CI secrets manager yet. `.env.test.example` committed as template. Upgrade to a secrets manager when CI arrives.                                                                                                                                                                                                                                                                                                                                                             |
| 10  | **Concurrency: serial by default**                                                                      | Start simple. Upgrade to DB-per-worker only when serial runtime hurts. Never `test.concurrent()` within a file for a shared-API suite.                                                                                                                                                                                                                                                                                                                                                                |
| 11  | **Negative testing: first-class scenario files + permission matrix files + forbidden-transition files** | The RBAC + 17-state order machine has enough surface that negative coverage justifies dedicated files, not one-liner `expect(403)` tacked onto positives.                                                                                                                                                                                                                                                                                                                                             |
| 12  | **Email verification: real Resend → real Outlook inbox + poll `delivered` status**                      | Resend's `email.delivered` confirms the receiving MTA returned SMTP 250 OK (sender side cannot observe inbox placement — that's a fundamental SMTP limitation). Combined with `notification_logs.status = SENT` in our DB and three real Outlook inboxes the stakeholder inspects post-run, this gives automated-machine confidence + human-eyeball confidence. Mailosaur / Gmail API / Outlook Graph API reserved as Phase 5 upgrades if actual inbox-placement verification becomes critical later. |
| 13  | **Flaky management: no blanket retries, `@quarantine` tag, nightly `--randomize`**                      | Blanket retries mask bugs. Tag-based quarantine lets the main suite stay green while quarantined tests run but don't block. Per-test `--retry` only for known-async assertions with a clear reason.                                                                                                                                                                                                                                                                                                   |

---

## 8. Conventions

These are the **rules** anyone writing tests in this repo follows. Enforced by code review.

### 8.1 Scenario files

- One file per user journey. Named after the journey (`order-happy-path.test.ts`, not `order.test.ts`).
- Each file opens with a top comment stating the journey in one sentence.
- Structured as AAA (Arrange / Act / Assert) within each `it()`.
- No shared mutable state between `it()` blocks in a file — each is self-contained.

### 8.2 Factories

- One factory per aggregate root. File named `{entity}.factory.ts`.
- Factories return typed records matching the Drizzle schema (snake_case — matches what the API returns).
- Factories never emit events. If a scenario needs an event to fire, it goes through the real API path.
- Factories are the **only** place tests bypass the API to create data.

### 8.3 Assertions

- Use domain matchers when one exists. Don't hand-roll DB queries in scenario code — add a matcher.
- Every scenario asserts on at least three surfaces: HTTP response + DB state + events emitted. Email/inbox is tier-2+.
- Negative assertions use `.toNotHave…()` matchers, not bare `expect(x).toBeUndefined()`.

### 8.4 Data

- Test data uses `e2e-` prefix in human-readable fields (emails, names, order numbers) so it's visible in logs.
- Never hardcode UUIDs — generate deterministically from a scenario ID if needed.
- Scenario ID embedded in every outbound email subject as an `[e2e:${scenarioId}]` prefix, so the real Outlook inbox can be filtered/searched per run.

### 8.5 Timing

- Never `setTimeout`. Use `pollUntil(fn, { timeout, interval })` from `test/support/poll.ts` with an explicit max.
- Max polling timeout: 10s for DB assertions, 30s for Resend API `GET /emails/:id` to reach `delivered` status.

### 8.6 Tagging

- `describe.skip.if(...)` and file-level tags control CI tier:
    - No tag = runs tier-1 and above
    - `@tier-2` = runs on merge to main
    - `@tier-3` = runs nightly only
    - `@quarantine` = runs but doesn't fail the build
    - `@slow` = > 10s, demoted to nightly automatically
- Tags live in the file's top comment and are picked up by a small filter in `test/setup/lifecycle.ts`.

### 8.7 Naming

- Scenario files: `kebab-case.test.ts`
- Factories: `kebab-case.factory.ts`
- Matchers: grouped by domain, one export per matcher
- Test user emails: `e2e-{role}@kadence.test`

---

## 9. Day-1 Scope

**What ships first:** a working suite that runs one scenario end-to-end, hitting all seven layers.

1. **Scaffolding** (sections 4.1, 4.2, 4.7): env layer, DB lifecycle, reporters configured
2. **Seed consolidation** (section 6.2 steps 1-4): shared seed modules + `seed-test.ts`
3. **HTTP + actors** (section 4.3): typed fetch client, three role accessors
4. **Factories — minimum set** (section 4.4): `asset`, `order`
5. **Matchers — minimum set** (section 4.6): `toHaveOrderStatus`, `toHaveFinancialStatus`, `toHaveEmittedEvent`, `toHaveDispatchedEmail`, `toBeDeniedWith`
6. **Email verification** (section 7 decision 12): real Resend API send, poll `GET /emails/:id` until status is `delivered`, assert matching `notification_logs` row with `status = SENT` and matching `message_id`. Emails land in real Outlook aliases for human spot-check.
7. **Scenario #1:** `order-happy-path.test.ts` — client submits → logistics prices → admin approves → client approves → logistics outbound-scan → status progression → logistics inbound-scan → CLOSED, with all four-surface assertions at each step
8. **CI wiring:** GitHub Actions workflow running tier-1 on PR, uploading JUnit XML

Day-1 is **proof the system works**. It is not the full matrix of tests.

---

## 10. Roadmap

Phased additions after day-1 ships.

### Phase 2

- Additional flow scenarios: `order-cancellation`, `order-quote-revision`, `order-quote-decline`
- Permission matrix file for orders (`test/permissions/order.permissions.test.ts`)
- Forbidden-transition file for orders (`test/state-machine/order-transitions.test.ts`)

### Phase 3

- Inbound request flow scenarios
- Service request flow scenarios
- Notification matrix test (for each event, verify every seeded rule dispatches correctly for every role recipient)
- Cross-entity scenarios (order + blocking service request)

### Phase 4 (when CI is introduced)

- JUnit reporter export
- GitHub Actions / Bitbucket Pipelines / AWS CodeBuild integration (whichever target gets chosen)
- Secrets-manager story for CI
- Tiered posture (PR smoke / merge full / nightly slow)
- Release-gate runs against staging artifact
- Scheduled synthetic-monitoring runs against staging

### Phase 5 (only if earned by real pain)

- DB-per-worker parallelism (only if serial runtime exceeds 5 minutes)
- Programmatic inbox read via Mailosaur or Outlook Graph API (only if manual spot-check becomes a bottleneck or actual inbox-placement verification becomes critical)
- Self-pickup, stock-threshold, invoicing flow scenarios (once those features ship — currently out of scope per stakeholder)
- Allure dashboard (only if stakeholders want historical visibility)
- Flakiness analytics (parse historical JUnit, report top offenders)

---

## 11. Prerequisites

Before day-1 implementation can start:

1. **Testing database provisioned** — stakeholder adds `DATABASE_URL_TEST` to `api/.env` and `.dbops/.env*`. Must be a separate database from staging + prod.
2. **Dedicated Resend API key** — stakeholder generates a testing-only API key in the Resend dashboard and adds it as `RESEND_API_KEY_TEST` to `api/.env`. Reuses the existing verified sending domain. Keeps test email metadata out of production Resend logs.
3. **Test inbox aliases confirmed active** — verify `e2e.kadence.admin@homeofpmg.com`, `e2e.kadence.logistics@homeofpmg.com`, `e2e.kadence.client@homeofpmg.com` each receive mail (one-time test send before suite implementation).
4. **Test DB marker bootstrapped** — run `bun run db:bootstrap:test` once per new test database. This uses the existing `destructive-guard.ts` (Supabase project-ref allowlist + typed confirmation phrase) to authorize writing the `_e2e_test_db_marker` row. All subsequent destructive ops (`db:seed:test`, in-test truncation) require this marker to exist and will refuse to run otherwise. Requires `DB_DESTRUCTIVE_ALLOWED_SUPABASE_REFS` (or `DB_DESTRUCTIVE_ALLOWED_HOSTS` for non-Supabase) to include the test DB's project ref.
5. **Shared seed modules extracted** (section 6.2 steps 1-2) — new modules in `src/db/seeds/` must exist before `seed-test.ts` can compose them. Existing seeds (`seed.ts` / `seed-pr.ts` / `seed-demo-pr.ts`) remain untouched; dev-use consolidation is a separate task outside this design.

---

## 12. Resolved Decisions (locked 2026-04-12)

All pre-implementation decisions agreed with stakeholder:

1. **Feature flags for test tenant:**
    - ON: `enable_attachments`, `enable_workflows`, `enable_base_operations`, `enable_ordering`
    - OFF: `enable_self_pickup`, `enable_kadence_invoicing`

2. **Migration strategy:** Suite verifies schema state at startup and fails fast if drift is detected. Does not apply migrations itself (consistent with CLAUDE.md rule that migrations run outside the app).

3. **Execution target:** Local-only via `bun test` commands. No CI/deployment wiring in day-1. JUnit export and CI integration deferred to Phase 4 when a CI target is chosen.

4. **Email verification:** Real Resend API sending to real Outlook inboxes. Automated check = poll `GET /emails/:id` until status `delivered` + assert matching `notification_logs.status = SENT` row. Manual check = stakeholder logs into Outlook post-run and eyeballs N emails with correct subjects and content per role. No Mailosaur, no Gmail API, no SMTP stub. See §7 decision 12 for rationale and §10 Phase 5 for upgrade conditions.

5. **Test inbox addresses:** Three separate aliases on `homeofpmg.com` (Outlook):
    - `e2e.kadence.admin@homeofpmg.com`
    - `e2e.kadence.logistics@homeofpmg.com`
    - `e2e.kadence.client@homeofpmg.com`

6. **Legacy seed files:** `seed.ts`, `seed-pr.ts`, `seed-demo-pr.ts` remain untouched in this scope. Only the new shared modules under `src/db/seeds/` and the new `seed-test.ts` are built. Refactoring existing seeds to reuse the shared modules is a separate task outside this design.

---

## 13. Non-goals

To be explicit about what this system is not, so we don't get scope creep:

- **Not a unit test framework.** Unit tests stay in `src/**/*.test.ts` if/when added.
- **Not a load-testing tool.** Doesn't measure throughput or latency under load.
- **Not a substitute for type safety.** TypeScript + Drizzle types catch a lot; this system catches what types can't.
- **Not a frontend test.** The three Next.js apps consume the API. This suite verifies the API contract. Frontend tests are a separate decision.
- **Not a manual QA replacement.** Automated coverage complements human exploration; doesn't replace it for exploratory edge cases.

---

## Appendix A: References

- `api/CLAUDE.md` — project-wide engineering rules (catchAsync, sendResponse, etc.)
- `api/src/db/schema.ts` — Drizzle schema (source of truth for DB state)
- `api/src/app/events/event-types.ts` — all emittable events
- `api/src/app/events/handlers/email.handler.ts` — how events become emails
- `api/src/db/seed.ts`, `seed-pr.ts`, `seed-demo-pr.ts` — current seed scripts to be refactored

## Appendix B: Research sources

Research sources consulted for section 7 decisions are captured in the research agent output (2025-2026 ecosystem surveys, maintainer blogs, official docs). Full list available on request; not reproduced here to keep this doc concise.
