import { Document } from '@gltf-transform/core';
import { RigidMesh, radians } from './lib/spindle-geometry.mjs';
import { spindleMaterial, finish as f } from './lib/spindle-surfaces.mjs';

const TURN = Math.PI * 2;

const addBoltRing = (part, center, axis = 'z', radius = 0.038, count = 6, bolt = 0.0065) => {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TURN;
    const local = axis === 'z'
      ? [center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius, center[2]]
      : [center[0], center[1] + Math.cos(a) * radius, center[2] + Math.sin(a) * radius];
    const tip = axis === 'z' ? [local[0], local[1], local[2] + 0.008] : [local[0] + 0.008, local[1], local[2]];
    part.rod(local, tip, bolt, bolt * 0.84, f.bronze, 6);
  }
};

function buildBody(part) {
  part.arc([
    [-0.24, 0.16], [-0.16, 0.28], [-0.02, 0.35], [0.14, 0.33], [0.25, 0.22], [0.22, 0.13],
    [0.08, 0.11], [-0.13, 0.11],
  ], 0, TURN, [f.iron, f.ochre, f.ochre, f.repair, f.gunmetal, f.iron, f.graphite, f.graphite], { steps: 40 });

  // Lower power pod.
  part.arc([
    [-0.11, 0.06], [-0.07, 0.11], [0.06, 0.13], [0.13, 0.09], [0.11, 0.04], [-0.08, 0.04],
  ], 0, TURN, [f.graphite, f.ochre, f.ochre, f.iron, f.gunmetal, f.graphite], { origin: [0, -0.20, 0], steps: 24 });

  // Chest plate and optic bezel.
  part.plate(0.21, 0.022, [[-0.12, 0.04], [-0.06, 0.16], [0.06, 0.16], [0.12, 0.04], [0.08, -0.10], [-0.08, -0.10]], f.ivory, f.patina, 0.004);
  part.rod([0.22, -0.02, 0], [0.25, -0.02, 0], 0.058, 0.052, f.graphite, 20);
  part.rod([0.25, -0.02, 0], [0.256, -0.02, 0], 0.028, 0.028, f.glass, 16);

  // Rear exhaust / stabiliser pipes.
  for (const z of [-0.12, 0, 0.12]) part.rod([-0.23, -0.09, z], [-0.36, -0.12, z], 0.028, 0.022, f.iron, 12);

  // Upper shoulder collars for the turret mount.
  part.rod([0.01, 0.14, 0], [0.01, 0.28, 0], 0.12, 0.098, f.ochre, 24);
  addBoltRing(part, [0.01, 0.11, 0], 'x', 0.05, 6, 0.0052);

  // Side hydraulic lines.
  for (const side of [-1, 1]) {
    part.hose([
      [0.02, 0.04, side * 0.16],
      [0.08, 0.11, side * 0.22],
      [0.14, 0.14, side * 0.23],
      [0.18, 0.19, side * 0.16],
    ], 0.012, f.rubber, 10);
  }
}

function buildTurretYaw(part) {
  part.arc([
    [-0.10, 0.10], [-0.06, 0.16], [0.06, 0.16], [0.11, 0.10], [0.10, 0.04], [-0.08, 0.04],
  ], 0, TURN, [f.iron, f.ochre, f.repair, f.ochre, f.graphite, f.graphite], { steps: 22 });
  part.rod([0, -0.12, 0], [0, 0.12, 0], 0.06, 0.058, f.iron, 16);
  addBoltRing(part, [0, 0, 0], 'x', 0.06, 6, 0.005);
}

function buildTurretPitch(part) {
  part.arc([
    [-0.17, 0.11], [-0.10, 0.18], [0.05, 0.20], [0.13, 0.18], [0.19, 0.11], [0.18, 0.05], [-0.16, 0.05],
  ], 0, TURN, [f.gunmetal, f.ochre, f.ochre, f.repair, f.iron, f.graphite, f.graphite], { steps: 26 });
  // Side trunnions.
  for (const side of [-1, 1]) part.rod([-0.02, 0, side * 0.16], [0.08, 0, side * 0.16], 0.032, 0.028, f.iron, 12);
}

function buildBarrels(part) {
  // Central breech.
  part.rod([0, 0, -0.12], [0, 0, 0.22], 0.085, 0.078, f.ochre, 18);
  part.rod([0, 0, 0.22], [0, 0, 0.28], 0.074, 0.074, f.iron, 18);
  part.rod([0, 0, 0.28], [0, 0, 0.34], 0.058, 0.058, f.graphite, 18);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TURN;
    const x = Math.cos(a) * 0.08;
    const y = Math.sin(a) * 0.08;
    part.rod([x, y, 0.14], [x, y, 0.74], 0.028, 0.024, f.iron, 12);
    part.rod([x, y, 0.74], [x, y, 0.80], 0.021, 0.018, f.graphite, 10);
  }
  // Barrel cage rings.
  for (const z of [0.16, 0.34, 0.56]) part.arc([[-0.014, 0.11], [0.014, 0.11], [0.014, 0.095], [-0.014, 0.095]], 0, TURN, f.bronze, { origin: [0, 0, z], steps: 18 });
}

function clawOutline(length = 0.18, spread = 0.09) {
  return [
    [0.00, 0.00],
    [0.03, spread * 0.28],
    [length * 0.72, spread * 0.22],
    [length, 0.0],
    [length * 0.82, -spread * 0.18],
    [0.08, -spread * 0.24],
  ];
}

