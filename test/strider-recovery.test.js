import test from 'node:test';import assert from 'node:assert/strict';
import {makeGame,makeChar,place,enemyOf} from './helpers.js';
import {manageCompanion,petCommand} from '../server/sim/companion.js';
import {tickSurveyStrider} from '../server/sim/survey-strider.js';
test('commanded Strider recovers existing personal entries once and leaves other owners untouched',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('surveyor',{striderLearned:true,companionDismissed:true})),q=g.addPlayer(makeChar('vanguard'));
 assert.ok(manageCompanion(g,p,'summon').ok);const c=p.companion,e=enemyOf(g,'skitter');
 place(p,0,30);place(c,1,30);place(e,3,30);e.state='dead';e.deadAt=g.time;e.lootGeneration=1;
 e.lootByPlayer=new Map([[p.id,[{id:'mire_fibre',kind:'material',quantity:2}]],[q.id,[{id:'mire_fibre',kind:'material',quantity:1}]]]);
 p.combatUntil=g.time+1000;assert.equal(petCommand(g,p,'recover').ok,false);p.combatUntil=0;
 assert.ok(petCommand(g,p,'recover').ok);assert.equal(c.mode,'recover');tickSurveyStrider(g,c,.05);
 assert.equal(p.char.materials.mire_fibre,2);assert.equal(c.mode,'follow');assert.equal(e.lootByPlayer.has(p.id),false);assert.equal(e.lootByPlayer.get(q.id)[0].quantity,1);
 assert.equal(petCommand(g,p,'recover').ok,false);assert.equal(p.char.materials.mire_fibre,2);
});
test('moving away interrupts recovery without granting loot',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('surveyor',{striderLearned:true,companionDismissed:true}));assert.ok(manageCompanion(g,p,'summon').ok);
 const c=p.companion,e=enemyOf(g,'skitter');place(p,0,30);place(c,1,30);place(e,8,30);
 e.state='dead';e.deadAt=g.time;e.lootGeneration=1;e.lootByPlayer=new Map([[p.id,[{id:'mire_fibre',kind:'material',quantity:1}]]]);
 assert.ok(petCommand(g,p,'recover').ok);place(p,0,60);tickSurveyStrider(g,c,.05);assert.equal(c.mode,'follow');assert.equal(p.char.materials?.mire_fibre,undefined);assert.equal(e.lootByPlayer.has(p.id),true);
});
