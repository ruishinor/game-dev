import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {syncWardenWeapon,alignWardenWrist,restoreWardenWristIfUnanimated} from '../client/src/warden-rifles.js';

test('rifle remains visible only when it can fit, with a retained visible stave',()=>{
 const rifle={group:{visible:true},update:()=>true},stave={visible:true};
 assert.equal(syncWardenWeapon(rifle,stave),'rifle');
 assert.equal(rifle.group.visible,true);
 assert.equal(stave.visible,false);
 rifle.update=()=>false;
 assert.equal(syncWardenWeapon(rifle,stave),'stave');
 assert.equal(rifle.group.visible,false);
 assert.equal(stave.visible,true);
 rifle.update=()=>true;
 assert.equal(syncWardenWeapon(rifle,stave),'rifle');
 assert.equal(rifle.group.visible,true);
 assert.equal(stave.visible,false);
});

test('source unavailable or rig incompatible cannot leave an invisible fallback',()=>{
 const stave={visible:false};
 assert.equal(syncWardenWeapon(null,stave),'stave');
 assert.equal(stave.visible,true);
 assert.equal(syncWardenWeapon(null,null),'unarmed');
});


test('bounded wrist correction aligns a real finger direction without moving a live grip',()=>{
 const shoulder=new THREE.Bone(),hand=new THREE.Bone(),finger=new THREE.Bone();
 hand.position.set(.16,-.24,.10);finger.position.set(0,0,.10);
 shoulder.add(hand);hand.add(finger);shoulder.rotation.set(0,.31,.12);
 shoulder.updateMatrixWorld(true);
 const before=hand.getWorldPosition(new THREE.Vector3());
 const target=new THREE.Vector3(0,-1,0);
 const prior=finger.getWorldPosition(new THREE.Vector3()).sub(before).normalize().angleTo(target);
 const result=alignWardenWrist(hand,finger,target,.23);
 shoulder.updateMatrixWorld(true);
 const after=hand.getWorldPosition(new THREE.Vector3());
 const residual=finger.getWorldPosition(new THREE.Vector3()).sub(after).normalize().angleTo(target);
 assert.ok(before.distanceTo(after)<1e-10,'wrist rotation must not detach from the rifle');
 assert.ok(result.appliedDeg>0&&result.appliedDeg<=THREE.MathUtils.radToDeg(.23)+1e-6);
 assert.ok(Math.abs(prior-residual-.23)<1e-6,'finger angle improves by bounded amount');
 assert.ok(Math.abs(result.residualDeg-THREE.MathUtils.radToDeg(residual))<1e-6);
 assert.ok(shoulder.quaternion.angleTo(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,.31,.12)))<1e-6,
  'wrist correction does not overwrite the upper-arm watch pose');
});

test('missing or degenerate finger data never rotates the wrist',()=>{
 const hand=new THREE.Bone(),finger=new THREE.Bone();hand.add(finger);
 assert.deepEqual(alignWardenWrist(hand,null,new THREE.Vector3(0,-1,0)),
  {appliedDeg:0,residualDeg:null});
 assert.deepEqual(alignWardenWrist(hand,finger,new THREE.Vector3(0,-1,0)),
  {appliedDeg:0,residualDeg:null});
 assert.deepEqual(alignWardenWrist(hand,finger,new THREE.Vector3(0,0,0)),
  {appliedDeg:0,residualDeg:null});
 assert.equal(hand.quaternion.angleTo(new THREE.Quaternion()),0);
});


test('watch frames restore only their own previous wrist offset, not a fresh mixer pose',()=>{
 const hand=new THREE.Bone();
 const authored=new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,.2,-.07));
 const corrected=new THREE.Quaternion().setFromEuler(new THREE.Euler(.31,.2,-.07));
 hand.quaternion.copy(corrected);
 assert.equal(restoreWardenWristIfUnanimated(hand,authored,corrected),true);
 assert.ok(hand.quaternion.angleTo(authored)<1e-6,'no cumulative wrist rotation across idle frames');
 const freshlyAnimated=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.2,.1,.04));
 hand.quaternion.copy(freshlyAnimated);
 assert.equal(restoreWardenWristIfUnanimated(hand,authored,corrected),false);
 assert.ok(hand.quaternion.angleTo(freshlyAnimated)<1e-6,'preserves updated watch animation');
});
