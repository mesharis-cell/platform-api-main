import { readFileSync } from "node:fs";
import path from "node:path";

type Violation = {
    file: string;
    message: string;
    hint?: string;
};

const repoRoot = path.resolve(__dirname, "../../..");

const read = (relativeFile: string): string => {
    const absoluteFile = path.join(repoRoot, relativeFile);
    return readFileSync(absoluteFile, "utf8");
};

const getSetBlocks = (content: string): string[] =>
    Array.from(content.matchAll(/\.set\s*\(\s*{[\s\S]*?}\s*\)/g)).map((match) => match[0]);

const scanForSetMutation = (
    file: string,
    content: string,
    fieldName: string,
    violations: Violation[],
    expectedHint?: string
) => {
    const setBlocks = getSetBlocks(content);
    const hasFieldMutation = setBlocks.some((block) => block.includes(`${fieldName}:`));
    if (!hasFieldMutation) return;

    violations.push({
        file,
        message: `Unexpected ${fieldName} mutation found in .set(...) update block.`,
        hint: expectedHint,
    });
};

const scanForPattern = (
    file: string,
    content: string,
    pattern: RegExp,
    message: string,
    violations: Violation[],
    hint?: string
) => {
    if (!pattern.test(content)) return;
    violations.push({ file, message, hint });
};

const scanForMissingPattern = (
    file: string,
    content: string,
    pattern: RegExp,
    message: string,
    violations: Violation[],
    hint?: string
) => {
    if (pattern.test(content)) return;
    violations.push({ file, message, hint });
};

const violations: Violation[] = [];

const scanningServicesFile = "src/app/modules/scanning/scanning.services.ts";
const scanningServices = read(scanningServicesFile);
scanForSetMutation(
    scanningServicesFile,
    scanningServices,
    "available_quantity",
    violations,
    "Scanning should not mutate available_quantity. Booking lifecycle owns quantity changes."
);
scanForPattern(
    scanningServicesFile,
    scanningServices,
    /delete\(\s*assetBookings\s*\)/,
    "Direct asset booking delete detected.",
    violations,
    "Use releaseOrderBookingsAndRestoreAvailability(...) from order.utils instead."
);
scanForMissingPattern(
    scanningServicesFile,
    scanningServices,
    /releaseOrderBookingsAndRestoreAvailability/,
    "Booking release helper usage is missing.",
    violations,
    "Scanning close flow must use releaseOrderBookingsAndRestoreAvailability(...)."
);

const orderServicesFile = "src/app/modules/order/order.services.ts";
const orderServices = read(orderServicesFile);
scanForPattern(
    orderServicesFile,
    orderServices,
    /delete\(\s*assetBookings\s*\)/,
    "Direct asset booking delete detected.",
    violations,
    "Use releaseOrderBookingsAndRestoreAvailability(...) for close/cancel order flows."
);
scanForMissingPattern(
    orderServicesFile,
    orderServices,
    /releaseOrderBookingsAndRestoreAvailability/,
    "Booking release helper usage is missing.",
    violations,
    "Order close/cancel flows must use releaseOrderBookingsAndRestoreAvailability(...)."
);

const orderUtilsFile = "src/app/modules/order/order.utils.ts";
const orderUtils = read(orderUtilsFile);
scanForMissingPattern(
    orderUtilsFile,
    orderUtils,
    /export\s+async\s+function\s+releaseOrderBookingsAndRestoreAvailability/,
    "releaseOrderBookingsAndRestoreAvailability helper export is missing.",
    violations
);
scanForMissingPattern(
    orderUtilsFile,
    orderUtils,
    /available_quantity:\s*sql`LEAST\(\$\{assets\.total_quantity\},\s*GREATEST\(0,\s*\$\{assets\.available_quantity\}\s*\+\s*\$\{restoreQty\}\)\)`/,
    "Expected bounded available_quantity restore expression not found.",
    violations,
    "Keep restore bounded: 0 <= available_quantity <= total_quantity."
);

if (violations.length > 0) {
    console.error("Inventory flow verification failed:");
    for (const issue of violations) {
        console.error(`- ${issue.file}: ${issue.message}`);
        if (issue.hint) {
            console.error(`  Hint: ${issue.hint}`);
        }
    }
    process.exit(1);
}

console.log("Inventory flow verification passed.");
