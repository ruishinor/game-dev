import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { fenStemGeometry, fenFoliageGeometry, fenSurfaceDetail, fenWaterShimmer } from '../client/src/lumenfen-organics.js';
import { buildLumenfenSites } from '../client/src/lumenfen-sites.js';
import { finishLumenfenSites } from '../client/src/lumenfen-site-finishing.js';
import { makeFenLantern, makeFenStalker } from '../client/src/lumenfen-creatures.js';
import { CombatVfx } from '../client/src/vfx/combat.js';
import { CELL } from '../client/src/vfx/textures.js';

test('Lumenfen vegetation uses sculpted indexed blades and fluted bark, not cones or balls', () => {
  for(const habit of ['oak','cage','willow']) {
    const g=fenFoliageGeometry(T,habit);
    assert.ok(g.index.count > 250,'folded leaf blades: '+habit);
    assert.equal(g.attributes.color.count,g.attributes.position.count);
    assert.ok(g.boundingSphere.radius>.1);g.dispose();
  }
  const stem=fenStemGeometry(T);
  assert.ok(stem.attributes.position.count > 150);stem.dispose();
});

test('Lumenfen wet surfaces compile shader hooks and animated uniform contract', () => {
  const m=fenWaterShimmer(new T.MeshPhysicalMaterial());
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',
    fragmentShader:'#include <common>\n#include <color_fragment>'};
  m.onBeforeCompile(shader,{});
  assert.ok(shader.fragmentShader.includes('uniform float fenWaterTime;'));
  assert.ok(shader.fragmentShader.includes('fenFine'));
  assert.equal(shader.uniforms.fenWaterTime,m.userData.fenWaterTime);
  m.userData.fenWaterTime.value=12.5;
  assert.equal(shader.uniforms.fenWaterTime.value,12.5);
  m.dispose();
  const hide=fenSurfaceDetail(new T.MeshStandardMaterial(),'hide');
  const skin={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',
    fragmentShader:'#include <common>\n#include <color_fragment>'};
  hide.onBeforeCompile(skin,{});
  assert.ok(skin.fragmentShader.includes('fenPatina'));
  hide.dispose();
});

test('landmark finishing retains instancing, shape identity and handles all six sites', () => {
  const sites=buildLumenfenSites(T);
  const before=sites.group.getObjectByName('lumenfen:detail:veil-landing:stone|stone');
  assert.ok(before?.isInstancedMesh);
  const old=before.geometry;
  const result=finishLumenfenSites(T,sites.group);
  assert.ok(result.replaced>=12);
  assert.ok(result.detailedMaterials>=3);
  assert.notEqual(before.geometry,old);
  assert.ok(before.geometry.attributes.position.count>100);
  sites.group.traverse(o=>{
    if(o.name.startsWith('lumenfen:detail:'))assert.equal(o.isInstancedMesh,true);
  });
  sites.dispose();
});

test('Lumenfen creature silhouette uses biological geometry and supports animation/disposal', () => {
  const lantern=makeFenLantern(T),stalker=makeFenStalker(T);
  const mantle=lantern.group.getObjectByName('lumenfen:lantern:fluted-mantle');
  assert.ok(mantle.geometry.attributes.position.count>200);
  assert.equal(lantern.group.children.filter(o=>o.name==='lumenfen:lantern:filter-gill').length,9);
  assert.equal(stalker.group.children.filter(o=>o.name==='lumenfen:stalker:leg').length,6);
  assert.equal(stalker.group.children.filter(o=>o.name==='lumenfen:stalker:keratin-frill').length,7);
  assert.ok(stalker.group.getObjectByName('lumenfen:stalker:splayed-foot'));
  lantern.update(.016,{t:2});
  stalker.update(.016,{t:2,speed:3,attack:true});
  assert.ok(Number.isFinite(mantle.rotation.y));
  lantern.dispose();stalker.dispose();
});


test('native fen fauna use biologic windup and death VFX while keeping danger arcs', () => {
  const emitted=[],arcs=[];
  const vfx={burst(o){emitted.push(o);return 1;},arc(o){arcs.push(o);}};
  const combat=new CombatVfx(vfx);
  const creature={meta:{k:'e',c:'fen_stalker'},chest:new T.Vector3(3,1,4),
    yaw:0,model:{radius:.9}};
  combat.meleeWindup(creature,500);
  assert.ok(arcs.length>0,'danger windup arc retained');
  assert.ok(emitted.some(o=>Array.isArray(o.cell)&&o.cell.includes(CELL.spore)));
  emitted.length=0;
  combat.die(creature);
  assert.equal(emitted.length,2,'natural death layers instead of industrial shards');
  assert.ok(emitted.some(o=>Array.isArray(o.cell)&&o.cell.includes(CELL.petal)));
});
