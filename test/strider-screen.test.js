import test from 'node:test';import assert from 'node:assert/strict';
import {makeGame,makeChar,place} from './helpers.js';import {manageCompanion,petCommand} from '../server/sim/companion.js';
import {tickSurveyStrider} from '../server/sim/survey-strider.js';import {getBuff,addBuff} from '../server/sim/combat.js';
test('emergency screen requires owner combat and low HP, preserves barriers and cooldown across command switching',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('surveyor',{striderLearned:true,companionDismissed:true}));assert.ok(manageCompanion(g,p,'summon').ok);
 const c=p.companion;place(p,0,25);c.x=1;c.z=25;p.hp=40;g.time=5000;assert.ok(petCommand(g,p,'screen').ok);g.time+=500;tickSurveyStrider(g,c,.05);assert.equal(getBuff(p,'shield'),null);
 p.combatUntil=g.time+60000;addBuff(p,{k:'shield',v:45,until:g.time+1000,src:p.id});tickSurveyStrider(g,c,.05);assert.equal(getBuff(p,'shield').v,45);
 g.time+=1100;tickSurveyStrider(g,c,.05);assert.equal(getBuff(p,'shield').v,20);assert.equal(c.act,'screening');
 p.buffs=[];assert.ok(petCommand(g,p,'follow').ok);assert.ok(petCommand(g,p,'screen').ok);g.time+=700;tickSurveyStrider(g,c,.05);assert.equal(getBuff(p,'shield'),null);
 g.time+=24000;tickSurveyStrider(g,c,.05);assert.equal(getBuff(p,'shield').v,20);
});
