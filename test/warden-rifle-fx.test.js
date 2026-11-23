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
     assert.ok(Math.abs(p.getX(i))<.10,'conduits lie within existing rail');
     assert.ok(p.getZ(i)<L*.35,'not a muzzle flash or muzzle-mounted ring');
     assert.ok(p.getZ(i)>-L*.25);
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
