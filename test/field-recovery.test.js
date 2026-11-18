import test from 'node:test';import assert from 'node:assert/strict';
import {Game} from '../server/sim/game.js';
import {makeChar,place} from './helpers.js';
import {interact,craftRecipe} from '../server/sim/progress.js';
import {recoverField} from '../server/sim/recovery.js';
import {recoveryRank} from '../shared/recovery.js';
import {previewRecipe,previewProduction} from '../shared/crafting.js';
import {CharacterStore} from '../server/store.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
function fixture(){
 let now=1700000000000;const g=new Game({wallNow:()=>now}),p=g.addPlayer(makeChar('keeper')),o=g.objects.find(x=>x.type==='sinter_recovery');
 assert.ok(o);return {g,p,o,advance:()=>{now+=45000;}};
}
test('nonlethal recovery is range, ownership, combat, cooldown and capacity gated; mastery is bounded',()=>{
 const {g,p,o,advance}=fixture(),before=g.enemies.map(e=>[e.id,e.hp,e.state]),xp=p.char.xp;
 assert.equal(interact(g,p,o.id).ok,false);place(p,o.x,o.z-1.5);
 p.dead=true;assert.equal(interact(g,p,o.id).ok,false);p.dead=false;
 p.combatUntil=g.time+1;assert.equal(interact(g,p,o.id).ok,false);p.combatUntil=0;
 assert.equal(recoverField(g,p,{...o}).ok,false);
 assert.ok(interact(g,p,o.id).ok);assert.equal(p.char.materials.sinter_flake,1);
 assert.equal(interact(g,p,o.id).ok,false);assert.equal(g.sheet(p).recoverySamples,1);assert.ok(g.privateState(p).recoveryMs>0);
 assert.equal(Object.hasOwn(g.sheet(p),'recoveryReadyAt'),false);
 const other=g.addPlayer(makeChar('vanguard'));place(other,o.x,o.z-1.5);assert.ok(interact(g,other,o.id).ok);
 for(let i=0;i<4;i++){advance();assert.ok(interact(g,p,o.id).ok);}
 assert.equal(p.char.recoverySamples,3);assert.equal(recoveryRank(p.char.recoverySamples),2);assert.equal(p.char.materials.sinter_flake,5);
 advance();p.char.materials.sinter_flake=99;const ready=p.char.recoveryReadyAt;assert.equal(interact(g,p,o.id).ok,false);assert.equal(p.char.recoveryReadyAt,ready);
 assert.equal(p.char.xp,xp);assert.deepEqual(g.enemies.map(e=>[e.id,e.hp,e.state]),before);
});
test('rank unlock lets every class fabricate an alternate utility recipe at an authorized workshop',()=>{
 const {g,p}=fixture();p.char.materials={sinter_flake:3,sentinel_alloy:1};p.char.recoverySamples=2;
 place(p,0,0);assert.equal(previewRecipe(p.char,'recovery_maintenance').ok,false);
 assert.match(previewProduction(p.char,'recovery_maintenance',2).reason,/Field Recovery rank 2/);
 assert.equal(craftRecipe(g,p,'recovery_maintenance',p.utilityRev).ok,false);
 p.char.recoverySamples=3;assert.ok(previewRecipe(p.char,'recovery_maintenance').ok);
 assert.ok(previewProduction(p.char,'recovery_maintenance',2).ok);
 const rev=p.utilityRev;assert.ok(craftRecipe(g,p,'recovery_maintenance',rev).ok);
 assert.deepEqual(p.char.materials,{sinter_flake:1});assert.equal(p.char.goods.field_maintenance_kit,2);
 assert.equal(craftRecipe(g,p,'recovery_maintenance',rev).ok,false);
});
test('mastery and bounded cooldown survive saves; legacy records default safely',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attune-recovery-')),file=path.join(dir,'save.json');
 try{const store=new CharacterStore(file),{char,token}=store.create('Field Tester','keeper');assert.equal(char.recoverySamples,0);assert.equal(char.recoveryReadyAt,0);
 char.recoverySamples=2;char.recoveryReadyAt=Date.now()+40000;char.materials={sinter_flake:2};store.markDirty();store.flush();
 const loaded=new CharacterStore(file).authenticate(token);assert.equal(loaded.recoverySamples,2);assert.ok(loaded.recoveryReadyAt>Date.now());assert.deepEqual(loaded.materials,{sinter_flake:2});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
