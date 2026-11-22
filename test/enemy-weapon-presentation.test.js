import test from 'node:test';
import assert from 'node:assert/strict';
import {ENEMIES} from '../shared/content.js';
import {SEVERANCE_PATROLS} from '../server/sim/severance-patrols.js';
import {SEVERANCE_SOLDIER_ROD,enemyWeaponPresentation} from '../client/src/enemy-weapon-presentation.js';

test('Severance soldiers and sergeants visibly carry melee-appropriate electrical combat rods',()=>{
 assert.equal(ENEMIES.severance_soldier.attack.kind,'melee');
 assert.equal(ENEMIES.severance_soldier.attack.range,2.4);
 const squads=SEVERANCE_PATROLS.filter(p=>p.type==='severance_soldier');
 assert.ok(squads.length>=12);
 for(const p of squads) {
   const weapon=enemyWeaponPresentation({k:'e',c:p.type});
   assert.equal(weapon,SEVERANCE_SOLDIER_ROD);
   assert.equal(weapon.mode,'rod');
   assert.equal(weapon.rodClass,'vanguard');
 }
});
test('weapons do not appear on unrelated NPCs, drones, hostile types or players',()=>{
 for(const k of ['p','o','c',null])assert.equal(enemyWeaponPresentation({k,c:'severance_soldier'}),null);
 for(const c of ['skitter','sentinel','turret_drone','unknown'])
   assert.equal(enemyWeaponPresentation({k:'e',c}),null);
});
