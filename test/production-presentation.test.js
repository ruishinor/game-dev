import test from 'node:test';
import assert from 'node:assert/strict';
import {productionEstimate,workStage} from '../client/src/production-presentation.js';
test('estimated progress never completes before server acknowledgment',()=>{
 const job={total:4000,ms:2500,cycles:3,complete:1};
 const a=productionEstimate(job,500);
 assert.equal(a.cycle,.5);assert.equal(a.overall,.5);assert.equal(a.remaining,6000);
 assert.equal(productionEstimate(job,10000).cycle,.995);
 assert.equal(productionEstimate({...job,complete:2},10000).overall<1,true);
 assert.equal(productionEstimate(job,0,.7).cycle,.7);
 assert.equal(productionEstimate(null,0),null);
 assert.equal(workStage(.1),'Preparing components');assert.equal(workStage(.9),'Inspecting result');
});
