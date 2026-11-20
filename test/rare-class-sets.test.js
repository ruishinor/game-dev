// Rare class armour collection: the 16 items, 12 cumulative set effects and
// their effect on real ability resolution (not only on tooltips).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ARMOR_SETS, ITEMS, ABILITIES, SURVEYOR } from '../shared/content.js';
import { ARMOR_SET_SLOTS } from '../shared/armor-set-bonuses.js';
import { deriveStats, tryEquip, tryUnequip } from '../shared/build.js';
import { useAbility, getBuff } from '../server/sim/combat.js';
import { makeGame, makeChar, place, enemyOf, isolate, run } from './helpers.js';

const SPEC = {
  vanguard: { name: 'Cinderlock Regalia', hp: 44, skills: { kinetics: 1, instrumentation: 1 } },
  symbiotech: { name: 'Mycelial Accord', hp: 32, skills: { biotech: 1, instrumentation: 1 } },
  keeper: { name: 'Vesperglass Array', hp: 35, skills: { instrumentation: 1, kinetics: 1 } },
  surveyor: { name: 'Strataweave Fieldkit', hp: 25, skills: { instrumentation: 1, kinetics: 1 } },
};
const idsOf = (cls) => ARMOR_SET_SLOTS.map((slot) => `${cls}_field_set_${slot}`);
function wear(char, ids) {
  for (const id of ids) {
    const r = tryEquip(char, id);
    assert.equal(r.ok, true, `${id}: ${r.reason}`);
    char.equipped = r.equipped;
  }
  return char;
}

test('sixteen QL 5 Rare class pieces, four per class, one per anatomical slot', () => {
  for (const cls of Object.keys(SPEC)) {
    const set = ARMOR_SETS[`${cls}_field_set`];
    assert.equal(set.name, SPEC[cls].name);
    assert.deepEqual(Object.keys(set.bonuses).sort(), ['2', '3', '4']);
    for (const [k, id] of idsOf(cls).entries()) {
      const it = ITEMS[id];
      assert.equal(it.slot, ARMOR_SET_SLOTS[k]);
      assert.equal(it.cls, cls);
      assert.equal(it.rarity, 'Rare');
      assert.equal(it.ql, 5);
    }
  }
});

for (const [cls, spec] of Object.entries(SPEC)) {
  test(`${spec.name}: four pieces give the specified totals; removal drops them at once`, () => {
    const ids = idsOf(cls);
    const char = makeChar(cls, { inventory: [...ids] });
    const base = deriveStats(char);
    wear(char, ids);
    const full = deriveStats(char);
    assert.equal(full.maxHp - base.maxHp, spec.hp);
    for (const [k, v] of Object.entries(spec.skills)) assert.equal(full.skills[k] - base.skills[k], v, k);
    const r = tryUnequip(char, 'boots');
    char.equipped = r.equipped;
    const three = deriveStats(char);
    assert.ok(three.maxHp < full.maxHp);
    // the 4-piece effect is gone as soon as the fourth piece is removed
    for (const key of ['dischargeRadius', 'graftTicks', 'relayRadius', 'blastRadius']) assert.equal(three[key], 0, key);
  });
}

test('set counts come from distinct equipped pieces only: inventory, duplicates and foreign pieces add nothing', () => {
  const ids = idsOf('keeper');
  const owner = makeChar('keeper', { inventory: [...ids, ...idsOf('vanguard')] });
  const before = deriveStats(owner);
  assert.equal(deriveStats(owner).barrierMul, 1, 'owning is not wearing');
  wear(owner, ids.slice(0, 2));
  assert.equal(deriveStats(owner).maxHp, before.maxHp + 14 + 0 + 8, 'chest + gloves + 2-piece');
  // the same item cannot be placed in a second slot, and a foreign set piece is refused
  assert.equal(tryEquip(owner, 'vanguard_field_set_greaves').ok, false);
  const forged = { ...owner, equipped: { ...owner.equipped, greaves: 'keeper_field_set_chest', boots: 'vanguard_field_set_boots' } };
  assert.equal(deriveStats(forged).barrierMul, 1);
  assert.equal(deriveStats(forged).maxHp, deriveStats(owner).maxHp);
});

test('Cinderlock: Inductive Recovery scales Charge gained; Containment Overdrive widens Discharge', () => {
  const char = wear(makeChar('vanguard', { inventory: idsOf('vanguard') }), idsOf('vanguard'));
  const s = deriveStats(char);
  assert.ok(Math.abs(s.chargeMul - 1.08) < 1e-9);
  assert.equal(s.dischargeRadius, 1);
});

