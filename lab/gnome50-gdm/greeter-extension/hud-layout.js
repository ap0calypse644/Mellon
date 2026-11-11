// M8.1 Observatory HUD: pure pixel geometry, independent of GNOME.
// The central inset protects the M6/M7 original photographic starfield.
// GDM greeter variant: there is NO user-session SHOW LOGIN control in the
// top-left corner. Unlike M8's unlock screen, don't reserve its rectangle.
// Keep the central photo-safe inset and all other sizing rules unchanged.
export const SOURCE_SAFE_INSET = 0.14;
const intersect = (a, b) => a && b &&
    a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
const inside = (r, w, h) => r &&
    r.x >= 0 && r.y >= 0 && r.x + r.width <= w &&
    r.y + r.height <= h;

export function hudLayout(width, height,
    recovery = null) {
    if (!Number.isFinite(width) || !Number.isFinite(height) ||
        width <= 0 || height <= 0)
        return {topLeft: null, topRight: null, bottomLeft: null,
            bottomRight: null};
    const w = Math.floor(width), h = Math.floor(height);
    const hidden = {topLeft: null, topRight: null, bottomLeft: null,
        bottomRight: null};
    if (w < 900 || h < 600)
        return hidden;
    const pad = Math.max(12, Math.min(24, Math.floor(w * .013)));
    const topBand = Math.floor(h * SOURCE_SAFE_INSET) - 7;
    const bottomBand = Math.floor(h * SOURCE_SAFE_INSET) - 7;
    const compact = h < 850;
    const topHeight = compact ? 76 : 110;
    const bottomHeight = compact ? 72 : 100;
    const center = {x: w * SOURCE_SAFE_INSET, y: h * SOURCE_SAFE_INSET,
        width: w * (1 - 2 * SOURCE_SAFE_INSET),
        height: h * (1 - 2 * SOURCE_SAFE_INSET)};
    const candidate = {
        topLeft: {x: pad, y: 14,
            width: Math.min(270, Math.floor(w * .23)), height: 54},
        topRight: {x: w - pad - Math.min(350, Math.floor(w * .27)),
            y: 14, width: Math.min(350, Math.floor(w * .27)),
            height: topHeight},
        bottomLeft: {x: pad, y: h - 14 - bottomHeight,
            width: Math.min(300, Math.floor(w * .26)), height: bottomHeight},
        bottomRight: {x: w - pad - Math.min(330, Math.floor(w * .26)),
            y: h - 14 - bottomHeight,
            width: Math.min(330, Math.floor(w * .26)),
            height: bottomHeight},
    };
    for (const [key, r] of Object.entries(candidate)) {
        const top = key.startsWith('top');
        const band = top ? topBand : bottomBand;
        if (r.height > band || !inside(r, w, h) ||
            intersect(r, center) || intersect(r, recovery))
            continue;
        if (Object.values(hidden).some(existing => intersect(existing, r)))
            continue;
        hidden[key] = {...r, compact};
    }
    return hidden;
}
