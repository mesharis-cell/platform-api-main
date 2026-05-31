/**
 * Reports API E2E smoke — READ-ONLY against the running staging-backed API (:6001).
 * Mints tokens with the app's JWT secret (no passwords), hits every report, and
 * asserts the runtime contracts that tsc can't: filter param wiring (UI param
 * name == what run() reads), audience filtering, cost/margin leak gating, rowCap.
 *
 *   APP_ENV=staging bun --preload ./src/bootstrap/env-preload.ts ./scripts/reports-e2e-staging.ts
 */
import jwt from "jsonwebtoken";
import ExcelJS from "exceljs";

const API = "http://localhost:6001";
const PLAT = "852e6d14-cd3e-4a78-893b-b6ea7c91dead";
const RB = "268a4d32-c07f-4281-99cc-e1647d0a2d84";
const BEV_GROUP = "85f3d935-6cb3-4d84-805e-71b6100fe4df"; // Red Bull Sugar Free Cans
const SECRET = process.env.JWT_ACCESS_SECRET;

if (!SECRET) {
    console.error("No JWT_ACCESS_SECRET in env — run with APP_ENV=staging + env preload.");
    process.exit(1);
}

const mint = (id: string, role: string, email: string) =>
    jwt.sign({ id, role, email, platform_id: PLAT }, SECRET as string, { expiresIn: "1h" });

const ADMIN = mint(
    "2643720d-761f-4535-93d5-d91e6027ccf2",
    "ADMIN",
    "meshari.s-staging@homeofpmg.com"
);
const CLIENT = mint(
    "2c88c0b3-db63-4806-90bd-623b66828045",
    "CLIENT",
    "client-staging@redbull.test"
);

let pass = 0;
let fail = 0;
const lines: string[] = [];
const check = (name: string, ok: boolean, detail = "") => {
    lines.push(`${ok ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
    ok ? pass++ : fail++;
};

async function call(token: string, path: string) {
    const res = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${token}`, "x-platform": PLAT },
    });
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("json")) return { status: res.status, json: (await res.json()) as any, ct };
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, buf, ct };
}

async function colHeaders(buf: Buffer): Promise<string[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    const cols: string[] = [];
    ws.getRow(3).eachCell({ includeEmpty: false }, (c) => cols.push(String(c.value ?? "")));
    return cols;
}

