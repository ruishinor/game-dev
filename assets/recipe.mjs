// What the asset build produces. Data only: tools/assets/build.mjs does the work.
// Source ids refer to assets/sources.json; paths are inside the unpacked source.

const UAL1 = 'Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb';
const UAL2 = 'Universal Animation Library 2 [Standard]/Unreal-Godot/UAL2_Standard.glb';
const UAL2_F = 'Universal Animation Library 2 [Standard]/Female Mannequin/Unreal-Godot/Mannequin_F.glb';
const MEGA = 'Modular SciFi MegaKit[Standard]';

/**
 * Clothing and armour shells cut from the body mesh. `joints` selects the
 * region by skin weight, `clip` trims it with planes (functions returning a
 * signed distance; the part where it is >= 0 is kept) and `offset` is how far
 * the shell sits off the skin, in metres. `J` holds bind-pose joint positions,
 * so one definition fits both body shapes.
 */
export const SHELLS = [
  {
    name: 'shorts',
    joints: ['pelvis', 'thigh_l', 'thigh_r', 'spine_01'],
    offset: 0.013,
    clip: (J) => [(p) => p[1] - (J.calf_l[1] + 0.05), (p) => J.spine_01[1] - 0.03 - p[1]],
  },
  { name: 'shoes', joints: ['foot_l', 'foot_r', 'ball_l', 'ball_r'], offset: 0.011, clip: (J) => [(p) => J.foot_l[1] + 0.045 - p[1]] },
  {
    name: 'chest',
    joints: ['spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'neck_01'],
    offset: 0.022,
    clip: (J) => [(p) => p[1] - (J.spine_02[1] - 0.01), (p) => J.neck_01[1] + 0.01 - p[1], (p) => J.upperarm_l[0] + 0.035 - Math.abs(p[0])],
  },
  {
    name: 'belt',
    joints: ['pelvis', 'spine_01', 'spine_02', 'thigh_l', 'thigh_r'],
    offset: 0.02,
    clip: (J) => [(p) => p[1] - (J.pelvis[1] - 0.02), (p) => J.spine_02[1] - 0.01 - p[1]],
  },
  { name: 'forearms', joints: ['lowerarm_l', 'lowerarm_r'], offset: 0.016, clip: (J) => [(p) => Math.abs(p[0]) - (J.lowerarm_l[0] + 0.03), (p) => J.hand_l[0] - 0.005 - Math.abs(p[0])] },
  { name: 'upperarms', joints: ['upperarm_l', 'upperarm_r'], offset: 0.013, clip: (J) => [(p) => Math.abs(p[0]) - (J.upperarm_l[0] + 0.03), (p) => J.lowerarm_l[0] - 0.02 - Math.abs(p[0])] },
  { name: 'shins', joints: ['calf_l', 'calf_r'], offset: 0.016, clip: (J) => [(p) => p[1] - (J.foot_l[1] + 0.04), (p) => J.calf_l[1] - 0.03 - p[1]] },
  { name: 'thighs', joints: ['thigh_l', 'thigh_r'], offset: 0.012, clip: (J) => [(p) => p[1] - (J.calf_l[1] + 0.04), (p) => J.thigh_l[1] - 0.1 - p[1]] },
  { name: 'helmet', joints: ['Head'], threshold: 0.6, offset: 0.014 },
  {
    name: 'coat',
    joints: ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'thigh_l', 'thigh_r', 'clavicle_l', 'clavicle_r', 'neck_01'],
    offset: 0.021,
    clip: (J) => [(p) => p[1] - (J.calf_l[1] + 0.2), (p) => J.neck_01[1] + 0.015 - p[1], (p) => J.upperarm_l[0] + 0.03 - Math.abs(p[0])],
  },
  // Open-faced hood: the back, sides and crown of the head (a tilted plane keeps the face clear).
  { name: 'hood', joints: ['Head', 'neck_01'], threshold: 0.6, offset: 0.026, clip: (J) => [(p) => J.Head[2] + 0.07 - p[2] + (p[1] - (J.Head[1] + 0.13)) * 0.35, (p) => p[1] - (J.neck_01[1] + 0.02)] },
];

