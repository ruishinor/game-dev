import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sanitizeFieldReceipts,fieldReceiptProjection} from '../server/sim/field-receipts.js';
import {CharacterStore} from '../server/store.js';
import {questLog} from '../client/src/quest-log.js';
const char={cls:'vanguard',quest:{step:0,progress:0},survey:'ledger_done',brineStage:3,traceState:'recorder_done',riftCalibration:'completed'};
const raw={investigation:{xp:35},commissioning:{xp:0,item:'brine_rescue_lattice'},traces:{xp:55,material:'kinetic_coupler'},calibration:true};
test('field receipts are bounded by completed state, actual route and reward amounts',()=>{
 assert.deepEqual(sanitizeFieldReceipts(raw,char),raw);
 assert.deepEqual(sanitizeFieldReceipts(raw,{...char,survey:'ledger',brineStage:0,traceState:'briefed',riftCalibration:'recorded'}),{});
 assert.deepEqual(sanitizeFieldReceipts({investigation:{xp:36},commissioning:{xp:0,item:'brine_phase_filter'},traces:{xp:-1,material:'kinetic_coupler'},calibration:'true'},char),{});
 assert.deepEqual(fieldReceiptProjection(char),[]);
 assert.equal(fieldReceiptProjection({...char,fieldReceipts:raw}).length,4);
 assert.deepEqual(questLog({...char,survey:'ledger',fieldRewardReceipts:fieldReceiptProjection({...char,fieldReceipts:raw})}).find(q=>q.id==='brine:investigation').received,undefined);
});
test('valid field receipt history survives storage without inventing legacy rewards',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attune-field-receipt-'));
 try{
  const file=path.join(dir,'characters.json'),store=new CharacterStore(file),a=store.create('Field Record','vanguard'),b=store.create('Old Record','vanguard');
  Object.assign(a.char,char,{fieldReceipts:raw});Object.assign(b.char,char);
  store.markDirty();store.flush();
  const loaded=new CharacterStore(file);
  assert.deepEqual(loaded.authenticate(a.token).fieldReceipts,raw);
  assert.deepEqual(loaded.authenticate(b.token).fieldReceipts,{});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
