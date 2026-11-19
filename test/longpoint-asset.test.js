import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {EXTMeshoptCompression,ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import validator from 'gltf-validator';
import {Group,Vector3} from 'three';
import {poseLongpoint,createLongpointPresentation} from '../client/src/longpoint.js';
import * as THREE from 'three';
import {ITEMS} from '../shared/content.js';

const bytes=readFileSync(new URL('../client/assets/longpoint.glb',import.meta.url));
const meta=JSON.parse(readFileSync(new URL('../client/assets/manifest.json',import.meta.url),'utf8')).assets.longpoint;
const glb=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));

test('Longpoint GLB matches manifest, has compressed and valid geometry and named presentation nodes',async()=>{
  assert.equal(bytes.length,meta.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0,12),meta.hash);
  assert.ok(glb.extensionsRequired.includes('EXT_meshopt_compression'));
  await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({'meshopt.decoder':MeshoptDecoder});
  const doc=await io.readBinary(bytes);const root=doc.getRoot();let tris=0;
  for(const m of root.listMeshes())for(const p of m.listPrimitives())tris+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;
  assert.equal(tris,meta.tris);assert.ok(tris>0&&tris<20000);assert.equal(root.listTextures().length,3);
  for(const name of ['Longpoint','Body','Optic','Core','MagazineShell','FrontShroud','Bipod','SupportLeft','SupportRight','GripAnchor','SupportAnchor','EffectAnchor','ShoulderAnchor'])assert.equal(root.listNodes().filter(n=>n.getName()===name).length,1,name);
  for(const extension of root.listExtensionsUsed())extension.dispose();const report=await validator.validateBytes(await io.writeBinary(doc));assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);
  assert.equal(ITEMS.longpoint_emitter.slot,'weapon');
});

test('Longpoint cosmetic support poses are independent, reversible and bounded',()=>{
  const root=new Group();const l=new Group();const r=new Group();l.name='SupportLeft';r.name='SupportRight';root.add(l,r);const initial=l.quaternion.clone();
  assert.equal(poseLongpoint(root,1),true);assert.equal(l.rotation.z,r.rotation.z);assert.equal(l.rotation.x,-r.rotation.x);assert.ok(l.quaternion.angleTo(initial)>1);
  const end=l.quaternion.clone();poseLongpoint(root,10);assert.ok(end.angleTo(l.quaternion)<1e-7);poseLongpoint(root,0);assert.ok(initial.angleTo(l.quaternion)<1e-7);poseLongpoint(root,NaN);assert.ok(initial.angleTo(l.quaternion)<1e-7);assert.equal(poseLongpoint(new Group(),1),false);
});

function sceneFromGLB(file) {
  const bytes=readFileSync(new URL(file,import.meta.url));const doc=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  const nodes=doc.nodes.map(n=>{const group=new Group();group.name=n.name||'';if(n.matrix){new THREE.Matrix4().fromArray(n.matrix).decompose(group.position,group.quaternion,group.scale);}else{if(n.translation)group.position.fromArray(n.translation);if(n.rotation)group.quaternion.fromArray(n.rotation);if(n.scale)group.scale.fromArray(n.scale);}return group;});
  doc.nodes.forEach((n,i)=>n.children?.forEach(id=>nodes[i].add(nodes[id])));const scene=new Group();doc.scenes[doc.scene||0].nodes.forEach(id=>scene.add(nodes[id]));return scene;
}
test('Longpoint fit reaches both named anchors on actual masculine and feminine bind hierarchies and restores animation state',()=>{
  for(const frame of ['m','f']){
    const rig=sceneFromGLB('../client/assets/humanoid_'+frame+'.glb'),prop=sceneFromGLB('../client/assets/longpoint.glb');
    const container=new Group();container.add(rig);container.position.set(4,0,-6);container.rotation.y=.8;rig.scale.setScalar(frame==='m'?1.03:.97);container.updateMatrixWorld(true);
    const r=rig.getObjectByName('hand_r'),l=rig.getObjectByName('hand_l'),q=rig.getObjectByName('upperarm_r').quaternion.clone();
    const position=n=>n.getWorldPosition(new Vector3());let removed=0;
    const p=createLongpointPresentation(THREE,rig,prop,()=>removed++);assert.ok(p,frame);assert.equal(p.update({}),true,frame);
    assert.ok(position(r).distanceTo(position(prop.getObjectByName('GripAnchor')))<.004,frame+' grip');assert.ok(position(l).distanceTo(position(prop.getObjectByName('SupportAnchor')))<.004,frame+' support');
    assert.ok(p.origin().distanceTo(position(prop.getObjectByName('EffectAnchor')))<1e-8);assert.equal(p.update({dead:true}),false);assert.equal(p.origin(),null);assert.equal(prop.visible,false);assert.ok(q.angleTo(rig.getObjectByName('upperarm_r').quaternion)<1e-6);assert.equal(p.update({}),true);p.dispose();p.dispose();assert.equal(removed,1);assert.equal(prop.parent,null);
  }
});

test('Longpoint fitting remains reachable across sampled shipped locomotion poses on both frames', async()=>{
 await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({'meshopt.decoder':MeshoptDecoder});
 const male=await io.registerExtensions(ALL_EXTENSIONS).read(new URL('../client/assets/humanoid_m.glb',import.meta.url).pathname);const animations=male.getRoot().listAnimations();
 for(const frame of ['m','f'])for(const name of ['Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop']){
  const rig=sceneFromGLB('../client/assets/humanoid_'+frame+'.glb'),prop=sceneFromGLB('../client/assets/longpoint.glb');
  const animation=animations.find(a=>a.getName()===name);assert.ok(animation,name);const p=createLongpointPresentation(THREE,rig,prop);assert.ok(p);
  const tracks=animation.listChannels().filter(c=>c.getTargetNode()&&['translation','rotation'].includes(c.getTargetPath())).map(c=>{const t=c.getSampler(),target=c.getTargetNode().getName(),times=t.getInput().getArray(),values=t.getOutput().getArray(),path=c.getTargetPath();return path==='rotation'?new THREE.QuaternionKeyframeTrack(target+'.quaternion',times,values):new THREE.VectorKeyframeTrack(target+'.position',times,values);});
  const clip=new THREE.AnimationClip(name,-1,tracks),mixer=new THREE.AnimationMixer(rig);mixer.clipAction(clip).play();let fits=0;
  for(let i=0;i<16;i++){p.restore();mixer.setTime(clip.duration*i/16);rig.updateMatrixWorld(true);if(p.update({}))fits++;}
  p.dispose();mixer.stopAllAction();mixer.uncacheRoot(rig);
  assert.equal(fits,16,`${frame}/${name}: ${fits}/16 poses fitted`);
 }
});
