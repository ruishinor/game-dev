// Faces: skin, eyes, lashes and facial animation for the MakeHuman-based
// humanoid bodies (tools/assets/lib/mh-humanoid.mjs).
//
// Presentation only. Appearance is either chosen by a look (NPC presets) or
// derived deterministically from the entity's name, so every client draws the
// same person without any server data; nothing here feeds back into gameplay.

import * as THREE from '/vendor/three/three.module.js';

// --- palettes ----------------------------------------------------------------

// Multipliers over the neutral baked albedo (sRGB hex), light to deep.
export const SKIN_TONES = [0xfaf0ea, 0xf0dccf, 0xdcc0ab, 0xc4a086, 0xa98066, 0x8a644d, 0x6c4a39, 0x50362a, 0x3a271f];
export const HAIR_COLORS = [0x0d0a09, 0x1c1410, 0x2e1f16, 0x4a3020, 0x6b4a2e, 0x8a6a45, 0xa8885e, 0x7a2f19, 0x9a9690, 0xcac6c0];
export const EYE_COLORS = [0x3b2414, 0x5a3a1e, 0x6e5a2a, 0x4f6a3a, 0x3d6170, 0x5c7f9c, 0x6c7680, 0x2a1a10];
export const HAIR_STYLES = ['buzz', 'crop', 'swept', 'shaved'];

const ID_MORPHS = ['heritage_a', 'heritage_b', 'heritage_c', 'jaw_width', 'chin', 'cheekbones', 'cheek_volume', 'nose_width', 'nose_length', 'nose_hump', 'nose_bridge', 'lips_full', 'mouth_width', 'brow_ridge', 'eye_size', 'eye_tilt', 'eye_fold', 'head_width', 'face_fat', 'face_angular', 'ear_size'];

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h || 1;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/**
 * A complete, deterministic appearance. `preset` fields override the random
 * draw (NPC looks pin their face; players get variety from their name).
 */
export function appearanceFor(key, female, preset = {}) {
  const r = rng(hashString(String(key)));
  const pick = (a) => a[Math.floor(r() * a.length)];
  const signed = (k = 1) => (r() * 2 - 1) * k;
  // Heritage blend: three structural bases, normalised, so faces span a
  // continuum rather than a handful of types.
  const h = [r() ** 2, r() ** 2, r() ** 2];
  const hs = h[0] + h[1] + h[2] || 1;
  const tone = Math.floor(r() * SKIN_TONES.length);
  const morph = {
    heritage_a: (h[0] / hs) * 0.9,
    heritage_b: (h[1] / hs) * 0.9,
    heritage_c: (h[2] / hs) * 0.9,
    jaw_width: signed(female ? 0.5 : 0.8),
    chin: signed(0.8),
    cheekbones: signed(0.8),
    cheek_volume: signed(0.6),
    nose_width: signed(0.8),
    nose_length: signed(0.7),
    nose_hump: r() * 0.9 - 0.2,
    nose_bridge: signed(0.6),
    lips_full: signed(0.7),
    mouth_width: signed(0.6),
    brow_ridge: female ? signed(0.4) : r() * 0.9 - 0.1,
    eye_size: signed(0.5),
    eye_tilt: signed(0.6),
    eye_fold: signed(0.5),
    head_width: signed(0.6),
    face_fat: signed(0.5),
    face_angular: female ? signed(0.4) : r() * 0.8,
    ear_size: signed(0.6),
    age: Math.max(0, r() * 1.2 - 0.35),
  };
  const ap = {
    female,
    tone: SKIN_TONES[tone],
    hair: pick(HAIR_COLORS.slice(0, tone > 4 ? 4 : HAIR_COLORS.length - 2)),
    eye: pick(tone > 4 ? EYE_COLORS.slice(0, 3).concat([EYE_COLORS[7]]) : EYE_COLORS),
    hairStyle: pick(female ? ['crop', 'swept', 'buzz'] : HAIR_STYLES),
    brow: female ? 0.55 + r() * 0.3 : 0.7 + r() * 0.3,
    stubble: female ? 0 : r() < 0.25 ? 0 : 0.25 + r() * 0.65,
    lip: female ? 0.35 + r() * 0.3 : 0.1 + r() * 0.15,
    freckle: r() < 0.25 ? r() : 0,
    morph,
    ...preset,
  };
  if (preset.morph) ap.morph = { ...morph, ...preset.morph };
  if (ap.morph.age > 0.6) ap.hair = new THREE.Color(ap.hair).lerp(new THREE.Color(0xb8b4ae), (ap.morph.age - 0.6) * 1.6).getHex();
  return ap;
}

