import * as THREE from 'three';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

function named(root, id) {
  const obj = root.getObjectByName(id);
  if (!obj) throw new Error(`TurretDrone is missing node ${id}`);
  return obj;
}

function standard(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(geometry, material, name = '') {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

function buildFallback() {
  const root = new THREE.Group();
  root.name = 'TurretDrone';
  const orange = standard(0xad6d2e, 0.58, 0.28);
  const metal = standard(0x6e6e6a, 0.44, 0.72);
  const dark = standard(0x292a2b, 0.72, 0.34);
  const pale = standard(0xb9b5a7, 0.56, 0.18);
  const glass = new THREE.MeshStandardMaterial({ color: 0x6c8e92, roughness: 0.18, metalness: 0.18, emissive: 0x223b40, emissiveIntensity: 0.5 });

  const body = new THREE.Group(); body.name = 'Body'; body.position.set(0, 0.76, 0); root.add(body);
  body.add(mesh(new THREE.SphereGeometry(0.3, 20, 14), orange));
  const belly = mesh(new THREE.SphereGeometry(0.18, 16, 10), orange); belly.position.set(0.04, -0.2, 0); body.add(belly);
  const chest = mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.14, 6), pale); chest.rotation.z = Math.PI / 2; chest.position.set(0.22, -0.03, 0); body.add(chest);
  const eyeRing = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 18), dark); eyeRing.rotation.z = Math.PI / 2; eyeRing.position.set(0.27, -0.02, 0); body.add(eyeRing);
  const eye = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 18), glass); eye.rotation.z = Math.PI / 2; eye.position.set(0.29, -0.02, 0); body.add(eye);
  for (const z of [-0.1, 0, 0.1]) {
    const pipe = mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.14, 10), metal); pipe.rotation.z = Math.PI / 2; pipe.position.set(-0.29, -0.11, z); body.add(pipe);
  }

  const yaw = new THREE.Group(); yaw.name = 'TurretYaw'; yaw.position.set(0.02, 0.31, 0); body.add(yaw);
  const yawBase = mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.18, 18), orange); yawBase.rotation.z = Math.PI / 2; yaw.add(yawBase);

  const pitch = new THREE.Group(); pitch.name = 'TurretPitch'; pitch.position.set(0.02, 0.03, 0); yaw.add(pitch);
  const housing = mesh(new THREE.SphereGeometry(0.18, 18, 12), orange); pitch.add(housing);
  for (const side of [-1, 1]) {
    const trunnion = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 12), metal); trunnion.rotation.x = Math.PI / 2; trunnion.position.set(0.02, 0, side * 0.16); pitch.add(trunnion);
  }

  const barrels = new THREE.Group(); barrels.name = 'BarrelSpin'; barrels.position.set(0.03, 0.03, 0.21); pitch.add(barrels);
  const breech = mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.34, 18), orange); breech.rotation.x = Math.PI / 2; breech.position.z = 0.05; barrels.add(breech);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * 0.08;
    const y = Math.sin(a) * 0.08;
    const barrel = mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.62, 10), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(x, y, 0.42);
    barrels.add(barrel);
  }

  for (const [name, side] of [['TailL', -1], ['TailR', 1]]) {
    const tail = new THREE.Group(); tail.name = name; tail.position.set(-0.06, 0.18, side * 0.16); body.add(tail);
    const arm = mesh(new THREE.CylinderGeometry(0.018, 0.014, 0.32, 10), metal); arm.rotation.z = side * 0.6; arm.rotation.x = -0.6; arm.position.set(-0.08, 0.11, side * 0.1); tail.add(arm);
    const vane = mesh(new THREE.BoxGeometry(0.14, 0.018, 0.08), orange); vane.position.set(-0.15, 0.18, side * 0.18); vane.rotation.z = side * 0.35; tail.add(vane);
  }

  const legMaterial = { upper: metal, lower: orange, claw: dark };
  const legSpec = [
    ['LegFL', new THREE.Vector3(0.18, 0.05, 0.21), new THREE.Vector3(0.10, -0.15, 0.15), new THREE.Vector3(0.08, -0.17, 0.16), 1, 1],
    ['LegFR', new THREE.Vector3(0.18, 0.05, -0.21), new THREE.Vector3(0.10, -0.15, -0.15), new THREE.Vector3(0.08, -0.17, -0.16), -1, 1],
    ['LegBL', new THREE.Vector3(-0.10, 0.03, 0.24), new THREE.Vector3(-0.08, -0.13, 0.16), new THREE.Vector3(-0.06, -0.16, 0.13), 1, -1],
    ['LegBR', new THREE.Vector3(-0.10, 0.03, -0.24), new THREE.Vector3(-0.08, -0.13, -0.16), new THREE.Vector3(-0.06, -0.16, -0.13), -1, -1],
  ];
  const cylinderBetween = (a, b, radiusA, radiusB, material) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const geom = new THREE.CylinderGeometry(radiusB, radiusA, len, 10);
    const obj = mesh(geom, material);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    obj.position.copy(a).add(b).multiplyScalar(0.5);
    return obj;
  };
  for (const [prefix, offset, upper, lower, side, front] of legSpec) {
    const hip = new THREE.Group(); hip.name = `${prefix}Hip`; hip.position.copy(offset); body.add(hip);
    hip.add(cylinderBetween(new THREE.Vector3(), upper, 0.032, 0.025, legMaterial.upper));
    const knee = new THREE.Group(); knee.name = `${prefix}Knee`; knee.position.copy(upper); hip.add(knee);
    knee.add(cylinderBetween(new THREE.Vector3(), lower, 0.028, 0.022, legMaterial.lower));
    const ankle = new THREE.Group(); ankle.name = `${prefix}Ankle`; ankle.position.copy(lower); knee.add(ankle);
    const toe = new THREE.Vector3(side * 0.08, -0.12, front * 0.11);
    ankle.add(cylinderBetween(new THREE.Vector3(), toe, 0.02, 0.015, legMaterial.upper));
    for (const dir of [1, -1]) {
      const claw = mesh(new THREE.ConeGeometry(0.024, 0.16, 7), legMaterial.claw);
      claw.position.copy(toe).add(new THREE.Vector3(side * 0.03, -0.05, front * 0.08 * dir));
      claw.rotation.x = front > 0 ? Math.PI / 2.4 : -Math.PI / 2.4;
      claw.rotation.z = -side * dir * 0.55;
      ankle.add(claw);
    }
  }

  return root;
}

