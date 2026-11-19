import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateBytes} from 'gltf-validator';

const directory=new URL('../tools/asset-pipeline/assets/survey-strider/outputs/',import.meta.url);

async function inspect(filename){
  const bytes=await readFile(new URL(filename,directory));
  assert.equal(bytes.toString('ascii',0,4),'glTF',filename);
  assert.equal(bytes.readUInt32LE(4),2,filename);
  assert.equal(bytes.readUInt32LE(8),bytes.length,filename);
  const report=await validateBytes(new Uint8Array(bytes),{uri:filename});
  assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues.messages));
  assert.equal(bytes.toString('ascii',16,20),'JSON',filename);
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  const clips=new Map((gltf.animations??[]).map(clip=>[clip.name,clip]));
  for(const name of ['Walk','Survey']){
    const clip=clips.get(name);
    assert.ok(clip?.channels.length,name+' must animate actual nodes');
    for(const channel of clip.channels){
      assert.ok(gltf.nodes[channel.target.node],name+' target must exist');
      const sampler=clip.samplers[channel.sampler];
      assert.ok(gltf.accessors[sampler.input].count>1,name+' must have multiple keys');
    }
  }
  assert.ok(clips.get('Walk').channels.length>3,'Walk must articulate multiple parts');
  const triangles=(gltf.meshes??[]).reduce((total,mesh)=>total+mesh.primitives.reduce((sum,p)=>{
    assert.equal(p.mode??4,4,'expected triangle primitives');
    return sum+gltf.accessors[p.indices??p.attributes.POSITION].count/3;
  },0),0);
  assert.ok(triangles>0&&Number.isInteger(triangles),filename);
  return {triangles,bytes:bytes.length,meshes:gltf.meshes.length};
}

test('committed Survey Strider GLBs validate, retain motion and reduce distant geometry',async()=>{
  const near=await inspect('survey_strider.glb');
  const far=await inspect('survey_strider_distance.glb');
  assert.ok(far.triangles<near.triangles*.6,'distance export must preserve the runtime triangle reduction target');
  assert.ok(far.meshes<near.meshes,'distance export must reduce mesh count');
  assert.ok(far.bytes<near.bytes,'distance export must be smaller on disk');
});