export const HUMANOIDS = [
  {
    id: 'humanoid_m',
    out: 'humanoid_m.glb',
    sources: ['ual2', 'ual1', 'makehuman'],
    mesh: ['ual2', UAL2],
    // Clips already on this rig.
    keep: ['Sword_Block', 'Idle_Shield_Break', 'Shield_OneShot', 'Melee_Hook', 'OverhandThrow', 'Hit_Knockback', 'Idle_FoldArms_Loop', 'Consume'],
    // Clips retargeted from library 1 (bone rename only).
    // Body, head and face: a fitted CC0 MakeHuman body (tools/assets/lib/mh-humanoid.mjs).
    makehuman: {
      crown: 1.8,
      hair: [
        { name: 'buzz', layers: 3, top: 0.0035, side: 0.0025, back: 0.003, lean: 0.3 },
        { name: 'crop', layers: 9, top: 0.018, side: 0.007, back: 0.009, lean: 0.5 },
        { name: 'swept', layers: 12, top: 0.032, side: 0.0045, back: 0.012, lean: 1.3, flow: 'back' },
      ],
      macro: { gender: 1, age: 0.5, muscle: 0.68, weight: 0.5, height: 0.5, proportions: 0.85 },
      targets: [['torso/torso-vshape-incr.target', 0.55], ['torso/torso-muscle-pectoral-incr.target', 0.35], ['torso/torso-muscle-dorsi-incr.target', 0.3], ['neck/neck-scale-horiz-incr.target', 0.55], ['neck/neck-scale-depth-incr.target', 0.4]],
    },
    retarget: {
      from: ['ual1', UAL1],
      clips: ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Punch_Jab', 'Punch_Cross', 'Spell_Simple_Enter', 'Spell_Simple_Idle_Loop', 'Spell_Simple_Shoot', 'Spell_Simple_Exit', 'Hit_Chest', 'Hit_Head', 'Death01', 'Interact', 'Idle_Talking_Loop'],
    },
  },
  // Same rig and bone names; plays humanoid_m's clips at runtime.
  {
    id: 'humanoid_f',
    out: 'humanoid_f.glb',
    sources: ['ual2', 'makehuman'],
    mesh: ['ual2', UAL2_F],
    keep: [],
    makehuman: {
      crown: 1.775,
      hair: [
        { name: 'buzz', layers: 3, top: 0.0035, side: 0.0025, back: 0.003, lean: 0.3 },
        { name: 'crop', layers: 9, top: 0.018, side: 0.007, back: 0.009, lean: 0.5 },
        { name: 'swept', layers: 12, top: 0.032, side: 0.0045, back: 0.012, lean: 1.3, flow: 'back' },
      ],
      macro: { gender: 0, age: 0.5, muscle: 0.55, weight: 0.45, height: 0.5, proportions: 0.85 },
      targets: [['neck/neck-scale-horiz-incr.target', 0.2]],
    },
  },
];

const mega = (dir, names) => names.map((n) => ({ name: n, src: ['scifi_megakit', `${MEGA}/glTF/${dir}/${n}.gltf`], textureDirs: [`${MEGA}/Textures`] }));
const ess = (names) => names.map((n) => ({ name: n, src: ['scifi_essentials', `glTF/${n}.gltf`] }));
// Foliage in this pack is modelled far more densely than a small prop needs
// at game distances; ratios are per piece, checked on the contact sheet.
const NATURE_SIMPLIFY = {
  // [ratio, error]: trees are thousands of thin twigs and leaf cards, which
  // only collapse with a generous error bound.
  TwistedTree_1: [0.3, 0.5],
  TwistedTree_3: [0.3, 0.5],
  DeadTree_1: [0.22, 0.5],
  DeadTree_3: [0.22, 0.5],
  Mushroom_Laetiporus: [0.25, 0.03],
  Grass_Wispy_Tall: [0.4, 0.03],
  Flower_3_Group: [0.4, 0.03],
  Clover_1: [0.5, 0.03],
  Bush_Common: [0.5, 0.03],
  Mushroom_Common: [0.6, 0.03],
};
const nat = (names) => names.map((n) => ({ name: n, src: ['nature_megakit', `glTF/${n}.gltf`], ...(NATURE_SIMPLIFY[n] ? { simplify: NATURE_SIMPLIFY[n][0], simplifyError: NATURE_SIMPLIFY[n][1] } : {}) }));

