import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {WORLD_CLOCK} from '../shared/world-clock.js';
import {lumenfenClimate,FEN_CLIMATE} from '../shared/lumenfen-climate.js';
import {FEN_BIOME_DROPS,fenBiomeDrops} from '../server/sim/loot-tables.js';
import {GOODS} from '../shared/goods.js';
import {MATERIALS,RECIPES,previewRecipe} from '../shared/crafting.js';
import {makeGame,makeChar,place} from './helpers.js';
import {spawnLumenfenWildlife} from '../server/sim/lumenfen.js';
import {dealDamage} from '../server/sim/combat.js';
import {lootState,openLoot,takeLoot} from '../server/sim/loot.js';
import {moonAboveFen,buildLumenfenMoonMirrors} from '../client/src/lumenfen-moon-mirrors.js';
import {buildLumenfenWorld} from '../client/src/lumenfen-world.js';
import {buildFenMonsoonBloom,buildFenMonsoonFlood,createFenMonsoonFx} from '../client/src/lumenfen-monsoon.js';
import {emitFenLootFx,FEN_LOOT_VFX_IDS} from '../client/src/lumenfen-loot-fx.js';
import {validateLumenfenLootDonors} from '../tools/assets/lumenfen-loot-donors-check.mjs';
import {FEN_POOLS,LUMENFEN} from '../shared/lumenfen.js';

const atDay=n=>n*WORLD_CLOCK.periodMs;
const goodChar=()=>makeChar('symbiotech',{level:8,attunements:['resonance']});

test('monsoon is a clock-synchronised season with gradual shoulders and clear intervals',()=>{
  const dry=lumenfenClimate(atDay(5)),onset=lumenfenClimate(atDay(13));
  const wet=lumenfenClimate(atDay(16)),recede=lumenfenClimate(atDay(21));
  assert.equal(dry.season,'clear');
  assert.equal(wet.season,'monsoon');
  assert.ok(wet.rain>=.45&&wet.flood>=.99);
  assert.ok(onset.rain>.1&&onset.rain<wet.rain);
  assert.ok(recede.rain>.05&&recede.rain<wet.rain);
  assert.equal(lumenfenClimate(atDay(16)+FEN_CLIMATE.periodMs).rain,wet.rain,
    'shared climate repeats with the declared seasonal period');
  assert.equal(lumenfenClimate(atDay(16)).season,lumenfenClimate(atDay(16)).season);
  assert.ok(lumenfenClimate(-10000).rain>=0);
  assert.ok(wet.wind>dry.wind);
});

test('Lumenfen loot rows are valid registries, rare blueprints and wet-season resources',()=>{
  for(const rows of Object.values(FEN_BIOME_DROPS)){
    const ids=new Set();
    for(const row of rows){
      assert.ok(!ids.has(row.id));ids.add(row.id);
      assert.ok(Object.hasOwn(row.kind==='goods'?GOODS:MATERIALS,row.id),row.id);
      assert.ok(row.chance>0&&row.chance<=1);
    }
  }
  const wet=lumenfenClimate(atDay(16));
  const dry=lumenfenClimate(atDay(4));
  const fullWet=fenBiomeDrops('fen_stalker',()=>0,wet);
  const fullDry=fenBiomeDrops('fen_stalker',()=>0,dry);
  assert.ok(fullWet.some(r=>r.id==='monsoon_silt'));
  assert.ok(fullWet.some(r=>r.id==='rootglass_crown_shard'));
  assert.ok(!fullDry.some(r=>r.id==='monsoon_silt'));
  assert.ok(!fullDry.some(r=>r.id==='rootglass_crown_shard'));
  assert.ok(fullWet.some(r=>r.id==='blueprint_tidal_service_cassette'));
  assert.equal(fenBiomeDrops('skitter',()=>0,wet).length,0);
  assert.deepEqual(fenBiomeDrops('fen_lantern',()=>1,wet),[]);
  assert.deepEqual(fenBiomeDrops('fen_lantern',()=>NaN,wet),[]);
});

