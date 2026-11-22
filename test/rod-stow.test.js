import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {createRodBackMount} from '../client/src/rod-stow.js';
import {createElectricalRod} from '../client/src/electrical-rod.js';

function simpleHumanoid(frame){
  const bytes=readFileSync(new URL('../client/assets/humanoid_'+frame+'.glb',import.meta.url));
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  const nodes=gltf.nodes.map(n=>{
    const g=new T.Group();g.name=n.name||'';
    if(n.matrix)new T.Matrix4().fromArray(n.matrix).decompose(g.position,g.quaternion,g.scale);
    else {if(n.translation)g.position.fromArray(n.translation);
      if(n.rotation)g.quaternion.fromArray(n.rotation);
      if(n.scale)g.scale.fromArray(n.scale);}
    return g;
  });
  gltf.nodes.forEach((n,i)=>n.children?.forEach(id=>nodes[i].add(nodes[id])));
  const root=new T.Group();gltf.scenes[gltf.scene||0].nodes.forEach(id=>root.add(nodes[id]));
  return root;
}
const local=(root,obj)=>root.worldToLocal(obj.getWorldPosition(new T.Vector3()));

test('stowed joined rod fits behind both actual GLB body frames, not beside or below the avatar',()=>{
  for(const frame of ['m','f']){
    const body=simpleHumanoid(frame),spine=body.getObjectByName('spine_03')||body.getObjectByName('spine_02');
    const pose=createRodBackMount(T,body,spine);
    assert.ok(pose&&pose.position.isVector3&&pose.quaternion.isQuaternion,frame+' stow mount');
    const rod=createElectricalRod();
    try{
      rod.setMode('rod');rod.update(0,{reducedMotion:true});
      spine.add(rod.group);rod.group.position.copy(pose.position);rod.group.quaternion.copy(pose.quaternion);
      body.updateWorldMatrix(true,true);
      const shoulder=local(body,body.getObjectByName('upperarm_r')).add(local(body,body.getObjectByName('upperarm_l'))).multiplyScalar(.5);
      const center=local(body,rod.group),tip0=local(body,rod.group.getObjectByName('RodRightTip')),tip1=local(body,rod.group.getObjectByName('RodLeftTip'));
      assert.ok(Math.abs(center.x-shoulder.x)<.05,frame+' rod sits between the shoulders, not offboard');
      assert.ok(shoulder.z-center.z>.20&&shoulder.z-center.z<.43,frame+' rod is near the back');
      assert.ok(center.distanceTo(shoulder)<.53,frame+' rod does not hover away');
      assert.ok(Math.max(tip0.y,tip1.y)-shoulder.y<.55,frame+' top remains near shoulder/head');
      assert.ok(shoulder.y-Math.min(tip0.y,tip1.y)<1.06,frame+' lower end stays above the ground');
      assert.ok(Math.abs(tip0.x-tip1.x)>.6,frame+' weapon lies diagonally across the back');
      assert.ok(tip0.distanceTo(tip1)>1.4,frame+' complete joined rod remains present');
      // The stow transform is fixed to the animated torso, not a free-floating
      // world-space object that lags as the avatar changes position or direction.
      const centerBefore=local(body,rod.group);
      body.position.set(5,0,-3);body.rotation.y=.7;spine.rotation.x=.09;
      body.updateWorldMatrix(true,true);
      const after=local(body,rod.group);
      assert.ok(centerBefore.distanceTo(after)<.15,frame+' rod follows chest animation');
    }finally{rod.dispose();}
  }
});

test('unfitted or incomplete rigs do not create a detached rod',()=>{
  const body=new T.Group(),spine=new T.Bone();
  body.add(spine);
  assert.equal(createRodBackMount(T,body,spine),null);
  assert.equal(createRodBackMount(T,body,null),null);
});
