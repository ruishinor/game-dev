import test from 'node:test';
import assert from 'node:assert/strict';
import {exportElectricalRod} from '../tools/asset-pipeline/js/export-electrical-rod.mjs';
test('electrical rod exports valid binary glTF with reversible articulation',async()=>{
 const {bytes,report}=await exportElectricalRod();
 assert.equal(report.issues.numErrors,0);
 const b=Buffer.from(bytes);
 assert.equal(b.toString('ascii',0,4),'glTF');
 assert.equal(b.readUInt32LE(8),b.length);
 const doc=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));
 assert.deepEqual(doc.animations.map(a=>a.name),['Join','Split']);
 assert.ok(doc.animations.every(a=>a.channels.length===4));
 for(const name of ['RodRight','RodLeft','RodRightGrip','RodLeftGrip','RodRightCoupler','RodLeftCoupler','RodRightTip','RodLeftTip']){
  assert.ok(doc.nodes.some(n=>n.name===name),name+' not exported');
 }
 assert.equal(doc.meshes.length,8,'both halves should reuse eight material meshes');
});
