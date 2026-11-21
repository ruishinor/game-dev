// Class colourways for the Electrical Combat Rod. Presentation only: every
// variant is the same item with the same values. Cobalt is the rod's original
// identity (Vanguard); the others are chosen to stay distinct from it and from
// each other at combat distance.
const cobalt = Object.freeze({
  name: 'Cobalt',
  // Model
  cobaltBase: 0x1764aa, cobaltGlow: 0x1464aa, inlayBase: 0x4fa1bc, inlayGlow: 0x41bde8,
  // Weapon-local corona
  core: 0xc3f6ff, halo: 0x249cff, spark: 0xe6fbff, sheath: 0x3fb8ff, outer: 0x2a64ff, tip: 0xbff4ff,
  // Shared-engine discharge layers
  ice: 0xcaf7ff, cyan: 0x61d7ff, blue: 0x2675ef, deep: 0x344bcc, violet: 0x7254e8,
  strikeCore: 0xe0faff, strikeCyan: 0x42cbff, strikeBlue: 0x2779f5,
});
export const ROD_PALETTES = Object.freeze({
  vanguard: cobalt,
  symbiotech: Object.freeze({
    name: 'Verdant',
    cobaltBase: 0x1d7a4c, cobaltGlow: 0x16935a, inlayBase: 0x58b98a, inlayGlow: 0x46e39b,
    core: 0xd2ffe6, halo: 0x23c97a, spark: 0xeafff2, sheath: 0x45e09a, outer: 0x1f9e6a, tip: 0xc9ffe2,
    ice: 0xd6ffe8, cyan: 0x63eaa8, blue: 0x24a86b, deep: 0x1b6e58, violet: 0x2fb7a4,
    strikeCore: 0xe6fff1, strikeCyan: 0x52e6a2, strikeBlue: 0x23a26a,
  }),
  keeper: Object.freeze({
    name: 'Resonant',
    cobaltBase: 0x5a3aa8, cobaltGlow: 0x6c47c9, inlayBase: 0x9a86d6, inlayGlow: 0xa88cff,
    core: 0xeee4ff, halo: 0x8a5cff, spark: 0xf4eeff, sheath: 0xa07cff, outer: 0x6440e0, tip: 0xe6dbff,
    ice: 0xefe6ff, cyan: 0xb59bff, blue: 0x7a52f0, deep: 0x4b33b8, violet: 0xc06cf0,
    strikeCore: 0xf3edff, strikeCyan: 0xb090ff, strikeBlue: 0x7550ee,
  }),
  surveyor: Object.freeze({
    name: 'Amber',
    cobaltBase: 0x9a5a14, cobaltGlow: 0xb86a12, inlayBase: 0xc9a26a, inlayGlow: 0xffaa3c,
    core: 0xfff1d6, halo: 0xff9a2a, spark: 0xfff6e6, sheath: 0xffb455, outer: 0xd96d10, tip: 0xffe6bf,
    ice: 0xfff0d2, cyan: 0xffc067, blue: 0xf08a1e, deep: 0xa8520f, violet: 0xff6a3a,
    strikeCore: 0xfff4de, strikeCyan: 0xffbb55, strikeBlue: 0xe8821a,
  }),
});
export const DEFAULT_ROD_PALETTE = cobalt;
/** Palette for a class id; unknown or untrusted values fall back to cobalt. */
export function rodPalette(cls) {
  return typeof cls === 'string' && Object.hasOwn(ROD_PALETTES, cls) ? ROD_PALETTES[cls] : cobalt;
}
