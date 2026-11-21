import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MAX_LEVEL, XP_TO_NEXT, CLASSES, ENEMIES } from '../shared/content.js';
import { grantXp, onEnemyKilled, checkDirective } from '../server/sim/progress.js';
import { dealDamage } from '../server/sim/combat.js';
import { resetEnemy } from '../server/sim/ai.js';
import { CharacterStore } from '../server/store.js';
import { makeChar, makeGame, place } from './helpers.js';

const dirFor = () => mkdtempSync(join(tmpdir(), 'attune-prog15-'));

test('character XP has an unmodified early ladder and strictly increasing levels 6–15', () => {
  assert.equal(MAX_LEVEL, 15);
  assert.equal(XP_TO_NEXT.length, MAX_LEVEL);
  assert.deepEqual(XP_TO_NEXT.slice(0, 5), [0, 90, 200, 340, 520]);
  for (let level = 1; level < MAX_LEVEL; level++) {
    assert.ok(Number.isSafeInteger(XP_TO_NEXT[level]) && XP_TO_NEXT[level] > 0);
    if (level > 1) assert.ok(XP_TO_NEXT[level] > XP_TO_NEXT[level - 1]);
  }
});

test('every threshold, cap overflow, primary skill and health progression are server-owned', () => {
  for (const cls of Object.keys(CLASSES)) {
    const game = makeGame(), p = game.addPlayer(makeChar(cls, { level: 5, xp: 0 }));
    const hpAtFive = p.maxHp, skillAtFive = p.stats.skills[CLASSES[cls].primary];
    for (let level = 5; level < MAX_LEVEL; level++) {
      const need = XP_TO_NEXT[level];
      assert.equal(grantXp(game, p, need - 1), need - 1);
      assert.equal(p.char.level, level);
      assert.equal(p.char.xp, need - 1);
      assert.equal(grantXp(game, p, 1), 1);
      assert.equal(p.char.level, level + 1);
      assert.equal(p.char.xp, 0);
      assert.equal(game.sheet(p).level, level + 1);
      assert.equal(game.metaFor(p).l, level + 1);
    }
    assert.equal(p.stats.skills[CLASSES[cls].primary], skillAtFive + 10);
    assert.ok(p.maxHp > hpAtFive);
    assert.equal(grantXp(game, p, 1000000), 0);
    assert.equal(p.char.xp, 0);
  }
});

test('multi-level award credits only earned progress up to the cap', () => {
  const game = makeGame(), p = game.addPlayer(makeChar('vanguard', {level: 14, xp: 3210}));
  const before = p.char.level, need = XP_TO_NEXT[14] - p.char.xp;
  assert.equal(before, 14);
  assert.equal(grantXp(game, p, need + 9999), need);
  assert.equal(p.char.level, 15);
  assert.equal(p.char.xp, 0);
  assert.ok(p.outbox.some(ev => ev.e === 'xp' && ev.a === need));
});

