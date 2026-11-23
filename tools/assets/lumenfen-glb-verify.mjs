// The production assets must actually exist, contain reconstructed meshes,
// decode as glTF 2.0, have embedded PBR maps and survive a glTF validator.
// No source-format whitelist: each verified owner donor is a production input.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {validateBytes} from 'gltf-validator';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OUT=path.join(ROOT,'.asset-cache/pipeline/lumenfen/fidelity');
const read=()=>JSON.parse(fs.readFileSync(path.join(OUT,'fidelity-report.json'),'utf8'));
export async function validateLumenfenFidelity(){
 const report=read();assert.equal(report.models?.length,8);
 const observations=[];
 for(const item of report.models){
  const file=path.join(OUT,item.file);
  const buf=fs.readFileSync(file);
  assert.ok(buf.length>1024&&buf.length<45*1024*1024,'asset size '+item.id);
  assert.equal(buf.toString('ascii',0,4),'glTF');
  assert.equal(buf.readUInt32LE(4),2);assert.equal(buf.readUInt32LE(8),buf.length);
  const size=buf.readUInt32LE(12),bin=20+size;
  assert.equal(buf.readUInt32LE(16),0x4e4f534a);
  assert.equal(buf.readUInt32LE(bin+4),0x004e4942);
  const json=JSON.parse(buf.toString('utf8',20,20+size).trim());
  assert.equal(json.asset?.extras?.sourceSha256,item.sourceSha256,'source lineage');
  assert.equal(json.asset?.extras?.sourceNode,JSON.parse(fs.readFileSync(path.join(ROOT,'assets/lumenfen-donors.json'))).donors.find(x=>x.id===item.id)?.node);
  assert.ok(item.sourceTriangles>=10&&item.triangles>=item.sourceTriangles);
  assert.ok(json.meshes?.length>=1&&json.meshes.some(m=>m.primitives.length>0));
  assert.ok(json.materials?.every(m=>m.normalTexture&&m.pbrMetallicRoughness?.metallicRoughnessTexture));
  assert.ok(json.images?.length>=3&&json.images.every(x=>x.mimeType==='image/png'&&Number.isInteger(x.bufferView)));
  assert.ok(json.accessors?.length>3);
  const actual=await validateBytes(new Uint8Array(buf),{uri:item.file,maxIssues:200,
    ignoredIssues:['UNUSED_OBJECT']});
  const errors=actual.issues.messages.filter(m=>m.severity===0);
  assert.equal(errors.length,0,item.id+': glTF validator errors '+JSON.stringify(errors.slice(0,5)));
  observations.push({id:item.id,bytes:buf.length,triangles:item.triangles,sourceTriangles:item.sourceTriangles,issues:actual.issues.numErrors});
 }
 const revised=observations.filter(x=>x.triangles>x.sourceTriangles);
 assert.ok(revised.length>=3,'at least three donor assets must be genuinely remeshed, not only recoloured');
 return {generated:observations.length,remeshed:revised.length,
  totalTriangles:observations.reduce((n,o)=>n+o.triangles,0),observations};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 console.log(JSON.stringify(await validateLumenfenFidelity(),null,2));
}