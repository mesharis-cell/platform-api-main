# Provision a New Kadence Client Tenant (Amplify) — End-to-End Plan

Target example: **penfolds** / display **Penfolds** / subdomain **penfolds.kadence.ae**
Reference (clone source): **client-redbull** (`d12ui6oezoziso`)
Account **609230521830** ("Kadence platform"), profile **kadence**, region **ap-south-1**.

This plan + the companion `provision-client.sh` provision a NEW AWS Amplify app from the single
`bitbucket.org/homeofpmg/kadence-client` repo, replicating the live redbull/pernod/bacardi tenants.
Branding, company name, and host-resolution are DB/API-driven (NOT per-build), so the only per-tenant
infra differences are: a new Amplify app, its env vars, and its custom domain.

---

## 0. TL;DR — what actually has to happen

1. **DB** (rows already exist for penfolds): a `companies` row + an active `company_domains.hostname = penfolds.kadence.ae` row on platform `kadence.ae`. The API resolves the subdomain the moment DNS points at the app. (Verified in discovery — see §4.) ⚠️ Resolution-present ≠ go-live-ready: `companies.settings.branding` must be non-null (G3) and `company_domains.platform` must point at the kadence.ae platform (G2), or the portal loads **unbranded / on the wrong platform**. Both are now verified in §9, not assumed.
2. **Amplify app**: create a WEB_COMPUTE app from the kadence-client repo, branch `main`, with the right env vars + (rely on in-repo `amplify.yml`).
3. **Custom domain**: `CreateDomainAssociation` for `penfolds.kadence.ae`. Amplify's service-linked role auto-creates the ACM cert validation CNAME + the A-alias to CloudFront in the same-account public zone — zero manual Route53/ACM.
4. **Build**: `StartJob RELEASE` on `main` (webhook usually fires automatically on branch create).
5. **Verify**: build SUCCEED + domain AVAILABLE + go-live gates G1 (resolution) / G2 (platform FK) / G3
   (branding non-null) + `https://penfolds.kadence.ae` loads the **branded** portal (not the default shell).

---

## 1. Prerequisites

### 1.1 IAM (the principal that RUNS the provisioner)

The on-disk principal **`arn:aws:iam::609230521830:user/kadence-api-staging` CANNOT run this** — it only has
`amplify:ListApps/ListBranches/ListJobs/StartJob` + `route53:ListHostedZones`, and is DENIED `GetApp`,
`ListDomainAssociations`, `CreateApp`, `iam:*`. See **§5 Exact gap list**.

Attach (or assume a role carrying) **`amplify-provisioner-iam-policy.json`** (this folder). Key grants:

- `amplify:CreateApp, GetApp, UpdateApp, CreateBranch, GetBranch, UpdateBranch, CreateDomainAssociation, GetDomainAssociation, ListDomainAssociations, StartJob, GetJob, TagResource`
- `iam:PassRole` on the Amplify SSR service role (required for WEB_COMPUTE/SSR log delivery). Scoped as
  `role/*` **hard-gated** by the `iam:PassedToService=amplify.amazonaws.com` condition — NOT a guessed name
  pattern (see §1.3 for why, and how to pin the exact ARN once readable)
- READ-ONLY `route53:Get/ListHostedZone(s)`, `route53:ListResourceRecordSets` (collision check only — NO `ChangeResourceRecordSets`)
- Optional READ-ONLY `acm:ListCertificates/DescribeCertificate` for status polling

### 1.2 Bitbucket repo connection — token-free PER RUN (VERIFIED 2026-06-30)

**Two facts that decide this (verified against primary sources):**

1. **Amplify cannot use AWS CodeConnections.** `CreateApp`/`UpdateApp` bind a repo with `repository` + exactly
   one of `accessToken` (GitHub App) or `oauthToken` (Bitbucket/CodeCommit). There is **no `connectionArn`
   field of any name** in the API — so the existing Bitbucket CodeConnection `e157d893…` (used by the API
   CodePipeline) **cannot** be reused by Amplify. Open, uncommitted feature request: aws-amplify/amplify-hosting#2215.
   Source: AWS Amplify API Reference `API_CreateApp.html`.
