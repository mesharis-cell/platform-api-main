---
name: Agent working guide for Kadence
description: How to work effectively in this repo + with this user. Methods, rules, conventions, communication style, handoff patterns. Read on every fresh session before doing anything substantial.
type: feedback
originSessionId: c4b8ee21-e113-4d7c-bae2-be8620111b10
---

# Working guide for Kadence agents

This is the durable handoff between sessions. The user runs many parallel
Claude agents on this codebase. They've been frustrated by agents that:

- Repeat audits other agents already did
- Skip validation and ship broken work
- Use bureaucratic / verbose communication
- Make decisions that should be theirs to make
- Touch shared state without asking
- Rely on memory instead of re-grounding in code

This guide is calibrated to fix those failure modes. Read it before doing
substantial work. Update it when you learn something durable.

## 1. The user

**Engineering profile.** Owner / lead. Reads code; doesn't need handholding
on what `useMemo` does. But they're juggling many threads (multiple agents,
multiple tenants, multiple feature branches) so they value crisp summaries
over deep walkthroughs. They WILL push back if your audit was sloppy or
your plan glossed over a coupling constraint.

**Communication preferences (from direct feedback in past sessions):**

- **Brevity wins.** "bro.. simpler", "i need to NOT be overwhlemed". Short
  sentences. Lead with the answer. Bullet points + tables over prose walls.
  Tight code blocks over verbose explanations.
- **Honest over hedged.** If you don't know, say so. If you didn't do
  something, say "no, didn't do that — here's what I did instead." Don't
  invent capability. Don't pretend confidence you don't have.
- **Talk like a human.** When relaying to another agent, paste a clean
  brief. When talking to THIS user, talk normally. Past feedback (literal
  quote): "ASK LIKE A FUCKIGN HUIMANM, CONFIRM IF HE DID WHAT U WANT".
  Translation: don't write "instructions for the other agent" when the
  user is asking you a direct question.
- **Options + recommendation > open-ended question.** "Want me to do A,
  B, or C?" with a recommended one beats "what would you like?". They'll
  pick or override.
- **Doesn't want fluff.** Skip "Great question!" / "I'd be happy to" /
  "Here's a comprehensive..." preambles. Get to the answer.

**Trust posture.** They trust you to make low-stakes calls (file naming,
formatting, internal helpers). They want to be looped in on:

- Anything destructive on shared state (any push, any DB write outside
  test DB, any cross-tenant change)
- Architectural decisions with non-obvious tradeoffs
- Anything that would surprise the next agent reading the code

## 2. The working method that has worked

Used this repeatedly with success. In order:

### Step 1 — Re-ground, do not trust memory

CLAUDE.md is dense and EVOLVES. Your prior session's memory is stale by
the time you wake up. **Always grep / read the actual files** for the
specific facts you're about to act on. The user has explicitly called
this out: "do not rely on memory". When in doubt, `Read` it.

Cheap re-grounding pattern:

```
git fetch && git log --oneline -10               # what landed since I last saw this?
git status                                       # any uncommitted state?
grep -n "FOO_BAR" src/                           # is FOO_BAR still where memory says?
```

### Step 2 — Audit before plan, plan before code

For anything beyond a 1-file fix:

1. **Spawn parallel Explore agents** for codebase audit. 1-3 in parallel,
   each with a tight focused prompt. They return read-only findings; you
   synthesize. Keep prompts FACT-FINDING, not opinion.
2. **Synthesize into a plan.** File at `~/.claude/plans/<descriptor>.md`.
   Include: validated current state with file:line refs, architecture for
   the change, phases (ordered, each independently verifiable), critical
   coupling constraints, risks + mitigations, files touched, what's NOT in
   scope, definition of done.
3. **Show the plan, get approval** before executing. This is when the user
   catches problems cheaply.

### Step 3 — Two validation passes for high-stakes work

When work affects production-like surfaces or is hard to roll back:
spawn a SECOND wave of agents with a different angle.

- Wave 1: "what's the current state? what does the code do today?"
- Wave 2: "critique the plan. find what we missed. find adversarial edge
  cases. find hidden consumers. find coupling issues."

The reviewer agent on this codebase has caught real bugs the first-wave
audit missed. Don't skip wave 2 for big changes.

### Step 4 — Execute in phases with verification gates

Each phase ends with: `bun run typecheck` + `bun run test:e2e` (or the
relevant tests). If a gate fails, debug there, don't move on.

