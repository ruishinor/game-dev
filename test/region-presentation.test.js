import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {updateRegionPresentations} from '../client/src/region-presentation.js';
import {buildLumenfenWorld} from '../client/src/lumenfen-world.js';
import {buildSilentFoundry, FOUNDRY_VISIBILITY} from '../client/src/silent-foundry.js';
import {LUMENFEN} from '../shared/lumenfen.js';
import {SILENT_FOUNDRY} from '../shared/silent-foundry.js';
import {SEVERANCE_POCKET} from '../shared/severance-gate.js';

test('inactive region releases atmosphere before the new region applies it',()=>{
  const calls=[];
  const mock=name=>({update(...args){calls.push({name,clock:args[3]});}});
  const s=mock('severance'),f=mock('foundry'),l=mock('lumenfen');
  const frame=(eye,expected)=>{
    calls.length=0;
    updateRegionPresentations(s,f,l,.016,5,eye,5000);
    assert.deepEqual(calls.map(c=>c.name),expected);
    assert.equal(calls.filter(c=>c.name==='lumenfen').length,1);
    assert.equal(calls.find(c=>c.name==='lumenfen').clock,5000);
  };
  frame(SEVERANCE_POCKET.arrival,['foundry','lumenfen','severance']);
  frame(SILENT_FOUNDRY.arrival,['severance','lumenfen','foundry']);
  frame(LUMENFEN.arrival,['severance','foundry','lumenfen']);
  frame({x:0,z:0},['severance','foundry','lumenfen']);
  frame(null,['severance','foundry','lumenfen']);
});

test('Lumenfen↔Foundry teleports preserve destination atmosphere and restore Reach exactly',()=>{
  const scene=new T.Scene();
  scene.fog=new T.Fog(0x415768,60,240);
  const sky=new T.Group();
  const gradient=new T.ShaderMaterial({uniforms:{
    top:{value:new T.Color(0x0c2345)},
    mid:{value:new T.Color(0x345678)},
    low:{value:new T.Color(0x8296a4)}
  }});
  const dome=new T.Mesh(new T.SphereGeometry(15,8,8),gradient);
  sky.add(dome);
  sky.position.set(3,4,5);
  const ambient=new T.HemisphereLight(0xabbcdd,0x453322,1.6);
  const sun=new T.DirectionalLight(0xffdbaa,2.5);
  scene.add(sky,ambient,sun);
  const snapshot=()=>({
    fog:scene.fog.color.getHex(),
    near:scene.fog.near,far:scene.fog.far,
    skyVisible:sky.visible,skyPos:sky.position.toArray(),
    skyColors:['top','mid','low'].map(k=>gradient.uniforms[k].value.getHex()),
    ambient:ambient.intensity,ambientSky:ambient.color.getHex(),
    ground:ambient.groundColor.getHex(),
    sun:sun.intensity,sunColor:sun.color.getHex()
  });
  const baseline=snapshot();
  const fen=buildLumenfenWorld(T,scene,{sky,ambient,sun,detail:0});
  const foundry=buildSilentFoundry(T,scene,{lighting:{sky,ambient,sun}});
  const severance={update(){}};
  const update=(eye,clock=5000)=>updateRegionPresentations(
    severance,foundry,fen,.016,1,eye,clock
  );

  try {
    // Lumenfen night -> directly teleport into Foundry; no intermediate Reach frame.
    update(LUMENFEN.arrival,5000);
    assert.ok(sun.intensity<1,'the night palette must be applied first');
    update(SILENT_FOUNDRY.arrival);
    assert.equal(foundry.inside,true);
    assert.equal(fen.group.visible,false);
    assert.equal(sky.visible,false,'Foundry hides the outdoor sky');
    assert.equal(sun.intensity,.15,'Foundry light may not be overwritten by Lumenfen exit');
    assert.equal(ambient.intensity,FOUNDRY_VISIBILITY.ambientInside);
    update({x:0,z:0});
    assert.deepEqual(snapshot(),baseline,'exit from Foundry must restore Reach, not stale Lumenfen night');

    // Foundry -> Lumenfen day has the inverse risk: the Foundry exit must
    // happen before the outdoor palette is saved and applied.
    update(SILENT_FOUNDRY.arrival);
    update(LUMENFEN.arrival,0);
    assert.equal(sky.visible,true,'Foundry exit must reveal Lumenfen sky');
    assert.ok(sun.intensity>1,'Lumenfen daytime sunlight must win');
    assert.equal(scene.fog.color.getHex(),0x294d49);
    update({x:0,z:0});
    assert.deepEqual(snapshot(),baseline,'leaving the second region restores all shared colours and lighting');
  } finally {
    update({x:0,z:0});
    fen.dispose();foundry.dispose();
    dome.geometry.dispose();gradient.dispose();
  }
});