function buildLegSegment(part, end, tile, accent = f.iron) {
  const [x, y, z] = end;
  part.rod([0, 0, 0], [x, y, z], 0.032, 0.025, tile, 12);
  const len = Math.hypot(x, y, z) || 1;
  const nx = x / len, ny = y / len, nz = z / len;
  const up = Math.abs(ny) < 0.92 ? [0, 1, 0] : [0, 0, 1];
  const bx = up[1] * nz - up[2] * ny;
  const by = up[2] * nx - up[0] * nz;
  const bz = up[0] * ny - up[1] * nx;
  const mag = Math.hypot(bx, by, bz) || 1;
  const ox = (bx / mag) * 0.032;
  const oy = (by / mag) * 0.032;
  const oz = (bz / mag) * 0.032;
  const shroud = [
    [oy + 0.03, oz + 0.01],
    [-oy + 0.03, -oz + 0.01],
    [y * 0.62 - oy * 0.3 + 0.04, z * 0.62 - oz * 0.3 + 0.015],
    [y * 0.62 + oy * 0.3 + 0.04, z * 0.62 + oz * 0.3 + 0.015],
  ];
  part.plate(x * 0.48 + ox * 0.18, 0.022, shroud, accent, f.patina, 0.003);
  part.rod([0, 0, 0], [x * 0.18, y * 0.18, z * 0.18], 0.044, 0.034, f.graphite, 14);
  part.rod([x * 0.82, y * 0.82, z * 0.82], [x, y, z], 0.026, 0.03, f.graphite, 14);
}

function buildClaw(part, side = 1, forward = 1) {
  const tibia = [side * 0.08, -0.12, forward * 0.11];
  buildLegSegment(part, tibia, f.iron, f.iron);
  const toe = [side * 0.06, -0.06, forward * 0.10];
  part.rod(tibia, [tibia[0] + toe[0], tibia[1] + toe[1], tibia[2] + toe[2]], 0.018, 0.012, f.graphite, 10);
  const reach = forward * 0.12;
  for (const dir of [0.85, -0.85]) {
    const outline = clawOutline(0.18, 0.06).map(([yy, zz]) => [tibia[1] + yy, tibia[2] + reach + zz * dir]);
    part.plate(tibia[0] + side * 0.018, 0.010, outline, f.iron, f.graphite, 0.002);
  }
}

function buildLeg(doc, mat, parent, prefix, side, forward, upper, lower) {
  const hip = new RigidMesh(doc, mat, `${prefix}Hip`, parent, upper.offset);
  buildLegSegment(hip, upper.end, forward > 0 ? f.iron : f.gunmetal, f.ochre);
  const knee = new RigidMesh(doc, mat, `${prefix}Knee`, hip.pivot, upper.end);
  buildLegSegment(knee, lower.end, forward > 0 ? f.ochre : f.iron, f.repair);
  const ankle = new RigidMesh(doc, mat, `${prefix}Ankle`, knee.pivot, lower.end);
  buildClaw(ankle, side, forward);
  hip.finish();
  knee.finish();
  ankle.finish();
}

export async function createTurretDrone() {
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene('Turret Drone');
  doc.getRoot().setDefaultScene(scene);
  const root = doc.createNode('TurretDrone');
  scene.addChild(root);
  const mat = await spindleMaterial(doc);
  const make = (name, parent, offset = [0, 0, 0]) => new RigidMesh(doc, mat, name, parent, offset);

  const body = make('Body', root, [0, 0.76, 0]);
  buildBody(body);
  body.finish();

  const yaw = make('TurretYaw', body.pivot, [0.02, 0.31, 0]);
  buildTurretYaw(yaw);
  yaw.finish();

  const pitch = make('TurretPitch', yaw.pivot, [0.02, 0.03, 0]);
  buildTurretPitch(pitch);
  pitch.finish();

  const barrels = make('BarrelSpin', pitch.pivot, [0.03, 0.03, 0.21]);
  buildBarrels(barrels);
  barrels.finish();

  // Rear stabiliser vanes.
  for (const [name, side] of [['TailL', -1], ['TailR', 1]]) {
    const tail = make(name, body.pivot, [-0.06, 0.18, side * 0.16]);
    tail.rod([0, 0, 0], [-0.12, 0.18, side * 0.24], 0.022, 0.015, f.iron, 10);
    tail.plate(-0.10, 0.014, [[0, 0], [0.09, 0.06], [0.18, 0.03], [0.20, -0.02], [0.08, -0.04]], f.repair, f.patina, 0.002);
    tail.finish();
  }

  buildLeg(doc, mat, body.pivot, 'LegFL', 1, 1, { offset: [0.18, 0.05, 0.21], end: [0.10, -0.15, 0.15] }, { end: [0.08, -0.17, 0.16] });
  buildLeg(doc, mat, body.pivot, 'LegFR', -1, 1, { offset: [0.18, 0.05, -0.21], end: [0.10, -0.15, -0.15] }, { end: [0.08, -0.17, -0.16] });
  buildLeg(doc, mat, body.pivot, 'LegBL', 1, -1, { offset: [-0.10, 0.03, 0.24], end: [-0.08, -0.13, 0.16] }, { end: [-0.06, -0.16, 0.13] });
  buildLeg(doc, mat, body.pivot, 'LegBR', -1, -1, { offset: [-0.10, 0.03, -0.24], end: [-0.08, -0.13, -0.16] }, { end: [-0.06, -0.16, -0.13] });

  return doc;
}
