import test from 'node:test';import assert from 'node:assert/strict';
import {ASSEMBLY_NODES,ASSEMBLY_IDS,assemblyEdges,assemblyNodeState} from '../client/src/weapon-assembly-model.js';
import {RECIPES} from '../shared/crafting.js';
import {makeChar} from './helpers.js';

test('all seven nodes resolve to real recipes and output IDs; graph edges derive from actual inputs',()=>{
 assert.equal(ASSEMBLY_IDS.length,7);assert.equal(new Set(ASSEMBLY_IDS).size,7);
 for(const node of ASSEMBLY_NODES){
  const recipe=RECIPES[node.recipe];assert.ok(recipe,node.recipe);
  assert.equal(recipe.output.material||recipe.output.item,node.id);
 }
 const edges=assemblyEdges();assert.equal(edges.length,7);
 const names=edges.map(x=>x.from+'>'+x.to);
 for(const e of ['phase_lens>pulse_module','pulse_cell>pulse_module','pulse_housing>relay_frame',
  'pulse_housing>patrol_arc_sidearm','pulse_module>patrol_arc_sidearm',
  'pulse_module>relay_arc_carbine','relay_frame>relay_arc_carbine'])assert.ok(names.includes(e),e);
 assert.deepEqual(RECIPES.combine_pulse_module.inputs,{vector_matrix:1,pulse_cell:1});
});
test('node state reflects actual owned components, site, blueprint, combat and requirements',()=>{
 const c=makeChar('surveyor',{level:4,brineStage:3,survey:'signal_done',attunements:['resonance'],
  materials:{relay_frame:1,pulse_module:1,resonance_fragment:1},inventory:[]});
 const locked=assemblyNodeState(c,'brine_engineering','relay_arc_carbine');
 assert.equal(locked.ready,false);assert.equal(locked.blueprint,'blueprint_relay_arc_carbine');
 assert.equal(locked.status,'Blueprint locked');
 c.goods={blueprint_relay_arc_carbine:1};
 assert.equal(assemblyNodeState(c,'sanctum','relay_arc_carbine').ready,false);
 assert.equal(assemblyNodeState(c,'brine_engineering','relay_arc_carbine').ready,true);
 assert.equal(assemblyNodeState(c,'brine_engineering','relay_arc_carbine',true).ready,false);
 delete c.materials.relay_frame;
 const missing=assemblyNodeState(c,'brine_engineering','relay_arc_carbine');
 assert.equal(missing.ready,false);assert.deepEqual(missing.missing,[{id:'relay_frame',have:0,need:1}]);
 c.inventory.push('patrol_arc_sidearm');
 assert.equal(assemblyNodeState(c,'sanctum','patrol_arc_sidearm').owned,1);
 assert.equal(assemblyNodeState(c,'sanctum','constructor'),null);
});
