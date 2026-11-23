// Inspect the actual Electron ASAR rather than trusting manifest globs alone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPackage } from '@electron/asar';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resourceRoot = path.join(ROOT, 'dist', 'desktop', 'win-unpacked', 'resources');
const asarPath = path.join(resourceRoot, 'app.asar');
if (!fs.existsSync(asarPath)) throw new Error('Missing packaged app.asar');
const paths = listPackage(asarPath).map((name) => name.replace(/\\/g, '/').replace(/^\/+/, ''));
const required = ['desktop/main.cjs', 'server/index.js', 'client/index.html',
  'client/src/main.js', 'shared/content.js', 'node_modules/ws/index.js',
  'node_modules/three/build/three.module.js'];
for (const name of required) {
  if (!paths.includes(name)) throw new Error('Required app.asar runtime entry missing: ' + name);
}

const forbidden = paths.filter((name) =>
  /(^|\/)(docs|test|assets\/source-archives|tools\/asset-pipeline|node_modules\/electron)(\/|$)/i.test(name) ||
  /\.(zip|7z|rar|tar|gz|blend\d*|fbx|obj|psd|psb|kra|xcf|exe|dll|pdb)$/i.test(name));
if (forbidden.length) {
  throw new Error('Source archives, development files or binaries found inside app.asar:\n' +
    forbidden.slice(0, 30).join('\n'));
}

const modelDir = path.join(resourceRoot, 'runtime-models');
const expected = new Set([
  'stillpoint.glb', 'severance_gate.glb', 'severance_kit.glb',
  'outpost_shelter.glb', 'salvage_camp.glb', 'resonant_vein.glb',
  'sanctum_arch.glb', 'phase_scar.glb', 'foundry_kit.glb',
  'depths-recovery-cache.glb', 'sanctum-warden-carbine.glb',
  'sanctum-warden-marksman.glb',
]);
const present = fs.readdirSync(modelDir);
if (present.length !== expected.size || present.some((name) => !expected.has(name))) {
  throw new Error('Packaged runtime GLB allowlist mismatch: ' + present.join(', '));
}
for (const name of present) {
  const file = path.join(modelDir, name);
  const stat = fs.statSync(file);
  const head = Buffer.alloc(12);
  const fd = fs.openSync(file, 'r');
  try { if (fs.readSync(fd, head, 0, 12, 0) !== 12) throw new Error('Truncated GLB: ' + name); }
  finally { fs.closeSync(fd); }
  if (head.toString('ascii', 0, 4) !== 'glTF' ||
      head.readUInt32LE(4) !== 2 || head.readUInt32LE(8) !== stat.size)
    throw new Error('Packaged GLB header invalid: ' + name);
}
console.log('Verified app.asar runtime allowlist (' + paths.length +
  ' entries) and exactly ' + expected.size + ' production GLBs.');
