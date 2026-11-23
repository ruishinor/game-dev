// Server-owned deliberate melee: staged windup, range/facing, combos,
// guard/counter and replay/cooldown abuse. No renderer in this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGame,makeChar,enemyOf,isolate,place} from './helpers.js';
import {requestMelee} from '../server/sim/melee.js';
import {tickPlayerCombat,dealDamage} from '../server/sim/combat.js';
import {clearCombatSpot} from './cover-setup.js';
import {equipItem,unequipSlot} from '../server/sim/progress.js';
import {setPosture} from '../server/sim/posture.js';

function setup(){
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard'));
 const e=enemyOf(g,'skitter');isolate(g,e);g.aiHold=true;
 const pos=clearCombatSpot(e,0,1.65);place(p,pos.x,pos.z);p.target=e.id;
 p.yaw=Math.atan2(e.x-p.x,e.z-p.z);
 return {g,p,e};
}
const advance=(g,p,ms)=>{g.time+=ms;tickPlayerCombat(g,p,ms/1000);};
test('deliberate melee is an accepted intent with delayed, single server impact',()=>{
 const {g,p,e}=setup(),hp=e.hp;
 assert.equal(requestMelee(g,p,'light').ok,true);
 assert.equal(e.hp,hp,'no instant damage at request time');
 assert.equal(requestMelee(g,p,'light').ok,false,'no extra hit by command spam');
 assert.ok(g.events.some(x=>x.e==='melee_start'&&x.style==='1'));
 advance(g,p,219);assert.equal(e.hp,hp);
 advance(g,p,1);assert.ok(e.hp<hp);
 const after=e.hp;advance(g,p,100);assert.equal(e.hp,after,'impact never repeats');
 const hits=g.events.filter(x=>x.e==='dmg'&&x.ab==='melee_light');
 assert.equal(hits.length,1);
 assert.equal(hits[0].mv,'1','confirmed damage carries the server-authored combo variant');
});
test('manual melee chains 3 distinct variants, then resets after its window',()=>{
 const {g,p,e}=setup();
 for(let i=1;i<=3;i++){
   assert.equal(requestMelee(g,p,'light').ok,true);
   assert.equal(g.events.filter(x=>x.e==='melee_start').at(-1).style,String(i));
   const windup=220+(i-1)*70,recovery=690+(i-1)*80;
   advance(g,p,windup);advance(g,p,recovery-windup);
 }
 advance(g,p,1800);
 assert.equal(requestMelee(g,p,'light').ok,true);
 assert.equal(g.events.filter(x=>x.e==='melee_start').at(-1).style,'1');
});
test('missed contact, target disappearance and stale/rear attacks cannot produce damage',()=>{
 const {g,p,e}=setup();const before=e.hp;
 assert.ok(requestMelee(g,p,'heavy').ok);
 place(p,e.x+15,e.z);
 advance(g,p,440);assert.equal(e.hp,before);
 assert.ok(g.events.some(x=>x.e==='melee_miss'));
 advance(g,p,800);const pos=clearCombatSpot(e,0,1.65);place(p,pos.x,pos.z);
 p.yaw=Math.atan2(p.x-e.x,p.z-e.z);
 assert.equal(requestMelee(g,p,'light').ok,false,'rear-attack forbidden');
 p.yaw=Math.atan2(e.x-p.x,e.z-p.z);
 assert.equal(requestMelee(g,p,'rocket').ok,false);
});
test('mode and safe-zone rules forbid client-forged melee regardless of request',()=>{
 const {g,p,e}=setup();
 p.char.activeWeapon='ranged';assert.equal(requestMelee(g,p,'light').ok,false);
 p.char.activeWeapon='weapon';place(p,0,0);assert.equal(requestMelee(g,p,'heavy').ok,false);
});
test('server guard reduces only frontal melee and opens a brief counter',()=>{
 const {g,p,e}=setup();
 assert.equal(requestMelee(g,p,'guard').ok,true);
 const hp=p.hp;const landed=dealDamage(g,e,p,20,'auto',{kind:'melee',melee:true});
 assert.ok(landed<20&&landed>0);assert.equal(p.hp,hp-landed);
 assert.ok(g.events.some(x=>x.e==='melee_deflect'));
 advance(g,p,990);
 assert.equal(requestMelee(g,p,'light').ok,true);
 assert.equal(g.events.filter(x=>x.e==='melee_start').at(-1).style,'counter');
});
test('guard cannot block ranged hits or incoming attacks from behind',()=>{
 const {g,p,e}=setup();assert.ok(requestMelee(g,p,'guard').ok);
 const hp=p.hp;assert.equal(dealDamage(g,e,p,20,'auto',{kind:'bolt'}),20);assert.equal(p.hp,hp-20);
 const {g:g2,p:p2,e:e2}=setup();assert.ok(requestMelee(g2,p2,'guard').ok);
 p2.yaw+=Math.PI;
 assert.equal(dealDamage(g2,e2,p2,20,'auto',{kind:'melee',melee:true}),20);
});

