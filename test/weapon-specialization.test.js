import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, ITEMS } from '../shared/content.js';
import { effectiveAuto, weaponReach } from '../shared/condition.js';
import { previewRecipe } from '../shared/crafting.js';
import { craftRecipe, equipItem } from '../server/sim/progress.js';
import { tickPlayerCombat } from '../server/sim/combat.js';
import { hasLineOfSight, deepLineClear, WORLD } from '../shared/world.js';
import { makeGame, makeChar, place, enemyOf, isolate } from './helpers.js';

const fixture=(cls='surveyor')=>makeChar(cls,{level:4,survey:'signal_done',brineStage:3,attunements:['resonance'],inventory:['tuned_emitter'],materials:{kinetic_coupler:2,resonance_fragment:1,sentinel_alloy:4,mire_fibre:2}});
for(const [cls,id] of [['vanguard','dense_pulse_core'],['surveyor','longpoint_emitter']])test(id+' is an authoritative QL5 conversion with skill and station gates',()=>{
 const g=makeGame(),p=g.addPlayer(fixture(cls)),initial=JSON.stringify(p.char);
 place(p,0,7.5);assert.equal(craftRecipe(g,p,id).ok,false);
 place(p,38,-36.5);assert.equal(craftRecipe(g,p,id).ok,false);
 place(p,49,-36.5);
 assert.equal(JSON.stringify(p.char),initial);
 const old=p.char.equipped;p.char.equipped={...old,ranged:'tuned_emitter'};assert.equal(craftRecipe(g,p,id).ok,false);p.char.equipped=old;
 assert.equal(JSON.stringify(p.char),initial);
 assert.ok(craftRecipe(g,p,id).ok);assert.deepEqual(p.char.inventory,[id]);assert.equal(ITEMS[id].ql,5);
 assert.ok(equipItem(g,p,id).ok);assert.equal(craftRecipe(g,p,id).ok,false);
 assert.equal(previewRecipe(fixture(cls==='vanguard'?'surveyor':'vanguard'),id).ok,false);
});
test('the Longpoint defines a slower, longer-reach ranged auto-attack for every class; condition scales damage only',()=>{
 const lp=ITEMS.longpoint_emitter.auto;
 for(const cls of Object.keys(CLASSES)){
  const c=makeChar(cls,{inventory:['longpoint_emitter'],equipped:{ranged:'longpoint_emitter'},condition:{longpoint_emitter:50}});
  const innate=(CLASSES[cls].auto.kind==='bolt'?CLASSES[cls].auto:CLASSES[cls].rangedAuto);
  const floor=innate.dmg/innate.interval*lp.interval;
  assert.equal(weaponReach(c),lp.range);assert.equal(effectiveAuto(c).interval,lp.interval);
  assert.ok(Math.abs(effectiveAuto(c).dmg-(floor+(lp.dmg-floor)*.5))<1e-9);
  c.condition.longpoint_emitter=0;assert.equal(weaponReach(c),lp.range,'reach is the weapon\'s own');assert.ok(Math.abs(effectiveAuto(c).dmg-floor)<1e-9);
  // Unowned: the class's own attack, unchanged.
  c.inventory=[];assert.equal(weaponReach(c),CLASSES[cls].auto.range);assert.equal(effectiveAuto(c).weapon,null);
  for(const id of ['field_emitter','tuned_emitter','dense_pulse_core'])assert.equal(weaponReach({...c,inventory:[id],equipped:{ranged:id}}),ITEMS[id].auto.range);
  assert.ok(lp.range>ITEMS.field_emitter.auto.range&&lp.interval>ITEMS.field_emitter.auto.interval);
 }
});
test('Longpoint reaches a clear enemy outside ordinary auto-attack range; depletion lowers its damage, not its reach',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('surveyor',{level:4,attunements:['resonance'],inventory:['longpoint_emitter'],equipped:{ranged:'longpoint_emitter'}}));
 const e=enemyOf(g,'skitter');isolate(g,e);const d=CLASSES.surveyor.auto.range+e.radius+3;
 let pos=null;for(let i=0;i<32;i++){const angle=i*Math.PI/16,q={x:e.x+Math.cos(angle)*d,z:e.z+Math.sin(angle)*d};if(Math.hypot(q.x,q.z)<WORLD.radius-1&&hasLineOfSight(q,e)&&deepLineClear(q,e)){pos=q;break;}}
 assert.ok(pos,'clear out-of-base-range test position');place(p,pos.x,pos.z);p.target=e.id;p.autoOn=true;
 p.char.condition={longpoint_emitter:0};const hp=e.hp;tickPlayerCombat(g,p,0);const worn=hp-e.hp;assert.ok(worn>0,'still in reach when depleted');
 p.char.condition={};p.nextAuto=0;const hp2=e.hp;tickPlayerCombat(g,p,0);assert.ok(hp2-e.hp>worn,'full condition hits harder');
 // Without the Longpoint the same position is out of the class's own reach.
 p.char.equipped.ranged=null;p.nextAuto=0;const hp3=e.hp;tickPlayerCombat(g,p,0);assert.equal(e.hp,hp3);
});
