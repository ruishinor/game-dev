import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildWardenSensorGeometry, createWardenHeadFx, measureWardenRing} from '../client/src/warden-head-fx.js';
import {applyWardenMaterials} from '../client/src/warden-materials.js';

function sampleRing(){
  const root=new THREE.Group();
  const head=new THREE.Bone();head.name='Head';
  root.add(head);
  head.position.y=1.68;
  const geometry=new THREE.RingGeometry(.58,1,72);
  const p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++){
    p.setXYZ(i,p.getX(i)*.145,p.getY(i)*.090,p.getZ(i)*.02);
  }
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(p.count*4),4));
  const weights=new Float32Array(p.count*4);
  for(let i=0;i<p.count;i++)weights[i*4]=1;
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());
  mesh.name='ring_vertical';head.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([head]));
  return {root,mesh,head};
}

test('sensor takes its physical dimensions from the skinned head and stays local',()=>{
  const {root,mesh,head}=sampleRing();
  const bounds=measureWardenRing(mesh,head);
  assert.ok(bounds);
  assert.ok(bounds.halfWidth>.10&&bounds.halfWidth<.2);
  assert.ok(bounds.halfHeight>.06&&bounds.halfHeight<.13);
  const fx=createWardenHeadFx(root,{variant:2,optic:[.7,.9,.82]});
  assert.ok(fx?.mesh);
  assert.equal(fx.mesh.parent,head);
  assert.equal(fx.mesh.name,'WardenHeadInnerSensor');
  assert.equal(fx.mesh.material.depthWrite,false);
  assert.equal(fx.mesh.material.depthTest,true);
  const before=fx.inspect();
  assert.equal(before.local,true);
  fx.update(.2,{near:12,effectsQuality:2,cameraDistance:4});
  assert.equal(fx.inspect().scanning,false,'no perpetual idle halo scan');
  fx.update(.2,{near:3,effectsQuality:2,cameraDistance:4});
  assert.ok(fx.inspect().attention>0);
  assert.equal(fx.inspect().scanning,true,'proximity activates a bounded recognition sweep');
  fx.observe();fx.update(.1,{near:3,effectsQuality:2});
  assert.ok(fx.inspect().recognition>0);
  assert.ok(fx.mesh.material.uniforms.uScan.value>0);
  for(let i=0;i<18;i++)fx.update(.1,{near:3,effectsQuality:2,cameraDistance:4});
  assert.equal(fx.inspect().scanning,false,'the detection sweep ends instead of rotating constantly');
  assert.equal(fx.mesh.material.uniforms.uScan.value,0);
  fx.observe();
  assert.equal(fx.inspect().scanning,true,'server-authorised observation reactivates a short sweep');
  fx.update(.1,{near:3,reducedMotion:true,effectsQuality:0});
  assert.equal(fx.mesh.material.uniforms.uMotion.value,0);
  assert.equal(fx.mesh.material.uniforms.uQuality.value,0);
  fx.dispose();
  assert.equal(head.getObjectByName('WardenHeadInnerSensor'),undefined);
  mesh.geometry.dispose();mesh.material.dispose();
});
test('fitted sensor geometry uses three thin bands and never closes the ring aperture',()=>{
  const b={center:new THREE.Vector3(0,.08,.03),halfWidth:.145,halfHeight:.09,front:.045};
  const g=buildWardenSensorGeometry(b);
  const a=g.getAttribute('position');
  assert.ok(a.count>350&&a.count<600);
  assert.ok(g.index.count>500);
  for(let i=0;i<a.count;i++){
    const x=(a.getX(i)-b.center.x)/b.halfWidth;
    const y=(a.getY(i)-b.center.y)/b.halfHeight;
    const radius=Math.hypot(x,y);
    assert.ok(radius>=.55&&radius<=.82,'optics occupy only the inner edge');
  }
  g.dispose();
});
test('guard material adapter keeps vendor material untouched and separates the face',()=>{
  const inst=new THREE.Group();
  const source=new THREE.MeshStandardMaterial({color:0xeeeecc});
  for(const n of ['body','ring_vertical','security','equip_radio']){
    const o=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),source);
    o.name=n;inst.add(o);
  }
  const applied=applyWardenMaterials(inst,[.7,.9,.8]);
  assert.equal(applied.body,true);
  assert.equal(applied.ring,true);
  assert.equal(applied.armour,true);
  const body=inst.getObjectByName('body').material;
  const ring=inst.getObjectByName('ring_vertical').material;
  const armour=inst.getObjectByName('security').material;
  assert.notEqual(body,ring);
  assert.notEqual(body,source);
  assert.notEqual(armour,source);
  assert.equal(source.roughness,1,'source PBR material must not be mutated');
  assert.ok(body.onBeforeCompile!==source.onBeforeCompile);
  assert.ok(armour.customProgramCacheKey().includes('warden-ebony-v1'));
  inst.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
  source.dispose();
});
