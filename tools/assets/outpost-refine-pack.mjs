// Bounded material-and-geometry preparation of owner-authorized range/weapon
// donor GLBs. Source models are never treated as finished production art.
// Use: node tools/assets/outpost-refine-pack.mjs outpost-source-candidates.json
// Delivers independently inspectable GLBs, validator reports and source hashes.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import validator from 'gltf-validator';
import { readGltf, writeGlb } from './lib/gltf.mjs';

const args = process.argv.slice(2);
const manifest = path.resolve(args[0] || 'outpost-source-candidates.json');
const outputDir = path.resolve(args[1] || 'tools/asset-pipeline/.asset-cache/pipeline/outpost-training-refined');
const LIMIT_MODELS = 12, LIMIT_INPUT_BYTES = 64 * 1024 * 1024;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const hash32 = (x, y) => {
  let v = Math.imul(x + 113, 374761393) ^ Math.imul(y + 73, 668265263);
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  return (v ^ (v >>> 16)) >>> 0;
};
export function materialFinish(name, rgba = [1, 1, 1, 1]) {
  const n = String(name || '').toLowerCase();
  const brightness = .2126 * rgba[0] + .7152 * rgba[1] + .0722 * rgba[2];
  if (/optic|display|glass|power|lamp|led|emissive|glow|screen|signal/.test(n))
    return { family: 'instrument', color: [.19, .60, .61, 1], metallic: .23, roughness: .3, emissive: [.012, .13, .12] };
  if (/grip|rubber|joint|seal|polymer|fabric|tire|wheel/.test(n))
    return { family: 'ebony-polymer', color: [.075, .091, .096, 1], metallic: .06, roughness: .77, emissive: [0, 0, 0] };
  if (/bolt|screw|barrel|casing|metal|brass|gold|copper|bronze|rail|frame|inner/.test(n))
    return { family: 'aged-bronze', color: [.53, .37, .21, 1], metallic: .77, roughness: .48, emissive: [0, 0, 0] };
  if (/stone|rock|wall|concrete|ceramic|shell|panel|cover|plate/.test(n) || brightness >= .42)
    return { family: 'warm-ceramic', color: [.72, .69, .61, 1], metallic: .14, roughness: .68, emissive: [0, 0, 0] };
  return { family: 'weathered-bronze', color: [.36, .27, .19, 1], metallic: .62, roughness: .61, emissive: [0, 0, 0] };
}

// Stage *relevant* source candidates before smaller but unrelated archive
// objects. This is only a source-triage order, not proof of visual acceptance.
export function outpostDonorPriority(entry) {
  const name = path.basename(String(entry?.path || '')).toLowerCase();
  const triangles = Math.max(0, Number(entry?.triangles) || 0);
  let suitability = 0;
  if (/longpoint/.test(name)) suitability = 120;
  else if (/shooting range|firing range|range board|target practice/.test(name)) suitability = 115;
  else if (/\b(guns|rifles|carbines|pistols|blasters)\b/.test(name)) suitability = 105;
  else if (/fortified compound|survival base|field camp|outpost|antenna|salvage and repair/.test(name)) suitability = 80;
  else if (/fence|gate|barricade|sandbag|barrier/.test(name)) suitability = 70;
  else if (/armory|armoury|weapon pack|workshop|storage/.test(name)) suitability = 60;
  else if (/zombie|rune|food|fantasy|tavern/.test(name)) suitability = -60;
  // Don't spend the limited Blender run on enormous mixed scene kits first.
  return suitability - Math.min(40, triangles / 5000);
}
export function rankOutpostDonors(findings) {
  return [...findings].sort((a, b) =>
    outpostDonorPriority(b) - outpostDonorPriority(a) ||
    a.bytes - b.bytes ||
    String(a.path).localeCompare(String(b.path)));
}

