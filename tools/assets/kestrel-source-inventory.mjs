// Reproducible source-only inventory of the owner-supplied 138-GLB archive.
// Prints candidate model and node identities to the CI log; it never extracts
// models to client-served directories or approves a low-poly donor for runtime.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const filename=path.join(root,'assets/source-archives/glb-low-poly-models-building-blocks.zip');
const expected='a2e60f2a220ebf427f6211805d0a4aa11504205af91a62e2065ab18474977e43';
const zip=fs.readFileSync(filename);
const sha=crypto.createHash('sha256').update(zip).digest('hex');
if(sha!==expected)throw Error('Kestrel archive provenance mismatch: '+sha);
const end=Math.max(0,zip.length-65557);
let eocd=-1;
for(let i=zip.length-22;i>=end;i--){
  if(zip.readUInt32LE(i)===0x06054b50 && i+22+zip.readUInt16LE(i+20)===zip.length){eocd=i;break;}
}
if(eocd<0)throw Error('Archive lacks a valid ZIP directory');
const n=zip.readUInt16LE(eocd+10);
let at=zip.readUInt32LE(eocd+16);
const packs=[];
for(let i=0;i<n;i++){
  if(zip.readUInt32LE(at)!==0x02014b50)throw Error('Corrupt central directory');
  const method=zip.readUInt16LE(at+10),size=zip.readUInt32LE(at+24);
  const compressedSize=zip.readUInt32LE(at+20);
  const nameSize=zip.readUInt16LE(at+28),extraSize=zip.readUInt16LE(at+30),commentSize=zip.readUInt16LE(at+32);
  const name=zip.toString('utf8',at+46,at+46+nameSize);
  const offset=zip.readUInt32LE(at+42);
  if(name.toLowerCase().endsWith('.glb'))packs.push({name,method,size,compressedSize,offset});
  at+=46+nameSize+extraSize+commentSize;
}
if(packs.length!==138)throw Error('Expected 138 owner-archive GLBs; got '+packs.length);
const family=/laborator|industrial|factory|mechanism|mine|cave|workshop|power|storage|generator|machine|construction|bunker|shelter|building|outpost|scientific|vfx|scifi|science|research|utility|containment|survival|facility|technology/i;
const nodePattern=/console|terminal|reactor|pump|vent|valve|tank|pressure|panel|bulkhead|conduit|cable|electric|generator|machine|pipe|rail|crate|container|gate|fixture|furnace|tube|cylinder|pump|coil|scientific|industrial|door|light|lab|capacitor/i;
const matches=packs.filter(x=>family.test(x.name));
console.log('KESTREL ARCHIVE SOURCE-ONLY: '+packs.length+' GLB packs, '+matches.length+' subject matches');
for(const item of packs)console.log('PACK '+path.basename(item.name)+' '+item.size);
function inspect(item){
  if(item.size>32*1024*1024)throw Error('Oversized GLB candidate '+item.name);
  const start=item.offset;
  if(zip.readUInt32LE(start)!==0x04034b50)throw Error('Corrupt local ZIP entry');
  const payload=start+30+zip.readUInt16LE(start+26)+zip.readUInt16LE(start+28);
  const compressed=zip.subarray(payload,payload+item.compressedSize);
  const raw=item.method===0?compressed:item.method===8?inflateRawSync(compressed,{maxOutputLength:32*1024*1024}):null;
  if(!raw || raw.length!==item.size || raw.toString('ascii',0,4)!=='glTF')throw Error('Invalid GLB '+item.name);
  const size=raw.readUInt32LE(12);
  if(raw.readUInt32LE(16)!==0x4e4f534a || size>raw.length-20)throw Error('Invalid glTF metadata');
  const doc=JSON.parse(raw.toString('utf8',20,20+size));
  const names=(doc.nodes||[]).map(n=>n.name).filter(Boolean);
  return {nodeCount:names.length, matchingNodes:names.filter(x=>nodePattern.test(x)).slice(0,65)};
}
for(const pack of matches){
  const a=inspect(pack);
  console.log('CANDIDATE '+path.basename(pack.name)+' : nodes='+a.nodeCount);
  for(const node of a.matchingNodes)console.log('  NODE '+node);
}
console.log('Source-only inventory complete. No model was published or approved.');
