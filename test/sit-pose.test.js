// Cross-legged seated pose on a synthetic mannequin skeleton (+Y up, +Z forward).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createSitPose } from '../client/src/sit-pose.js';

function mannequin(leftSign = 1) {
  const root = new T.Group(); root.name = 'humanoid';
  const add = (name, parent, [x, y, z]) => { const bn = new T.Bone(); bn.name = name; parent.add(bn); parent.updateWorldMatrix(true, false);
    bn.position.copy(parent.worldToLocal(new T.Vector3(x, y, z))); bn.updateWorldMatrix(true, false); return bn; };
  const pelvis = add('pelvis', root, [0, .92, 0]);
  const s1 = add('spine_01', pelvis, [0, 1.02, 0]), s2 = add('spine_02', s1, [0, 1.18, 0]), s3 = add('spine_03', s2, [0, 1.34, 0]);
  const neck = add('neck_01', s3, [0, 1.5, 0]); add('Head', neck, [0, 1.6, 0]);
  for (const [side, s] of [['l', leftSign], ['r', -leftSign]]) {
    const th = add('thigh_' + side, pelvis, [s * .09, .9, 0]), ca = add('calf_' + side, th, [s * .09, .48, 0]);
    const ft = add('foot_' + side, ca, [s * .09, .08, 0]); add('ball_' + side, ft, [s * .09, .03, .13]);
    const ua = add('upperarm_' + side, s3, [s * .19, 1.42, 0]), la = add('lowerarm_' + side, ua, [s * .19, 1.15, 0]);
    const ha = add('hand_' + side, la, [s * .19, .89, 0]); add('middle_01_' + side, ha, [s * .19, .81, 0]);
  }
  root.updateWorldMatrix(true, true);
  return root;
}
const at = (root, n) => root.worldToLocal(root.getObjectByName(n).getWorldPosition(new T.Vector3()));

for (const leftSign of [1, -1]) test(`cross-legged pose geometry (rig left = ${leftSign > 0 ? '+X' : '-X'})`, () => {
  const h = mannequin(leftSign), pose = createSitPose(T, h);
  assert.ok(pose);
  const before = h.getObjectByName('thigh_l').quaternion.clone();
  pose.apply(0);
  assert.ok(h.getObjectByName('thigh_l').quaternion.equals(before), 'k=0 leaves the animated pose untouched');
  pose.apply(1);
  const ground = .03 - .025;
  const pelvis = at(h, 'pelvis');
  assert.ok(Math.abs(pelvis.y - (ground + pose.pose.seat)) < 1e-6, 'pelvis on the ground plane');
  for (const [side, s] of [['l', leftSign], ['r', -leftSign]]) {
    const hip = at(h, 'thigh_' + side), knee = at(h, 'calf_' + side), ankle = at(h, 'foot_' + side), hand = at(h, 'hand_' + side);
    assert.ok(s * (knee.x - hip.x) > .25, side + ' knee wide');
    assert.ok(knee.y < hip.y + .02 && knee.y > ground + .05, side + ' knee low but above ground');
    assert.ok(knee.z > hip.z + .15, side + ' knee forward');
    assert.ok(s * ankle.x < s * knee.x - .3, side + ' shin crosses toward the other side');
    assert.ok(ankle.y >= ground && ankle.y < knee.y + .02, side + ' ankle near the ground');
    assert.ok(hand.distanceTo(knee) < .2, side + ' hand rests at the knee');
    for (const p of [knee, ankle, hand]) assert.ok(p.y >= ground - 1e-6, 'nothing below the ground plane');
  }
  // The shins are layered front/back so they do not interpenetrate.
  assert.ok(Math.abs(at(h, 'foot_l').z - at(h, 'foot_r').z) > .05);
  // Spine leans forward; the head stays above the shoulders.
  assert.ok(at(h, 'spine_03').z > at(h, 'spine_01').z);
  assert.ok(at(h, 'Head').y > at(h, 'spine_03').y);
});

test('partial blend lies between standing and seated; a rig missing bones gets no pose', () => {
  const h = mannequin(), pose = createSitPose(T, h);
  pose.apply(.5);
  const y = at(h, 'pelvis').y;
  assert.ok(y < .92 && y > .2);
  const broken = mannequin(); broken.getObjectByName('ball_r').removeFromParent();
  assert.equal(createSitPose(T, broken), null);
});
