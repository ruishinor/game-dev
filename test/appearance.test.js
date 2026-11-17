import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FRAMES, RACES, HAIR_STYLES, HAIR_COLOURS, normalizeAppearance, appearanceString, defaultAppearance, encodeAppearance } from '../shared/appearance.js';
import { HEAD, hairGeometry, featureGeometry, faceGeometry, createAppearanceKit } from '../client/src/appearance-render.js';
import { LOOKS } from '../shared/content.js';

test('appearance: valid strings round-trip unchanged', () => {
  for (const frame of Object.keys(FRAMES)) for (const [race, R] of Object.entries(RACES)) for (const hair of R.hair) {
    const s = `${frame}.${race}.${R.skins.length - 1}.${hair}.${HAIR_COLOURS.length - 1}`;
    assert.equal(appearanceString(s, 'vanguard_plate'), s);
  }
});

test('appearance: every look has a valid default and legacy saves keep their old body', () => {
  for (const looks of Object.values(LOOKS)) for (const { id } of looks) {
    const d = defaultAppearance(id);
    assert.equal(appearanceString(encodeAppearance(d), id), encodeAppearance(d));
  }
  // looks.js used to fix the body per look: these must not change for old characters.
  assert.equal(defaultAppearance('vanguard_plate').frame, 'm');
  assert.equal(defaultAppearance('red_rucker').race, 'veyran');
  for (const id of ['aegis_keeper', 'conductor', 'brine_surveyor']) assert.equal(defaultAppearance(id).frame, 'f');
  assert.equal(appearanceString(undefined, 'conductor'), encodeAppearance(defaultAppearance('conductor')));
});

test('appearance: hostile or malformed input falls back field by field', () => {
  const bad = [null, 42, '', 'x', 'a.b.c.d.e', 'm.human.99.crop.1', 'm.human.-1.crop.1', 'm.human.1.crop.1.extra', 'z'.repeat(200), 'm.__proto__.0.crop.0', 'm.constructor.0.crop.0', { frame: 'toString', race: 'hasOwnProperty' }, ['m', 'human']];
  for (const input of bad) {
    const a = normalizeAppearance(input, 'vanguard_plate');
    assert.ok(Object.hasOwn(FRAMES, a.frame) && Object.hasOwn(RACES, a.race), JSON.stringify(input));
    assert.ok(Number.isInteger(a.skin) && a.skin >= 0 && a.skin < RACES[a.race].skins.length);
    assert.ok(RACES[a.race].hair.includes(a.hair));
    assert.ok(Number.isInteger(a.hairColour) && a.hairColour < HAIR_COLOURS.length);
  }
  // One bad field never discards the good ones.
  assert.deepEqual(normalizeAppearance('f.mirekin.99.locs.3', 'vanguard_plate'), { frame: 'f', race: 'mirekin', skin: 0, hair: 'locs', hairColour: 3 });
});

test('appearance: race rules are enforced (hairless Veyran, Mirekin hair set)', () => {
  assert.equal(normalizeAppearance('m.veyran.1.ponytail.2', 'vanguard_plate').hair, 'none');
  assert.ok(RACES.mirekin.hair.includes(normalizeAppearance('f.mirekin.1.mohawk.2', 'conductor').hair));
  for (const R of Object.values(RACES)) for (const h of R.hair) assert.ok(Object.hasOwn(HAIR_STYLES, h));
});

const within = (g, frame, reach) => {
  const p = g.getAttribute('position');
  const c = HEAD[frame].c;
  for (let i = 0; i < p.count; i++) {
    const v = [p.getX(i), p.getY(i), p.getZ(i)];
    assert.ok(v.every(Number.isFinite), 'non-finite vertex');
    assert.ok(Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2]) < reach, `vertex ${v} beyond ${reach} m of the skull`);
  }
};

test('appearance render: every hair style, race feature and face fits each frame', () => {
  for (const frame of Object.keys(FRAMES)) {
    for (const style of Object.keys(HAIR_STYLES)) {
      const h = hairGeometry(THREE, frame, style);
      if (style === 'none') { assert.equal(h.hair, null); continue; }
      assert.ok(h.hair.getAttribute('position').count > 30, `${frame} ${style} empty`);
      within(h.hair, frame, 0.45);
      if (h.band) within(h.band, frame, 0.45);
      const tris = h.hair.getAttribute('position').count / 3;
      assert.ok(tris < 6000, `${frame} ${style}: ${tris} triangles`);
    }
    for (const race of Object.keys(RACES)) {
      const f = featureGeometry(THREE, frame, race);
      for (const g of Object.values(f)) if (g) within(g, frame, 0.26); // includes the swept-back Veyran cranium
    }
    within(faceGeometry(THREE, frame), frame, 0.15);
  }
  // Silhouette differences, not just tint.
  assert.ok(featureGeometry(THREE, 'm', 'veyran').skin && !featureGeometry(THREE, 'm', 'veyran').chitin);
  assert.ok(featureGeometry(THREE, 'm', 'mirekin').chitin && featureGeometry(THREE, 'm', 'mirekin').glow);
  assert.equal(featureGeometry(THREE, 'm', 'human').chitin, null);
});

test('appearance render: deterministic, shared across wearers, helmet shows only tails', () => {
  const a = hairGeometry(THREE, 'f', 'locs').hair.getAttribute('position').array;
  const b = hairGeometry(THREE, 'f', 'locs').hair.getAttribute('position').array;
  assert.deepEqual([...a.slice(0, 300)], [...b.slice(0, 300)]);
  const shared = (r) => { if (r.isBufferGeometry) r.userData.shared = true; else r.isShared = true; return r; };
  const kit = createAppearanceKit(THREE, { shared });
  const ctx = () => { const list = []; return { list, attach: (bone, o) => list.push({ bone, o }) }; };
  const x = ctx();
  const y = ctx();
  kit.apply(normalizeAppearance('f.mirekin.2.braids.4'), x);
  kit.apply(normalizeAppearance('f.mirekin.2.braids.4'), y);
  assert.equal(x.list.length, y.list.length);
  for (let i = 0; i < x.list.length; i++) {
    assert.equal(x.list[i].bone, 'Head');
    assert.equal(x.list[i].o.geometry, y.list[i].o.geometry);
    assert.ok(x.list[i].o.geometry.userData.shared, x.list[i].o.name);
    assert.ok(x.list[i].o.material.isShared, x.list[i].o.name);
  }
  // Under a helmet: no face, no scalp; a braid still shows below the rim.
  const h = ctx();
  kit.apply(normalizeAppearance('m.human.1.braids.0'), h, { covered: 'helmet' });
  assert.deepEqual(h.list.map((e) => e.o.name).sort(), ['appearance:hair', 'appearance:hairband']);
  const crop = ctx();
  kit.apply(normalizeAppearance('m.human.1.crop.0'), crop, { covered: 'helmet' });
  assert.equal(crop.list.length, 0);
  kit.dispose();
});
