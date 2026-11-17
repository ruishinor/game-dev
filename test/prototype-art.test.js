import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIC_ART, fitStaticArt, staticArtStatus } from '../client/src/prototype-art.js';

test('static preview fit preserves aspect ratio, centres X/Z and grounds Y', () => {
  const bounds = { min: {x:-2,y:-0.5,z:1}, max: {x:4,y:2.5,z:3} };
  const prop = {hw:1.15,hd:0.64,h:1.8};
  const {scale,position} = fitStaticArt(bounds,prop);
  assert.ok(Math.abs(scale - 0.35) < 1e-12);
  assert.ok(Math.abs(position[0]+0.35) < 1e-12);
  assert.ok(Math.abs(position[1]-0.175) < 1e-12);
  assert.ok(Math.abs(position[2]+0.7) < 1e-12);
  assert.ok(6*scale <= 2*prop.hw-0.2+1e-12);
  assert.ok(3*scale <= prop.h-0.2);
  assert.ok(2*scale <= 2*prop.hd-0.2);
});

test('invalid envelopes and degenerate or nonfinite bounds fail closed', () => {
  const bounds = {min:{x:0,y:0,z:0}, max:{x:1,y:2,z:1}};
  const p = {hw:1,hd:1,h:2};
  assert.throws(() => fitStaticArt({...bounds,max:{...bounds.max,x:0}},p));
  assert.throws(() => fitStaticArt({...bounds,max:{...bounds.max,z:Infinity}},p));
  assert.throws(() => fitStaticArt(bounds,{...p,hw:0.1}));
  assert.throws(() => fitStaticArt(bounds,p,-1));
  assert.throws(() => fitStaticArt(bounds,p,NaN));
});

test('aggregate status cannot hide a failed or unfinished independent model', () => {
  assert.deepEqual(Object.keys(STATIC_ART),['survey_tower','survey_workstation','survey_engineering','sinter_colony']);
  assert.equal(staticArtStatus({}), 'disabled');
  assert.equal(staticArtStatus({a:'ready',b:'loading'}), 'loading');
  assert.equal(staticArtStatus({a:'fallback',b:'loading'}), 'loading');
  assert.equal(staticArtStatus({a:'ready',b:'fallback'}), 'fallback');
  assert.equal(staticArtStatus({a:'ready',b:'ready'}), 'ready');
});
