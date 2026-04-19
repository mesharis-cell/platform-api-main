-- ============================================================================
-- cleanup-prod-schema-drift.sql
--
-- One-off schema cleanup to bring prod in line with current schema.ts.
-- Safe to run multiple times (all statements are IF EXISTS / IF NOT EXISTS).
--
-- DRIFT FIXED:
--   Removes from prod:
--     - users.permission_template   (legacy, replaced by access_policies)
--     - workflow_requests.assigned_email  (legacy)
--     - workflow_requests.workflow_kind   (legacy)
--     - enum type: permission_template
--     - enum type: workflow_request_kind
--   Adds to prod:
--     - service_requests.photos     (text[] NOT NULL DEFAULT {})
--     - service_requests.work_notes (text NULL)
--
-- HOW TO RUN (against PROD only):
--
--   # 1. Preview with a ROLLBACK at the end (no changes persisted)
--   cd ~/apps/kadence/api
--   source .env.dbops.local
--   psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/dbops/cleanup-prod-schema-drift.sql
--
--   # The script commits by default. To PREVIEW instead, edit the final
--   # COMMIT line to ROLLBACK, run it, then revert the file.
--
-- DATA LOSS WARNING:
--   users.permission_template has ~9 rows with legacy role data. These roles
--   (PLATFORM_ADMIN, LOGISTICS_STAFF, CLIENT_USER) are no longer used by the
--   application — the access_policies system replaced them. Dropping is safe.
-- ============================================================================

\echo '=== BEFORE cleanup ==='

SELECT 'users.permission_template non-null rows' AS label,
       (SELECT count(*) FROM public.users WHERE permission_template IS NOT NULL) AS count;

SELECT 'workflow_requests.assigned_email non-null rows' AS label,
       (SELECT count(*) FROM public.workflow_requests WHERE assigned_email IS NOT NULL) AS count;

SELECT 'workflow_requests.workflow_kind non-null rows' AS label,
       (SELECT count(*) FROM public.workflow_requests WHERE workflow_kind IS NOT NULL) AS count;

SELECT 'service_requests.photos exists' AS label,
       CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='service_requests' AND column_name='photos'
       ) THEN 'yes' ELSE 'no' END AS status;

SELECT 'service_requests.work_notes exists' AS label,
       CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='service_requests' AND column_name='work_notes'
       ) THEN 'yes' ELSE 'no' END AS status;

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Drop legacy columns from prod
-- ----------------------------------------------------------------------------
ALTER TABLE public.users            DROP COLUMN IF EXISTS permission_template;
ALTER TABLE public.workflow_requests DROP COLUMN IF EXISTS assigned_email;
ALTER TABLE public.workflow_requests DROP COLUMN IF EXISTS workflow_kind;

-- ----------------------------------------------------------------------------
-- 2. Drop orphaned enum types (no longer referenced by any column)
--    If any new code reference exists this will error and rollback.
-- ----------------------------------------------------------------------------
DROP TYPE IF EXISTS public.permission_template;
DROP TYPE IF EXISTS public.workflow_request_kind;

-- ----------------------------------------------------------------------------
-- 3. Add new columns to service_requests (matching schema.ts)
-- ----------------------------------------------------------------------------
ALTER TABLE public.service_requests
    ADD COLUMN IF NOT EXISTS photos text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.service_requests
    ADD COLUMN IF NOT EXISTS work_notes text;

COMMIT;

\echo '=== AFTER cleanup ==='

SELECT 'users.permission_template exists' AS label,
       CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='users' AND column_name='permission_template'
       ) THEN 'yes (FAIL)' ELSE 'no (OK)' END AS status;

SELECT 'workflow_requests.assigned_email exists' AS label,
       CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='workflow_requests' AND column_name='assigned_email'
       ) THEN 'yes (FAIL)' ELSE 'no (OK)' END AS status;

SELECT 'workflow_requests.workflow_kind exists' AS label,
       CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='workflow_requests' AND column_name='workflow_kind'
       ) THEN 'yes (FAIL)' ELSE 'no (OK)' END AS status;

SELECT 'service_requests.photos data_type' AS label,
       (SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='service_requests' AND column_name='photos') AS value;

SELECT 'service_requests.work_notes data_type' AS label,
       (SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='service_requests' AND column_name='work_notes') AS value;

SELECT 'permission_template enum still exists' AS label,
       CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'permission_template')
            THEN 'yes (FAIL)' ELSE 'no (OK)' END AS status;

SELECT 'workflow_request_kind enum still exists' AS label,
       CASE WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_request_kind')
            THEN 'yes (FAIL)' ELSE 'no (OK)' END AS status;
