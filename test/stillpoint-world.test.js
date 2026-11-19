import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startServer} from '../server/index.js';
import {STILLPOINT_SITE,PROPS,OBJECTS,WORLD,PLAYER_RADIUS,resolveCollisions} from '../shared/world.js';

test('resting Stillpoint occupies a real safe-zone footprint without blocking arrival or service anchors',()=>{
  const p=STILLPOINT_SITE;
  assert.ok(Math.hypot(p.x,p.z)+p.r<WORLD.sanctum.r);
  assert.ok(PROPS.includes(p));
  for(const o of [...PROPS,...OBJECTS]){
    if(o===p||o.embedded||!(o.r||o.hw))continue;
    const clearance=o.r??Math.hypot(o.hw,o.hd);
    assert.ok(Math.hypot(p.x-o.x,p.z-o.z)>p.r+clearance,o.type);
  }
  assert.ok(Math.hypot(p.x-WORLD.spawn.x,p.z-WORLD.spawn.z)>p.r+PLAYER_RADIUS);
  const moved=resolveCollisions({x:p.x+.01,z:p.z},PLAYER_RADIUS);
  assert.ok(Math.hypot(moved.x-p.x,moved.z-p.z)>=p.r+PLAYER_RADIUS-.001);
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
    assert.ok(gltf.animations.some(c=>c.name==='Idle'));
    for(const url of ['/tools/asset-pipeline/assets/stillpoint/outputs/stillpoint_rigged.blend','/client/assets/stillpoint_rigged.blend','/client/assets/game_ready.json']){
      assert.equal((await fetch(base+url)).status,404,url);
    }
  }finally{await srv.close();}
});