async function microMaps() {
  const size = 256;
  const orm = Buffer.alloc(size * size * 3), normal = Buffer.alloc(orm.length);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const h = hash32(x, y), broad = hash32(x >>> 3, y >>> 3);
    const grain = (h & 1023) / 1023, patina = (broad & 1023) / 1023;
    const scratch = (x % 37 === 0 || y % 67 === 0) && grain > .48;
    const i = (y * size + x) * 3;
    orm[i] = 255;
    orm[i + 1] = clamp(Math.round(161 + patina * 42 + grain * 25 + (scratch ? 21 : 0)), 60, 254);
    orm[i + 2] = 255;
    heights[y * size + x] = patina * .17 + grain * .035 + (scratch ? -.04 : 0);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (u, v) => heights[((v + size) % size) * size + ((u + size) % size)];
    const dx = (at(x + 1, y) - at(x - 1, y)) * .8;
    const dy = (at(x, y + 1) - at(x, y - 1)) * .8;
    const len = Math.hypot(dx, dy, 1), i = (y * size + x) * 3;
    normal[i] = Math.round(127.5 * (1 - dx / len));
    normal[i + 1] = Math.round(127.5 * (1 - dy / len));
    normal[i + 2] = Math.round(127.5 * (1 + 1 / len));
  }
  const toPng = bytes => sharp(bytes, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
  return Promise.all([toPng(orm), toPng(normal)]);
}

function ensureUvAndNormals(doc) {
  const buffer = doc.getRoot().listBuffers()[0] || doc.createBuffer();
  let generatedUV = 0, generatedNormals = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const positions = pos.getArray(), count = pos.getCount();
    if (!prim.getAttribute('TEXCOORD_0') && count) {
      const uv = new Float32Array(count * 2);
      // Reconstruct a stable planar UV for missing source texture coordinates.
      // It is not a manual UV unwrap; generated microdetail stays deliberately
      // low-contrast to avoid hiding seams and geometry deficiencies.
      let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < count; i++) {
        const p = pos.getElement(i, []);
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
      }
      const sizes = max.map((v, k) => v - min[k]);
      const omit = sizes.indexOf(Math.min(...sizes));
      const axes = [0, 1, 2].filter(k => k !== omit);
      for (let i = 0; i < count; i++) {
        const v = pos.getElement(i, []);
        uv[i * 2] = v[axes[0]] * 2.8;
        uv[i * 2 + 1] = v[axes[1]] * 2.8;
      }
      const accessor = doc.createAccessor('Source UV projection').setType('VEC2').setArray(uv).setBuffer(buffer);
      prim.setAttribute('TEXCOORD_0', accessor);
      generatedUV++;
    }
    // For source primitives missing vertex normals, reconstruct smooth
    // area-weighted vertex normals from original triangle indices.
    if (!prim.getAttribute('NORMAL') && (prim.getMode() ?? 4) === 4) {
      const normals = new Float32Array(count * 3);
      const indices = prim.getIndices()?.getArray();
      const length = indices ? indices.length : count;
      const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
      for (let i = 0; i + 2 < length; i += 3) {
        const ids = indices ? [indices[i], indices[i + 1], indices[i + 2]] : [i, i + 1, i + 2];
        if (ids.some(id => id >= count)) continue;
        [a, b, c].forEach((v, k) => { const p = pos.getElement(ids[k], []); v[0] = p[0]; v[1] = p[1]; v[2] = p[2]; });
        const ab = b.map((v, k) => v - a[k]), ac = c.map((v, k) => v - a[k]);
        const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        for (const id of ids) for (let k = 0; k < 3; k++) normals[id * 3 + k] += n[k];
      }
      for (let i = 0; i < count; i++) {
        const j = i * 3, len = Math.hypot(normals[j], normals[j + 1], normals[j + 2]) || 1;
        for (let k = 0; k < 3; k++) normals[j + k] /= len;
      }
      prim.setAttribute('NORMAL', doc.createAccessor('Reconstructed normals').setType('VEC3').setArray(normals).setBuffer(buffer));
      generatedNormals++;
    }
  }
  return { generatedUV, generatedNormals };
}

