import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {MAX_LEVEL,XP_TO_NEXT,ITEMS} from '../shared/content.js';
import {sanitizeDirectiveReceipts} from '../shared/directive-receipts.js';
import {checkDirective,equipItem} from '../server/sim/progress.js';
import {CharacterStore} from '../server/store.js';
import {questLog} from '../client/src/quest-log.js';
import {makeGame,makeChar} from './helpers.js';

test('directive receipts reflect actual rewards, cap overflow, duplicate ownership and replay',()=>{
 const g=makeGame(),c=makeChar('vanguard',{level:MAX_LEVEL-1,xp:XP_TO_NEXT[MAX_LEVEL-1]-5,
  inventory:['servo_harness'],quest:{step:0,progress:3}});
 const p=g.addPlayer(c),other=g.addPlayer(makeChar('vanguard'));
 assert.equal(c.level,MAX_LEVEL);assert.equal(c.xp,0);
 assert.deepEqual(c.directiveReceipts,[{id:'field_trial',xp:5,item:null}]);
 assert.deepEqual(p.outbox.filter(e=>e.e==='xp').map(e=>e.a),[5]);
 assert.deepEqual(questLog(g.sheet(p))[0].received,['5 XP credited','No additional item granted']);
 assert.deepEqual(g.sheet(other).directiveReceipts,[]);
 assert.ok(equipItem(g,p,'servo_harness').ok);
 assert.deepEqual(c.directiveReceipts[1],{id:'calibrate',xp:0,item:'kinetic_capacitor'});
 assert.deepEqual(questLog(g.sheet(p))[1].received,[ITEMS.kinetic_capacitor.name]);
 assert.ok(equipItem(g,p,'kinetic_capacitor').ok);
 assert.deepEqual(c.directiveReceipts[2],{id:'integrate',xp:0,item:null});
 assert.deepEqual(questLog(g.sheet(p))[2].received,['0 XP credited']);
 checkDirective(g,p);assert.equal(c.directiveReceipts.length,3);
 assert.equal(c.inventory.filter(id=>id==='kinetic_capacitor').length,1);
});

test('receipt history persists; legacy and invalid data cannot invent or replay grants',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attunement-directive-'));
 try{
  const file=path.join(dir,'characters.json'),store=new CharacterStore(file);
  const {char,token}=store.create('Receipt Tester','vanguard');
  char.quest={step:0,progress:3};
  const g=makeGame(),p=g.addPlayer(char);
  assert.deepEqual(char.directiveReceipts,[{id:'field_trial',xp:30,item:'servo_harness'}]);
  g.removePlayer(p.id);store.markDirty();assert.ok(store.flush());
  const restored=new CharacterStore(file).authenticate(token);
  const g2=makeGame(),player=g2.addPlayer(restored);
  assert.deepEqual(questLog(g2.sheet(player))[0].received,['30 XP credited',ITEMS.servo_harness.name]);
  assert.equal(restored.inventory.filter(id=>id==='servo_harness').length,1);
  const legacy=makeChar('vanguard',{quest:{step:1,progress:0}});
  assert.equal(questLog(g2.sheet(g2.addPlayer(legacy)))[0].received,undefined);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 const valid={id:'field_trial',xp:30,item:'servo_harness'};
 assert.deepEqual(sanitizeDirectiveReceipts([valid,valid,{id:'calibrate',xp:0,item:'kinetic_capacitor'}],'vanguard',1),[valid]);
 assert.deepEqual(sanitizeDirectiveReceipts([{...valid,xp:31},{...valid,item:'sporeglass_focus'},{...valid,xp:-1},{id:'constructor',xp:0,item:null}],'vanguard',1),[]);
 assert.deepEqual(sanitizeDirectiveReceipts([valid],'vanguard',0),[]);
 assert.deepEqual(sanitizeDirectiveReceipts(undefined,'vanguard',1),[]);
});
