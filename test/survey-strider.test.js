import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGame,makeChar,place,enemyOf,isolate} from './helpers.js';
import {equipItem,unequipSlot,craftRecipe} from '../server/sim/progress.js';
import {petCommand,renameCompanion} from '../server/sim/companion.js';
import {tickSurveyStrider} from '../server/sim/survey-strider.js';
import {groundSegmentClear} from '../server/sim/ground-navigation.js';
const id='survey_strider_link';
const eligible=()=>makeChar('surveyor',{level:4,attunements:['resonance'],inventory:[id],survey:'signal_done',brineStage:3});
test('equipment creates exactly one authoritative ground companion and dismisses it without changing Mender',()=>{
 const g=makeGame(),m=g.addPlayer(makeChar('symbiotech')),p=g.addPlayer(eligible()),other=g.addPlayer(makeChar('vanguard',{inventory:[id]}));const original=m.companion;
 assert.equal(p.companion,null);assert.equal(equipItem(g,other,id).ok,false);
 assert.ok(equipItem(g,p,id).ok);const c=p.companion;assert.equal(c.type,'survey_strider');assert.equal(c.owner,p.id);assert.ok(groundSegmentClear(c,c,.9));
 assert.equal(g.privateState(p).comp,c.id);assert.equal(g.sheet(p).companion,c.type);assert.equal(g.metaFor(c).o,p.id);
 g.refreshStats(p);assert.equal(p.companion,c);assert.equal(g.companions.length,2);
 assert.equal(petCommand(g,p,'triage').ok,false);assert.equal(petCommand(g,p,'guard').ok,false);assert.ok(petCommand(g,p,'stay').ok);assert.ok(renameCompanion(g,p,'Field Walker').ok);
 p.combatUntil=g.time+1000;assert.equal(unequipSlot(g,p,'device').ok,false);p.combatUntil=0;
 assert.ok(unequipSlot(g,p,'device').ok);assert.equal(p.companion,null);assert.equal(g.ents.has(c.id),false);assert.equal(g.privateState(p).comp,0);assert.equal(m.companion,original);
 assert.ok(equipItem(g,p,id).ok);assert.equal(p.companion.name,'Field Walker');assert.equal(p.companion.mode,'stay');
 const saved={...p.char,equipped:{...p.char.equipped},inventory:[...p.char.inventory]};g.removePlayer(p.id);const restored=g.addPlayer(saved);assert.equal(restored.companion.name,'Field Walker');assert.equal(restored.companion.mode,'stay');assert.equal(g.companions.length,2);
});
test('controller is class and site gated, consumes materials, no automatic Mender replacement',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('surveyor',{level:4,attunements:['resonance'],survey:'signal_done',brineStage:3,materials:{sentinel_alloy:4,mire_fibre:2,resonance_fragment:1}}));
 assert.equal(craftRecipe(g,p,id).ok,false);place(p,49,-36.5);assert.ok(craftRecipe(g,p,id).ok);assert.equal(p.companion,null);assert.deepEqual(p.char.materials,{});
});
test('scan is noncombat, preserves active manual analysis, permits no neutral or out-of-range exploitation',()=>{
 const g=makeGame(),p=g.addPlayer(eligible()),e=enemyOf(g,'skitter');isolate(g,e);
 assert.ok(equipItem(g,p,id).ok);const c=p.companion;place(p,0,25);c.x=1;c.z=25;e.x=4;e.z=25;e.state='idle';
 g.time=2000;c.nextPulse=0;p.target=e.id;assert.ok(petCommand(g,p,'assist').ok);g.time+=500;
 const res=p.res,hp=e.hp,before=e.threat.size;
 p.surveyKit.mark={id:999,until:g.time+1000};tickSurveyStrider(g,c,.05);assert.equal(p.surveyKit.mark.id,999);
 p.surveyKit.mark=null;c.nextPulse=0;tickSurveyStrider(g,c,.05);assert.equal(p.surveyKit.mark?.id,e.id);assert.equal(p.surveyKit.mark.source,c.id);assert.equal(p.res,res);assert.equal(e.hp,hp);assert.equal(e.threat.size,before);
 assert.ok(g.events.some(x=>x.e==='cast'&&x.s===c.id&&x.ab==='fault_scan'));
 p.surveyKit.mark=null;tickSurveyStrider(g,c,.05);assert.equal(p.surveyKit.mark,null);
 g.time+=9000;const neutral=enemyOf(g,'sinter_grazer');neutral.state='idle';neutral.threat.clear();neutral.x=4;neutral.z=25;p.target=neutral.id;tickSurveyStrider(g,c,.05);assert.equal(p.surveyKit.mark,null);
 p.target=e.id;p.dead=true;tickSurveyStrider(g,c,.05);assert.equal(c.act,'dormant');assert.equal(p.surveyKit.mark,null);
 p.dead=false;p.surveyKit.mark={id:e.id,source:c.id,until:g.time+6000};assert.ok(unequipSlot(g,p,'device').ok);assert.equal(p.surveyKit.mark,null);
});
