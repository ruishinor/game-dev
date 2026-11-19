import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildSanctumFabricator} from '../client/src/sanctum-fabricator.js';
import {SANCTUM_FABRICATOR,inSanctum,OBJECTS} from '../shared/world.js';
import {makeGame,makeChar,place} from './helpers.js';
import {craftRecipe,interact} from '../server/sim/progress.js';
import {workshopSite} from '../shared/survey.js';
test('Sanctum fabrication is local to the physical precision cell',()=>{
 const near={x:SANCTUM_FABRICATOR.x,z:SANCTUM_FABRICATOR.z+2};
 const far={x:-8,z:0};assert.ok(inSanctum(far));assert.equal(workshopSite(near),'sanctum');assert.equal(workshopSite(far),null);
 assert.equal(OBJECTS.filter(o=>o.type==='sanctum_fabricator').length,1);
 const g=buildSanctumFabricator(THREE);const b=new THREE.Box3().setFromObject(g);assert.ok(b.min.x>=-1.4&&b.max.x<=1.4&&b.min.z>=-.78&&b.max.z<=.78&&b.min.y>=-1e-7&&b.max.y<=2.7);
});
test('valid materials cannot be fabricated from the remote half of the Sanctum',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard',{level:2,materials:{mire_fibre:2,sentinel_alloy:2}}));
 const station=g.objects.find(o=>o.type==='sanctum_fabricator');
 place(p,-8,0);const before=JSON.stringify(p.char.materials);
 assert.equal(interact(g,p,station.id).ok,false);assert.equal(craftRecipe(g,p,'field_emitter').ok,false);assert.equal(JSON.stringify(p.char.materials),before);
 place(p,station.x,station.z+2);assert.ok(interact(g,p,station.id).ok);assert.ok(p.outbox.some(e=>e.e==='workshop_open'));assert.ok(craftRecipe(g,p,'field_emitter').ok);
});
