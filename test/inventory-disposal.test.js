import test from 'node:test';
import assert from 'node:assert/strict';
import { disposeItem } from '../server/sim/disposal.js';
import { MATERIAL_CAP } from '../shared/crafting.js';
import { equipItem, grantItem } from '../server/sim/progress.js';
import { makeChar, makeGame } from './helpers.js';

test('salvage is atomic, bounded, owner-scoped and revision gated', () => {
  const game = makeGame();
  const p = game.addPlayer(makeChar('vanguard', {
    inventory: ['tuned_emitter', 'glyph_rending_echo', 'calibrated_servo'],
    condition: { tuned_emitter: 60 },
    materials: { sentinel_alloy: MATERIAL_CAP },
  }));
  const other = game.addPlayer(makeChar('vanguard'));
  const request = { action: 'salvage', item: 'tuned_emitter', rev: p.inventoryRev };
  const mustNotRoll = () => assert.fail('Invalid requests must fail before rolling.');
  assert.equal(disposeItem(game, other, request, mustNotRoll).ok, false);
  assert.equal(disposeItem(game, p, request, mustNotRoll).ok, false);
  assert.ok(p.char.inventory.includes('tuned_emitter'));
  p.char.materials.sentinel_alloy--;
  game.markDirty(p);
  request.rev = p.inventoryRev;
  assert.equal(disposeItem(game, p, { ...request, item: 'glyph_rending_echo' }, mustNotRoll).ok, false);
  assert.equal(disposeItem(game, p, { ...request, action: 'destroy', item: 'calibrated_servo' }, mustNotRoll).ok, false);
  assert.ok(disposeItem(game, p, request, () => 0).ok);
  assert.equal(p.char.condition.tuned_emitter, undefined);
  assert.equal(p.char.materials.sentinel_alloy, MATERIAL_CAP);
  assert.ok(!p.char.inventory.includes('tuned_emitter'));
  assert.ok(grantItem(game, p, 'tuned_emitter'));
  assert.equal(disposeItem(game, p, request, mustNotRoll).ok, false);
  p.char.materials.sentinel_alloy--;
  game.markDirty(p);
  request.rev = p.inventoryRev;
  assert.ok(disposeItem(game, p, request, () => 99).ok);
  assert.equal(p.char.materials.sentinel_alloy, MATERIAL_CAP - 1);
  assert.match(p.outbox.at(-1).m, /No material recovered/);
});

test('destroy refuses installed equipment and removes only one eligible junk unit', () => {
  const game = makeGame();
  const p = game.addPlayer(makeChar('vanguard', { inventory: ['field_emitter'], goods: { mire_husk: 2 } }));
  assert.ok(equipItem(game, p, 'field_emitter').ok);
  const rev = p.inventoryRev;
  assert.equal(disposeItem(game, p, { action: 'destroy', item: 'field_emitter', rev }).ok, false);
  const junk = { action: 'destroy', item: 'mire_husk', rev };
  assert.ok(disposeItem(game, p, junk).ok);
  assert.equal(disposeItem(game, p, junk).ok, false);
  assert.equal(p.char.goods.mire_husk, 1);
  assert.deepEqual(p.char.materials, {});
});
