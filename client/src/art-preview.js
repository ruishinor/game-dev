import * as THREE from '/vendor/three/three.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeEnvironment } from './scene.js';
import { createArtEffect } from './artfx/common.js';
import { aegisSampler } from './artfx/aegis.js';
import { kineticSampler } from './artfx/kinetic.js';
import { restorativeSampler } from './artfx/restorative.js';
import { makeMenderVisual } from './artfx/mender-visual.js';
const BASE='/client/art-assets/',$=id=>document.getElementById(id);
const state={ready:false,id:null,triangles:0,error:null};
window.__artPreview=state;
const canvas=$('view'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setSize(800,600,false);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x222831);scene.environment=makeEnvironment(renderer);
scene.add(new THREE.HemisphereLight(0xc1d8ef,0x655045,1.35));
const light=new THREE.DirectionalLight(0xffe6cd,2.5);light.position.set(-3,6,4);scene.add(light);
const cam=new THREE.PerspectiveCamera(35,4/3,.01,200),loader=new GLTFLoader();
let root=null,body=null,effect=null,grid=null,kind='model',duration=1,token=0,center=new THREE.Vector3(),radius=1;
const manifest=await fetch(BASE+'manifest.json').then(r=>{if(!r.ok)throw Error('catalog unavailable');return r.json();});
const models=new Map(manifest.models.map(m=>[m.id,m]));
const fx=new Map();
for(const [family,variants,sampler,d] of [
 ['aegis',['base','hinge','span','lattice','relay'],aegisSampler,3],
 ['kinetic',['charge','impact','resonance','survey'],kineticSampler,1.4],
 ['restorative',['restore','bond','transfer','stabilize'],restorativeSampler,2.2]])for(const variant of variants)fx.set(family+':'+variant,{sampler,variant,d});
const ids=[...models.keys(),'mender:visual',...fx.keys()];
for(const id of ids){const o=document.createElement('option');o.value=id;o.textContent=id.replaceAll('_',' ');$('asset').append(o);}
function disposeModel(obj){if(!obj)return;const geo=new Set(),mat=new Set(),tex=new Set();obj.traverse(o=>{if(o.geometry)geo.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){mat.add(m);for(const x of Object.values(m))if(x?.isTexture)tex.add(x);}});for(const x of geo)x.dispose();for(const x of mat)x.dispose();for(const x of tex)x.dispose();obj.removeFromParent();}
function clear(){if(effect){effect.dispose();effect=null;}disposeModel(body);body=null;if(root)root.removeFromParent();root=null;if(grid){grid.dispose();grid.removeFromParent();grid=null;}}
function draw(){if(!root)return;const t=Number($('phase').value)/100;
 if(kind==='fx')effect.update(t*duration);else if(kind==='mender')effect.update({time:t*4,act:'mending',cast:.7,reducedMotion:$('reduced').checked});
 const yaw=Number($('yaw').value)*Math.PI/180,pitch=Number($('pitch').value)*Math.PI/180,d=radius/Math.tan(35*Math.PI/360)*1.45;
 cam.position.set(center.x+Math.sin(yaw)*Math.cos(pitch)*d,center.y+Math.sin(pitch)*d,center.z+Math.cos(yaw)*Math.cos(pitch)*d);
 cam.near=Math.max(.001,d/200);cam.far=d*30;cam.updateProjectionMatrix();cam.lookAt(center);renderer.render(scene,cam);
 let triangles=0;root.traverse(o=>{if(o.isMesh&&o.visible)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});state.triangles=triangles;
 $('status').textContent=state.id+' • '+triangles.toLocaleString()+' visible triangles';
}
async function select(id){if(!ids.includes(id))throw Error('unknown asset');const seq=++token;state.ready=false;state.error=null;clear();$('status').textContent='Loading '+id;state.id=id;$('asset').value=id;
 try{
  if(fx.has(id)){kind='fx';const f=fx.get(id);duration=f.d;effect=createArtEffect(THREE,f.sampler({variant:f.variant,anchor:[2,0,0],reducedMotion:$('reduced').checked}));root=effect.group;center.set(.5,.6,0);radius=2.4;}
  else{kind=id==='mender:visual'?'mender':'model';const item=models.get(kind==='mender'?'mender_carapace':id);const gltf=await loader.loadAsync(BASE+item.file);
   if(seq!==token){disposeModel(gltf.scene);return false;}body=gltf.scene;
   if(kind==='mender'){effect=makeMenderVisual(THREE,body);effect.update({time:1,act:'mending'});root=effect.group;}else root=body;
   root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root);if(box.isEmpty())throw Error('empty model');box.getCenter(center);radius=Math.max(.035,box.getSize(new THREE.Vector3()).length()/2);}
  scene.add(root);const span=Math.max(.1,radius*3);grid=new THREE.GridHelper(span,10,0x59636f,0x39434d);grid.position.set(center.x,kind==='fx'?0:new THREE.Box3().setFromObject(root).min.y,center.z);scene.add(grid);
  draw();state.ready=true;return true;
 }catch(err){if(seq===token){clear();state.error=err.message;state.ready=false;$('status').textContent='Error: '+err.message;}throw err;}
}
state.ids=ids;state.select=select;
$('asset').addEventListener('change',()=>select($('asset').value).catch(console.error));
for(const id of ['yaw','pitch','phase'])$(id).addEventListener('input',draw);
$('reduced').addEventListener('change',()=>select($('asset').value).catch(console.error));
const atlas=await fetch(BASE+'industrial_atlas.json').then(r=>r.json());
for(const [name,file] of Object.entries(atlas.files)){const f=document.createElement('figure'),im=document.createElement('img'),c=document.createElement('figcaption');im.src=BASE+file;im.alt=name;c.textContent=name;f.append(im,c);$('maps').append(f);}
const glyphs=await fetch(BASE+'glyphs/manifest.json').then(r=>r.json());
for(const g of glyphs){const f=document.createElement('figure'),im=document.createElement('img'),c=document.createElement('figcaption');im.src=BASE+'glyphs/'+g.file;im.alt=g.id;c.textContent=g.id;f.append(im,c);$('glyphs').append(f);}
await select(ids[0]);