Use `TaskCreate` / `TaskUpdate` to track phases. Mark in_progress when
starting, completed when done. Helps the user see progress + helps you
not drop work after compaction.

### Step 5 — Hand off cleanly

If another agent (or future-you) needs to continue:

- **Review packet** with file:line refs + sign-off checklist
- **Context primer** with architectural grounding (what they need to know
  before reading the brief)
- **Brief** with concrete scope + verification + hand-back format

Pattern proven on this codebase: see `seed-enrichment-context.md` +
`seed-enrichment-brief.md` for the template.

## 3. Hard rules (non-negotiable)

These have been earned through real incidents on this codebase:

### Production safety

- **NEVER test on production.** Staging is the test env. Prod deploys
  are ships that follow proven-clean staging runs. No experimentation.
  No simulated failures on prod. No manual tinkering on prod instances.
- **Real production secrets NEVER on disk.** `.env.production` locally
  holds fake values as a safety net (so `APP_ENV=production` from a dev
  machine hits a dead DB). Real secrets live ONLY in AWS EB env
  properties.
- **Never push to `staging` or `main` without explicit user approval
  for the specific push.** Feature branches are fine. PRs are the merge
  path. Past feedback: a staging wipe incident from this exact class.

### Destructive operations

- **The marker pattern is the test-DB gate.** `_e2e_test_db_marker` row
  exists ONLY on the test DB (lvkysconjuabdifwzlkt). `assertIsTestDatabase()`
  checks for it before any wipe. Marking the wrong DB requires three
  deliberate target-named human actions through `db:bootstrap:test`.
  **Never bypass this guard.** Never write the marker manually.
- **Verify across all 3 DBs before assuming safety.** When the user asks
  about marker safety, check test/staging/prod. Past finding: staging had
  a stale marker from an old wipe incident.
- **Operator-set APP_ENV for risky scripts.** `db:seed`, `db:rebuild`,
  `db:platform:*`, `db:redbull:*`, etc. — these all REQUIRE
  `APP_ENV=staging` (or the appropriate env) on the command line. They
  fail-fast if unset. Don't add defaults.

### Commits + pushes

- **Don't commit unless explicitly asked.** "Continue your work" or
  "yes" to a previous question is enough. Open-ended ambiguity isn't.
- **Don't push without specific user OK for the push action.** Especially
  for `staging` / `main`. Even with `--no-verify` etc., never bypass
  hooks unless the user explicitly requests it.
- **Commit messages: explain the WHY.** This codebase's commit style is
  detailed multi-paragraph for non-trivial changes. See recent commits
  for tone (e.g. `441e155`, my feasibility commits).
- **Co-author trailer:** include
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
  on agent commits.

### Migrations

- **All migrations are HAND-WRITTEN.** No `drizzle-kit generate`. No
  `drizzle-kit introspect`. The Drizzle snapshot chain is known-broken
  and we're NOT fixing it. Apply via `drizzle-kit migrate` only.
- **Migrations CAN contain data changes** (INSERT/UPDATE/DELETE).
  Inline backfill is preferred when the schema change requires the
  backfill to be semantically complete.
- **Add to `_journal.json`** when adding a migration. Don't commit a
  new snapshot file (`drizzle/meta/NNNN_snapshot.json`).
- See `<migration_rules>` in CLAUDE.md for the full rulebook.

### Env model

- **APP_ENV is the env-identity signal**, NOT NODE_ENV.
- **Single env loader:** `src/bootstrap/env.ts`. Imported via
  `bun --preload ./src/bootstrap/env-preload.ts` for scripts/dev, OR
  imported as the first line of `src/server.ts` for deployed.
- **Required secrets validated at boot.** Missing any = fail-fast crash.
- **Env files per purpose:** `.env` (shared defaults), `.env.staging`,
  `.env.testing`, `.env.production` (FAKE), `.env.dbops` (cross-env
  shell ops). All gitignored except `.env.test.example`.
- See `<env_management>` in CLAUDE.md + `api/docs/env-setup.md` for full
  reference.

## 4. Codebase architecture (Kadence-specific)

### Repos

Four separate git repos under `/home/mshari696/apps/kadence/`:

- `api/` — Express 5 + Drizzle + PostgreSQL (Bun runtime)
- `admin/` — Next.js App Router (ADMIN role only)
- `client/` — Next.js + Better Auth (CLIENT role only)
- `warehouse/` — Next.js PWA (LOGISTICS + ADMIN)

