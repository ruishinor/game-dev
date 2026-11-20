// Presentation-only Spindle lighting. The server decides whether the
// authenticated owner switched this utility on; no visibility/combat mechanics
// depend on the client rendering. Distances use world metres.
export const SPINDLE_LIGHT = Object.freeze({
  range: 10,
  height: 0.68,
  intensity: 100,
  color: 0xbddfff,
  maxSources: 3,
  maxViewDistance: 80,
});

/** Select the nearest eligible sources for a bounded Three.js light pool. */
export function activeSpindleLights(entities, viewer, tuning = SPINDLE_LIGHT) {
  const sources = [];
  const rangeSq = tuning.maxViewDistance ** 2;
  for (const ent of entities) {
    if (ent?.meta?.k !== 'c' || ent.meta.c !== 'spindle' || !ent.placed ||
        ent.row?.li !== 1 || ent.row?.a === 'dormant') continue;
    const dx = ent.pos.x - viewer.x, dy = ent.pos.y - viewer.y, dz = ent.pos.z - viewer.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 <= rangeSq) sources.push({ ent, d2 });
  }
  sources.sort((a, b) => a.d2 - b.d2 || a.ent.id - b.ent.id);
  return sources.slice(0, tuning.maxSources).map(source => source.ent);
}
