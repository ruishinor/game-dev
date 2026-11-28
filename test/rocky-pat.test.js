import test from 'node:test';
import assert from 'node:assert/strict';
import {ROCKY_NAME,ROCKY_CREATURE_TYPE,ROCKY_PAT_RANGE,rockyPatEligibility,isRockyPatCommand,stillpointPose} from '../shared/stillpoint-roam.js';
test('Rocky is a named creature with the preserved Stillpoint type',()=>{
  assert.equal(ROCKY_NAME,'Rocky');
  assert.equal(ROCKY_CREATURE_TYPE,'Stillpoint');
  assert.equal(ROCKY_PAT_RANGE,3.2);
});
test('pat command is deliberate and does not intercept social chat or companion abilities',()=>{
  for(const s of ['/pat','/PAT','/pat rocky','/pat Rocky',' /pat Rocky '])assert.equal(isRockyPatCommand(s),true,s);
  for(const s of ['/pat bob','/patty','/pet','/pat rock','pat Rocky','/pat Rocky extra',null])assert.equal(isRockyPatCommand(s),false,String(s));
});
test('pat refuses dead, missing, invalid, unavailable or distant players',()=>{
  const pose=stillpointPose(4);
  const here={x:pose.x,z:pose.z,dead:false};
  assert.equal(rockyPatEligibility(here,pose).ok,true);
  assert.equal(rockyPatEligibility({...here,x:pose.x+ROCKY_PAT_RANGE},pose).ok,true);
  for(const player of [null,{...here,dead:true},{...here,x:NaN},{...here,z:Infinity}])assert.equal(rockyPatEligibility(player,pose).ok,false);
  assert.equal(rockyPatEligibility(here,null).ok,false);
  assert.equal(rockyPatEligibility(here,pose,false).ok,false);
  assert.match(rockyPatEligibility({...here,x:pose.x+10},pose).message,/Move closer/);
});
