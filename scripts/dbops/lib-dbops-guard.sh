#!/usr/bin/env bash
# ============================================================================
# lib-dbops-guard.sh  —  shared safety helpers for the staging dbops flow
#
# Sourced (never executed) by refresh-staging-from-prod.sh and
# sanitize-staging.sh. Provides:
#
#   dbops_url_field <url> <user|host|port|db|ref>
#       Parse a single field out of a postgres URL WITHOUT ever emitting the
#       password. `ref` resolves the Supabase project ref from either the
#       pooler username (postgres.<ref>) or a direct host (db.<ref>.supabase.co).
#
#   dbops_resolve_psql
#       Echo a usable psql binary path (mirrors snapshot/restore resolution:
#       honour PSQL_BIN, then bundled tools, then PATH).
#
#   dbops_live_fingerprint <url>
#       Echo an md5 identity fingerprint for the connected server
#       (database|user|server-addr|port) — the same expression fingerprint-db.sh
#       uses. Read-only.
#
#   dbops_assert_write_target_safe <write_url> <prod_url> <allow_prod_fp:0|1>
#       THE FIFTH GUARD. Runs BEFORE the first destructive statement. Resolves
#       what the WRITE target actually is and HARD-REFUSES if it looks like prod:
#         1. parse-level: refuse if write ref == prod ref, or write host == prod host
#         2. live-level : fingerprint the write target (proves it's reachable +
#            records its identity); when allow_prod_fp=1 (caller already talks to
#            prod, e.g. the dump step) ALSO fingerprint prod read-only and refuse
#            if the two md5s are identical (catches DNS aliasing / same server
#            behind two hostnames).
#       Never prints a URL or password. Prints only resolved refs + PASS/FAIL.
#
# A mis-edited .env.dbops with STAGING_DATABASE_URL and PROD_DATABASE_URL swapped
# must die here, loudly, before any write.
# ============================================================================

# Parse one field from a postgres URL without ever exposing the password.
dbops_url_field() {
    local url="$1" field="$2"
    local rest="${url#*://}"        # strip scheme://
    local userinfo hostpart user hostport_db hostport db host port
    userinfo="${rest%%@*}"          # user[:pass]  (dropped for everything but `user`)
    hostpart="${rest#*@}"           # host[:port]/db?params
    if [[ "$rest" != *"@"* ]]; then # URL without userinfo
        userinfo=""
        hostpart="$rest"
    fi
    user="${userinfo%%:*}"          # take only up to first ':' — never the password
    hostport_db="${hostpart%%\?*}"  # drop ?params
    hostport="${hostport_db%%/*}"
    db="${hostport_db#*/}"
    [[ "$db" == "$hostport_db" ]] && db=""
    host="${hostport%%:*}"
    port="${hostport##*:}"
    [[ "$port" == "$host" ]] && port="5432"

    case "$field" in
        user) printf '%s' "$user" ;;
        host) printf '%s' "$host" ;;
        port) printf '%s' "$port" ;;
        db) printf '%s' "$db" ;;
        ref)
            if [[ "$user" == postgres.* ]]; then
                printf '%s' "${user#postgres.}"
            elif [[ "$host" == db.*.supabase.co ]]; then
                local h="${host#db.}"
                printf '%s' "${h%.supabase.co}"
            else
                printf '%s' ""
            fi
            ;;
        *)
            echo "dbops_url_field: unknown field '$field'" >&2
            return 1
            ;;
    esac
}

# If the psql we picked is a bundled build under .dbops/tools, make its bundled
# libpq visible so it doesn't symbol-clash with an older system libpq. Mirrors
# snapshot-db.sh / restore-db-snapshot.sh's add_pg_tool_lib_path.
dbops_add_pg_lib_path() {
    local bin_path="$1"
    local root="${bin_path%%/usr/lib/postgresql/*}"
    local lib_path="$root/usr/lib/x86_64-linux-gnu"
    if [[ "$root" != "$bin_path" && -d "$lib_path" ]]; then
        export LD_LIBRARY_PATH="$lib_path${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    fi
}

