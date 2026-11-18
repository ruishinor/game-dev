import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {CREDIT_CAP,sanitizeCredits,walletAfter} from '../server/sim/wallet.js';
import {CharacterStore} from '../server/store.js';
import {makeGame} from './helpers.js';
test('wallet uses bounded integer arithmetic and rejects malformed or insufficient transactions',()=>{
 assert.equal(sanitizeCredits(undefined),0);assert.equal(sanitizeCredits(-1),0);
 assert.equal(sanitizeCredits('25'),0);assert.equal(sanitizeCredits(CREDIT_CAP+1),CREDIT_CAP);
 assert.equal(walletAfter(20,5),25);assert.equal(walletAfter(20,-20),0);
 for(const [a,b] of [[0,-1],[CREDIT_CAP,1],[0,1.1],[0,Infinity],[-1,5],['10',1],[CREDIT_CAP+1,-1]])assert.equal(walletAfter(a,b),null);
});
test('wallet migrates old saves, persists and is only in the owning sheet',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attune-wallet-')),file=path.join(dir,'characters.json');
 try{
  const store=new CharacterStore(file),{char,token}=store.create('Credit Tester','vanguard');
  assert.equal(char.credits,0);char.credits=37;store.markDirty();store.flush();
  const restored=new CharacterStore(file).authenticate(token);assert.equal(restored.credits,37);
  const game=makeGame(),p=game.addPlayer(restored);
  assert.equal(game.sheet(p).credits,37);
  assert.equal(Object.hasOwn(game.metaFor(p),'credits'),false);
  assert.ok(game.buildRows().every(row=>!Object.hasOwn(row,'credits')));
  const previous=JSON.parse(fs.readFileSync(file,'utf8'));delete previous.characters[0].credits;fs.writeFileSync(file,JSON.stringify(previous));
  assert.equal(new CharacterStore(file).authenticate(token).credits,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
