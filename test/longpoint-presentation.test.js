import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { publicWeaponVisual } from '../shared/weapon-visual.js';
import { makeGame, makeChar } from './helpers.js';
import { CombatVfx } from '../client/src/vfx/combat.js';
import { dealDamage } from '../server/sim/combat.js';
import { isolate, enemyOf, place } from './helpers.js';

test('Longpoint visual is allowlisted, owned, in hand only while ranged is active, stowed otherwise, and cleared on loadout changes',()=>{
 const game=makeGame(),char=makeChar('surveyor',{inventory:['longpoint_emitter'],equipped:{ranged:'longpoint_emitter'},condition:{longpoint_emitter:17}});
 const p=game.addPlayer(char),v=p.metaVer;assert.equal(publicWeaponVisual(char),'longpoint');assert.equal(game.metaFor(p).wv,'longpoint');assert.equal(game.metaFor(p).condition,undefined);assert.equal(game.metaFor(p).inventory,undefined);
 game.refreshStats(p);assert.equal(p.metaVer,v);
 char.equipped.ranged=null;game.refreshStats(p);assert.equal(p.metaVer,v+1);assert.equal(game.metaFor(p).wv,undefined);
 char.equipped.ranged='longpoint_emitter';game.refreshStats(p);assert.equal(p.metaVer,v+2);assert.equal(game.metaFor(p).wv,'longpoint');
 assert.equal(publicWeaponVisual({...char,inventory:[]}),null);assert.equal(publicWeaponVisual({...char,equipped:{ranged:'untrusted/path'}}),null);assert.equal(publicWeaponVisual({...char,equipped:{weapon:'longpoint_emitter'}}),null);
 // Any class: the rifle is in hand while ranged is active and carried on the back while melee is active.
 const vanguard={...char,cls:'vanguard',inventory:['longpoint_emitter','electrical_combat_rod'],equipped:{weapon:'electrical_combat_rod',ranged:'longpoint_emitter'}};
 assert.equal(publicWeaponVisual(vanguard),'longpoint-stowed');assert.equal(publicWeaponVisual({...vanguard,activeWeapon:'ranged'}),'longpoint');
 assert.equal(publicWeaponVisual({...char,activeWeapon:'weapon'}),'longpoint-stowed','a Surveyor in melee mode carries the rifle stowed');
 assert.equal(publicWeaponVisual(null),null);
});

test('existing rich VFX takes the held prop origin only for ranged auto attacks, otherwise uses original chest origin',()=>{
 const calls=[];const cvfx=new CombatVfx({burst:x=>calls.push(x),trail(){},emitter(){}});
 const chest=new T.Vector3(1,2,3),anchor=new T.Vector3(4,5,6);
 const s={meta:{k:'p',c:'surveyor'},chest,placed:true,model:{weaponEffectOrigin:()=>anchor}},d={chest:new T.Vector3(8,2,9)};
 cvfx.hit(d,s,{k:'bolt',ab:'auto',a:2});assert.deepEqual(calls[0].at.toArray(),anchor.toArray());
 calls.length=0;cvfx.hit(d,s,{k:'bolt',ab:'core_bore',a:2});assert.deepEqual(calls[0].at.toArray(),chest.toArray());
 calls.length=0;s.model.weaponEffectOrigin=()=>new T.Vector3(NaN,0,0);cvfx.hit(d,s,{k:'bolt',ab:'auto',a:2});assert.deepEqual(calls[0].at.toArray(),chest.toArray());
});

