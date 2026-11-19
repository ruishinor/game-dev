import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startServer} from '../server/index.js';
import {STILLPOINT_SITE,PROPS,COLLIDERS,OBJECTS,WORLD,PLAYER_RADIUS,resolveCollisions} from '../shared/world.js';
import {stillpointPose,STILLPOINT_CYCLE} from '../shared/stillpoint-roam.js';

test('roaming Stillpoint stays within the safe-zone footprint, avoids permanent props, and has no ghost collider',()=>{
  const site=STILLPOINT_SITE;
  assert.ok(PROPS.includes(site));assert.ok(!COLLIDERS.includes(site));
  const moved=resolveCollisions({x:site.x,z:site.z},PLAYER_RADIUS);
  assert.ok(Math.hypot(moved.x-site.x,moved.z-site.z)<.001);
  let walking=0,resting=0;
  for(let t=0;t<STILLPOINT_CYCLE;t+=.05){
    const p=stillpointPose(t);
    assert.ok(Math.hypot(p.x,p.z)+site.r<WORLD.sanctum.r);
    for(const o of [...COLLIDERS,...OBJECTS]){
      if(o.embedded||!(o.r||o.hw))continue;
      const clearance=o.r??Math.hypot(o.hw,o.hd);
      assert.ok(Math.hypot(p.x-o.x,p.z-o.z)>=site.r+clearance-.001,o.type);
    }
    assert.ok(Math.hypot(p.x-WORLD.spawn.x,p.z-WORLD.spawn.z)>site.r+PLAYER_RADIUS);
    assert.ok(p.speed>=0&&p.speed<=.400001);
    const n=stillpointPose(t+.05);
    assert.ok(Math.hypot(n.x-p.x,n.z-p.z)<=.02001);
    if(p.clip==='Walk')walking++;else resting++;
  }
  assert.ok(walking>100&&resting>100);
  assert.deepEqual(stillpointPose(0),stillpointPose(STILLPOINT_CYCLE));
});

test('HTTP serves the exact approved Stillpoint binary but not authoring files',async()=>{
  const srv=await startServer({port:0,dataFile:null});
  try{
    const base='http://127.0.0.1:'+srv.port;
    const res=await fetch(base+'/client/assets/stillpoint.glb?v=230506ecfb78');
    assert.equal(res.status,200);
    assert.equal(res.headers.get('content-type'),'model/gltf-binary');
    const bytes=Buffer.from(await res.arrayBuffer());
    assert.equal(bytes.toString('ascii',0,4),'glTF');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),'230506ecfb78dee8afe7b64ebe1ccf397efa3762371f85503edfe02fdb0d8d02');
    const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
    for(const name of ['Idle','Walk','WeightShift'])assert.ok(gltf.animations.some(c=>c.name===name),name);
    for(const url of ['/tools/asset-pipeline/assets/stillpoint/outputs/stillpoint_rigged.blend','/client/assets/stillpoint_rigged.blend','/client/assets/game_ready.json']){
      assert.equal((await fetch(base+url)).status,404,url);
    }
  }finally{await srv.close();}
});
