/**
 * Random category color generator. HSL → hex with enforced bounds:
 *   H: 0–360 (any hue)
 *   S: 40–80% (not washed out, not neon)
 *   L: 30–55% (dark enough to read on light backgrounds)
 *
 * Guarantees: never white, never near-white, never pastel, never gray.
 * The auto-generated color is a sensible default; users can override
 * via a full color picker on the frontend.
 */

function hslToHex(h: number, s: number, l: number): string {
    const sNorm = s / 100;
    const lNorm = l / 100;
    const a = sNorm * Math.min(lNorm, 1 - lNorm);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

export function generateRandomCategoryColor(): string {
    const h = Math.floor(Math.random() * 360);
    const s = 40 + Math.floor(Math.random() * 41); // 40-80
    const l = 30 + Math.floor(Math.random() * 26); // 30-55
    return hslToHex(h, s, l);
}
