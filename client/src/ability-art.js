// Original Attunement action-slot illustrations: compact, layered 64x64 SVGs.
// No art copied from the owner-provided reference screenshots.
const scenes = {
  rending_arc: {
    top:'#4c1a19', bottom:'#0a1019', glow:'#e65c23', bright:'#fff0b4',
    shapes:'<path d="M-7 58C21 43 38 15 71 2" fill="none" stroke="#f25f29" stroke-width="13" opacity=".35"/>'+
      '<path d="M-5 58C23 39 31 20 69 2" fill="none" stroke="#f3a24a" stroke-width="5" opacity=".85"/>'+
      '<path d="M11 48Q24 24 50 10L59 6 53 21 27 51 19 54Z" fill="#d6d6c5" stroke="#fff5ca" stroke-width="1.8"/>'+
      '<path d="M18 49 54 14" fill="none" stroke="#fff5dc" stroke-width="2.7"/>'+
      '<path d="M4 52 12 43 19 48 14 59 9 62Z" fill="#503024" stroke="#e6b178" stroke-width="1.8"/>'+
      '<path d="M17 22 24 17M36 50 45 46M47 31 56 28M17 12 20 6" fill="none" stroke="#ffb76c" stroke-width="2.4" stroke-linecap="round"/>'+
      '<circle cx="44" cy="16" r="3" fill="#fff1ba"/><circle cx="59" cy="34" r="2" fill="#f76b29"/>'
  },
  graviton_tether: {
    top:'#10324b', bottom:'#090d25', glow:'#56d5f5', bright:'#d1feff',
    shapes:'<path d="M13 51Q26 11 51 13" fill="none" stroke="#113edc" stroke-width="17" opacity=".48"/>'+
      '<path d="M13 48C28 37 31 19 51 16" fill="none" stroke="#31d5ff" stroke-width="5.5" opacity=".8"/>'+
      '<path d="M12 49 28 33 35 36 51 15" fill="none" stroke="#e6ffff" stroke-width="2.8" stroke-linejoin="round"/>'+
      '<circle cx="12" cy="49" r="11" fill="#233b62" stroke="#84dcf3" stroke-width="3"/>'+
      '<circle cx="12" cy="49" r="4" fill="#dcfaff" stroke="#3bc2ef" stroke-width="1.5"/>'+
      '<circle cx="52" cy="14" r="11" fill="#2d3044" stroke="#8cb9d8" stroke-width="3"/>'+
      '<circle cx="52" cy="14" r="4" fill="#f6e9c8" stroke="#54deff" stroke-width="1.5"/>'+
      '<path d="M6 20 14 27 20 22 31 28 37 17 48 27" fill="none" stroke="#5befff" stroke-width="2" stroke-linecap="round"/>'+
      '<path d="M32 42 41 36 44 45 58 38" fill="none" stroke="#9fc8f8" stroke-width="2"/>'
  },
  kinetic_ward: {
    top:'#51432c', bottom:'#111b2b', glow:'#ffd686', bright:'#fff2c4',
    shapes:'<path d="M32 2 57 14 57 43 32 61 7 43 7 14Z" fill="#8a6a37" stroke="#f8dda0" stroke-width="2.8"/>'+
      '<path d="M32 8 50 18 50 39 32 54 14 39 14 18Z" fill="#173947" stroke="#e2b96f" stroke-width="2"/>'+
      '<path d="M32 11 46 20 46 37 32 49Z" fill="#b59257" opacity=".82"/>'+
      '<path d="M32 11 18 20 18 37 32 49Z" fill="#2e5860" opacity=".88"/>'+
      '<path d="M32 15 41 22 41 35 32 43 23 35 23 22Z" fill="#e7d89b" stroke="#fff5d6" stroke-width="1.8"/>'+
      '<path d="M32 17 32 42M25 30h14" stroke="#385164" stroke-width="3" stroke-linecap="round"/>'+
      '<path d="M5 15 12 11M51 8 59 12M8 51 15 56M49 55 57 48" stroke="#ffd884" stroke-width="2" stroke-linecap="round"/>'+
      '<circle cx="32" cy="30" r="3" fill="#fffef2"/>'
  },
  discharge: {
    top:'#233458', bottom:'#180b26', glow:'#79cfff', bright:'#fff7d4',
    shapes:'<circle cx="32" cy="32" r="26" fill="none" stroke="#4079b7" stroke-width="5" opacity=".8"/>'+
      '<circle cx="32" cy="32" r="18" fill="none" stroke="#d4a5e6" stroke-width="3" opacity=".76"/>'+
      '<path d="M31 3 36 22 51 9 42 27 61 25 43 34 58 49 38 42 35 61 29 41 12 54 22 36 4 31 23 27 15 10 29 21Z" fill="#79d9ff" stroke="#efffff" stroke-width="1.4"/>'+
      '<path d="M32 11 34 27 46 19 38 31 48 39 35 36 31 51 27 36 15 43 25 31 17 21 29 27Z" fill="#ffedd2" stroke="#d8fbff" stroke-width="1.4"/>'+
      '<circle cx="32" cy="32" r="8" fill="#f6faff" stroke="#9cdaff" stroke-width="3"/>'+
      '<path d="M6 9 14 15M48 56 57 61M55 14 62 5M8 60 15 51" stroke="#c9c5ff" stroke-width="2" stroke-linecap="round"/>'
  }
};

