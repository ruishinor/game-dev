import test from 'node:test';
import assert from 'node:assert/strict';
import { SPOREFIELD_COLONIES, planSporeMotes } from '../client/src/sporefield-colonies.js';

test('Sporefield remains a distinct set of established dry and wet GLB colony sites',()=>{
  assert.equal(SPOREFIELD_COLONIES.length,8);
  assert.equal(SPOREFIELD_COLONIES.filter(p=>p[3]===1).length,4);
  assert.ok(Object.isFrozen(SPOREFIELD_COLONIES));
  for(const p of SPOREFIELD_COLONIES) {
    assert.ok(Object.isFrozen(p));
    assert.equal(p.length,4);
    assert.ok(p[2]>2 && p[2]<4);
  }
});
test('Atmosphere is deterministically anchored near physical colony patches',()=>{
  const count=110,ground=(x,z)=>.05*x+.02*z;
  const a=planSporeMotes(count,ground);
  assert.deepEqual(a,planSporeMotes(count,ground));
  assert.equal(a.length,count*3);
  for(let i=0;i<count;i++){
    const site=SPOREFIELD_COLONIES[i%SPOREFIELD_COLONIES.length];
    const x=a[i*3],y=a[i*3+1],z=a[i*3+2];
    assert.ok(Math.hypot(x-site[0],z-site[1])<=site[2]*1.65+1e-8);
    assert.ok(y>ground(x,z));
  }
  assert.equal(planSporeMotes(40,ground).length,120,'low quality remains budgeted');
  assert.throws(()=>planSporeMotes(161,ground),/budget/);
  assert.throws(()=>planSporeMotes(10,null),/ground/);
});
