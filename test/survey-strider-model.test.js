import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {createSurveyStrider} from '../client/src/survey-strider-model.js';
test('original tripod has distinct feet, mast, finite articulated transforms and bounded geometry',()=>{
 const m=createSurveyStrider(),g=m.group;const foot=g.getObjectByName('strider:foot-0');assert.ok(foot);assert.ok(g.getObjectByName('strider:pan-head'));
 const first=foot.position.clone();for(let i=0;i<20;i++)m.update(.05,{speed:5,act:'surveying'});
 assert.ok(foot.position.distanceTo(first)>.01);g.updateMatrixWorld(true);g.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
 const b=new T.Box3().setFromObject(g);assert.ok(b.min.y>=-.001&&b.max.y<2.35);assert.ok(b.max.x-b.min.x<2.3&&b.max.z-b.min.z<2.3);m.dispose();
});

test('distance detail uses fewer draw calls and triangles without replacing the articulated joints',()=>{
 const model=createSurveyStrider();
 const foot=model.group.getObjectByName('strider:foot-0');
 const complexity=()=>{
  let meshes=0,triangles=0;
  model.group.traverseVisible(node=>{
   if(!node.isMesh)return;
   meshes++;
   triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;
  });
  return {meshes,triangles};
 };
 try{
  const near=complexity();
  model.update(.05,{cameraDistance:23,speed:4});
  const far=complexity();
  assert.ok(far.meshes<near.meshes);
  assert.ok(far.triangles<near.triangles*.6);
  const last=foot.position.clone();
  model.update(.05,{cameraDistance:20,speed:4});
  assert.deepEqual(complexity(),far);
  assert.ok(foot.position.distanceTo(last)>.001);
  model.update(.05,{cameraDistance:17,speed:4});
  assert.deepEqual(complexity(),near);
 }finally{model.dispose();}
});
