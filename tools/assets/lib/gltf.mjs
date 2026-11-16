// glTF helpers shared by the asset build: reading source files whose
// textures live in a sibling folder, merging many source files into one
// bundle that shares textures and materials, and writing compressed GLBs.

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, unpartition, dedup, prune, getBounds, textureCompress, meshopt, resample, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

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
export async function optimise(doc, { maxTexture = 1024, simplifyRatio = 0, textureQuality = 82 } = {}) {
  const steps = [dedup(), prune({ keepAttributes: false, keepLeaves: true })];
  if (simplifyRatio) steps.push(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: simplifyRatio, error: 0.002 }));
  steps.push(
    resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTexture, maxTexture], slots: /normal/i, quality: 90, effort: 5 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTexture, maxTexture], slots: /^(?!.*normal)/i, quality: textureQuality, effort: 5 }),
    dedup(),
    prune({ keepAttributes: false, keepLeaves: true }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' })
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