test('malformed awards and impossible live XP state cannot grant levels', () => {
  const game = makeGame(), p = game.addPlayer(makeChar('keeper', {level: 7, xp: 12}));
  for (const invalid of [0, -1, .5, NaN, Infinity, -Infinity, '500', Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(grantXp(game, p, invalid), 0);
    assert.equal(p.char.level, 7);
    assert.equal(p.char.xp, 12);
  }
  p.char.xp = XP_TO_NEXT[7];
  assert.equal(grantXp(game, p, 1), 0);
  p.char.xp = 12;
  p.char.level = -1;
  assert.equal(grantXp(game, p, 1), 0);
});

test('one enemy death credits XP once, including after replay; a later respawn can credit again', () => {
  const game = makeGame(), p = game.addPlayer(makeChar('vanguard', {level: 5}));
  const e = game.enemies.find(enemy => enemy.type === 'skitter');
  place(p, e.x, e.z);
  dealDamage(game, p, e, 100000, 'test');
  assert.equal(e.state, 'dead');
  assert.equal(p.char.xp, ENEMIES.skitter.xp);
  onEnemyKilled(game, e, [p.id, p.id]);
  dealDamage(game, p, e, 100000, 'test');
  assert.equal(p.char.xp, ENEMIES.skitter.xp);
  game.time = e.respawnAt;
  resetEnemy(game, e);
  place(p, e.x, e.z);
  dealDamage(game, p, e, 100000, 'test');
  assert.equal(p.char.xp, ENEMIES.skitter.xp * 2);
});

test('completed directive XP is not awarded twice', () => {
  const game = makeGame(), p = game.addPlayer(makeChar('symbiotech'));
  p.char.quest.progress = 3;
  checkDirective(game, p);
  const credited = p.char.xp;
  assert.equal(credited, 30);
  checkDirective(game, p);
  assert.equal(p.char.xp, credited);
  assert.equal(p.char.directiveReceipts.length, 1);
});

test('level-six progression survives death, disconnect and rejoining the simulation', () => {
  const char = makeChar('symbiotech', {level: 5, xp: 0});
  const game = makeGame(), p = game.addPlayer(char);
  grantXp(game, p, XP_TO_NEXT[5] + 11);
  p.dead = true; p.hp = 0;
  game.removePlayer(p.id);
  const rejoined = makeGame().addPlayer(char);
  assert.equal(rejoined.char.level, 6);
  assert.equal(rejoined.char.xp, 11);
  assert.equal(rejoined.hp, rejoined.maxHp);
});

test('legacy level 4–5 records and earned level 15 persist without a schema change', () => {
  const dir = dirFor();
  try {
    const file = join(dir, 'characters.json'), original = new CharacterStore(file);
    const a = original.create('Legacy Pilot', 'vanguard'), b = original.create('Legacy Scout', 'surveyor');
    a.char.level = 5; a.char.xp = 0;
    b.char.level = 4; b.char.xp = 199;
    original.markDirty(); assert.equal(original.flush(), true);
    const restored = new CharacterStore(file);
    assert.equal(restored.authenticate(a.token)?.level, 5);
    assert.equal(restored.authenticate(b.token)?.xp, 199);
    const game = makeGame(), p = game.addPlayer(restored.authenticate(a.token));
    const earned = XP_TO_NEXT.slice(5).reduce((sum, n) => sum + n, 0);
    assert.equal(grantXp(game, p, earned), earned);
    assert.equal(p.char.level, 15);
    restored.markDirty(); restored.flush();
    const final = new CharacterStore(file);
    assert.equal(final.authenticate(a.token)?.level, 15);
    assert.equal(final.authenticate(a.token)?.xp, 0);
    assert.equal(final.authenticate(b.token)?.level, 4);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('loaded capped XP, over-threshold XP and invalid levels fail closed', () => {
  const dir = dirFor();
  try {
    const file = join(dir, 'characters.json'), original = new CharacterStore(file);
    const a = original.create('Invalid Level', 'vanguard');
    const b = original.create('Over Threshold', 'keeper');
    const c = original.create('Capped Pilot', 'surveyor');
    original.flush();
    const data = JSON.parse(readFileSync(file, 'utf8'));
    for (const row of data.characters) {
      if (row.id === a.char.id) { row.level = 99; row.xp = 9999; }
      if (row.id === b.char.id) { row.level = 7; row.xp = XP_TO_NEXT[7]; }
      if (row.id === c.char.id) { row.level = 15; row.xp = 200; }
    }
    writeFileSync(file, JSON.stringify(data));
    const recovered = new CharacterStore(file);
    assert.deepEqual([recovered.authenticate(a.token).level, recovered.authenticate(a.token).xp], [1, 0]);
    assert.deepEqual([recovered.authenticate(b.token).level, recovered.authenticate(b.token).xp], [7, 0]);
    assert.deepEqual([recovered.authenticate(c.token).level, recovered.authenticate(c.token).xp], [15, 0]);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('account ownership remains isolated after saving level 15', async () => {
  const dir = dirFor();
  try {
    const file = join(dir, 'characters.json'), store = new CharacterStore(file);
    const one = await store.registerAccount('progressone', 'LongPasswordForTesting1!');
    const two = await store.registerAccount('progresstwo', 'LongPasswordForTesting2!');
    assert.ok(one.account && two.account);
    const owned = store.createForAccount(one.account, 'Progress One', 'keeper').char;
    const other = store.createForAccount(two.account, 'Progress Two', 'vanguard').char;
    owned.level = 15; owned.xp = 0;
    store.markDirty(); store.flush();
    const loaded = new CharacterStore(file);
    const accountOne = loaded.authenticateAccount(one.token);
    const accountTwo = loaded.authenticateAccount(two.token);
    assert.equal(loaded.listCharacters(accountOne)[0].level, 15);
    assert.deepEqual(loaded.listCharacters(accountTwo).map(c => c.id), [other.id]);
    assert.ok(loaded.deleteOwned(accountTwo, owned.id, owned.name).error);
    assert.equal(loaded.authenticate(owned.id), null);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
