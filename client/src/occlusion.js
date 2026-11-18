// Intersect the interior of a sightline with a vertical cylinder. Clip the
// parameter interval by height first, then find the nearest horizontal point.
export function intersectsOccluder(eye, point, volume) {
  let start = 0.04;
  let end = 0.96;
  const dy = point.y - eye.y;
  if (Math.abs(dy) > 1e-8) {
    const bottom = (volume.y0 - eye.y) / dy;
    const top = (volume.y1 - eye.y) / dy;
    start = Math.max(start, Math.min(bottom, top));
    end = Math.min(end, Math.max(bottom, top));
    if (start > end) return false;
  } else if (eye.y < volume.y0 || eye.y > volume.y1) return false;

  const x = eye.x - volume.x;
  const z = eye.z - volume.z;
  const dx = point.x - eye.x;
  const dz = point.z - eye.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 1e-8
    ? Math.max(start, Math.min(end, -(x * dx + z * dz) / lengthSquared))
    : start;
  return (x + dx * t) ** 2 + (z + dz * t) ** 2 <= volume.r2;
}
