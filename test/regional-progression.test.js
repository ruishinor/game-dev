// Character progression through the level-15 cap: regional bands, entry
// requirements, level-scaled enemies and earned kill XP (server-only rules).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, makeChar, place, travelToFoundry } from './helpers.js';
import { ENEMIES, XP_TO_NEXT, MAX_LEVEL } from '../shared/content.js';
import { interact } from '../server/sim/progress.js';
import { dealDamage } from '../server/sim/combat.js';
import { REGION_LEVELS, RIFT_LEVEL, ELITE, killXp, levelHpMul, levelDmgMul, regionEntryDenial } from '../server/sim/enemy-levels.js';
import { SEVERANCE_PATROLS } from '../server/sim/severance-patrols.js';
import { SALVAGE_GARRISON } from '../server/sim/severance-camps.js';
import { isEliteEnemy } from '../server/sim/loot-tables.js';
import { inSeverancePocket } from '../shared/world.js';
import { inSilentFoundry } from '../shared/silent-foundry.js';

const traveller = (level) => makeChar('vanguard', { level, attunements: ['resonance'], riftCalibration: 'completed' });

test('levels 1-5 keep their established enemy health, damage and kill XP', () => {
  for (const [type, def] of Object.entries(ENEMIES)) {
    const e = { type, level: def.level };
    assert.equal(levelHpMul(e), 1, type);
    assert.equal(levelDmgMul(e), 1, type);
    for (let lv = 1; lv <= 5; lv++) assert.equal(killXp(e, lv), def.xp > 0 ? def.xp : 0, `${type} at player level ${lv}`);
  }
  assert.deepEqual(XP_TO_NEXT.slice(0, 5), [0, 90, 200, 340, 520], 'original thresholds');
  assert.equal(MAX_LEVEL, 15);
});

test('region bands: Expanse 5-12 from level 5, Foundry 8-11 from level 8, with elites', () => {
  assert.deepEqual({ ...REGION_LEVELS.severance_expanse }, { entry: 5, min: 5, max: 12 });
  assert.deepEqual({ ...REGION_LEVELS.silent_foundry }, { entry: 8, min: 8, max: 11 });
  for (const e of [...SEVERANCE_PATROLS, ...SALVAGE_GARRISON]) {
    assert.ok(e.level >= 5 && e.level <= 12, `${e.name} ${e.level}`);
  }
  // the scavenger camp keeps its own elite, at the top of the band
  const campElites = SALVAGE_GARRISON.filter((g) => g.elite);
  assert.equal(campElites.length, 1);
  assert.equal(campElites[0].level, 12);

  const g = makeGame();
  g.openExpanse();
  const expanse = g.enemies.filter((e) => e.severancePatrol || e.severanceCamp);
  assert.ok(expanse.length >= 13 && expanse.every((e) => e.level >= 5 && e.level <= 12));
});

test('the Foundry is level 8-11 content; at least half its guards are elite, plus the boss', async () => {
  const g = makeGame(), p = g.addPlayer(traveller(8));
  assert.ok((await travelToFoundry(g, p)).ok);
  const enc = g.enemies.filter((e) => e.foundryEncounter);
  assert.ok(enc.every((e) => e.level >= 8 && e.level <= 11), enc.map((e) => e.level).join());
  const boss = enc.filter((e) => e.overseer);
  assert.equal(boss.length, 1);
  assert.equal(boss[0].level, 11);
  const guards = enc.filter((e) => !e.overseer);
  const elites = guards.filter(isEliteEnemy);
  assert.ok(elites.length * 2 >= guards.length, `${elites.length} of ${guards.length} elite`);
  for (const e of elites) {
    assert.deepEqual(e.elite, { hp: ELITE.hp, dmg: ELITE.dmg });
    assert.equal(e.maxHp, Math.round(ENEMIES[e.type].hp * levelHpMul(e) * ELITE.hp));
  }
  // level-scaled health is applied at spawn and on respawn
  const normal = guards.find((e) => !e.elite);
  assert.equal(normal.maxHp, Math.round(ENEMIES[normal.type].hp * levelHpMul(normal)));
  assert.ok(normal.maxHp > ENEMIES[normal.type].hp);
});

