import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBytes} from 'gltf-validator';
import {reconstructLumenfenGLB} from '../tools/assets/lumenfen-glb-refine.mjs';
import spec from '../assets/lumenfen-donors.json' with {type:'json'};

function tinyDonor(nodeName) {
 // Intentionally low-density source cone; rebuilding must create *new*
 // topology and embed three physically meaningful texture atlases.
 const rings=5,sides=14;
 const vertices=[],indices=[];
 for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){
  const a=i*2*Math.PI/sides,t=j/(rings-1),r=.2+(1-t)*.5;
  vertices.push(Math.cos(a)*r,t*2,Math.sin(a)*r);
 }
 for(let j=0;j<rings-1;j++)for(let i=0;i<sides;i++){
  const a=j*sides+i,b=j*sides+(i+1)%sides,c=a+sides,d=b+sides;
  indices.push(a,c,b,b,c,d);
 }
 const pos=Buffer.from(new Float32Array(vertices).buffer);
 const ind=Buffer.from(new Uint16Array(indices).buffer);
 const bin=Buffer.concat([pos,ind]);
 const json={
  asset:{version:'2.0'},scenes:[{nodes:[0]}],scene:0,
  nodes:[{name:nodeName,mesh:0}],
  meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],
  accessors:[
   {bufferView:0,componentType:5126,count:vertices.length/3,type:'VEC3',
    min:[-.7,0,-.7],max:[.7,2,.7]},
   {bufferView:1,componentType:5123,count:indices.length,type:'SCALAR'}
  ],
  bufferViews:[
   {buffer:0,byteOffset:0,byteLength:pos.length,target:34962},
   {buffer:0,byteOffset:pos.length,byteLength:ind.length,target:34963}
  ],buffers:[{byteLength:bin.length}]
 };
 const data=Buffer.from(JSON.stringify(json));
 const padded=(data.length+3)&~3;
 const out=Buffer.alloc(12+8+padded+8+bin.length,0);
 out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);
 out.writeUInt32LE(padded,12);out.writeUInt32LE(0x4e4f534a,16);
 data.copy(out,20);out.fill(32,20+data.length,20+padded);
 const offset=20+padded;out.writeUInt32LE(bin.length,offset);
 out.writeUInt32LE(0x004e4942,offset+4);bin.copy(out,offset+8);
 return out;
}
test('the real refinement function subdivides source triangles into high-density indexed geometry',async()=>{
 const item=spec.donors.find(x=>x.id==='stone_guild');
 assert.ok(item);
 const original=tinyDonor(item.node);
 const {buffer,stats}=reconstructLumenfenGLB(original,item.id);
 assert.equal(stats.sourceTriangles,112);
 assert.equal(stats.triangles,112*16,'two adaptive subdivision passes');
 assert.ok(stats.subdividedPrimitives>0);
 const len=buffer.readUInt32LE(12);
 const scene=JSON.parse(buffer.toString('utf8',20,20+len));
 assert.equal(scene.asset?.extras?.sourceNode,item.node);
 assert.equal(scene.asset?.extras?.stats?.triangles,stats.triangles);
 assert.ok(scene.materials[0].normalTexture);
 assert.equal(scene.images.length,3);
 assert.equal(scene.textures.length,3);
 assert.ok(scene.meshes.some(m=>m.primitives[0].attributes.TEXCOORD_0!==undefined));
 const validation=await validateBytes(new Uint8Array(buffer),{uri:'fixture-remeshed.glb',maxIssues:70});
 const errors=validation.issues.messages.filter(m=>m.severity===0);
 assert.equal(errors.length,0,JSON.stringify(errors.slice(0,5)));
});
test('unknown donor ID and malformed GLB data fail closed, never silently copy unrefined source',()=>{
 assert.throws(()=>reconstructLumenfenGLB(Buffer.alloc(12),'unregistered'));
 assert.throws(()=>reconstructLumenfenGLB(Buffer.alloc(12),'stone_guild'),/Invalid source GLB/);
});
