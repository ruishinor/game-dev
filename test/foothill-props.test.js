import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD,ZONES,PROPS,COLLIDERS,groundHeight} from '../shared/world.js';

test('foothill trees and boulders have ground support, clearance and authoritative footprints',()=>{
 const props=PROPS.filter(p=>p.foothill);
 assert.equal(props.filter(p=>p.type==='conduit').length,10);
 assert.equal(props.filter(p=>p.type==='rock').length,6);
 for(const p of props){
  assert.ok(COLLIDERS.includes(p));
  assert.ok(Math.hypot(p.x,p.z)+p.r+1<WORLD.radius-9);
  for(const zone of Object.values(ZONES))assert.ok(Math.hypot(p.x-zone.x,p.z-zone.z)>=zone.r+p.r+5.5);
  const heights=[groundHeight(p.x,p.z)];
  for(let i=0;i<8;i++){
   const a=i*Math.PI/4;
   heights.push(groundHeight(p.x+Math.cos(a)*(p.r+.25),p.z+Math.sin(a)*(p.r+.25)));
  }
  assert.ok(Math.max(...heights)-Math.min(...heights)<=.42);
 }
});
