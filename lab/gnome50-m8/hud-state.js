// M8.1 Observatory HUD: pure, scene-derived display metadata only.
// This module has no GNOME imports, authentication state or input observers.
export function hudMetadata(scene) {
    const name = scene?.name;
    const stars = scene?.vertices?.length;
    const edges = scene?.edges;
    if (typeof name !== 'string' ||
        !/^[A-Za-z][A-Za-z .'-]{1,44}$/.test(name) ||
        !Number.isInteger(stars) || stars < 8 || stars > 24 ||
        !Array.isArray(edges) ||
        !edges.every(edge => Array.isArray(edge) && edge.length === 2 &&
            edge.every(n => Number.isInteger(n) && n >= 0 && n < stars) &&
            edge[0] !== edge[1]))
        throw new Error('Invalid photographic scene metadata for HUD');
    return Object.freeze({
        constellation: name.toUpperCase(),
        sourceStars: stars,
        connections: edges.length,
        status: 'STAR MAP READY',
        mapping: 'AWAITING INPUT',
        stageCapacity: 8,
    });
}
