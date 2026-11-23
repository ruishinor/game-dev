import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildWardenRifleConduits,createWardenRifleFx} from '../client/src/warden-rifle-fx.js';

test('carbine and marksman signals are different, bounded and strictly rifle-local',()=>{
 for(const [id,L] of [['carbine',.93],['marksman',1.09]]){
   const root=new THREE.Group();
   const fx=createWardenRifleFx(root,{id,length:L,optic:[.7,.8,.9]});
   assert.equal(fx.group.parent,root);
   assert.equal(fx.inspect().local,true);
   assert.equal(fx.inspect().draws,1);
   assert.equal(fx.inspect().emitsProjectiles,false);
   assert.ok(fx.group.name.includes(id==='carbine'?'Carbine':'Marksman'));
   const p=fx.group.geometry.getAttribute('position');
   for(let i=0;i<p.count;i++){
     assert.ok(Math.abs(p.getX(i))<.065,'conduits lie within the 0.13m-wide top rail');
     if(fx.group.geometry.getAttribute('aLane').getX(i)===0)
       assert.ok(Math.abs(p.getX(i))>.0475,'power conduits clear the 0.095m-wide optic housing');
     assert.ok(p.getZ(i)<=L*.24,'conduits stop at the actual rail end, not a floating muzzle ornament');
     assert.ok(p.getZ(i)>-L*.20,'conduits start inside the actual rail');
   }
   fx.update(.2,{effectsQuality:2,cameraDistance:4});
   assert.equal(fx.group.material.uniforms.uMotion.value,1);
   fx.update(.2,{effectsQuality:0,reducedMotion:true,cameraDistance:4});
   assert.equal(fx.group.material.uniforms.uMotion.value,0);
   assert.equal(fx.group.material.uniforms.uQuality.value,0);
   fx.update(.2,{cameraDistance:60});
   assert.equal(fx.group.visible,false);
   fx.dispose();
   assert.equal(root.children.length,0);
 }
});
test('marksman carries longer calibration markings than carbine without extra draw calls',()=>{
 const c=buildWardenRifleConduits(.93,'carbine');
 const m=buildWardenRifleConduits(1.09,'marksman');
 assert.ok(m.getAttribute('position').count>c.getAttribute('position').count);
 assert.equal(c.getAttribute('aLane').count,c.getAttribute('position').count);
 assert.equal(m.getAttribute('aProgress').count,m.getAttribute('position').count);
 assert.ok(m.index.count>c.index.count);
 c.dispose();m.dispose();
});

test('rifle-local effects reject invalid frame deltas and enforce the 24m visibility boundary',()=>{
  const root=new THREE.Group();
  const fx=createWardenRifleFx(root,{id:'carbine',length:.93,optic:[.7,.8,.9]});
  fx.update(Number.POSITIVE_INFINITY,{cameraDistance:24,effectsQuality:2});
  assert.equal(fx.inspect().clock,0,'nonfinite frame delta does not advance time');
  assert.equal(fx.group.visible,false,'no effect allocation beyond the bounded viewing radius');
  fx.update(1,{cameraDistance:23.999,effectsQuality:2});
  assert.equal(fx.inspect().clock,.3,'long stalls are time-clamped for stable instrumentation');
  assert.equal(fx.group.visible,true,'local contact marking appears only when in range');
  fx.dispose();
  assert.equal(root.children.length,0);
});
