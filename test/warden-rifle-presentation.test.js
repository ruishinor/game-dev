import test from 'node:test';
import assert from 'node:assert/strict';
import {syncWardenWeapon} from '../client/src/warden-rifles.js';

test('rifle remains visible only when it can fit, with a retained visible stave',()=>{
 const rifle={group:{visible:true},update:()=>true},stave={visible:true};
 assert.equal(syncWardenWeapon(rifle,stave),'rifle');
 assert.equal(rifle.group.visible,true);
 assert.equal(stave.visible,false);
 rifle.update=()=>false;
 assert.equal(syncWardenWeapon(rifle,stave),'stave');
 assert.equal(rifle.group.visible,false);
 assert.equal(stave.visible,true);
 rifle.update=()=>true;
 assert.equal(syncWardenWeapon(rifle,stave),'rifle');
 assert.equal(rifle.group.visible,true);
 assert.equal(stave.visible,false);
});

test('source unavailable or rig incompatible cannot leave an invisible fallback',()=>{
 const stave={visible:false};
 assert.equal(syncWardenWeapon(null,stave),'stave');
 assert.equal(stave.visible,true);
 assert.equal(syncWardenWeapon(null,null),'unarmed');
});