Plus `control/` exists for super-admin (separate auth).

**Same-named components across repos are NOT the same component.** When
debugging "what does role X see?" go to the app that role uses, not
file-name greps across all repos. App-role mapping is middleware-enforced
in each frontend's `src/middleware.tsx`.

### Deploy topology

- **Source of truth:** Bitbucket Cloud (`bitbucket.org/homeofpmg/kadence-*`)
- **API deploys:** AWS CodePipeline → CodeBuild → ECR → Elastic Beanstalk
  (account `609230521830`, region `ap-south-1`). Branch `staging` →
  staging EB; branch `main` → prod EB.
- **Frontend deploys:** AWS Amplify (one app per frontend). Branch `main`
  on each repo deploys to prod.
- **`bitbucket-pipelines.yml` is legacy noise** — does NOT drive any
  deploy. Ignore.
- Deploy-status scripts at `api/scripts/deploy/check-*.sh`.

### Databases

Three Supabase projects in `ap-south-1`:

- **Production:** `osouesidyqqimaqzzwcx` — real customer data. Never
  touched directly.
- **Staging:** `fpftkoyonutcxjdndnob` — refreshed from prod by
  `dbops:refresh-staging`. **CRITICAL safety property:** the refresh
  script auto-suffixes user emails with `-staging` before the `@`
  (lines 273-279 of `refresh-staging-from-prod.sh`). Real-people emails
  become `someone-staging@example.com`, nullifying notification-blast
  risk on staging.
- **Test:** `lvkysconjuabdifwzlkt` — wiped + reseeded each `test:e2e`
  run. Marker row gates destructive ops.

Cross-DB ops use `.env.dbops` (NOT loaded by app code, only by
`scripts/dbops/*.sh`).

### Tenants

- **Kadence** (the test/demo platform) — single platform on test DB.
  Companies: Kadence Demo. Users: Morgan Lee (admin), Jordan Maxwell
  (logistics), Alex Chen (CLIENT, used by docs agent), e2e-client.
- **Red Bull** (prod) — `enable_self_pickup=true` (company override),
  `enable_event_date_inputs=false`. SP is LIVE here.
- **Pernod Ricard** (prod) — `enable_self_pickup=false`,
  `enable_event_date_inputs=true`.

### The 4-entity shared pattern

Orders, inbound requests, service requests, and self-pickups share
infrastructure. When implementing for one, CHECK the other three:

**Shared:** prices (polymorphic via entity_type+entity_id), PricingService,
line_items (purpose_type enum + per-entity FK columns), invoices,
DocumentService, workflow_requests, entity_attachments, asset_bookings
(polymorphic order_id XOR self_pickup_id), scan_events (polymorphic).

**Divergent:** status enums per entity (orders 17 statuses, inbound 7,
SR dual model 7+7, SP 12). Cancellation cascades only on orders + SPs.
Transport trips only on orders. Maintenance feasibility only on orders.
SR derig/on-site only on orders. See `<four_entity_shared_pattern>` +
gotchas #35-#39 in CLAUDE.md.

### Email + notifications

- **Single choke point:** `src/app/services/email.service.ts:sendEmail`.
- **Auto-prefix in non-prod:** `[TESTING → ROLE]:` / `[STAGING]:` /
  unchanged for prod. Role extracted from `e2e.kadence.{role}@homeofpmg.com`
  alias pattern.
- **Notification dispatch is rule-driven.** `notification_rules` table
  is queried by `event_type`. If no rule matches an event, no email
  fires (silently). Past bug: zero rules seeded for `self_pickup.*` →
  no emails ever sent → user reported "no email, no Resend log."
- **Three e2e Outlook aliases** all forward to operator's inbox:
  `e2e.kadence.admin@homeofpmg.com`, `.logistics@`, `.client@`.

## 5. Patterns that have worked on this codebase

### Worktree isolation for parallel agents

When multiple agents work on the same repo concurrently, each agent should
work on a separate `git worktree` so they don't disturb each other:

```bash
cd /home/mshari696/apps/kadence/api && \
  git worktree add ../api-<feature> -b feature/<feature> staging

cd /home/mshari696/apps/kadence/api-<feature> && bun install
# Symlink env files from primary worktree:
for f in .env .env.staging .env.testing .env.production .env.dbops; do
    [ -f "../api/$f" ] && ln -sf "../api/$f" "$f"
done
```

