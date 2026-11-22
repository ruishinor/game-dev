import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../shared/content.js';
import { makeGame, makeChar, place } from './helpers.js';
import { dealDamage } from '../server/sim/combat.js';
import { lootState, openLoot } from '../server/sim/loot.js';
import { eliteUncommonPool, eliteUncommonDrop, isEliteEnemy, ELITE_UNCOMMON_CHANCE } from '../server/sim/loot-tables.js';

function killElite(eliteRng, inventory = []) {
  const g = makeGame();
  const p = g.addPlayer(makeChar('vanguard', { level: 5, inventory }));
  g.openExpanse();
  const e = g.enemies.find((x) => x.elite && x.severanceCamp);
  const grunt = g.enemies.find((x) => x.severanceCamp && !x.elite);
  g.rng = () => 0.999; g.eliteRng = eliteRng;
  place(p, e.x + 1, e.z);
  dealDamage(g, p, e, 1e6, 'test');
  assert.ok(openLoot(g, p, e.id, e.lootGeneration).ok);
  return { g, p, e, grunt, entries: lootState(g, p).loot.entries };
}

test('the uncommon pool is every Uncommon catalogue item, including the Expanse elite rewards', () => {
  const pool = eliteUncommonPool();
  for (const id of ['overseer_ember_core', 'severance_signet', 'resonant_survey_lens', 'cinder_mend_lattice']) assert.ok(pool.includes(id), id);
  for (const id of pool) assert.equal(ITEMS[id].rarity, 'Uncommon');
});

test('an elite always yields extra resonance fragments and, on its own roll, one uncommon item', () => {
  const lucky = killElite(() => 0.01);
  const frag = lucky.entries.find((x) => x.id === 'resonance_fragment');
  assert.ok(frag && frag.quantity >= 2, 'two resonance fragments');
  const items = lucky.entries.filter((x) => x.kind === 'item' && ITEMS[x.id]?.rarity === 'Uncommon');
  assert.equal(items.length, 1);
  const unlucky = killElite(() => ELITE_UNCOMMON_CHANCE + 0.01);
  assert.ok(unlucky.entries.find((x) => x.id === 'resonance_fragment'));
  assert.equal(unlucky.entries.filter((x) => x.kind === 'item' && ITEMS[x.id]?.rarity === 'Uncommon').length, 0);
});

test('regular garrison members never roll the elite table; owned uncommons are not dropped again', () => {
  const { grunt } = killElite(() => 0.01);
  assert.equal(isEliteEnemy(grunt), false);
  assert.equal(eliteUncommonDrop(grunt, makeChar('vanguard'), () => 0), null);
  const all = eliteUncommonPool();
  const elite = { type: 'sentinel', elite: { hp: 3, dmg: 1.5 } };
  assert.equal(eliteUncommonDrop(elite, makeChar('vanguard', { inventory: all }), () => 0.01), null, 'nothing left to give');
  const one = eliteUncommonDrop(elite, makeChar('vanguard', { inventory: all.slice(1) }), () => 0.01);
  assert.equal(one, all[0]);
  // malformed RNG output never drops anything
  for (const n of [NaN, -1, 1, 2]) assert.equal(eliteUncommonDrop(elite, makeChar('vanguard'), () => n), null);
});
