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
test('idle VFX remains local and bounded; reduced motion suppresses arcs',()=>{
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

test('dual hand anchors track independent hands; join and reverse without replacing meshes',()=>{
 const scene=new Group(),right=new Bone(),left=new Bone();
 scene.add(right,left);right.position.set(.32,1.1,.2);left.position.set(-.32,1.15,.3);
 left.rotation.set(.4,.2,-.3);
 const palm=new Vector3(.02,.04,.03),offPalm=new Vector3(-.02,.03,.04);
 const rod=createHeldElectricalRod(right,{palm,offHand:left,offPalm});
 try{
  rod.setMode('dual');rod.update(1.5);
  near(rod.anchor(0,'Grip').distanceTo(right.localToWorld(palm.clone())),0);
  near(rod.anchor(1,'Grip').distanceTo(left.localToWorld(offPalm.clone())),0);
  left.position.x-=.12;left.rotation.y+=.4;rod.update(0);
  near(rod.anchor(1,'Grip').distanceTo(left.localToWorld(offPalm.clone())),0);
  rod.setMode('rod');rod.update(.3);
  const mid=rod.anchor(1,'Tip');rod.setMode('dual');rod.update(0);
  near(mid.distanceTo(rod.anchor(1,'Tip')),0);
  rod.setMode('rod');rod.update(2);
  near(rod.anchor(0,'Coupler').distanceTo(rod.anchor(1,'Coupler')),0);
  near(rod.anchor(0,'Tip').distanceTo(rod.anchor(1,'Tip')),1.5);
 }finally{rod.dispose();}
});

test('runtime emission is independent per half while structural materials and geometry remain shared',()=>{
 const rod=createElectricalRod({independentEmission:true});
 try{
  const [r,l]=rod.halves;
  const right=r.getObjectByName('RodRight_inlay'),left=l.getObjectByName('RodLeft_inlay');
  assert.notEqual(right.material,left.material);assert.equal(right.geometry,left.geometry);
  assert.equal(r.getObjectByName('RodRight_steel').material,l.getObjectByName('RodLeft_steel').material);
  rod.setEnergy(1,.2);near(right.material.emissiveIntensity,3.6);near(left.material.emissiveIntensity,.72);
  rod.setEnergy(Infinity,-1);near(right.material.emissiveIntensity,0);near(left.material.emissiveIntensity,0);
 }finally{rod.dispose();}
});
test('ability-grade impact is bounded, mode-dependent, and cancels remaining handles',()=>{
 const rod=createElectricalRod({independentEmission:true});
 const calls=[],handles=[];
 const vfx={quality:2,reducedMotion:false,calmFlashes:false,intensity:1};
 for(const name of ['lightning','burst','trail','shock','flash']){
  vfx[name]=o=>{calls.push({name,o});const h={age:0,life:o.life??.3};handles.push(h);return h;};
 }
 const fx=createElectricalRodVfx(rod,vfx);
 const p=new Vector3(1,1,1),ground=new Vector3(1,0,1);
 const count=name=>calls.filter(c=>c.name===name).length;
 try{
  assert.equal(fx.impact(p,{ground}),true);
  assert.equal(count('lightning'),4);assert.equal(count('trail'),2);assert.equal(count('shock'),1);assert.equal(count('flash'),1);
  assert.equal(calls.find(c=>c.name==='burst').o.count,36);
  assert.equal(fx.impact(p,{ground}),false,'repeated event cannot spam full effect');
  for(let i=0;i<4;i++)fx.update(.1);
  rod.setMode('rod');rod.update(2);fx.update(.1);calls.length=0;
  assert.equal(fx.impact(p,{ground}),true);
  assert.equal(count('lightning'),5);assert.equal(count('trail'),2);
  assert.equal(calls.find(c=>c.name==='burst').o.count,64);
  assert.ok(calls.find(c=>c.name==='shock').o.radius>1);
  for(const c of calls.filter(c=>c.name==='lightning')){
   assert.ok(c.o.life<=.3&&c.o.branches<=2&&c.o.width<=.025);
   assert.ok(c.o.from().toArray().every(Number.isFinite));assert.ok(c.o.to().toArray().every(Number.isFinite));
  }
  assert.equal(fx.impact(new Vector3(NaN,0,0)),false);
  const attached=calls.filter(c=>['lightning','trail','shock','flash'].includes(c.name));
  assert.ok(attached.length<=10);
  fx.dispose();
  assert.ok(handles.filter(h=>typeof h.life==='number').some(h=>h.done));
  assert.equal(fx.impact(p,{ground}),false);
  const n=calls.length;fx.update(1);assert.equal(calls.length,n);
 }finally{fx.dispose();rod.dispose();}
});
test('comfort and quality tiers suppress intense layers; power and visibility gate emission',()=>{
 const rod=createElectricalRod();
 const calls=[];const vfx={quality:1,reducedMotion:false,calmFlashes:false,intensity:1};
 for(const name of ['lightning','burst','trail','shock','flash'])vfx[name]=o=>{calls.push({name,o});return {age:0,life:.2};};
 const fx=createElectricalRodVfx(rod,vfx),p=new Vector3(),ground=new Vector3();
 try{
  assert.equal(fx.impact(p,{ground}),true);
  assert.ok(calls.every(c=>['lightning','burst'].includes(c.name)));
  assert.ok(calls.filter(c=>c.name==='lightning').every(c=>c.o.branches===0));
  for(let i=0;i<4;i++)fx.update(.1);
  calls.length=0;vfx.quality=2;vfx.calmFlashes=true;
  assert.equal(fx.impact(p,{ground}),true);
  assert.ok(calls.every(c=>['lightning','burst'].includes(c.name)));
  vfx.reducedMotion=true;fx.update(.1);calls.length=0;
  assert.equal(fx.impact(p,{ground}),false);fx.update(.1);assert.equal(calls.length,0);
  vfx.reducedMotion=false;vfx.quality=0;fx.update(.1);assert.equal(calls.length,0);
  vfx.quality=2;fx.update(.1,{energized:false});assert.equal(fx.impact(p),false);
  rod.group.visible=false;fx.update(.1);assert.equal(fx.impact(p),false);assert.equal(calls.length,0);
 }finally{fx.dispose();rod.dispose();}
});
test('transform discharges remain bounded and connection flashes only once',()=>{
 const rod=createElectricalRod();const calls=[];
 const vfx={quality:2,reducedMotion:false,calmFlashes:false,intensity:1};
 for(const name of ['lightning','burst','flash'])vfx[name]=o=>{calls.push({name,o});return {age:0,life:.2};};
 const fx=createElectricalRodVfx(rod,vfx);
 try{
  rod.setMode('rod');
  for(let i=0;i<12;i++){rod.update(.1);fx.update(.1);}
  assert.equal(calls.filter(c=>c.name==='flash').length,1);
  assert.ok(calls.filter(c=>c.name==='lightning').length<=20);
  for(let i=0;i<12;i++)fx.update(.1);
  assert.equal(calls.filter(c=>c.name==='flash').length,1);
 }finally{fx.dispose();rod.dispose();}
});