// supplemental: symbiotech
Object.assign(scenes, {
  neural_lash: {top:"#402045",bottom:"#10142c",glow:"#fb619c",bright:"#ffe3fc",shapes:"<path d=\"M5 51Q26 5 55 16T41 52\" fill=\"none\" stroke=\"#aa2fac\" stroke-width=\"14\" opacity=\".55\"/><path d=\"M4 52Q26 8 53 17T38 50\" fill=\"none\" stroke=\"#ff98c7\" stroke-width=\"4\"/><path d=\"M9 45 18 37 14 28 25 24 30 13\" fill=\"none\" stroke=\"#fbe9ee\" stroke-width=\"2.5\"/><path d=\"M38 49 47 44 43 36 55 30\" fill=\"none\" stroke=\"#f26a8e\" stroke-width=\"3\"/><circle cx=\"51\" cy=\"17\" r=\"4\" fill=\"#fff2ed\"/>"},
  mending_graft: {top:"#154c38",bottom:"#112432",glow:"#9df1ac",bright:"#f2efad",shapes:"<path d=\"M32 60V8M12 31h40\" fill=\"none\" stroke=\"#2cb98e\" stroke-width=\"18\" opacity=\".45\"/><path d=\"M32 12v41M13 31h38\" stroke=\"#fff0ba\" stroke-width=\"9\" stroke-linecap=\"round\"/><path d=\"M32 12v41M13 31h38\" stroke=\"#6ff5a5\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M18 51C4 37 11 24 22 20M47 50c11-14 7-26-3-32\" fill=\"none\" stroke=\"#c8ffa9\" stroke-width=\"3\"/><circle cx=\"32\" cy=\"32\" r=\"6\" fill=\"#e8ffcb\"/>"},
  spore_snare: {top:"#443323",bottom:"#14251f",glow:"#c4e99b",bright:"#ffe5bb",shapes:"<path d=\"M17 39Q9 29 21 15Q34 5 46 16Q54 25 44 33Z\" fill=\"#9b6b4a\" stroke=\"#f3d1a1\" stroke-width=\"2\"/><path d=\"M21 35Q16 25 27 17Q35 13 42 23Q45 28 37 34Z\" fill=\"#d6b277\"/><path d=\"M31 30v30M31 41l-18 12M32 43l17 13M29 47l-7 14\" fill=\"none\" stroke=\"#a6db92\" stroke-width=\"3\"/><circle cx=\"19\" cy=\"22\" r=\"3\" fill=\"#fff6d1\"/><circle cx=\"41\" cy=\"19\" r=\"4\" fill=\"#d5ffbb\"/><circle cx=\"50\" cy=\"36\" r=\"3\" fill=\"#ffeec0\"/>"},
  overgrowth_surge: {top:"#19412f",bottom:"#101c24",glow:"#8ce86d",bright:"#f5ffd0",shapes:"<path d=\"M32 59Q19 40 32 25Q41 12 30 4\" fill=\"none\" stroke=\"#a8f380\" stroke-width=\"8\"/><path d=\"M31 40Q8 39 9 18Q30 15 31 40M36 30Q49 10 59 19Q57 37 36 30M29 52Q12 54 10 40Q29 36 29 52\" fill=\"#4a9e67\" stroke=\"#cdf2a0\" stroke-width=\"2\"/><path d=\"M33 55Q43 49 50 56M23 25 16 20M44 24l8-6\" fill=\"none\" stroke=\"#f4ffd6\" stroke-width=\"3\"/><circle cx=\"33\" cy=\"30\" r=\"5\" fill=\"#e3ffc1\"/>"}
});

