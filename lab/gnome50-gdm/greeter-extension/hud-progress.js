// Mellon M8.2: read-only, pure visual mapping state derived from the
// CURRENT mask of already selected photographic stars. No GNOME imports,
// keyboard events, password text/length, timestamps or authentication data.
export const MAPPING_STAGES = 8;

export function mappingStage(mask, stages = MAPPING_STAGES) {
    if (!(mask instanceof Uint8Array) ||
        mask.length < 8 || mask.length > 24 ||
        stages !== MAPPING_STAGES)
        throw new Error('Unsupported visual constellation mask');
    let active = 0;
    for (const bit of mask) {
        if (bit !== 0 && bit !== 1)
            throw new Error('Invalid visual activation bit');
        active += bit;
    }
    if (active === 0)
        return 0;
    // The M6.4 engine maps each input stage k to ceil(N*k/8) *real*
    // photographic stars. Invert that mapping using the current mask
    // only. The HUD never sees the GNOME buffer or input length.
    for (let stage = 1; stage <= stages; stage++) {
        if (active <= Math.ceil(mask.length * stage / stages))
            return stage;
    }
    throw new Error('Visual activation exceeds scene size');
}

export function mappingStatus(stage, stages = MAPPING_STAGES) {
    if (!Number.isInteger(stage) || stages !== MAPPING_STAGES ||
        stage < 0 || stage > stages)
        throw new Error('Invalid visual map stage');
    if (stage === 0)
        return 'AWAITING INPUT';
    if (stage === stages)
        return 'CONSTELLATION MAPPED';
    return 'MAPPING CONSTELLATION';
}

// The already-running M7.1 1.60s completion animation supplies progress.
// One brief cyan-violet glint travels across the eight HUD segments; the
// segment style is latched bright when M7 reports a settled full map.
// No timer or animation state is created in this pure helper.
export function segmentWaveStrength(progress, index, stages = MAPPING_STAGES) {
    if (!Number.isFinite(progress) || progress < 0 || progress >= 1 ||
        !Number.isInteger(index) || stages !== MAPPING_STAGES ||
        index < 0 || index >= stages)
        throw new Error('Invalid M7 visual completion sample');
    const position = index / stages;
    const phase = (progress - position) / .30;
    if (phase <= 0 || phase >= 1)
        return 0;
    return Math.sin(Math.PI * phase);
}