async function main() {
    // 1) admin listReports — super-admin sees the full registry
    const adminList = await call(ADMIN, "/operations/v1/reports");
    const adminReports = adminList.json?.data?.reports ?? [];
    check(
        "admin listReports returns full registry (13)",
        adminReports.length === 13,
        `got ${adminReports.length}`
    );

    // 2) client listReports — ADMIN_CLIENT subset only, no admin-only financial reports
    const clientList = await call(CLIENT, "/client/v1/reports");
    const clientKeys: string[] = (clientList.json?.data?.reports ?? []).map((x: any) => x.key);
    const leakedAdminOnly = ["cost", "revenue", "accounts-reconciliation", "work-summary"].filter(
        (k) => clientKeys.includes(k)
    );
    check(
        "client listReports hides admin-only reports",
        leakedAdminOnly.length === 0,
        leakedAdminOnly.length ? `LEAKED ${leakedAdminOnly}` : `keys=${clientKeys.join(",")}`
    );
    check(
        "client listReports includes the safe subset",
        clientKeys.includes("issuance") && clientKeys.includes("current-stock"),
        `keys=${clientKeys.join(",")}`
    );

    // 3) stock-movements category param contract (the reported bug)
    const smUi = await call(
        ADMIN,
        `/operations/v1/reports/stock-movements/run?company_id=${RB}&category_include=Beverages`
    );
    const smNative = await call(
        ADMIN,
        `/operations/v1/reports/stock-movements/run?company_id=${RB}&category=Beverages`
    );
    check(
        "stock-movements honors UI param (category_include)",
        smUi.status === 200,
        `category_include -> ${smUi.status}${smUi.json?.message ? ` "${smUi.json.message}"` : ""}`
    );
    check(
        "stock-movements honors native param (category)",
        smNative.status === 200,
        `category -> ${smNative.status}${smNative.json?.message ? ` "${smNative.json.message}"` : ""}`
    );

    // 4) group filter contract
    const smGroup = await call(
        ADMIN,
        `/operations/v1/reports/stock-movements/run?company_id=${RB}&group=${BEV_GROUP}`
    );
    check(
        "stock-movements group filter (key 'group')",
        smGroup.status === 200,
        `group -> ${smGroup.status}${smGroup.json?.message ? ` "${smGroup.json.message}"` : ""}`
    );

    // 5) smoke every report (admin) with the params the UI would send
    for (const rep of adminReports) {
        let qs = `company_id=${RB}`;
        if (rep.key === "stock-movements") qs += "&category_include=Beverages"; // what the admin UI actually sends
        const r = await call(ADMIN, `/operations/v1/reports/${rep.key}/run?${qs}`);
        check(
            `run ${rep.key} (UI params)`,
            r.status === 200,
            `HTTP ${r.status}${r.json?.message ? ` "${r.json.message}"` : ""}`
        );
    }

    // 6) cost/margin leak gating on orders
    const adminOrders = await call(ADMIN, `/operations/v1/reports/orders/run?company_id=${RB}`);
    if (adminOrders.status === 200 && adminOrders.buf) {
        const cols = await colHeaders(adminOrders.buf);
        check(
            "admin orders shows margin/buy cols (super-admin)",
            cols.some((c) => /margin|buy|base ops/i.test(c)),
            `cols: ${cols.join(" | ").slice(0, 180)}`
        );
    } else check("admin orders runs", false, `HTTP ${adminOrders.status}`);

    const clientOrders = await call(CLIENT, `/client/v1/reports/orders/run?company_id=${RB}`);
    if (clientOrders.status === 200 && clientOrders.buf) {
        const cols = await colHeaders(clientOrders.buf);
        const leak = cols.filter((c) => /margin|buy|base ops/i.test(c));
        check(
            "client orders has NO margin/buy cols (LEAK GATE)",
            leak.length === 0,
            leak.length ? `LEAK: ${leak.join(", ")}` : "clean"
        );
    } else
        check(
            "client orders runs on client mount",
            clientOrders.status === 200,
            `HTTP ${clientOrders.status}${clientOrders.json?.message ? ` "${clientOrders.json.message}"` : ""}`
        );

    // 7) category narrowing on item-grain reports — catch SILENT category-ignore
    //    (same bug class as stock-movements, but no cap to surface it → must prove
    //    the filtered result is actually smaller than the unfiltered one).
    for (const key of ["current-stock", "asset-catalogue", "asset-utilization", "issuance"]) {
        const all = await call(ADMIN, `/operations/v1/reports/${key}/run?company_id=${RB}`);
        const bev = await call(
            ADMIN,
            `/operations/v1/reports/${key}/run?company_id=${RB}&category_include=Beverages`
        );
        if (all.status === 200 && bev.status === 200 && all.buf && bev.buf) {
            const wa = new ExcelJS.Workbook();
            await wa.xlsx.load(all.buf as any);
            const wb = new ExcelJS.Workbook();
            await wb.xlsx.load(bev.buf as any);
            const rAll = wa.worksheets[0].rowCount;
            const rBev = wb.worksheets[0].rowCount;
            check(
                `${key} category filter actually narrows`,
                rBev < rAll && rBev > 3,
                `all=${rAll} rows, beverages=${rBev} rows`
            );
        } else
            check(
                `${key} category narrowing testable`,
                false,
                `all=${all.status}, bev=${bev.status}`
            );
    }

    // 8) inbound-log leak gate on the client mount (it carries a BASE OPS cost col on admin)
    const clientInbound = await call(CLIENT, `/client/v1/reports/inbound-log/run?company_id=${RB}`);
    if (clientInbound.status === 200 && clientInbound.buf) {
        const cols = await colHeaders(clientInbound.buf);
        const leak = cols.filter((c) => /margin|buy|base ops/i.test(c));
        check(
            "client inbound-log has NO cost cols (LEAK GATE)",
            leak.length === 0,
            leak.length ? `LEAK: ${leak.join(", ")}` : "clean"
        );
    } else
        check(
            "client inbound-log runs",
            clientInbound.status === 200,
            `HTTP ${clientInbound.status}`
        );

    console.log("\n" + lines.join("\n"));
    console.log(`\n${pass} passed, ${fail} failed`);
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
