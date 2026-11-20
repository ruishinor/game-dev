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
