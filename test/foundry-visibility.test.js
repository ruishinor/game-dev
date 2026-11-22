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
 const pos=new T.Matrix4(),v=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3();
 for(const index of [0,Math.floor(guides.count*.47),guides.count-1]){
   guides.getMatrixAt(index,pos);
   pos.decompose(v,q,scale);
   assert.ok(Math.abs(v.y-foundryHeight(v.x,v.z)-.07)<.1,'route strips follow authoritative foundry slope');
   assert.ok(Math.abs(v.x-SILENT_FOUNDRY.x)<=SILENT_FOUNDRY.hw);
   assert.ok(Math.abs(v.z-SILENT_FOUNDRY.z)<=SILENT_FOUNDRY.hd);
 }
 assert.equal(FOUNDRY_AREAS.length,4);
 f.update(.016,1,{x:0,y:2,z:0});
 assert.equal(f.group.visible,false);
 assert.equal(ambient.intensity,1.7);
 assert.equal(scene.fog.color.getHex(),0x304455);
 f.dispose();
});
