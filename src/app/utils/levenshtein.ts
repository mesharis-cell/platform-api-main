/**
 * Levenshtein distance — standard iterative DP.
 * Used for typo detection when creating categories inline.
 */
export function levenshtein(a: string, b: string): number {
    const la = a.length;
    const lb = b.length;
    if (la === 0) return lb;
    if (lb === 0) return la;

    const matrix: number[][] = [];

    for (let i = 0; i <= la; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= lb; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= la; i++) {
        for (let j = 1; j <= lb; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[la][lb];
}

/**
 * Find near-matches in a list of names. Returns items with
 * Levenshtein distance > 0 and <= maxDistance (excluding exact matches).
 */
export function findNearMatches(
    candidate: string,
    existingNames: string[],
    maxDistance = 2
): Array<{ name: string; distance: number }> {
    const lower = candidate.toLowerCase();
    return existingNames
        .map((name) => ({
            name,
            distance: levenshtein(lower, name.toLowerCase()),
        }))
        .filter((m) => m.distance > 0 && m.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);
}
