import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {LUMENFEN,inLumenfen,FEN_POOLS,FEN_TREES,FEN_SITES,FEN_SITE_COLLIDERS,fenHeight,fenArea} from '../shared/lumenfen.js';
import {LUMENFEN_ENTRY_SITE,OBJECTS,groundHeight,resolveCollisions,PLAYER_RADIUS,travelRegionAt,sameTravelRegion,hasLineOfSight,inDisconnectedRegion} from '../shared/world.js';
import {makeGame,makeChar,place} from './helpers.js';
import {interact} from '../server/sim/progress.js';
import {makeLumenfenRift} from '../client/src/lumenfen-rift.js';
import {makeFenLantern,makeFenStalker} from '../client/src/lumenfen-creatures.js';
import {buildLumenfenWorld} from '../client/src/lumenfen-world.js';
const eligible=()=>makeChar('vanguard',{level:7,attunements:['resonance']});
const find=(g,type)=>g.objects.find(o=>o.type===type);
test('second region is separate, deterministic and has safe landing/portal sites',()=>{
 const p=LUMENFEN;
 assert.ok(LUMENFEN_ENTRY_SITE,'Reach entrance must have clear placement');
 assert.ok(p.x-p.hw>150,'no overlap with original Expanse');
 assert.equal(travelRegionAt(p.x,p.z),'lumenfen');
 assert.ok(inDisconnectedRegion(p.arrival.x,p.arrival.z));
 assert.ok(!sameTravelRegion(p.arrival,{x:0,z:0}));
 assert.ok(!hasLineOfSight(p.arrival,{x:0,z:0}));
 // Rift centers are intentional solid foundations. Test safe arrival and
 // approach positions rather than walking into the middle of a portal.
 const approaches=[p.returnRift,p.springRift,p.crownRift].map(r=>({x:r.x,z:r.z-3.7}));
 for(const pt of [p.arrival,p.springLanding,p.crownLanding,...approaches]){
  assert.ok(inLumenfen(pt.x,pt.z));
  assert.equal(groundHeight(pt.x,pt.z),fenHeight(pt.x,pt.z));
  const actual=resolveCollisions({...pt},PLAYER_RADIUS);
  assert.ok(Math.hypot(pt.x-actual.x,pt.z-actual.z)<.15,'clear landing '+JSON.stringify(pt));
 }
 assert.ok(FEN_TREES.length>30&&FEN_POOLS.length>=5);
 assert.equal(fenArea(p.arrival.x,p.arrival.z),'Veil Landing');
 assert.ok(OBJECTS.some(o=>o.type==='lumenfen_entry'));
 assert.equal(new Set(OBJECTS.map(o=>o.key)).size,OBJECTS.length);
});
test('authoritative entry checks level, attunement, range, combat and region',()=>{
 const g=makeGame(),entry=find(g,'lumenfen_entry');assert.ok(entry);
 const low=g.addPlayer(makeChar('vanguard',{level:6,attunements:['resonance']}));
 place(low,entry.x,entry.z-3.7);
 let r=interact(g,low,entry.id);assert.equal(r.ok,false);assert.match(r.reason,/level 7/);
 const plain=g.addPlayer(makeChar('vanguard',{level:7}));place(plain,entry.x,entry.z-3.7);
 assert.equal(interact(g,plain,entry.id).ok,false);
 const p=g.addPlayer(eligible());place(p,entry.x+30,entry.z);
 assert.equal(interact(g,p,entry.id).ok,false);
 place(p,entry.x,entry.z-3.7);p.combatUntil=g.time+5000;
 assert.equal(interact(g,p,entry.id).ok,false);
 p.combatUntil=0;
 assert.equal(interact(g,p,entry.id).ok,true);
 assert.ok(inLumenfen(p.x,p.z));
 assert.equal(g.lumenfenOpened,true);
 assert.equal(g.enemies.filter(e=>e.lumenfenWildlife).length,10);
 const count=g.enemies.length;g.openLumenfen();assert.equal(g.enemies.length,count,'no spawn duplication');
 assert.equal(interact(g,p,entry.id).ok,false,'cannot activate remote Reach portal');
 const exit=find(g,'lumenfen_return');place(p,exit.x,exit.z-3.7);
 assert.equal(interact(g,p,exit.id).ok,true);
 assert.equal(travelRegionAt(p.x,p.z),'reach');
 assert.equal(interact(g,p,exit.id).ok,false,'return blocked from outside region');
});
test('internal living rifts traverse both ways and reject combat requests',()=>{
 const g=makeGame(),p=g.addPlayer(eligible()),P=LUMENFEN;
 const spring=find(g,'lumenfen_spring'),crown=find(g,'lumenfen_crown');
 place(p,spring.x,spring.z-3.6);assert.equal(interact(g,p,spring.id).ok,true);
 assert.ok(Math.hypot(p.x-P.crownLanding.x,p.z-P.crownLanding.z)<.2);
 place(p,crown.x,crown.z-3.6);p.autoOn=true;
 assert.equal(interact(g,p,crown.id).ok,false);
 p.autoOn=false;assert.equal(interact(g,p,crown.id).ok,true);
 assert.ok(Math.hypot(p.x-P.springLanding.x,p.z-P.springLanding.z)<.2);
});
test('six Lumenfen landmark compositions are distinct, anchored and collision-aligned',()=>{
 const expected=['veil-landing','mossbound-thicket','glasswater-spring','root-crown-hollow','tidal-weir','luminous-canopy'];
 assert.deepEqual(FEN_SITES.map(s=>s.id),expected);
 const approaches=[LUMENFEN.arrival,LUMENFEN.returnRift,LUMENFEN.springRift,LUMENFEN.crownRift,
   LUMENFEN.springLanding,LUMENFEN.crownLanding];
 const scene=new T.Scene();scene.fog=new T.Fog(0x555555,40,180);
 const sky=new T.Group(),ambient=new T.HemisphereLight(),sun=new T.DirectionalLight();
 scene.add(sky,ambient,sun);
 const fen=buildLumenfenWorld(T,scene,{sky,ambient,sun,detail:0});
 assert.equal(fen.stats().landmarks.sites.length,6);
 const sites=fen.group.getObjectByName('lumenfen:sites');
 assert.ok(sites);
 for(const site of FEN_SITES){
   assert.ok(inLumenfen(site.x,site.z));
   assert.ok(approaches.every(p=>Math.hypot(site.x-p.x,site.z-p.z)>site.clearance+10),
     'landmark encroaches on safe travel: '+site.id);
   assert.ok(FEN_TREES.every(t=>Math.hypot(site.x-t.x,site.z-t.z)>site.clearance+t.r+1.9),
     'landmark interpenetrates a trunk collider: '+site.id);
   const landmark=sites.getObjectByName('lumenfen:site:'+site.id);
   assert.ok(landmark&&landmark.children.some(c=>c.isInstancedMesh),
     'site must contain visible built/ecological geometry: '+site.id);
   assert.ok(landmark.position.distanceTo(new T.Vector3(site.x,fenHeight(site.x,site.z),site.z))<.001);
   assert.ok(FEN_SITE_COLLIDERS.some(c=>c.site===site.id),
     'no shared physical footprints for: '+site.id);
 }
 // Collision uses individual solid geometry, never phantom whole-site discs.
 for(const item of FEN_SITE_COLLIDERS){
   const moved=resolveCollisions({x:item.x,z:item.z},PLAYER_RADIUS);
   if(item.r!==undefined)
     assert.ok(Math.hypot(moved.x-item.x,moved.z-item.z)>=item.r+PLAYER_RADIUS-.02,
       'solid pillar/stone must block travel: '+item.site);
   else assert.ok(Math.abs(moved.x-item.x)>=item.hw || Math.abs(moved.z-item.z)>=item.hd,
       'sluice wall must block travel: '+item.site);
 }
 const wheel=sites.getObjectByName('lumenfen:weir:wheel');
 const dial=sites.getObjectByName('lumenfen:observatory:resonance-armillary');
 assert.ok(wheel&&dial,'weir machinery and observatory instrument must be present');
 const start=wheel.rotation.x;
 fen.update(.05,0,{...LUMENFEN.arrival});
 assert.ok(wheel.rotation.x>start,'mechanism moves during active simulation');
});
test('Lumenfen fauna have six articulated legs and animated drifter fins',()=>{
 const lantern=makeFenLantern(T),stalker=makeFenStalker(T);
 assert.equal(lantern.group.children.filter(c=>c.name==='lumenfen:lantern:fin').length,6);
 assert.equal(stalker.group.children.filter(c=>c.name==='lumenfen:stalker:leg').length,6);
 assert.ok(stalker.group.getObjectByName('lumenfen:stalker:anatomical-torso'));
 stalker.update(.016,{t:2,speed:3});
 assert.ok(stalker.group.children.filter(c=>c.name==='lumenfen:stalker:leg').some(c=>Math.abs(c.rotation.x)>.01));
 lantern.update(.016,{t:2});
 assert.ok(lantern.group.children.filter(c=>c.name==='lumenfen:lantern:fin').some(c=>Math.abs(c.rotation.z)>.01));
 lantern.dispose();stalker.dispose();
});
test('three forest morphologies and six real shallow banks replace repeated primitive blobs',()=>{
 const scene=new T.Scene(),fen=buildLumenfenWorld(T,scene,{detail:0});
 const ecology=fen.stats().ecology;
 assert.equal(ecology.hardwoods+ecology.cageTrees+ecology.willows,FEN_TREES.length);
 assert.ok(ecology.hardwoods>0&&ecology.cageTrees>0&&ecology.willows>0,
   'morphological forest classes must all be populated');
 assert.ok(ecology.instancedBatches>=8&&ecology.instancedBatches<=24,
   'flora should share bounded draw batches');
 assert.equal(fen.group.children.filter(o=>o.name==='lumenfen:mirrorpool').length,FEN_POOLS.length);
 assert.equal(fen.group.children.filter(o=>o.name==='lumenfen:shoreline-shelf').length,FEN_POOLS.length);
 const water=fen.group.children.find(o=>o.name==='lumenfen:mirrorpool');
 assert.ok(water?.geometry?.attributes?.normal?.count>200,'water must have a real shaped surface');
 const bank=fen.group.children.find(o=>o.name==='lumenfen:shoreline-shelf');
 assert.ok(bank.geometry.attributes.color?.count>100,'banks must have terrain-specific sediment data');
 fen.dispose();
 assert.equal(fen.group.parent,null);
});
test('living rootglass and wetland visuals have independent geometry and bounded scene state',()=>{
 const scene=new T.Scene();scene.fog=new T.Fog(0x555555,40,180);
 const sky=new T.Group(),ambient=new T.HemisphereLight(),sun=new T.DirectionalLight();
 scene.add(sky,ambient,sun);
 const fen=buildLumenfenWorld(T,scene,{sky,ambient,sun,detail:0});
 assert.ok(fen.stats().trees>30&&fen.stats().pools>=5);
 fen.update(.016,0,{...LUMENFEN.arrival});
 assert.equal(fen.group.visible,true);assert.equal(scene.fog.color.getHex(),0x1d3436);
 fen.update(.016,1,{x:0,z:0});
 assert.equal(fen.group.visible,false);assert.equal(scene.fog.color.getHex(),0x555555);
 for(const kind of ['lumenfen_entry','lumenfen_return','lumenfen_spring','lumenfen_crown']){
  const r=makeLumenfenRift(T,kind);
  assert.ok(r.group.getObjectByName('lumenfen:membrane'));
  r.update(.1,{reducedMotion:true});r.dispose();
 }
 for(const make of [makeFenLantern,makeFenStalker]){
  const m=make(T);assert.ok(m.group.children.length>1);
  m.update(.016,{t:1,speed:2});m.dispose();
 }
});
