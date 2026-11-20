// Character appearance: body frame, race, skin tone, hair style and colour.
// Purely cosmetic — it never changes stats, rules or abilities. The server
// stores and relays one compact string; client and server share this one
// validator, so an unknown or out-of-range value can never reach a renderer.
//
// Encoding: "<frame>.<race>.<skin>.<hair>.<hairColour>", e.g. "f.human.2.crop.1".
// Ported from the isolated charlie/character-appearance work (INT-03) and
// narrowed to what the current renderer draws (client/src/face.js).

export const FRAMES = {
  m: { id: 'm', name: 'Masculine', body: 'humanoid_m' },
  f: { id: 'f', name: 'Feminine', body: 'humanoid_f' },
};

/** Hair styles the shell hair renderer supports (none = shaved scalp only). */
export const HAIR_STYLES = {
  none: { id: 'none', name: 'Shaved' },
  buzz: { id: 'buzz', name: 'Close crop' },
  crop: { id: 'crop', name: 'Field crop' },
  swept: { id: 'swept', name: 'Swept back' },
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
 * - human (Colonist): settler stock; natural skin, any hair.
 * - veyran: established lore (Red Rucker, "Veyran Burdenkeeper"): smooth,
 *   featureless, naturally crimson; hairless, with fine surface tracery.
 * - mirekin: colony-born, altered by the biotech bloom (concept: biologically
 *   altered forms); mottled skin, bioluminescent vein lines, a chitin crest.
 */
export const RACES = {
  human: {
    id: 'human', name: 'Colonist', blurb: 'Settler stock. Weathered, adaptable and unaltered.',
    skins: [0xfaf0ea, 0xf0dccf, 0xdcc0ab, 0xc4a086, 0xa98066, 0x8a644d, 0x6c4a39, 0x50362a, 0x3a271f],
    hair: ['none', 'buzz', 'crop', 'swept'],
  },
  mirekin: {
    id: 'mirekin', name: 'Mirekin', blurb: 'Colony-born, altered by the biotech bloom: mottled skin, bioluminescent veins and a chitin crest.',
    skins: [0x9aa89f, 0x8394a3, 0xa494a6, 0x7f9a84],
    hair: ['none', 'buzz', 'crop'],
  },
};

// Archived for explicit art inspection only; never enumerate this as a playable origin.
export const ARCHIVED_RACES = {
  veyran: {
    id: 'veyran', name: 'Veyran', blurb: 'Smooth, featureless and naturally crimson. Hairless; fine surface tracery reads emotion.',
    skins: [0xb3171b, 0x8f1218, 0xc6383a],
    hair: ['none'],
  },
};
export const RENDER_RACES = { ...RACES, ...ARCHIVED_RACES };

// Look -> starting appearance, so characters saved before appearance existed
// keep exactly the body they had (each look used to fix its own body).
const LOOK_DEFAULTS = {
  vanguard_plate: 'm.human.3.crop.1',
  red_rucker: 'm.veyran.0.none.0',
  // Preserve the original shaved defaults for these outfits.
  aegis_keeper: 'f.human.6.none.0',
  conductor: 'f.human.2.none.3',
  brine_surveyor: 'f.human.4.none.2',
  archivist: 'f.human.1.crop.6',
  quartermaster: 'm.human.4.buzz.1',
  expedition_quartermaster: 'f.human.3.crop.2',
};
const FALLBACK = 'm.human.3.crop.1';
/** Outfits that belong to one race (Red Rucker is a Veyran Burdenkeeper). */
export const LOOK_RACE = { red_rucker: 'veyran' };

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
 * race rules (hairless Veyran, the Mirekin hair set) are enforced last.
 */
export function normalizeAppearance(input, look) {
  const d = defaultAppearance(look);
  const raw = typeof input === 'string' ? decode(input) : input && typeof input === 'object' ? input : null;
  if (!raw) return d;
  const own = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);
  const frame = own(FRAMES, raw.frame) ? raw.frame : d.frame;
  // The retired identity is only available to explicit archive art inspection.
  // Active looks reject archived origins; preserve the chosen body frame.
  if (look !== 'red_rucker' && own(ARCHIVED_RACES, raw.race)) return { ...d, frame };
  const race = Object.hasOwn(LOOK_RACE, look) ? LOOK_RACE[look] : own(RACES, raw.race) ? raw.race : d.race;
  const R = RENDER_RACES[race];
  const skin = Number.isInteger(raw.skin) && raw.skin >= 0 && raw.skin < R.skins.length ? raw.skin : Math.min(d.race === race ? d.skin : 0, R.skins.length - 1);
  let hair = own(HAIR_STYLES, raw.hair) ? raw.hair : d.hair;
  if (!R.hair.includes(hair)) hair = R.hair.includes(d.hair) ? d.hair : R.hair[0];
  const hairColour = Number.isInteger(raw.hairColour) && raw.hairColour >= 0 && raw.hairColour < HAIR_COLOURS.length ? raw.hairColour : d.hairColour;
  return { frame, race, skin, hair, hairColour };
}

/** Normalise to the compact wire/storage string. */
export const appearanceString = (input, look) => encodeAppearance(normalizeAppearance(input, look));
