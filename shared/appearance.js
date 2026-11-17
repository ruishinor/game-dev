// Character appearance: body frame, race, skin tone, hair style and colour.
// Purely cosmetic — it never changes stats, rules or abilities. The server
// stores and relays one compact string; client and server share this one
// validator, so an unknown or out-of-range value can never reach a renderer.
//
// Encoding: "<frame>.<race>.<skin>.<hair>.<hairColour>", e.g. "f.human.2.ponytail.1".

export const FRAMES = {
  m: { id: 'm', name: 'Masculine', body: 'humanoid_m' },
  f: { id: 'f', name: 'Feminine', body: 'humanoid_f' },
};

export const HAIR_STYLES = {
  none: { id: 'none', name: 'Shaved' },
  crop: { id: 'crop', name: 'Field crop' },
  undercut: { id: 'undercut', name: 'Undercut' },
  ponytail: { id: 'ponytail', name: 'Tied back' },
  bun: { id: 'bun', name: 'Work knot' },
  braids: { id: 'braids', name: 'Braids' },
  locs: { id: 'locs', name: 'Locs' },
  mohawk: { id: 'mohawk', name: 'Ridge' },
};

export const HAIR_COLOURS = [
  { name: 'Black', hex: 0x1b1612 },
  { name: 'Dark brown', hex: 0x3b2618 },
  { name: 'Chestnut', hex: 0x6b3a1f },
  { name: 'Auburn', hex: 0x86391d },
  { name: 'Sand', hex: 0xb08d58 },
  { name: 'Ash', hex: 0x8f8a80 },
  { name: 'White', hex: 0xd6d1c7 },
  { name: 'Verdigris dye', hex: 0x2f7c76 },
  { name: 'Rust dye', hex: 0x8a2a1f },
];

/**
 * Races differ in silhouette and features, not only tint.
 * - human: colonist stock; natural skin, painted face, any hair.
 * - veyran: smooth, featureless, naturally crimson (existing lore); hairless,
 *   with fine surface tracery instead of a face.
 * - mirekin: colonist descendants altered by the biotech bloom (concept:
 *   "biologically altered forms", Altered Wilderness); mottled skin,
 *   bioluminescent vein lines, a chitin crest; a narrower set of hair.
 */
export const RACES = {
  human: {
    id: 'human', name: 'Colonist', blurb: 'Settler stock. Weathered, adaptable and unaltered.',
    skins: [0xf0d0b8, 0xd8a986, 0xb67c58, 0x8b5a3c, 0x5e3b27, 0x3d271b],
    hair: ['none', 'crop', 'undercut', 'ponytail', 'bun', 'braids', 'locs', 'mohawk'],
  },
  veyran: {
    id: 'veyran', name: 'Veyran', blurb: 'Smooth, featureless and naturally crimson. Hairless; surface tracery reads emotion.',
    skins: [0xb3171b, 0x8f1218, 0xc6383a],
    hair: ['none'],
  },
  mirekin: {
    id: 'mirekin', name: 'Mirekin', blurb: 'Colony-born, altered by the biotech bloom: mottled skin, bioluminescent veins and a chitin crest.',
    skins: [0x7d8f86, 0x6a7d8c, 0x8a7b8f, 0x5f7a64],
    hair: ['none', 'crop', 'braids', 'locs'],
  },
};

// Look -> starting appearance, so characters saved before appearance existed
// keep exactly the body they had (looks.js used to fix the body per look).
const LOOK_DEFAULTS = {
  vanguard_plate: 'm.human.2.crop.1',
  red_rucker: 'm.veyran.0.none.0',
  aegis_keeper: 'f.human.1.bun.0',
  conductor: 'f.human.3.braids.0',
  brine_surveyor: 'f.human.4.ponytail.2',
  archivist: 'f.human.0.locs.6',
};
const FALLBACK = 'm.human.2.crop.1';

export function encodeAppearance(a) {
  return [a.frame, a.race, a.skin, a.hair, a.hairColour].join('.');
}

function decode(str) {
  if (typeof str !== 'string' || str.length > 48) return null;
  const p = str.split('.');
  if (p.length !== 5) return null;
  return { frame: p[0], race: p[1], skin: Number(p[2]), hair: p[3], hairColour: Number(p[4]) };
}

/** The default appearance for a look (legacy saves, missing or invalid input). */
export function defaultAppearance(look) {
  return decode(Object.hasOwn(LOOK_DEFAULTS, look) ? LOOK_DEFAULTS[look] : FALLBACK);
}

/**
 * Validate any input (string or object) into a complete appearance. Each
 * field falls back independently, so one bad field never discards the rest;
 * race rules (e.g. hairless Veyran) are enforced last.
 */
export function normalizeAppearance(input, look) {
  const d = defaultAppearance(look);
  const raw = typeof input === 'string' ? decode(input) : input && typeof input === 'object' ? input : null;
  if (!raw) return d;
  const own = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);
  const frame = own(FRAMES, raw.frame) ? raw.frame : d.frame;
  const race = own(RACES, raw.race) ? raw.race : d.race;
  const R = RACES[race];
  const skin = Number.isInteger(raw.skin) && raw.skin >= 0 && raw.skin < R.skins.length ? raw.skin : Math.min(d.race === race ? d.skin : 0, R.skins.length - 1);
  let hair = own(HAIR_STYLES, raw.hair) ? raw.hair : d.hair;
  if (!R.hair.includes(hair)) hair = R.hair.includes(d.hair) ? d.hair : R.hair[0];
  const hairColour = Number.isInteger(raw.hairColour) && raw.hairColour >= 0 && raw.hairColour < HAIR_COLOURS.length ? raw.hairColour : d.hairColour;
  return { frame, race, skin, hair, hairColour };
}

/** Normalise to the compact wire/storage string. */
export const appearanceString = (input, look) => encodeAppearance(normalizeAppearance(input, look));