test('Mycelial Accord: Sustained Graft adds exactly one healing tick of the same size', () => {
  const ticks = (pieces) => {
    const game = makeGame();
    const ids = idsOf('symbiotech');
    const p = game.addPlayer(wear(makeChar('symbiotech', { inventory: ids }), ids.slice(0, pieces)));
    const ally = game.addPlayer(makeChar('vanguard'));
    place(p, 0, 25); place(ally, 1, 25);
    for (const e of game.enemies) { e.state = 'dead'; e.respawnAt = Infinity; }
    game.setTarget(p, ally.id);
    ally.hp = 1;
    p.res = 100;
    assert.ok(useAbility(game, p, 'mending_graft').ok);
    const hot = getBuff(ally, 'hot');
    const events = [];
    run(game, 12000, events);
    const n = events.filter((e) => e.e === 'heal' && e.ab === 'mending_graft' && e.d === ally.id).length;
    return { n, per: hot.per };
  };
  const three = ticks(3), four = ticks(4);
  assert.equal(four.n, three.n + 1);
  assert.equal(four.per, three.per);
  assert.equal(three.n, 1 + ABILITIES.mending_graft.hot.dur / 1000, 'direct heal + one per second');
});

test('Vesperglass: Coherent Projection raises projected barriers; Expanded Geometry reaches 1 m further', () => {
  const setup = (pieces) => {
    const game = makeGame();
    const ids = idsOf('keeper');
    const p = game.addPlayer(wear(makeChar('keeper', { inventory: ids }), ids.slice(0, pieces)));
    const e = enemyOf(game, 'sentinel'); isolate(game, e);
    place(p, 0, 25); place(e, 0, 31); game.setTarget(p, e.id);
    p.res = 100;
    return { game, p };
  };
  const two = setup(2), three = setup(3);
  assert.ok(useAbility(two.game, two.p, 'hinge_field').ok);
  assert.ok(useAbility(three.game, three.p, 'hinge_field').ok);
  assert.equal(getBuff(two.p, 'shield').v, Math.round(40 * two.p.stats.power));
  assert.equal(getBuff(three.p, 'shield').v, Math.round(40 * three.p.stats.power * 1.06));
  for (const [pieces, reached] of [[3, false], [4, true]]) {
    const { game, p } = setup(pieces);
    const ally = game.addPlayer(makeChar('vanguard'));
    place(ally, ABILITIES.lattice_relay.radius + 0.5, 25);
    assert.ok(useAbility(game, p, 'lattice_relay').ok);
    assert.equal(!!getBuff(ally, 'shield'), reached, `${pieces} pieces`);
  }
});

test('Strataweave: Persistent Analysis lengthens Fault Scan; Expanded Fracture widens the real blast and its public rig radius', () => {
  const setup = (pieces) => {
    const game = makeGame();
    const ids = idsOf('surveyor');
    const p = game.addPlayer(wear(makeChar('surveyor', { inventory: ids }), ids.slice(0, pieces)));
    const e = enemyOf(game, 'sentinel'); isolate(game, e);
    place(p, 0, 25); place(e, 0, 31); game.setTarget(p, e.id);
    p.res = 100;
    return { game, p, e };
  };
  const two = setup(2), three = setup(3);
  assert.ok(useAbility(two.game, two.p, 'fault_scan').ok);
  assert.ok(useAbility(three.game, three.p, 'fault_scan').ok);
  assert.equal((three.p.surveyKit.mark.until - three.game.time) - (two.p.surveyKit.mark.until - two.game.time), 2000);
  assert.ok(Math.abs(two.p.stats.dmgMul - 1.04) < 1e-9);
  const four = setup(4);
  assert.ok(useAbility(four.game, four.p, 'field_rig').ok);
  four.game.time += 2000;
  const row = four.game.privateState?.(four.p);
  if (row?.surveyKit?.rig) assert.equal(row.surveyKit.rig.r, SURVEYOR.blastRadius + 1);
  four.p.res = 100;
  four.game.events.length = 0;
  assert.ok(useAbility(four.game, four.p, 'controlled_blast').ok);
  const blast = four.game.events.find((e) => e.k === 'survey_blast');
  assert.equal(blast.r, SURVEYOR.blastRadius + 1);
});
