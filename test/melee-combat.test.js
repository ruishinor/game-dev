// Server-owned deliberate melee: staged windup, range/facing, combos,
// guard/counter and replay/cooldown abuse. No renderer in this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGame,makeChar,enemyOf,isolate,place} from './helpers.js';
import {requestMelee} from '../server/sim/melee.js';
import {tickPlayerCombat,dealDamage} from '../server/sim/combat.js';
import {clearCombatSpot} from './cover-setup.js';

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
 assert.equal(g.events.filter(x=>x.e==='dmg'&&x.ab==='melee_light').length,1);
});
test('manual melee chains 3 distinct variants, then resets after its window',()=>{
 const {g,p,e}=setup();
 for(let i=1;i<=3;i++){
   assert.equal(requestMelee(g,p,'light').ok,true);
   assert.equal(g.events.filter(x=>x.e==='melee_start').at(-1).style,String(i));
   advance(g,p,220);advance(g,p,470);
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
