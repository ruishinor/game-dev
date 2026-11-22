import test from 'node:test';
import assert from 'node:assert/strict';
import {materialUses} from '../client/src/material-uses.js';

test('material uses list known recipes, not unlearned commissioning or wrong profession recipes',()=>{
 const basic={cls:'vanguard',brineStage:0,survey:null};
 assert.deepEqual(materialUses(basic,'kinetic_coupler').map(r=>[r.id,r.quantity]),[['calibrate_servo',1]]);
 const commissioned={...basic,brineStage:3,survey:'signal_done'};
 assert.deepEqual(materialUses(commissioned,'kinetic_coupler').map(r=>[r.id,r.quantity]),[['bastion_rifle',2],['assemble_dense_core_modular',2],['dense_pulse_core',2],['calibrate_servo',1],['aegis_rectifier',1]]);
 assert.ok(!materialUses({...commissioned,cls:'keeper'},'kinetic_coupler').some(r=>r.id==='aegis_rectifier'));
});
test('unknown material and invalid or absent character do not reveal a list',()=>{
 assert.deepEqual(materialUses(null,'kinetic_coupler'),[]);
 assert.deepEqual(materialUses({cls:'vanguard'},'constructor'),[]);
 assert.deepEqual(materialUses({cls:'constructor'},'kinetic_coupler'),[]);
});