test('guard cannot be combined with immediate ability cast or retained after weapon swap',()=>{
 const {g,p,e}=setup();assert.ok(requestMelee(g,p,'guard').ok);
 assert.ok(p.gcdUntil>=p.meleeState.guardUntil,'guard occupies the ability recovery window');
 const hp=p.hp;p.char.activeWeapon='ranged';
 const damage=dealDamage(g,e,p,20,'auto',{kind:'melee',melee:true});
 assert.equal(damage,20,'ranged mode cannot retain melee guard protection');
 assert.equal(p.hp,hp-20);
});


test('one near-recovery keyboard intent starts on the server clock, not on arrival',()=>{
 const {g,p,e}=setup();
 assert.ok(requestMelee(g,p,'light').ok);
 advance(g,p,220);
 const hp=e.hp;
 advance(g,p,310); // 160ms remain of the 690ms recovery.
 const accepted=requestMelee(g,p,'light');
 assert.deepEqual(accepted,{ok:true,queued:true});
 assert.equal(requestMelee(g,p,'light').ok,false,'replayed packets cannot stack');
 assert.equal(g.events.filter(x=>x.e==='melee_start').length,1);
 advance(g,p,159);
 assert.equal(g.events.filter(x=>x.e==='melee_start').length,1);
 advance(g,p,1);
 const starts=g.events.filter(x=>x.e==='melee_start');
 assert.equal(starts.length,2);
 assert.equal(starts[1].style,'2','server computes combo stage when it starts');
 assert.equal(e.hp,hp,'buffer acceptance and strike start do not cause damage');
 advance(g,p,289);
 assert.equal(e.hp,hp,'windup must finish before contact');
 advance(g,p,1);
 assert.ok(e.hp<hp);
 assert.equal(g.events.filter(x=>x.e==='dmg'&&x.ab==='melee_light').length,2);
});

test('too-early intents and delayed server ticks never turn into free strikes',()=>{
 const {g,p}=setup();
 assert.ok(requestMelee(g,p,'light').ok);
 advance(g,p,220);
 advance(g,p,289); // 181ms before ready: outside the buffer.
 assert.equal(requestMelee(g,p,'light').ok,false);
 advance(g,p,21); // 160ms before ready: inside the buffer.
 assert.deepEqual(requestMelee(g,p,'heavy'),{ok:true,queued:true});
 advance(g,p,281); // 121ms after ready: expired, even if tick was stalled.
 assert.equal(g.events.filter(x=>x.e==='melee_start').length,1);
 assert.equal(p.meleeState.buffered,null);
 assert.ok(requestMelee(g,p,'heavy').ok,'a stale buffer cannot lock combat');
});

test('buffered attacks recheck target, position, facing and weapon on execution',()=>{
 for(const invalidate of [
  (p,e)=>{p.target=0;},
  (p,e)=>{p.x=e.x+15;},
  (p,e)=>{p.yaw+=Math.PI;},
  (p,e)=>{p.char.activeWeapon='ranged';},
 ]){
  const {g,p,e}=setup();
  assert.ok(requestMelee(g,p,'light').ok);
  advance(g,p,220);
  advance(g,p,310);
  assert.equal(requestMelee(g,p,'light').queued,true);
  const hp=e.hp;
  invalidate(p,e);
  advance(g,p,160);
  assert.equal(g.events.filter(x=>x.e==='melee_start').length,1);
  advance(g,p,500);
  assert.equal(e.hp,hp,'queued request never bypasses current legality');
 }
});

test('a buffered guard activates only after recovery; auto attacks cannot double-fire',()=>{
 const {g,p,e}=setup();
 assert.ok(requestMelee(g,p,'light').ok);
 advance(g,p,220);
 advance(g,p,310);
 p.autoOn=true;
 const q=requestMelee(g,p,'guard');
 assert.deepEqual(q,{ok:true,queued:true});
 assert.equal(p.autoOn,false);
 const before=p.hp;
 const immediate=dealDamage(g,e,p,10,'auto',{kind:'melee',melee:true});
 assert.equal(immediate,10,'guard cannot mitigate before server activation');
 assert.equal(p.hp,before-10);
 advance(g,p,160);
 assert.equal(g.events.filter(x=>x.e==='melee_guard').length,1);
 const blocked=dealDamage(g,e,p,10,'auto',{kind:'melee',melee:true});
 assert.ok(blocked<10);
 assert.equal(g.events.filter(x=>x.e==='melee_deflect').length,1);
});

