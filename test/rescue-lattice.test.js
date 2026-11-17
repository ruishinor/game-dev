import test from 'node:test';
import assert from 'node:assert/strict';
import { dealDamage, getBuff, tickPlayerCombat } from '../server/sim/combat.js';
import { makeGame, makeChar, place, enemyOf } from './helpers.js';
test('Shelter Rescue Lattice projects an emergency barrier on a surviving threshold crossing, once per combat',()=>{
 const game=makeGame(),p=game.addPlayer(makeChar('surveyor',{inventory:['brine_rescue_lattice'],equipped:{device:null,implant:'brine_rescue_lattice',glyph:null}})),e=enemyOf(game,'sentinel');
 place(p,0,25);p.hp=80;
 dealDamage(game,e,p,20,'test',{flat:true});
 assert.equal(p.hp,60);assert.equal(getBuff(p,'shield').v,20);
 assert.equal(game.privateState(p).rescueReady,false);
 assert.ok(game.events.some(e=>e.k==='rescue_lattice'));
 p.buffs=[];p.hp=80;dealDamage(game,e,p,20,'test',{flat:true});assert.equal(getBuff(p,'shield'),null);
 game.time=p.combatUntil+1;tickPlayerCombat(game,p,.05);
 p.hp=80;dealDamage(game,e,p,20,'test',{flat:true});assert.equal(getBuff(p,'shield').v,20);
});
