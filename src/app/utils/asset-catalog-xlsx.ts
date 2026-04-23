import ExcelJS from "exceljs";

/**
 * Asset Catalog XLSX generator.
 *
 * Produces a workbook with one row per asset. When `includePhotos` is true,
 * fetches the primary image URL for each asset and embeds a thumbnail in the
 * "Photo" column. Missing / failed image fetches are silently skipped — the
 * row still renders with empty image cell.
 *
 * Image source priority per asset:
 *   1. assets.on_display_image
 *   2. first entry of assets.images (JSONB: [{url, note?}])
 *   3. first entry of asset_families.images (fallback when asset has none)
 */

export type AssetCatalogRow = {
    // Asset identity
    asset_id: string;
    asset_name: string;
    qr_code: string;
    // Family identity
    family_id: string | null;
    family_name: string | null;
    company_item_code: string | null;
    description: string | null;
    // Classification
    company_name: string | null;
    brand_name: string | null;
    category_name: string | null;
    team_name: string | null;
    // Stock posture
    stock_mode: string | null;
    tracking_method: string;
    total_quantity: number;
    available_quantity: number;
    low_stock_threshold: number | null;
    // Condition / status
    condition: string;
    status: string;
    condition_notes: string | null;
    refurb_days_estimate: number | null;
    // Physical
    packaging: string | null;
    weight_per_unit: string | null;
    volume_per_unit: string | null;
    dimensions_length: number | null;
    dimensions_width: number | null;
    dimensions_height: number | null;
    handling_tags: string[];
    // Location
    warehouse_name: string | null;
    zone_name: string | null;
    // Lifecycle
    last_scanned_at: Date | null;
    last_scanned_by_name: string | null;
    created_at: Date;
    // Photo
    primary_image_url: string | null;
};

type ImageFetchResult = {
    buffer: Buffer;
    extension: "png" | "jpeg" | "gif";
} | null;

// Memory guardrails — these limits exist to prevent the photos path from
// OOM-killing the API instance under load. The previous unbounded
// Promise.all(rows.map(fetchImage)) would fire N parallel fetches and buffer
// up to 5MB each, which on large tenants (hundreds of assets) peaked above
// the EB instance RAM and crashed it. Do not relax without adding another
// backstop.
const FETCH_CONCURRENCY = 8;
const IMAGE_BYTE_CAP = 2 * 1024 * 1024; // 2MB — thumbnails rarely exceed this
const IMAGE_FETCH_TIMEOUT_MS = 5000;
export const MAX_ROWS_WITH_PHOTOS = 500;

const detectExtension = (url: string, contentType: string | null): "png" | "jpeg" | "gif" => {
    const ct = (contentType || "").toLowerCase();
    if (ct.includes("png")) return "png";
    if (ct.includes("gif")) return "gif";
    if (ct.includes("jpeg") || ct.includes("jpg")) return "jpeg";
    const lower = url.toLowerCase();
    if (lower.includes(".png")) return "png";
    if (lower.includes(".gif")) return "gif";
    return "jpeg";
};

const fetchImage = async (
    url: string | null,
    timeoutMs = IMAGE_FETCH_TIMEOUT_MS
): Promise<ImageFetchResult> => {
    if (!url) return null;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) return null;
        // Peek Content-Length first so we can bail BEFORE buffering a huge
        // image. Not all responses set it; we fall through to a post-fetch
        // size check as a backstop.
        const cl = response.headers.get("content-length");
        if (cl && Number(cl) > IMAGE_BYTE_CAP) return null;
        const ab = await response.arrayBuffer();
        if (ab.byteLength > IMAGE_BYTE_CAP) return null;
        return {
            buffer: Buffer.from(ab),
            extension: detectExtension(url, response.headers.get("content-type")),
        };
    } catch {
        return null;
    }
};

/**
 * Bounded-concurrency map — caps how many `fn` calls run in parallel to
 * `limit`. Replaces the prior unbounded `Promise.all(items.map(fn))` which
 * would fire every fetch at once. With N=996 assets and 5MB peak per image,
 * that path could need ~5GB RAM and reliably OOM-killed the instance.
 */
const mapLimit = async <T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> => {
    const results: R[] = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const idx = cursor;
            cursor += 1;
            if (idx >= items.length) return;
            results[idx] = await fn(items[idx]);
        }
    });
    await Promise.all(runners);
    return results;
};

const formatDate = (value: Date | string | null | undefined) =>
    value ? new Date(value).toISOString() : "";