2. **Bitbucket app passwords are DEAD** — Atlassian disabled all remaining ones on **2026-06-09** (Phase 3). The
   credential the live apps were created with can no longer be minted. (Existing apps keep building — Amplify
   already installed their deploy key + webhook, and `oauthToken` is used once and not stored; only a _new_
   `create-app`/reconnect needs a fresh token.)

**So the repo is bound via `--oauth-token`, but the operator never handles that token per run.** The script
(`acquire_oauth_token()`) resolves it at `--apply` time from one of:

- **`--bb-oauth-consumer-secret <sm-id>` — RECOMMENDED + future-proof.** A **Bitbucket OAuth consumer** (OAuth
  2.0 — not deprecated) created ONCE in the `homeofpmg` workspace; store its `{ "key": "...", "secret": "..." }`
  in AWS Secrets Manager (e.g. `kadence/bitbucket-oauth-consumer`). At run time the script does the
  `client_credentials` grant → a short-lived (~2h) `oauthToken`, passes it to `create-app`, done. This is AWS's
  own documented Amplify+Bitbucket pattern (Prescriptive Guidance: _"Integrate a Bitbucket repository with AWS
  Amplify using AWS CloudFormation"_). One consumer serves every tenant + the future dashboard. Consumer scopes:
  **Repositories** + **Webhooks** (lets Amplify install the read-only SSH deploy key + push webhook → the
  fleet's `repositoryCloneMethod=SSH`).
- **`--bb-token-secret <sm-id>` — alternative.** A **Bitbucket Repository Access Token** (non-personal,
  revocable, scoped `repository:admin` + webhook) stored as a raw string in Secrets Manager; read directly.
  Simpler (no mint), but a long-lived secret; repo-scoped = least blast radius.
- **`BITBUCKET_TOKEN` env — manual override** for a one-off only.

`--access-token` is the **GitHub-App-only** path and does NOT bind Bitbucket — never use it here.

**IAM:** the provisioner principal needs `secretsmanager:GetSecretValue` on the secret ARN
(`arn:aws:secretsmanager:ap-south-1:609230521830:secret:kadence/bitbucket-*` — already in
`amplify-provisioner-iam-policy.json`). One-time human setup = create the OAuth consumer + store its key/secret
in Secrets Manager. After that **nobody touches a Bitbucket credential per provision** — CLI or dashboard.

### 1.3 The Amplify SSR service role

WEB_COMPUTE apps need an `iamServiceRoleArn` (an `AmplifySSRLoggingRole`) so Amplify writes SSR/compute logs
to CloudWatch. The reference apps already use one; the provisioner clones it from the template app
(`get-app .app.iamServiceRoleArn`). If `GetApp` on the template is denied, supply it via `--iam-service-role-arn`.

**`iam:PassRole` scoping (do not rely on a guessed name pattern).** `create-app --iam-service-role-arn <ARN>`
requires `iam:PassRole` on **that exact role ARN**. We cannot read the real ARN from the on-disk principal
(`get-app` + `iam:*` are denied), so the policy must NOT pin a guessed name like `role/AmplifySSRLoggingRole*`
— if the real SSR role is named outside the guessed patterns, **every** `--apply` dies at create-app with
`AccessDenied` and no app is ever created. `amplify-provisioner-iam-policy.json` therefore scopes PassRole as
`Resource: arn:aws:iam::609230521830:role/*` **hard-gated by** the `iam:PassedToService = amplify.amazonaws.com`
condition (the principal can pass a role _only_ to Amplify, nothing else). **Preferred hardening before the
first apply:** once a principal with `GetApp` is available, read the actual ARN with
`aws amplify get-app --app-id d12ui6oezoziso --query app.iamServiceRoleArn` and pin that exact ARN into the
PassRole `Resource` list (replacing `role/*`). (NB: IAM rejects unknown keys inside a `Statement`, so this
rationale lives here in the plan, not as a `_comment` in the JSON.)

### 1.4 Who runs it

A platform/infra engineer on the deploy machine with: the provisioner IAM policy attached to `kadence` profile
(or a dedicated `kadence-provisioner` profile), `BITBUCKET_TOKEN` exported, AWS CLI v2, `jq`, `bash`.

---

## 2. Ordered steps (what `provision-client.sh` does)

> Dry-run is the DEFAULT. Nothing mutates without `--apply`. In dry-run each mutating call is printed verbatim.

1. **Preflight**
    - `sts get-caller-identity` → assert account `609230521830`.
    - Assert required `amplify:*` perms by probing `get-app` on the template (fail early with the exact gap if denied).
    - Assert template app exists + is WEB_COMPUTE; read its config.
    - Assert Route53 zone `Z08196763MAPSYVZNMTWE` (`kadence.ae`) exists + is public; assert no pre-existing
      `<subdomain>` record collision.
    - Assert `BITBUCKET_TOKEN` present (only required for `--apply`).
2. **Idempotency** — `list-apps`; if an app already named `kadence-client-<company>` exists, print its appId and
   **abort cleanly** (reuse, don't duplicate). Domain-association + start-job steps remain re-runnable.
3. **Clone-from-reference** — from the template `get-app`/`get-branch`/`get-domain-associations`, copy:
   `platform` (WEB*COMPUTE), `iamServiceRoleArn`, `framework`, `enableBranchAutoBuild`, `customRules`, the
   invariant `environmentVariables` (e.g. `NEXT_PUBLIC_API_URL`, `AWS*\*`), and (optionally) the app `buildSpec`.
Per-tenant vars (`NEXT_PUBLIC_BASE_URL`) are derived by substituting the new subdomain.
   **Print a full diff (template → new) before applying.**
    - **`GetApp` is MANDATORY for `--apply`.** If the template `get-app` is denied/fails during apply, the script
      **HARD-ABORTS** (it does not silently degrade to a 2-key env). A degraded clone would build + render but
      500 on every server-side S3 route (uploads, signed URLs) because `AWS_REGION/AWS_ACCESS_KEY_ID/
AWS_SECRET_ACCESS_KEY/AWS_S3_BUCKET` would be missing — a silent half-working tenant. Override only with
      `--i-accept-minimal-env` (unsafe; then you MUST set the AWS\_\* via `update-app` immediately after create).
    - **Required-key assertion:** before create-app the script asserts the resolved env contains non-empty
      `NEXT_PUBLIC_API_URL` + the four `AWS_*` keys, and **refuses** otherwise (same override gate).
    - **Unknown-key review:** any template env key the script does not model (analytics keys, Sentry DSN, a
      tenant slug, etc.) is surfaced with a warning — it is cloned **verbatim**, so confirm none are tenant-pinned
      before `--apply` or `${company}` telemetry mis-attributes to the template tenant.
4. **create-app** — `--repository ...kadence-client --oauth-token *** --platform WEB_COMPUTE
--iam-service-role-arn <cloned> --environment-variables <merged> --custom-rules <cloned>`. (Bitbucket uses
   `--oauth-token`, NOT `--access-token` — see §1.2.)
   Build spec: prefer relying on the **in-repo `amplify.yml`** (do NOT paste an inline buildSpec — an inline
   spec shadows the repo file and causes drift). Only set `--build-spec` if the template carried one and you
   explicitly want to replicate it.
5. **create-branch** — `main`, `--enable-auto-build`, framework `Next.js - SSR`. The script READS the template's
   prod-branch env via `get-branch` and clones any **branch-level** overrides onto the new branch (branch env
   overrides app env). For the verified redbull template this is `{}` (all vars live at app level) → no
   `--environment-variables` flag, the branch inherits app-level (correct). A reference whose prod branch
   overrode e.g. `NEXT_PUBLIC_API_URL` would be faithfully replicated instead of silently dropped.
6. **create-domain-association** — `--domain-name kadence.ae`, sub-domain setting `prefix=<company>` →
   `branchName=main` (so `penfolds.kadence.ae`), plus `www` if the fleet uses it; certificate type
   `AMPLIFY_MANAGED`; `--no-enable-auto-sub-domain`. Amplify auto-issues the ACM cert and writes all DNS.
7. **start-job** — `RELEASE` on `main` (only if the create-branch webhook didn't already trigger a build).
8. **poll** — `get-job` until SUCCEED/FAILED; `get-domain-association` until `AVAILABLE`. The loops use a **real
   wait** (`sleep $POLL_INTERVAL`, default 15s) between iterations — build budget ~20 min, domain budget ~15 min
   — because a Next.js build + AMPLIFY_MANAGED ACM issuance + same-account DNS validation each take several
   minutes. If a loop exhausts its budget the script prints "still settling async — re-check with <cmd>" rather
   than a misleading UNKNOWN/failure; the underlying AWS operations continue regardless of the poll window.
9. **summary** — print the `<appId>.amplifyapp.com` default URL, the custom URL `https://penfolds.kadence.ae`,
   the build job status, the domain status, and the DB-resolution checklist.

---

## 3. ACM / Route53 behavior (same-account auto)

`kadence.ae` (zone `Z08196763MAPSYVZNMTWE`) is a **PUBLIC** Route53 zone in the **SAME** account as Amplify.
When `CreateDomainAssociation` runs for `penfolds.kadence.ae`, the Amplify service-linked role
(`AWSServiceRoleForAmplify`) automatically:

- requests an **AMPLIFY_MANAGED ACM certificate** and writes the `_<hash>.penfolds.kadence.ae CNAME →
...acm-validations.aws` validation record;
- writes the `penfolds.kadence.ae` **A-alias → <dist>.cloudfront.net** record (+ `www` CNAME if configured).

This is the exact pattern confirmed live for redbull/pernod/bacardi/admin/warehouse/control. The provisioning
principal needs **NO `acm:*` write and NO `route53:ChangeResourceRecordSets`**. Manual DNS/cert would only be
needed under a CUSTOM-cert opt-out, which the fleet does NOT use. **Do not add SPA rewrite rules** — WEB_COMPUTE
auto-generates SSR routing from the `.next` build manifest; a `/<*> → /index.html` rule would break middleware

- the `/api/orders/*` route handlers + the login server action.

---

## 4. Tenant resolution / DB + Better Auth + branding requirements

### 4.1 Host → platform/company resolution (server-side, API)

`getConfigByHostname()` (`api/src/app/modules/auth/Auth.services.ts:245-437`), reached via the public
`GET /auth/context` (no platformValidator). It strips env prefixes, then for a client host does an exact,
lowercase-normalized join: `company_domains.hostname = '<host>' AND company_domains.is_active = true`
⋈ `companies` ⋈ `platforms`. `is_verified` is **NOT** checked. Authenticated requests thereafter ride on the
cached `x-platform` UUID header, not the host.

### 4.2 Rows required (penfolds — verified present in PROD)

- `platforms`: `domain='kadence.ae'`, `is_active=true`, not in maintenance. id `852e6d14-...` (shared, not per-tenant).
- `companies`: id `380126dc-9d1c-4283-b717-f8bc10ef41ef`, `platform_id=852e6d14-...`, `name='Penfolds'`,
  `is_active=true`, `deleted_at=NULL`.
    - **`settings.branding.{logo_url,primary_color,secondary_color,title}` is a HARD GO-LIVE GATE, not a
      nice-to-have.** `getConfigByHostname` (`Auth.services.ts:328-340`) reads logo/colors from
      `settings.branding` and returns **null** branding when absent → the portal RESOLVES + LOGS IN but renders
      the **default unbranded shell** (no logo, default colors, generic `<title>`). The deliverable is a _branded_
      portal, so NULL branding = NOT live even though the site loads. The script's §9 verification SELECT now
      selects these fields and the `/auth/context` probe surfaces `logo_url/primary_color`; a null result is a
      **failing** check, not informational. Seed branding via the company/company-settings service (NOT raw SQL).
    - **Cosmetic gap**: `companies.domain='kadence.ae'` (siblings use bare `redbull`/`bacardi`/`pernod-ricard`).
      Unused by resolution; fix for convention only.
- `company_domains`: id `224baaa2-...`, `hostname='penfolds.kadence.ae'`, `is_active=true`, `is_primary=true`,
  `type=CUSTOM`, `is_verified=false` (harmless), **`platform`=the kadence.ae platform id `852e6d14-...`**.
  The resolver inner-joins `company_domains.platform_id → platforms` (`Auth.services.ts:307-325`), so a row
  whose `platform` FK points at the WRONG platform still joins successfully and silently serves a _different_
  platform's config/features for `penfolds.kadence.ae`. The §9 SELECT now selects `cd.platform` so this can be
  asserted == `852e6d14-...`. **This already resolves.**

**Net: for penfolds, DB needs NOTHING for resolution — but branding (G3) + platform FK (G2) must be VERIFIED
before declaring the tenant live.** The only remaining infra work is this plan. DNS for `penfolds.kadence.ae`
must point at the new Amplify app before the hostname can reach the API.

### 4.3 Prefer API/admin over raw SQL

If a future tenant's company/company_domains rows DON'T exist yet, create them via the **company-create flow**
(`company.services.ts:78-162` auto-creates the `company_domains` VANITY row `hostname=${domain}.${platform.domain}`,
`is_primary=true`) or the **company-domains module** — NOT raw INSERT. The script's DB section shows the
READ-ONLY verification SELECT and flags any INSERT as a separate, human-guarded step (production = no ad-hoc SQL
mutation in a provisioning script).

### 4.4 Better Auth

Vestigial in the live client portal — the real session is API-JWT (`/auth/login` + non-httpOnly, host-only
cookies with **no Domain attribute**), so each subdomain gets an isolated session automatically. The only
Better-Auth-related per-tenant knob is the env var `NEXT_PUBLIC_BASE_URL` (its `createAuthClient` baseURL),
which must be the tenant's own origin (`https://penfolds.kadence.ae`).

### 4.5 Branding

HOST-driven via `/auth/context` (colors → CSS vars at runtime; `company_name` → SSR `<title>`; `logo_url` →
nav). **No per-build branding asset.** Change logo/colors/name by editing the `companies.settings.branding`
DB row, not by rebuilding. Same build serves every tenant.

### 4.6 Feature flags

No flag is needed to RESOLVE/RENDER a subdomain. Per-feature gating (`enable_self_pickup`, attachments,
workflows, invoicing, base_operations) is via `resolveEffectiveFeature` (company override → platform → registry
default), surfaced in `/auth/context`. Turn on the tenant's needed features on the company/platform features
JSONB as a separate config step (DB / admin settings), not part of infra.

---

## 5. EXACT gap list — what `kadence-api-staging` lacks (must be granted before running)

| Need                                                          | Status for current principal                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `amplify:CreateApp`                                           | DENIED                                                                                  |
| `amplify:CreateBranch`                                        | DENIED                                                                                  |
| `amplify:CreateDomainAssociation`                             | DENIED                                                                                  |
| `amplify:UpdateApp` / `UpdateBranch` / `TagResource`          | DENIED                                                                                  |
| `amplify:GetApp`                                              | DENIED (confirmed AccessDeniedException) — needed to clone template + read back new app |
| `amplify:GetBranch` / `GetJob`                                | UNKNOWN (not probed) — assume needed                                                    |
| `amplify:ListDomainAssociations` / `GetDomainAssociation`     | DENIED — cannot verify domain status                                                    |
| `amplify:ListApps` / `ListBranches` / `ListJobs` / `StartJob` | ALLOWED (in scope)                                                                      |
| `iam:PassRole` on AmplifySSRLoggingRole                       | DENIED — cannot pass the SSR service role to CreateApp                                  |
| `iam:List*/GetRole`                                           | DENIED — cannot discover the SSR role ARN                                               |
| `route53:ListHostedZones`                                     | ALLOWED; `GetHostedZone`/`ListResourceRecordSets` not probed                            |
| `route53:ChangeResourceRecordSets`                            | NOT NEEDED (Amplify-managed DNS)                                                        |
| `codeconnections:ListConnections`                             | DENIED — moot (fleet uses SSH via Bitbucket `oauthToken`, not a connectionArn)          |
| **Bitbucket access token**                                    | **MISSING INPUT** — not in AWS; supply out-of-band as `BITBUCKET_TOKEN`                 |

Resolution: attach `amplify-provisioner-iam-policy.json` (or assume a role with it) and export `BITBUCKET_TOKEN`.

---

## 6. Verification

- `aws amplify get-job --app-id <new> --branch-name main --job-id <id>` → `status: SUCCEED`.
- `aws amplify get-domain-association --app-id <new> --domain-name kadence.ae` → `domainStatus: AVAILABLE`,
  subdomain `penfolds` verified, cert issued.
- `dig +short penfolds.kadence.ae` → resolves to a `cloudfront.net` alias.
- `curl -sI https://penfolds.kadence.ae` → 200 (SSR) with a valid TLS cert for the host.
- `curl -s 'https://api.kadence.ae/auth/context' -H 'x-forwarded-host: penfolds.kadence.ae' | jq '{platform_id,company_name,logo_url,primary_color}'`
  → returns Penfolds platform/company + branding (proves DB resolution end-to-end). **`platform_id` must equal
  the kadence.ae platform id `852e6d14-...` (G2); `logo_url`/`primary_color` must be non-null (G3).** A null
  branding value or a mismatched `platform_id` is a **FAILING** result — do not declare the tenant live.
- The §9 SQL SELECT must return exactly one row with company active + not deleted, domain active,
  `domain_platform == 852e6d14-...`, and `logo_url`/`primary_color`/`secondary_color` all non-null.
- Load `https://penfolds.kadence.ae` in a browser: branded title + colors (NOT the default unbranded shell),
  login works, isolated session cookie.

## 7. Rollback / failure handling

- **Create-app failed**: nothing to roll back; fix the error (token scope, PassRole, region) and re-run.
- **Branch/domain failed after app created**: the script's idempotency check reuses the app on re-run; you can
  also `aws amplify delete-app --app-id <new>` (NOT in the provisioner's allowed perms — a separate admin action;
  intentionally excluded so the provisioner cannot destroy live apps).
- **Domain stuck in PENDING_VERIFICATION**: confirm Amplify wrote the `_<hash>` ACM CNAME into
  `Z08196763MAPSYVZNMTWE` (read-only `list-resource-record-sets`); same-account auto-DNS usually clears in
  minutes. Do not hand-create records — that fights the service-linked role.
- **Build failed**: inspect with `bash api/scripts/deploy/check-amplify.sh`. Likely causes: stale/missing
  `bun.lock`, a `pnpm-lock.yaml`/`package-lock.json` present (preBuild `exit 1`), Node < 18.18, or an MDX
  prerender error (`next build` catches these even though `tsc` is set to ignore build errors). Fix in repo,
  push, rebuild.
- **Wrong env var**: `aws amplify update-app`/`update-branch` to correct, then `start-job RELEASE` to rebake
  (NEXT*PUBLIC*\* are inlined at build time — a rebuild is required for them to take effect).

---

## 8. FUTURE: admin-dashboard action

Goal: turn this script into a one-click "Provision client portal" action in the admin app, so creating a
company optionally provisions its Amplify tenant.

### 8.1 API endpoint design (platform-api)

- `POST /operations/v1/companies/:companyId/provision-portal` — `auth("ADMIN")` + super-admin OR a new
  granular permission `companies:provision_portal` (add to PERMISSIONS, seed data, template defaults, admin
  role-based rendering — per `cross_repo_ripple_rule` #3). Body Zod: `{ subdomain?, templateAppId? }`
  (`payloadValidator` validates body only — validate `:companyId` param manually). Wrapped in `catchAsync`,
  responds via `sendResponse` (202 ACCEPTED with the job id), errors via `CustomizedError`.
- `GET /operations/v1/companies/:companyId/provision-portal/status` — returns the async job state
  (build status + domain status), polled by the UI.

### 8.2 Async job / queue

Provisioning takes minutes (build + cert + DNS), so it must be async — never block the request thread.

- Persist a `tenant_provisioning_jobs` row (companyId, status `QUEUED|CREATING_APP|BUILDING|DNS_PENDING|READY|FAILED`,
  appId, branchName, domainStatus, lastError, timestamps). This is the **idempotency key**: a company already
  having a non-FAILED job (or an existing Amplify app) returns the existing job instead of creating a duplicate
  (mirrors the script's `list-apps` reuse check).
- Run the work via the existing EventBus + a handler (emit `TENANT_PROVISION_REQUESTED` to `system_events`; a
  listener executes the SDK calls and advances the row), or a lightweight worker/cron poller for status. Add
  `TENANT_PROVISION_*` to `EVENT_TYPES`, seed notification rules + templates if ops wants email on completion
  (`cross_repo_ripple_rule` #6).

### 8.3 AWS SDK calls (mirror the script)

Use `@aws-sdk/client-amplify`: `CreateAppCommand` (platform WEB*COMPUTE, repository, **`oauthToken`** for
Bitbucket — NOT `accessToken`, which is GitHub-only — iamServiceRoleArn, environmentVariables incl. the AWS*\*
server creds, customRules), `CreateBranchCommand`, `CreateDomainAssociationCommand`, `StartJobCommand`, then
`GetJobCommand` + `GetDomainAssociationCommand` for status. Same ordered flow as §2.

### 8.4 IAM role the API assumes

The API server (EB) assumes a dedicated `kadence-tenant-provisioner` role carrying exactly
`amplify-provisioner-iam-policy.json` (+ `iam:PassRole` on AmplifySSRLoggingRole). The **Bitbucket token** lives
in a secret store (AWS Secrets Manager / EB env property `BITBUCKET_PROVISION_TOKEN`) — the handler reads it at
job time, never logs it. Note this is the prod account `609230521830`, distinct from the media S3 account; the
API would need creds/role for that account specifically (today its AWS creds are the media account — a new
role/STS assume-role hop is required).

### 8.5 Surfacing status back to admin UI

- TanStack Query hook `useProvisionPortal(companyId)` (mutation) + `useProvisionStatus(companyId)` (polling
  query, refetchInterval while not terminal) in `admin/src/hooks/`.
- A "Portal" card on `admin/src/app/companies/[id]/page.tsx`: shows `Not provisioned / Building / DNS pending /
Live` with the live URL + a retry button on FAILED. Reuse the Tier-2 settings layout.

### 8.6 Cross-repo ripple (per CLAUDE.md)

- platform-admin: new permission + hook + company-detail card (above).
- platform-client: none — the new tenant IS a client deploy; no client code change.
- platform-warehouse: none.
- Schema: new `tenant_provisioning_jobs` table → hand-written migration `drizzle/NNNN_*.sql` + `_journal.json`
  entry (no snapshot; `drizzle-kit migrate` only). Add the status enum value-first if enum-typed.
- New event types + notification rules/templates if completion email is wanted.
- DB: the endpoint should also ensure the `companies` + `company_domains` rows exist (create via the existing
  company-domains service, not raw SQL) and optionally set default `settings.branding` so the portal renders
  branded on first load.
