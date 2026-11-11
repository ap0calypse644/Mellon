// Mellon M8.3.2 — Repeating full-screen grid sweep, pure visual math only.
// No GNOME, keyboard, authentication, passwords, sensors, timers or I/O.
export const INTRO_DURATION_MS = 1850;
export const INTRO_TICK_MS = 50;
// Sweep start-to-start cadence. During the remaining 3.15s, the grid is
// hidden and there is no high-frequency repaint source.
export const INTRO_REPEAT_MS = 5000;

// Sized by screen, not by photographic constellation or HUD visibility.
export function gridGeometry(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) ||
        width < 320 || height < 240)
        throw new Error('Unsupported grid viewport');
    const columns = Math.max(12, Math.min(36, Math.round(width / 82)));
    const rows = Math.max(5, Math.min(24, Math.round(height / 78)));
    return Object.freeze({
        width, height, columns, rows,
        cellWidth: width / columns,
        cellHeight: height / rows,
    });
}

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => value * value * (3 - 2 * value);

// Each bounded sweep crosses the display from left to right.
// The left-hand cells retain a faint afterglow until the grid fades away.
export function introFrame(elapsedMs) {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0)
        throw new Error('Invalid Observatory intro elapsed time');
    const p = clamp(elapsedMs / INTRO_DURATION_MS);
    const fadeIn = smooth(clamp(p / .09));
    const fadeOut = smooth(clamp((1 - p) / .15));
    return Object.freeze({
        done: p >= 1,
        progress: p,
        sweep: clamp(p / .84),
        gridOpacity: fadeIn * fadeOut,
        panelOpacity: Math.round(255 * smooth(clamp(p / .55))),
    });
}

// The row stagger is deliberately shorter than one column step, so every
// column activates before the next: genuinely left-to-right grid lighting.
export function gridCellStrength(frame, column, row, geometry) {
    if (!frame || !Number.isFinite(frame.sweep) ||
        frame.sweep < 0 || frame.sweep > 1 || !geometry ||
        !Number.isInteger(geometry.columns) ||
        !Number.isInteger(geometry.rows) ||
        geometry.columns < 12 || geometry.columns > 36 ||
        geometry.rows < 5 || geometry.rows > 24 ||
        !Number.isInteger(column) || !Number.isInteger(row) ||
        column < 0 || column >= geometry.columns ||
        row < 0 || row >= geometry.rows)
        throw new Error('Invalid grid-cell scan state');
    const arrival = column / geometry.columns +
        .014 * row / Math.max(1, geometry.rows - 1);
    if (frame.sweep < arrival)
        return 0;
    const distance = frame.sweep - arrival;
    const peak = Math.exp(-Math.pow(distance / .105, 2));
    // Small deterministic row differences, not per-frame randomness.
    const grain = .82 + .18 * ((column * 7 + row * 11) % 9) / 8;
    return (0.18 + 0.82 * peak) * grain;
}
