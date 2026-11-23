import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3,Bone,Group} from 'three';
import {createElectricalRod,createHeldElectricalRod,createElectricalRodVfx,rodPose,ROD} from '../client/src/electrical-rod.js';
import {ROD_VFX} from '../client/src/vfx/electrical-rod.js';
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
  const vfx={quality:2,reducedMotion:false,lightning(o){n++;assert.ok(o.life<=.6&&o.width<=.03);assert.ok(o.from().distanceTo(o.to())<.6);},burst(){bursts++;}};
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
  // Dual: two wake arcs plus two radial spokes; denser sparks than before (36).
  assert.equal(calls.find(c=>c.name==='burst').o.count,ROD_VFX.sparks.dual);
  assert.equal(fx.impact(p,{ground}),false,'repeated event cannot spam full effect');
  for(let i=0;i<4;i++)fx.update(.1);
  rod.setMode('rod');rod.update(2);fx.update(.1);calls.length=0;
  assert.equal(fx.impact(p,{ground}),true);
  // Joined is the most intense: wake arcs, a seam-spanning bridge and three spokes.
  assert.equal(count('lightning'),6);assert.equal(count('trail'),2);
  assert.equal(calls.find(c=>c.name==='burst').o.count,ROD_VFX.sparks.joined);
  assert.ok(ROD_VFX.sparks.joined>ROD_VFX.sparks.dual);
  assert.ok(calls.find(c=>c.name==='shock').o.radius>1);
  for(const c of calls.filter(c=>c.name==='lightning')){
   assert.ok(c.o.life<=.85&&c.o.branches<=2&&c.o.width<=.06);
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
  assert.ok(calls.some(c=>c.name==='trail'),'standard quality retains strike silhouette');
  assert.ok(calls.some(c=>c.name==='shock'),'standard quality retains impact ripple');
  assert.ok(calls.every(c=>c.name!=='flash'));
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

test('persistent corona is attached to both runtime halves even at quality zero; comfort and disposal are bounded',()=>{
 const rod=createElectricalRod({independentEmission:true});
 const a=rod.halves.map((h,i)=>h.getObjectByName('RodCorona'+i));
 try{
  rod.update(.1,{quality:1});assert.ok(a.every(g=>g.visible&&g.children.every(s=>s.visible)));
  const angle=a[0].children[0].rotation.y;
  rod.update(.1,{quality:1,activity:1});assert.notEqual(a[0].children[0].rotation.y,angle);
  assert.ok(a[0].children[0].scale.x>1);
  const strands=g=>g.children.filter(s=>/^ElectricalFilament/.test(s.name));
  for(const g of a)for(const s of strands(g))assert.ok(s.children[0].material.opacity>=.9);
  rod.update(.1,{quality:0,calm:true});assert.ok(a.every(g=>g.visible&&g.children[0].visible&&!g.children[1].visible));
  const stable=a[0].children[0].rotation.y;
  rod.update(.1,{quality:0,calm:true});assert.equal(a[0].children[0].rotation.y,stable);
  rod.update(.1,{energized:false});assert.ok(a.every(g=>!g.visible));
 }finally{rod.dispose();}
 assert.ok(a.every(g=>g.parent===null));
});

test('the corona reads at rest, escalates on pulse and in combat, and joined burns hotter than dual',()=>{
 const rod=createElectricalRod({independentEmission:true});
 const half=rod.halves[0];
 const sheath=()=>half.getObjectByName('RodPlasmaSheath0'),tip=()=>half.getObjectByName('RodEmitterGlow0');
 const arcs=()=>half.getObjectByName('RodCrackle0').children.filter(m=>m.visible).length;
 const settle=(o)=>{for(let i=0;i<30;i++)rod.update(.05,o);};
 try{
  rod.setMode('rod');rod.update(2,{reducedMotion:true});
  // Standing still, no attack: sheath, emitter glow and crackle are all present.
  settle({quality:2});
  assert.ok(sheath().visible&&sheath().material.opacity>.03,'sheath visible at rest');
  assert.ok(tip().material.opacity>.3,'emitter glow visible at rest');
  assert.ok(arcs()>=1,'crackle strands visible at rest');
  const restTip=tip().scale.x,restSheath=sheath().material.opacity;
  settle({quality:2,combat:true});
  assert.ok(tip().scale.x>restTip,'combat raises the idle floor');
  rod.pulse(1);rod.update(.016,{quality:2});
  assert.ok(tip().scale.x>restTip*1.4,'pulse escalates the emitter glow');
  assert.ok(arcs()>=2,'pulse shows more crackle');
  settle({quality:2});
  assert.ok(Math.abs(tip().scale.x-restTip)<1e-6,'pulse decays back to rest');
  // Dual configuration reads slightly calmer than joined.
  rod.setMode('dual');rod.update(2,{reducedMotion:true});settle({quality:2});
  assert.ok(tip().scale.x<restTip);
  // Reduced motion: static glow and sheath, no crackle or flicker.
  rod.pulse(1);settle({quality:2,reducedMotion:true});
  assert.equal(arcs(),0);assert.ok(tip().material.opacity>0&&sheath().visible);
  const rot=half.getObjectByName('ElectricalFilament0').rotation.y;rod.update(.1,{quality:2,reducedMotion:true});
  assert.equal(half.getObjectByName('ElectricalFilament0').rotation.y,rot);
  // Quality zero: no crackle and no outer halo, but the weapon still glows.
  settle({quality:0});
  assert.equal(arcs(),0);assert.equal(half.getObjectByName('RodPlasmaHalo0').visible,false);assert.ok(tip().material.opacity>=.5,
    'low-tier energized emitter must remain legible in a dark environment');
  assert.ok(sheath().material.opacity>.05,'low-tier rod retains its inexpensive persistent electrical sheath');
  rod.update(.1,{energized:false});assert.equal(half.getObjectByName('RodCorona0').visible,false);
  assert.ok(restSheath<.5,'idle sheath stays restrained');
 }finally{rod.dispose();}
 assert.equal(rod.halves[0].getObjectByName('RodCorona0'),undefined);
});
test('standard tier substitutes a flare for the light pulse; high tier flashes joined brighter than dual',()=>{
 const make=quality=>{const calls=[];const vfx={quality,reducedMotion:false,calmFlashes:false,intensity:1};
  for(const name of ['lightning','burst','trail','shock','flash'])vfx[name]=o=>{calls.push({name,o});return {age:0,life:o.life??.3};};return {vfx,calls};};
 const p=new Vector3(.4,1,.4),ground=new Vector3(.4,0,.4);
 const rod=createElectricalRod({independentEmission:true});
 try{
  const hi=make(2),fx=createElectricalRodVfx(rod,hi.vfx);
  assert.ok(fx.impact(p,{ground}));
  const dual=hi.calls.find(c=>c.name==='flash').o.intensity;
  for(let i=0;i<4;i++)fx.update(.1);
  rod.setMode('rod');rod.update(2,{reducedMotion:true});fx.update(.1);hi.calls.length=0;
  assert.ok(fx.impact(p,{ground}));
  assert.ok(hi.calls.find(c=>c.name==='flash').o.intensity>dual);
  fx.dispose();
  const std=make(1),fx1=createElectricalRodVfx(rod,std.vfx);
  assert.ok(fx1.impact(p,{ground}));
  assert.equal(std.calls.filter(c=>c.name==='flash').length,0);
  assert.ok(std.calls.some(c=>c.name==='burst'&&c.o.exact&&c.o.count===1&&c.o.size>=1),'bright flare stands in for the light');
  fx1.dispose();
 }finally{rod.dispose();}
});
test('residual crackle follows a discharge, is rate-limited and ends; draw is cooled down',()=>{
 const rod=createElectricalRod({independentEmission:true});
 const calls=[];const vfx={quality:2,reducedMotion:false,calmFlashes:false,intensity:1};
 for(const name of ['lightning','burst','trail','shock','flash'])vfx[name]=o=>{calls.push({name,o});return {age:0,life:o.life??.3};};
 const fx=createElectricalRodVfx(rod,vfx),p=new Vector3(.4,1,.4);
 try{
  fx.update(.01);calls.length=0;
  assert.ok(fx.impact(p));calls.length=0;
  const arcs=()=>calls.filter(c=>c.name==='lightning'&&c.o.width<=.018).length;
  for(let i=0;i<4;i++)fx.update(.1);
  const early=arcs();assert.ok(early>=1&&early<=3,'a few residual arcs, one at a time: '+early);
  for(let i=0;i<20;i++)fx.update(.1);
  const total=arcs();assert.ok(total<=Math.ceil(ROD_VFX.residual.dual/ROD_VFX.residual.step)+1,'bounded: '+total);
  calls.length=0;for(let i=0;i<10;i++)fx.update(.1);
  assert.equal(arcs(),0,'residual crackle ends');
  assert.equal(fx.draw(),true);assert.equal(fx.draw(),false,'draw is rate-limited');
  vfx.reducedMotion=true;fx.update(.1);calls.length=0;
  for(let i=0;i<10;i++)fx.update(.1);assert.equal(fx.draw(),false);assert.equal(calls.length,0);
 }finally{fx.dispose();rod.dispose();}
});
test('combat shortens the idle cadence without exceeding the per-weapon bound',()=>{
 const rod=createElectricalRod({independentEmission:true});
 let n=0;const vfx={quality:2,reducedMotion:false,calmFlashes:false,intensity:1,lightning(o){n++;assert.ok(o.life<=.6&&o.width<=.03);return {age:0,life:o.life};},burst(){}};
 const fx=createElectricalRodVfx(rod,vfx);
 try{
  for(let i=0;i<30;i++)fx.update(.1);const idle=n;n=0;
  for(let i=0;i<30;i++)fx.update(.1,{combat:true});const combat=n;
  assert.ok(combat>idle,`${combat} > ${idle}`);
  assert.ok(combat<=2*Math.ceil(3/ROD_VFX.combatCadence)+2);
 }finally{fx.dispose();rod.dispose();}
});
test('every class has a complete, distinct rod colourway applied to model and corona; untrusted ids fall back',async()=>{
 const {ROD_PALETTES,rodPalette,DEFAULT_ROD_PALETTE}=await import('../client/src/rod-palette.js');
 const {CLASSES}=await import('../shared/content.js');
 const keys=Object.keys(DEFAULT_ROD_PALETTE);
 for(const cls of Object.keys(CLASSES)){const pal=rodPalette(cls);assert.deepEqual(Object.keys(pal).sort(),[...keys].sort(),cls);}
 const glows=Object.values(ROD_PALETTES).map(p=>p.inlayGlow);assert.equal(new Set(glows).size,glows.length,'colourways are distinct');
 for(const bad of ['__proto__','constructor','missing',null,7])assert.equal(rodPalette(bad),DEFAULT_ROD_PALETTE);
 const rod=createElectricalRod({independentEmission:true,palette:rodPalette('surveyor')});
 try{
  assert.equal(rod.palette.name,'Amber');
  const inlay=rod.group.getObjectByName('RodRight_inlay').material;assert.equal(inlay.emissive.getHex(),ROD_PALETTES.surveyor.inlayGlow);
  assert.equal(rod.halves[0].getObjectByName('RodEmitterGlow0').material.color.getHex(),ROD_PALETTES.surveyor.tip);
 }finally{rod.dispose();}
 const plain=createElectricalRod();try{assert.equal(plain.group.getObjectByName('RodRight_inlay').material.emissive.getHex(),DEFAULT_ROD_PALETTE.inlayGlow,'exports keep cobalt');}finally{plain.dispose();}
});

test('active rod animation is not incorrectly forced into reduced-motion mode', async () => {
  const {readFileSync}=await import('node:fs');
  const source=readFileSync('client/src/characters.js','utf8');
  assert.doesNotMatch(source,/reducedMotion:\s*st\.reducedMotion\s*\|\|\s*active/,
    'attacking used to suppress rod corona/crackle by treating activity as an accessibility preference');
  assert.match(source,/reducedMotion:\s*!!st\.rodCalm\s*\|\|\s*st\.dead\s*\|\|\s*stowed/,
    'only actual rod comfort preference, death or stow may reduce the rod animation');
});


test('server-started rod windup has restrained tip wake but no phantom contact impact',()=>{
 const rod=createElectricalRod({independentEmission:true});
 const calls=[];
 const vfx={quality:1,reducedMotion:false,calmFlashes:false,intensity:1,
  trail:o=>{calls.push(['trail',o]);return {age:0,life:o.life};},
  shock:o=>{calls.push(['shock',o]);return {age:0,life:o.life};},
  flash:o=>{calls.push(['flash',o]);return {age:0,life:o.life};},
  burst:o=>{calls.push(['burst',o]);return {age:0,life:o.life??.2};}
 };
 const fx=createElectricalRodVfx(rod,vfx);
 try{
  assert.equal(fx.swing('1',220),true);
  assert.equal(fx.swing('2',290),false,'same windup cannot flood the effect pool');
  assert.equal(calls.filter(c=>c[0]==='trail').length,1);
  assert.equal(calls.filter(c=>['shock','flash','burst'].includes(c[0])).length,0,'no hit-contact flare before authoritative damage');
  assert.equal(rod.group.userData.rodContactCount||0,0);
  fx.update(.2,{energized:true,combat:true});
  assert.equal(fx.swing('2',290),true,'later combo stage may move the other emitter');
  assert.equal(calls.filter(c=>c[0]==='trail').length,2);
  vfx.reducedMotion=true;fx.update(.2);
  assert.equal(fx.swing('3',300),false,'comfort preference suppresses moving tip wake');
 }finally{fx.dispose();rod.dispose();}
});
