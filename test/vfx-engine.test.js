import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVfx, point, MAX_ITEMS, CAPACITY } from '../client/src/vfx/engine.js';
import { CombatVfx } from '../client/src/vfx/combat.js';
import { CLASSES } from '../shared/content.js';

const ground = (x, z) => Math.sin(x * 0.1) + Math.cos(z * 0.1);
const make = (opts = {}) => {
  const scene = new THREE.Scene();
  return { scene, v: createVfx(THREE, scene, { groundHeight: ground, ...opts }) };
};
const run = (v, seconds, step = 1 / 30) => { for (let t = 0; t < seconds; t += step) v.update(step); };

function entity(id, x, z, k = 'p', c = 'vanguard') {
  const y = ground(x, z);
  return { id, pos: { x, y, z }, chest: new THREE.Vector3(x, y + 1.1, z), head: new THREE.Vector3(x, y + 1.7, z), yaw: 0.4, placed: true, model: { radius: 0.8, hover: 0 }, meta: { k, c } };
}

test('vfx: point() accepts arrays, vectors and functions and rejects invalid input', () => {
  assert.deepEqual(point([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(point(new THREE.Vector3(1, 2, 3)), [1, 2, 3]);
  assert.deepEqual(point(() => ({ x: 4, y: 5, z: 6 })), [4, 5, 6]);
  for (const bad of [null, undefined, [1, 2], [NaN, 0, 0], [Infinity, 0, 0], [1e9, 0, 0], () => null, { x: 1 }]) assert.equal(point(bad), null);
});

test('vfx: invalid effect requests are ignored rather than thrown', () => {
  const { v } = make();
  assert.equal(v.burst({ at: [NaN, 0, 0], count: 10 }), 0);
  assert.equal(v.burst({ at: [0, 0, 0], shape: 'line', to: null }), 0);
  assert.equal(v.sigil({ at: [0, 0, 0], radius: -1 }), null);
  assert.equal(v.sigil({ at: [0, 0, 0], radius: 1000 }), null);
  assert.equal(v.shock({ at: [0, 0, 0], radius: NaN }), null);
  assert.equal(v.beam({ from: [0, 0, 0], to: [NaN, 1, 1] }), null);
  assert.equal(v.arc({ at: [0, 0, 0], radius: 1, yaw: NaN }), null);
  assert.equal(v.emitter({ tick: 'nope' }), null);
  v.update(NaN);
  v.update(-1);
  assert.equal(v.stats().items, 0);
});

test('vfx: particle capacity is a hard bound and every particle expires', () => {
  const { v } = make();
  for (let i = 0; i < 40; i++) v.burst({ at: [0, 1, 0], count: 400, exact: true, life: 1 });
  v.update(0.01);
  const s = v.stats();
  assert.ok(s.particles <= CAPACITY.add + CAPACITY.alpha, `${s.particles}`);
  assert.equal(s.particles, CAPACITY.add);
  assert.ok(s.dropped > 0);
  run(v, 1.1);
  assert.equal(v.stats().particles, 0);
});

test('vfx: shader items are capped, oldest retired first, materials disposed', () => {
  const { v } = make();
  let disposed = 0;
  const orig = THREE.ShaderMaterial.prototype.dispose;
  THREE.ShaderMaterial.prototype.dispose = function () { disposed++; return orig.call(this); };
  try {
    for (let i = 0; i < MAX_ITEMS + 25; i++) v.sigil({ at: [i, 0, 0], radius: 2, life: 5 });
    assert.equal(v.stats().items, MAX_ITEMS);
    assert.equal(v.stats().retired, 25);
    assert.ok(disposed >= 25);
    run(v, 5.1);
    assert.equal(v.stats().items, 0);
    assert.ok(disposed >= MAX_ITEMS + 25);
  } finally {
    THREE.ShaderMaterial.prototype.dispose = orig;
  }
});

test('vfx: same seed produces identical particle state (deterministic)', () => {
  const sample = () => {
    const { v } = make({ seed: 42 });
    v.burst({ at: [1, 2, 3], count: 30, exact: true, speed: [1, 4], spread: 1, gravity: 3, swirl: 2, life: [0.5, 1] });
    run(v, 0.3);
    return [...v.root.children.find((m) => m.name === 'vfx-particles').geometry.getAttribute('iPos').array.slice(0, 90)];
  };
  assert.deepEqual(sample(), sample());
});

test('vfx: quality and reduced motion scale work; quality 0 emits nothing', () => {
  const count = (o) => {
    const { v } = make(o);
    return v.burst({ at: [0, 0, 0], count: 100 });
  };
  const q2 = count({ quality: 2 });
  const q1 = count({ quality: 1 });
  const rm = count({ quality: 2, reducedMotion: true });
  assert.equal(q2, 100);
  assert.ok(q1 < q2 && q1 > 0);
  assert.ok(rm < q2 && rm > 0);
  assert.equal(count({ quality: 0 }), 0);
  const { v } = make({ quality: 0 });
  assert.equal(v.sigil({ at: [0, 0, 0], radius: 2 }), null);
  assert.equal(v.stats().lights, 0);
  assert.equal(make({ quality: 1 }).v.stats().lights, 0);
  assert.equal(make({ quality: 2 }).v.stats().lights, 2);
});

test('vfx: decals conform to terrain only when standing on it', () => {
  const { v } = make();
  const onGround = v.sigil({ at: [10, ground(10, 10), 10], radius: 3 });
  const ys = onGround.mesh.geometry.getAttribute('position');
  let spread = 0;
  for (let i = 0; i < ys.count; i++) spread = Math.max(spread, Math.abs(ys.getY(i) - 0.05));
  assert.ok(spread > 0.01, 'terrain-following decal should vary in height');
  const raised = v.sigil({ at: [10, ground(10, 10) + 3, 10], radius: 3 });
  const p = raised.mesh.geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) assert.ok(Math.abs(p.getY(i) - 0.05) < 1e-6);
});

test('vfx: flash lights are reused, never added after creation', () => {
  const { v } = make();
  const before = v.root.children.filter((c) => c.isLight).length;
  for (let i = 0; i < 10; i++) v.flash({ at: [i, 1, 0], intensity: 10 });
  v.update(0.01);
  assert.equal(v.root.children.filter((c) => c.isLight).length, before);
  run(v, 1);
  assert.ok(v.root.children.filter((c) => c.isLight).every((l) => l.intensity === 0));
});

test('vfx: dispose removes everything and is idempotent', () => {
  const { v, scene } = make();
  v.burst({ at: [0, 0, 0], count: 20 });
  v.sigil({ at: [0, 0, 0], radius: 2 });
  v.dispose();
  v.dispose();
  assert.equal(scene.getObjectByName('vfx-engine'), undefined);
  v.update(0.1);
  assert.equal(v.burst({ at: [0, 0, 0], count: 5 }), 0);
});

test('combat vfx: every ability, area event and common event plays and fully expires', () => {
  const { v } = make();
  const c = new CombatVfx(v);
  const enemy = entity(9, 6, 2, 'e', 'skitter');
  for (const [cls, def] of Object.entries(CLASSES)) {
    const s = entity(1, 0, 0, 'p', cls);
    for (const ab of def.abilities) {
      c.cast(ab, s, enemy);
      c.abilityHit(ab, s, enemy);
      c.hit(enemy, s, { ab, k: 'bolt', a: 10 });
      c.hit(enemy, s, { ab, k: 'melee', a: 10, sh: 3 });
    }
  }
  const s = entity(1, 0, 0, 'p', 'keeper');
  for (const k of ['discharge', 'aegis', 'lattice_relay', 'harmonic_restore', 'surge', 'resonance_burst', 'respawn', 'spawn', 'equip', 'attune']) c.area({ e: 'fx', k, s: 1, r: 6 }, s);
  for (const k of ['survey_blast', 'arc_pulse', 'seismic_slam']) c.area({ e: 'fx', k, x: 3, y: ground(3, 3), z: 3, r: 7 }, null);
  c.attuneLink(entity(4, 3, 3, 'o', 'stone'), s);
  const obj = entity(6, 4, 4, 'o', 'sample');
  for (const k of ['fault_shear', 'containment_sweep', 'carapace_echo']) assert.equal(c.area({ e: 'fx', k, s: 1, d: 9, x: 2, y: ground(2, 2), z: 2, r: 5 }, s, null, enemy), true, k);
  for (const k of ['deep_record', 'sinter_sample', 'carapace_imprint']) assert.equal(c.area({ e: 'fx', k, s: 1, o: 6, mode: 'kinetic' }, s, obj), true, k);
  // Unknown kinds are not claimed, so the caller keeps the original effect.
  assert.equal(c.area({ e: 'fx', k: 'some_future_effect', s: 1 }, s), false);
  c.relay(s, enemy);
  c.hit(s, enemy, { ab: 'auto', k: 'melee', a: 6 });
  c.hit(s, enemy, { ab: 'hurl', k: 'bolt', a: 6 });
  c.heal(s, s);
  c.transfer(entity(5, 1, 1, 'c', 'mender'), s);
  c.telegraph(2, ground(2, 2), 2, 4, 1500);
  c.level(s);
  c.die(enemy);
  // Target removed mid-flight: its last transform stays valid, nothing throws.
  enemy.chest.set(NaN, NaN, NaN);
  run(v, 0.2);
  enemy.chest.set(6, 2, 2);
  v.update(0.02);
  const mid = v.stats();
  assert.ok(mid.items > 0 && mid.items <= MAX_ITEMS);
  assert.ok(mid.particles > 0 && mid.particles <= CAPACITY.add + CAPACITY.alpha);
  run(v, 6);
  assert.equal(v.stats().items, 0);
  assert.equal(v.stats().particles, 0);
});

test('vfx: persistent areas are capped, re-placed, torn down at quality 0 and safe after dispose', async () => {
  const { MAX_AREAS } = await import('../client/src/vfx/engine.js');
  const { v } = make();
  const handles = [];
  for (let i = 0; i < MAX_AREAS + 5; i++) handles.push(v.area({ at: [i, ground(i, 0), 0], radius: 4 }));
  assert.equal(handles.filter(Boolean).length, MAX_AREAS);
  assert.equal(v.stats().areas, MAX_AREAS);
  const a = handles[0];
  const before = a ? v.root.children.length : 0;
  a.set([5, ground(5, 5), 5], 4);
  a.set([5, ground(5, 5), 5], 4); // unchanged: no rebuild
  a.set([NaN, 0, 0], 4); // invalid: ignored
  assert.equal(v.root.children.length, before);
  run(v, 1);
  a.dispose();
  a.dispose();
  assert.equal(a.alive, false);
  a.set([1, 1, 1], 2); // after dispose: ignored, nothing re-added
  assert.equal(v.stats().areas, MAX_AREAS - 1);
  v.setQuality(0);
  assert.equal(v.stats().areas, 0);
  assert.ok(handles.every((h) => !h || !h.alive));
  assert.equal(v.area({ at: [0, 0, 0], radius: 2 }), null);
});

test('vfx: auras follow their owner, are capped, and are torn down at quality 0', async () => {
  const { MAX_AURAS } = await import('../client/src/vfx/engine.js');
  const { v } = make();
  const pos = { x: 0, y: 1, z: 0 };
  const handles = [];
  for (let i = 0; i < MAX_AURAS + 3; i++) handles.push(v.aura({ at: () => pos, radius: 1, color: 0xff9a3c }));
  assert.equal(handles.filter(Boolean).length, MAX_AURAS);
  assert.equal(v.aura({ at: [0, 0, 0], radius: 1 }), null, 'needs a function to follow');
  pos.x = 5;
  v.update(0.1);
  assert.ok(v.root.children.some((m) => m.position?.x === 5));
  handles[0].dispose();
  handles[0].dispose();
  assert.equal(handles[0].alive, false);
  v.setQuality(0);
  assert.equal(v.stats().auras, 0);
});

test('status vfx: statuses appear and disappear exactly with the server buff list', async () => {
  const { StatusVfx, STATUS_KINDS } = await import('../client/src/vfx/status.js');
  const { v } = make();
  const c = new CombatVfx(v);
  const sv = new StatusVfx(c);
  const ent = entity(3, 2, 2, 'e', 'skitter');
  sv.sync(ent, [...STATUS_KINDS, 'shield', 'unknown'], 0.6);
  v.update(0.05);
  assert.equal(sv.tracked, 1);
  assert.ok(v.stats().auras >= 2, 'ward and bond shells');
  assert.ok(v.stats().areas >= 1, 'root ground sigil');
  assert.ok(v.stats().particles > 0);
  sv.sync(ent, ['hot'], 0.1);
  assert.equal(v.stats().auras, 0, 'ended statuses release their shells');
  assert.equal(v.stats().areas, 0);
  sv.sync(ent, [], 0.1);
  assert.equal(sv.tracked, 0);
  sv.sync(ent, ['ward'], 0.1);
  sv.sync(entity(4, 5, 5), 'not-an-array', 0.1);
  sv.clear();
  assert.equal(v.stats().auras, 0);
  assert.equal(sv.tracked, 0);
});

test('combat vfx: wind-up, acquisition, player defeat and Sinter ecology recipes play and expire', () => {
  const { v } = make();
  const c = new CombatVfx(v);
  const enemy = entity(9, 4, 4, 'e', 'warden');
  const me = entity(1, 0, 0, 'p', 'surveyor');
  c.windup(enemy, 1500);
  c.acquire(me);
  c.die(me);
  for (const k of ['sinter_alarm', 'sinter_guard', 'sinter_molt', 'sinter_repel', 'sinter_pounce']) assert.equal(c.area({ e: 'fx', k, s: 9, d: 1 }, enemy, null, me), true, k);
  run(v, 0.5);
  assert.ok(v.stats().items > 0 && v.stats().particles > 0);
  run(v, 9);
  assert.equal(v.stats().items, 0);
  assert.equal(v.stats().particles, 0);
});

test('coverage: every effect kind the server emits and every enemy special has an engine recipe', async () => {
  const fs = await import('node:fs');
  const { ENEMIES } = await import('../shared/content.js');
  const { AREA_KINDS } = await import('../client/src/vfx/combat.js');
  const src = fs.readdirSync('server/sim').filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(`server/sim/${f}`, 'utf8')).join('\n');
  const kinds = new Set([...src.matchAll(/e:\s*'fx'\s*,\s*k:\s*'([a-z_]+)'/g)].map((m) => m[1]));
  for (const def of Object.values(ENEMIES)) for (const sp of def.specials || []) kinds.add(sp.id);
  assert.ok(kinds.size >= 15, `found ${kinds.size} kinds`);
  const missing = [...kinds].filter((k) => !AREA_KINDS.has(k));
  assert.deepEqual(missing, [], 'add a recipe in client/src/vfx/combat.js (areaRecipe + AREA_KINDS)');
});

test('phase transposition emits bounded transfer effects and expires',()=>{
 const {v}=make(),combat=new CombatVfx(v);
 combat.cast('phase_transposition',entity(1,0,0,'p','keeper'),entity(2,4,2));
 v.update(.01);assert.ok(v.stats().items>=4);assert.ok(v.stats().particles>0);
 run(v,3);assert.equal(v.stats().items,0);assert.equal(v.stats().particles,0);
});
