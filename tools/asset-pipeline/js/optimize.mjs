// Optimise a pipeline GLB with the project's existing glTF Transform recipe
// (tools/assets/lib/gltf.mjs: dedup, prune, resample, WebP textures, meshopt),
// then validate it and report what the file actually contains.
//
//   node tools/asset-pipeline/js/optimize.mjs <in.glb> <out.glb> [maxTexture=2048] [quality=86] [keep]
// 'keep' retains vertex attributes no material samples (e.g. a TEXCOORD_1 read by a runtime shader).
// The report is written to <out.glb>.report.json (glTF Transform logs to stdout).
import fs from 'node:fs';
import validator from 'gltf-validator';
import { readGltf, optimise, writeGlb } from '../../assets/lib/gltf.mjs';

const [input, output, maxTexture = '2048', quality = '86', attributes = 'prune'] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: optimize.mjs <in.glb> <out.glb> [maxTexture] [quality]');
  process.exit(2);
}
const doc = await readGltf(input);
await optimise(doc, { maxTexture: Number(maxTexture), textureQuality: Number(quality), keepAttributes: attributes === 'keep' });
const bytes = await writeGlb(doc, output);

const buf = fs.readFileSync(output);
const report = await validator.validateBytes(new Uint8Array(buf), { maxIssues: 50 });
const root = doc.getRoot();
let tris = 0;
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const idx = prim.getIndices();
  tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
}
const out = {
  file: output,
  bytes,
  inputBytes: fs.statSync(input).size,
  triangles: tris,
  meshes: root.listMeshes().length,
  materials: root.listMaterials().map((m) => m.getName()),
  textures: root.listTextures().map((t) => ({ name: t.getName(), mime: t.getMimeType(), size: t.getSize(), bytes: t.getImage()?.byteLength })),
  skins: root.listSkins().map((s) => ({ joints: s.listJoints().map((j) => j.getName()) })),
  animations: root.listAnimations().map((a) => ({ name: a.getName(), channels: a.listChannels().length,
    seconds: Math.max(...a.listSamplers().map((s) => { const arr = s.getInput().getArray(); return arr[arr.length - 1]; })) })),
  nodes: root.listNodes().map((n) => n.getName()).filter((n) => n.startsWith('socket_')),
  extensionsUsed: root.listExtensionsUsed().map((e) => e.extensionName),
  validator: { errors: report.issues.numErrors, warnings: report.issues.numWarnings, infos: report.issues.numInfos,
    messages: report.issues.messages.filter((m) => m.severity <= 1).slice(0, 20).map((m) => `${m.severity === 0 ? 'E' : 'W'} ${m.code} ${m.pointer ?? ''} ${m.message}`) },
};
fs.writeFileSync(`${output}.report.json`, JSON.stringify(out, null, 1));
if (report.issues.numErrors) process.exit(1);
