import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import validator from 'gltf-validator';
import {Group, Line3, Vector3} from 'three';
import { createSpindle, signedWheelTravel, SPINDLE_LOD } from '../client/src/spindle.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);

test('Spindle rolls by signed ground distance and holds its axle still during a stationary turn', () => {
  close(signedWheelTravel(0, 0, 1, 0), 1);
  close(signedWheelTravel(1, .75, 0, Math.PI / 2), 1.25);
  close(signedWheelTravel(0, 0, -1, 0), -1);
  close(signedWheelTravel(1, 0, 0, 0), 0);
  close(signedWheelTravel(0, 0, 0, Math.PI), 0);
  const model = createSpindle(null, () => {});
  const roll = model.group.getObjectByName('Roll');
  const shoulder = model.group.getObjectByName('Shoulder');
  model.update(2, { travel: .64, act: 'idle' });
  close(roll.rotation.x, 1);
  assert.ok(!roll.getObjectByName('Shoulder'));
  model.update(1, { travel: 0, act: 'idle', speed: 3 });
  close(roll.rotation.x, 1);
  assert.ok(shoulder.rotation.x < -.6, 'Arm retracts for transit');
  model.update(.2, { travel: -.32, act: 'idle', interval: Infinity });
  model.update(.2, { travel: 0, act: 'idle', interval: 0 });
  close(roll.rotation.x, .5);
});

test('Spindle engages stock independently of the rim, then parks when told to stay', () => {
  let disposed;
  const model = createSpindle(null, group => { disposed = group; });
  const angle = name => model.group.getObjectByName(name).rotation;
  model.update(2, { act: 'inspecting', reducedMotion: true });
  close(angle('Roll').x, 0);
  assert.ok(angle('Shoulder').x > .47 && angle('Elbow').x < -.64);
  assert.ok(angle('JawA').z > .16);
  close(angle('JawA').z, -angle('JawB').z);
  model.update(2, { act: 'idle', mode: 'stay' });
  assert.ok(angle('Elbow').x > 1.1);
  close(angle('JawA').z, 0);
  model.dispose();
  assert.equal(disposed, model.group);
});

const glb = readFileSync(new URL('../client/assets/spindle.glb', import.meta.url));
const doc = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
const manifest = JSON.parse(readFileSync(new URL('../client/assets/manifest.json', import.meta.url), 'utf8')).assets.spindle;

function exportedScene(index) {
  const nodes = doc.nodes.map(node => {
    const part = new Group();
    part.name = node.name;
    if (node.translation) part.position.fromArray(node.translation);
    if (node.rotation) part.quaternion.fromArray(node.rotation);
    if (node.scale) part.scale.fromArray(node.scale);
    return part;
  });
  doc.nodes.forEach((node, i) => node.children?.forEach(child => nodes[i].add(nodes[child])));
  const root = new Group();
  doc.scenes[index].nodes.forEach(id => root.add(nodes[id]));
  return root;
}

test('exported tool linkage clears the shoulder bearing through deployment and parking', () => {
  // Use actual GLB pivots so the sweep tracks the authored rigid model.
  const root = exportedScene(doc.scene);
  const rig = createSpindle(root, () => {});
  const point = name => root.getObjectByName(name).getWorldPosition(new Vector3());
  for (const state of [{mode:'stay'}, {act:'inspecting'}, {mode:'stay'}]) {
    for (let frame = 0; frame < 120; frame++) {
      rig.update(1/60, state);
      const center = point('Shoulder');
      const distal = new Line3(point('Wrist'), point('JawA'));
      const nearest = distal.closestPointToPoint(center, true, new Vector3());
      // 61 mm shoulder bearing plus 26 mm width of the precision wrist.
      assert.ok(nearest.distanceTo(center) > .087, 'Wrist crossed the shoulder bearing');
    }
  }
});


