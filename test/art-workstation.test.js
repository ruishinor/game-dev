import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {assembleWorkstation} from '../client/src/artfx/workstation.js';
function geom(w,h,d,ground=false){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial());if(ground)mesh.position.y=h/2;const g=new THREE.Group();g.add(mesh);return g;}
test('workstation kitbash uses detached desk and places module on top',()=>{
 const assets={instance:(bundle,piece)=>{assert.equal(bundle,'sanctum');return piece==='Prop_Desk_Medium'?geom(2.844,.94,1.029,true):geom(1,1,1);}};
 const tabletop=geom(1.45,.65,.6,true);const r=assembleWorkstation(THREE,assets,tabletop);
 assert.equal(r.group.children.length,3);r.group.updateMatrixWorld(true);const desk=new THREE.Box3().setFromObject(r.group.children[0]),top=new THREE.Box3().setFromObject(tabletop),crate=new THREE.Box3().setFromObject(r.group.children[2]);
 assert.ok(Math.abs(top.min.y-desk.max.y)<1e-5);assert.ok(crate.min.x>desk.max.x);assert.ok(Math.abs(crate.min.y)<1e-5);
 r.detach();assert.equal(tabletop.parent,null);
});
test('missing donor returns null without consuming tabletop',()=>{const top=geom(1,1,1,true);assert.equal(assembleWorkstation(THREE,{instance:()=>null},top),null);assert.equal(top.parent,null);});
