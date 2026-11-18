// Record exactly which MakeHuman data files the build reads, with hashes, in
// assets/sources.json (source id "makehuman"). Run after changing which
// targets the recipe or tools/assets/lib/mh-*.mjs use:
//
//   node tools/assets/makehuman-ledger.mjs
//
// The files come from a pinned upstream commit; the data is CC0
// (MakeHuman LICENSE.md, section C). No MakeHuman program code is used.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUMANOIDS, SHELLS } from '../../assets/recipe.mjs';
import { CACHE } from './fetch.mjs';
import { readGltf } from './lib/gltf.mjs';
import { MakeHuman } from './lib/makehuman.mjs';
import { replaceWithMakeHuman } from './lib/mh-humanoid.mjs';
import { bakeSkin } from './lib/mh-skin.mjs';
import { eyeTexture } from './lib/face-textures.mjs';

export const MH_COMMIT = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(CACHE, 'makehuman');
const resolve = ([id, rel]) => (fs.existsSync(path.join(CACHE, id, 'x', rel)) ? path.join(CACHE, id, 'x', rel) : path.join(CACHE, id, rel));
for (const spec of HUMANOIDS) if (spec.makehuman) replaceWithMakeHuman(await readGltf(resolve(spec.mesh)), new MakeHuman(dir), spec.makehuman, SHELLS);
bakeSkin(new MakeHuman(dir), { size: 64 });
await eyeTexture(dir, 64);
MakeHuman.used.add('eyes/materials/brown_eye.png');
const files = [...MakeHuman.used].sort().map((rel) => {
  const buf = fs.readFileSync(path.join(dir, rel));
  return { file: rel, url: `https://raw.githubusercontent.com/makehumancommunity/makehuman/${MH_COMMIT}/makehuman/data/${rel}`, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
});
const ledgerFile = path.join(ROOT, 'assets', 'sources.json');
const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
const entry = {
  id: 'makehuman',
  title: 'MakeHuman 1.x bundled data (hm08 base mesh, targets, default rig weights, high-poly eyes)',
  creator: 'MakeHuman Team / Data Collection AB',
  license: 'CC0-1.0',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  licenseNote: `Upstream LICENSE.md section C: bundled assets (base mesh, proxies, targets, textures, poses) are CC0; program code is AGPL and is not used. Verified at commit ${MH_COMMIT}.`,
  attribution: 'Not required. Credited in docs/ASSETS.md.',
  redistribution: 'Unrestricted (public domain dedication).',
  page: 'https://github.com/makehumancommunity/makehuman',
  acquired: '2026-11-18',
  use: 'Player and NPC body, head and face geometry, facial expression and identity morphs, skin weights, eyeballs.',
  files,
};
const i = ledger.sources.findIndex((s) => s.id === 'makehuman');
if (i >= 0) ledger.sources[i] = entry;
else ledger.sources.push(entry);
fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + '\n');
console.log(`makehuman: ${files.length} files, ${(files.reduce((s, f) => s + f.bytes, 0) / 1e6).toFixed(1)} MB recorded`);
