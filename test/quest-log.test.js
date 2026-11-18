import test from 'node:test';
import assert from 'node:assert/strict';
import {questLog} from '../client/src/quest-log.js';
const sheet=(cls='vanguard',step=0,progress=0,survey=null,brineStage=0)=>({cls,quest:{step,progress},survey,brineStage});
test('journal shows only discovered/current and completed objectives for each profession',()=>{
 for(const cls of ['vanguard','symbiotech','surveyor','keeper']){
  const log=questLog(sheet(cls,1,20));
  assert.equal(log.filter(q=>q.status==='completed').length,1);
  assert.equal(log.filter(q=>q.status==='active').length,1);
  assert.equal(log.filter(q=>q.status==='available').length,1);
  assert.ok(!log.some(q=>q.title==='The Vault Warden'));
  assert.equal(log[1].id,'directive:calibrate');
  assert.ok(log[0].rewards.includes('30 XP'));
  assert.equal(log[0].rewards.length,2);
  assert.equal(log[1].rewards.length,1);
 }
 assert.equal(questLog(sheet('surveyor'))[0].title,'Instrument Commissioning');
 assert.equal(questLog(sheet('keeper'))[0].title,'Phase Calibration');
 assert.equal(questLog(sheet('keeper',0,50))[0].progress,'2 / 2 successful strikes');
 assert.deepEqual(questLog(sheet('constructor')),[]);
 assert.deepEqual(questLog(sheet('vanguard',999)),[]);
});
test('field investigation and commissioning reflect the authoritative state without future entries',()=>{
 const active=questLog(sheet('vanguard',0,0,'ledger'));
 assert.equal(active.find(q=>q.id==='brine:investigation').title,'Names on the Ledger');
 assert.deepEqual(active.find(q=>q.id==='brine:investigation').rewards,['35 XP','Access to Brineworks commissioning']);
 assert.ok(!active.some(q=>q.id==='brine:commissioning'));
 const reported=questLog(sheet('vanguard',1,0,'ledger_done',2),{ms:18000,read:0});
 assert.equal(reported.find(q=>q.id==='brine:investigation').status,'completed');
 assert.match(reported.find(q=>q.id==='brine:commissioning').text,/LIVE TEST/);
 assert.ok(reported.find(q=>q.id==='brine:commissioning').rewards.includes('55 XP'));
 assert.ok(reported.find(q=>q.id==='brine:commissioning').rewards.includes('Shelter Rescue Lattice'));
 const complete=questLog(sheet('keeper',7,0,'signal_done',3));
 assert.equal(complete.length,9);
 assert.ok(complete.every(q=>q.status==='completed'));
});
