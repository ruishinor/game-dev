import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, makeChar, place } from './helpers.js';
import { MAX_LEVEL } from '../shared/content.js';
import { WORLD, SILENT_FOUNDRY, travelRegionAt } from '../shared/world.js';
import { gmIds,gmAuthorized,executeGm,GM_HELP } from '../server/gm.js';
import { dealDamage } from '../server/sim/combat.js';

test('GM is disabled by default, bound to an existing account UUID and owned character',()=>{
 const id='2ad75896-3e75-46a7-9f4c-20b467d2ae71';
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard',{accountId:id}));
 const conn={account:{id},char:p.char,player:p};
 assert.equal(gmIds('').size,0);
 assert.equal(gmAuthorized(conn,gmIds('')),false);
 assert.equal(gmAuthorized(conn,gmIds('admin')),false);
 const allowed=gmIds(id);
 assert.equal(gmAuthorized(conn,allowed),true);
 assert.equal(gmAuthorized({...conn,account:{id:'1dc55847-400d-4dbd-9aab-51f414076c2a'}},allowed),false);
 assert.equal(gmAuthorized({...conn,char:{...p.char,accountId:id}},allowed),false,'cannot substitute a forged character');
 assert.equal(gmAuthorized({...conn,char:{...p.char,accountId:null}},allowed),false,'guest cannot use GM');
});

test('owner preview controls set level, unlock calibration and heal without modifying other characters',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard')),other=g.addPlayer(makeChar('vanguard'));
 assert.equal(executeGm(g,p,'level '+MAX_LEVEL).ok,true);
 assert.equal(p.char.level,MAX_LEVEL);
 assert.equal(p.char.xp,0);
 assert.equal(p.hp,p.maxHp);
 assert.equal(other.char.level,1);
 assert.equal(executeGm(g,p,'level '+(MAX_LEVEL+1)).ok,false);
 assert.equal(executeGm(g,p,'unlock').ok,true);
 assert.ok(p.char.attunements.includes('resonance'));
 assert.equal(p.char.riftCalibration,'completed');
 assert.equal(executeGm(g,p,'unlock').ok,true,'replay remains idempotent');
 assert.equal(p.char.attunements.filter(a=>a==='resonance').length,1);
 p.hp=1;
 assert.equal(executeGm(g,p,'heal').ok,true);
 assert.equal(p.hp,p.maxHp);
 assert.ok(GM_HELP.includes('/gm tp'));
});

test('GM teleports through authoritative world transfer; creates Foundry only when asked',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('keeper'));
 assert.equal(g.foundryOpened,false);
 assert.equal(executeGm(g,p,'tp foundry').ok,true);
 assert.equal(g.foundryOpened,true);
 assert.equal(travelRegionAt(p.x,p.z),'silent_foundry');
 assert.ok(Math.hypot(p.x-SILENT_FOUNDRY.arrival.x,p.z-SILENT_FOUNDRY.arrival.z)<2);
 assert.equal(executeGm(g,p,'tp reach').ok,true);
 assert.equal(travelRegionAt(p.x,p.z),'reach');
 assert.ok(Math.hypot(p.x-WORLD.spawn.x,p.z-WORLD.spawn.z)<2);
 assert.equal(executeGm(g,p,'tp nope').ok,false);
});

test('God mode is private, transient, and applies to incoming combat only',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard'));
 const enemy=g.enemies.find(e=>e.type==='sentinel');
 place(p,enemy.x+2,enemy.z);
 const old=p.hp;
 assert.equal(executeGm(g,p,'god on').ok,true);
 assert.equal(dealDamage(g,enemy,p,50,'auto'),0);
 assert.equal(p.hp,old);
 assert.equal(p.char.gmInvulnerable,undefined,'never a persisted character field');
 assert.equal(executeGm(g,p,'god off').ok,true);
 assert.equal(p.gmInvulnerable,false);
});
