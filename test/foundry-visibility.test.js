import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {SILENT_FOUNDRY,FOUNDRY_AREAS,foundryHeight} from '../shared/silent-foundry.js';
import {buildSilentFoundry,FOUNDRY_LIMITS,FOUNDRY_VISIBILITY} from '../client/src/silent-foundry.js';

test('dark Foundry retains room silhouettes and traversable guidance without added world lights',()=>{
 const scene=new T.Scene();scene.fog=new T.Fog(0x304455,20,240);
 const sky=new T.Group(),sun=new T.DirectionalLight(0xffffff,3);
 const ambient=new T.HemisphereLight(0xffffff,0x555555,1.7);
 scene.add(sky,sun,ambient);
 const f=buildSilentFoundry(T,scene,{lighting:{sky,sun,ambient}});
 const x=SILENT_FOUNDRY.x,z=SILENT_FOUNDRY.arrival.z;
 f.update(.016,0,{x,y:2,z});
 assert.equal(f.group.visible,true);
 assert.equal(ambient.intensity,FOUNDRY_VISIBILITY.ambientInside);
 assert.ok(scene.fog.far>130,'black occlusion must not erase distant corridors');
 const guides=f.group.getObjectByName('foundry:inset-route-guides');
 assert.ok(guides?.isInstancedMesh,'guides are a single batched draw');
 assert.ok(guides.count>=50);
 assert.equal(f.stats().guideDraws,1);
 assert.equal(f.stats().lights,FOUNDRY_LIMITS.lights);
 const thresholds=f.group.getObjectByName('foundry:door-thresholds');
 assert.ok(thresholds?.isInstancedMesh,'doorway depth cues remain one batched draw');
 assert.equal(thresholds.count,FOUNDRY_AREAS.length-1);
 assert.equal(f.stats().thresholdDraws,FOUNDRY_VISIBILITY.thresholdDraws);
 assert.equal(thresholds.material.depthWrite,false,'thresholds do not mask combat visuals');
 assert.equal(thresholds.material.depthTest,true,'doorway cues stay behind real geometry');
 assert.equal(thresholds.material.opacity,FOUNDRY_VISIBILITY.thresholdOpacity);
 const fogShaders=[];
 f.group.traverse(o=>{
   if(o.material?.isShaderMaterial && o.material.uniforms?.fogNear && o.material.uniforms?.fogFar)
     fogShaders.push(o.material);
 });
 assert.ok(fogShaders.length>=4,'all Foundry-specific atmospheric shaders participate in fog');
 for(const mat of fogShaders){
   assert.equal(mat.uniforms.fogNear.value,scene.fog.near,'local fog near matches the live scene');
   assert.equal(mat.uniforms.fogFar.value,scene.fog.far,'local fog far matches the live scene');
   assert.equal(mat.uniforms.fogColor.value.getHex(),scene.fog.color.getHex(),'shader fog matches local color');
 }
 const pos=new T.Matrix4(),v=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3();
 for(const index of [0,Math.floor(guides.count*.47),guides.count-1]){
   guides.getMatrixAt(index,pos);
   pos.decompose(v,q,scale);
   assert.ok(Math.abs(v.y-foundryHeight(v.x,v.z)-.07)<.1,'route strips follow authoritative foundry slope');
   assert.ok(Math.abs(v.x-SILENT_FOUNDRY.x)<=SILENT_FOUNDRY.hw);
   assert.ok(Math.abs(v.z-SILENT_FOUNDRY.z)<=SILENT_FOUNDRY.hd);
 }
 assert.equal(FOUNDRY_AREAS.length,4);
 for(let i=0;i<thresholds.count;i++){
   thresholds.getMatrixAt(i,pos);
   pos.decompose(v,q,scale);
   assert.ok(Math.abs(v.x-SILENT_FOUNDRY.x)<.01,'thresholds are centred in walkable doorways');
   assert.ok(Math.abs(v.z-(SILENT_FOUNDRY.z+[52,0,-52][i]))<.01);
   assert.ok(Math.abs(v.y-foundryHeight(v.x,v.z)-.065)<.01,'thresholds follow the authoritative floor');
 }
 // Repeated updates must follow a changing local fog without global exposure edits.
 scene.fog.near=30;scene.fog.far=138;scene.fog.color.setHex(0x1c2730);
 f.update(.016,1,{x,y:2,z});
 for(const mat of fogShaders){
   assert.equal(mat.uniforms.fogNear.value,30);
   assert.equal(mat.uniforms.fogFar.value,138);
   assert.equal(mat.uniforms.fogColor.value.getHex(),0x1c2730);
 }
 f.update(.016,1,{x:0,y:2,z:0});
 assert.equal(f.group.visible,false);
 assert.equal(ambient.intensity,1.7);
 assert.equal(scene.fog.color.getHex(),0x304455);
 f.dispose();
});