export function createTurretDrone(template, disposeInstance = () => {}) {
  const group = template || buildFallback();
  const body = named(group, 'Body');
  const turretYaw = named(group, 'TurretYaw');
  const turretPitch = named(group, 'TurretPitch');
  const barrelSpin = named(group, 'BarrelSpin');
  const tails = ['TailL', 'TailR'].map((id) => named(group, id));
  const legs = [
    { hip: named(group, 'LegFLHip'), knee: named(group, 'LegFLKnee'), ankle: named(group, 'LegFLAnkle'), side: 1, front: 1, phase: 0 },
    { hip: named(group, 'LegFRHip'), knee: named(group, 'LegFRKnee'), ankle: named(group, 'LegFRAnkle'), side: -1, front: 1, phase: Math.PI },
    { hip: named(group, 'LegBLHip'), knee: named(group, 'LegBLKnee'), ankle: named(group, 'LegBLAnkle'), side: 1, front: -1, phase: Math.PI },
    { hip: named(group, 'LegBRHip'), knee: named(group, 'LegBRKnee'), ankle: named(group, 'LegBRAnkle'), side: -1, front: -1, phase: 0 },
  ];

  const scratch = new THREE.Vector3();
  let gait = 0;
  let yaw = 0;
  let pitch = 0;
  let recoil = 0;
  let spin = 0;
  let aliveBlend = 1;

  return {
    kind: template ? 'glb' : 'procedural',
    group,
    height: 1.75,
    radius: 1.02,
    hover: 0,
    update(dt, state = {}) {
      const speed = Math.max(0, state.speed || 0);
      const moving = Math.min(1, speed / 3.8);
      const firing = Math.max(state.attack || 0, state.cast || 0);
      const dead = !!state.dead;
      aliveBlend = damp(aliveBlend, dead ? 0 : 1, 8, dt);
      gait += dt * (1.4 + moving * 5.2) * aliveBlend;
      recoil = Math.max(recoil * Math.exp(-dt * 12), firing * 0.22);
      spin += dt * (dead ? 0 : 5 + moving * 8 + firing * 44);

      let targetYaw = 0;
      let targetPitch = -0.06;
      if (!dead && state.lookAt) {
        scratch.copy(state.lookAt);
        group.worldToLocal(scratch);
        targetYaw = clamp(Math.atan2(scratch.x, scratch.z), -1.25, 1.25);
        const horiz = Math.max(0.2, Math.hypot(scratch.x, scratch.z));
        targetPitch = clamp(-Math.atan2(scratch.y - 1.05, horiz), -0.55, 0.4);
      }
      yaw = damp(yaw, dead ? 0 : targetYaw, 8, dt);
      pitch = damp(pitch, dead ? -0.35 : targetPitch, 8, dt);

      turretYaw.rotation.y = yaw;
      turretPitch.rotation.x = pitch;
      barrelSpin.rotation.z = spin;
      barrelSpin.position.z = 0.21 - recoil * 0.08;

      const bodyLift = dead ? -0.32 : Math.sin(gait * 1.4) * 0.02 * moving;
      body.position.y = 0.76 + bodyLift;
      body.rotation.z = dead ? 0.22 : Math.sin(gait * 0.9) * 0.04 * moving;
      body.rotation.x = dead ? -0.2 : 0.03 * Math.cos(gait * 0.7) * moving;

      tails.forEach((tail, index) => {
        tail.rotation.x = dead ? -0.8 : -0.15 + Math.sin(gait * 1.1 + index) * 0.08 * (0.3 + moving);
        tail.rotation.z = dead ? (index === 0 ? -0.5 : 0.5) : (index === 0 ? -0.15 : 0.15) + Math.sin(gait * 0.8 + index * 1.3) * 0.05;
      });

      for (const leg of legs) {
        const phase = gait + leg.phase;
        if (dead) {
          leg.hip.rotation.z = leg.side * 0.72;
          leg.hip.rotation.y = leg.front * 0.25;
          leg.knee.rotation.z = leg.side * -1.28;
          leg.ankle.rotation.z = leg.side * 0.9;
          continue;
        }
        const stride = Math.sin(phase) * moving;
        const brace = firing * 0.1 + (state.act === 'idle' ? 0 : 0.03);
        leg.hip.rotation.z = leg.side * (0.28 + brace + 0.18 * stride);
        leg.hip.rotation.y = leg.front * (0.32 + 0.10 * Math.cos(phase)) + leg.side * 0.08 * stride;
        leg.knee.rotation.z = leg.side * (-0.85 - 0.24 * Math.sin(phase + 0.6));
        leg.ankle.rotation.z = leg.side * (0.62 + 0.18 * Math.sin(phase + 1.1));
      }
    },
    dispose() {
      disposeInstance(group);
    },
  };
}