test('Spindle distance geometry is real, compressed, validated and cheaper; near art and tool meshes are shared', async () => {
  assert.equal(manifest.bytes, glb.length);
  assert.equal(manifest.hash, createHash('sha256').update(glb).digest('hex').slice(0, 12));
  assert.equal(doc.scenes.length, 2);
  assert.equal(doc.scenes[doc.scene].name, 'Precision Machine');
  const farIndex = doc.scenes.findIndex(scene => scene.name === 'Distance');
  assert.notEqual(farIndex, doc.scene);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  await MeshoptDecoder.ready;
  io.registerDependencies({'meshopt.decoder': MeshoptDecoder});
  const decoded = await io.readBinary(glb);
  const scenes = decoded.getRoot().listScenes();
  function meshes(scene) {
    const result = new Map();
    for (const node of scene.listChildren()) node.traverse(part => {
      if (part.getMesh()) result.set(part.getName(), part.getMesh());
    });
    return result;
  }
  const near = meshes(scenes[doc.scene]), far = meshes(scenes[farIndex]);
  assert.equal(near.size, 7); assert.equal(far.size, 7);
  const count = set => [...set.values()].reduce((sum, mesh) => sum + mesh.listPrimitives().reduce((n,p) => n + p.getIndices().getCount()/3,0),0);
  assert.equal(count(near), manifest.tris); assert.equal(count(far), manifest.lodTris);
  assert.ok(count(far) < count(near) * .4, 'LOD must remove at least 60% of triangles');
  for (const [name, mesh] of near) {
    const low = far.get('Far'+name);
    assert.ok(low, `Missing distance mesh ${name}`);
    if (['RollAssembly','HousingAssembly'].includes(name)) assert.notEqual(low, mesh);
    else assert.equal(low,mesh, `Tool geometry duplicated: ${name}`);
    assert.equal(low.listPrimitives()[0].getMaterial(),mesh.listPrimitives()[0].getMaterial());
  }
  for (const ext of decoded.getRoot().listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
  const plain = await io.writeBinary(decoded);
  const result = await validator.validateBytes(plain,{uri:'spindle-decoded.glb'});
  assert.equal(result.issues.numErrors,0,JSON.stringify(result.issues.messages));
  assert.equal(result.issues.numWarnings,0,JSON.stringify(result.issues.messages));
});

test('exported near and distance hierarchies switch with hysteresis and preserve mechanical phase', () => {
  const near = exportedScene(doc.scene);
  const far = exportedScene(doc.scenes.findIndex(scene=>scene.name==='Distance'));
  const rig = createSpindle(near, () => {}, far);
  const angle = name => near.getObjectByName(name).rotation;
  const checkPose = () => {
    for (const name of ['Roll','Shoulder','Elbow','Wrist','JawA','JawB']) {
      const a=angle(name), b=far.getObjectByName('Far'+name).rotation;
      close(a.x,b.x); close(a.y,b.y); close(a.z,b.z);
      const nearP=near.getObjectByName(name).getWorldPosition(new Vector3());
      const farP=far.getObjectByName('Far'+name).getWorldPosition(new Vector3());
      close(nearP.distanceTo(farP),0);
    }
  };
  rig.update(.5,{travel:.64,speed:2,cameraDistance:SPINDLE_LOD.near});
  assert.equal(near.visible,true);assert.equal(far.visible,false);
  rig.update(.1,{travel:.32,speed:2,cameraDistance:SPINDLE_LOD.far,interval:Infinity});
  assert.equal(near.visible,false);assert.equal(far.visible,true);close(angle('Roll').x,1.5);checkPose();
  rig.update(.5,{act:'inspecting',cameraDistance:20,reducedMotion:true});
  assert.equal(far.visible,true);checkPose();
  assert.ok(angle('JawA').z>0);
  rig.update(.1,{travel:-.32,act:'inspecting',cameraDistance:SPINDLE_LOD.near,interval:Infinity});
  assert.equal(near.visible,true);assert.equal(far.visible,false);close(angle('Roll').x,1);checkPose();
  // Missing/incomplete optional distance scene retains the full rig.
  const legacy = createSpindle(exportedScene(doc.scene),()=>{},new Group());
  legacy.update(.1,{cameraDistance:100});assert.equal(legacy.group.visible,true);assert.equal(legacy.group.getObjectByName('Roll').name,'Roll');
});
