// Produce *only* the GLBs required at runtime. Source archives never enter the desktop package.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDepthsCacheGLB } from '../tools/assets/extract-depths-cache.mjs';
import { ensureWardenRifleGLB } from '../tools/assets/warden-rifle-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'dist', 'desktop-runtime');
const pipeline = (name) => path.join(ROOT, 'tools', 'asset-pipeline', 'assets', name, 'outputs', name + '.glb');

// The server maps these explicit URLs to existing authored runtime outputs.
const exportedModels = new Map([
  ['stillpoint.glb', pipeline('stillpoint')],
  ['severance_gate.glb', pipeline('severance_gate')],
  ['severance_kit.glb', pipeline('severance_kit')],
  ['outpost_shelter.glb', pipeline('outpost_shelter')],
  ['salvage_camp.glb', pipeline('salvage_camp')],
  ['resonant_vein.glb', pipeline('resonant_vein')],
  ['sanctum_arch.glb', pipeline('sanctum_arch')],
  ['phase_scar.glb', pipeline('phase_scar')],
  ['foundry_kit.glb', pipeline('foundry_kit')],
]);

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Unexpected symlink in runtime tree: ' + absolute);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

// A narrowly scoped desktop build must never silently include archives or editable art sources.
const prohibited = /\.(zip|7z|rar|tar|gz|blend\d*|fbx|obj|psd|psb|kra|xcf|exe|dll|pdb)$/i;
for (const directory of ['client', 'server', 'shared']) {
  for (const file of walk(path.join(ROOT, directory))) {
    if (prohibited.test(file)) throw new Error('Non-runtime file in packaged source tree: ' + file);
  }
}

exportedModels.set('depths-recovery-cache.glb', ensureDepthsCacheGLB());
exportedModels.set('sanctum-warden-carbine.glb', ensureWardenRifleGLB('carbine'));
exportedModels.set('sanctum-warden-marksman.glb', ensureWardenRifleGLB('marksman'));

const missing = [...exportedModels].filter(([, from]) => !fs.existsSync(from) || !fs.statSync(from).isFile() || fs.statSync(from).size < 20);
if (missing.length) {
  throw new Error('Required runtime GLB outputs are missing. Build the existing asset pipeline first:\n' +
    missing.map(([name, from]) => name + ' <- ' + path.relative(ROOT, from)).join('\n'));
}
fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
for (const [name, from] of exportedModels) {
  fs.copyFileSync(from, path.join(DEST, name));
}
const staged = fs.readdirSync(DEST);
if (staged.length !== exportedModels.size || staged.some((name) => !name.endsWith('.glb'))) {
  throw new Error('Packaged model output is not the expected runtime-only allowlist');
}
console.log('Staged ' + staged.length + ' runtime GLBs in ' + path.relative(ROOT, DEST) +
  '; no source archives or Blender files.');
