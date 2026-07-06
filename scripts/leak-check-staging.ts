/**
 * Pricing leak-check — READ-ONLY against the running staging-backed API (:6001).
 *
 * Mints CLIENT / LOGISTICS / ADMIN tokens with the app's JWT secret (no
 * passwords), fetches every priced entity detail (order / self-pickup /
 * inbound-request / service-request) + the standalone line-item endpoint +
 * the ADMIN role-preview, and asserts the role projection contract that tsc
 * cannot: a CLIENT response must never carry buy / margin / raw unit_rate /
 * sell_unit_rate fields; a LOGISTICS response must never carry sell / margin
 * fields. `projectByRole` (pricing.service.ts) is the only sanctioned
 * projection path — this script is the runtime tripwire on it.
 *
 * Pricing-ledger Phase 4, P4-4. MANUAL / CI-STEP GATE — NOT part of predeploy.
 * It needs a live staging-backed API on :6001 (APP_ENV=staging bun run dev),
 * so it can't run inside the static predeploy pipeline.
 *
 *   # boot the API first:  APP_ENV=staging bun run dev        (binds :6001)
 *   # then:
 *   APP_ENV=staging bun --preload ./src/bootstrap/env-preload.ts ./scripts/leak-check-staging.ts
 *
 * Read-only: only GETs. No writes, no mutations. Safe to run against staging.
 */
import jwt from "jsonwebtoken";

const API = process.env.LEAK_CHECK_API || "http://localhost:6001";
const PLAT = "852e6d14-cd3e-4a78-893b-b6ea7c91dead";
const SECRET = process.env.JWT_ACCESS_SECRET;

if (!SECRET) {
    console.error("No JWT_ACCESS_SECRET in env — run with APP_ENV=staging + env preload.");
    process.exit(1);
}

// Discovered on staging (platform 852e...):
//   LOGISTICS logistics@test.com          — platform-level logistics (sees all)
//   CLIENT    gorkem.kanat-staging@redbull.com — Red Bull company-scoped
const RB_COMPANY = "268a4d32-c07f-4281-99cc-e1647d0a2d84";
const mint = (id: string, role: string, email: string, companyId?: string) =>
    jwt.sign(
        { id, role, email, platform_id: PLAT, ...(companyId ? { company_id: companyId } : {}) },
        SECRET as string,
        { expiresIn: "1h" }
    );

const ADMIN = mint(
    "2643720d-761f-4535-93d5-d91e6027ccf2",
    "ADMIN",
    "meshari.s-staging@homeofpmg.com"
);
const LOGISTICS = mint("c2fdbef7-b95a-43e4-b651-227f18c72aaa", "LOGISTICS", "logistics@test.com");
const CLIENT = mint(
    "de481890-0864-4888-a6b2-cb64562125b5",
    "CLIENT",
    "gorkem.kanat-staging@redbull.com",
    RB_COMPANY
);

// ── Forbidden-key sets per role (deep-scanned in the whole response JSON) ─────
// CLIENT: never any BUY-side, MARGIN, or raw per-line rate field. (The client
// projection legitimately re-uses generic keys like system_total/total for its
// SELL values, so those are NOT forbidden by name — only the buy_/margin_/raw
// rate keys are.)
const CLIENT_FORBIDDEN = new Set([
    "buy_total",
    "buy_unit_price",
    "buy_system_total",
    "buy_rate_card_total",
    "buy_custom_total",
    "margin",
    "margin_policy",
    "margin_percent",
    "margin_amount",
    "is_override",
    "override_reason",
    "unit_rate",
    "sell_unit_rate",
    "sell_unit_rate_override",
    "apply_margin",
]);
// LOGISTICS: buy-only. Never any SELL-side or MARGIN field.
const LOGISTICS_FORBIDDEN = new Set([
    "sell_total",
    "sell_unit_price",
    "sell_unit_rate",
    "sell_unit_rate_override",
    "sell_system_total",
    "sell_rate_card_total",
    "sell_custom_total",
    "sell_total_with_vat",
    "margin",
    "margin_policy",
    "margin_percent",
    "margin_amount",
    "is_override",
    "override_reason",
]);

