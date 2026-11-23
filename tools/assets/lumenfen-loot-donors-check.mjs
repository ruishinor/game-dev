// Check the donor lineage for every server-rewarded Lumenfen specimen and
// blueprint before composing source GLBs. This is NOT mesh-quality acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FEN_BIOME_DROPS} from '../../server/sim/loot-tables.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));
export function validateLumenfenLootDonors(){
 const kit=read('assets/lumenfen-donors.json');
 const spec=read('assets/lumenfen-loot-donors.json');
 assert.equal(spec.archive,kit.sourceArchive);
 const allDonors=new Set(kit.donors.map(d=>d.id));
 assert.equal(allDonors.size,kit.donors.length);
 const allDrops=new Set(Object.values(FEN_BIOME_DROPS).flat().map(r=>r.id));
 assert.deepEqual(Object.keys(spec.items).sort(),[...allDrops].sort(),
   'every obtainable Lumenfen drop must have archive art provenance');
 let references=0;
 for(const [id,item] of Object.entries(spec.items)){
   assert.ok(Array.isArray(item.donors)&&item.donors.length>0,id);
   assert.ok(typeof item.finish==='string'&&item.finish.length>20,id);
   for(const donor of item.donors){
     assert.ok(allDonors.has(donor),id+': archive donor not registered: '+donor);
     const d=kit.donors.find(p=>p.id===donor);
     assert.ok(d.file?.endsWith('.glb')&&d.node,d.id+': missing real archive source node');
     references++;
   }
 }
 return {lootItems:allDrops.size,donorNodesReferenced:references,distinctDonors:new Set(Object.values(spec.items).flatMap(x=>x.donors)).size};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 console.log('Lumenfen loot archive provenance:',validateLumenfenLootDonors());
