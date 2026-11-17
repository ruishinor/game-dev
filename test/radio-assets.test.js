import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {APPROVED_RADIO_ASSETS} from '../client/src/radio-assets.js';
import {radioAssetFor} from '../client/src/radio-playback.js';
import {RADIO_DIALOGUE} from '../shared/dialogue.js';
test('every published voice asset is authored, reviewed and hash-matched; no stray delivery files',()=>{
 const dir=new URL('../client/assets/voice/',import.meta.url);
 const names=fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>n.endsWith('.mp3')).sort():[];
 assert.deepEqual(names,Object.keys(APPROVED_RADIO_ASSETS).map(id=>id+'.mp3').sort());
 for(const [id,asset] of Object.entries(APPROVED_RADIO_ASSETS)){
  const d=RADIO_DIALOGUE[id];assert.ok(d,id);
  const resolved=radioAssetFor({dialogueId:id,source:d.source,message:d.transcript});assert.ok(resolved,id);
  assert.ok(resolved.envelope?.length,id);
  for(const k of ['model','revision','modelSha256','voice','voiceSha256','spokenText','reviewer','listeningNotes','rightsNotes'])assert.ok(typeof asset.provenance?.[k]==='string'&&asset.provenance[k].trim(),id+' '+k);
  assert.ok(['private-playtest','release-cleared'].includes(asset.provenance.distributionScope),id+' distribution scope');
  if(process.env.ATTUNEMENT_PUBLIC_RELEASE==='1')assert.equal(asset.provenance.distributionScope,'release-cleared',id+' public release blocked');
  const data=fs.readFileSync(new URL(id+'.mp3',dir));assert.ok(data.length>0&&data.length<=3000000,id);
  assert.equal(createHash('sha256').update(data).digest('hex'),asset.sha256,id);
 }
});