dbops_resolve_psql() {
    local resolved=""
    if [[ -n "${PSQL_BIN:-}" && -x "${PSQL_BIN:-}" ]]; then
        resolved="$PSQL_BIN"
    else
        local search_root discovered
        for search_root in "${API_ROOT:-.}/.dbops/tools" /tmp /usr/lib/postgresql; do
            discovered="$(
                find "$search_root" \
                    -type f \( -path "*/usr/lib/postgresql/*/bin/psql" -o -path "*/bin/psql" \) \
                    2>/dev/null | sort -V | tail -n 1 || true
            )"
            if [[ -n "$discovered" ]]; then
                resolved="$discovered"
                break
            fi
        done
        if [[ -z "$resolved" ]] && command -v psql >/dev/null 2>&1; then
            resolved="$(command -v psql)"
        fi
    fi
    if [[ -z "$resolved" ]]; then
        echo "Missing required command: psql" >&2
        return 1
    fi
    dbops_add_pg_lib_path "$resolved"
    printf '%s' "$resolved"
}

# md5 identity of the connected server. Read-only. Never prints the URL.
dbops_live_fingerprint() {
    local url="$1" psql_bin
    psql_bin="$(dbops_resolve_psql)" || return 1
    # dbops_resolve_psql's LD_LIBRARY_PATH export happened in its subshell; set it
    # again HERE so the psql invocation below sees the bundled libpq.
    dbops_add_pg_lib_path "$psql_bin"
    PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}" "$psql_bin" "$url" -v ON_ERROR_STOP=1 -At <<'SQL'
select md5(
    current_database() || '|' ||
    current_user || '|' ||
    coalesce(inet_server_addr()::text, 'local') || '|' ||
    inet_server_port()::text
);
SQL
}

# The fifth guard. See file header.
dbops_assert_write_target_safe() {
    local write_url="$1" prod_url="$2" allow_prod_fp="${3:-0}"

    local w_ref w_host w_db p_ref p_host
    w_ref="$(dbops_url_field "$write_url" ref)"
    w_host="$(dbops_url_field "$write_url" host)"
    w_db="$(dbops_url_field "$write_url" db)"
    p_ref="$(dbops_url_field "$prod_url" ref)"
    p_host="$(dbops_url_field "$prod_url" host)"

    echo "  [guard] write-target ref : ${w_ref:-<none>}  host: ${w_host}  db: ${w_db}"
    echo "  [guard] prod ref         : ${p_ref:-<none>}  host: ${p_host}"

    # 1) Parse-level anti-prod assertions.
    #    Supabase project identity lives in the REF (the pooler username
    #    postgres.<ref>), and staging + prod legitimately SHARE a regional pooler
    #    host — so ref equality is the definitive signal. Host equality is only a
    #    distinguisher when NO ref is resolvable (direct / custom-host targets).
    if [[ -n "$w_ref" && -n "$p_ref" ]]; then
        if [[ "$w_ref" == "$p_ref" ]]; then
            echo "ERROR: [guard] write target ref matches PROD ref ($w_ref). Refusing." >&2
            echo "       .env.dbops STAGING_DATABASE_URL appears to point at production." >&2
            return 1
        fi
    elif [[ "$w_host" == "$p_host" ]]; then
        echo "ERROR: [guard] write target host matches PROD host (no ref to distinguish). Refusing." >&2
        echo "       .env.dbops STAGING_DATABASE_URL appears to point at production." >&2
        return 1
    fi

    # 2) Live fingerprint of the WRITE target — must be reachable.
    local w_fp
    w_fp="$(dbops_live_fingerprint "$write_url")" || {
        echo "ERROR: [guard] could not fingerprint the write target. Refusing." >&2
        return 1
    }
    echo "  [guard] write-target live fingerprint: $w_fp"

    # 3) When the caller already legitimately connects to prod (the dump step),
    #    fingerprint prod read-only and refuse on md5 collision.
    if [[ "$allow_prod_fp" == "1" ]]; then
        local p_fp
        p_fp="$(dbops_live_fingerprint "$prod_url")" || {
            echo "ERROR: [guard] could not fingerprint prod for the collision check. Refusing." >&2
            return 1
        }
        echo "  [guard] prod live fingerprint        : $p_fp"
        if [[ "$w_fp" == "$p_fp" ]]; then
            echo "ERROR: [guard] write target and PROD resolve to the SAME server (md5 match). Refusing." >&2
            return 1
        fi
    fi

    echo "  [guard] PASS — write target is not production."
    return 0
}
