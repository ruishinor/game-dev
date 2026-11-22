// Build a single playable model from the owner-approved source archive.
// Source ZIP remains outside client mounts; only a trimmed model is served.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DEPTHS_ARCHIVE = path.join(ROOT, 'assets/source-archives/glb-low-poly-models-building-blocks.zip');
export const DEPTHS_MEMBER = 'glb-low-poly-models-building-blocks/model - FPS Survival Forest Outpost.glb';
export const DEPTHS_NODE = '059-loot-cache-legendary';
export const DEPTHS_OUTPUT = path.join(ROOT, '.asset-cache', 'depths-recovery-cache.glb');
const SOURCE_SHA256 = 'a2e60f2a220ebf427f6211805d0a4aa11504205af91a62e2065ab18474977e43';
const HASH = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const pad4 = n => (n + 3) & ~3;

export function readZipMember(zip, filename) {
  const endStart = Math.max(0, zip.length - 65557);
  let eocd = -1;
  for (let i = zip.length - 22; i >= endStart; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50 && i + 22 + zip.readUInt16LE(i + 20) === zip.length) { eocd = i; break; }
  }
  if (eocd < 0 || zip.readUInt16LE(eocd + 4) || zip.readUInt16LE(eocd + 6)) throw new Error('Invalid or multi-disk source ZIP');
  const count = zip.readUInt16LE(eocd + 10);
  let pos = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (pos + 46 > zip.length || zip.readUInt32LE(pos) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const method = zip.readUInt16LE(pos + 10);
    const bytes = zip.readUInt32LE(pos + 20), size = zip.readUInt32LE(pos + 24);
    const nameLen = zip.readUInt16LE(pos + 28), extraLen = zip.readUInt16LE(pos + 30), commentLen = zip.readUInt16LE(pos + 32);
    const name = zip.toString('utf8', pos + 46, pos + 46 + nameLen);
    if (name === filename) {
      if (size > 32 * 1024 * 1024 || bytes > zip.length) throw new Error('Source model exceeds size limit');
      const local = zip.readUInt32LE(pos + 42);
      if (local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid ZIP member header');
      const offset = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      if (offset + bytes > zip.length) throw new Error('Truncated ZIP member');
      const compressed = zip.subarray(offset, offset + bytes);
      const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 32 * 1024 * 1024 }) : null;
      if (!data || data.length !== size) throw new Error('Unsupported ZIP compression or corrupt source model');
      return data;
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`Missing source model: ${filename}`);
}

