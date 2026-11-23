import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WARDEN_PRIMARY_WEAPONS, createWardenCombatRod, syncWardenCombatRod } from '../client/src/warden-combat-rod.js';

function rig(){
 const root=new THREE.Group();root.name='halo-test-rig';
 for(const side of ['r','l']){
  const sign=side==='r'?1:-1;
  const upper=new THREE.Bone();upper.name='upperarm_'+side;upper.position.set(sign*.26,1.43,0);
  root.add(upper);
  const lower=new THREE.Bone();lower.name='lowerarm_'+side;lower.position.set(sign*.16,-.26,.02);
  upper.add(lower);
  const hand=new THREE.Bone();hand.name='hand_'+side;hand.position.set(sign*.05,-.24,.10);
  lower.add(hand);
 }
 root.updateMatrixWorld(true);
 return root;
}

test('Warden primary assignment is rifle, rod, rifle, rod',()=>{
 assert.deepEqual([...WARDEN_PRIMARY_WEAPONS],['rifle','combat-rod','rifle','combat-rod']);
 assert.equal(Object.isFrozen(WARDEN_PRIMARY_WEAPONS),true);
});

test('a Warden rod is always joined and fully energized, anchored to the live palm',()=>{
 const root=rig();
 const weapon=createWardenCombatRod(root,1);
 assert.ok(weapon,'rig and combat rod can be constructed');
 const stave={visible:true};
 try{
  assert.equal(syncWardenCombatRod(weapon,stave,1/60,{t:0}),'combat-rod');
  const fit=weapon.inspect();
  assert.equal(fit.mode,'ready');
  assert.ok(fit.gripError<.015);
  assert.equal(fit.joined,true);
  assert.equal(fit.energized,true);
  assert.equal(fit.energy,1);
  assert.equal(fit.coronaVisible,2);
  assert.ok(fit.shaftVerticality > .2 && fit.shaftVerticality < .65,
    'charged rod must remain in low-ready diagonal, not obscure head ring');
  assert.equal(weapon.group.parent?.name,'hand_r');
  assert.equal(weapon.group.visible,true);
  assert.equal(stave.visible,false);
  // Fully powered does not require an attacking corona on a neutral NPC:
  // retain visible sheath/filaments while avoiding an opaque plasma halo.
  for(const half of [0,1]){
   const sheath=weapon.group.getObjectByName('RodPlasmaSheath'+half);
   const halo=weapon.group.getObjectByName('RodPlasmaHalo'+half);
   assert.ok(sheath?.visible && sheath.material.opacity>.10,'energized shaft sheath remains visible');
   assert.ok(halo && halo.material.opacity<.08,'idle plasma halo must not overwhelm the shaft');
   const emitter=weapon.group.getObjectByName('RodEmitterGlow'+half);
   assert.ok(emitter?.scale.x<.26 && emitter.scale.y<.26,
     'neutral sentry emitter remains legible without oversized light sprites');
  }
  const filaments=[];
  weapon.group.traverse(o=>{if(/^ElectricalFilament[01]$/.test(o.name))filaments.push(o);});
  assert.equal(filaments.length,4,'both joined rod halves retain two filaments');
  assert.ok(filaments.every(o=>o.visible&&o.scale.x<.8&&o.scale.z<.8),
    'warden-only filaments are narrower than the combat presentation');
  root.position.set(1,0,-2);
  root.rotation.y=.55;
  root.updateMatrixWorld(true);
  for(let i=0;i<5;i++){
   assert.equal(syncWardenCombatRod(weapon,stave,1/30,{t:i/30}),'combat-rod');
   assert.ok(weapon.inspect().gripError<.015);
  }
  assert.equal(syncWardenCombatRod(weapon,stave,1/30,{effectsQuality:0,rodCalm:true}),'combat-rod');
  assert.equal(weapon.inspect().energy,1,'low quality and reduced flashes never power down the rod');
  assert.equal(weapon.inspect().coronaVisible,2,'the powered core remains in low graphics quality');
 }finally{weapon.dispose();}
});

test('an incompatible rod rig preserves the original fallback without giving combat abilities',()=>{
 const missing=new THREE.Group();
 assert.equal(createWardenCombatRod(missing,3),null);
 const stave={visible:false};
 assert.equal(syncWardenCombatRod(null,stave,0),'stave');
 assert.equal(stave.visible,true);
});
