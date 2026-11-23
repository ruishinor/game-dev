import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, ENEMIES, MAX_LEVEL, XP_TO_NEXT } from '../shared/content.js';
import { RECIPES } from '../shared/crafting.js';
import { killXp, levelHpMul, REGION_LEVELS } from '../server/sim/enemy-levels.js';
import { NO_ITEM_REWARD_TYPES } from '../server/sim/loot.js';
import { spawnLumenfenWildlife } from '../server/sim/lumenfen.js';
import { dealDamage } from '../server/sim/combat.js';
import { makeChar, makeGame, place } from './helpers.js';

const experienceTo = (level) => XP_TO_NEXT.slice(1, level).reduce((total, xp) => total + xp, 0);
const xpPerHp = (type, level) => {
  const enemy = { type, level };
  return killXp(enemy, level) / (ENEMIES[type].hp * levelHpMul(enemy));
};

test('P12: character XP milestones and five-region entry ladder remain coherent', () => {
  assert.equal(MAX_LEVEL, 15);
  assert.deepEqual([5, 8, 12, 15].map(experienceTo), [1150, 3910, 11510, 21200]);
  assert.deepEqual(
    Object.fromEntries(Object.entries(REGION_LEVELS).map(([id, band]) => [id, band.entry])),
    { severance_expanse: 5, lumenfen: 7, silent_foundry: 8, null_annex: 12 },
  );
  for (const cls of Object.values(CLASSES)) {
    const original = cls.auto.dmg / cls.auto.interval;
    const alternative = (cls.meleeAuto || cls.rangedAuto);
    assert.ok(alternative, cls.id + ': all classes must retain two attack modes');
    assert.ok(Math.abs(original - alternative.dmg / alternative.interval) < 1e-10,
      cls.id + ': innate melee/ranged DPS must remain equal');
  }
});

test('P12: Lumenfen Bog Stalker XP per effective HP is competitive at levels 8-11', () => {
  assert.equal(ENEMIES.fen_stalker.xp, 100);
  for (const level of [8, 9, 10, 11]) {
    const fen = xpPerHp('fen_stalker', level);
    const similarly_mobile = xpPerHp('faultstalker', level);
    assert.ok(fen >= 0.8 * similarly_mobile, 'level ' + level + ': Lumenfen XP/HP should not fall below 80% of comparable Faultstalker');
    assert.ok(fen < xpPerHp('sentinel', level), 'level ' + level + ': no new dominant XP-per-HP strategy');
  }
});
test('P12: Lumenfen correction leaves the no-ordinary-loot contract intact', () => {
  assert.ok(NO_ITEM_REWARD_TYPES.includes('fen_stalker'));
  const game = makeGame();
  const spawned = spawnLumenfenWildlife(game);
  const victim = spawned.find((e) => e.type === 'fen_stalker' && e.level === 8);
  assert.ok(victim);
  const player = game.addPlayer(makeChar('keeper', { level: 8, attunements: ['resonance'] }));
  place(player, victim.x + 1.5, victim.z);
  dealDamage(game, player, victim, 1_000_000, 'test');
  assert.equal(victim.state, 'dead');
  assert.equal(player.char.xp, 100);
  assert.equal(player.char.credits || 0, 0);
  assert.deepEqual(player.char.goods || {}, {});
  assert.ok(!victim.lootByPlayer?.has(player.id), 'ordinary Bog Stalker corpses remain empty');
});

test('P12: repeatable fabrication and material conversion never create inputs for free', () => {
  for (const [id, recipe] of Object.entries(RECIPES)) {
    const cost = Object.values(recipe.inputs).reduce((total, qty) => total + qty, 0);
    if (recipe.output.material || recipe.output.goods) {
      assert.ok(cost > 0, id + ': a repeatable stack output needs consumed resources');
    } else if (cost === 0) {
      assert.equal(recipe.kind, 'restore', id + ': free unique-item transformation is restore-only');
      assert.ok(recipe.target, id + ': free restore must consume its existing donor');
    }
  }
});
