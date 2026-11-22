import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import validator from 'gltf-validator';
import * as T from 'three';
import {WEAPON_MODELS,createWeaponCarry,shotProfile} from '../client/src/weapon-visuals.js';
import {publicWeaponVisual} from '../shared/weapon-visual.js';
import {migrateWeaponSlots} from '../shared/weapons.js';
import {CLASSES} from '../shared/content.js';
const ledger=JSON.parse(fs.readFileSync(new URL('../assets/weapon-sources.json',import.meta.url),'utf8'));
test('three recovered CC0 meshes retain exact signed-off source bytes and self-contained geometry',async()=>{
 assert.equal(ledger.license,'CC0-1.0');assert.equal(Object.keys(ledger.models).length,3);
 for(const [id,m] of Object.entries(ledger.models)){
  const b=fs.readFileSync(new URL('../'+m.file,import.meta.url));
  assert.equal(b.length,m.bytes,id);assert.equal(b.toString('ascii',0,4),'glTF');
  assert.equal(crypto.createHash('sha1').update('blob '+b.length+String.fromCharCode(0)).update(b).digest('hex'),m.gitBlobSha,id);
  if(id==='dense')assert.equal(Object.hasOwn(WEAPON_MODELS,id),false,'unusable melee-core pistol is staged, not forced into gameplay');
  else assert.equal(WEAPON_MODELS[id].sha,m.gitBlobSha);
  const len=b.readUInt32LE(12);const gltf=JSON.parse(b.subarray(20,20+len).toString());
  assert.equal(gltf.asset.version,'2.0');assert.ok(gltf.meshes?.length,id);
  assert.ok(![...(gltf.buffers||[]),...(gltf.images||[])].some(x=>x.uri));
  const report=await validator.validateBytes(new Uint8Array(b));
  assert.equal(report.issues.numErrors,0,id);
 }
});
test('public presentation token is only issued for carried, ranged, owned equipment; original Longpoint preserved',()=>{
 const ranged=Object.keys(CLASSES).find(x=>CLASSES[x].auto?.kind==='bolt');
 assert.ok(ranged);
 for(const [item,expected] of [['field_emitter','field'],['tuned_emitter','tuned'],['longpoint_emitter','longpoint']]){
  const c={cls:ranged,inventory:[item],equipped:{ranged:item},activeWeapon:'ranged'};
  assert.equal(publicWeaponVisual(c),expected,item);
  assert.equal(publicWeaponVisual({...c,inventory:[]}),null);
  // The old single-slot saved state is migrated by the authoritative loader,
  // never interpreted as an arbitrary client-visible item.
  const legacy={weapon:item};
  assert.equal(publicWeaponVisual({...c,equipped:legacy}),null);
  assert.equal(publicWeaponVisual({...c,equipped:migrateWeaponSlots(legacy)}),expected);
  assert.equal(publicWeaponVisual({...c,activeWeapon:'weapon'}),
    item==='longpoint_emitter'?'longpoint-stowed':null,
    'only the original rifle has a reviewed stowed model');
 }
 for(const bad of ['__proto__','constructor','toString',null])assert.equal(publicWeaponVisual({cls:ranged,equipped:{ranged:bad},activeWeapon:'ranged',inventory:[bad]}),null);
 assert.equal(publicWeaponVisual({cls:'vanguard',inventory:['dense_pulse_core'],equipped:{weapon:'dense_pulse_core'}}),null,'melee core must not become an unapproved pistol');
 assert.equal(Object.hasOwn(WEAPON_MODELS,'dense'),false);
 assert.equal(Object.hasOwn(WEAPON_MODELS,'longpoint'),false);
 assert.equal(shotProfile('longpoint'),null);
});
test('carried source switches without accumulation and restores the rig, Longpoint model not substituted',()=>{
 const inst=new T.Group(),hand=new T.Bone();hand.name='hand_r';inst.add(hand);
 const src=new T.Group();src.add(new T.Mesh(new T.BoxGeometry(1,.3,.2),new T.MeshStandardMaterial()));
 const carry=createWeaponCarry(T,{weaponModels:new Map([['field',src],['tuned',src]])},inst);
 carry.apply('field');assert.equal(hand.children.length,1);
 carry.apply('tuned');assert.equal(hand.children.length,1);
 assert.equal(hand.children[0].name,'weapon-carry:tuned');
 carry.apply(null);assert.equal(hand.children.length,0);
 carry.dispose();assert.equal(hand.children.length,0);
});
