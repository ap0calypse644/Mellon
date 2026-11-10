// Mellon M6: pure scene metadata and animation mapping.
// No GNOME APIs, I/O, authentication, passwords or timers in this module.
// Compatible with GNOME 50 GJS and Node's ESM data-URL test import.
export const LIBRARY_SCHEMA = 'mellon-m6-scene-library-v1';

function isSafeRelative(path) {
    return typeof path === 'string' && path.startsWith('assets/') &&
        /^[a-zA-Z0-9_./-]+$/.test(path) &&
        !path.split('/').includes('..') &&
        !path.split('/').includes('.') && !path.includes('//');
}
function isUnitPoint(point) {
    return Array.isArray(point) && point.length === 2 &&
        point.every(value => Number.isFinite(value) &&
            value > 0 && value < 1);
}
export function validateLibrary(library) {
    if (library?.schema !== LIBRARY_SCHEMA ||
        !Array.isArray(library.scenes) || library.scenes.length !== 6)
        throw new Error('M6 requires exactly six pilot scenes');
    const seen = new Set(), backgrounds = new Set();
    for (const scene of library.scenes) {
        const n = scene.vertices?.length;
        if (typeof scene.id !== 'string' ||
            !/^[a-z0-9-]+\/[0-9]{2}-[A-Za-z]+$/.test(scene.id) ||
            seen.has(scene.id))
            throw new Error('Invalid or duplicated scene ID');
        seen.add(scene.id);
        backgrounds.add(scene.background);
        if (scene.background !== scene.id.split('/')[0] ||
            typeof scene.name !== 'string' ||
            !/^[A-Za-z]+$/.test(scene.constellation) ||
            !Array.isArray(scene.image_size) ||
            scene.image_size[0] !== 1920 || scene.image_size[1] !== 1080 ||
            !isSafeRelative(scene.image) ||
            !Array.isArray(scene.star_ids) ||
            n < 8 || n > 24 || n !== scene.star_ids.length ||
            new Set(scene.star_ids).size !== n ||
            !scene.star_ids.every(id => /^S[0-9]{6}$/.test(id)) ||
            !Array.isArray(scene.sprite_size) ||
            scene.sprite_size[0] !== 26 || scene.sprite_size[1] !== 26 ||
            !/^[a-f0-9]{64}$/.test(scene.image_sha256) ||
            !Array.isArray(scene.sprites) ||
            scene.sprites.length !== n ||
            !scene.sprites.every(isSafeRelative) ||
            !scene.vertices.every(isUnitPoint) ||
            !Array.isArray(scene.edges) || scene.edges.length < n - 1 ||
            !scene.edges.every(([a, b]) => Number.isInteger(a) &&
                Number.isInteger(b) && a >= 0 && b >= 0 &&
                a < n && b < n && a !== b))
            throw new Error(`Malformed scene: ${scene.id}`);
    }
    if (backgrounds.size !== 6)
        throw new Error('One constellation required for each of six backgrounds');
    return library;
}

export function activationCount(length, n, stages = 8) {
    if (!Number.isInteger(n) || n < 8 || n > 24 ||
        !Number.isInteger(stages) || stages < 4 || stages > 12)
        throw new Error('Invalid activation mapping');
    const amount = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0;
    // n=13 → 2,4,5,7,9,10,12,13 across eight length increments.
    return Math.min(n, Math.ceil(n * Math.min(amount, stages) / stages));
}

export function pickScene(library, config, lastId = null, random = Math.random) {
    validateLibrary(library);
    if (config?.mode === 'fixed') {
        const scene = library.scenes.find(s => s.id === config.scene_id);
        if (!scene)
            throw new Error('Configured M6 pilot scene not found');
        return scene;
    }
    if (config?.mode !== 'random-on-lock')
        throw new Error('Invalid scene selection mode');
    const available = library.scenes.filter(s => s.id !== lastId);
    const candidates = available.length ? available : library.scenes;
    const r = random();
    if (!Number.isFinite(r) || r < 0 || r >= 1)
        throw new Error('Invalid random scene selector');
    return candidates[Math.floor(r * candidates.length)];
}

export function coverTransform(width, height, imageWidth, imageHeight) {
    if (width <= 0 || height <= 0 || imageWidth <= 0 || imageHeight <= 0)
        throw new Error('Invalid screen or image dimensions');
    const scale = Math.max(width / imageWidth, height / imageHeight);
    return {scale, dx: (width - imageWidth * scale) / 2,
        dy: (height - imageHeight * scale) / 2};
}
