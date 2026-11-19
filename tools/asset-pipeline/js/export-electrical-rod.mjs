// Reference-constrained hard-surface source -> portable, validated GLB.
// The mesh and motion are the same as the Attunement three.js preview.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import validator from 'gltf-validator';
import {createElectricalRod,rodPose,ROD} from '../../../client/src/electrical-rod.js';

async function withFileReader(fn){
 if(globalThis.FileReader)return fn();
 class NodeFileReader{
  readAsArrayBuffer(blob){
   blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();},error=>{this.error=error;this.onerror?.(error);});
  }
 }
 globalThis.FileReader=NodeFileReader;
 try{return await fn();}finally{delete globalThis.FileReader;}
}
function transformation(name,reverse){
 const times=[], tracks=[],steps=38;
 for(let j=0;j<=steps;j++)times.push(j/steps*ROD.duration);
 for(const [key,node] of [['right','RodRight'],['left','RodLeft']]){
  const positions=[],quaternions=[];
  for(let j=0;j<=steps;j++){
   const q=rodPose(reverse?1-j/steps:j/steps)[key];
   positions.push(q.x,0,q.z);
   quaternions.push(0,0,Math.sin(q.angle/2),Math.cos(q.angle/2));
  }
  tracks.push(new THREE.VectorKeyframeTrack(node+'.position',times,positions));
  tracks.push(new THREE.QuaternionKeyframeTrack(node+'.quaternion',times,quaternions));
 }
 return new THREE.AnimationClip(name,ROD.duration,tracks);
}

export async function exportElectricalRod(){
 const rod=createElectricalRod();
 try{
  const scene=new THREE.Scene();scene.name='Electrical Combat Rod';scene.add(rod.group);
  const array=await withFileReader(()=>new GLTFExporter().parseAsync(scene,{
   binary:true,animations:[transformation('Join',false),transformation('Split',true)],
  }));
  const bytes=new Uint8Array(array);
  const report=await validator.validateBytes(bytes,{uri:'electrical-combat-rod.glb'});
  if(report.issues.numErrors)throw Error(JSON.stringify(report.issues.messages));
  return {bytes,report};
 }finally{rod.dispose();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
 const out=path.join(root,'.asset-cache/pipeline/electrical-rod/export');
 await fs.mkdir(out,{recursive:true});
 const {bytes,report}=await exportElectricalRod();
 await fs.writeFile(path.join(out,'electrical-combat-rod.glb'),bytes);
 await fs.writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n');
 console.log('Candidate:',out,bytes.length,'bytes;',report.issues.numWarnings,'validator warnings');
}
