import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, ITEMS } from '../shared/content.js';
import { weaponBonus, weaponReach } from '../shared/condition.js';
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
 const old=p.char.equipped;p.char.equipped={...old,weapon:'tuned_emitter'};assert.equal(craftRecipe(g,p,id).ok,false);p.char.equipped=old;
 assert.equal(JSON.stringify(p.char),initial);
 assert.ok(craftRecipe(g,p,id).ok);assert.deepEqual(p.char.inventory,[id]);assert.equal(ITEMS[id].ql,5);
 assert.ok(equipItem(g,p,id).ok);assert.equal(craftRecipe(g,p,id).ok,false);
 assert.equal(previewRecipe(fixture(cls==='vanguard'?'surveyor':'vanguard'),id).ok,false);
});
test('condition scales only the additional damage and ranged reach; old attacks remain unchanged',()=>{
 for(const cls of Object.keys(CLASSES)){
  const c=makeChar(cls,{inventory:['longpoint_emitter'],equipped:{weapon:'longpoint_emitter'},condition:{longpoint_emitter:50}});
  const base=CLASSES[cls].auto.range;
  assert.equal(weaponReach(c),base+(CLASSES[cls].auto.kind==='bolt'?2:0));assert.equal(weaponBonus(c),1);
  c.condition.longpoint_emitter=0;assert.equal(weaponReach(c),base);assert.equal(weaponBonus(c),0);
  c.inventory=[];assert.equal(weaponReach(c),base);assert.equal(weaponBonus(c),0);
  for(const id of ['field_emitter','tuned_emitter','dense_pulse_core'])assert.equal(weaponReach({...c,inventory:[id],equipped:{weapon:id}}),base);
 }
});
test('Longpoint reaches a clear enemy outside ordinary auto-attack range, but not when depleted',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('surveyor',{level:4,attunements:['resonance'],inventory:['longpoint_emitter'],equipped:{weapon:'longpoint_emitter'}}));
 const e=enemyOf(g,'skitter');isolate(g,e);const d=CLASSES.surveyor.auto.range+e.radius+3;
 let pos=null;for(let i=0;i<32;i++){const angle=i*Math.PI/16,q={x:e.x+Math.cos(angle)*d,z:e.z+Math.sin(angle)*d};if(Math.hypot(q.x,q.z)<WORLD.radius-1&&hasLineOfSight(q,e)&&deepLineClear(q,e)){pos=q;break;}}
 assert.ok(pos,'clear out-of-base-range test position');place(p,pos.x,pos.z);p.target=e.id;p.autoOn=true;
 p.char.condition={longpoint_emitter:0};const hp=e.hp;tickPlayerCombat(g,p,0);assert.equal(e.hp,hp);
 p.char.condition={};tickPlayerCombat(g,p,0);assert.ok(e.hp<hp);
});