// --- materials ---------------------------------------------------------------

const SSS_CHUNK = (() => {
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  const line = 'reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );';
  if (!src.includes(line)) return null;
  return src.replace(
    line,
    `#ifdef SKIN_SSS
	float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.45 ) / 1.45 );
	vec3 scatter = max( wrapNL - dotNL, 0.0 ) * uSkinScatter * directLight.color;
	reflectedLight.directDiffuse += ( irradiance + scatter ) * diffuseBRDF * ( 1.0 - F );
#else
	${line}
#endif`,
  );
})();

/** Skin: neutral baked albedo tinted per character, hair masks composited. */
export function skinMaterial(assets, ap) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(ap.tone),
    map: assets.texture('skin_albedo'),
    normalMap: assets.texture('skin_normal', { srgb: false }),
    roughnessMap: assets.texture('skin_orm', { srgb: false }),
    aoMap: assets.texture('skin_orm', { srgb: false }),
    roughness: 1,
    metalness: 0,
    aoMapIntensity: 0.85,
  });
  m.normalScale.set(0.45, 0.45);
  m.name = 'skin';
  const masks = assets.texture('skin_masks', { srgb: false });
  const hair = new THREE.Color(ap.hair);
  const deep = new THREE.Color(ap.tone).getHSL({}).l < 0.35;
  const uniforms = {
    uSkinMasks: { value: masks },
    uHairColor: { value: hair },
    uBrow: { value: new THREE.Vector2(0.62 - ap.brow * 0.4, 0.9 - ap.brow * 0.35) },
    uStubble: { value: ap.stubble },
    uScalp: { value: ap.hairStyle === 'shaved' ? 0.12 : ap.hairStyle === 'buzz' ? 0.9 : 0.75 },
    uLip: { value: ap.lip },
    uAge: { value: ap.morph?.age || 0 },
    uSkinScatter: { value: new THREE.Color(deep ? 0x8a3a24 : 0xc4523a).multiplyScalar(0.55) },
  };
  m.userData.face = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.defines = { ...(sh.defines || {}), SKIN_SSS: 1 };
    if (SSS_CHUNK) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', 'uniform vec3 uSkinScatter;\n' + SSS_CHUNK);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        'void main() {',
        `uniform sampler2D uSkinMasks; uniform vec3 uHairColor; uniform vec2 uBrow; uniform float uStubble, uScalp, uLip, uAge;
float skinHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
	vec4 skMask = texture2D( uSkinMasks, vMapUv );
	float browA = smoothstep( uBrow.x, uBrow.y, skMask.r );
	// Fine strand break-up so brows and stubble never read as paint.
	float grain = skinHash( floor( vMapUv * 4096.0 ) );
	browA *= 0.65 + 0.35 * grain;
	float beardA = smoothstep( 0.25, 0.75, skMask.g ) * uStubble * ( 0.55 + 0.45 * grain );
	float scalpA = skMask.b * uScalp * ( 0.7 + 0.3 * grain );
	vec3 hairTone = uHairColor;
	diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * mix( vec3( 1.0 ), vec3( 0.86, 0.62, 0.62 ), 0.6 ), skMask.a * uLip );
	diffuseColor.rgb = mix( diffuseColor.rgb, hairTone, clamp( browA * 0.92, 0.0, 1.0 ) );
	diffuseColor.rgb = mix( diffuseColor.rgb, hairTone * 0.9 + diffuseColor.rgb * 0.1, clamp( beardA * 0.85, 0.0, 1.0 ) );
	diffuseColor.rgb = mix( diffuseColor.rgb, hairTone, clamp( scalpA * 0.88, 0.0, 1.0 ) );
	float hairCover = max( browA, max( beardA, scalpA ) );`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
	roughnessFactor = mix( roughnessFactor, 0.78, hairCover ) + uAge * 0.06;`,
      );
  };
  m.customProgramCacheKey = () => 'attune-skin-v1';
  return m;
}

/** Eyeball: sclera + iris (tinted through the texture's alpha mask). */
export function eyeMaterial(assets, ap, centreY = 0) {
  const m = new THREE.MeshPhysicalMaterial({ map: assets.texture('eye_albedo'), roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 });
  m.name = 'eye';
  const iris = { value: new THREE.Color(ap.eye) };
  const lid = { value: 0.12 };
  const centre = { value: centreY };
  m.userData.face = { iris, lid };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uIris = iris;
    sh.uniforms.uLidShade = lid;
    sh.uniforms.uEyeCentreY = centre;
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'varying vec3 vEyeLocal;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvEyeLocal = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 uIris; uniform float uLidShade, uEyeCentreY; varying vec3 vEyeLocal;\nvoid main() {')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
	vec4 eyeTex = texture2D( map, vMapUv );
	vec3 irisCol = eyeTex.rgb * uIris * 3.2;
	diffuseColor.rgb *= mix( eyeTex.rgb, irisCol, eyeTex.a );
#endif`,
      )
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
	// Lid occlusion: the upper lid shadows the top of the ball.
	float lidOcc = smoothstep( -0.002, 0.012, vEyeLocal.y - uEyeCentreY );
	reflectedLight.indirectDiffuse *= 1.0 - 0.55 * lidOcc;
	reflectedLight.directDiffuse *= 1.0 - uLidShade * 4.0 * lidOcc;`,
      );
  };
  m.customProgramCacheKey = () => 'attune-eye-v1';
  return m;
}

export function corneaMaterial() {
  return new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, roughness: 0.02, metalness: 0, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, name: 'cornea' });
}

/**
 * Hair shells: each layer of the scalp offset is cut into strands by a
 * procedural noise field aligned with the comb direction (bind space, so the
 * pattern is stable under animation). Roots are darker (self-shadowing) and
 * strands thin toward the outer layers.
 */
export function hairMaterial(ap) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(ap.hair), roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
  m.name = 'hair';
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'attribute vec3 _flow; varying vec3 vHairP; varying vec3 vHairF; varying vec2 vHairL;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvHairP = position; vHairF = _flow; vHairL = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        'void main() {',
        `varying vec3 vHairP; varying vec3 vHairF; varying vec2 vHairL;
float hHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hNoise(vec2 x){ vec2 i = floor(x); vec2 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hHash(i), hHash(i + vec2(1.0, 0.0)), f.x), mix(hHash(i + vec2(0.0, 1.0)), hHash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
	vec3 fl = normalize( vHairF + 1e-5 );
	float along = dot( vHairP, fl );
	// Coordinate across the strands: a fixed axis made perpendicular to the comb direction.
	vec3 ax = normalize( cross( fl, vec3( 0.31, 0.83, 0.47 ) ) + 1e-5 );
	vec2 sp = vec2( dot( vHairP, ax ) * 1300.0, along * 30.0 );
	float strand = hNoise( sp );
	float h = vHairL.x;
	float keep = strand - ( 0.16 + 0.74 * h * h ) - ( 1.0 - vHairL.y ) * 0.6;
	if ( keep < 0.0 ) discard;
	float clump = hNoise( sp * vec2( 0.11, 0.2 ) + 17.0 );
	diffuseColor.rgb *= mix( 0.42, 1.08, h ) * ( 0.82 + 0.3 * clump ) * ( 0.9 + 0.2 * strand );`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
	roughnessFactor = mix( 0.62, 0.42, h );`,
      );
  };
  m.customProgramCacheKey = () => 'attune-hair-v2';
  return m;
}

