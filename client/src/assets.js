// Runtime asset access: one manifest, one download and one decode per file,
// however many entities use it.
//
// A bundle is a GLB holding several named pieces that share textures and
// materials. Loading is promise-cached, so concurrent requests for the same
// bundle join the same download. Instances share the bundle's immutable
// geometry, materials and textures; only what must differ per entity (the
// skeleton, and materials an entity recolours) is created per instance.

import * as THREE from '/vendor/three/three.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = '/client/assets/';

export class Assets {
  constructor() {
    this.manifest = null;
    this.bundles = new Map(); // id -> Promise<bundle|null>
    this.ready = new Map(); // id -> bundle (resolved)
    this.textures = new Map(); // id -> THREE.Texture
    this.failed = new Map(); // id -> message
    this.stats = { requests: 0, bytes: 0, loadMs: 0 };
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.textureLoader = new THREE.TextureLoader();
    this.maxAnisotropy = 4;
    this.pendingTextures = [];
  }

  /** Resolves once every texture requested so far has loaded or failed. */
  texturesReady() {
    return Promise.all(this.pendingTextures);
  }

  async init() {
    try {
      const res = await fetch(`${BASE}manifest.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.manifest = await res.json();
    } catch (err) {
      // No manifest means no built assets: every model falls back to its
      // procedural stand-in and the game stays playable.
      this.manifest = { assets: {} };
      this.failed.set('manifest', String(err.message || err));
      console.warn('[assets] manifest unavailable, using procedural models:', err.message || err);
    }
    return this;
  }

  entry(id) {
    return (this.manifest && this.manifest.assets[id]) || null;
  }

  url(id) {
    const e = this.entry(id);
    return e ? `${BASE}${e.url}?v=${e.hash}` : null;
  }

  /** Load a bundle once. Resolves to null (never rejects) if it cannot be loaded. */
  bundle(id) {
    let p = this.bundles.get(id);
    if (!p) {
      p = this.loadBundle(id);
      this.bundles.set(id, p);
    }
    return p;
  }

  async loadBundle(id) {
    const entry = this.entry(id);
    if (!entry) {
      this.failed.set(id, 'not in manifest');
      return null;
    }
    const t0 = performance.now();
    try {
      const gltf = await this.loader.loadAsync(this.url(id));
      const bundle = { id, entry, scene: gltf.scene, pieces: new Map(), clips: new Map() };
      if (entry.kind === 'kit') {
        for (const child of gltf.scene.children) bundle.pieces.set(child.name, child);
        for (const clip of gltf.animations) {
          const [piece, name] = clip.name.split('|');
          if (!bundle.clips.has(piece)) bundle.clips.set(piece, new Map());
          clip.name = name;
          bundle.clips.get(piece).set(name, clip);
        }
      } else {
        bundle.pieces.set('', gltf.scene);
        bundle.clips.set('', new Map(gltf.animations.map((c) => [c.name, c])));
      }
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.userData.shared = true; // owned by the bundle, never by an entity
        o.castShadow = true;
        o.receiveShadow = !o.isSkinnedMesh;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          m.isShared = true; // never disposed with an entity
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) if (m[key]) m[key].anisotropy = this.maxAnisotropy;
        }
      });
      this.stats.requests++;
      this.stats.bytes += entry.bytes;
      this.stats.loadMs += performance.now() - t0;
      this.ready.set(id, bundle);
      return bundle;
    } catch (err) {
      this.failed.set(id, String(err.message || err));
      console.warn(`[assets] ${id} failed to load:`, err.message || err);
      return null;
    }
  }

  /** A bundle that has finished loading, or null. Never starts a download. */
  get(id) {
    return this.ready.get(id) || null;
  }

  /**
   * A new instance of a piece. Skinned pieces get their own skeleton; geometry,
   * materials and textures stay shared with every other instance.
   */
  instance(bundleId, piece = '') {
    const bundle = this.ready.get(bundleId);
    const src = bundle && bundle.pieces.get(piece);
    if (!src) return null;
    const meta = bundle.entry.pieces ? bundle.entry.pieces[piece] : null;
    const skinned = bundle.entry.kind === 'humanoid' || (meta && meta.skinned);
    const obj = skinned ? cloneSkinned(src) : src.clone(true);
    if (skinned) shareSkeletons(src, obj);
    obj.position.set(0, 0, 0);
    return obj;
  }

  clips(bundleId, piece = '') {
    const bundle = this.ready.get(bundleId);
    return (bundle && bundle.clips.get(piece)) || new Map();
  }

  pieceMeta(bundleId, piece) {
    const e = this.entry(bundleId);
    return (e && e.pieces && e.pieces[piece]) || null;
  }

  /** A standalone texture from the manifest (cached). Returns null if unknown. */
  texture(id, { repeat = 1, srgb = true } = {}) {
    const key = `${id}|${repeat}|${srgb}`;
    let tex = this.textures.get(key);
    if (tex) return tex;
    const url = this.url(id);
    if (!url) return null;
    let settle;
    this.pendingTextures.push(new Promise((resolve) => (settle = resolve)));
    tex = this.textureLoader.load(url, settle, undefined, () => {
      this.failed.set(id, 'texture failed to load');
      settle();
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    tex.flipY = false;
    this.textures.set(key, tex);
    this.stats.requests++;
    this.stats.bytes += this.entry(id).bytes;
    return tex;
  }

  /** Load several bundles, reporting progress as each settles. */
  async preload(ids, onProgress) {
    let done = 0;
    await Promise.all(
      ids.map((id) =>
        this.bundle(id).then(() => {
          done++;
          if (onProgress) onProgress(done, ids.length);
        })
      )
    );
  }

  report() {
    return {
      loaded: [...this.ready.keys()],
      failed: Object.fromEntries(this.failed),
      requests: this.stats.requests,
      kilobytes: Math.round(this.stats.bytes / 1024),
      loadMs: Math.round(this.stats.loadMs),
    };
  }
}

/**
 * SkeletonUtils.clone gives every skinned mesh its own Skeleton, even where
 * the source meshes shared one. A dressed humanoid is about ten meshes on one
 * rig, so that would compute and upload the same bone matrices ten times a
 * frame. Re-point the clones at one skeleton per source skeleton.
 */
function shareSkeletons(source, clone) {
  const src = [];
  const dst = [];
  source.traverse((o) => o.isSkinnedMesh && src.push(o));
  clone.traverse((o) => o.isSkinnedMesh && dst.push(o));
  const shared = new Map();
  for (let i = 0; i < dst.length; i++) {
    const key = src[i].skeleton;
    const first = shared.get(key);
    if (!first) {
      shared.set(key, dst[i].skeleton);
      continue;
    }
    dst[i].skeleton.dispose();
    dst[i].bind(first, dst[i].bindMatrix);
  }
}

/** Mark a geometry or material as shared between entities (never disposed with one). */
export function shared(resource) {
  if (resource.isBufferGeometry) resource.userData.shared = true;
  else resource.isShared = true;
  return resource;
}

/**
 * Dispose what an entity owns and nothing else. Ownership rule: a geometry or
 * material belongs to the entity unless it is flagged shared — bundle
 * resources are flagged on load, module-level ones with shared(). Textures are
 * always shared (cached by Assets) and are never disposed here.
 */
export function disposeInstance(root) {
  const skeletons = new Set();
  const geometries = new Set();
  const materials = new Set();
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) skeletons.add(o.skeleton);
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    if (o.geometry && !o.geometry.userData.shared) geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && !m.isShared) materials.add(m);
  });
  for (const s of skeletons) s.dispose();
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}

/**
 * Give an instance its own copies of its materials (textures stay shared) so
 * it can be tinted, flashed or faded without affecting other instances.
 * Returns the unique materials created.
 */
export function cloneMaterials(root) {
  const made = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => {
      let c = made.get(m);
      if (!c) {
        c = m.clone();
        c.isShared = false;
        made.set(m, c);
      }
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  return [...made.values()];
}
