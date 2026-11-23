import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PROPS } from '../shared/world.js';
import { buildRelayTower } from '../client/src/relay-tower.js';
import { RELAY_FX_BUDGET, createReachRelayFx } from '../client/src/reach-relay-fx.js';

function fixture(){
 const prop=PROPS.find(p=>p.type==='relaytower');
 assert.ok(prop);
 const tower=buildRelayTower(THREE,prop);
 tower.group.position.set(prop.x,0,prop.z);
 const calls={arcs:0,bursts:0};
 const vfx={quality:2,reducedMotion:false,
   lightning(){calls.arcs++;},burst(){calls.bursts++;}};
 const fx=createReachRelayFx(THREE,tower.group,vfx);
 return {tower,fx,vfx,calls,focus:{x:prop.x,z:prop.z}};
}
test('Relay fault is fitted to the actual service cabinet and never uses global VFX pools',()=>{
 const {tower,fx,calls,focus}=fixture();
 const group=tower.group.getObjectByName('relay:local-fault');
 const arc=group?.getObjectByName('relay:contact-arc');
 const sparks=group?.getObjectByName('relay:local-sparks');
 assert.ok(group&&arc&&sparks);
 assert.equal(group.parent,tower.group,'local effects must follow the actual cabinet');
 assert.equal(sparks.isInstancedMesh,true);
 assert.equal(sparks.count,RELAY_FX_BUDGET.sparks);
 assert.equal(RELAY_FX_BUDGET.localDraws,2);
 assert.equal(arc.material.depthWrite,false);
 const bounds=new THREE.Box3().setFromObject(arc);
 assert.ok(bounds.min.x>1.1&&bounds.max.x<1.6);
 assert.ok(bounds.min.y>1.0&&bounds.max.y<1.7);
 for(let i=0;i<25;i++)fx.update(.1,focus);
 assert.equal(fx.stats().activations,1);
 assert.equal(fx.stats().globalEmissions,0);
 assert.equal(calls.arcs,0);
 assert.equal(calls.bursts,0);
 for(let i=0;i<30;i++)fx.update(.1,focus);
 assert.equal(fx.stats().activations,1,'no per-frame fault spam');
 fx.dispose();fx.dispose();tower.dispose();
 assert.equal(tower.group.getObjectByName('relay:local-fault'),undefined);
});
test('Relay preserves near, quality and reduced-motion gating without global emissions',()=>{
 const {tower,fx,vfx,calls,focus}=fixture();
 for(let i=0;i<30;i++)fx.update(.1,{x:focus.x+100,z:focus.z});
 assert.equal(fx.stats().activations,0);
 vfx.quality=0;
 for(let i=0;i<30;i++)fx.update(.1,focus);
 assert.equal(fx.stats().activations,0);
 vfx.quality=2;vfx.reducedMotion=true;
 for(let i=0;i<30;i++)fx.update(.1,focus);
 assert.equal(fx.stats().activations,0);
 vfx.reducedMotion=false;
 for(let i=0;i<25;i++)fx.update(.1,focus);
 assert.equal(fx.stats().activations,1);
 assert.equal(calls.arcs+calls.bursts,0);
 fx.dispose();
 for(let i=0;i<50;i++)fx.update(.1,focus);
 assert.equal(fx.stats().activations,1);
 tower.dispose();
});
