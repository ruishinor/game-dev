import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeMenderVisual,menderPose } from '../client/src/artfx/mender-visual.js';
test('Mender presentation is deterministic and mode/act responsive',()=>{
 assert.deepEqual(menderPose({time:1}),menderPose({time:1}));
 assert.equal(menderPose({act:'bonded'}).scale,.5);
 assert.equal(menderPose({time:3,reducedMotion:true}).hover,0);
 assert.notEqual(menderPose({mode:'guard'}).color,menderPose({mode:'assist'}).color);
 assert.throws(()=>menderPose({time:NaN}));
 assert.equal(menderPose({mode:'constructor'}).color,menderPose({mode:'triage'}).color);
});
test('Mender owns dynamic parts, not carapace resources',()=>{
 const body=new THREE.Group(),geo=new THREE.BoxGeometry(),mat=new THREE.MeshBasicMaterial();body.add(new THREE.Mesh(geo,mat));
 let external=0;geo.addEventListener('dispose',()=>external++);
 const m=makeMenderVisual(THREE,body);m.update({time:1,act:'mending'});let count=0;m.group.traverse(o=>{if(o.isMesh)count++;});
 for(let i=0;i<10;i++)m.update({time:i});let again=0;m.group.traverse(o=>{if(o.isMesh)again++;});assert.equal(count,again);
 m.dispose();m.dispose();assert.equal(body.parent,null);assert.equal(external,0);assert.throws(()=>m.update({time:1}));geo.dispose();mat.dispose();
});
