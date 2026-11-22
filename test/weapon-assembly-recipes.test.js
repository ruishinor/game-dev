import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEMS} from '../shared/content.js';
import {MATERIALS,RECIPES,previewRecipe} from '../shared/crafting.js';
import {GOODS} from '../shared/goods.js';
import {blueprintDrop} from '../server/sim/loot-tables.js';
import {publicWeaponVisual} from '../shared/weapon-visual.js';
import {makeChar,makeGame,place} from './helpers.js';
import {craftRecipe,equipItem} from '../server/sim/progress.js';
import {effectiveAuto} from '../shared/condition.js';

test('diagram components are real counted, consumed recipe inputs',()=>{
 assert.deepEqual(RECIPES.combine_optic_pulse_module.inputs,{phase_lens:1,pulse_cell:1});
 assert.deepEqual(RECIPES.machine_relay_frame.inputs,{pulse_housing:1,sentinel_alloy:2});
 assert.deepEqual(RECIPES.assemble_patrol_arc_sidearm.inputs,{pulse_module:1,pulse_housing:1});
 assert.deepEqual(RECIPES.assemble_relay_arc_carbine.inputs,{pulse_module:1,relay_frame:1,resonance_fragment:1});
 assert.ok(MATERIALS.phase_lens&&MATERIALS.relay_frame);
 assert.deepEqual(RECIPES.combine_pulse_module.inputs,{vector_matrix:1,pulse_cell:1},'existing modular Dense route preserved');
 assert.equal(ITEMS.patrol_arc_sidearm.slot,'ranged');assert.equal(ITEMS.relay_arc_carbine.slot,'ranged');
 assert.equal(ITEMS.relay_arc_carbine.ql,5);assert.equal(GOODS.blueprint_relay_arc_carbine.cap,1);
});
test('server rejects unavailable blueprints and atomically consumes modular components',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('surveyor',{level:4,attunements:['resonance'],brineStage:3,survey:'signal_done',materials:{pulse_module:2,pulse_housing:1,relay_frame:1,resonance_fragment:1}}));
 place(p,0,7.5);
 assert.ok(craftRecipe(g,p,'assemble_patrol_arc_sidearm').ok);
 assert.ok(p.char.inventory.includes('patrol_arc_sidearm'));
 const stock=JSON.stringify(p.char.materials);
 place(p,49,-36.5);
 assert.equal(previewRecipe(p.char,'assemble_relay_arc_carbine').ok,false);
 assert.equal(craftRecipe(g,p,'assemble_relay_arc_carbine').ok,false);
 assert.equal(JSON.stringify(p.char.materials),stock,'no consumption on unauthorized fabrication');
 p.char.goods={blueprint_relay_arc_carbine:1};
 assert.ok(craftRecipe(g,p,'assemble_relay_arc_carbine').ok);
 assert.equal(p.char.goods.blueprint_relay_arc_carbine,1,'blueprint retained');
 assert.ok(p.char.inventory.includes('relay_arc_carbine'));
 assert.ok(equipItem(g,p,'relay_arc_carbine').ok);
 assert.equal(effectiveAuto(p.char).weapon,'relay_arc_carbine');
 assert.equal(publicWeaponVisual({...p.char,activeWeapon:'ranged'}),'longpoint');
 assert.equal(craftRecipe(g,p,'assemble_relay_arc_carbine').ok,false);
});
test('annex-specific rare knowledge roll is server-only and does not alter ordinary Sentinel distribution',()=>{
 assert.equal(blueprintDrop('sentinel',()=>.01,true),'blueprint_relay_arc_carbine');
 assert.equal(blueprintDrop('sentinel',()=>.04,true),'blueprint_relay_vest');
 assert.equal(blueprintDrop('sentinel',()=>.07,true),null);
 assert.equal(blueprintDrop('sentinel',()=>.01,false),'blueprint_relay_vest');
 assert.equal(blueprintDrop('warden',()=>.01,true),null);
});
