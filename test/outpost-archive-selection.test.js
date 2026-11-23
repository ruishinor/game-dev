import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARCHIVE_PATH, ARCHIVE_SHA256, zipMembers, readGltf, summarizeGltf } from '../tools/assets/glb-source-quality.mjs';
import { createHash } from 'node:crypto';

test('source archive identifies weapon and range pack candidates before visual production', () => {
  const data = readFileSync(ARCHIVE_PATH);
  assert.equal(createHash('sha256').update(data).digest('hex'), ARCHIVE_SHA256);
  const categories = {
    range: /firing|range|target|shoot|practice|training|dummy|barricade|shooting|barrier|backstop/i,
    armory: /weapon|gun|rifle|pistol|carbine|armory|armoury|armament|magazine|ammo|rack|arsenal/i,
  };
  const rows = [];
  for (const { name, raw } of zipMembers(data)) {
    const kind = Object.keys(categories).filter(k => categories[k].test(name));
    if (!kind.length) continue;
    const glb = readGltf(raw);
    rows.push({ name, kind: kind.join(','), triangles: summarizeGltf(glb).triangles, materials: glb.materials?.length ?? 0 });
  }
  // Written in CI logs for evidence-based asset choice. Source names are not
  // sufficient evidence of in-game suitability; shape, material and licensing
  // metadata remain separate considerations.
  console.log('OUTPOST_ARCHIVE_CANDIDATES:', JSON.stringify(rows));
  assert.ok(rows.every(x => x.triangles > 0 && x.materials >= 0));
});
