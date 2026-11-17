// Repeatable combat-effect screenshots for every player ability, enemy special
// and common event. Drives the real server through useAbility (the same entry
// point the network handler uses); the harness only stages position, target,
// resource and cooldowns. Presentation evidence, not performance evidence.
//
//   node tools/vfx-capture.mjs [label] [filter]
//     label  -> docs/evidence/vfx/<label>/   (default "after")
//     filter -> only shots whose name contains it
//
// ?vfxt=<scale> slows presentation-only effect time so software rendering can
// photograph a mid-effect frame; it never touches simulation time.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';
import { useAbility } from '../server/sim/combat.js';
import { CLASSES } from '../shared/content.js';
import { launchBrowser } from './browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const label = process.argv[2] || 'after';
const only = process.argv[3] || '';
const OUT = path.join(ROOT, 'docs', 'evidence', 'vfx', label);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slow = Number(process.env.VFX_TIME_SCALE || 0.12);

const srv = await startServer({ port: 0, dataFile: null });
const game = srv.game;
const browser = await launchBrowser();
const errors = [];
const toward = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

async function join(name, cls) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  await page.goto(`http://127.0.0.1:${srv.port}/?q=2&qlock=1&nolock=1&vfxt=${slow}`);
  await page.fill('#name', name);
  await page.click(`.classcard[data-cls="${cls}"]`);
  await page.click('#enter');
  await page.waitForFunction(() => window.__attune?.state().myId && window.__attune.state().pos && window.__attune.state().drawn > 2);
  let p;
  for (let i = 0; i < 100 && !p; i++) { p = [...game.players.values()].find((x) => x.name === name); if (!p) await sleep(100); }
  return { page, ctx, name, p };
}

async function stage(c, enemy, gap = 5.5) {
  const p = c.p;
  const a = Math.atan2(p.x - enemy.x, p.z - enemy.z) || 0.6;
  p.x = enemy.x + Math.sin(a) * gap;
  p.z = enemy.z + Math.cos(a) * gap;
  p.hp = p.maxHp;
  if (p.companion) { p.companion.x = p.x + 1.2; p.companion.z = p.z - 0.8; }
  await c.page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return s.pos && Math.hypot(s.pos.x - x, s.pos.z - z) < 1.2; }, [p.x, p.z]);
  const face = toward(p.x, p.z, enemy.x, enemy.z);
  await c.page.evaluate((f) => window.__attune.view({ face: f, yaw: f + 0.75, pitch: 0.26, dist: 9.5 }), face);
}

async function shot(c, name, wait = 260) {
  if (only && !name.includes(only)) return;
  await sleep(wait);
  const start = await c.page.evaluate(() => window.__attune.state().frames);
  await c.page.waitForFunction((f) => window.__attune.state().frames >= f, start + 2);
  await c.page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 82 });
  console.log(`  ${name}.jpg`);
}

function ready(p, target) {
  p.cds = {}; p.gcdUntil = 0; p.res = CLASSES[p.cls].resource.max; p.hp = p.maxHp;
  if (target) { p.target = target.id; target.hp = Math.max(target.hp, target.maxHp * 0.8); }
}

function cast(c, ab, target) {
  ready(c.p, target);
  const r = useAbility(game, c.p, ab);
  if (!r?.ok) console.log(`  ! ${ab}: ${r?.reason || JSON.stringify(r)}`);
  return r?.ok;
}

let failed = false;
try {
  const skitters = game.enemies.filter((e) => e.type === 'skitter');
  const plans = {
    vanguard: ['rending_arc', 'graviton_tether', 'kinetic_ward', 'discharge'],
    symbiotech: ['neural_lash', 'mending_graft', 'spore_snare', 'overgrowth_surge'],
    keeper: ['phase_needle', 'hinge_field', 'resonant_reversal', 'lattice_relay'],
    surveyor: ['fault_scan', 'core_bore', 'field_rig', 'controlled_blast'],
  };
  let i = 0;
  for (const [cls, abilities] of Object.entries(plans)) {
    if (only && !abilities.some((a) => `${cls}-${a}`.includes(only)) && !cls.includes(only)) continue;
    const enemy = skitters[i++ % skitters.length];
    const c = await join(`Fx${cls.slice(0, 6)}`, cls);
    // Harness setup only: software frames take seconds, so keep the staged
    // player alive while several enemies are aggroed.
    const keep = setInterval(() => { if (!c.p.dead) c.p.hp = c.p.maxHp; }, 100);
    await stage(c, enemy, cls === 'vanguard' ? 2.6 : 6);
    for (const ab of abilities) {
      if (only && !`${cls}-${ab}`.includes(only)) continue;
      if (ab === 'resonant_reversal') { cast(c, 'hinge_field'); await sleep(400); c.p.cds = {}; c.p.gcdUntil = 0; }
      if (ab === 'core_bore') { cast(c, 'fault_scan', enemy); await sleep(300); }
      if (ab === 'controlled_blast' && !(c.p.surveyKit?.rig?.until > game.time)) { cast(c, 'field_rig'); await sleep(300); }
      const ok = cast(c, ab, enemy);
      if (ok) await shot(c, `${cls}-${ab}`);
      enemy.hp = enemy.maxHp; enemy.state = enemy.state === 'dead' ? 'idle' : enemy.state;
    }
    // A plain auto-attack / hit exchange.
    await shot(c, `${cls}-ambient-combat`, 1200);
    clearInterval(keep);
    await c.ctx.close();
  }
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  await browser.close();
  srv.close?.();
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
  process.exit(failed || errors.length ? 1 : 0);
}
