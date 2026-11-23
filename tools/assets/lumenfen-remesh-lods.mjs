// Generate real, independent GLB LOD candidates from Blender-refined donors.
// Reuses Attunement's existing glTF Transform/WebP/Meshopt optimization chain;
// does not alter source archives or publish assets automatically to the client.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import validator from 'gltf-validator';
import { getBounds } from '@gltf-transform/functions';
import { readGltf, writeGlb, optimise, triangleCount } from './lib/gltf.mjs';

const target = path.resolve(process.argv[2] || '.asset-cache/pipeline/lumenfen/remeshed');
const manifest = path.join(target, 'remesh-report.json');
const report = JSON.parse(fs.readFileSync(manifest, 'utf8'));
assert.equal(report.kind, 'actual-blender-static-donor-remesh');
assert.equal(report.assets.length, 5);
const LODS = Object.freeze([{level:1,ratio:0.55},{level:2,ratio:0.27}]);

function rangeFromScene(scene) {
  const {min,max} = getBounds(scene);
  return max.map((v,i)=>v-min[i]);
}

for(const asset of report.assets){
  const original=path.join(target,asset.file);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex'),asset.sha256);
  const src=await readGltf(original);
  const bounds=rangeFromScene(src.getRoot().getDefaultScene());
  const full=triangleCount(src.getRoot().getDefaultScene());
  assert.equal(full,asset.refinedTriangles);
  let previous=full;
  asset.lods=[];
  for(const recipe of LODS){
    const doc=await readGltf(original);
    await optimise(doc,{maxTexture:1024,textureQuality:87,simplifyRatio:recipe.ratio,keepAttributes:true});
    const scene=doc.getRoot().getDefaultScene();
    const triangles=triangleCount(scene);
    const extents=rangeFromScene(scene);
    if(!(triangles>0&&triangles<previous))
      throw Error(asset.id+' LOD'+recipe.level+' not simplified: '+previous+' -> '+triangles);
    for(let i=0;i<3;i++)
      if(Math.abs(extents[i]-bounds[i])>Math.max(.06,bounds[i]*.1))
        throw Error(asset.id+' LOD'+recipe.level+' bounds changed too much on axis '+i);
    const file=asset.id+'_lod'+recipe.level+'.glb';
    const filename=path.join(target,file);
    await writeGlb(doc,filename);
    const bytes=fs.readFileSync(filename);
    const validation=await validator.validateBytes(new Uint8Array(bytes),{maxIssues:40});
    if(validation.issues.numErrors)
      throw Error(asset.id+' LOD'+recipe.level+' glTF validation: '+validation.issues.messages.map(x=>x.code).join(','));
    asset.lods.push({
      level:recipe.level,ratio:recipe.ratio,file,
      triangles,bytes:bytes.length,
      sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
      materialCount:doc.getRoot().listMaterials().length,
    });
    previous=triangles;
    console.log(asset.id+' LOD'+recipe.level+': '+triangles+' triangles / '+bytes.length+' bytes');
  }
}
report.lodGeneration='existing glTF Transform Meshopt simplification, WebP textures and validated GLB exports';
fs.writeFileSync(manifest,JSON.stringify(report,null,2)+'\n');
console.log('Generated '+report.assets.length*LODS.length+' additional validated LOD GLBs.');
