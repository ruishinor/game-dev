// Rigid presentation rig. The axle stays level while the rim accumulates
// travel on its local X axis. Units match the game world and the authored GLB.
import * as THREE from 'three';

const RADIUS = .64;
const TAU = Math.PI * 2;

export function signedWheelTravel(dx, dy, dz, yaw) {
  const groundDistance = Math.hypot(dx, dz);
  if (!groundDistance) return 0;
  const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  return forward * Math.hypot(groundDistance, dy) / groundDistance;
}

// The same pivots drive the low-detail stand-in during asset failure and in
// the explicit procedural preview. Dimensions follow the production rig.
function fallbackBody() {
  const root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xc2b39a, metalness: .27, roughness: .73 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x443e35, metalness: .62, roughness: .63 });
  const ochre = new THREE.MeshStandardMaterial({ color: 0x987238, metalness: .35, roughness: .69 });
  function pivot(parent, name, x, y, z) {
    const node = new THREE.Group();
    node.name = name;
    node.position.set(x, y, z);
    parent.add(node);
    return node;
  }
  function part(parent, geometry, material) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function link(parent, y, z, radius, material) {
    const axis = new THREE.Vector3(0, y, z);
    const mesh = part(parent, new THREE.CylinderGeometry(radius * .8, radius, axis.length(), 8), material);
    mesh.position.copy(axis).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
  }
  const roll = pivot(root, 'Roll', 0, RADIUS, 0);
  for (const side of [-1, 1]) {
    const tyre = part(roll, new THREE.TorusGeometry(.565, .075, 8, 36), metal);
    tyre.rotation.y = Math.PI / 2;
    tyre.position.x = side * .085;
    for (let i = 0; i < 5; i++) {
      const shoe = part(roll, new THREE.TorusGeometry(.53, .068, 6, 8, TAU / 5 - .12), i === 2 ? ochre : paint);
      shoe.rotation.order = 'XYZ';
      shoe.rotation.set(i * TAU / 5, Math.PI / 2, 0);
      shoe.position.x = side * .145;
    }
  }
  const hub = part(root, new THREE.CylinderGeometry(.26, .22, .66, 24), paint);
  hub.position.y = RADIUS;
  hub.rotation.z = Math.PI / 2;
  const bearings = pivot(root, 'BearingCarrier', 0, RADIUS, 0);
  for (const angle of [.2, 2.5, 4.55]) {
    link(bearings, .51 * Math.cos(angle), .51 * Math.sin(angle), .052, metal);
  }
  const mount = pivot(root, 'Shoulder', .35, RADIUS, .06);
  link(mount, .25, .075, .053, metal);
  const elbow = pivot(mount, 'Elbow', 0, .25, .075);
  link(elbow, .055, .245, .043, ochre);
  const wrist = pivot(elbow, 'Wrist', 0, .055, .245);
  link(wrist, -.125, .21, .038, paint);
  for (const side of [-1, 1]) {
    const jaw = pivot(wrist, side < 0 ? 'JawA' : 'JawB', side * .026, -.125, .21);
    link(jaw, -.075, .06, .016, ochre);
  }
  return root;
}

// Two thresholds prevent geometry flicker when the camera hovers near the boundary.
export const SPINDLE_LOD = Object.freeze({ near: 18, far: 22 });

export function createSpindle(template, disposeInstance, distanceTemplate = null) {
  const near = template || fallbackBody();
  const names = ['Roll', 'Shoulder', 'Elbow', 'Wrist', 'JawA', 'JawB'];
  const joints = (root, prefix = '') => names.map(name => root.getObjectByName(prefix + name));
  const nearJoints = joints(near);
  if (nearJoints.some(node => !node)) throw Error('Missing Spindle articulation node');
  const farJoints = template && distanceTemplate ? joints(distanceTemplate, 'Far') : null;
  // An old or incomplete optional LOD must never suppress the accepted near model.
  const far = farJoints && farJoints.every(Boolean) ? distanceTemplate : null;
  const group = far ? new THREE.Group() : near;
  const rigs = [nearJoints];
  if (far) {
    group.add(near, far);
    far.visible = false;
    rigs.push(farJoints);
  }
  group.name = 'spindle:precision-machine';
  let phase = 0, folded = 1, inspection = 0, elapsed = 0, measuring = 0, distant = false;
  return {
    kind: template ? 'glb' : 'procedural', group, height: RADIUS * 2, radius: .72, hover: 0,
    update(dt, state) {
      phase = (phase + (state.travel || 0) / RADIUS) % TAU;
      const inspecting = state.act === 'inspecting';
      measuring = inspecting ? measuring + dt : 0;
      const stowed = state.act === 'dormant' || state.act === 'stranded' || state.mode === 'stay';
      const transport = stowed ? 1 : inspecting ? 0 : Math.min(1, (state.speed || 0) / 2);
      const settle = 1 - Math.exp(-dt * 5);
      folded += (transport - folded) * settle;
      inspection += (Number(inspecting) - inspection) * settle;
      elapsed += dt;
      const previous = distant;
      if (far && Number.isFinite(state.cameraDistance)) {
        distant = distant ? state.cameraDistance > SPINDLE_LOD.near : state.cameraDistance >= SPINDLE_LOD.far;
      }
      const switched = distant !== previous;
      if (!switched && elapsed < (state.interval || 0)) return;
      elapsed = 0;
      const squeeze = state.reducedMotion ? 1 : (1 - Math.cos(measuring * 6)) * .5;
      const jawAngle = .17 * inspection * squeeze;
      // Apply the same pose to both rigid hierarchies before switching visibility.
      for (const [roll, shoulder, elbow, wrist, jawA, jawB] of rigs) {
        roll.rotation.x = phase;
        shoulder.rotation.x = -.65 * folded + .48 * inspection;
        // Park the needles below and ahead of the bearing.
        elbow.rotation.x = 1.15 * folded - .65 * inspection;
        wrist.rotation.x = .50 * folded - .36 * inspection;
        jawA.rotation.z = jawAngle;
        jawB.rotation.z = -jawAngle;
      }
      if (far) {
        near.visible = !distant;
        far.visible = distant;
      }
    },
    dispose() { disposeInstance(group); },
  };
}
