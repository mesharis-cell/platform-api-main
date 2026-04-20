import { eq } from "drizzle-orm";
import { db } from "../support/db";
import { selfPickups } from "../../src/db/schema";

type MatcherResult = { pass: boolean; message: () => string };

export const toHaveSelfPickupStatus = async (
    selfPickupId: string,
    expected: string
): Promise<MatcherResult> => {
    const [row] = await db
        .select({ status: selfPickups.self_pickup_status })
        .from(selfPickups)
        .where(eq(selfPickups.id, selfPickupId))
        .limit(1);
    const actual = row?.status ?? "<not found>";
    return {
        pass: actual === expected,
        message: () =>
            `expected self-pickup ${selfPickupId} to have self_pickup_status "${expected}", got "${actual}"`,
    };
};
