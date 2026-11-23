import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CharacterStore } from '../server/store.js';

test('each durable flush preserves the prior complete save for manual recovery', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attunement-backup-'));
  const file=path.join(dir,'characters.json');
  try {
    const store=new CharacterStore(file);
    const created=store.create('Checkpoint','vanguard');
    assert.ok(created.char);
    assert.equal(store.flush(),true);
    assert.equal(fs.existsSync(file+'.bak'),false,'no previous snapshot on first save');
    const previous=fs.readFileSync(file);
    created.char.credits=37;
    store.markDirty();
    assert.equal(store.flush(),true);
    assert.deepEqual(fs.readFileSync(file+'.bak'),previous,'backup contains prior persisted snapshot');
    const latest=new CharacterStore(file);
    assert.equal(latest.authenticate(created.token).credits,37);
    const old=new CharacterStore(file+'.bak');
    assert.equal(old.authenticate(created.token).credits,0);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('malformed JSON and malformed structures block startup without moving original save', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attunement-corrupt-'));
  const file=path.join(dir,'characters.json');
  try {
    for(const body of ['{broken', '{}', '{"characters":{}}', '{"accounts":[]}']) {
      // The old code treated malformed-but-valid JSON as an empty world.
      // A valid empty accounts array remains compatible with legacy saves.
      if(body==='{"accounts":[]}') {
        fs.writeFileSync(file,body);
        assert.equal(new CharacterStore(file).chars.size,0);
        continue;
      }
      fs.writeFileSync(file,body);
      assert.throws(()=>new CharacterStore(file),/recovery is required/);
      assert.equal(fs.readFileSync(file,'utf8'),body);
    }
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