// supplemental: keeper
Object.assign(scenes, {
  phase_needle: {top:"#193d59",bottom:"#0a1830",glow:"#62d7ed",bright:"#e1ffff",shapes:"<path d=\"M9 56 43 8 56 5 48 19 12 60Z\" fill=\"#2a879c\" stroke=\"#a8eef7\" stroke-width=\"2\"/><path d=\"M19 47 46 13\" fill=\"none\" stroke=\"#efffff\" stroke-width=\"4\"/><path d=\"M8 27 25 30 13 44M41 42 53 31 57 51\" fill=\"none\" stroke=\"#5fe5fb\" stroke-width=\"3\"/><circle cx=\"44\" cy=\"13\" r=\"5\" fill=\"#fffdd9\"/><path d=\"M5 8 13 14M52 48 60 56\" fill=\"none\" stroke=\"#bcecff\" stroke-width=\"2\"/>"},
  hinge_field: {top:"#493f2c",bottom:"#122b38",glow:"#efd193",bright:"#f9ffef",shapes:"<path d=\"M5 51V24L32 5l27 19v27Z\" fill=\"#31505b\" stroke=\"#e8c481\" stroke-width=\"4\"/><path d=\"M11 47V28L32 13l21 15v19Z\" fill=\"#6e8e87\" opacity=\".65\"/><path d=\"M32 7v49M8 28l24 12 24-12\" stroke=\"#fcf4c9\" stroke-width=\"2.8\" fill=\"none\"/><path d=\"M13 49h38M20 20l12 7 12-7\" stroke=\"#8de9db\" stroke-width=\"2.4\" fill=\"none\"/><circle cx=\"32\" cy=\"39\" r=\"5\" fill=\"#ffdf9e\"/>"},
  resonant_reversal: {top:"#412b5b",bottom:"#101625",glow:"#bc94f8",bright:"#ffeed1",shapes:"<path d=\"M7 13 35 6 56 29 43 57 16 49Z\" fill=\"#543e79\" stroke=\"#cebaff\" stroke-width=\"3\"/><path d=\"M31 11 48 31 33 52 18 33Z\" fill=\"#8a6cb1\"/><path d=\"M8 48 29 30 18 19M54 12 36 28 50 46\" fill=\"none\" stroke=\"#f3d8fd\" stroke-width=\"4\"/><path d=\"M7 26 14 29M52 41 59 45M31 3v8M31 55v7\" stroke=\"#f3cb8f\" stroke-width=\"3\"/><circle cx=\"32\" cy=\"31\" r=\"6\" fill=\"#fff2d6\"/>"},
  lattice_relay: {top:"#184a57",bottom:"#101c30",glow:"#62ede4",bright:"#f2fae8",shapes:"<path d=\"M32 5 58 32 32 59 5 32Z\" fill=\"#2d5f69\" stroke=\"#d5eec6\" stroke-width=\"3\"/><path d=\"m19 18 28 28m0-28L19 46M6 32h52M32 6v52\" fill=\"none\" stroke=\"#a6f8e4\" stroke-width=\"2.4\"/><path d=\"M32 16 48 32 32 48 16 32Z\" fill=\"#5c8e92\" stroke=\"#f2e6ac\" stroke-width=\"1.7\"/><circle cx=\"32\" cy=\"32\" r=\"7\" fill=\"#d9fff0\" stroke=\"#f5e3b6\" stroke-width=\"2\"/>"},
  phase_transposition: {top:"#24395e",bottom:"#0b142e",glow:"#7fd7ff",bright:"#fff1d8",shapes:"<path d=\"M5 13 21 5 36 15v21L21 49 5 36Z\" fill=\"#325177\" stroke=\"#9acff9\" stroke-width=\"2.5\"/><path d=\"M29 28 44 17 59 25v22L44 58 29 47Z\" fill=\"#755c8a\" stroke=\"#f1dcff\" stroke-width=\"2.5\"/><path d=\"M21 23h25M38 16l9 7-9 7\" fill=\"none\" stroke=\"#fffbdc\" stroke-width=\"4\" stroke-linecap=\"round\"/><circle cx=\"17\" cy=\"30\" r=\"5\" fill=\"#8df1ff\"/><circle cx=\"45\" cy=\"39\" r=\"5\" fill=\"#f5ddff\"/>"}
});

