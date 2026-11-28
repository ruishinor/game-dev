import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {FEN_SITES,FEN_SITE_COLLIDERS,LUMENFEN,fenHeight} from '../shared/lumenfen.js';
import {resolveCollisions,PLAYER_RADIUS} from '../shared/world.js';
import {buildLumenfenSites} from '../client/src/lumenfen-sites.js';

function bounds(mesh) {
  assert.ok(mesh?.isMesh, 'expected a visible mesh');
  assert.ok(mesh.geometry.isBufferGeometry, 'water and banks must use shaped geometry');
  assert.ok(mesh.geometry.attributes.normal?.count > 100, 'surface normals are missing');
  assert.ok(mesh.geometry.index?.count > 400, 'surface must not be a flat display quad');
  mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox;
}

test('Glasswater Spring has an irregular water mirror and terrain-conforming banks', () => {
  const {group,stats,dispose} = buildLumenfenSites(T);
  const spring = group.getObjectByName('lumenfen:site:glasswater-spring');
  const water = spring.getObjectByName('lumenfen:spring:water');
  const bank = spring.getObjectByName('lumenfen:spring:sediment-bank');
  const shape = bounds(water),shore = bounds(bank);
  assert.ok(shape.max.x > 7 && shape.min.x < -7);
  assert.ok(shape.max.z > 4.7 && shape.min.z < -4.7);
  assert.ok(shore.max.x > shape.max.x, 'shore must extend outside the water');
  assert.equal(water.material.transparent,true);
  assert.equal(water.material.depthWrite,false);
  // Every outer-rim vertex meets the authoritative terrain at a shallow
  // waterline. Bounding-box checks alone allowed a suspended water disc.
  const rim=water.geometry.attributes.position;
  for(let i=rim.count-64;i<rim.count;i++){
    const x=spring.position.x+rim.getX(i),z=spring.position.z+rim.getZ(i);
    const clearance=spring.position.y+rim.getY(i)-fenHeight(x,z);
    assert.ok(clearance>.03&&clearance<.07,
      'spring water must meet the terrain rather than float or clip: '+clearance);
  }
  assert.ok(spring.children.find(c=>c.isInstancedMesh), 'crossing structures must remain');
  assert.ok(stats().hydrology.waterSurfaces >= 4);
  let disposed = false;
  water.geometry.addEventListener('dispose',()=>{disposed=true;});
  dispose();
  assert.ok(disposed,'unique water geometry must be released on teardown');
});

test('Tidal Weir headpond, tailrace and wheel race are physically distinct from the closed sluice', () => {
  const {group,stats,dispose} = buildLumenfenSites(T);
  const weir = group.getObjectByName('lumenfen:site:tidal-weir');
  const head = bounds(weir.getObjectByName('lumenfen:weir:headpond-water'));
  const tail = bounds(weir.getObjectByName('lumenfen:weir:tailrace-water'));
  const race = bounds(weir.getObjectByName('lumenfen:weir:wheel-race'));
  bounds(weir.getObjectByName('lumenfen:weir:headpond-bank'));
  bounds(weir.getObjectByName('lumenfen:weir:tailrace-bank'));
  assert.ok(head.max.z < -3 && tail.min.z > 3,'sluice must separate incoming/outgoing water');
  assert.ok(race.min.x > 6.5 && race.max.x < 9.5,'wheel race must stay beside the mill wheel');
  assert.ok(race.min.z < 0 && race.max.z > 0);
  assert.ok(weir.getObjectByName('lumenfen:weir:wheel'),'existing animated wheel must survive');
  assert.deepEqual(stats().hydrology,{waterSurfaces:4,shoreSurfaces:3});
  dispose();
});

test('hydrology changes no authoritative obstacles or portal landing contracts', () => {
  assert.equal(FEN_SITES.length,6);
  const previousColliders=JSON.stringify(FEN_SITE_COLLIDERS);
  const structures=buildLumenfenSites(T);
  for(const point of [LUMENFEN.arrival,LUMENFEN.springLanding,LUMENFEN.crownLanding]){
    assert.ok(Number.isFinite(fenHeight(point.x,point.z)));
    const resolved=resolveCollisions({...point},PLAYER_RADIUS);
    assert.ok(Math.hypot(resolved.x-point.x,resolved.z-point.z)<.15,
      'waterwork art must not alter safe arrivals');
  }
  assert.equal(JSON.stringify(FEN_SITE_COLLIDERS),previousColliders);
  structures.dispose();
});
