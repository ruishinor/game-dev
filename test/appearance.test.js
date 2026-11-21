import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES, RACES, ARCHIVED_RACES, RETIRED_RACES, HAIR_STYLES, HAIR_COLOURS, normalizeAppearance, appearanceString, defaultAppearance, encodeAppearance } from '../shared/appearance.js';
import { LOOKS, validLook } from '../shared/content.js';

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
  assert.deepEqual(normalizeAppearance('f.velari.99.crop.3', 'vanguard_plate'), { frame: 'f', race: 'velari', skin: 0, hair: 'crop', hairColour: 3 });
});

test('appearance: retired Veyran is excluded from gameplay and retained only in the archive', () => {
  assert.equal(Object.hasOwn(RACES,'veyran'),false);
  assert.ok(Object.hasOwn(ARCHIVED_RACES,'veyran'));
  assert.equal(validLook('vanguard','red_rucker'),false);
  assert.equal(appearanceString('f.veyran.1.swept.2','vanguard_plate'),'f.human.3.crop.1');
  assert.equal(normalizeAppearance('m.veyran.1.swept.2', 'red_rucker').hair, 'none');
  assert.ok(RACES.velari.hair.includes(normalizeAppearance('f.velari.1.swept.2', 'conductor').hair));
  for (const R of Object.values(RACES)) for (const h of R.hair) assert.ok(Object.hasOwn(HAIR_STYLES, h));
});

test('appearance: race-bound outfits keep their race', () => {
  assert.equal(normalizeAppearance('m.human.2.crop.1', 'red_rucker').race, 'veyran');
  assert.equal(normalizeAppearance('m.human.2.crop.1', 'red_rucker').hair, 'none');
  assert.equal(normalizeAppearance('f.velari.1.crop.1', 'conductor').race, 'velari');
});

test('appearance: the playable races are Human, Velari and Augmented', () => {
  assert.deepEqual(Object.keys(RACES), ['human', 'velari', 'augmented']);
  assert.deepEqual(Object.values(RACES).map((r) => r.name), ['Human', 'Velari', 'Augmented']);
  for (const R of Object.values(RACES)) assert.ok(R.skins.length >= 4 && R.blurb.length > 20, R.id);
});

test('appearance: retired races migrate explicitly and keep every compatible choice', () => {
  assert.deepEqual(RETIRED_RACES, { mirekin: 'velari' });
  // Every Mirekin skin and hair choice carries over to Velari unchanged.
  for (let skin = 0; skin < 4; skin++) for (const hair of ['none', 'buzz', 'crop']) {
    assert.equal(appearanceString(`f.mirekin.${skin}.${hair}.3`, 'vanguard_plate'), `f.velari.${skin}.${hair}.3`);
  }
  // Colonist was renamed Human: the stored id is unchanged.
  assert.equal(appearanceString('m.human.5.swept.2', 'vanguard_plate'), 'm.human.5.swept.2');
  // Race-bound outfits still win over a migrated race.
  assert.equal(normalizeAppearance('f.mirekin.1.crop.1', 'red_rucker').race, 'veyran');
});
