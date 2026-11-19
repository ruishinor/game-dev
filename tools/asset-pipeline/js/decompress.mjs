// Decode EXT_meshopt_compression so tools without a Meshopt decoder (Blender's
// bundled glTF importer) can open the exact optimised runtime GLB. Geometry
// keeps its quantised values and textures stay WebP: only the byte-level
// compression is undone.
//   node tools/asset-pipeline/js/decompress.mjs <in.glb> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('usage: decompress.mjs <in.glb> <out.glb>'); process.exit(2); }
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(input);
for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
await io.write(output, doc);
console.log(`decoded ${input} -> ${output}`);
