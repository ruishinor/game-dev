// Public, decorative artwork for existing item identities. Static fragments only;
// no acquisition data, stats, price, or content discovery decisions.
const motifs=Object.freeze({
  field_emitter:'<path d="M3 8h5l3-3h7l3 3v4l-5 3h-4l-2 6H6l2-8H3Z" fill="#566968"/><path d="M11 8h7v4h-7Z" fill="#233b3c"/><path d="M12 10h5m-8 4 3 1m-5 4h3" stroke="#c7b482"/><path d="M3 8v5" stroke="#88c8c1"/>',
  tuned_emitter:'<path d="M2 8h5l4-4h8l3 4v5l-5 3h-4l-2 5H6l2-7H2Z" fill="#667878"/><path d="M10 7h9v6h-9Z" fill="#20383f"/><path d="M12 9h5m-5 2h5M7 17h4" stroke="#dec390"/><path d="M2 9v4m18-6 2 2" stroke="#b4fff0" stroke-width="2"/><path d="m9 5 1 9m8-10 1 4" stroke="#a8b5b0"/>',
  dense_pulse_core:'<path d="M5 4h14l3 5-3 11H5L2 9Z" fill="#626e6c" stroke="#b4bcb1"/><path d="M7 5v13m10-13v13M4 10h16" stroke="#a7a99a"/><path d="m12 6-4 7h5l-1 5 5-8h-5Z" fill="#c99b61" stroke="#f3d6a4"/>',
  longpoint_emitter:'<path d="M3 16 17 3l4 3-2 8-12 7H3Z" fill="#4c666a" stroke="#b5c2b5"/><path d="m7 14 9-8 2 2-9 8Z" fill="#66b7b5" stroke="#c4efdc"/><path d="m3 18 4-1m9-5 3 2m-5 1 2 2" stroke="#d5b785"/>',
  brine_phase_filter:'<path d="M3 7 9 3h9l3 4v10l-5 4H7l-4-4Z" fill="#50615e"/><path d="M3 7h13l5-4M16 7v14" stroke="#a9b4a2"/><path d="M6 10h7v8H6Z" fill="#292f2e"/><path d="M8 11v5m3-5v5" stroke="#d4bb79"/><path d="M18 9v8" stroke="#a2b2af"/>',
  survey_calibrator:'<path d="M5 5h13l3 5v9l-4 3H5l-2-4V8Z" fill="#6c7465"/><path d="M6 8h10v7H6Z" fill="#203a3a"/><path d="m7 12 2-2 2 4 2-3 2 1" stroke="#afd0bd"/><path d="M17 5v-3m2 0h-4M7 18h3m3 0h3" stroke="#d2bd8a"/>',
  survey_induction:'<path d="M4 7 8 3h8l4 4v10l-4 4H8l-4-4Z" fill="#485b60"/><path d="M2 9h4m12 0h4M2 15h4m12 0h4" stroke="#a0b5a9"/><path d="m8 5 8 2v10l-8 2Z" fill="#182d33"/><path d="m9 8 6 2-6 2 6 2-6 2" stroke="#d7aa6f"/>',
  glyph_faultline:'<path d="M12 2 22 12 12 22 2 12Z" stroke="#b7b3a1" fill="#34403e"/><path d="m13 4-5 7 5 1-3 8m-6-7h4m6-3h6" stroke="#ebbc7a" stroke-width="1.8"/>',
  glyph_wideband:'<path d="M12 2 22 12 12 22 2 12Z" stroke="#b7b3a1" fill="#34403e"/><path d="M5 9q7-8 14 0M7 12q5-5 10 0m-8 3q3-3 6 0" stroke="#b9dece"/><circle cx="12" cy="18" r="1" fill="#b9dece"/>',
  glyph_reversal:'<path d="M12 2 22 12 12 22 2 12Z" stroke="#b7b3a1" fill="#37404a"/><path d="M12 5v14M5 9h7m-4-3 4 3-4 3m11 3h-7m4-3-4 3 4 3" stroke="#c5addf"/>',
  sporeglass_focus:'<path d="M7 4 15 2l6 6-2 11-9 3-7-8Z" fill="#50675c"/><path d="m7 4 3 18m5-20-3 9 7 8M3 14l9-3 9-3" stroke="#a6c2a2"/><path d="m7 11 5-3 4 5-4 4Z" fill="#9bbf8c" stroke="#d1e0ae"/>',
  servo_harness:'<path d="M3 5h6v8h6V5h6v14h-5v-3H8v3H3Z" fill="#65716e"/><path d="M5 7v9m14-9v9M9 10h6" stroke="#c6a77e"/><path d="M8 14h8v4H8Z" fill="#303936"/><path d="M10 15h4" stroke="#e0c69b"/>',
  wardstone_shard:'<path d="m12 2 8 6-3 12-10 2-4-9Z" fill="#596c71"/><path d="M12 2 9 13l3 5 5 2M3 13h6l11-5" stroke="#b8ada0"/><path d="m12 8 2 4-2 4" stroke="#c4b4df"/>',
  myelin_lattice:'<path d="m12 2 8 5v10l-8 5-8-5V7Z" fill="#3d5048"/><path d="M12 4v16M5 8l14 8M5 16 19 8" stroke="#b7d2a6"/><path d="m12 7 4 3v4l-4 3-4-3v-4Z" fill="#79937f"/>',
  kinetic_capacitor:'<path d="M4 5h16v16H4Z" fill="#536061"/><path d="M7 5V2m10 3V2M8 8v10m8-10v10" stroke="#aab3a6" stroke-width="2"/><path d="m13 7-4 6h5l-3 6" stroke="#e5b974" stroke-width="2"/>',
  adrenal_shunt:'<path d="m4 19 15-15 3 3L7 22Z" fill="#64746e"/><path d="m6 12 6 6m-1-11 6 6" stroke="#b7b6a3" stroke-width="2"/><path d="m8 13 3-3 4 4-3 3Z" fill="#c39268"/>',
  aegis_rectifier:'<path d="m12 2 9 5v7l-9 8-9-8V7Z" fill="#52696b"/><path d="M4 7 12 12l8-5M12 12v9" stroke="#b0b8a2"/><path d="m6 7 6 4 6-4-2 8-4 4-4-4Z" fill="#203d40"/><path d="M12 5v8" stroke="#e8bb7b"/>',
  keeper_resonator:'<rect x="3" y="4" width="18" height="16" rx="2" fill="#53616e"/><circle cx="12" cy="12" r="6" fill="#233244" stroke="#a99dbd"/><circle cx="12" cy="12" r="3" stroke="#d2bce4"/><path d="M12 7v10M7 12h10" stroke="#9bbebd"/>',
  brine_rescue_lattice:'<path d="M4 4h16v16H4Z" fill="#4f625d"/><path d="M4 4l16 16M20 4 4 20" stroke="#82998a"/><path d="M9 6h6v4h4v5h-4v4H9v-4H5v-5h4Z" fill="#9eb8a5" stroke="#c8dbca"/>',
});
export const REFINED_ART_IDS=Object.freeze(Object.keys(motifs));
export function refinedItemMotif(id){return typeof id==='string'&&Object.hasOwn(motifs,id)?motifs[id]:null;}
