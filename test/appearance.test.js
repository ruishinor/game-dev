import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES, RACES, HAIR_STYLES, HAIR_COLOURS, normalizeAppearance, appearanceString, defaultAppearance, encodeAppearance } from '../shared/appearance.js';
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
  // Each look used to fix its body: old characters must not change frame or race.
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
  assert.deepEqual(normalizeAppearance('f.mirekin.99.crop.3', 'vanguard_plate'), { frame: 'f', race: 'mirekin', skin: 0, hair: 'crop', hairColour: 3 });
});

test('appearance: race rules are enforced (hairless Veyran, Mirekin hair set)', () => {
  assert.equal(normalizeAppearance('m.veyran.1.swept.2', 'vanguard_plate').hair, 'none');
  assert.ok(RACES.mirekin.hair.includes(normalizeAppearance('f.mirekin.1.swept.2', 'conductor').hair));
  for (const R of Object.values(RACES)) for (const h of R.hair) assert.ok(Object.hasOwn(HAIR_STYLES, h));
});

test('appearance: race-bound outfits keep their race', () => {
  assert.equal(normalizeAppearance('m.human.2.crop.1', 'red_rucker').race, 'veyran');
  assert.equal(normalizeAppearance('m.human.2.crop.1', 'red_rucker').hair, 'none');
  assert.equal(normalizeAppearance('f.mirekin.1.crop.1', 'conductor').race, 'mirekin');
});