const HEADERS: { key: keyof AssetCatalogRow | "photo"; label: string; width: number }[] = [
    { key: "asset_id", label: "Asset ID", width: 38 },
    { key: "asset_name", label: "Asset Name", width: 32 },
    { key: "qr_code", label: "QR Code", width: 22 },
    { key: "family_name", label: "Family", width: 28 },
    { key: "company_item_code", label: "Item Code", width: 18 },
    { key: "description", label: "Description", width: 40 },
    { key: "company_name", label: "Company", width: 22 },
    { key: "brand_name", label: "Brand", width: 18 },
    { key: "category_name", label: "Category", width: 18 },
    { key: "team_name", label: "Team", width: 16 },
    { key: "stock_mode", label: "Stock Mode", width: 14 },
    { key: "tracking_method", label: "Tracking", width: 14 },
    { key: "total_quantity", label: "Total Qty", width: 10 },
    { key: "available_quantity", label: "Available Qty", width: 12 },
    { key: "low_stock_threshold", label: "Low Stock Threshold", width: 14 },
    { key: "condition", label: "Condition", width: 12 },
    { key: "status", label: "Status", width: 14 },
    { key: "condition_notes", label: "Condition Notes", width: 28 },
    { key: "refurb_days_estimate", label: "Refurb Days", width: 12 },
    { key: "packaging", label: "Packaging", width: 16 },
    { key: "weight_per_unit", label: "Weight (kg)", width: 12 },
    { key: "volume_per_unit", label: "Volume (m³)", width: 12 },
    { key: "dimensions_length", label: "Length (cm)", width: 12 },
    { key: "dimensions_width", label: "Width (cm)", width: 12 },
    { key: "dimensions_height", label: "Height (cm)", width: 12 },
    { key: "handling_tags", label: "Handling Tags", width: 24 },
    { key: "warehouse_name", label: "Warehouse", width: 20 },
    { key: "zone_name", label: "Zone", width: 16 },
    { key: "last_scanned_at", label: "Last Scanned At", width: 22 },
    { key: "last_scanned_by_name", label: "Last Scanned By", width: 20 },
    { key: "created_at", label: "Created At", width: 22 },
    { key: "primary_image_url", label: "Photo URL", width: 48 },
];

const valueFor = (row: AssetCatalogRow, key: (typeof HEADERS)[number]["key"]) => {
    if (key === "photo") return "";
    const v = (row as any)[key];
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return formatDate(v);
    if (Array.isArray(v)) return v.join(", ");
    return v;
};

export const generateAssetCatalogXlsx = async (
    rows: AssetCatalogRow[],
    opts: { includePhotos: boolean; companyName?: string | null }
): Promise<Buffer<ArrayBufferLike>> => {
    const { includePhotos, companyName } = opts;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Asset Catalog");

    // Photo column is only added when includePhotos is true — otherwise the
    // URL-only "Photo URL" column is kept for text-only traceability.
    const headers = includePhotos
        ? [{ key: "photo" as const, label: "Photo", width: 14 }, ...HEADERS]
        : HEADERS;

    sheet.columns = headers.map((h) => ({ header: h.label, key: h.label, width: h.width }));

    // Style header row.
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEFEFEF" },
    };
    headerRow.alignment = { vertical: "middle" };
    headerRow.height = 24;

    // Title banner above the header row (optional)
    sheet.insertRow(1, [
        `ASSET CATALOG${companyName ? ` — ${companyName}` : ""} — ${formatDate(new Date())}`,
    ]);
    const titleRow = sheet.getRow(1);
    titleRow.font = { bold: true, size: 14 };
    titleRow.height = 26;
    sheet.mergeCells(1, 1, 1, headers.length);

    // Now rows start at 3 (row 1 = title, row 2 = column headers after insert).
    const DATA_START_ROW = 3;

    // Bounded-concurrency fetch — never exceeds FETCH_CONCURRENCY in flight.
    // Row-count is capped upstream via MAX_ROWS_WITH_PHOTOS. Missing / failed
    // URLs resolve to null and render as empty cells.
    const imageBuffers: (ImageFetchResult | null)[] = includePhotos
        ? await mapLimit(rows, FETCH_CONCURRENCY, (r) => fetchImage(r.primary_image_url))
        : [];

    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const excelRow = sheet.getRow(DATA_START_ROW + i);
        const values: any[] = headers.map((h) => valueFor(row, h.key));
        excelRow.values = values;
        excelRow.alignment = { vertical: "top", wrapText: true };

        if (includePhotos) {
            const fetched = imageBuffers[i];
            if (fetched) {
                // ExcelJS' .addImage expects Buffer with a specific generic
                // instantiation that differs from Node's current default.
                // Cast through any — runtime-equivalent.
                const imageId = workbook.addImage({
                    buffer: fetched.buffer,
                    extension: fetched.extension,
                } as any);
                // Embed image in column A (Photo column) anchored to this row.
                // String-range form avoids wrestling with ExcelJS' Anchor type.
                const rowRef = DATA_START_ROW + i;
                sheet.addImage(imageId, `A${rowRef}:A${rowRef}`);
                excelRow.height = 90; // give the image vertical room
            }
        }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
};

/**
 * CSV variant — produces the same columns minus the embedded photo (URL only).
 * Keeps the "flat" option per the user's ask: either export the list with or
 * without photos; the CSV is the without-photos path.
 */
export const generateAssetCatalogCsvRows = (
    rows: AssetCatalogRow[]
): Array<Record<string, string>> =>
    rows.map((row) => {
        const out: Record<string, string> = {};
        for (const h of HEADERS) {
            out[h.label] = String(valueFor(row, h.key));
        }
        return out;
    });
