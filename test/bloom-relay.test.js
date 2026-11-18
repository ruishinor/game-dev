import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRecipe } from '../shared/crafting.js';
import { craftRecipe, equipItem } from '../server/sim/progress.js';
import { useAbility } from '../server/sim/combat.js';
import { makeGame, makeChar, place } from './helpers.js';
const fixture=()=>makeChar('symbiotech',{level:4,survey:'signal_done',brineStage:3,attunements:['resonance'],inventory:['conductive_membrane','sinter_laminate'],materials:{culture_matrix:1,resonance_fragment:1}});

test('Bloom Relay is a permanent multi-stage, site and skill gated fusion',()=>{
  const g=makeGame(),p=g.addPlayer(fixture());
  const before=JSON.stringify(p.char);
  for(const [x,z] of [[0,7.5],[49,-36.5]]){place(p,x,z);assert.equal(craftRecipe(g,p,'bloom_relay').ok,false);assert.equal(JSON.stringify(p.char),before);}
  place(p,38,-36.5);
  p.char.brineStage=2;assert.equal(craftRecipe(g,p,'bloom_relay').ok,false);p.char.brineStage=3;
  p.char.equipped.device='conductive_membrane';assert.equal(craftRecipe(g,p,'bloom_relay').ok,false);p.char.equipped.device=null;
  p.combatUntil=g.time+1000;assert.equal(craftRecipe(g,p,'bloom_relay').ok,false);p.combatUntil=0;
  assert.equal(JSON.stringify(p.char),before);
  assert.ok(craftRecipe(g,p,'bloom_relay').ok);
  assert.deepEqual(p.char.inventory,['bloom_relay']);assert.deepEqual(p.char.materials,{});
  assert.ok(equipItem(g,p,'bloom_relay').ok);
  const after=JSON.stringify(p.char);assert.equal(craftRecipe(g,p,'bloom_relay').ok,false);assert.equal(JSON.stringify(p.char),after);
});
test('preview is pure and rejects missing inputs, ineligible characters and duplicate outputs',()=>{
  const c=fixture(),before=JSON.stringify(c);assert.ok(previewRecipe(c,'bloom_relay').ok);assert.equal(JSON.stringify(c),before);
  for(const variant of [{level:1},{cls:'vanguard'},{attunements:[]},{materials:{culture_matrix:1}},{inventory:['conductive_membrane']},{inventory:[...c.inventory,'bloom_relay']}])assert.equal(previewRecipe({...c,...variant},'bloom_relay').ok,false);
});
for(const relayed of [false,true])test('Surge '+(relayed?'moves to the Conductor at 7m':'retains the original Mender at 10m'),()=>{
  const g=makeGame(),c=fixture();
  if(relayed){c.inventory=['bloom_relay'];c.equipped.device='bloom_relay';}
  const p=g.addPlayer(c),near=g.addPlayer(makeChar('vanguard')),edge=g.addPlayer(makeChar('vanguard')),remote=g.addPlayer(makeChar('vanguard'));
  place(p,0,25);p.companion.x=20;p.companion.z=25;
  place(near,2,25);place(edge,8,25);place(remote,20,25);
  for(const a of [near,edge,remote])a.hp=20;
  const source=relayed?p:p.companion,initial=p.res;
  assert.ok(useAbility(g,p,'overgrowth_surge').ok);assert.equal(p.res,initial-40);
  assert.equal(near.hp>20,relayed);assert.equal(edge.hp,20);assert.equal(remote.hp>20,!relayed);
  assert.ok(g.events.some(e=>e.e==='fx'&&e.k==='surge'&&e.s===source.id&&e.r===(relayed?7:10)));
  assert.equal(useAbility(g,p,'overgrowth_surge').ok,false);
});
