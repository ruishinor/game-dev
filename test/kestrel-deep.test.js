import test from 'node:test';
import assert from 'node:assert/strict';
import { DEEP, ZONES, PROPS, PLAYER_RADIUS, groundHeight, resolveCollisions, zoneAt, deepRoofAt, stepMove, dist } from '../shared/world.js';
import { ThirdPersonCamera } from '../client/src/camera.js';

test('Kestrel Deep has a below-grade flat chamber and reachable eastern portal',()=>{
  assert.equal(zoneAt(DEEP.x,DEEP.z),'Kestrel Deep');
  assert.ok(groundHeight(-35,-8) - DEEP.floor > 4);
  for(let x=DEEP.x-DEEP.hw;x<=DEEP.x+DEEP.hw;x+=0.5)
    for(let z=DEEP.z-DEEP.hd;z<=DEEP.z+DEEP.hd;z+=0.5)
      assert.equal(groundHeight(x,z),DEEP.floor);
  const p={x:-35,z:-8,jy:0,vy:0};
  for(let i=0;i<188;i++) stepMove(p,{f:1,s:0,yaw:-Math.PI/2,j:0},1);
  assert.ok(p.x<-56&&p.x>-58);
  assert.ok(Math.abs(p.z+8)<1e-6);
  for(let i=0;i<188;i++) stepMove(p,{f:1,s:0,yaw:Math.PI/2,j:0},1);
  assert.ok(dist(p,{x:-35,z:-8})<1e-5);
});

test('walls and vessel colliders are authoritative, roof is overhead not a planar blocker',()=>{
  const props=PROPS.filter(p=>p.type.startsWith('deep_'));
  assert.equal(props.filter(p=>p.type==='deep_wall').length,3);
  assert.equal(props.filter(p=>p.type==='deep_vessel').length,2);
  for(const p of props) assert.ok(dist(p,resolveCollisions({x:p.x,z:p.z},PLAYER_RADIUS))>PLAYER_RADIUS);
  assert.ok(deepRoofAt(DEEP.x,DEEP.z));
  assert.equal(deepRoofAt(-48,-8),false);
  assert.ok(dist({x:DEEP.x,z:DEEP.z},resolveCollisions({x:DEEP.x,z:DEEP.z},PLAYER_RADIUS))<1e-6);
});

test('steep orbit camera retracts below the roof and jump has physical clearance',()=>{
  const pos={x:0,y:0,z:0,set(x,y,z){Object.assign(this,{x,y,z})}};
  const cam=new ThirdPersonCamera({position:pos,lookAt(){}});
  cam.pitch=1.4;cam.want=20;cam.dist=20;
  cam.update({x:DEEP.x,y:DEEP.floor,z:DEEP.z},0.05);
  assert.ok(pos.y<DEEP.roofBottom-0.15);
  assert.ok(cam.dist<6);
  const p={x:DEEP.x,z:DEEP.z,jy:0,vy:0};
  let max=0;
  for(let i=0;i<100;i++){stepMove(p,{f:0,s:0,yaw:0,j:i===0},1);max=Math.max(max,p.jy)}
  assert.ok(DEEP.floor+max+2<DEEP.roofBottom);
});
