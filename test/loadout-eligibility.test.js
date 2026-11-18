import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../shared/content.js';
import { describeRequirements, resolveLoadout, tryEquip, validateLoadout } from '../shared/build.js';
import { makeChar } from './helpers.js';

test('requirements exclude the candidate and cannot be seeded by circular bonuses', t => {
  ITEMS.eligibility_device = { name: 'Test device', slot: 'device', skills: { biotech: 3 }, req: { skills: { biotech: 13 } } };
  ITEMS.eligibility_implant = { name: 'Test implant', slot: 'implant', skills: { biotech: 3 }, req: { skills: { biotech: 13 } } };
  t.after(() => {
    delete ITEMS.eligibility_device;
    delete ITEMS.eligibility_implant;
  });
  const char = makeChar('symbiotech', { inventory: ['eligibility_device', 'eligibility_implant', 'glyph_shared_pulse'], attunements: ['resonance'] });
  assert.equal(tryEquip(char, 'eligibility_device').ok, false);
  assert.equal(describeRequirements(char, 'eligibility_device')[0].met, false);
  const circular = { device: 'eligibility_device', implant: 'eligibility_implant', glyph: 'glyph_shared_pulse' };
  assert.equal(validateLoadout(char, circular).ok, false);
  assert.deepEqual(resolveLoadout(char, circular).equipped, { device: null, implant: null, glyph: 'glyph_shared_pulse' });
  char.level = 4;
  assert.equal(validateLoadout(char, circular).ok, true);
});