// supplemental: surveyor
Object.assign(scenes, {
  fault_scan: {top:"#1b4553",bottom:"#11232e",glow:"#7bdce3",bright:"#fef3b8",shapes:"<circle cx=\"32\" cy=\"32\" r=\"23\" fill=\"#284752\" stroke=\"#7bd6d5\" stroke-width=\"3\"/><circle cx=\"32\" cy=\"32\" r=\"14\" fill=\"none\" stroke=\"#d0f1dc\" stroke-width=\"2\"/><path d=\"M32 4v19m0 18v19M4 32h19m18 0h19\" stroke=\"#f1da8e\" stroke-width=\"3\"/><path d=\"M20 20 44 44M44 20 20 44\" stroke=\"#7df2eb\" stroke-width=\"2\"/><circle cx=\"32\" cy=\"32\" r=\"5\" fill=\"#fff6c6\"/><path d=\"M8 11h10M46 53h10\" stroke=\"#abf7e4\" stroke-width=\"2\"/>"},
  core_bore: {top:"#563829",bottom:"#132331",glow:"#ff954f",bright:"#fff0ae",shapes:"<path d=\"M8 54 43 12 54 10 50 23 17 58Z\" fill=\"#8e9b9a\" stroke=\"#ffe0a4\" stroke-width=\"2.5\"/><path d=\"M20 47 47 16M15 38l20 12M28 25l19 11\" stroke=\"#fcce75\" stroke-width=\"4\"/><path d=\"M12 11 22 18M44 48l10 8M51 27l9-5\" stroke=\"#ff7e3c\" stroke-width=\"3\"/><circle cx=\"45\" cy=\"17\" r=\"6\" fill=\"#fff8ce\"/>"},
  field_rig: {top:"#3f3d2a",bottom:"#142c37",glow:"#e8c96c",bright:"#f6eed4",shapes:"<path d=\"M24 7h16l8 21-16 12-16-12Z\" fill=\"#60787b\" stroke=\"#e9ca84\" stroke-width=\"3\"/><path d=\"M28 14h8v14h-8Z\" fill=\"#d9f3ec\" stroke=\"#f8e2a8\" stroke-width=\"2\"/><path d=\"M22 37 9 60M32 39v23M42 37l13 23\" stroke=\"#b1bdb1\" stroke-width=\"6\"/><path d=\"M22 37 9 60M32 39v23M42 37l13 23\" stroke=\"#282e3a\" stroke-width=\"2\"/><circle cx=\"32\" cy=\"20\" r=\"4\" fill=\"#fff9d2\"/>"},
  controlled_blast: {top:"#5e3026",bottom:"#1a1529",glow:"#ffbd62",bright:"#fff0b8",shapes:"<circle cx=\"32\" cy=\"32\" r=\"25\" fill=\"#8e4e30\" opacity=\".45\"/><path d=\"M31 2 37 23 56 10 44 27 62 29 43 35 56 52 38 43 33 63 27 43 9 54 20 36 2 29 22 26 9 9 27 22Z\" fill=\"#f59b48\" stroke=\"#fff3be\" stroke-width=\"2\"/><path d=\"M32 11 36 26 47 22 40 34 48 43 34 40 30 53 26 38 16 44 24 32 17 22 29 27Z\" fill=\"#ffefbd\"/><circle cx=\"32\" cy=\"32\" r=\"7\" fill=\"#fefcf1\"/><path d=\"M6 5 13 12M52 6 58 1M7 58l7-6M52 55l8 5\" stroke=\"#ffcb82\" stroke-width=\"3\"/>"}
});

