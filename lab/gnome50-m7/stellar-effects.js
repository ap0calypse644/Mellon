// Mellon M7: bounded, purely visual, ephemeral effects.
//
// No GNOME imports, authentication, key events, password values or I/O.
// All event times are monotonic seconds passed by the renderer.
// Arrays contain only existing star indices and actual topology edges.
export const IGNITION_SEC = 0.72;
export const PULSE_SEC = 0.70;
export const COMPLETION_SEC = 1.60;

const clamp = value => Math.min(1, Math.max(0, value));
const validTime = now => Number.isFinite(now) && now >= 0;
const norm = (now, origin, duration) => (now - origin) / duration;

// Static level stays high after the full constellation wave has finished.
// A partial constellation or a failed authentication has level zero.
export function completionLevel(frame) {
    if (frame.settled)
        return 1;
    if (frame.completion === null)
        return 0;
    return clamp((frame.completion - .24) / .70);
}

// Unit-testable intensity envelope for the existing photo-derived sprites.
// Every bloom reuses those same underlying real-star RGB pixels.
export function starLightProfile(flare, wave, completion) {
    for (const value of [flare, wave, completion]) {
        if (!Number.isFinite(value) || value < 0 || value > 1)
            throw new Error('Invalid M7 star-light envelope');
    }
    return {
        coreScale: 1 + .75 * flare + .48 * wave + .18 * completion,
        haloScale: 1.35 + 1.30 * flare + 1.15 * wave + .30 * completion,
        haloStrength: clamp(.98 * flare + 1.05 * wave +
            .65 * completion, 0, .98),
    };
}

export function connectionLightProfile(wave, completion) {
    for (const value of [wave, completion]) {
        if (!Number.isFinite(value) || value < 0 || value > 1)
            throw new Error('Invalid M7 connecting-line envelope');
    }
    return {
        glowAlpha: Math.min(.65, .40 * completion + .58 * wave),
        glowWidth: 5.6 + 4.2 * wave,
        lineAlpha: Math.min(.99, .56 + .37 * completion + .42 * wave),
        lineWidth: 1 + 1.0 * completion + 2.2 * wave,
    };
}

export function completionWave(progress, radialFraction) {
    if (!Number.isFinite(progress) || !Number.isFinite(radialFraction) ||
        progress < 0 || progress >= 1 || radialFraction < 0 || radialFraction > 1)
        return 0;
    // The flash crosses the constellation from centre to perimeter.
    const local = (progress - radialFraction * .35) / .65;
    return local > 0 && local < 1 ? Math.sin(Math.PI * local) : 0;
}

export class StellarEffects {
    constructor(count, edges) {
        if (!Number.isInteger(count) || count < 8 || count > 24 ||
            !Array.isArray(edges) || edges.length > 48 ||
            !edges.every(([a, b]) => Number.isInteger(a) && Number.isInteger(b) &&
                a >= 0 && a < count && b >= 0 && b < count && a !== b))
            throw new Error('Invalid constellation for M7 visual effects');
        this._count = count;
        this._edges = edges.map(([a, b]) => [a, b]);
        this.reset();
    }

    reset() {
        this._lit = new Uint8Array(this._count);
        this._ignitedAt = new Float64Array(this._count).fill(-Infinity);
        this._pulses = [];
        this._completeAt = -Infinity;
    }

    transition(mask, now) {
        if (!(mask instanceof Uint8Array) || mask.length !== this._count ||
            ![...mask].every(x => x === 0 || x === 1) || !validTime(now))
            throw new Error('Invalid M7 visual transition');

        const previous = this._lit;
        if (!mask.some((value, index) => value !== previous[index]))
            return; // No re-ignition during GNOME's unchanged-length polling.

        for (let index = 0; index < this._count; index++) {
            if (mask[index] && !previous[index])
                this._ignitedAt[index] = now;
            else if (!mask[index])
                this._ignitedAt[index] = -Infinity;
        }

        // Only illuminate real existing edges whose BOTH endpoints are on.
        // Each newly connected edge gets exactly one pulse, including when
        // two endpoints become lit in the same password-length transition.
        this._pulses = this._pulses.filter(p =>
            mask[p.from] === 1 && mask[p.to] === 1 &&
            now - p.started < PULSE_SEC);
        for (const [a, b] of this._edges) {
            if (!mask[a] || !mask[b] || (previous[a] && previous[b]))
                continue;
            const from = !previous[a] ? a : b;
            const to = from === a ? b : a;
            // Drop a superseded pulse for the same source edge, if any.
            this._pulses = this._pulses.filter(p =>
                !(Math.min(p.from, p.to) === Math.min(a, b) &&
                  Math.max(p.from, p.to) === Math.max(a, b)));
            this._pulses.push({from, to, started: now});
        }
        // At most one pulse per edge and no indefinite particle queues.
        this._pulses = this._pulses.slice(-this._edges.length);

        if (mask.every(x => x === 1) && !previous.every(x => x === 1))
            this._completeAt = now; // Only the 0->fully-lit transition.
        else if (mask.some(x => x === 0))
            this._completeAt = -Infinity; // Backspace cancels celebration.

        this._lit = new Uint8Array(mask);
    }

    sample(now) {
        if (!validTime(now))
            throw new Error('Invalid M7 animation time');

        const ignition = new Float64Array(this._count);
        let busy = false;
        for (let i = 0; i < this._count; i++) {
            if (!this._lit[i])
                continue;
            const t = norm(now, this._ignitedAt[i], IGNITION_SEC);
            if (t >= 0 && t < 1) {
                // One controlled flare, strongest early on, then settles.
                ignition[i] = Math.sin(Math.PI * Math.pow(t, .65));
                busy = true;
            }
        }

        const pulses = [];
        for (const p of this._pulses) {
            if (!this._lit[p.from] || !this._lit[p.to])
                continue;
            const t = norm(now, p.started, PULSE_SEC);
            if (t >= 0 && t < 1) {
                pulses.push({
                    from: p.from, to: p.to, progress: clamp(t),
                    strength: Math.sin(Math.PI * t),
                });
                busy = true;
            }
        }
        const ct = norm(now, this._completeAt, COMPLETION_SEC);
        const completion = ct >= 0 && ct < 1 ? ct : null;
        // Preserve a bright static constellation AFTER the wave finishes.
        // This is a visual latch, not a GNOME success/authentication flag.
        // Backspace or a failed attempt resets it immediately.
        const settled = this._completeAt !== -Infinity &&
            ct >= 1 && this._lit.every(x => x === 1);
        busy ||= completion !== null;

        return {ignition, pulses, completion, settled, busy};
    }
}