export function isolateDepthsCacheGLB(raw) {
  if (raw.length < 28 || raw.toString('ascii', 0, 4) !== 'glTF' || raw.readUInt32LE(4) !== 2 || raw.readUInt32LE(8) !== raw.length) throw new Error('Invalid source GLB');
  const jsonLen = raw.readUInt32LE(12);
  if (raw.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLen + 8 > raw.length) throw new Error('Missing GLB JSON');
  const src = JSON.parse(raw.toString('utf8', 20, 20 + jsonLen));
  const at = 20 + jsonLen;
  const binLen = raw.readUInt32LE(at);
  if (raw.readUInt32LE(at + 4) !== 0x004e4942 || at + 8 + binLen > raw.length) throw new Error('Missing GLB BIN');
  const inputBin = raw.subarray(at + 8, at + 8 + binLen);
  const root = src.nodes.findIndex(n => n.name === DEPTHS_NODE);
  if (root < 0) throw new Error('Source cache node not found');

  const dst = { asset: { version: '2.0', generator: 'Attunement Depths cache source selector' }, scenes: [{ nodes: [0] }], scene: 0,
    nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [], materials: [] };
  const mapping = { node: new Map(), mesh: new Map(), accessor: new Map(), view: new Map(), material: new Map() };
  const chunks = []; let length = 0;
  const copyView = (id) => {
    if (mapping.view.has(id)) return mapping.view.get(id);
    const v = src.bufferViews[id];
    if (!v || v.buffer !== 0 || (v.byteOffset ?? 0) + v.byteLength > inputBin.length) throw new Error('Invalid cache buffer view');
    const next = dst.bufferViews.length;
    mapping.view.set(id, next);
    const chunk = inputBin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    dst.bufferViews.push({ ...v, buffer: 0, byteOffset: length });
    chunks.push(chunk); length += pad4(chunk.length);
    return next;
  };
  const copyAccessor = (id) => {
    if (mapping.accessor.has(id)) return mapping.accessor.get(id);
    const a = src.accessors[id];
    if (!a || a.sparse) throw new Error('Unsupported source accessor');
    const next = dst.accessors.length;
    mapping.accessor.set(id, next);
    const view = src.bufferViews[a.bufferView];
    if (!view.byteStride) {
      // Source pack shares a huge index buffer; only copy the relevant slice.
      const elementBytes = { 5120:1, 5121:1, 5122:2, 5123:2, 5125:4, 5126:4 }[a.componentType];
      const comps = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT2:4, MAT3:9, MAT4:16 }[a.type];
      if (!elementBytes || !comps) throw new Error('Unsupported source accessor type');
      const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
      const size = a.count * elementBytes * comps;
      if (start + size > (view.byteOffset ?? 0) + view.byteLength) throw new Error('Invalid packed source accessor');
      const idx = dst.bufferViews.length;
      dst.bufferViews.push({ buffer:0, byteOffset:length, byteLength:size, ...(view.target ? { target:view.target } : {}) });
      const bytes = inputBin.subarray(start, start + size);
      chunks.push(bytes); length += pad4(size);
      dst.accessors.push({ ...a, bufferView: idx, byteOffset:0 });
    } else {
      dst.accessors.push({ ...a, bufferView: copyView(a.bufferView) });
    }
    return next;
  };
  const copyMaterial = (id) => {
    if (mapping.material.has(id)) return mapping.material.get(id);
    const m = src.materials[id];
    if (!m || Object.values(m.pbrMetallicRoughness || {}).some(x => x && typeof x === 'object' && 'index' in x)) throw new Error('Unexpected source texture: review source selector');
    const next = dst.materials.length;
    mapping.material.set(id, next);
    dst.materials.push(structuredClone(m));
    return next;
  };
  const copyMesh = (id) => {
    if (mapping.mesh.has(id)) return mapping.mesh.get(id);
    const next = dst.meshes.length;
    mapping.mesh.set(id, next);
    const m = structuredClone(src.meshes[id]);
    for (const p of m.primitives) {
      p.attributes = Object.fromEntries(Object.entries(p.attributes).map(([key, i]) => [key, copyAccessor(i)]));
      if (p.indices !== undefined) p.indices = copyAccessor(p.indices);
      if (p.material !== undefined) p.material = copyMaterial(p.material);
      if (p.targets?.length) throw new Error('Unexpected animated morph target');
    }
    dst.meshes.push(m);
    return next;
  };
  const copyNode = (id) => {
    if (mapping.node.has(id)) return mapping.node.get(id);
    const next = dst.nodes.length;
    mapping.node.set(id, next);
    const n = structuredClone(src.nodes[id]);
    dst.nodes.push(n);
    if (n.mesh !== undefined) n.mesh = copyMesh(n.mesh);
    if (n.children) n.children = n.children.map(copyNode);
    if (id === root) {
      n.translation = [0, 0, 0]; // remove pack-layout translation only
      delete n.rotation;
    }
    return next;
  };
  copyNode(root);
  dst.buffers = [{ byteLength: length }];
  if (src.extensionsRequired?.includes('KHR_mesh_quantization')) dst.extensionsRequired = ['KHR_mesh_quantization'];
  if (src.extensionsUsed?.includes('KHR_mesh_quantization')) dst.extensionsUsed = ['KHR_mesh_quantization'];
  const json = Buffer.from(JSON.stringify(dst));
  const jsonPad = Buffer.alloc(pad4(json.length) - json.length, 0x20);
  const bin = Buffer.alloc(length);
  let cursor = 0;
  for (const c of chunks) { c.copy(bin, cursor); cursor += pad4(c.length); }
  const out = Buffer.alloc(12 + 8 + pad4(json.length) + 8 + bin.length);
  out.write('glTF', 0, 4, 'ascii'); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(pad4(json.length), 12); out.writeUInt32LE(0x4e4f534a, 16); json.copy(out, 20); jsonPad.copy(out, 20 + json.length);
  const off = 20 + pad4(json.length); out.writeUInt32LE(bin.length, off); out.writeUInt32LE(0x004e4942, off + 4); bin.copy(out, off + 8);
  return out;
}

/** Only called on the exact cache GLB request; source archive is never web-mounted. */
export function ensureDepthsCacheGLB() {
  if (fs.existsSync(DEPTHS_OUTPUT) && fs.statSync(DEPTHS_OUTPUT).mtimeMs >= fs.statSync(DEPTHS_ARCHIVE).mtimeMs) return DEPTHS_OUTPUT;
  const archive = fs.readFileSync(DEPTHS_ARCHIVE);
  if (HASH(archive) !== SOURCE_SHA256) throw new Error('Owner source archive SHA-256 changed; refusing unreviewed model');
  const selected = isolateDepthsCacheGLB(readZipMember(archive, DEPTHS_MEMBER));
  fs.mkdirSync(path.dirname(DEPTHS_OUTPUT), { recursive: true });
  const temp = DEPTHS_OUTPUT + '.tmp';
  fs.writeFileSync(temp, selected); fs.renameSync(temp, DEPTHS_OUTPUT);
  return DEPTHS_OUTPUT;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = ensureDepthsCacheGLB();
  console.log(`Depths cache source extracted: ${out} (${fs.statSync(out).size} bytes)`);
}
