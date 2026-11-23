// glTF helpers shared by the asset build: reading source files whose
// textures live in a sibling folder, merging many source files into one
// bundle that shares textures and materials, and writing compressed GLBs.

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, unpartition, dedup, prune, getBounds, textureCompress, meshopt, resample, simplify, weld, compactPrimitive, weldPrimitive, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);

export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

/**
 * Read a .glb or .gltf. For .gltf, external buffers and images are looked up
 * beside the file first and then in `extraDirs` (kits keep shared textures in
 * a separate folder).
 */
export async function readGltf(file, extraDirs = []) {
  if (file.toLowerCase().endsWith('.glb')) return io.read(file);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dirs = [path.dirname(file), ...extraDirs];
  const resources = {};
  for (const ref of [...(json.buffers || []), ...(json.images || [])]) {
    if (!ref.uri || ref.uri.startsWith('data:')) continue;
    const name = decodeURIComponent(ref.uri);
    const found = dirs.map((d) => path.join(d, name)).find((p) => fs.existsSync(p));
    if (!found) throw new Error(`${path.basename(file)}: missing resource ${name}`);
    resources[ref.uri] = new Uint8Array(fs.readFileSync(found));
  }
  return io.readJSON({ json, resources });
}

export function triangleCount(node) {
  let tris = 0;
  node.traverse((n) => {
    const mesh = n.getMesh();
    if (!mesh) return;
    for (const p of mesh.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
  });
  return Math.round(tris);
}

const round = (v) => Math.round(v * 1000) / 1000;

/**
 * Merge source files into one document. Each piece becomes a named top-level
 * node, so the runtime can pull pieces out by name while every piece shares
 * one copy of the kit's textures and materials.
 * @returns {{doc: Document, pieces: object}} piece metadata for the manifest
 */
export async function mergePieces(pieces, resolve) {
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene('bundle');
  doc.getRoot().setDefaultScene(scene);
  const meta = {};
  for (const piece of pieces) {
    const src = await readGltf(resolve(piece.src), (piece.textureDirs || []).map((d) => resolve([piece.src[0], d])));
    const srcRoot = src.getRoot();
    if (piece.isolate) isolateTallest(src);
    if (piece.simplify) await src.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: piece.simplify, error: piece.simplifyError ?? 0.01 }));
    const clips = [];
    for (const anim of srcRoot.listAnimations()) {
      if (piece.clips && !piece.clips.includes(anim.getName())) {
        for (const ch of anim.listChannels()) ch.dispose();
        for (const s of anim.listSamplers()) s.dispose();
        anim.dispose();
        continue;
      }
      clips.push(anim.getName());
      // Clip names repeat across creatures ("Idle", "Attack"); prefix them.
      anim.setName(`${piece.name}|${anim.getName()}`);
    }
    const srcScene = srcRoot.getDefaultScene() || srcRoot.listScenes()[0];
    const map = mergeDocuments(doc, src);
    const merged = map.get(srcScene);
    const holder = doc.createNode(piece.name);
    for (const child of merged.listChildren()) holder.addChild(child);
    merged.dispose();
    scene.addChild(holder);
    const b = getBounds(holder);
    meta[piece.name] = {
      min: b.min.map(round),
      max: b.max.map(round),
      tris: triangleCount(holder),
      ...(clips.length ? { clips } : {}),
      ...(holder.listChildren().some((c) => c.listChildren().some((k) => k.getSkin())) || hasSkin(holder) ? { skinned: true } : {}),
    };
  }
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
  await doc.transform(unpartition());
  return { doc, pieces: meta };
}

/**
 * Keep only the tallest connected part of a single-mesh model and stand it on
 * the origin — e.g. one mushroom out of a cluster, so it can be used alone.
 */
