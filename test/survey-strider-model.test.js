import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {createSurveyStrider} from '../client/src/survey-strider-model.js';
test('original tripod has distinct feet, mast, finite articulated transforms and bounded geometry',()=>{
 const m=createSurveyStrider(),g=m.group;const foot=g.getObjectByName('strider:foot-0');assert.ok(foot);assert.ok(g.getObjectByName('strider:pan-head'));
 const first=foot.position.clone();for(let i=0;i<20;i++)m.update(.05,{speed:5,act:'surveying'});
 assert.ok(foot.position.distanceTo(first)>.01);g.updateMatrixWorld(true);g.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
 const b=new T.Box3().setFromObject(g);assert.ok(b.min.y>=-.001&&b.max.y<2.35);assert.ok(b.max.x-b.min.x<2.3&&b.max.z-b.min.z<2.3);m.dispose();
});
