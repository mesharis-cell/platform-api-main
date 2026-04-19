export type PollOptions = {
    timeoutMs: number;
    intervalMs?: number;
    message?: string;
};

export const pollUntil = async <T>(
    fn: () => Promise<T | null | undefined | false>,
    opts: PollOptions
): Promise<T> => {
    const interval = opts.intervalMs ?? 250;
    const deadline = Date.now() + opts.timeoutMs;
    let lastError: unknown = null;

    while (Date.now() < deadline) {
        try {
            const result = await fn();
            if (result) return result as T;
        } catch (err) {
            lastError = err;
        }
        await new Promise((r) => setTimeout(r, interval));
    }

    const hint = opts.message ?? "pollUntil condition was not met";
    const tail = lastError instanceof Error ? ` — last error: ${lastError.message}` : "";
    throw new Error(`${hint} (timeout ${opts.timeoutMs}ms)${tail}`);
};