function isolateTallest(doc) {
  const node = doc.getRoot().listNodes().find((n) => n.getMesh());
  const prims = node.getMesh().listPrimitives();
  // Union vertices that share a position (UV seams split them in the buffers).
  const parent = [];
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const ids = new Map();
  const info = [];
  let base = 0;
  for (const prim of prims) {
    const P = prim.getAttribute('POSITION');
    const local = [];
    for (let i = 0; i < P.getCount(); i++) {
      const p = P.getElement(i, []);
      const key = p.map((v) => v.toFixed(4)).join(',');
      let id = ids.get(key);
      if (id === undefined) {
        id = parent.length;
        parent.push(id);
        ids.set(key, id);
        info.push(p);
      }
      local.push(id);
    }
    const idx = prim.getIndices();
    for (let i = 0; i < idx.getCount(); i += 3) {
      const a = find(local[idx.getScalar(i)]);
      parent[find(local[idx.getScalar(i + 1)])] = a;
      parent[find(local[idx.getScalar(i + 2)])] = a;
    }
    prim.setExtras({ local, base });
    base += P.getCount();
  }
  const box = new Map();
  info.forEach((p, id) => {
    const r = find(id);
    const b = box.get(r) || { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let k = 0; k < 3; k++) {
      b.min[k] = Math.min(b.min[k], p[k]);
      b.max[k] = Math.max(b.max[k], p[k]);
    }
    box.set(r, b);
  });
  const [stem, b] = [...box].sort((x, y) => y[1].max[1] - y[1].min[1] - (x[1].max[1] - x[1].min[1]))[0];
  // A cap is modelled separately from its stem: also keep whatever sits on the
  // stem's top.
  const top = [0, 0, 0, 0];
  info.forEach((p, id) => {
    if (find(id) === stem && p[1] > b.max[1] - 0.02) {
      top[0] += p[0];
      top[2] += p[2];
      top[3]++;
    }
  });
  const tx = top[0] / top[3];
  const tz = top[2] / top[3];
  const keep = new Set([stem]);
  for (const [r, c] of box) {
    if (tx > c.min[0] - 0.01 && tx < c.max[0] + 0.01 && tz > c.min[2] - 0.01 && tz < c.max[2] + 0.01 && c.min[1] < b.max[1] + 0.03 && c.max[1] > b.max[1] - 0.06) keep.add(r);
  }
  for (const r of keep) {
    for (let k = 0; k < 3; k += 2) {
      b.min[k] = Math.min(b.min[k], box.get(r).min[k]);
      b.max[k] = Math.max(b.max[k], box.get(r).max[k]);
    }
  }
  for (const prim of prims) {
    const { local } = prim.getExtras();
    const idx = prim.getIndices();
    const out = [];
    for (let i = 0; i < idx.getCount(); i += 3) if (keep.has(find(local[idx.getScalar(i)]))) out.push(idx.getScalar(i), idx.getScalar(i + 1), idx.getScalar(i + 2));
    idx.setArray(new Uint32Array(out));
    prim.setExtras({});
    compactPrimitive(prim);
  }
  // Stand it on the origin, centred under the stem's top.
  const t = node.getTranslation();
  node.setTranslation([t[0] - tx, t[1] - b.min[1], t[2] - tz]);
}

function hasSkin(node) {
  let found = false;
  node.traverse((n) => {
    if (n.getSkin()) found = true;
  });
  return found;
}

/** Rotate the hue of matching base-colour textures (e.g. red kit accents to teal). */
export function hueShift(match, degrees) {
  return async (doc) => {
    for (const tex of doc.getRoot().listTextures()) {
      const name = tex.getURI() || tex.getName();
      if (!match.test(name)) continue;
      const out = await sharp(tex.getImage()).modulate({ hue: degrees }).png().toBuffer();
      tex.setImage(new Uint8Array(out)).setMimeType('image/png');
    }
  };
}

/** Use a kit's separate emissive mask as the emissive map of a material. */
export function attachEmissive(materialName, file, factor) {
  return (doc) => {
    const mat = doc.getRoot().listMaterials().find((m) => m.getName() === materialName);
    if (!mat) return;
    const tex = doc.createTexture(path.basename(file, path.extname(file))).setImage(new Uint8Array(fs.readFileSync(file))).setMimeType('image/png').setURI(path.basename(file));
    mat.setEmissiveTexture(tex).setEmissiveFactor(factor);
  };
}

/**
 * Standard optimisation chain for every bundle: merge duplicate textures and
 * materials, drop unused data, downscale textures to WebP and compress
 * geometry and animation with Meshopt.
 */
/**
 * Simplify selected primitives in place. rules: [{ node: RegExp, material?: RegExp, ratio, error?, lockBorder? }].
 * Used for surfaces that are mostly hidden (suits under shells, feet in boots,
 * clothing shells) so detail stays where it is seen.
 */
export async function simplifySelected(doc, rules) {
  await MeshoptSimplifier.ready;
  let before = 0, after = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      const rule = rules.find((r) => r.node.test(node.getName()) && (!r.material || r.material.test(prim.getMaterial()?.getName() || '')));
      if (!rule || prim.listTargets().length) continue;
      before += prim.getIndices().getCount() / 3;
      weldPrimitive(prim);
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: rule.ratio, error: rule.error ?? 0.004, lockBorder: !!rule.lockBorder });
      after += prim.getIndices().getCount() / 3;
    }
  }
  return { before, after };
}

export async function optimise(doc, { maxTexture = 1024, simplifyRatio = 0, textureQuality = 82, keepAttributes = false, quantizationVolume = 'mesh' } = {}) {
  const steps = [dedup(), prune({ keepAttributes, keepLeaves: true })];
  if (simplifyRatio) steps.push(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: simplifyRatio, error: 0.002 }));
  steps.push(
    resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTexture, maxTexture], slots: /normal/i, quality: 90, effort: 5 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTexture, maxTexture], slots: /^(?!.*normal)/i, quality: textureQuality, effort: 5 }),
    dedup(),
    prune({ keepAttributes, keepLeaves: true }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume })
  );
  await doc.transform(...steps);
  return doc;
}

export async function writeGlb(doc, file) {
  const bytes = await io.writeBinary(doc);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return bytes.byteLength;
}

/** Uncompressed size of the same document, for the build report. */
export async function rawSize(doc) {
  const plain = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  return (await plain.writeBinary(doc)).byteLength;
}