export function lashMaterial(assets, ap) {
  const tex = assets.texture('lash_alpha');
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(ap.hair).multiplyScalar(0.6), alphaMap: tex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0 });
  m.name = 'lashes';
  return m;
}

// --- identity bake -------------------------------------------------------------

/**
 * Fold a character's constant identity morphs into its own copy of the
 * geometry and drop them from the morph set, so the vertex shader only
 * evaluates the expressions that actually animate (or none, for hair).
 */
function bakeIdentity(mesh, weights, keep) {
  const g0 = mesh.geometry;
  const dict = mesh.morphTargetDictionary;
  const mp = g0.morphAttributes.position;
  if (!dict || !mp) return;
  const g = g0.clone();
  g.userData = {};
  const pos = new THREE.Float32BufferAttribute(g0.attributes.position.count * 3, 3);
  const nrm = g0.attributes.normal ? new THREE.Float32BufferAttribute(g0.attributes.normal.count * 3, 3) : null;
  const src = g0.attributes.position;
  const srcN = g0.attributes.normal;
  for (let i = 0; i < src.count; i++) {
    pos.setXYZ(i, src.getX(i), src.getY(i), src.getZ(i));
    if (nrm) nrm.setXYZ(i, srcN.getX(i), srcN.getY(i), srcN.getZ(i));
  }
  const mn = g0.morphAttributes.normal;
  const kept = [];
  for (const [name, idx] of Object.entries(dict)) {
    if (keep(name)) {
      kept.push([name, idx]);
      continue;
    }
    const w = weights[name] || 0;
    if (!w) continue;
    const d = mp[idx];
    for (let i = 0; i < d.count; i++) pos.setXYZ(i, pos.getX(i) + d.getX(i) * w, pos.getY(i) + d.getY(i) * w, pos.getZ(i) + d.getZ(i) * w);
    if (nrm && mn?.[idx]) {
      const dn = mn[idx];
      for (let i = 0; i < dn.count; i++) nrm.setXYZ(i, nrm.getX(i) + dn.getX(i) * w, nrm.getY(i) + dn.getY(i) * w, nrm.getZ(i) + dn.getZ(i) * w);
    }
  }
  if (nrm) for (let i = 0; i < nrm.count; i++) {
    const x = nrm.getX(i), y = nrm.getY(i), z = nrm.getZ(i);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(i, x / l, y / l, z / l);
  }
  g.setAttribute('position', pos);
  if (nrm) g.setAttribute('normal', nrm);
  kept.sort((a, b) => a[1] - b[1]);
  g.morphAttributes = {};
  if (kept.length) {
    g.morphAttributes.position = kept.map(([, i]) => mp[i]);
    if (mn) g.morphAttributes.normal = kept.map(([, i]) => mn[i]);
  }
  g.morphTargetsRelative = g0.morphTargetsRelative;
  mesh.geometry = g;
  mesh.morphTargetDictionary = Object.fromEntries(kept.map(([name], k) => [name, k]));
  mesh.morphTargetInfluences = kept.map(() => 0);
  if (!kept.length) {
    mesh.morphTargetDictionary = undefined;
    mesh.morphTargetInfluences = undefined;
  }
}

// --- rig ---------------------------------------------------------------------

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const FWD = new THREE.Vector3(0, 0, 1);

/**
 * Dress the face meshes of a humanoid instance and return a controller.
 * opts.faceless: draw the head with the body suit (looks without a face).
 */