// supplemental: companion one
Object.assign(scenes, {
  triage: {top:"#154c37",bottom:"#10252f",glow:"#a7f6bf",bright:"#e7ffdc",shapes:"<path d=\"M32 6v52M7 32h50\" stroke=\"#f4eed0\" stroke-width=\"14\" stroke-linecap=\"round\"/><path d=\"M32 6v52M7 32h50\" stroke=\"#71dda9\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M11 15Q21 9 26 17M37 47Q48 57 55 45\" fill=\"none\" stroke=\"#d3ffd0\" stroke-width=\"3\"/><circle cx=\"32\" cy=\"32\" r=\"6\" fill=\"#fff7de\"/>"},
  guard: {top:"#3c3329",bottom:"#101d2b",glow:"#e9c37d",bright:"#fff1c8",shapes:"<path d=\"M32 4 56 15 53 43 32 60 11 43 8 15Z\" fill=\"#73593e\" stroke=\"#ffdfa6\" stroke-width=\"3\"/><path d=\"M32 12 48 20 45 39 32 49 19 39 16 20Z\" fill=\"#2d555f\" stroke=\"#b2e6d8\" stroke-width=\"2\"/><path d=\"M32 13v36M18 29h28\" stroke=\"#f7e5b4\" stroke-width=\"3\"/><circle cx=\"32\" cy=\"29\" r=\"5\" fill=\"#ffeec2\"/>"},
  assist: {top:"#503322",bottom:"#111827",glow:"#f9a962",bright:"#fff1c9",shapes:"<path d=\"M12 53 47 16M35 14h18v18\" fill=\"none\" stroke=\"#ffdf9d\" stroke-width=\"8\" stroke-linecap=\"round\"/><path d=\"M11 50 48 13M36 14h16v16\" fill=\"none\" stroke=\"#f07844\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M5 13 14 18M44 51l12 7M15 32l8 9\" stroke=\"#ffd2a0\" stroke-width=\"2.5\"/><circle cx=\"48\" cy=\"16\" r=\"5\" fill=\"#fff8dd\"/>"},
  follow: {top:"#1f3b53",bottom:"#10232e",glow:"#9acced",bright:"#e5f4ef",shapes:"<path d=\"M20 13Q8 22 14 34L23 41 33 30 28 15Z\" fill=\"#587b90\" stroke=\"#c7f5ef\" stroke-width=\"3\"/><path d=\"M40 27Q30 34 36 47l10 9 10-14-5-15Z\" fill=\"#7994a2\" stroke=\"#d4e6e3\" stroke-width=\"3\"/><path d=\"M13 44 20 50M28 48l7 7M45 9l7 6\" stroke=\"#a5e1ff\" stroke-width=\"2\"/><circle cx=\"23\" cy=\"18\" r=\"3\" fill=\"#fff3d2\"/>"}
});

// The ids are static, authored game content. No dynamic user input or markup.
export function paintedAbilityArt(id) {
  if (!Object.hasOwn(scenes, id)) return null;
  const { top, bottom, glow, bright, shapes } = scenes[id];
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-hidden="true" focusable="false">' +
    '<defs><linearGradient id="bg-' + id + '" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + top + '"/><stop offset="1" stop-color="' + bottom + '"/></linearGradient>' +
    '<radialGradient id="glow-' + id + '"><stop stop-color="' + glow + '" stop-opacity=".8"/><stop offset=".6" stop-color="' + glow + '" stop-opacity=".21"/><stop offset="1" stop-color="' + glow + '" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="edge-' + id + '" x1="0" y1="0" x2="0" y2="1"><stop stop-color="' + bright + '" stop-opacity=".78"/><stop offset="1" stop-color="#10161e" stop-opacity=".95"/></linearGradient>' +
    '<clipPath id="clip-' + id + '"><rect x="1" y="1" width="62" height="62" rx="3"/></clipPath></defs>' +
    '<g clip-path="url(#clip-' + id + ')"><rect width="64" height="64" fill="url(#bg-' + id + ')"/>' +
    '<ellipse cx="31" cy="34" rx="36" ry="35" fill="url(#glow-' + id + ')"/>' +
    '<path d="M1 61 61 2M-3 34 34 -3M31 67 67 31" stroke="' + glow + '" opacity=".16" stroke-width="2"/>' +
    shapes + '<rect x="1.2" y="1.2" width="61.6" height="61.6" rx="3" fill="none" stroke="url(#edge-' + id + ')" stroke-width="1.9"/></g></svg>';
}
