// Decode Meshopt and KHR_mesh_quantization so Python tools can read plain
// float attributes (positions, normals, skin weights) of a runtime GLB.
//   node tools/asset-pipeline/js/dequantize.mjs <in.glb> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('usage: dequantize.mjs <in.glb> <out.glb>'); process.exit(2); }
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
// joint indices must stay integers; everything else becomes float
await doc.transform(dequantize({ pattern: /^(?!JOINTS_)/ }));
for (const ext of doc.getRoot().listExtensionsUsed()) if (['EXT_meshopt_compression', 'KHR_mesh_quantization'].includes(ext.extensionName)) ext.dispose();
await io.write(output, doc);
console.log(`dequantized ${input} -> ${output}`);
