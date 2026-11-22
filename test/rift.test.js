import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RIFT_SITE,PROPS,OBJECTS,ZONES,groundHeight,resolveCollisions,PLAYER_RADIUS,zoneAt} from '../shared/world.js';
import {makeGame,makeChar,place} from './helpers.js';
import {interact} from '../server/sim/progress.js';
import {tickRift,riftRow} from '../server/sim/rift.js';
import {sanitizeRiftCalibration} from '../server/sim/rift-journal.js';
import {CharacterStore} from '../server/store.js';
import {questLog} from '../client/src/quest-log.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildRift,buildRiftControl} from '../client/src/rift-visual.js';
import {createVfx} from '../client/src/vfx/engine.js';
import {CombatVfx} from '../client/src/vfx/combat.js';
const eligible=()=>makeChar('vanguard',{level:5,attunements:['resonance']});
const at=(p,o)=>place(p,o.x,o.z+1.7);
test('phase scar is additive, outside named sites, supported and accessible from both regulators',()=>{
 assert.ok(RIFT_SITE);const {x,z}=RIFT_SITE;assert.equal(zoneAt(x,z),'The Phase Scar');
 for(const a of Object.values(ZONES))assert.ok(Math.hypot(x-a.x,z-a.z)>=a.r+8.6);
 for(const o of PROPS)assert.ok(Math.hypot(x-o.x,z-o.z)>=8.6+(o.r??Math.hypot(o.hw??0,o.hd??0)));
 for(const o of OBJECTS.filter(o=>o.type==='rift_indexer'||o.type==='rift_regulator')){const q={x:o.x,z:o.z+1.7},v=resolveCollisions({...q},PLAYER_RADIUS);assert.ok(Math.hypot(v.x-q.x,v.z-q.z)<.001);}
});
test('opening, telegraphed discharge, shared snapshot and regulator stabilization are server-owned',()=>{
 const g=makeGame(),p=g.addPlayer(eligible()),b=g.addPlayer(eligible()),other=g.addPlayer(makeChar('vanguard'));
 const f=g.rift;assert.equal(f.phase,'dormant');at(other,f.indexer);assert.equal(interact(g,other,f.indexer.id).ok,false);
 assert.equal(interact(g,p,f.indexer.id).ok,false);at(p,f.indexer);p.combatUntil=100;assert.equal(interact(g,p,f.indexer.id).ok,false);p.combatUntil=0;
 assert.ok(interact(g,p,f.indexer.id).ok);assert.equal(f.phase,'opening');assert.equal(interact(g,p,f.indexer.id).ok,false);
 at(p,f.regulator);assert.equal(interact(g,p,f.regulator.id).ok,false);
 const hp=b.hp;place(b,f.core.x,f.core.z+3.6);
 g.time=f.until;tickRift(g);assert.equal(f.phase,'unstable');assert.ok(g.events.some(e=>e.e==='tele'&&e.id===f.core.id));assert.equal(b.hp,hp);
 assert.ok(g.buildRows().find(row=>row.i===f.core.id).rw>0);
 assert.equal(interact(g,p,f.regulator.id).ok,false);
 g.time=f.pulseAt-1;tickRift(g);assert.equal(b.hp,hp);
 g.time=f.pulseAt;tickRift(g);assert.equal(b.hp,hp-24);assert.equal(f.pulseAt,0);assert.equal(f.pulses,1);
 assert.ok(interact(g,p,f.regulator.id).ok);assert.equal(f.phase,'stabilized');assert.deepEqual(riftRow(g,f.core),{rf:'stabilized',rw:0});
 g.time=f.until;tickRift(g);assert.equal(f.phase,'cooling');g.time=f.until;tickRift(g);assert.equal(f.phase,'dormant');
});
test('late tick never discharges without a previously announced warning; unattended cycle closes',()=>{
 const g=makeGame(),p=g.addPlayer(eligible()),f=g.rift;at(p,f.indexer);assert.ok(interact(g,p,f.indexer.id).ok);
 place(p,f.core.x,f.core.z+3.6);const hp=p.hp;g.time+=60000;tickRift(g);assert.equal(p.hp,hp);assert.ok(f.pulseAt>g.time);
 g.time=f.pulseAt;tickRift(g);assert.equal(p.hp,hp-24);
 g.time=f.until;tickRift(g);assert.equal(f.phase,'cooling');g.time=f.until;tickRift(g);assert.equal(f.phase,'dormant');
});
test('rift structure has a bounded membrane and persistent late-join warning with reduced-motion support',()=>{
 const m=buildRift(THREE,RIFT_SITE,groundHeight),surface=m.group.getObjectByName('rift:interference-membrane'),ring=m.group.getObjectByName('rift:persistent-warning');
 assert.ok(surface.geometry.attributes.position.count>1000);for(const v of surface.geometry.attributes.position.array)assert.ok(Number.isFinite(v));
 m.update(.05,{riftPhase:'unstable',riftWarning:1500,reducedMotion:true});assert.equal(surface.material.uniforms.uTime.value,0);assert.equal(ring.visible,true);
 m.update(.05,{riftPhase:'stabilized',riftWarning:0});assert.equal(ring.visible,false);assert.equal(surface.material.uniforms.uStable.value,1);
 assert.ok(buildRiftControl(THREE,true).group.children.length>5);m.dispose();
});
test('rift transition effects run through the existing bounded engine and expire',()=>{
 const scene=new THREE.Scene(),v=createVfx(THREE,scene,{groundHeight}),combat=new CombatVfx(v);
 for(const k of ['rift_open','rift_pulse','rift_stabilize','rift_collapse'])assert.ok(combat.area({e:'fx',k,x:RIFT_SITE.x,y:0,z:RIFT_SITE.z,r:5.5},null,null,null));
 v.update(.02);assert.ok(v.stats().items>0);for(let i=0;i<300;i++)v.update(1/30);assert.equal(v.stats().items,0);assert.equal(v.stats().particles,0);
});

