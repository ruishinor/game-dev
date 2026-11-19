// Transit rule (owner, 2026-11-19): any teleport or change of area dismisses
// the active companion; buffs are not companions and are not removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, makeChar, place, travelToAnnex } from './helpers.js';
import { interact } from '../server/sim/progress.js';
import { manageCompanion } from '../server/sim/companion.js';
import { addBuff } from '../server/sim/combat.js';
import { inRiftAnnex, inSeverancePocket } from '../shared/world.js';

function annexReady(game) {
  const p = game.addPlayer(makeChar('symbiotech', { level: 3, attunements: ['resonance'], riftCalibration: 'completed' }));
  game.rift.phase = 'stabilized';
  return p;
}

test('transit: entering and leaving the Phase Annex dismisses the companion and keeps buffs', async () => {
  const g = makeGame();
  const p = annexReady(g);
  assert.ok(p.companion, 'the Mender is active before travel');
  const c = p.companion;
  const until = g.time + 60000;
  addBuff(p, { k: 'ward', until, absorb: 0.2 });
  addBuff(p, { k: 'bond', until, src: c.id, dr: 0.1 });
  const before = p.buffs.map((b) => ({ ...b }));
  assert.ok((await travelToAnnex(g, p)).ok);
  assert.ok(inRiftAnnex(p.x, p.z));
  assert.equal(p.companion, null, 'companion dismissed on entry');
  assert.equal(g.ents.has(c.id), false, 'companion entity removed from the world');
  assert.equal(p.char.companionDismissed, true);
  assert.deepEqual(p.buffs, before, 'transit removes no buff');
  // re-summoned inside, then dismissed again on the way out
  assert.ok(manageCompanion(g, p, 'summon').ok);
  const inside = p.companion;
  place(p, g.rift.exit.x, g.rift.exit.z - 1.7);
  assert.ok(interact(g, p, g.rift.exit.id).ok);
  assert.ok(!inRiftAnnex(p.x, p.z));
  assert.ok(inSeverancePocket(p.x, p.z), 'the Annex returns travellers to the Severance Gate');
  assert.equal(p.companion, null, 'companion dismissed on exit');
  assert.equal(g.ents.has(inside.id), false);
});

test('transit: respawn dismisses the companion; it can be summoned again and nothing owned is lost', () => {
  const g = makeGame();
  const p = g.addPlayer(makeChar('symbiotech'));
  const c = p.companion;
  assert.ok(c);
  const name = c.name;
  p.dead = true;
  p.deadAt = g.time;
  g.time += 3000;
  assert.ok(g.respawn(p));
  assert.equal(p.companion, null);
  assert.equal(g.ents.has(c.id), false);
  assert.ok(manageCompanion(g, p, 'summon').ok, 'summon works after transit');
  assert.equal(p.companion.name, name, 'the same companion returns');
});

test('transit: a player without an active companion travels unchanged', () => {
  const g = makeGame();
  const p = annexReady(g);
  assert.ok(manageCompanion(g, p, 'dismiss').ok);
  place(p, g.rift.entry.x, g.rift.entry.z - 3.6);
  assert.ok(interact(g, p, g.rift.entry.id).ok);
  assert.equal(p.companion, null);
});


test('guard-bound companion transit preserves buff records for the remote host',()=>{
  const g=makeGame(),p=annexReady(g),q=g.addPlayer(makeChar('vanguard'));
  const c=p.companion;
  c.mode='guard';c.host=q.id;
  addBuff(q,{k:'bond',until:g.time+60000,src:c.id,dr:.1});
  const before=q.buffs.map(b=>({...b}));
  g.transit(p,20,20);
  assert.equal(p.companion,null);
  assert.deepEqual(q.buffs,before);
  const saved={...p.char};g.removePlayer(p.id);
  assert.equal(g.addPlayer(saved).companion,null,'dismissal persists across reconnect');
});
