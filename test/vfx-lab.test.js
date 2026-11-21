// The VFX lab (client/vfx-lab.html) inspects the game's real effect recipes.
// These static checks keep it servable under the page CSP, deterministic, and
// in step with the combat VFX registry. tools/vfx-lab-capture.mjs is the
// browser-side check (pixel-identical repeated seeks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const lab = read('client/src/vfx-lab.js');
const html = read('client/vfx-lab.html');
const importMap = (s) => s.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];

test('lab page uses the same import map as the game preview, so the CSP hash allows it', () => {
  assert.equal(importMap(html), importMap(read('client/preview.html')));
  assert.match(html, /<script type="module" src="\/client\/src\/vfx-lab\.js"><\/script>/);
  assert.doesNotMatch(html.replace(/<script type="importmap">[\s\S]*?<\/script>/, ''), /<script(?![^>]*src=)/, 'no inline scripts beyond the import map');
});

test('lab imports only the real engine modules and served vendor files', () => {
  const imports = [...lab.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ['../../shared/content.js', './vfx/combat.js', './vfx/engine.js', './vfx/textures.js', 'three'].sort());
});

test('lab playback is deterministic: seeded engine, fixed step, no Math.random', () => {
  assert.doesNotMatch(lab, /Math\.random/);
  assert.match(lab, /createVfx\(THREE, scene, \{[^}]*seed: state\.seed/);
  assert.match(lab, /const STEP = 1 \/ 60/);
  assert.doesNotMatch(read('client/src/vfx/engine.js'), /Math\.random/);
});

test('lab catalogue covers every class ability, every area kind and the common events', async () => {
  const { CLASSES } = await import('../shared/content.js');
  assert.match(lab, /for \(const \[cls, def\] of Object\.entries\(CLASSES\)\)/);
  assert.match(lab, /for \(const k of \[\.\.\.AREA_KINDS\]\.sort\(\)\)/);
  for (const k of ['melee', 'bolt', 'windup', 'level', 'acquire']) assert.ok(lab.includes(`'${k}'`), k);
  assert.ok(Object.keys(CLASSES).length >= 4);
});

test('lab exposes the automation contract used by the capture tool', () => {
  for (const k of ['ready: true', 'catalogue:', 'seek(t)', 'select(fx)', 'state()']) assert.ok(lab.includes(k), k);
  const tool = read('tools/vfx-lab-capture.mjs');
  for (const k of ['__lab.select', '__lab.seek', '__lab.state', 'nondeterministic']) assert.ok(tool.includes(k), k);
});

test('lab panel offers playback, scrub, speed, seed, quality, lighting, concurrency, reduced motion, stats and screenshot', () => {
  for (const id of ['fx', 'play', 'restart', 'shot', 'time', 'speed', 'seed', 'q', 'light', 'n', 'rm', 'stats']) assert.match(html, new RegExp(`id="${id}"`), id);
  for (const l of ['studio', 'day', 'dusk', 'night']) assert.ok(lab.includes(`${l}:`), l);
});
