import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildSanctumFabricator} from '../client/src/sanctum-fabricator.js';
import {SANCTUM_FABRICATOR,inSanctum,OBJECTS} from '../shared/world.js';
import {workshopSite} from '../shared/survey.js';
test('Sanctum fabrication is local to the physical precision cell',()=>{
 const near={x:SANCTUM_FABRICATOR.x,z:SANCTUM_FABRICATOR.z+2};
 const far={x:-8,z:0};assert.ok(inSanctum(far));assert.equal(workshopSite(near),'sanctum');assert.equal(workshopSite(far),null);
 assert.equal(OBJECTS.filter(o=>o.type==='sanctum_fabricator').length,1);
 const g=buildSanctumFabricator(THREE);const b=new THREE.Box3().setFromObject(g);assert.ok(b.min.x>=-1.4&&b.max.x<=1.4&&b.min.z>=-.78&&b.max.z<=.78&&b.min.y>=-1e-7&&b.max.y<=2.7);
});
