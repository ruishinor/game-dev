const SEPARATION = 14;

export function placePartyMarker(x, z, radius, placed) {
  const limit = (x, z) => {
    const scale = Math.min(1, radius / Math.hypot(x, z));
    return { x: x * scale, z: z * scale };
  };
  const anchor = limit(x, z);
  const fits = point => placed.every(other => Math.hypot(point.x - other.x, point.z - other.z) >= SEPARATION);
  if (fits(anchor)) return anchor;
  for (const distance of [SEPARATION, SEPARATION * 2]) {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const point = limit(anchor.x + Math.cos(angle) * distance, anchor.z + Math.sin(angle) * distance);
      if (fits(point)) return point;
    }
  }
  return anchor;
}
