import test from 'node:test';
import assert from 'node:assert/strict';
import { equipItem, cancelInscription } from '../server/sim/progress.js';
import { isolate, makeChar, makeGame, run } from './helpers.js';

test('inscription is timed, commits once, and supports movement, combat and cancellation', () => {
  const game = makeGame();
  isolate(game, null);
  const p = game.addPlayer(makeChar('vanguard', {
    inventory: ['glyph_rending_echo', 'glyph_resonant_aegis'],
    attunements: ['resonance'],
  }));
  assert.ok(equipItem(game, p, 'glyph_rending_echo').ok);
  assert.equal(equipItem(game, p, 'glyph_resonant_aegis').ok, false);
  assert.equal(p.stats.glyph, null);
  game.handleInputs(p, [{ seq: 1, f: 1, s: 0, yaw: 0, j: 0 }]);
  run(game, 1850);
  assert.equal(p.stats.glyph, null);
  assert.ok(equipItem(game, p, 'glyph_rending_echo').ok);
  p.combatUntil = game.time + 2000;
  run(game, 1850);
  assert.equal(p.stats.glyph, null);
  run(game, 200);
  assert.ok(equipItem(game, p, 'glyph_rending_echo').ok);
  cancelInscription(game, p);
  run(game, 1850);
  assert.equal(p.stats.glyph, null);
  assert.ok(equipItem(game, p, 'glyph_rending_echo').ok);
  const events = [];
  run(game, 1750, events);
  assert.equal(p.stats.glyph, null);
  run(game, 1000, events);
  assert.equal(p.stats.glyph, 'glyph_rending_echo');
  assert.equal(events.filter(e => e.e === 'ritual' && e.phase === 'complete').length, 1);
  assert.equal(equipItem(game, p, 'glyph_rending_echo').ok, false);
  assert.ok(equipItem(game, p, 'glyph_resonant_aegis').ok);
  game.removePlayer(p.id);
  const reconnected = game.addPlayer(p.char);
  run(game, 1850);
  assert.equal(reconnected.stats.glyph, 'glyph_rending_echo');
  assert.equal(game.privateState(reconnected).inscription, null);
});
