// M8.3: pure, short-lived, visual-only Observatory intro.
export const INTRO_DURATION_MS = 1050;
export const INTRO_TICK_MS = 50;
const clamp = v => Math.max(0, Math.min(1, v));
const smooth = p => p * p * (3 - 2 * p);

export function introFrame(elapsedMs) {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
        throw new Error('Invalid Observatory intro elapsed time');
    const p = clamp(elapsedMs / INTRO_DURATION_MS);
    const fade = smooth(clamp(p / .68));
    return {
        done: p >= 1,
        progress: p,
        panelOpacity: Math.round(255 * fade),
        scanOpacity: Math.round(96 * Math.sin(Math.PI * p)),
    };
}

export function introScanBounds(box, progress) {
    if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
        box.width < 40 || box.height < 30 ||
        !Number.isFinite(progress) || progress < 0 || progress > 1)
        throw new Error('Invalid Observatory scan geometry');
    // Scan is trapped inside a pre-validated HUD corner rectangle.
    const margin = Math.min(12, Math.max(7, Math.floor(box.width * .03)));
    const width = 2;
    return {
        x: Math.round(box.x + margin +
            (box.width - 2 * margin - width) * progress),
        y: Math.round(box.y + 7),
        width,
        height: Math.max(1, Math.round(box.height - 14)),
    };
}