test('corpses authorize independent personal region salvage; collection respects wallet/inventory rules',()=>{
  const g=makeGame();g.wallNow=()=>atDay(16);g.biomeRng=()=>0;g.rng=()=>.999;
  const e=spawnLumenfenWildlife(g).find(e=>e.type==='fen_stalker'&&!e.elite);
  const p=g.addPlayer(goodChar()),stranger=g.addPlayer(goodChar());
  place(p,e.x+1,e.z);
  place(stranger,0,0);
  dealDamage(g,p,e,100000,'test');
  const entries=e.lootByPlayer?.get(p.id)||[];
  assert.ok(entries.some(x=>x.id==='bog_chitin'));
  assert.ok(entries.some(x=>x.id==='monsoon_silt'));
  assert.ok(entries.some(x=>x.id==='blueprint_tidal_service_cassette'));
  assert.ok(entries.every(x=>x.kind!=='item'),'no generic equipment from wildlife');
  assert.equal(e.lootByPlayer?.has(stranger.id),false,'not a global pickup');
  assert.ok(openLoot(g,p,e.id,e.lootGeneration).ok);
  assert.ok(takeLoot(g,p,e.id,e.lootGeneration,null).ok);
  assert.equal(p.char.materials.bog_chitin,1);
  assert.equal(p.char.goods.blueprint_tidal_service_cassette,1);
  assert.ok(p.outbox.some(m=>m.e==='fen_loot'&&m.item==='bog_chitin'),
    'collected personal materials trigger the matching private VFX event');
  assert.ok(!stranger.outbox.some(m=>m.e==='fen_loot'));

  assert.equal(lootState(g,p).loot,null);
  assert.equal(openLoot(g,p,e.id,e.lootGeneration).ok,false,'corpse cannot roll again');
});

test('biome recipes require actual blueprints and consumed regional resources',()=>{
  for(const id of ['fen_culture_ampoules','tidal_service_cassettes','monsoon_culture_ampoules']){
    const recipe=RECIPES[id];assert.ok(recipe?.blueprint&&Object.hasOwn(GOODS,recipe.blueprint));
    for(const [material,quantity]of Object.entries(recipe.inputs)){
      assert.ok(MATERIALS[material]&&quantity>0);
    }
    const character=goodChar();assert.equal(previewRecipe(character,id).ok,false);
    character.goods={[recipe.blueprint]:1};
    character.materials=Object.fromEntries(Object.entries(recipe.inputs).map(([mat,q])=>[mat,q]));
    const preview=previewRecipe(character,id);
    assert.ok(preview.ok,JSON.stringify(preview));
    assert.equal(preview.goods[recipe.output.goods],recipe.output.count);
    for(const material of Object.keys(recipe.inputs))assert.ok(!preview.materials[material]);
  }
});

test('mirror activation requires moon above the marsh, still water and a nearby camera',()=>{
  assert.ok(moonAboveFen(.5));
  assert.ok(!moonAboveFen(.18));
  assert.ok(!moonAboveFen(.76));
  const parent=new T.Group();
  for(const pool of FEN_POOLS){
    const g=new T.PlaneGeometry(3,3);
    g.rotateX(-Math.PI/2);g.translate(pool.x,0,pool.z);
    const water=new T.Mesh(g,new T.MeshPhysicalMaterial());
    water.name='lumenfen:mirrorpool';parent.add(water);
  }
  const m=buildLumenfenMoonMirrors(T,parent,{detail:2,textureSize:256});
  assert.equal(m.stats().poolMirrors,1,'only one planar render target is allocated');
  assert.equal(m.stats().eligiblePools,FEN_POOLS.length);
  const near=FEN_POOLS[0];
  m.update({x:near.x,z:near.z},.5,{rain:0});
  assert.equal(m.stats().activeMirror,0);
  assert.equal(parent.children.filter(o=>o.name==='lumenfen:moonlit-planar-reflection'&&o.visible).length,1);
  m.update({x:near.x,z:near.z},.5,{rain:.8});
  assert.equal(m.stats().activeMirror,-1);
  m.update({x:near.x,z:near.z},.1,{rain:0});
  assert.equal(m.stats().activeMirror,-1);
  m.dispose();
  assert.equal(parent.children.filter(o=>o.name==='lumenfen:moonlit-planar-reflection').length,0);
  for(const water of parent.children){water.geometry.dispose();water.material.dispose();}
});

