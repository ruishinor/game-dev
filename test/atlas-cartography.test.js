import test from 'node:test';
import assert from 'node:assert/strict';
import {WORLD,ZONES,groundHeight} from '../shared/world.js';
import {atlasTerrainColor,reachContourSegments,clusterMapMarkers,atlasEntityCategory} from '../client/src/atlas-cartography.js';
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

test('Reach Atlas preserves world geometry proportions and map selection coordinates',()=>{
  const region=regionFor({x:0,z:0}),p=project(region,1240,700);
  assert.equal(p.kx,p.kz,'a physically circular Reach must not be distorted into an ellipse');
  assert.equal(p.Z(-region.hd),14);
  assert.equal(p.Z(region.hd),686);
  assert.equal(p.X(0),620);
  assert.ok(p.X(-region.hw)>14&&p.X(region.hw)<1226,
    'wide viewports have cartographic side margins rather than false world scale');
  const place={x:ZONES.vault.x,z:ZONES.vault.z};
  const mapped=pixelToWorld(region,p,1240,700,p.X(place.x),p.Z(place.z));
  assert.ok(Math.abs(mapped.x-place.x)<1e-9&&Math.abs(mapped.z-place.z)<1e-9,'World coordinates must round-trip within float precision');
  const q=project(region,1240,700,2,{x:15,z:-8});
  assert.equal(q.kx,q.kz);
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

test('source-grounded atlas biome colours are distinct and retain material identity',()=>{
  const sites=[ZONES.sporefield,ZONES.sinter,ZONES.vault,ZONES.survey,ZONES.deep,ZONES.sanctum];
  const colors=sites.map(p=>atlasTerrainColor(p.x,p.z));
  assert.equal(new Set(colors.map(v=>v.slice(0,3).join(','))).size,sites.length);
  assert.ok(colors[1][0]>colors[0][0],'Sinter sand must be warmer than Sporefield growth');
  assert.ok(colors[5][1]>colors[2][1],'Sanctum and Vault must not share the same tint');
});


test('Reach topographic lines follow the actual walkable heightfield, not invented features',()=>{
  const segments=reachContourSegments(3,1);
  assert.ok(segments.length>100,'Reach must produce surveyed elevation curves');
  assert.ok(new Set(segments.map(s=>s.level)).size>=4,'survey lines must express changes in elevation');
  for(const segment of segments.filter((_,i)=>i%Math.max(1,Math.floor(segments.length/100))===0)){
    const x=(segment.x1+segment.x2)/2,z=(segment.z1+segment.z2)/2;
    assert.ok(Math.hypot(x,z)<=WORLD.radius+1.01,'contours must not invent distant geography');
    assert.ok(Math.abs(groundHeight(x,z)-segment.level)<.75,
      'contours must track real Reach surface elevation');
  }
});