// Real sockets exercise the unchanged metadata invalidation/replication path.
import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { setTimeout as delay } from 'node:timers/promises';
async function until(check, message){const end=Date.now()+5000;while(Date.now()<end){const value=check();if(value)return value;await delay(20);}throw Error(message);}
function client(port){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),meta=new Map(),messages=[],snapshots=[];ws.on('error',()=>{});ws.on('message',raw=>{const m=JSON.parse(raw);messages.push(m);if(m.t==='s'){snapshots.push(m);for(const v of m.meta||[])meta.set(v.i,v);}});return{ws,meta,messages,snapshots,async join(name){await until(()=>ws.readyState===WebSocket.OPEN,'socket open');ws.send(JSON.stringify({t:'create',name,cls:'surveyor'}));return until(()=>messages.find(m=>m.t==='welcome'),'welcome');}};}
test('real WebSocket observers receive the visual on equip and its removal on unequip without the private inventory',async()=>{
 const server=await startServer({port:0,dataFile:null}),owner=client(server.port),observer=client(server.port);
 try{
  const a=await owner.join('Longpoint One');await observer.join('Longpoint Two');const p=server.game.players.get(a.id);assert.ok(p);
  await until(()=>observer.meta.has(p.id),'initial observer metadata');assert.equal(observer.meta.get(p.id).wv,undefined);
  p.char.inventory.push('longpoint_emitter');p.char.equipped.ranged='longpoint_emitter';server.game.refreshStats(p);server.game.markDirty(p);
  await until(()=>owner.meta.get(p.id)?.wv==='longpoint'&&observer.meta.get(p.id)?.wv==='longpoint','replicated equipped visual');
  const seen=observer.meta.get(p.id);assert.equal(seen.inventory,undefined);assert.equal(seen.condition,undefined);assert.equal(seen.equipped,undefined);
  p.char.equipped.ranged=null;server.game.refreshStats(p);server.game.markDirty(p);
  await until(()=>owner.meta.get(p.id)?.wv===undefined&&observer.meta.get(p.id)?.wv===undefined,'replicated removal');
 }finally{owner.ws.close();observer.ws.close();await server.close();}
});

test('confirmed rifle auto hit exposes only allowlisted presentation metadata',()=>{
 const game=makeGame(),char=makeChar('surveyor',{inventory:['longpoint_emitter'],equipped:{ranged:'longpoint_emitter'}});
 const p=game.addPlayer(char),enemy=enemyOf(game,'skitter');isolate(game,enemy);
 place(p,enemy.x+1,enemy.z);game.events.length=0;
 assert.ok(dealDamage(game,p,enemy,1,'auto',{kind:'bolt'})>0);
 const ev=game.events.find(x=>x.e==='dmg'&&x.s===p.id);assert.equal(ev.wv,'longpoint');
 for(const key of ['inventory','condition','equipped','charId'])assert.equal(ev[key],undefined);
 game.events.length=0;dealDamage(game,p,enemy,1,'core_bore',{kind:'bolt'});assert.equal(game.events.find(x=>x.e==='dmg'&&x.s===p.id)?.wv,undefined);
 char.equipped.ranged=null;game.events.length=0;dealDamage(game,p,enemy,1,'auto',{kind:'bolt'});assert.equal(game.events.find(x=>x.e==='dmg'&&x.s===p.id)?.wv,undefined);
});

test('rifle trace starts at the mounted muzzle and preserves confirmed impact',()=>{
 const beams=[],bursts=[],impacts=[];
 const cvfx=new CombatVfx({beam:x=>beams.push(x),burst:x=>bursts.push(x),trail(){},emitter(){}});
 cvfx.impact=(...a)=>impacts.push(a);
 const muzzle=new T.Vector3(1,2,3),s={placed:true,chest:new T.Vector3(),model:{weaponEffectOrigin:()=>muzzle}},d={chest:new T.Vector3(8,2,9)};
 const event={ab:'auto',k:'bolt',wv:'longpoint',a:2};
 cvfx.hit(d,s,event);assert.equal(beams.length,1);assert.deepEqual(beams[0].from.toArray(),muzzle.toArray());assert.deepEqual(beams[0].to.toArray(),d.chest.toArray());assert.equal(impacts.length,1);assert.equal(impacts[0][2],event);
});