test('Phase Scar calibration is personal, persisted and recoverable exactly once',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'attunement-rift-'));
 try{
  const filename=path.join(dir,'characters.json'),store=new CharacterStore(filename);
  const {char,token}=store.create('Rift Calibrator','vanguard');
  Object.assign(char,{level:5,attunements:['resonance'],materials:{resonance_fragment:99}});
  const g=makeGame(),p=g.addPlayer(char),visitor=g.addPlayer(eligible()),f=g.rift;
  const entry=actor=>questLog(g.sheet(actor)).find(q=>q.id==='field:rift_calibration');
  assert.equal(entry(p),undefined);assert.equal(entry(visitor),undefined);
  at(p,f.indexer);assert.ok(interact(g,p,f.indexer.id).ok);assert.equal(entry(p).progress,'0 / 2 stages');
  at(p,f.regulator);assert.equal(interact(g,p,f.regulator.id).ok,false);
  g.time=f.until;tickRift(g);g.time=f.pulseAt;tickRift(g);
  assert.ok(interact(g,p,f.regulator.id).ok);assert.equal(entry(p).progress,'1 / 2 stages');
  assert.equal(entry(visitor),undefined);
  place(visitor,f.core.x,f.core.z+3.6);assert.ok(interact(g,visitor,f.core.id).ok);
  assert.equal(visitor.char.materials?.resonance_fragment,undefined);
  place(p,f.core.x,f.core.z+3.6);
  assert.equal(interact(g,p,f.core.id).ok,false);assert.equal(p.char.riftCalibration,'recorded');
  g.removePlayer(p.id);store.markDirty();assert.ok(store.flush());
  const loaded=new CharacterStore(filename),restored=loaded.authenticate(token);assert.equal(restored.riftCalibration,'recorded');
  restored.materials={};const q=g.addPlayer(restored);
  place(q,f.core.x+20,f.core.z);assert.equal(interact(g,q,f.core.id).ok,false);
  place(q,f.core.x,f.core.z+3.6);q.combatUntil=g.time+5000;assert.equal(interact(g,q,f.core.id).ok,false);q.combatUntil=0;
  f.phase='unstable';assert.equal(interact(g,q,f.core.id).ok,false);f.phase='stabilized';
  assert.ok(interact(g,q,f.core.id).ok);assert.equal(q.char.materials.resonance_fragment,1);
  assert.equal(entry(q).status,'completed');assert.deepEqual(entry(q).received,['1 × Resonance fragment']);assert.ok(interact(g,q,f.core.id).ok);assert.equal(q.char.materials.resonance_fragment,1);
  loaded.markDirty();loaded.flush();const persisted=new CharacterStore(filename).authenticate(token);assert.equal(persisted.riftCalibration,'completed');assert.equal(persisted.fieldReceipts.calibration,true);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('legacy and invalid calibration records never imply reward eligibility',()=>{
 for(const v of [null,undefined,true,{},'constructor','done'])assert.equal(sanitizeRiftCalibration(v),null);
});

test('profile core keeps the throat visible edge-on and follows the effects quality', () => {
 const m=buildRift(THREE,RIFT_SITE,groundHeight),core=m.group.getObjectByName('rift:profile-core'),veil=m.group.getObjectByName('rift:depth-veil');
 assert.ok(core&&veil);
 assert.equal(core.material,veil.material,'shares the corona material: no extra shader');
 assert.ok(Math.abs(core.rotation.y-Math.PI/2)<1e-9,'turned to face profile views');
 m.update(.05,{riftPhase:'unstable',effectsQuality:0});assert.equal(core.visible,false);
 m.update(.05,{riftPhase:'unstable',effectsQuality:2});assert.equal(core.visible,true);
});

test('rift ground-contact field stays terrain-conforming, noncircular and quality bounded',()=> {
  const reach=buildRift(THREE,RIFT_SITE,groundHeight);
  const returning=buildRift(THREE,null,null,{returning:true});
  try {
    for(const model of [reach,returning]){
      const halo=model.group.getObjectByName('rift:footprint-halo');
      const threads=model.group.getObjectByName('rift:ground-threads');
      const membrane=model.group.getObjectByName('rift:interference-membrane');
      assert.ok(halo&&threads&&membrane);
      assert.ok(threads.material.fragmentShader.includes('pathA') && threads.material.fragmentShader.includes('pathB'),
        'ground arcs follow paired inward threads rather than an extended orange warning circle');
      assert.ok(!halo.material.fragmentShader.includes('smoothstep(1.0, 0.8'),
        'GLSL smoothstep edges must be ordered');
      assert.equal(halo.geometry.attributes.position.count,threads.geometry.attributes.position.count);
      for(const n of threads.geometry.attributes.position.array)assert.ok(Number.isFinite(n));
      assert.equal(model.group.children.filter(o=>o.isLight).length,1,'existing bounded light count');
      model.update(.05,{riftPhase:'unstable',effectsQuality:0,cameraDistance:4,reducedMotion:false});
      assert.equal(halo.visible,true,'even low quality retains ground contact');
      assert.equal(threads.visible,false,'low quality draws only the inexpensive pool');
      assert.equal(halo.material.uniforms.uDetail.value,0);
      assert.ok(membrane.material.uniforms.uTime.value>0,'low graphics preset must not imply reduced motion');
      model.update(.05,{riftPhase:'stabilized',effectsQuality:1,cameraDistance:5});
      assert.equal(threads.visible,true);
      assert.equal(halo.material.uniforms.uDetail.value,1);
      model.update(.05,{riftPhase:'stabilized',effectsQuality:2,reducedMotion:true,cameraDistance:5});
      assert.equal(membrane.material.uniforms.uTime.value,0,'explicit reduced-motion still freezes shader travel');
    }
    assert.ok(reach.group.getObjectByName('rift:persistent-warning'),'existing Reach hazard outline preserved');
    assert.equal(returning.group.getObjectByName('rift:persistent-warning'),undefined,
      'return portal may never inherit the dangerous Reach telegraph');
    assert.deepEqual(reach.group.getObjectByName('rift:interference-membrane').geometry.attributes.position.array,
      returning.group.getObjectByName('rift:interference-membrane').geometry.attributes.position.array,
      'original paired membrane geometry unchanged');
  }finally{reach.dispose();returning.dispose();}
});
