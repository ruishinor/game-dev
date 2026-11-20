import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD,ZONES} from '../shared/world.js';
import {atlasTerrainColor,clusterMapMarkers,atlasEntityCategory} from '../client/src/atlas-cartography.js';
import {regionFor,project,pixelToWorld} from '../client/src/world-atlas.js';

test('cartography uses opaque, deterministic terrain over full rectangular atlas, never an alpha circle',()=>{
  const points=[[-WORLD.radius,-WORLD.radius],[0,0],[WORLD.radius,WORLD.radius],
    [ZONES.sporefield.x,ZONES.sporefield.z],[ZONES.sinter.x,ZONES.sinter.z]];
  const colors=points.map(([x,z])=>atlasTerrainColor(x,z));
  for(let i=0;i<points.length;i++){
    assert.deepEqual(atlasTerrainColor(...points[i]),colors[i]);
    assert.equal(colors[i].length,4);
    for(const c of colors[i]) assert.ok(Number.isInteger(c)&&c>=0&&c<=255);
    assert.equal(colors[i][3],255,'terrain plate must extend beyond the circular world edge');
  }
  assert.ok(new Set(colors.map(x=>x.join(','))).size>=3,'landscape must show distinct terrain');
});

test('full-bleed atlas projection covers both axes while map selection stays world-correct',()=>{
  const region=regionFor({x:0,z:0}),p=project(region,1240,700);
  assert.ok(p.kx>p.kz,'a wide atlas must use the space horizontally');
  assert.equal(p.X(-region.hw),14);
  assert.equal(p.X(region.hw),1226);
  assert.equal(p.Z(-region.hd),14);
  assert.equal(p.Z(region.hd),686);
  const place={x:ZONES.vault.x,z:ZONES.vault.z};
  const mapped=pixelToWorld(region,p,1240,700,p.X(place.x),p.Z(place.z));
  assert.ok(Math.abs(mapped.x-place.x)<1e-9&&Math.abs(mapped.z-place.z)<1e-9,'World coordinates must round-trip within float precision');
  const q=project(region,1240,700,2,{x:15,z:-8});
  assert.equal(q.X(15),620);assert.equal(q.Z(-8),350);
});

test('world-map categories exclude hostiles even from delivered snapshots',()=>{
  assert.equal(atlasEntityCategory({k:'e',n:'Hostile'}),null);
  assert.equal(atlasEntityCategory({k:'p'}),'players');
  assert.equal(atlasEntityCategory({k:'p'},true),'party');
  assert.equal(atlasEntityCategory({k:'o'}),'objects');
  const marks=[
    {x:110,y:130,category:'objects',color:'#7ac'},
    {x:119,y:132,category:'objects',color:'#7ac'},
    {x:110,y:130,category:'enemies',color:'#f66'},
    {x:350,y:310,category:'party',color:'#9ad'},
  ];
  const groups=clusterMapMarkers(marks,20);
  assert.equal(groups.length,2);
  assert.equal(groups[0].count,2);
  assert.equal(groups[1].category,'party');
  assert.equal(groups.reduce((n,m)=>n+m.count,0),3);
  assert.deepEqual(clusterMapMarkers([{x:NaN,y:2,category:'objects'}]),[]);
});
