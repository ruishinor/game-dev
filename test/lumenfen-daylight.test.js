import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { LUMENFEN } from '../shared/lumenfen.js';
import { buildLumenfenWorld } from '../client/src/lumenfen-world.js';

function environment() {
  const scene = new T.Scene();
  scene.fog = new T.Fog(0x657274, 48, 290);
  const sky = new T.Group();
  const skyMaterial = new T.ShaderMaterial({
    uniforms: {
      top: {value:new T.Color(0x142242)},
      mid: {value:new T.Color(0x354c63)},
      low: {value:new T.Color(0x847e70)}
    }
  });
  const skyMesh = new T.Mesh(new T.SphereGeometry(10,8,8),skyMaterial);
  sky.add(skyMesh);
  const ambient = new T.HemisphereLight(0xb0bcff,0x554433,1.4);
  const sun = new T.DirectionalLight(0xffe0b1,2.6);
  scene.add(sky,ambient,sun);
  const snapshot = () => ({
    fog:scene.fog.color.getHex(),near:scene.fog.near,far:scene.fog.far,
    sky:[...['top','mid','low'].map(k=>skyMaterial.uniforms[k].value.getHex())],
    ambient:ambient.intensity,ambientSky:ambient.color.getHex(),
    ambientGround:ambient.groundColor.getHex(),
    sun:sun.intensity,sunColor:sun.color.getHex(),
  });
  return {scene,sky,ambient,sun,snapshot,cleanup:()=>{
    skyMesh.geometry.dispose();skyMaterial.dispose();
  }};
}

test('server clock differentiates Lumenfen day and night while preserving visibility',()=>{
  const e=environment();
  const baseline=e.snapshot();
  const fen=buildLumenfenWorld(T,e.scene,{sky:e.sky,ambient:e.ambient,sun:e.sun,detail:0});
  const eye={...LUMENFEN.arrival};
  fen.update(.016,0,eye,0);
  const day=e.snapshot();
  const light=fen.group.children.find(c=>c.isPointLight);
  const dayGlow=light.intensity;
  fen.update(.016,1,eye,5000);
  const night=e.snapshot();
  assert.notEqual(day.fog,night.fog,'day/night fog colour must change');
  assert.ok(night.far<day.far,'low-light fog should reduce distant clutter');
  assert.ok(night.ambient>0.45&&night.ambient<day.ambient,'night vegetation needs legible fill');
  assert.ok(night.sun>0.2&&night.sun<day.sun,'moonlight must not erase enemy telegraphs');
  assert.ok(light.intensity>dayGlow,'bounded native bioluminescence increases at night');
  assert.notDeepEqual(day.sky,night.sky,'the sky gradient must correspond to the region');
  assert.equal(fen.group.visible,true);
  fen.update(.016,2,{x:0,z:0},null);
  assert.deepEqual(e.snapshot(),baseline,'the Reach atmosphere must restore exactly');
  fen.dispose();e.cleanup();
});

test('clock transitions interpolate, retain existing no-clock fallback and restore on dispose',()=>{
  const e=environment(),before=e.snapshot();
  const fen=buildLumenfenWorld(T,e.scene,{sky:e.sky,ambient:e.ambient,sun:e.sun,detail:0});
  const eye={...LUMENFEN.arrival};
  fen.update(.016,0,eye);
  assert.equal(e.scene.fog.color.getHex(),0x1d3436,'legacy callers keep a working fallback');
  fen.update(.016,1,eye,2500);
  const dusk=e.snapshot();
  fen.update(.016,2,eye,3750);
  const between=e.snapshot();
  fen.update(.016,3,eye,5000);
  const night=e.snapshot();
  assert.ok(between.sun<dusk.sun&&between.sun>night.sun);
  assert.ok(between.far<dusk.far&&between.far>night.far);
  fen.dispose();
  assert.deepEqual(e.snapshot(),before,'disposing inside Lumenfen must not leak its shared lighting');
  assert.equal(fen.group.parent,null);
  e.cleanup();
});
