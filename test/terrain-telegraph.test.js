import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {buildTerrainTelegraphGeometry,TELEGRAPH_TERRAIN_BUDGET} from '../client/src/terrain-telegraph.js';

test('hostile telegraph border and marked area follow uneven terrain instead of floating or clipping',()=>{
 const terrain=(x,z)=>.27*x-.18*z+.2*Math.sin(x*.6+z*.4);
 const x=21,z=31,r=4.5;
 const g=buildTerrainTelegraphGeometry(T,x,z,r,terrain);
 assert.equal(TELEGRAPH_TERRAIN_BUDGET.geometries,2);
 for(const geo of [g.edge,g.disc]){
  const p=geo.attributes.position;
  assert.ok(p.count>=96);
  for(let i=0;i<p.count;i++){
   const expected=terrain(x+p.getX(i),z+p.getZ(i))-terrain(x,z)+(geo===g.edge?.14:.12);
   assert.ok(Math.abs(p.getY(i)-expected)<.00001,'every warning vertex conforms to the ground');
  }
 }
 g.edge.dispose();g.disc.dispose();
});
test('warning shapes reject non-finite and excessive input without creating geometry',()=>{
 const ground=(x,z)=>0;
 for(const radius of [-1,0,90,NaN,Infinity])
  assert.throws(()=>buildTerrainTelegraphGeometry(T,0,0,radius,ground),/Invalid telegraph/);
 assert.throws(()=>buildTerrainTelegraphGeometry(T,0,0,4,()=>NaN),/Invalid ground/);
});
