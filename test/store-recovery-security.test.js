import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CharacterStore } from '../server/store.js';

function isolatedSave(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attunement-p13-recovery-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'characters.json');
}

test('a missing primary with a retained backup refuses empty-world startup', (t) => {
  const file = isolatedSave(t);
  const store = new CharacterStore(file);
  const { char, token } = store.create('BackupHero', 'vanguard');
  store.flush();
  char.credits = 21;
  store.markDirty();
  store.flush();
  const backup = fs.readFileSync(file + '.bak', 'utf8');
  fs.unlinkSync(file);

  assert.throws(() => new CharacterStore(file), /recovery is required/);
  assert.equal(fs.existsSync(file), false, 'no replacement primary was created');
  assert.equal(fs.readFileSync(file + '.bak', 'utf8'), backup, 'backup remains intact');
  assert.equal(new CharacterStore(file + '.bak').authenticate(token).credits, 0);
});

test('damaged, duplicate and orphaned identities never silently disappear on load', (t) => {
  const file = isolatedSave(t);
  const store = new CharacterStore(file);
  const { char, token } = store.create('Preserved', 'vanguard');
  store.flush();
  const valid = JSON.parse(fs.readFileSync(file, 'utf8'));
  const original = valid.characters[0];

  const cases = [
    { name: 'invalid character', mutate: d => d.characters.push({ id: 'missing-identity' }) },
    { name: 'duplicate character ID', mutate: d => d.characters.push({ ...original, name: 'Another' }) },
    { name: 'duplicate character name', mutate: d => d.characters.push({ ...original, id: 'another-id' }) },
    { name: 'duplicate recovery token', mutate: d => d.characters.push({ ...original, id: 'another-id', name: 'Another' }) },
    { name: 'orphaned account character', mutate: d => d.characters.push({ ...original, id: 'another-id', name: 'Another', tokenHash: null, accountId: 'missing-account' }) },
    { name: 'invalid account record', mutate: d => d.accounts.push({ id: 'broken', handle: 'Owner' }) },
    { name: 'unsupported future format', mutate: d => { d.version = 100; } },
  ];

  for (const scenario of cases) {
    const candidate = structuredClone(valid);
    scenario.mutate(candidate);
    const damaged = JSON.stringify(candidate);
    fs.writeFileSync(file, damaged);
    assert.throws(() => new CharacterStore(file), /recovery is required/, scenario.name);
    assert.equal(fs.readFileSync(file, 'utf8'), damaged, scenario.name + ': source remains untouched');
  }
  fs.writeFileSync(file, JSON.stringify(valid));
  assert.equal(new CharacterStore(file).authenticate(token).id, char.id);
});

test('interrupted final rename preserves prior save and permits a later retry', (t) => {
  const file = isolatedSave(t);
  const store = new CharacterStore(file);
  const { char, token } = store.create('RetryHero', 'vanguard');
  store.flush();
  const previous = fs.readFileSync(file, 'utf8');

  char.credits = 67;
  store.markDirty();
  const realRename = fs.renameSync;
  fs.renameSync = (from, to, ...rest) => {
    if (from === file + '.tmp' && to === file) {
      const fault = new Error('injected final rename failure');
      fault.code = 'EIO';
      throw fault;
    }
    return realRename(from, to, ...rest);
  };
  try {
    assert.throws(() => store.flush(), /injected final rename failure/);
  } finally {
    fs.renameSync = realRename;
  }

  assert.equal(store.dirty, true, 'failed flush remains pending');
  assert.equal(fs.readFileSync(file, 'utf8'), previous, 'previous primary is not replaced');
  assert.equal(fs.readFileSync(file + '.bak', 'utf8'), previous, 'prior snapshot remains recoverable');
  assert.equal(store.flush(), true, 'a subsequent flush retries successfully');
  assert.equal(new CharacterStore(file).authenticate(token).credits, 67);
});


test('observational benchmark: synchronous 500-character snapshots', (t) => {
  const file = isolatedSave(t);
  const store = new CharacterStore(file);
  for (let i = 0; i < 500; i++) {
    const suffix = String.fromCharCode(65 + Math.floor(i / 26), 65 + i % 26);
    assert.ok(store.create('Bench' + suffix, 'vanguard').char);
  }
  assert.equal(store.flush(), true);
  const bytes = fs.statSync(file).size;
  const samples = [];
  const character = store.byName.get('benchaa');
  for (let i = 0; i < 7; i++) {
    character.credits = i + 1;
    store.markDirty();
    const start = performance.now();
    assert.equal(store.flush(), true);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  // Observational only: CI runner latency is not a production SLO.
  console.info('[store-perf] characters=500 bytes=' + bytes +
    ' medianMs=' + samples[3].toFixed(2) + ' pMaxMs=' + samples[6].toFixed(2));
});


test('duplicate session hashes across different accounts cannot authorize the wrong owner', async (t) => {
  const file = isolatedSave(t);
  const store = new CharacterStore(file);
  assert.ok((await store.registerAccount('AccountOne', 'StrongPasswordForAccountOne!')).account);
  assert.ok((await store.registerAccount('AccountTwo', 'StrongPasswordForAccountTwo!')).account);
  store.flush();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  saved.accounts[1].sessions[0] = saved.accounts[0].sessions[0];
  const source = JSON.stringify(saved);
  fs.writeFileSync(file, source);
  assert.throws(() => new CharacterStore(file), /duplicate account session: recovery is required/);
  assert.equal(fs.readFileSync(file, 'utf8'), source);
});


test('first-save rename interruption retains the only recoverable checkpoint', (t) => {
  const file = isolatedSave(t);
  const store = new CharacterStore(file);
  const { token } = store.create('FirstCheckpoint', 'vanguard');
  // The first flush has no live file or .bak to fall back to.
  const realRename = fs.renameSync;
  fs.renameSync = (from, to, ...rest) => {
    if (from === file + '.tmp' && to === file) {
      const error = new Error('injected first-save rename interruption');
      error.code = 'EIO';
      throw error;
    }
    return realRename(from, to, ...rest);
  };
  try {
    assert.throws(() => store.flush(), /injected first-save rename interruption/);
  } finally {
    fs.renameSync = realRename;
  }
  assert.equal(fs.existsSync(file), false, 'first primary was never committed');
  assert.equal(fs.existsSync(file + '.bak'), false, 'no previous save was present');
  const checkpoint = fs.readFileSync(file + '.tmp', 'utf8');
  assert.equal(JSON.parse(checkpoint).characters.length, 1);
  assert.throws(() => new CharacterStore(file), /recovery is required/,
    'startup must not silently begin a fresh world with a recoverable temp file');
  assert.equal(fs.readFileSync(file + '.tmp', 'utf8'), checkpoint,
    'failed startup leaves the only checkpoint untouched');

  // Explicit operator restoration, not automatic fallback to an unverified file.
  fs.renameSync(file + '.tmp', file);
  assert.equal(new CharacterStore(file).authenticate(token)?.name, 'FirstCheckpoint');
});

test('stale unreadable temp-only store blocks startup without destroying evidence', (t) => {
  const file = isolatedSave(t);
  fs.writeFileSync(file + '.tmp', '{ incomplete checkpoint');
  assert.throws(() => new CharacterStore(file), /recovery is required/);
  assert.equal(fs.readFileSync(file + '.tmp', 'utf8'), '{ incomplete checkpoint');
});