export const KITS = [
  {
    id: 'creatures',
    out: 'creatures.glb',
    sources: ['scifi_essentials'],
    maxTexture: 1024,
    simplify: 0.5,
    pieces: [
      { name: 'skitter', src: ['scifi_essentials', 'glTF/Enemy_QuadShell.gltf'] },
      { name: 'drone', src: ['scifi_essentials', 'glTF/Enemy_EyeDrone.gltf'] },
      { name: 'walker', src: ['scifi_essentials', 'glTF/Enemy_Trilobite.gltf'] },
    ],
  },
  {
    id: 'sanctum',
    out: 'sanctum.glb',
    sources: ['scifi_megakit', 'scifi_essentials'],
    maxTexture: 1024,
    // The kit's accent colour is red; the Sanctum's is the cyan of its beacon.
    hueShift: { match: /BaseColor_Red/i, degrees: 172 },
    emissive: [{ material: 'MI_Trim_01', file: ['scifi_megakit', `${MEGA}/Textures/T_Trim_01_Emissive.png`], factor: [0.35, 0.95, 1.0] }],
    pieces: [
      ...mega('Columns', ['Column_Hollow', 'Column_Large_Straight', 'Column_Round', 'Column_MetalSupport']).map((p) => (p.name === 'Column_Hollow' ? { ...p, simplify: 0.5 } : p)),
      ...mega('Platforms', ['Platform_Round1', 'Platform_Metal', 'Platform_DarkPlates', 'Platform_X', 'Platform_Simple', 'Door_Frame_Square', 'Platform_Stairs_4Wide']),
      ...mega('Props', ['Prop_Computer', 'Prop_Crate3', 'Prop_Crate4', 'Prop_Chest', 'Prop_Barrel_Large', 'Prop_Light_Floor', 'Prop_Light_Small', 'Prop_ItemHolder', 'Prop_AccessPoint', 'Prop_Cable_1', 'Prop_Vent_Big', 'Prop_Rail_4']),
      ...mega('Walls', ['WallBand_Straight', 'WallBand_Straight_Broken', 'ShortWall_Metal2_Straight']),
      ...ess(['Prop_SatelliteDish', 'Prop_Crate_Large', 'Prop_Crate_Tarp', 'Prop_Desk_Medium', 'Prop_Barrel1']),
    ],
  },
  {
    id: 'nature',
    out: 'nature.glb',
    sources: ['nature_megakit', 'scifi_megakit'],
    maxTexture: 512,
    pieces: [
      ...nat(['Mushroom_Common', 'Mushroom_Laetiporus', 'TwistedTree_1', 'TwistedTree_3', 'DeadTree_1', 'DeadTree_3', 'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3', 'Plant_7_Big', 'Plant_1_Big', 'Fern_1', 'Grass_Wispy_Tall', 'Grass_Common_Short', 'Clover_1', 'Flower_3_Group', 'Pebble_Round_1', 'Pebble_Round_3', 'Bush_Common']),
      // One mushroom from the cluster, to be scaled up into a Sporefield spore tree.
      { name: 'Mushroom_Single', src: ['nature_megakit', 'glTF/Mushroom_Common.gltf'], isolate: true },
      { name: 'pod', src: ['scifi_megakit', `${MEGA}/glTF/Aliens/Alien_Oculichrysalis.gltf`], textureDirs: [`${MEGA}/Textures`], simplify: 0.4 },
    ],
  },
];

/** Standalone textures (terrain). Resized and converted to WebP. */
export const TEXTURES = [
  { id: 'ground_albedo', out: 'tex/ground_albedo.webp', src: ['ph_aerial_grass_rock', 'aerial_grass_rock_diff_1k.jpg'], size: 1024, quality: 80, grey: 0.75 },
  { id: 'ground_normal', out: 'tex/ground_normal.webp', src: ['ph_aerial_grass_rock', 'aerial_grass_rock_nor_gl_1k.jpg'], size: 1024, quality: 88 },
];

// Skin and face maps baked from the MakeHuman UV layout (tools/assets/lib/mh-skin.mjs)
// and small face textures (tools/assets/lib/face-textures.mjs).
export const FACE_TEXTURES = [
  { id: 'skin_albedo', out: 'tex/skin_albedo.webp', kind: 'albedo', size: 2048, quality: 88, noAlpha: true, sources: ['makehuman'] },
  { id: 'skin_normal', out: 'tex/skin_normal.webp', kind: 'normal', size: 2048, quality: 90, noAlpha: true, sources: ['makehuman'] },
  { id: 'skin_orm', out: 'tex/skin_orm.webp', kind: 'orm', size: 1024, quality: 88, noAlpha: true, sources: ['makehuman'] },
  { id: 'skin_masks', out: 'tex/skin_masks.webp', kind: 'masks', size: 2048, quality: 90, sources: ['makehuman'] },
  { id: 'eye_albedo', out: 'tex/eye_albedo.webp', kind: 'eye', size: 512, quality: 90, sources: ['makehuman'] },
  { id: 'lash_alpha', out: 'tex/lash_alpha.webp', kind: 'lash', w: 256, h: 128, quality: 92, sources: [] },
];
