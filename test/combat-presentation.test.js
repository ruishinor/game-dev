import test from 'node:test';
import assert from 'node:assert/strict';
import { weaponAimFromState, confirmedWeaponAim, heldWeaponOccluded, strikeMotion } from '../client/src/combat-presentation.js';

const vec = (x,y,z) => ({ isVector3: true, x, y, z, clone(){ return vec(this.x, this.y, this.z); } });

test('compact weapon uses combat aim, not unrelated head/eye lookAt', () => {
  const aim = vec(9, 2, 4), eyes = vec(-4, 3, -9);
  const selected = weaponAimFromState({ weaponAimAt: aim, lookAt: eyes });
  assert.deepEqual([selected.x,selected.y,selected.z],[9,2,4]);
  assert.notEqual(selected,aim,'do not retain a mutable frame-loop vector');
  assert.equal(weaponAimFromState({lookAt:eyes}),null,'eye tracking is never a firearm target');
  assert.equal(weaponAimFromState({weaponAimAt:vec(NaN,0,0)}),null);
});

test('confirmed ranged target takes priority over stale selection; invalid targets are ignored', () => {
  const eventTarget = vec(15,1,2), previous = vec(1,1,20), fallback = vec(0,0,12);
  let calls=0;
  const forward=()=>{calls++;return fallback;};
  const actual = confirmedWeaponAim(eventTarget,previous,forward);
  assert.deepEqual([actual.x,actual.y,actual.z],[15,1,2]);
  assert.notEqual(actual,eventTarget);
  assert.equal(calls,0);
  const recovered=confirmedWeaponAim(vec(Infinity,0,0),previous,forward);
  assert.deepEqual([recovered.x,recovered.y,recovered.z],[previous.x,previous.y,previous.z]);
  assert.notEqual(recovered,previous,'also clone cached aim to avoid snapshot mutation');
  assert.equal(calls,0);
  assert.equal(confirmedWeaponAim(null,null,forward),fallback);
  assert.equal(calls,1);
});

test('held rifle remains visible through combat/cast activity; sit and fabrication reserve its arms', () => {
  assert.equal(heldWeaponOccluded({ working:false, sitBlend:0, casting:true, busy:true }),false);
  assert.equal(heldWeaponOccluded({ working:true, sitBlend:0 }),true);
  assert.equal(heldWeaponOccluded({ working:false, sitBlend:.01 }),true);
  assert.equal(heldWeaponOccluded({ working:false, sitBlend:0 }),false);
});

test('melee overlay has anticipation, bounded server-aligned release and full recovery', () => {
  const at=t=>strikeMotion(t,1);
  assert.deepEqual(at(0),{anticipation:0,release:0,recovery:0});
  assert.ok(at(.24).anticipation>.8);
  assert.ok(at(.5).release>.99,'peak at server windup contact marker');
  assert.ok(at(.5).anticipation<.001);
  assert.ok(at(.75).recovery>.9);
  assert.deepEqual(at(1),{anticipation:0,release:0,recovery:0});
  for(let i=0;i<=100;i++){
    const values=Object.values(at(i/100));
    assert.ok(values.every(x=>Number.isFinite(x)&&x>=0&&x<=1));
  }
  assert.deepEqual(strikeMotion(NaN,1),{anticipation:0,release:0,recovery:0});
  assert.deepEqual(strikeMotion(1,0),{anticipation:0,release:0,recovery:0});
});
