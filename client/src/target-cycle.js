// Presentation-only targeting. The server still validates target and combat intents.
export function cycleHostileTarget(entities, position, selected = 0, reverse = false) {
  const candidates = [];
  for (const ent of entities) {
    if (ent.meta?.k !== 'e' || ent.dead || !ent.placed ||
        (ent.meta.neu && !(ent.row?.f & 8))) continue;
    const distance = Math.hypot(ent.pos.x - position.x, ent.pos.z - position.z);
    if (!Number.isFinite(distance) || distance > 50) continue;
    candidates.push({ id: ent.id, distance });
  }
  candidates.sort((a, b) => a.distance - b.distance || a.id - b.id);
  if (!candidates.length) return 0;
  const index = candidates.findIndex(ent => ent.id === selected);
  if (index < 0) return candidates[0].id;
  return candidates[(index + (reverse ? -1 : 1) + candidates.length) % candidates.length].id;
}
