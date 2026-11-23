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