export async function refineDonor(file, outFile, meta, mapBytes) {
  const doc = await readGltf(file);
  const root = doc.getRoot();
  const geometry = ensureUvAndNormals(doc);
  const [orm, normal] = mapBytes;
  const roughnessTex = doc.createTexture('aged finish / micro roughness').setMimeType('image/png').setImage(new Uint8Array(orm));
  const normalTex = doc.createTexture('subtle fine surface normals').setMimeType('image/png').setImage(new Uint8Array(normal));
  let materials = root.listMaterials();
  if (!materials.length) {
    const mat = doc.createMaterial('reconstructed-ceramic');
    for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) if (!p.getMaterial()) p.setMaterial(mat);
    materials = root.listMaterials();
  }
  const families = {};
  for (const mat of materials) {
    const existing = mat.getBaseColorFactor();
    const finish = materialFinish(mat.getName(), existing);
    // Keep original texture identity if present. Replacing texture art without
    // visual comparison would be a destructive model conversion.
    if (!mat.getBaseColorTexture()) mat.setBaseColorFactor(finish.color);
    mat.setMetallicFactor(finish.metallic).setRoughnessFactor(finish.roughness);
    if (!mat.getMetallicRoughnessTexture()) mat.setMetallicRoughnessTexture(roughnessTex);
    if (!mat.getNormalTexture()) mat.setNormalTexture(normalTex).setNormalScale(.27);
    if (!mat.getEmissiveTexture() && finish.family === 'instrument') mat.setEmissiveFactor(finish.emissive);
    families[finish.family] = (families[finish.family] || 0) + 1;
  }
  await writeGlb(doc, outFile);
  const bytes = fs.readFileSync(outFile);
  const report = await validator.validateBytes(new Uint8Array(bytes), { maxIssues: 20 });
  if (report.issues.numErrors) {
    fs.unlinkSync(outFile);
    throw Error('Reconstructed GLB validation failure: ' + report.issues.messages.filter(m => m.severity === 0).map(m => m.code).join(', '));
  }
  return {
    source: meta.path, sourceSha256: meta.sha256,
    refinedPath: outFile, refinedBytes: bytes.length,
    refinedSha256: createHash('sha256').update(bytes).digest('hex'),
    trianglesBefore: meta.triangles,
    ...geometry, materialFamilies: families,
    validator: { errors: report.issues.numErrors, warnings: report.issues.numWarnings },
    status: 'engineered donor candidate - pending in-game visual, collision, animation and performance acceptance',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const incoming = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (!incoming.staged || !Array.isArray(incoming.findings)) throw Error('Run source archive staging before refinement');
  fs.mkdirSync(outputDir, { recursive: true });
  const ordered = rankOutpostDonors(incoming.findings);
  const selected = [], deferred = [];
  let bytes = 0;
  for (const entry of ordered) {
    if (selected.length >= LIMIT_MODELS || bytes + entry.bytes > LIMIT_INPUT_BYTES) { deferred.push(entry.path); continue; }
    const source = fs.readFileSync(entry.staged);
    if (createHash('sha256').update(source).digest('hex') !== entry.sha256) throw Error('Staged donor hash mismatch: ' + entry.path);
    selected.push(entry); bytes += entry.bytes;
  }
  const textures = await microMaps();
  const built = [], failures = [];
  for (const [i, entry] of selected.entries()) {
    const filename = String(i).padStart(2, '0') + '-' + path.basename(entry.path).replace(/[^a-zA-Z0-9._-]/g, '_');
    const outFile = path.join(outputDir, filename);
    try { built.push(await refineDonor(entry.staged, outFile, entry, textures)); }
    catch (e) { failures.push({ source: entry.path, error: String(e?.message || e) }); }
  }
  const result = {
    sourceArchiveSha256: incoming.sha256, inputModels: incoming.findings.length,
    candidatesRefined: built.length, deferred, failures, built,
    note: 'No blanket origin or licence gate; inspect resulting geometry and captured in-game quality before production publication',
  };
  fs.writeFileSync(path.join(outputDir, 'refinement-report.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ refined: built.length, deferred: deferred.length, failures, report: path.join(outputDir, 'refinement-report.json') }));
  if (failures.length || !built.length) process.exitCode = 1;
}