Same for `client/` etc. Cleanup: `git worktree remove` from the primary
worktree when done.

### Phased rollout with coupling-constraint awareness

When changing a wire contract between client + server: the order matters.
Pattern that has worked:

1. **API accepts both old + new field shapes** (back-compat, no behavior
   change yet). Use Zod `.superRefine` + `.transform` to keep `.strict`
   while allowing either input key.
2. **Client always sends new shape** (server still treats old + new
   identically — no behavior change visible).
3. **API flips behavior** to use new shape's semantics. Safe because all
   clients have shipped Phase 2 by now.
4. **Future:** deprecate the old field after a release window.

Never flip API behavior (Phase 3) before Phase 2 client is live in
production. Otherwise old clients send the old shape and the API
mis-interprets.

### Reviewer caught what I missed (real example, this session)

I applied the Phase 2 client change to two write paths but missed a
third (the main order submit payload). The reviewer agent did a deep
trace through `submitOrderFromCart` and surfaced the exact bug class.
Lesson: always grep for ALL write paths to a changed wire contract,
not just the obvious ones. And: independent code review catches what
the author misses.

### Empirical testing before committing to an approach

When the design depends on a runtime behavior (e.g. "does
`Intl.DateTimeFormat` with `longOffset` work for DST?"): probe with
`bun -e '...'` BEFORE writing the code that depends on it. Documents
your assumption + catches surprises cheaply. See the composer DST test
in this session as a template.

### "Quality > quantity" seed enrichment

When extending the test seed for a new feature: only add what the new
scenarios EXERCISE. Don't bulk up the catalog "to look like staging" —
staging has 1091 asset families and your tests don't read 1091 rows.
Add the minimum quality fixtures (one single-stock asset, 5 SPs across
states, 9 stock_movements rows) and stop.

## 6. Anti-patterns to avoid

### Don't do another agent's audit work

Before launching a deep audit: check if recent commits show another
agent already did it. `git log --oneline --all -20 -- <relevant-files>`.
This session caught a case where I designed a workaround for a bug
another agent had already fixed in commit `441e155`.

### Don't trust your own session memory

Re-read CLAUDE.md sections relevant to your current work. Re-grep for
specific functions before referencing them. Files move, get renamed,
get refactored between sessions. Past sloppy moments where this bit
me: assumed a util's location, assumed a column type, assumed a
feature flag's value.

### Don't commit silently or push without OK

The user has explicitly said: "Hold off on commiting yet" and "we will
do after i give u the ok". Default = don't. When in doubt, ask.

### Don't try to fix unrelated pre-existing failures mid-task

The self-pickup E2E tests fail 5/5 on this branch — pre-existing,
unrelated to my work. I confirmed by running them on the primary
worktree at the same HEAD. Reported this clearly + moved on. Don't
chase rabbits that aren't yours.

### Don't write huge diffs you can't explain

If you can't summarize a change in two sentences for the user,
re-scope it. The user reads your commit messages and your chat. They
WILL ask "what did you actually change?" Have an answer ready.

### Don't conflate roles when chatting

When the user asks YOU a direct question, answer them. Don't write
"instructions for the other agent" when they wanted YOUR opinion.
Past quote: "nigga ASK LIKE A FUCKIGN HUIMANM".

## 7. Communication patterns

### Status updates

Match the size of the update to the size of the change:

- One-file fix → "Fixed X. Typecheck clean."
- Phase complete → 2-3 line summary + verification result
- Multi-phase work done → table of what shipped per phase + status
- End of session → recap with "what's done", "what's still open",
  "what other agents need to know"

### When you don't know

Say so. "I don't know — let me check" + actually check beats
guessing. The user has thanked me explicitly for catching myself
mid-claim and verifying.

### When the user pushes back

Take it seriously. They've been right almost every time they've
challenged a claim of mine in this codebase. Re-verify. Don't dig in
defending a position from memory.

### Recap format the user likes

Short bullets, one section per scope. Tables when comparing options
or showing per-item status. Never write a wall of prose for a recap.

## 8. Handoff patterns to other Claude agents

When a task needs to continue across sessions or be delegated to
another agent:

### The two-doc handoff

Pattern proven this session (see `seed-enrichment-*.md`):

1. **Context primer** — what the system IS, conventions, safety
   architecture, where things live, what to reuse. Doesn't change per
   task. Could be referenced by multiple briefs.
2. **Task brief** — what specifically to do, scope, files to touch,
   verification, hand-back format. Per-task.

The brief should reference the primer, not duplicate it.

### Review packet for code review

For PR-style reviews (Claude-to-Claude on the same machine, no
Bitbucket needed): write a packet at `~/.claude/plans/<descriptor>-review-packet.md`
with: worktree paths, commits to review, per-phase summary, critical
coupling constraints to verify, sign-off checklist, file pointers.
The reviewer reads files locally via Read tool + leaves findings in
chat back to the user.

### When you ARE the reviewer

Same pattern in reverse:

- Read the packet first
- Verify each claim with grep / Read
- Trace adversarial code paths (don't just trust the happy path)
- Surface findings with file:line refs
- Don't fix the bugs unless asked — surface them, let the original
  author iterate

### When pushing for human review

Standard Bitbucket PR flow works for human reviewers. For agent
reviewers, local worktree + chat findings is faster.
`git push -u origin feature/<branch>` is safe — feature branches
don't trigger deploys. Only `staging` + `main` pushes do.

## 9. Plans + memory hygiene

### Plan files

Live at `~/.claude/plans/`. Created when entering plan mode (auto-named)
or by hand. Use them for:

- Multi-phase implementation plans (with verification gates per phase)
- Audit reports the user might want to reference later
- Design decisions with rationale (so the next agent doesn't relitigate)

Don't create plan files for trivial work. The directory is shared with
other agents; keep the noise low.

### Memory files

Live at `~/.claude/projects/-home-mshari696-apps-kadence/memory/`.
Auto-loaded into your session via `MEMORY.md`. Add memories when:

- You learn a durable fact about the codebase that isn't in CLAUDE.md
- A bug recurs and the fix pattern is non-obvious
- The user gives feedback worth preserving across sessions
- An incident leaves a follow-up that future agents need to know about

Each memory is a separate file with frontmatter (`name`, `description`,
`type`). Add a one-line index entry to `MEMORY.md` pointing at it.

Don't bloat MEMORY.md with content — keep it as an index.

## 10. Key file pointers (current as of 2026-04-22)

When you need to find something fast:

| Concern                     | Path                                                                             |
| --------------------------- | -------------------------------------------------------------------------------- |
| Architecture overview       | `/home/mshari696/apps/kadence/CLAUDE.md`                                         |
| Env model spec              | `api/docs/env-setup.md`                                                          |
| E2E suite docs              | `api/test/README.md`                                                             |
| DB schema                   | `api/src/db/schema.ts` (~2400+ lines)                                            |
| Test seed composer          | `api/src/db/seed-test.ts`                                                        |
| Demo deterministic IDs      | `api/src/db/seeds/demo-deterministic.ts`                                         |
| Order submit + booking flow | `api/src/app/modules/order/order.services.ts`                                    |
| Self-pickup module          | `api/src/app/modules/self-pickup/self-pickup.services.ts`                        |
| Stock movement service      | `api/src/app/modules/stock-movements/stock-movements.services.ts`                |
| Notification routing        | `api/src/app/events/handlers/email.handler.ts`                                   |
| Email choke point           | `api/src/app/services/email.service.ts`                                          |
| Event types enum            | `api/src/app/events/event-types.ts`                                              |
| Booking release polymorphic | `api/src/app/modules/order/order.utils.ts:releaseBookingsAndRestoreAvailability` |
| Feasibility shared core     | `api/src/app/shared/feasibility/feasibility.core.ts`                             |
| Shared safety guards        | `api/src/db/safety/guards.ts`                                                    |
| Bootstrap env loader        | `api/src/bootstrap/env.ts`                                                       |
| Destructive guard internals | `api/src/db/scripts/destructive-guard.ts`                                        |
| Refresh staging from prod   | `api/scripts/dbops/refresh-staging-from-prod.sh`                                 |

## 11. Things to update in this guide

When you learn something durable, edit this file. Examples of additions
that would be valuable:

- New incident root causes + the durable fix pattern
- New conventions adopted by the team
- New gotchas not yet in CLAUDE.md
- User feedback you received that future agents need to know
- New tooling or scripts added to the codebase
- New entity types added to the 4-entity pattern

Don't expand this file with one-off task notes — those go to plan files.
This is durable how-to-work guidance.