test('entry requirements: the Expanse at 5 and the Foundry at 8, enforced on the server', async () => {
  assert.match(regionEntryDenial('severance_expanse', { level: 4 }), /level 5/);
  assert.equal(regionEntryDenial('severance_expanse', { level: 5 }), null);
  assert.match(regionEntryDenial('silent_foundry', { level: 7 }), /level 8/);
  assert.equal(regionEntryDenial('silent_foundry', { level: 8 }), null);
  for (const bad of [{}, { level: '9' }, { level: NaN }, null]) assert.ok(regionEntryDenial('silent_foundry', bad), 'malformed level fails closed');

  const g = makeGame();
  const low = g.addPlayer(traveller(4));
  const entry = g.rift.entry;
  place(low, entry.x, entry.z - 3.6);
  const denied = interact(g, low, entry.id);
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /level 5/);
  assert.ok(!inSeverancePocket(low.x, low.z));

  const mid = g.addPlayer(traveller(7));
  const r = await travelToFoundry(g, mid);
  assert.equal(r.ok, false);
  assert.match(r.reason, /level 8/);
  assert.ok(inSeverancePocket(mid.x, mid.z), 'level 7 reaches the Expanse but not the Foundry');
  assert.ok(!inSilentFoundry(mid.x, mid.z));
});

test('kill XP grows with enemy level and elite rank; far-lower enemies award little', () => {
  const sk = (level, elite) => ({ type: 'skitter', level, ...(elite ? { elite: { hp: ELITE.hp, dmg: ELITE.dmg } } : {}) });
  assert.ok(killXp(sk(6), 6) > killXp(sk(1), 6));
  assert.ok(Math.abs(killXp(sk(8, true), 8) - killXp(sk(8), 8) * 2.5) <= 1.5, 'elites award 2.5x');
  // a level-12 player gains little from a level-1 skitter: no Reach farming to 15
  assert.ok(killXp(sk(1), 12) <= Math.ceil(ENEMIES.skitter.xp * 0.1));
  // type elites (the Overseer warden) already carry their reward; no double elite bonus
  assert.equal(killXp({ type: 'warden', level: 11, elite: undefined }, 11), Math.round(180 * (10 + 88) / (10 + 32)));
  // enemy damage is level-scaled through dealDamage
  const g = makeGame(), p = g.addPlayer(traveller(8));
  const e = g.enemies.find((x) => x.type === 'skitter');
  place(p, e.x + 1.5, e.z);
  p.maxHp = p.hp = 1e6;
  const plain = dealDamage(g, e, p, 1000, 'test');
  e.level = ENEMIES.skitter.level + 5;
  const scaled = dealDamage(g, e, p, 1000, 'test');
  assert.ok(Math.abs(scaled / plain - levelDmgMul(e)) < 0.02, `${scaled} vs ${plain}`);
});

test('earned journey: Foundry kills credit level-scaled XP, cross a level and persist the result', async () => {
  const g = makeGame(), p = g.addPlayer(traveller(8));
  assert.ok((await travelToFoundry(g, p)).ok);
  p.char.xp = XP_TO_NEXT[8] - 10;
  const target = g.enemies.find((e) => e.foundryEncounter && e.elite && e.level === 8);
  const expected = killXp(target, 8);
  assert.ok(expected > 10);
  place(p, target.x, target.z + 2);
  dealDamage(g, p, target, 1e6, 'test');
  assert.equal(target.state, 'dead');
  assert.equal(p.char.level, 9, 'the elite kill crossed level 8 -> 9');
  assert.equal(p.char.xp, expected - 10);
  // a repeated death callback cannot grant the same kill twice
  const { onEnemyKilled } = await import('../server/sim/progress.js');
  onEnemyKilled(g, target, [p.id]);
  assert.equal(p.char.xp, expected - 10);
  assert.ok(p.outbox.some((m) => m.e === 'xp' && m.a === expected));
});

test('the Phase Scar requires level 5 for its instruments and its travel', () => {
  assert.equal(RIFT_LEVEL, 5);
  const g = makeGame();
  const f = g.rift;
  const four = g.addPlayer(makeChar('vanguard', { level: 4, attunements: ['resonance'] }));
  place(four, f.indexer.x, f.indexer.z + 2.5);
  const r = interact(g, four, f.indexer.id);
  assert.equal(r.ok, false);
  assert.match(r.reason, /level 5/);
  const calibrated = g.addPlayer(traveller(4));
  place(calibrated, f.entry.x, f.entry.z - 3.6);
  const t = interact(g, calibrated, f.entry.id);
  assert.equal(t.ok, false);
  assert.match(t.reason, /level 5/);
  const five = g.addPlayer(traveller(5));
  place(five, f.entry.x, f.entry.z - 3.6);
  assert.ok(interact(g, five, f.entry.id).ok, 'level 5 enters through the Phase Scar');
  assert.ok(inSeverancePocket(five.x, five.z));
});
