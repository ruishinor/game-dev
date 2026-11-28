import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {LUMENFEN,FEN_TREES,FEN_SITE_COLLIDERS,FEN_POOLS} from '../shared/lumenfen.js';
import {planLumenfenGroundcover,buildLumenfenGroundcover,LUMENFEN_COVER_TYPES} from '../client/src/lumenfen-groundcover.js';
import {buildLumenfenWorld} from '../client/src/lumenfen-world.js';

test('six-metre Lumenfen ecology provides a provable <5m coverage bound, including portals and water',()=>{
  const p=planLumenfenGroundcover();
  assert.equal(p.cells.length,p.cols*p.rows);
  assert.ok(p.cells.length>=2500 && p.maxCoverageDistance<5);
  assert.ok(p.spacingX<=6 && p.spacingZ<=6);
  assert.equal(new Set(p.cells.map(c=>c.col+':'+c.row)).size,p.cells.length);
  assert.deepEqual(p.cells,planLumenfenGroundcover().cells,'plan is deterministic across clients');
  assert.ok(p.cells.some(c=>c.portal));
  assert.ok(p.cells.some(c=>c.water&&c.kind==='lily'));
  assert.ok(p.cells.some(c=>c.bank&&c.kind==='reed'));
  assert.ok(p.cells.filter(c=>c.portal).every(c=>c.kind==='moss'));
  assert.ok(p.cells.every(c=>Number.isFinite(c.y) && Number.isFinite(c.x) && Number.isFinite(c.z)));
  assert.ok(p.cells.every(c=>LUMENFEN_COVER_TYPES.includes(c.kind)));
  assert.ok(p.cells.every(c=>c.portal || c.water || c.scale>=.83));
  // Check a dense 2m sample using the small local cell neighbourhood.
  let worst=0;
  for(let x=LUMENFEN.x-LUMENFEN.hw; x<=LUMENFEN.x+LUMENFEN.hw; x+=2)
    for(let z=LUMENFEN.z-LUMENFEN.hd; z<=LUMENFEN.z+LUMENFEN.hd; z+=2){
      const ix=Math.min(p.cols-1,Math.max(0,Math.floor((x-(LUMENFEN.x-LUMENFEN.hw))/p.spacingX)));
      const iz=Math.min(p.rows-1,Math.max(0,Math.floor((z-(LUMENFEN.z-LUMENFEN.hd))/p.spacingZ)));
      let closest=Infinity;
      for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){
        const cx=ix+di,cz=iz+dj;
        if(cx<0||cx>=p.cols||cz<0||cz>=p.rows)continue;
        const c=p.cells[cz*p.cols+cx];
        closest=Math.min(closest,Math.hypot(c.x-x,c.z-z));
      }
      worst=Math.max(worst,closest);
    }
  assert.ok(worst<5,'maximum sampled blank-space radius: '+worst);
});

test('dense cover shares instanced geometry, respects the low preset and disposes owned resources',()=>{
  for(const detail of [0,1]){
    const scene=new T.Scene();
    const cover=buildLumenfenGroundcover(T,scene,{detail});
    const stats=cover.stats();
    assert.equal(stats.anchors,planLumenfenGroundcover().cells.length);
    assert.equal(stats.count,stats.anchors+stats.satellites);
    if(detail===0)assert.equal(stats.satellites,0,'low quality preserves exactly the essential coverage anchors');
    else assert.ok(stats.satellites>1200,'high quality must add natural secondary clumps');
    assert.equal(Object.values(stats.counts).reduce((a,b)=>a+b,0),stats.count);
    assert.ok(stats.drawBatches<=330,'one batch per species per local cell chunk');
    assert.ok(stats.maxCoverageDistance<5);
    assert.ok(cover.group.children.every(o=>o.isInstancedMesh));
    const renderCount=cover.group.children.reduce((sum,o)=>sum+o.count,0);
    assert.equal(renderCount,stats.count);
    const materials=new Set(cover.group.children.map(o=>o.material));
    const geometries=new Set(cover.group.children.map(o=>o.geometry));
    assert.ok(materials.size<=7&&geometries.size<=7);
    cover.dispose();assert.equal(cover.group.parent,null);
  }
});

test('scene exposes continuously dressed habitat without changing authoritative world or collisions',()=>{
  const scene=new T.Scene();
  const fen=buildLumenfenWorld(T,scene,{detail:0});
  const before=JSON.stringify(FEN_TREES)+JSON.stringify(FEN_SITE_COLLIDERS);
  assert.ok(fen.group.getObjectByName('lumenfen:continuous-groundcover'));
  assert.ok(fen.stats().groundcover.maxCoverageDistance<5);
  assert.equal(fen.stats().pools,FEN_POOLS.length);
  assert.equal(JSON.stringify(FEN_TREES)+JSON.stringify(FEN_SITE_COLLIDERS),before);
  fen.dispose();
  assert.equal(fen.group.parent,null);
});