test('input time never extends the 1650ms hit-based combo window',()=>{
 const {g,p}=setup();
 assert.ok(requestMelee(g,p,'light').ok);
 advance(g,p,220);
 advance(g,p,1620); // 30ms before combo expiry, but GCD postpones action.
 p.gcdUntil=g.time+70;
 assert.deepEqual(requestMelee(g,p,'light'),{ok:true,queued:true});
 advance(g,p,70);
 assert.equal(g.events.filter(x=>x.e==='melee_start').at(-1).style,'1',
  'the buffer must not timestamp an attack or grant an expired combo stage');
});

test('interrupted contact cannot produce a hit or retain a stale combo',()=>{
 for(const invalidate of [
  p=>{p.sitting={x:p.x,z:p.z};},
  p=>{p.char.activeWeapon='ranged';},
 ]){
  const {g,p,e}=setup(),hp=e.hp;
  assert.ok(requestMelee(g,p,'light').ok);
  advance(g,p,219);
  invalidate(p);
  advance(g,p,1);
  assert.equal(e.hp,hp);
  assert.equal(p.meleeState.pending,null);
  assert.equal(p.meleeState.combo,0);
  assert.equal(p.meleeState.lastHit,-Infinity);
 }
});

test('a committed heavy attack blocks equipping and unequipping before the first hit',()=>{
 const {g,p,e}=setup(),rod='electrical_combat_rod';
 p.char.inventory.push(rod);
 assert.ok(equipItem(g,p,rod).ok);
 const hp=e.hp;
 assert.ok(requestMelee(g,p,'heavy').ok);
 assert.equal(p.combatUntil,0,'attack has not damaged or aggroed anything yet');
 assert.equal(unequipSlot(g,p,'weapon').ok,false,'cannot swap the item during windup');
 advance(g,p,439);
 assert.equal(e.hp,hp,'not yet at contact');
 advance(g,p,1);
 assert.ok(e.hp<hp,'unchanged weapon completes a valid contact');
});

test('a missed attack still protects its recovery from a mid-action loadout change',()=>{
 const {g,p,e}=setup(),rod='electrical_combat_rod',hp=e.hp;
 p.char.inventory.push(rod);
 assert.ok(requestMelee(g,p,'heavy').ok);
 place(p,e.x+20,e.z);
 advance(g,p,440);
 assert.equal(e.hp,hp);
 assert.equal(p.combatUntil,0,'a whiff does not set the normal combat linger');
 assert.equal(equipItem(g,p,rod).ok,false,'recovery is still a committed action');
 advance(g,p,789);
 assert.equal(equipItem(g,p,rod).ok,false,'last millisecond of recovery is protected');
 advance(g,p,1);
 assert.equal(equipItem(g,p,rod).ok,true,'equipping resumes as soon as recovery ends');
});

test('contact rejects a forged mid-windup weapon identity change',()=>{
 const {g,p,e}=setup(),rod='electrical_combat_rod',hp=e.hp;
 assert.ok(requestMelee(g,p,'heavy').ok,'innate swing starts');
 // Simulate a privileged or errant path bypassing the ordinary equipment gate.
 p.char.inventory.push(rod);
 p.char.equipped.weapon=rod;
 advance(g,p,440);
 assert.equal(e.hp,hp,'the rod cannot upgrade the committed innate strike');
 assert.equal(p.meleeState.pending,null,'committed attack resolves only once');
 assert.equal(p.meleeState.combo,0);
 assert.equal(p.meleeState.lastHit,-Infinity);
});

test('active guard cannot be combined with sitting or protect a seated player',()=>{
 const {g,p,e}=setup();
 assert.ok(requestMelee(g,p,'guard').ok);
 assert.equal(p.combatUntil,0,'guard itself has not caused damage');
 assert.equal(setPosture(g,p,true).ok,false,'cannot sit through active guard');
 assert.equal(p.sitting,null);
 // A stale/forged seated state must never grant guard's mitigation.
 p.sitting={x:p.x,z:p.z};
 const before=p.hp,landed=dealDamage(g,e,p,20,'auto',{kind:'melee',melee:true});
 assert.equal(landed,20);
 assert.equal(p.hp,before-20);
 assert.equal(g.events.filter(x=>x.e==='melee_deflect').length,0);
});

test('early combo buffer prevents unrelated equipment changes even if no combat linger',()=>{
 const {g,p,e}=setup(),rod='electrical_combat_rod';
 p.char.inventory.push(rod);
 assert.ok(requestMelee(g,p,'light').ok);
 advance(g,p,220);
 // Control the combat-linger flag to isolate the melee queue's own gating.
 p.combatUntil=0;
 advance(g,p,310);
 assert.equal(requestMelee(g,p,'light').queued,true);
 assert.equal(equipItem(g,p,rod).ok,false,'queued attack still owns the melee window');
 advance(g,p,160);
 assert.equal(g.events.filter(x=>x.e==='melee_start').at(-1).style,'2');
});