test('monsoon content and pooled VFX never create colliders or emitter storms',()=>{
  const group=new T.Group(),bloom=buildFenMonsoonBloom(T,group);
  assert.ok(bloom.stats().plants>130);
  assert.equal(bloom.group.visible,false);
  bloom.update({rain:.9});assert.equal(bloom.group.visible,true);
  bloom.update({rain:0});assert.equal(bloom.group.visible,false);
  bloom.dispose();
  const emissions=[],vfx={quality:2,burst:e=>emissions.push(e)};
  const fx=createFenMonsoonFx(vfx);
  fx.update(.2,{x:LUMENFEN.x,z:LUMENFEN.z},{rain:.9,wind:.9});
  fx.update(.2,{x:LUMENFEN.x,z:LUMENFEN.z},{rain:.9,wind:.9});
  assert.ok(emissions.length>=1);
  assert.ok(emissions.every(e=>e.count<=30));
  const emitted=emissions.length;
  fx.update(.2,{x:LUMENFEN.x,z:LUMENFEN.z},{rain:0,wind:0});
  assert.equal(emissions.length,emitted);
  fx.dispose();
});

test('Lumenfen world keeps graphics and gameplay separate during climate updates',()=>{
  const scene=new T.Scene(),world=buildLumenfenWorld(T,scene,{detail:0});
  assert.equal(world.stats().mirrors.poolMirrors,0);
  world.setClimate(lumenfenClimate(atDay(16)));
  const x=LUMENFEN.x,z=LUMENFEN.z;
  world.update(.016,1,{x,z,y:2});
  assert.ok(world.stats().monsoon.visible);
  assert.ok(world.stats().floodplain.visible);
  assert.equal(world.stats().floodplain.bankSheets,FEN_POOLS.length);
  world.update(.016,1,{x:0,z:0,y:2});
  assert.equal(world.group.visible,false);
  world.dispose();
  assert.equal(world.group.parent,null);
});

test('gathering VFX maps only real biome loot identifiers to pooled organic visuals',()=>{
  const specimens=new Set(Object.values(FEN_BIOME_DROPS).flat().map(d=>d.id));
  assert.deepEqual([...FEN_LOOT_VFX_IDS].sort(),[...specimens].sort());
  const emitted=[],sigils=[],vfx={quality:2,burst:x=>emitted.push(x),sigil:x=>sigils.push(x)};
  assert.equal(emitFenLootFx(vfx,{x:2,y:1,z:3},'bog_chitin'),true);
  assert.equal(emitted.length,1);
  assert.equal(sigils.length,0,'common salvage should not generate rare sigil');
  assert.equal(emitFenLootFx(vfx,{x:2,y:1,z:3},'rootglass_crown_shard'),true);
  assert.ok(sigils.length>=1,'rare monsoon specimen should have a distinct luminous response');
  assert.equal(emitFenLootFx(vfx,{x:2,y:1,z:3},'nonexistent-item'),false);
  assert.equal(emitFenLootFx({quality:0,burst(){throw Error('quality zero unexpectedly emitted');}},
    {x:2,y:1,z:3},'rootglass_crown_shard'),false);
});

test('every loot and blueprint has verified owner-archive node mapping',()=>{
 const provenance=validateLumenfenLootDonors();
 assert.equal(provenance.lootItems,FEN_LOOT_VFX_IDS.length);
 assert.ok(provenance.distinctDonors>=6);
 assert.ok(provenance.donorNodesReferenced>=12);
});

test('monsoon expands real shallow bank surfaces without new terrain collision',()=>{
 const group=new T.Group(),flood=buildFenMonsoonFlood(T,group);
 assert.equal(flood.stats().bankSheets,FEN_POOLS.length);
 assert.ok(flood.group.children.every(m=>m.geometry.attributes.position.count>250));
 assert.ok(flood.group.children.every(m=>m.geometry.index.count>1000));
 flood.update({flood:.85,wind:.72});
 assert.equal(flood.stats().visible,true);
 flood.update({flood:0,wind:0});
 assert.equal(flood.stats().visible,false);
 flood.dispose();assert.equal(flood.group.parent,null);
});
