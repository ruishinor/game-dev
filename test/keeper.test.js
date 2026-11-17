import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, directiveFor } from '../shared/content.js';
import { useAbility, dealDamage, applyHeal, getBuff, addBuff } from '../server/sim/combat.js';
import { makeGame, makeChar, place, enemyOf, isolate } from './helpers.js';
const fixture=(over={})=>{const game=makeGame(),p=game.addPlayer(makeChar('keeper',over)),e=enemyOf(game,'sentinel');isolate(game,e);place(p,0,25);place(e,0,31);game.setTarget(p,e.id);return {game,p,e};};
test('Keeper class is not Vanguard and commissions a distinct loadout',()=>{
 const {game,p,e}=fixture();
 assert.equal(p.companion,null);assert.equal(CLASSES.keeper.resource.id,'coherence');
 assert.equal(CLASSES.keeper.abilities.some(a=>CLASSES.vanguard.abilities.includes(a)),false);
 assert.equal(useAbility(game,p,'discharge').ok,false);
 assert.equal(useAbility(game,p,'resonant_reversal').ok,false);
 assert.equal(directiveFor('keeper',0).goal.ability,'phase_needle');
 assert.ok(useAbility(game,p,'phase_needle').ok);game.time+=3000;
 assert.ok(useAbility(game,p,'phase_needle').ok);assert.equal(p.char.quest.step,1);
 assert.ok(p.char.inventory.includes('keeper_prism'));
});
test('Reversal consumes personal barrier and trades defense for offense',()=>{
 const {game,p,e}=fixture();p.res=100;
 assert.ok(useAbility(game,p,'hinge_field').ok);assert.equal(getBuff(p,'shield').v,40);
 game.time+=1000;const hp=e.hp;assert.ok(useAbility(game,p,'resonant_reversal').ok);
 assert.equal(e.hp,hp-38);assert.equal(getBuff(p,'shield'),null);assert.equal(p.res,55);
 game.time+=6000;addBuff(p,{k:'shield',v:50,until:game.time+9000,src:999,keeper:true});
 assert.equal(useAbility(game,p,'resonant_reversal').ok,false);
});
test('Hinge + Resonator enables finite Shared Pulse restoration without reviving exhausted shields',()=>{
 const {game,p,e}=fixture({inventory:['keeper_prism','keeper_resonator','glyph_hinge'],attunements:['resonance'],equipped:{device:'keeper_prism',implant:'keeper_resonator',glyph:'glyph_hinge'}});
 const healer=game.addPlayer(makeChar('symbiotech',{inventory:['glyph_shared_pulse'],attunements:['resonance'],equipped:{device:null,implant:null,glyph:'glyph_shared_pulse'}}));
 place(healer,2,25);p.res=100;assert.ok(useAbility(game,p,'hinge_field').ok);
 const shield=getBuff(p,'shield'),cap=shield.cap;shield.v=cap-10;p.hp-=50;
 assert.ok(applyHeal(game,healer,p,30,'shared_pulse')>0);
 assert.equal(shield.v,cap);
 shield.v=0;p.hp-=20;applyHeal(game,healer,p,20,'shared_pulse');assert.equal(shield.v,0);
});
test('Relay leaves stronger shields intact and respects cover',()=>{
 const {game,p}=fixture();const ally=game.addPlayer(makeChar('vanguard'));place(p,46,-41);place(ally,46,-45);p.res=100;
 assert.ok(useAbility(game,p,'lattice_relay').ok);assert.equal(getBuff(ally,'shield'),null);
 assert.equal(getBuff(p,'shield').v,24);
});

test('Hinge blocks actual damage, reports authoritative capacity, breaks on overflow and cannot absorb after expiry',()=>{
 const {game,p,e}=fixture();p.res=100;assert.ok(useAbility(game,p,'hinge_field').ok);const hp=p.hp;
 assert.equal(dealDamage(game,e,p,6,'test',{flat:true}),0);assert.equal(p.hp,hp);assert.equal(game.privateState(p).barrier.remaining,34);
 assert.equal(dealDamage(game,e,p,40,'test',{flat:true}),6);assert.equal(p.hp,hp-6);assert.equal(game.privateState(p).barrier,null);assert.equal(getBuff(p,'shield'),null);assert.ok(!game.buildRows().find(row=>row.i===p.id).b.includes('shield'));
 game.time+=10000;p.res=100;assert.ok(useAbility(game,p,'hinge_field').ok);game.time+=9000;const before=p.hp;assert.equal(dealDamage(game,e,p,6,'test',{flat:true}),6);assert.equal(p.hp,before-6);assert.equal(game.privateState(p).barrier,null);
});
test('Relay absorbs for every eligible ally and stops at finite capacity',()=>{
 const {game,p,e}=fixture();const ally=game.addPlayer(makeChar('vanguard'));place(ally,2,25);p.res=100;assert.ok(useAbility(game,p,'lattice_relay').ok);const hp=ally.hp;
 assert.equal(game.privateState(ally).barrier.remaining,24);assert.equal(dealDamage(game,e,ally,8,'test',{flat:true}),0);assert.equal(ally.hp,hp);assert.equal(game.privateState(ally).barrier.remaining,16);assert.equal(dealDamage(game,e,ally,20,'test',{flat:true}),4);assert.equal(ally.hp,hp-4);
});