export function setupFace(inst, ap, assets, { faceless = false, hideHead = false, suitMaterial = null, hood = false, gloveMaterial = null } = {}) {
  // Under a hood the shell layers would push through the cloth; the painted
  // scalp carries the hairline instead.
  const hairStyle = hood ? 'none' : ap.hairStyle;
  const nodes = {};
  inst.traverse((o) => {
    if (o.isMesh && o.userData.facePart) (nodes[o.userData.facePart] ||= []).push(o);
  });
  if (!nodes.head) return null;
  const skin = skinMaterial(assets, ap);
  const mats = [skin];
  const morphMeshes = [];
  for (const o of nodes.head) {
    o.material = skin;
    if (o.morphTargetInfluences) morphMeshes.push(o);
    o.visible = !hideHead;
  }
  const teeth = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.35, metalness: 0, name: 'teeth' });
  mats.push(teeth);
  for (const o of nodes.teeth || []) {
    o.material = teeth;
    if (o.morphTargetInfluences) morphMeshes.push(o);
    o.visible = !hideHead;
  }
  for (const o of nodes.hands || []) o.material = faceless && suitMaterial ? suitMaterial : gloveMaterial || skin;
  let eyeMat = null;
  for (const o of nodes.eyes || []) {
    if (o.material.name === 'cornea') {
      // The eyeball's clear coat already carries the wet highlight; a fully
      // transparent cornea shell would only add overdraw.
      o.visible = false;
      continue;
    } else {
      o.geometry.computeBoundingBox();
      o.material = eyeMat ??= eyeMaterial(assets, ap, o.geometry.boundingBox.getCenter(new THREE.Vector3()).y);
    }
    mats.push(o.material);
    o.visible = !faceless && !hideHead;
  }
  // Hair: only the chosen style is shown (none under helmets or faceless heads).
  const hairMat = hairMaterial(ap);
  mats.push(hairMat);
  for (const [part, list] of Object.entries(nodes)) {
    if (!part.startsWith('hair_')) continue;
    for (const o of list) {
      o.material = hairMat;
      o.visible = !faceless && !hideHead && part === `hair_${hairStyle}`;
      // The head already shadows the scalp; alpha-tested layers in the shadow pass cost more than they add.
      o.castShadow = false;
      o.frustumCulled = false;
      o.userData.hairLayers = true;
      if (o.visible && o.morphTargetInfluences) morphMeshes.push(o);
    }
  }
  for (const o of nodes.lashes || []) {
    o.material = lashMaterial(assets, ap);
    mats.push(o.material);
    if (o.morphTargetInfluences) morphMeshes.push(o);
    o.visible = !faceless && !hideHead;
  }
  for (const o of [...(nodes.head || []), ...(nodes.hands || []), ...(nodes.eyes || []), ...(nodes.lashes || []), ...(nodes.teeth || [])]) {
    o.castShadow = o.name !== 'lashes' && o.name !== 'eyes';
    o.receiveShadow = true;
    o.frustumCulled = false;
  }
  // Identity weights are kept inside the range the build verified keeps the
  // lids and cheeks clear of the eyeballs (extras.ranges).
  const ranges = morphMeshes[0]?.userData?.ranges || {};
  const idWeights = {};
  for (const name of [...ID_MORPHS, 'age']) {
    const r = ranges[name] || [-1, 1];
    idWeights[name] = Math.max(r[0] * 0.9, Math.min(r[1] * 0.9, ap.morph?.[name] || 0));
  }
  const isExpression = (name) => !ID_MORPHS.includes(name) && name !== 'age';
  for (const o of morphMeshes) bakeIdentity(o, idWeights, (name) => isExpression(name) && !o.userData.hairLayers);
  // Hair has no expressions left; it stops being a morph mesh.
  for (let i = morphMeshes.length - 1; i >= 0; i--) if (!morphMeshes[i].morphTargetInfluences) morphMeshes.splice(i, 1);
  // Morph weights by name (each mesh has its own dictionary).
  const set = (name, w) => {
    for (const o of morphMeshes) {
      const i = o.morphTargetDictionary?.[name];
      if (i !== undefined) o.morphTargetInfluences[i] = w;
    }
  };

  // Identity morphs reshape the sockets; move the eyeballs with them.
  const shift = morphMeshes[0]?.userData?.eyeShift || morphMeshes[0]?.parent?.userData?.eyeShift || null;

  const head = inst.getObjectByName('Head');
  const eyes = ['eye_l', 'eye_r'].map((n) => inst.getObjectByName(n)).filter(Boolean);
  // Each eye's forward axis in Head space (bind pose looks along +Z).
  inst.updateMatrixWorld(true);
  const eyeFwd = eyes.map((e) => {
    tmpQ.copy(e.getWorldQuaternion(new THREE.Quaternion())).invert();
    return FWD.clone().applyQuaternion(tmpQ).normalize();
  });
  const headRest = head ? head.quaternion.clone() : null;
  if (shift && eyes.length === 2) {
    eyes.forEach((e, i) => {
      const side = i === 0 ? 'l' : 'r';
      const d = new THREE.Vector3();
      for (const [name, w] of Object.entries(ap.morph || {})) {
        const v = shift[name]?.[side];
        const rg = ranges[name] || [-1, 1];
        const wc = Math.max(rg[0] * 0.9, Math.min(rg[1] * 0.9, w));
        if (v && wc) d.add(tmpV.set(v[0], v[1], v[2]).multiplyScalar(wc));
      }
      // d is in bind (model) space; convert into the Head's frame.
      const hq = head.getWorldQuaternion(new THREE.Quaternion()).invert();
      const ws = inst.getWorldScale(new THREE.Vector3()).x || 1;
      e.position.add(d.multiplyScalar(ws).applyQuaternion(hq).divideScalar(head.getWorldScale(new THREE.Vector3()).x || 1));
    });
  }
  const r = rng(hashString(JSON.stringify(ap.morph || {})) ^ 0x9e3779b9);
  const S = {
    blinkIn: 1 + r() * 3,
    blink: 0,
    blinkT: -1,
    sacc: new THREE.Vector2(),
    saccIn: 0.5,
    expr: {},
    want: {},
    look: new THREE.Vector3(),
    hasLook: false,
    headTurn: new THREE.Quaternion(),
    talk: 0,
    lastHit: 0,
    cast: 0,
  };
  const exprNames = ['smile', 'frown', 'brow_down_l', 'brow_down_r', 'brow_up_l', 'brow_up_r', 'brow_inner_l', 'brow_inner_r', 'squint_l', 'squint_r', 'jaw_open', 'lips_press', 'grimace', 'sneer', 'wide_l', 'wide_r'];
  for (const n of exprNames) S.expr[n] = 0;
  let mood = { smile: (r() - 0.3) * 0.25 };

  // Small parts that only matter up close (eyes, lashes, teeth).
  const detail = [...(nodes.eyes || []), ...(nodes.lashes || []), ...(nodes.teeth || [])].filter((o) => o.visible);
  let detailShown = true;
  function update(dt, st = {}) {
    if (!morphMeshes.length) return;
    const near = st.faceDetail !== false;
    if (near !== detailShown) {
      detailShown = near;
      for (const o of detail) o.visible = near;
    }
    // --- blinking: natural interval, occasional double blink, closed when dead
    S.blinkIn -= dt;
    if (S.blinkT < 0 && S.blinkIn <= 0) {
      S.blinkT = 0;
      S.blinkIn = 1.6 + r() * 4.2;
      if (r() < 0.12) S.blinkIn = 0.28;
    }
    let blink = 0;
    if (S.blinkT >= 0) {
      S.blinkT += dt;
      const t = S.blinkT;
      blink = t < 0.07 ? t / 0.07 : t < 0.11 ? 1 : Math.max(0, 1 - (t - 0.11) / 0.13);
      if (t > 0.24) S.blinkT = -1;
    }
    // --- expression targets from presentation state
    const W = S.want;
    for (const n of exprNames) W[n] = 0;
    W.smile = mood.smile;
    if (st.combat) {
      W.brow_down_l = W.brow_down_r = 0.35;
      W.lips_press = 0.25;
      W.squint_l = W.squint_r = 0.15;
      W.smile = 0;
    }
    if (st.casting || st.cast > 0.2) {
      W.brow_down_l = W.brow_down_r = 0.55;
      W.squint_l = W.squint_r = 0.3;
      W.lips_press = 0.45;
    }
    if (st.attack > 0.3) {
      W.grimace = 0.5;
      W.jaw_open = 0.18;
      W.brow_down_l = W.brow_down_r = 0.7;
    }
    if (st.hit > 0.15) {
      W.squint_l = W.squint_r = 0.8;
      W.grimace = 0.7;
      W.brow_inner_l = W.brow_inner_r = 0.6;
      W.jaw_open = 0.12;
    }
    if (st.talking) {
      S.talk += dt * (6 + r() * 4);
      W.jaw_open = Math.max(0, Math.sin(S.talk) * 0.18 + Math.sin(S.talk * 2.3) * 0.08);
      W.brow_up_l = W.brow_up_r = 0.15 + 0.15 * Math.sin(S.talk * 0.37);
    }
    if (st.dead) {
      blink = 1;
      for (const n of exprNames) W[n] = 0;
      W.jaw_open = 0.2;
    }
    const k = Math.min(1, dt * (st.hit > 0.15 ? 18 : 7));
    for (const n of exprNames) {
      S.expr[n] += (W[n] - S.expr[n]) * k;
      set(n, S.expr[n]);
    }
    const lidRest = st.dead ? 0 : 0.08 + S.expr.squint_l * 0.1;
    set('blink_l', Math.min(1, lidRest + blink));
    set('blink_r', Math.min(1, lidRest + blink));
    if (eyeMat) eyeMat.userData.face.lid.value = 0.12 + blink * 0.2;

    // --- gaze and head look-at (only worth it up close)
    if (!near || !head || st.dead) return;
    S.saccIn -= dt;
    if (S.saccIn <= 0) {
      S.saccIn = 0.4 + r() * 2.2;
      S.sacc.set((r() - 0.5) * 0.12, (r() - 0.5) * 0.06);
    }
    // The mixer rewrites the head each animated frame; when it skipped this
    // frame, restore what it last wrote before adding the turn again.
    if (S.written && head.quaternion.equals(S.written)) head.quaternion.copy(S.base);
    S.base = (S.base || new THREE.Quaternion()).copy(head.quaternion);
    head.updateMatrixWorld(true);
    tmpM.copy(head.matrixWorld).invert();
    const lookAt = st.lookAt;
    // Head turn toward the target, limited, added on top of the animation.
    if (lookAt && headRest) {
      tmpV.copy(lookAt).applyMatrix4(tmpM).normalize();
      const fwdH = eyeFwd[0] || FWD;
      const want = new THREE.Quaternion().setFromUnitVectors(fwdH, tmpV);
      const ang = 2 * Math.acos(Math.min(1, Math.abs(want.w)));
      const lim = 0.75;
      if (ang > 1.6) want.identity();
      else if (ang > lim) want.slerp(new THREE.Quaternion(), 1 - lim / ang);
      S.headTurn.slerp(want.slerp(new THREE.Quaternion(), 0.45), Math.min(1, dt * 3));
    } else S.headTurn.slerp(new THREE.Quaternion(), Math.min(1, dt * 2));
    head.quaternion.multiply(S.headTurn);
    S.written = (S.written || new THREE.Quaternion()).copy(head.quaternion);
    head.updateMatrixWorld(true);
    tmpM.copy(head.matrixWorld).invert();
    eyes.forEach((e, i) => {
      const fwd = eyeFwd[i];
      if (lookAt) {
        e.getWorldPosition(tmpV2);
        tmpV.copy(lookAt).applyMatrix4(tmpM).sub(tmpV2.applyMatrix4(tmpM)).normalize();
      } else tmpV.copy(fwd);
      tmpV.x += S.sacc.x;
      tmpV.y += S.sacc.y;
      tmpV.normalize();
      // Clamp to a plausible range of eye rotation.
      const a = fwd.angleTo(tmpV);
      if (a > 0.45) tmpV.lerp(fwd, 1 - 0.45 / a).normalize();
      e.quaternion.setFromUnitVectors(fwd, tmpV);
    });
  }

  return {
    update,
    materials: mats,
    setMood(m) {
      mood = { ...mood, ...m };
    },
    dispose() {
      for (const m of mats) m.dispose();
    },
  };
}
