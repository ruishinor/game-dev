// Independent GLB structural and lineage acceptance after real Blender
// topology reconstruction. This does not pretend that shader, clipping and
// gameplay visual acceptance were measured by a headless parser.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import validator from 'gltf-validator';

const folder = path.resolve(process.argv[2] || 'tools/asset-pipeline/.asset-cache/pipeline/outpost-training-remeshed');
const report = JSON.parse(fs.readFileSync(path.join(folder,'blender-remesh-report.json'),'utf8'));
if (!Array.isArray(report.built) || !report.built.length || report.failed?.length) {
  throw Error('No valid Blender-remeshed donor model batch');
}
const validations=[];
for (const item of report.built) {
  const file=path.resolve(item.out);
  if (!file.startsWith(folder+path.sep)) throw Error('Remeshed output outside staging cache: '+file);
  const bytes=fs.readFileSync(file);
  const digest=createHash('sha256').update(bytes).digest('hex');
  if (digest!==item.outputSha256 || bytes.length!==item.bytes) throw Error('Remesh SHA/length mismatch: '+file);
  if (item.trianglesBefore<=0 || item.trianglesAfter<=0 || item.trianglesAfter>item.trianglesBefore*12) throw Error('Invalid/unbounded remeshing: '+file);
  const v=await validator.validateBytes(new Uint8Array(bytes), {maxIssues:30});
  const row={ file:path.basename(file),bytes:bytes.length,sha256:digest,
    before:item.trianglesBefore,after:item.trianglesAfter,
    source:item.source,sourceSha256:item.sourceSha256,
    errors:v.issues.numErrors,warnings:v.issues.numWarnings,
    errorsDetail:v.issues.messages.filter(x=>x.severity===0).map(x=>x.code)};
  validations.push(row);
  if (v.issues.numErrors) throw Error('glTF remesh validation failed: '+JSON.stringify(row));
}
fs.writeFileSync(path.join(folder,'validated-remesh-report.json'),JSON.stringify({
  archiveSha256:report.sourceArchiveSha256,models:validations},null,2)+'\n');
console.log('VALIDATED_OUTPOST_BLENDER_REMESH',JSON.stringify(validations));
