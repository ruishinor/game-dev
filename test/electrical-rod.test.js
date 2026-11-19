import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3,Bone,Group} from 'three';
import {createElectricalRod,createHeldElectricalRod,createElectricalRodVfx,rodPose,ROD} from '../client/src/electrical-rod.js';
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} vs ${b}`);
test('two matching original meshes share geometry and form a centered continuous rod',()=>{
 const rod=createElectricalRod();
 try{
  const [a,b]=rod.halves;
  const meshes=h=>h.children.filter(o=>o.isMesh);
  assert.equal(meshes(a).length,8);assert.equal(meshes(b).length,8);
  meshes(a).forEach((m,i)=>{assert.equal(m.geometry,meshes(b)[i].geometry);assert.equal(m.material,meshes(b)[i].material);assert.ok(m.geometry.getAttribute('position').count>0);});
  const left=rod.anchor(1,'Coupler'),right=rod.anchor(0,'Coupler');
  assert.ok(left.distanceTo(right)>.45);
  rod.setMode('rod');rod.update(2);
  near(rod.anchor(0,'Coupler').distanceTo(rod.anchor(1,'Coupler')),0);
  const bounds=new Box3().setFromObject(rod.group);
  near(bounds.max.y,ROD.halfLength);near(bounds.min.y,-ROD.halfLength);
  near(rod.anchor(0,'Tip').distanceTo(rod.anchor(1,'Tip')),1.5);
 }finally{rod.dispose();}
});
test('transformation reverses without a discontinuous pose and separates before pivot',()=>{
 const rod=createElectricalRod();
 try{
  rod.setMode('rod');rod.update(.4);
  const p=rod.progress,point=rod.anchor(1,'Tip');
  rod.setMode('dual');rod.update(0);
  near(rod.progress,p);near(point.distanceTo(rod.anchor(1,'Tip')),0);
  rod.update(2);near(rod.progress,0);
  for(let i=0;i<=100;i++){
   const q=rodPose(i/100);
   assert.ok(q.right.x>=0&&q.left.x<=0);
   if(i<66)near(q.right.x,ROD.splitOffset);
   else near(q.left.angle,Math.PI);
  }
  rod.setMode('rod');rod.update(0,{reducedMotion:true});near(rod.progress,1);
  assert.throws(()=>rod.setMode('unknown'));
 }finally{rod.dispose();}
});
test('short local VFX only, bounded emission, no light or gameplay mutation',()=>{
 const rod=createElectricalRod();
 try{
  let n=0,bursts=0;
  const vfx={quality:2,reducedMotion:false,lightning(o){n++;assert.ok(o.life<.2&&o.width<.02);assert.ok(o.from().distanceTo(o.to())<.2);},burst(){bursts++;}};
  const fx=createElectricalRodVfx(rod,vfx);
  fx.update(.01);assert.equal(n,2);fx.update(.01);assert.equal(n,2);
  fx.update(.6,{energized:false});assert.equal(n,2);
  vfx.reducedMotion=true;fx.update(.6);assert.equal(n,2);
  vfx.quality=0;fx.impact(new Vector3());assert.equal(bursts,0);
 }finally{rod.dispose();}
});

test('joined equipped model follows its hand and disposes independently',()=>{
 const scene=new Group(),hand=new Bone();hand.name='hand_r';scene.add(hand);
 const palm=new Vector3(.02,.04,.03),axis=new Vector3(0,0,1),rod=createHeldElectricalRod(hand,{axis,palm});
 try{
  near(rod.progress,1);assert.equal(rod.group.parent,hand);
  near(rod.anchor(0,'Grip').distanceTo(hand.localToWorld(palm.clone())),0);
  hand.position.set(2,1,3);hand.rotation.set(.4,.2,1.2);scene.updateMatrixWorld(true);
  near(rod.anchor(0,'Grip').distanceTo(hand.localToWorld(palm.clone())),0);
  near(rod.anchor(0,'Coupler').distanceTo(rod.anchor(1,'Coupler')),0);
 }finally{rod.dispose();}
 assert.equal(hand.getObjectByName('HeldElectricalCombatRod'),undefined);
});
