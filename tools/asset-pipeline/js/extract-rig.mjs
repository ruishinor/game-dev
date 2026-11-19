// Extract a skinned glTF's skeleton (node names, hierarchy, rest TRS, inverse
// bind matrices) and selected animation clips as plain JSON, decoding Meshopt
// compression with glTF Transform. The pipeline uses this to give an imported
// character the exact joint frames and clips of an existing runtime rig.
//
//   node tools/asset-pipeline/js/extract-rig.mjs <in.glb> <out.json> [clip ...]
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const [input, output, ...clips] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: extract-rig.mjs <in.glb> <out.json> [clip ...]');
  process.exit(2);
}
const doc = await io.read(input);
const root = doc.getRoot();
const skin = root.listSkins()[0];
if (!skin) throw new Error(`${input}: no skin`);
const joints = skin.listJoints();
const parentOf = new Map();
for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
// Every ancestor of the joints up to the scene root, so world transforms are exact.
const chain = new Set(joints);
for (const j of joints) for (let p = parentOf.get(j); p; p = parentOf.get(p)) chain.add(p);
const nodes = [...chain].map((n) => ({ name: n.getName(), parent: parentOf.get(n)?.getName() ?? null, t: n.getTranslation(), r: n.getRotation(), s: n.getScale(), joint: joints.includes(n) }));
const ibm = Array.from(skin.getInverseBindMatrices().getArray());
const wanted = new Set(clips);
const animations = root.listAnimations().filter((a) => !wanted.size || wanted.has(a.getName())).map((a) => ({
  name: a.getName(),
  channels: a.listChannels().map((ch) => {
    const s = ch.getSampler();
    return { node: ch.getTargetNode().getName(), path: ch.getTargetPath(), interpolation: s.getInterpolation(), times: Array.from(s.getInput().getArray()), values: Array.from(s.getOutput().getArray()) };
  }),
}));
const missing = [...wanted].filter((c) => !animations.some((a) => a.name === c));
if (missing.length) throw new Error(`clips not found: ${missing.join(', ')}`);
fs.writeFileSync(output, JSON.stringify({ source: input, joints: joints.map((j) => j.getName()), nodes, inverseBindMatrices: ibm, animations }));
console.log(`${joints.length} joints, ${animations.length} clips -> ${output}`);
