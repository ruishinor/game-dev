// Skinned armour LOD: simplify every armour mesh primitive (keeping skin
// weights, UVs and the __fx/__glass channel meshes), re-encode with meshopt.
//   node js/armour-lod.mjs <in.glb> <out.glb> <ratio> [error]
// Used for NPC wearers (Severance Soldiers), where the full set's ~120k
// triangles per character are not affordable at squad scale.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { simplify, weld, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [input, output, ratioArg, errorArg] = process.argv.slice(2);
if (!input || !output) { console.error('usage: node js/armour-lod.mjs <in.glb> <out.glb> <ratio> [error]'); process.exit(2); }
const ratio = Number(ratioArg ?? 0.2), error = Number(errorArg ?? 0.004);
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const count = () => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
const before = count();
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: process.env.LOCK === "1" }), prune({ keepLeaves: true, keepAttributes: true }));
const after = count();
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(output, doc);
console.log(JSON.stringify({ input, output, before: Math.round(before), after: Math.round(after), ratio: +(after / before).toFixed(3) }));
