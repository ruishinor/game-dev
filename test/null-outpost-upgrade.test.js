import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeGame,makeChar,place,isolate} from './helpers.js';
import {dealDamage} from '../server/sim/combat.js';
import {distributeCorpseLoot} from '../server/sim/loot.js';
import {NULL_BLUEPRINT_POOL} from '../server/sim/loot-tables.js';
import {GOODS} from '../shared/goods.js';
import {RIFT_ANNEX,travelRegionAt} from '../shared/world.js';
import {EXPEDITION_OUTPOST,OUTPOST_COLLIDERS,EXPEDITION_DEFENDERS} from '../shared/severance-gate.js';
import {OUTPOST_AGGRO_RADIUS} from '../server/sim/outpost-defense.js';
import {createExpeditionOutpost} from '../client/src/severance-outpost.js';

test('Null Chamber has two bounded mixed patrols, different soldier weapons and affinities',()=>{
 const g=makeGame();g.openAnnex();
 const squads=g.enemies.filter(e=>e.nullAnnex&&Number.isInteger(e.nullSquad));
 assert.equal(new Set(squads.map(e=>e.nullSquad)).size,2);
 for(const id of [0,1]){
  const group=squads.filter(e=>e.nullSquad===id);
  assert.equal(group.length,4);
  assert.ok(group.filter(e=>e.type==='severance_soldier').length>=2);
  assert.ok(group.some(e=>e.type==='sentinel'));
  assert.ok(group.every(e=>e.patrol&&e.route.length>=4));
  assert.ok(group.every(e=>e.route.every(point=>point.x>RIFT_ANNEX.x-12&&point.x<RIFT_ANNEX.x+12&&point.z<-9&&point.z>-34)));
  assert.ok(group.some(e=>e.nullBlueprintSource));
 }
 const soldiers=squads.filter(e=>e.type==='severance_soldier');
 assert.ok(new Set(soldiers.map(e=>e.affinity)).size>=3);
 assert.ok(soldiers.some(e=>e.combatDef.attack.kind==='bolt'));
 assert.ok(soldiers.some(e=>e.combatDef.attack.kind==='melee'));
 assert.equal(g.enemies.filter(e=>e.annexEncounter&&e.type==='warden').length,1);
});

test('ten Rare blueprints, two independently guaranteed random Null captain drops',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard',{level:15,goods:{}}));
 place(p,RIFT_ANNEX.x,-25);g.openAnnex();
 assert.equal(NULL_BLUEPRINT_POOL.length,10);
 assert.equal(new Set(NULL_BLUEPRINT_POOL).size,10);
 assert.ok(NULL_BLUEPRINT_POOL.every(id=>GOODS[id]?.rarity==='Rare'));
 const captains=g.enemies.filter(e=>e.nullBlueprintSource);
 assert.equal(captains.length,2);
 const rolls=[.21,.76];let i=0;g.blueprintRng=()=>rolls[Math.min(i++,1)];
 const recovered=[];
 for(const e of captains){
  e.state='dead';e.deadAt=g.time;
  distributeCorpseLoot(g,e,[p.id]);
  const entries=e.lootByPlayer.get(p.id);
  assert.ok(entries?.some(x=>x.id==='credits'&&x.quantity>=3));
  assert.ok(entries?.some(x=>x.kind==='goods'&&NULL_BLUEPRINT_POOL.includes(x.id)));
  recovered.push(entries.find(x=>NULL_BLUEPRINT_POOL.includes(x.id)).id);
 }
 assert.notEqual(recovered[0],recovered[1]);
});

test('outpost has exactly three shelters and two non-colliding Stillpoint follower sites',()=>{
 const OP=EXPEDITION_OUTPOST;
 assert.equal(OP.auxiliaryShelters.length+1,3);
 assert.equal(OP.stillpointFollowers.length,2);
 assert.equal(OUTPOST_COLLIDERS.filter(c=>c.type==='outpost_shelter_post').length,8);
 const group=new THREE.Group(),model=createExpeditionOutpost(THREE,{group,ground:()=>0});
 try{
  model.update(.01,1,{x:OP.x,z:OP.z});
  assert.equal(model.stats().shelters,3);
  for(const site of OP.auxiliaryShelters)assert.ok(group.getObjectByName('severance-outpost:shelter-'+site.key));
 }finally{model.dispose();}
});

test('six Expanse Wardens, one Halo officer, only attack enemies within 25m',()=>{
 const guards=EXPEDITION_DEFENDERS;
 assert.equal(guards.filter(g=>g.type==='outpost_warden').length,6);
 assert.equal(guards.filter(g=>g.type==='outpost_commander').length,1);
 assert.equal(OUTPOST_AGGRO_RADIUS,25);
 assert.ok(new Set(guards.map(g=>g.affinity)).size>=3);
 assert.ok(guards.filter(g=>g.name.includes('Pair')).length>=4);
 const g=makeGame();g.openExpanse();
 assert.equal(g.objects.filter(o=>o.outpostDefender).length,7);
});

test('warden finishing blow suppresses *all* tagged-player XP, loot and quest rewards',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard',{level:8,credits:0}));
 g.openExpanse();
 const target=g.enemies.find(e=>e.type==='severance_soldier');
 assert.ok(target);
 isolate(g,target);
 const guard=g.objects.find(o=>o.type==='outpost_warden');
 // This security post sits west of the outpost: both participants can engage
 // outside the safe camp perimeter without interference from other enemies.
 place(target,guard.x-5,guard.z);
 target.home={x:target.x,z:target.z};target.patrol=false;target.route=null;
 place(p,guard.x-10,guard.z);
 assert.equal(travelRegionAt(target.x,target.z),'severance_expanse');
 assert.ok(dealDamage(g,p,target,5,'auto',{flat:true})>0,'the player has tagged this hostile');
 assert.ok(target.threat.has(p.id));
 target.hp=30; // the following legal guardian shot is lethal
 const startXp=p.char.xp,startCredits=p.char.credits;
 g.tick(50);
 assert.equal(target.state,'dead');
 assert.equal(p.char.xp,startXp);
 assert.equal(p.char.credits,startCredits);
 assert.ok(!target.lootByPlayer?.has(p.id),'no corpse rewards for tagging an NPC kill');
 assert.equal(p.char.quest.progress,0);
});

test('travel owns inward facing and exposes one transition serial to the camera',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('keeper',{level:15}));
 p.yaw=0;
 g.transferPlayer(p,{x:RIFT_ANNEX.x,z:RIFT_ANNEX.arrivalZ,yaw:Math.PI});
 assert.equal(p.yaw,Math.PI);
 assert.equal(p.travelSerial,1);
 const privateState=g.privateState(p);
 assert.equal(privateState.tr,1);
 assert.equal(privateState.face,Math.PI);
 assert.equal(privateState.region,'phase_annex');
});
