import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MAX_LEVEL, XP_TO_NEXT } from '../shared/content.js';
import { grantXp } from '../server/sim/progress.js';
import { CharacterStore } from '../server/store.js';
import { makeChar, makeGame } from './helpers.js';

test('character progression has fifteen real server-owned levels with an unchanged early curve', () => {
  assert.equal(MAX_LEVEL, 15);
  assert.equal(XP_TO_NEXT.length, MAX_LEVEL);
  assert.deepEqual(XP_TO_NEXT.slice(0, 5), [0, 90, 200, 340, 520]);
  for (let level = 1; level < MAX_LEVEL; level += 1) {
    assert.ok(Number.isSafeInteger(XP_TO_NEXT[level]) && XP_TO_NEXT[level] > 0);
    if (level > 1) assert.ok(XP_TO_NEXT[level] > XP_TO_NEXT[level - 1]);
  }
});

test('a previously capped level-five character earns levels 6–15; XP and derived stats are authoritative', () => {
  const g = makeGame();
  const p = g.addPlayer(makeChar('vanguard', { level: 5, xp: 0 }));
  const hpAtFive = p.maxHp;
  const skillAtFive = p.stats.skills.kinetics;
  let expected = 5;
  for (let level = 5; level < 15; level += 1) {
    const need = XP_TO_NEXT[level];
    assert.equal(grantXp(g, p, need - 1), need - 1);
    assert.equal(p.char.level, level, 'partial XP must not grant a level');
    assert.equal(p.char.xp, need - 1);
    assert.equal(grantXp(g, p, 1), 1);
    expected += 1;
    assert.equal(p.char.level, expected);
    assert.equal(p.char.xp, 0, 'the exact threshold must not carry an incorrect remainder');
  }
  assert.equal(p.char.level, MAX_LEVEL);
  assert.ok(p.maxHp > hpAtFive);
  assert.equal(p.stats.skills.kinetics, skillAtFive + 10);
  assert.equal(grantXp(g, p, 1000), 0, 'XP must not exceed the actual cap');
  assert.equal(p.char.xp, 0);
});

test('legacy level-five saves retain progression and newly earned level fifteen survives a disk round trip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'attunement-level15-'));
  try {
    const path = join(dir, 'characters.json');
    const initial = new CharacterStore(path);
    const made = initial.create('LevelRunner', 'vanguard');
    assert.ok(made.char);
    made.char.level = 5;
    made.char.xp = 0;
    initial.markDirty();
    assert.equal(initial.flush(), true);

    const legacy = new CharacterStore(path);
    const recovered = legacy.authenticate(made.token);
    assert.ok(recovered, 'original character bearer token must keep working');
    assert.equal(recovered.level, 5);
    recovered.level = 15;
    recovered.xp = 0;
    legacy.markDirty();
    assert.equal(legacy.flush(), true);

    const next = new CharacterStore(path);
    assert.equal(next.authenticate(made.token)?.level, 15);
    assert.equal(next.authenticate(made.token)?.xp, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('level fifteen is a character cap, not a fabricated attunement rank ladder', () => {
  // Distinguish XP level and discovered affinities until explicit rank mechanics exist.
  assert.equal(MAX_LEVEL, 15);
  assert.ok(XP_TO_NEXT[14] > XP_TO_NEXT[5]);
});
