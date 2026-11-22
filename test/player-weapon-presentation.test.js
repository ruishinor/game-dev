import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createLongpointPresentation} from '../client/src/longpoint.js';
import {createHeldElectricalRod} from '../client/src/electrical-rod.js';

const rig=()=>{
 const model=new THREE.Group();model.name='player:humanoid';
 const spine=new THREE.Bone();spine.name='spine_03';spine.position.y=1.05;model.add(spine);
 for(const side of ['r','l']){
  const sign=side==='r'?-1:1;
  const upper=new THREE.Bone();upper.name='upperarm_'+side;
  upper.position.set(sign*.25,1.32,0);model.add(upper);
  const lower=new THREE.Bone();lower.name='lowerarm_'+side;
  lower.position.set(sign*.23,-.18,0);upper.add(lower);
  const hand=new THREE.Bone();hand.name='hand_'+side;
  hand.position.set(sign*.22,-.12,0);lower.add(hand);
 }
 model.updateMatrixWorld(true);
 return {model,spine};
};

test('player Longpoint falls back to an actual spine-mounted rifle on unreachable grips',()=>{
 const {model,spine}=rig();
 const prop=new THREE.Group();prop.name='Longpoint';
 for(const name of ['GripAnchor','SupportAnchor','EffectAnchor']){
  const marker=new THREE.Object3D();marker.name=name;
  marker.position.set(name==='SupportAnchor'?30:.15,.1,.2);
  prop.add(marker);
 }
 let releases=0;
 const stowTransform={position:new THREE.Vector3(0,.3,-.25),quaternion:new THREE.Quaternion()};
 const carry=createLongpointPresentation(THREE,model,prop,()=>{releases++},{stowBone:spine,stowTransform});
 assert.ok(carry,'valid skeleton and authored anchors');
 assert.equal(carry.update({dead:false,air:false,hideWeapon:false}),false);
 assert.equal(carry.inspect().mode,'stowed');
 assert.equal(carry.inspect().reason,'unreachable-grips');
 assert.equal(carry.inspect().failures,1);
 assert.equal(prop.parent,spine);
 assert.equal(prop.visible,true);
 assert.ok(prop.position.distanceTo(stowTransform.position)<1e-6);
 assert.equal(carry.origin(),null,'no muzzle effects while the rifle is stowed');
 assert.equal(carry.fire(),false,'presentation fallback is not an active shot');
 carry.update({dead:true});
 assert.equal(carry.inspect().mode,'hidden');
 assert.equal(prop.visible,false);
 carry.dispose();
 assert.equal(releases,1,'one and only one instance release');
});

test('player Longpoint with incompatible authored grip falls back to visible back-carry',()=>{
 const {model,spine}=rig();
 const prop=new THREE.Group();
 const grip=new THREE.Object3D();grip.name='GripAnchor';prop.add(grip);
 // SupportAnchor intentionally missing: the GLB is incomplete, not the game.
 const pose=createLongpointPresentation(THREE,model,prop,()=>{},
  {stowBone:spine,stowTransform:{position:new THREE.Vector3(0,.22,-.30),quaternion:new THREE.Quaternion()}});
 assert.ok(pose,'retains valid fallback even with malformed asset');
 assert.equal(pose.inspect().mode,'stowed');
 assert.equal(pose.inspect().reason,'missing-grip-anchors');
 assert.equal(prop.parent,spine);
 assert.equal(prop.visible,true);
 assert.equal(pose.fire(),false);
 pose.update({dead:true});
 assert.equal(prop.visible,false);
 pose.dispose();
});

test('dual electrical rod is actually aligned with the off-hand grip',()=>{
 const right=new THREE.Bone(),left=new THREE.Bone(),root=new THREE.Group();
 right.name='hand_r';left.name='hand_l';
 right.position.set(-.38,1.05,.15);left.position.set(.38,1.05,.12);
 root.add(right,left);
 const rod=createHeldElectricalRod(right,{axis:new THREE.Vector3(0,0,1),
  palm:new THREE.Vector3(),offHand:left,offAxis:new THREE.Vector3(0,0,1),
  offPalm:new THREE.Vector3(0,.02,0)});
 try{
  rod.setMode('dual');rod.update(0,{reducedMotion:true});
  const grip=rod.gripInfo();
  assert.equal(grip.mode,'dual');
  assert.ok(grip.supportError<1e-5,`off-hand support error ${grip.supportError}`);
  left.position.x+=.16;left.rotation.y=.27;
  rod.update(1/60,{reducedMotion:true});
  assert.ok(rod.gripInfo().supportError<1e-5,'moving left hand still drives authored grip');
  rod.setMode('rod');rod.update(0,{reducedMotion:true});
  assert.equal(rod.gripInfo().mode,'joining');
 }finally{rod.dispose();}
});
