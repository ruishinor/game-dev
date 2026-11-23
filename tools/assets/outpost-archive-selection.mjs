// Inventory and safely stage relevant donor packs from the owner-provided GLB
// archive. This is source preparation, never a browser mount or publication.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { createHash } from 'node:crypto';
import { ARCHIVE_PATH, ARCHIVE_SHA256, zipMembers, readGltf, summarizeGltf } from './glb-source-quality.mjs';

const archive = readFileSync(ARCHIVE_PATH);
const hash = createHash('sha256').update(archive).digest('hex');
if (hash !== ARCHIVE_SHA256) throw Error('Original archive hash changed');
const extract = process.argv.includes('--stage');
const directory = resolve('tools/asset-pipeline/.asset-cache/pipeline/outpost-training-source');
if (extract) mkdirSync(directory, { recursive: true });
const patterns = [
  { name: 'firing-range', pattern: /firing|range|target|shoot|practice|training|dummy|barricade|shooting|barrier|backstop|console|bulwark|sandbag|bunker/i },
  { name: 'weapons-and-armory', pattern: /weapon|gun|rifle|pistol|carbine|armory|armoury|armament|magazine|ammo|rack|arsenal|blaster|emitter|storage|cabinet|gunstock|barrel/i },
];
const findings = [];
for (const { name, raw } of zipMembers(archive)) {
  const gltf = readGltf(raw); // Reject invalid candidates before staging.
  // ZIP member names are often opaque. Also inspect actual node/mesh/material
  // labels to avoid excluding usable original weapon/range building blocks.
  const labels = [name, ...(gltf.nodes || []).map(o => o.name || ''),
    ...(gltf.meshes || []).map(o => o.name || ''),
    ...(gltf.materials || []).map(o => o.name || '')].join(' ');
  const match = patterns.filter(({ pattern }) => pattern.test(labels));
  if (!match.length) continue;
  const digest = createHash('sha256').update(raw).digest('hex');
  const data = { path: name, sha256: digest, bytes: raw.length, groups: match.map(x => x.name), ...summarizeGltf(gltf) };
  if (extract) {
    const output = join(directory, digest.slice(0, 12) + '-' + basename(name));
    writeFileSync(output, raw);
    data.staged = output;
  }
  findings.push(data);
}
const result = {
  archive: ARCHIVE_PATH, sha256: hash, selected: findings.length, staged: extract,
  status: 'source-donors-only: models still require shape/material/rig quality review, reconstruction, GLB validation and gameplay captures',
  findings,
};
console.log(JSON.stringify(result, null, 2));
