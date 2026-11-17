import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, LOOKS, defaultLook, validLook } from '../shared/content.js';

test('Brine Surveyor is an additional cosmetic option without changing class defaults', () => {
  assert.equal(defaultLook('symbiotech'), 'conductor');
  assert.equal(defaultLook('vanguard'), 'vanguard_plate');
  assert.ok(validLook('symbiotech', 'brine_surveyor'));
  assert.equal(validLook('vanguard', 'brine_surveyor'), false);
  assert.equal(new Set(LOOKS.symbiotech.map(x => x.id)).size, LOOKS.symbiotech.length);
  assert.equal(CLASSES.symbiotech.companion, 'mender');
});
