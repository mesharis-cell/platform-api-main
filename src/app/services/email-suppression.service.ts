import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { emailSuppressions } from "../../db/schema";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isSuppressed = async (platformId: string, email: string) => {
    const [row] = await db
        .select({ id: emailSuppressions.id })
        .from(emailSuppressions)
        .where(
            and(
                eq(emailSuppressions.platform_id, platformId),
                eq(emailSuppressions.email, normalizeEmail(email))
            )
        )
        .limit(1);

    return Boolean(row);
};

const suppress = async (platformId: string, email: string, reason = "UNSUBSCRIBED") => {
    const normalizedEmail = normalizeEmail(email);

    const [row] = await db
        .insert(emailSuppressions)
        .values({
            platform_id: platformId,
            email: normalizedEmail,
            reason,
        })
        .onConflictDoUpdate({
            target: [emailSuppressions.platform_id, emailSuppressions.email],
            set: {
                reason,
                unsubscribed_at: new Date(),
                updated_at: new Date(),
            },
        })
        .returning();

    return row;
};

const unsuppress = async (platformId: string, email: string) => {
    await db
        .delete(emailSuppressions)
        .where(
            and(
                eq(emailSuppressions.platform_id, platformId),
                eq(emailSuppressions.email, normalizeEmail(email))
            )
        );
};

export const EmailSuppressionService = {
    isSuppressed,
    suppress,
    unsuppress,
};