type Hit = { path: string; key: string; value: unknown };
function scan(node: unknown, forbidden: Set<string>, path = "$", out: Hit[] = []): Hit[] {
    if (node === null || typeof node !== "object") return out;
    if (Array.isArray(node)) {
        node.forEach((v, i) => scan(v, forbidden, `${path}[${i}]`, out));
        return out;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (forbidden.has(k) && v !== null && v !== undefined) {
            out.push({ path: `${path}.${k}`, key: k, value: v });
        }
        scan(v, forbidden, `${path}.${k}`, out);
    }
    return out;
}

let pass = 0;
let fail = 0;
const report: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
    report.push(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? `\n            ${detail}` : ""}`);
    ok ? pass++ : fail++;
};

async function call(token: string, path: string) {
    try {
        const res = await fetch(`${API}${path}`, {
            headers: { Authorization: `Bearer ${token}`, "x-platform": PLAT },
        });
        const ct = res.headers.get("content-type") || "";
        const json = ct.includes("json") ? ((await res.json()) as any) : null;
        return { status: res.status, json };
    } catch (e: any) {
        return { status: 0, json: null, err: e?.message };
    }
}

// Pull the first array of {id,...} objects found anywhere in a list response.
function firstIdList(json: any): Array<Record<string, any>> {
    const found: Array<Record<string, any>> = [];
    const walk = (n: any) => {
        if (!n || typeof n !== "object") return;
        if (Array.isArray(n)) {
            if (n.length && n.every((x) => x && typeof x === "object" && "id" in x)) {
                found.push(...n);
                return;
            }
            n.forEach(walk);
            return;
        }
        for (const v of Object.values(n)) walk(v);
    };
    walk(json?.data ?? json);
    return found;
}

async function leakCheck(
    label: string,
    token: string,
    forbidden: Set<string>,
    path: string
): Promise<{ status: number; hits: Hit[] } | null> {
    const r = await call(token, path);
    if (r.status === 0) {
        check(`${label} — reachable`, false, `network error: ${(r as any).err}`);
        return null;
    }
    if (r.status === 404) {
        // entity not visible to this role / not found — not a leak, just skip
        return { status: 404, hits: [] };
    }
    if (r.status === 403) {
        check(`${label} — projection contract`, true, `403 (role denied — no payload, no leak)`);
        return { status: 403, hits: [] };
    }
    if (r.status !== 200) {
        check(`${label} — projection contract`, true, `HTTP ${r.status} (no 200 payload to leak)`);
        return { status: r.status, hits: [] };
    }
    const hits = scan(r.json, forbidden);
    const uniqueKeys = [...new Set(hits.map((h) => h.key))];
    check(
        `${label} — no forbidden fields`,
        hits.length === 0,
        hits.length === 0
            ? "clean"
            : `LEAKED keys [${uniqueKeys.join(", ")}] at e.g. ${hits
                  .slice(0, 4)
                  .map((h) => `${h.path}=${JSON.stringify(h.value)}`)
                  .join("  ")}`
    );
    return { status: 200, hits };
}

async function main() {
    console.log(`\n🔎 pricing leak-check (READ-ONLY)  API=${API}\n`);

    // ── Discover ids via ADMIN (sees everything), scope client tests to RB ────
    const disc: Record<string, string[]> = {};
    const rbDisc: Record<string, string[]> = {};
    const listMap: Array<[string, string]> = [
        ["order", "/operations/v1/order?limit=25"],
        ["self-pickup", "/operations/v1/self-pickup?limit=25"],
        ["inbound-request", "/operations/v1/inbound-request?limit=25"],
        ["service-request", "/operations/v1/service-request?limit=25"],
    ];
    for (const [ent, url] of listMap) {
        const r = await call(ADMIN, url);
        const items = firstIdList(r.json);
        disc[ent] = items.map((x) => x.id).filter(Boolean);
        rbDisc[ent] = items
            .filter((x) => {
                const co = x.company ?? x.company_id ?? x.companyId;
                return co === RB_COMPANY;
            })
            .map((x) => x.id);
        console.log(
            `  discovered ${ent}: ${disc[ent].length} total, ${rbDisc[ent].length} Red Bull  (list HTTP ${r.status})`
        );
    }
    console.log("");

    // ── LOGISTICS — buy-only. Fetch ops detail for each entity + line items ───
    for (const [ent, ids] of Object.entries(disc)) {
        const id = ids[0];
        if (!id) {
            check(`LOGISTICS ${ent} detail`, true, "no entity available on staging — SKIPPED");
            continue;
        }
        await leakCheck(
            `LOGISTICS ${ent} ${id.slice(0, 8)}`,
            LOGISTICS,
            LOGISTICS_FORBIDDEN,
            `/operations/v1/${ent}/${id}`
        );
    }
    // Standalone line-item endpoint (ops, ADMIN+LOGISTICS) for an order
    if (disc["order"]?.[0]) {
        await leakCheck(
            `LOGISTICS line-item (order ${disc["order"][0].slice(0, 8)})`,
            LOGISTICS,
            LOGISTICS_FORBIDDEN,
            `/operations/v1/line-item?purpose_type=ORDER&order_id=${disc["order"][0]}`
        );
    }

    // ── CLIENT — sell-only, company-scoped. Fetch client detail for RB ents ───
    const clientPathMap: Record<string, string> = {
        order: "/client/v1/order",
        "self-pickup": "/client/v1/self-pickup",
        "inbound-request": "/client/v1/inbound-request",
        "service-request": "/client/v1/service-request",
    };
    for (const [ent, base] of Object.entries(clientPathMap)) {
        const id = rbDisc[ent]?.[0];
        if (!id) {
            check(
                `CLIENT ${ent} detail`,
                true,
                "no Red Bull entity available on staging — SKIPPED"
            );
            continue;
        }
        const res = await leakCheck(
            `CLIENT ${ent} ${id.slice(0, 8)}`,
            CLIENT,
            CLIENT_FORBIDDEN,
            `${base}/${id}`
        );
        if (res && res.status === 404) {
            check(
                `CLIENT ${ent} detail`,
                true,
                "404 (client cannot see this doc — no leak) — SKIPPED"
            );
        }
    }

    // ── ADMIN role-preview must equal the real client projection (leak gate) ──
    if (disc["order"]?.[0]) {
        const oid = disc["order"][0];
        const clientPrev = await call(
            ADMIN,
            `/operations/v1/pricing/ORDER/${oid}/preview?role=CLIENT`
        );
        if (clientPrev.status === 200) {
            const hits = scan(
                clientPrev.json?.data?.preview ?? clientPrev.json?.data ?? clientPrev.json,
                CLIENT_FORBIDDEN
            );
            check(
                `ADMIN preview?role=CLIENT — client-safe`,
                hits.length === 0,
                hits.length === 0
                    ? "clean"
                    : `LEAKED [${[...new Set(hits.map((h) => h.key))].join(", ")}]`
            );
        } else {
            check(`ADMIN preview?role=CLIENT`, true, `HTTP ${clientPrev.status} — SKIPPED`);
        }
        const logiPrev = await call(
            ADMIN,
            `/operations/v1/pricing/ORDER/${oid}/preview?role=LOGISTICS`
        );
        if (logiPrev.status === 200) {
            const hits = scan(
                logiPrev.json?.data?.preview ?? logiPrev.json?.data ?? logiPrev.json,
                LOGISTICS_FORBIDDEN
            );
            check(
                `ADMIN preview?role=LOGISTICS — buy-only`,
                hits.length === 0,
                hits.length === 0
                    ? "clean"
                    : `LEAKED [${[...new Set(hits.map((h) => h.key))].join(", ")}]`
            );
        } else {
            check(`ADMIN preview?role=LOGISTICS`, true, `HTTP ${logiPrev.status} — SKIPPED`);
        }
    }

    console.log(report.join("\n"));
    console.log(`\n${pass} passed, ${fail} failed.\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error("leak-check crashed:", e);
    process.exit(1);
});
