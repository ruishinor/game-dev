// Compose selected GLB donor nodes as a production-pipeline asset input.
// Every archive donor is available to the pipeline; iterate materials, rigs,
// geometry and effects normally, without a source-only output prohibition.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document } from '@gltf-transform/core';
import { mergeDocuments, getBounds, prune, unpartition } from '@gltf-transform/functions';
import { readGltf, writeGlb, triangleCount } from './lib/gltf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const stage = path.resolve(process.argv[2] || '.asset-cache/pipeline/lumenfen/stage');
const output = path.resolve(process.argv[3] || '.asset-cache/pipeline/lumenfen/outputs');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT,'assets','lumenfen-donors.json'), 'utf8'));
const sources = JSON.parse(fs.readFileSync(path.join(stage,'sources.json'), 'utf8')).sources;
const doc = new Document();
doc.createBuffer();
const scene = doc.createScene('lumenfen-donor-composite');
doc.getRoot().setDefaultScene(scene);
const report = [];

for (const item of spec.donors) {
  const entry = sources.find(x=>x.id===item.id);
  assert.ok(entry && entry.node===item.node, `staged donor missing/mismatched: ${item.id}`);
  const sourceFile = path.join(stage, item.id+'.glb');
  const bytes = fs.readFileSync(sourceFile);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  const sourceDoc = await readGltf(sourceFile);
  const matches = sourceDoc.getRoot().listNodes().filter(n=>n.getName()===item.node);
  assert.equal(matches.length, 1, `expected exact named node ${item.node} in ${item.file}, found ${matches.length}`);
  const transferred = mergeDocuments(doc,sourceDoc);
  const node = transferred.get(matches[0]);
  assert.ok(node, `mergeDocuments lost selected node ${item.node}`);
  const holder=doc.createNode(item.id);
  holder.addChild(node);
  scene.addChild(holder);
  const box=getBounds(holder);
  assert.ok(box.min.every(Number.isFinite) && box.max.every(Number.isFinite),`bad donor bounds for ${item.id}`);
  const size=box.max.map((x,i)=>Math.round((x-box.min[i])*100)/100);
  const center=box.max.map((x,i)=>(x+box.min[i])/2);
  holder.setTranslation([-center[0],-box.min[1],-center[2]]);
  const triangles=triangleCount(holder);
  assert.ok(triangles>0,`selected source ${item.id} has no renderable triangle geometry`);
  report.push({id:item.id,donor:entry.donor,sourceSha256:entry.sha256,selectedNode:item.node,
    boundingSize:size,triangles,requiredTreatment:item.requiredTreatment,
    status:'pipeline donor; iterate geometry, materials, rig and VFX where needed'});
  // Drop other imported scenes; all unselected meshes are pruned below.
  for(const s of doc.getRoot().listScenes())if(s!==scene)s.dispose();
}
await doc.transform(prune({keepLeaves:true}));
// mergeDocuments preserves one buffer per donor; GLB requires a single BIN buffer.
// Combine only after pruning unselected meshes so the source studies stay small.
await doc.transform(unpartition());
assert.equal(doc.getRoot().listBuffers().length, 1, 'GLB pipeline output must have a single buffer');
fs.mkdirSync(output,{recursive:true});
const file=path.join(output,'lumenfen-donor-composite.glb');
const outBytes=await writeGlb(doc,file);
assert.ok(outBytes>100);
fs.writeFileSync(path.join(output,'lumenfen-source-candidates.json'),JSON.stringify({
  stage:'production-pipeline composite available for further processing and integration',
  composedKit: path.basename(file),outputSha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
  entries:report
},null,2)+'\n');
console.log(`Composed ${report.length} pipeline GLB donor nodes, ${outBytes} bytes.`);
for(const e of report)console.log(`${e.id}: ${e.triangles} tris; bounds [${e.boundingSize}]`);
