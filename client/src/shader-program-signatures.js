// Opt-in, bounded attribution of newly observed WebGLProgram objects.
// Never emit raw shader source, cache keys, user data or GL resources.
export function snapshotShaderPrograms(renderer) {
  const programs = renderer?.info?.programs;
  return Array.isArray(programs) ? programs.slice() : null;
}

function signature(key) {
  if (typeof key !== 'string') return null;
  // FNV-1a (32 bit) is a stable diagnostic fingerprint, not a security hash.
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function describeNewShaderPrograms(before, after, maxFamilies = 12) {
  if (!Array.isArray(before) || !Array.isArray(after)) return null;
  const earlier = new Set(before);
  const added = after.filter((program) => !earlier.has(program));
  const families = new Map();
  const signatures = new Set();
  for (const program of added) {
    const name = typeof program?.name === 'string' && program.name.trim()
      ? program.name.trim().replace(/[^a-zA-Z0-9 _.-]/g, '_').slice(0, 50)
      : 'unnamed';
    families.set(name, (families.get(name) ?? 0) + 1);
    const hash = signature(program?.cacheKey);
    if (hash && signatures.size < 16) signatures.add(hash);
  }
  const ordered = [...families.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const limit = Math.max(1, Math.min(16, Math.trunc(maxFamilies) || 12));
  return {
    count: added.length,
    families: ordered.slice(0, limit).map(([name, count]) => ({ name, count })),
    omittedFamilies: Math.max(0, ordered.length - limit),
    signatures: [...signatures],
    signaturesOmitted: Math.max(0, added.length - signatures.size),
  };
}
