import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EconomyMetrics } from '../server/sim/economy-metrics.js';
import { makeChar, makeGame, place, isolate, enemyOf } from './helpers.js';
import { grantXp, grantSalvage, craftRecipe, interact } from '../server/sim/progress.js';
import { tradeVendor } from '../server/sim/vendor.js';
import { dealDamage } from '../server/sim/combat.js';
import { openLoot, lootState, takeLoot } from '../server/sim/loot.js';

const epoch = Date.parse('2026-11-23T07:00:00.000Z');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attune-economy-metrics-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let now = epoch;
  const file = path.join(dir, 'private', 'economy.json');
  const metrics = new EconomyMetrics(file, () => now);
  const game = makeGame();
  game.wallNow = () => now;
  game.economy = metrics;
  return { game, file, metrics, advance: (ms) => { now += ms; }, at: () => now };
}
const dayOf = metrics => metrics.snapshot().days['2026-11-23'];
const count = (day, kind) => day.totals[kind] || 0;

test('opt-in metrics observe committed gameplay flows, class/level bands, and completed sessions only', t => {
  const { game, file, metrics, advance } = fixture(t);
  const p = game.addPlayer(makeChar('vanguard', {
    level: 8, xp: 0, credits: 0, goods: { spent_contact: 2 },
    materials: { mire_fibre: 3, sentinel_alloy: 2 },
  }));
  assert.equal(dayOf(metrics), undefined);
  assert.equal(grantXp(game, p, 50, 'quest'), 50);
  assert.equal(grantSalvage(game, p, 'mire_fibre', 2), true);
  const bench = game.objects.find(o => o.type === 'sanctum_fabricator');
  place(p, bench.x, bench.z + 1);
  assert.ok(craftRecipe(game, p, 'field_maintenance_kit', p.utilityRev).ok);
  assert.equal(craftRecipe(game, p, 'field_maintenance_kit', p.utilityRev).ok, true, 'second paid cycle is valid');
  const vendor = game.objects.find(o => o.type === 'quartermaster');
  place(p, vendor.x, vendor.z + 1.5);
  assert.ok(interact(game, p, vendor.id).ok);
  const msg = { op: 'sell', id: 'spent_contact', qty: 1, ticket: p.vendor.ticket, rev: p.vendor.rev };
  assert.ok(tradeVendor(game, p, msg).ok);
  assert.equal(tradeVendor(game, p, msg).ok, false, 'replayed quote is rejected');
  assert.equal(p.char.credits, 3);
  const before = dayOf(metrics);
  assert.equal(count(before, 'sessions'), 0, 'open sessions are not completed');
  assert.equal(count(before, 'xp_awarded'), 50);
  assert.equal(before.byDetail.xp_awarded.quest, 50);
  assert.equal(count(before, 'materials_granted'), 2);
  assert.equal(count(before, 'materials_spent'), 4, 'two full paid fabrication cycles');
  assert.equal(count(before, 'goods_crafted'), 4);
  assert.equal(count(before, 'craft_cycles'), 2);
  assert.equal(count(before, 'vendor_trades'), 1);
  assert.equal(count(before, 'credits_vendor_in'), 3);
  assert.equal(before.byDetail.goods_spent.spent_contact, 1);
  assert.equal(before.byClass.vanguard.xp_awarded, 50);
  assert.equal(before.byLevel['8-11'].xp_awarded, 50);
  advance(65_000);
  game.removePlayer(p.id);
  assert.equal(count(dayOf(metrics), 'sessions'), 1);
  assert.equal(count(dayOf(metrics), 'session_seconds'), 65);
  assert.equal(metrics.flush(), true);
  const bytes = fs.readFileSync(file, 'utf8');
  assert.ok(!bytes.includes(p.char.id));
  assert.ok(!bytes.includes(p.name));
  assert.ok(!bytes.includes('tokenHash'));
  assert.equal(metrics.flush(), false, 'no redundant write on an unchanged snapshot');
  const restored = new EconomyMetrics(file, () => epoch + 70_000);
  assert.equal(count(dayOf(restored), 'sessions'), 1);
  assert.equal(count(dayOf(restored), 'credits_vendor_in'), 3);
});

test('only actually collected corpse credits and one kill per death count, not unopened loot', t => {
  const {game,metrics} = fixture(t);
  const p = game.addPlayer(makeChar('vanguard', { level: 8 }));
  const enemy = enemyOf(game, 'sentinel'); isolate(game, enemy);
  place(p, enemy.x, enemy.z);
  game.rng = () => 0.99;
  dealDamage(game, p, enemy, 1e6, 'test');
  assert.equal(count(dayOf(metrics), 'kills'), 1);
  assert.ok(count(dayOf(metrics), 'xp_awarded') > 0);
  assert.equal(count(dayOf(metrics), 'credits_looted'), 0);
  assert.ok(openLoot(game, p, enemy.id, enemy.lootGeneration).ok);
  const credits = lootState(game, p).loot.entries.find(e => e.kind === 'credits');
  assert.ok(credits);
  assert.ok(takeLoot(game, p, enemy.id, enemy.lootGeneration, 'credits').ok);
  assert.equal(count(dayOf(metrics), 'credits_looted'), 1);
  assert.equal(takeLoot(game, p, enemy.id, enemy.lootGeneration, 'credits').ok, false);
  assert.equal(count(dayOf(metrics), 'credits_looted'), 1);
  assert.equal(dayOf(metrics).byDetail.kills.sentinel, 1);
});

test('privacy and integrity: invalid events, fabricated details and GM-assisted sessions are excluded', t => {
  const {game,metrics,advance} = fixture(t);
  const p = game.addPlayer(makeChar('surveyor', { level: 6 }));
  assert.equal(metrics.observe('user_id', p, 1, 'secret'), false);
  assert.equal(metrics.observe('items_granted', p, 1, 'unknown'), false);
  assert.equal(metrics.observe('credits_looted', p, -1), false);
  assert.equal(metrics.observe('credits_looted', p, Number.MAX_SAFE_INTEGER), false);
  assert.equal(dayOf(metrics), undefined);
  p.economyExcluded = true;
  assert.ok(grantSalvage(game, p, 'mire_fibre', 1));
  advance(12_000);
  game.removePlayer(p.id);
  assert.equal(dayOf(metrics), undefined);
});

test('restored snapshot strips unknown identifiers, events and item keys', t => {
  const {file,metrics} = fixture(t);
  metrics.observe('credits_looted', {cls:'keeper',char:{level:8}}, 10);
  assert.ok(metrics.flush());
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.playerId = 'private-id';
  data.days['2026-11-23'].name = 'private-name';
  data.days['2026-11-23'].totals['password'] = 123;
  data.days['2026-11-23'].byDetail = { materials_granted: { __fictional__: 1 } };
  fs.writeFileSync(file, JSON.stringify(data));
  const restored = new EconomyMetrics(file, () => epoch);
  const scrubbed = JSON.stringify(restored.snapshot());
  for (const secret of ['private-id','private-name','password','__fictional__']) assert.equal(scrubbed.includes(secret), false);
  assert.equal(count(dayOf(restored), 'credits_looted'), 10);
});
