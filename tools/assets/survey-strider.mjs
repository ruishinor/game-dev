import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {validateBytes} from 'gltf-validator';
import {createSurveyStrider} from '../../client/src/survey-strider-model.js';

// The exporter uses FileReader even when the asset contains no textures.
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    this.result=await blob.arrayBuffer();
    this.onloadend();
  }
};

const output=new URL('../asset-pipeline/assets/survey-strider/outputs/',import.meta.url);
await mkdir(output,{recursive:true});

async function exportStrider(distance, filename){
  const model=createSurveyStrider();
  const {group}=model;
  try{
    model.update(0,{cameraDistance:distance});
    const objects=[];
    group.traverseVisible(object=>{
      if(object!==group){
        object.name ||= 'strider:part-'+objects.length;
        objects.push(object);
      }
    });
    const clips=[];
    const speed=2.5;
    const step=Math.PI*2/(speed*6.4*24);
    for(let index=0;index<96;index++)model.update(step,{speed});
    for(const [name,state,interval,frames] of [
      ['Walk',{speed},step,25],
      ['Survey',{act:'surveying'},Math.PI*2/(3*24),25],
    ]){
      if(name==='Survey')for(let index=0;index<30;index++)model.update(.05,{});
      const channels=objects.map(object=>({object,positions:[],rotations:[],scales:[]}));
      const times=Array.from({length:frames},(_,index)=>index*interval);
      for(let index=0;index<frames;index++){
        for(const {object,positions,rotations,scales} of channels){
          positions.push(...object.position);
          rotations.push(...object.quaternion);
          scales.push(...object.scale);
        }
        if(index<frames-1)model.update(interval,state);
      }
      const tracks=[];
      for(const {object,positions,rotations,scales} of channels){
        for(const [property,values,Track,size] of [
          ['position',positions,VectorKeyframeTrack,3],
          ['quaternion',rotations,QuaternionKeyframeTrack,4],
          ['scale',scales,VectorKeyframeTrack,3],
        ]){
          if(values.some((value,index)=>Math.abs(value-values[index%size])>1e-5)){
            tracks.push(new Track(object.uuid+'.'+property,times,values));
          }
        }
      }
      clips.push(new AnimationClip(name,-1,tracks));
    }
    // Re-establish a neutral unanimated pose for viewers that do not play clips.
    for(let i=0;i<30;i++)model.update(.05,{});
    const binary=new Uint8Array(await new GLTFExporter().parseAsync(group,{
      binary:true, animations:clips, onlyVisible:true, copyright:'Attunement',
    }));
    const report=await validateBytes(binary,{uri:filename});
    assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues.messages));
    await writeFile(new URL(filename,output),binary);
    return binary.byteLength;
  }finally{
    model.dispose();
  }
}

const near=await exportStrider(0,'survey_strider.glb');
const far=await exportStrider(30,'survey_strider_distance.glb');
assert.ok(far<near,'Distance asset must be smaller');
console.log('Survey Strider exports validated', {near,far});
