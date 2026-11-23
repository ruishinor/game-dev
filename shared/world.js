// World geometry and movement rules shared by the server (authority) and the
// client (prediction). Everything here must stay deterministic and free of
// DOM / Node APIs so both sides compute identical results.

export const MOVE_HZ = 60;
export const MOVE_DT = 1 / MOVE_HZ;
export const RUN_SPEED = 7.0;
export const BACK_SPEED_MUL = 0.62;
export const JUMP_VELOCITY = 8.0;
export const GRAVITY = 22.0;
export const PLAYER_RADIUS = 0.45;
export const PHASE_RIFT_RADIUS = 2.45; // shared foundation / movement footprint

import { SEVERANCE_POCKET, SEVERANCE_VEINS, SEVERANCE_PROPS, GATE_THRESHOLD, EXPEDITION_OUTPOST, inSeverancePocket, clampToPocket, pocketHeight, pocketArea, inExpeditionOutpost } from './severance-gate.js';
import { SILENT_FOUNDRY, FOUNDRY_COLLIDERS, inSilentFoundry, foundryArea, foundryHeight, clampToFoundry } from './silent-foundry.js';
import { LUMENFEN, FEN_COLLIDERS, FEN_RIFTS, inLumenfen, clampToLumenfen, fenHeight, fenArea } from './lumenfen.js';
export { LUMENFEN, inLumenfen, fenArea } from './lumenfen.js';
export { SILENT_FOUNDRY, inSilentFoundry, foundryArea } from './silent-foundry.js';
export { SEVERANCE_POCKET, SEVERANCE_EXPANSE, SEVERANCE_GATE, EXPEDITION_OUTPOST, inSeverancePocket, inExpeditionOutpost } from './severance-gate.js';

export const WORLD = {
  name: 'The Verdigris Reach',
  radius: 92,
  sanctum: { x: 0, z: 0, r: 13 },
  spawn: { x: 0, z: 7.5 },
};

// Disconnected shared encounter deck. No movement input can bridge the gap.
export const RIFT_ANNEX=Object.freeze({name:'Phase Annex',x:220,z:0,hw:16,hd:34,arrivalZ:27,exitZ:30.5});
export function inRiftAnnex(x,z,pad=0){
 return Math.abs(x-RIFT_ANNEX.x)<=RIFT_ANNEX.hw+pad&&Math.abs(z-RIFT_ANNEX.z)<=RIFT_ANNEX.hd+pad;
}
export function travelRegionAt(x, z) {
  return inRiftAnnex(x, z, 2) ? 'phase_annex' : inSeverancePocket(x, z, 2) ? 'severance_expanse' : inSilentFoundry(x, z, 2) ? 'silent_foundry' : inLumenfen(x, z, 2) ? 'lumenfen' : 'reach';
}
/** Areas reached only by server-owned travel; reconnects there return to the Reach. */
export function inDisconnectedRegion(x, z, pad = 2) {
  return inRiftAnnex(x, z, pad) || inSeverancePocket(x, z, pad) || inSilentFoundry(x, z, pad) || inLumenfen(x, z, pad);
}

export function sameTravelRegion(a, b) {
  return travelRegionAt(a.x, a.z) === travelRegionAt(b.x, b.z);
}

export const ZONES = {
  sanctum: { x: 0, z: 0, r: 13, name: 'Lattice Sanctum' },
  sporefield: { x: -42, z: 26, r: 21, name: 'The Sporefield' },
  relay: { x: 44, z: 20, r: 19, name: 'Derelict Relay' },
  vault: { x: 6, z: -58, r: 17, name: 'Resonance Vault' },
  obelisk: { x: -57, z: -38, r: 8, name: 'The Listening Stone' },
  survey: { x: 43, z: -33, r: 17, name: 'Brineworks Cut' },
  sinter: { x: 6, z: 58, r: 16, name: 'Sinter Flats' },
  deep: { x: -54, z: -8, r: 18, name: 'Kestrel Deep' },
};

// One walkable heightfield: the covered research deck is below grade,
// not an independent stacked map. The roof is not a walkable surface.
export const DEEP = {
  floor: -6.2, x: -57, z: -8, hw: 7, hd: 6.5,
  roofBottom: -0.45, roofTop: 0.55,
};
export function deepRoofAt(x, z, pad = 0) {
  return Math.abs(x - DEEP.x) <= DEEP.hw + pad && Math.abs(z - DEEP.z) <= DEEP.hd + pad;
}

// Low-profile ecological landmarks; no new colliders or walkable level.
export const SINTER_SITES = {
  nursery: {x:1.6,z:59.4,r:2.8},
  mineral: {x:9.1,z:59.2,r:2.9},
};
export function sinterSiteAt(p) {
  for(const [id,site] of Object.entries(SINTER_SITES))
    if(Math.hypot(p.x-site.x,p.z-site.z)<=site.r)return id;
  return null;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

// Areas where the terrain is flattened so structures and arenas sit level.
const FLAT_AREAS = [
  { x: 0, z: 0, r: 15, f: 8, h: 0.4 },
  { x: ZONES.vault.x, z: ZONES.vault.z, r: 17, f: 9, h: -0.6 },
  { x: ZONES.relay.x, z: ZONES.relay.z, r: 15, f: 9, h: 0.8 },
  { x: ZONES.obelisk.x, z: ZONES.obelisk.z, r: 6, f: 6, h: 0.2 },
  { x: ZONES.survey.x, z: ZONES.survey.z, r: 10, f: 8, h: -1.8 },
];

/** Terrain height at a world position. Purely presentational for the server. */
export function groundHeight(x, z) {
  if(inRiftAnnex(x,z,2))return 0;
  if(inSeverancePocket(x,z,2))return pocketHeight(x,z);
  if(inSilentFoundry(x,z,2))return foundryHeight(x,z);
  if(inLumenfen(x,z,2))return fenHeight(x,z);
  let h =
    1.7 * Math.sin(x * 0.043) * Math.cos(z * 0.051) +
    0.9 * Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.093 + 0.7) +
    0.35 * Math.sin(x * 0.27 + z * 0.19);
  // The sporefield sits in a shallow bog.
  const sx = x - ZONES.sporefield.x;
  const sz = z - ZONES.sporefield.z;
  h -= 1.6 * smooth(1 - Math.hypot(sx, sz) / 26);
  // A shallow excavated basin with an eroded rim, localized to the new site.
  const brineR = Math.hypot(x - ZONES.survey.x, z - ZONES.survey.z);
  h += 1.15 * smooth(1 - Math.abs(brineR - 17) / 5);
  // The wind-scoured sinter bed is shallow, gently ribbed and walkable.
  const sinterR = Math.hypot(x - ZONES.sinter.x, z - ZONES.sinter.z);
  const sinterBlend = smooth(1 - (sinterR - 8) / 12);
  const sinterBed = -0.55 + 0.19 * Math.sin(x * 0.46 + z * 0.12) + 0.10 * Math.cos(z * 0.38);
  h = h * (1 - sinterBlend) + sinterBed * sinterBlend;
  for (const a of FLAT_AREAS) {
    const d = Math.hypot(x - a.x, z - a.z);
    const k = smooth(1 - (d - a.r) / a.f);
    h = h * (1 - k) + a.h * k;
  }
  // Buried chamber and continuous east approach. Smooth compact blend
  // preserves the rest of the terrain; floor is flat under the entire roof.
  const deepX = smooth(1 - (Math.abs(x - ZONES.deep.x) - 10) / 9);
  const deepZ = smooth(1 - (Math.abs(z - ZONES.deep.z) - 8) / 5);
  const deepBlend = deepX * deepZ;
  h = h * (1 - deepBlend) + DEEP.floor * deepBlend;
  // Basin walls rise steeply toward the world edge.
  const r = Math.hypot(x, z);
  const edge = r - (WORLD.radius - 9);
  if (edge > 0) h += edge * edge * 0.16;
  return h;
}

// ---------------------------------------------------------------------------
// Static props. Each prop has a visual `type` (client only) and an optional
// collider used by both sides: circle {r} or axis-aligned box {hw, hd}.
// ---------------------------------------------------------------------------

export const SANCTUM_FABRICATOR = Object.freeze({x:2.8,z:3.7,hw:1.4,hd:0.78,h:2.7,range:5});

export const INITIATION_SITE=Object.freeze({x:0,z:7.5,terminalX:-3.75,terminalZ:8.2});

function buildProps() {
  const props = [];
  const add = (p) => props.push(p);
  const rnd = mulberry32(90210);

  // --- Lattice Sanctum (safe zone) ---
  add({type:'sanctum_fabricator',...SANCTUM_FABRICATOR});
  add({ type: 'beacon', x: 0, z: 0, r: 1.5, h: 9 });
  // Open-sided arrival architecture preserves the existing north/south travel lane.
  for(const x of [-3.8,3.8])for(const z of [5.8,10])add({type:'arrival_pillar',x,z,r:.38,h:3.8});
  add({type:'arrival_terminal',x:INITIATION_SITE.terminalX,z:INITIATION_SITE.terminalZ,hw:.48,hd:.38,h:1.45});
  add({type:'arrival_floor',x:0,z:7.9});
  for(const z of [5.8,10])add({type:'arrival_arch',x:0,z});
  // Side enclosure provides a dedicated physical initiation space, with
  // open forward and rear exits and no change to the spawn position.
  for(const x of [-4.55,4.55])add({type:'arrival_wall',x,z:7.9,hw:.18,hd:2.12,h:3.35});
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    add({ type: 'pylon', x: Math.sin(a) * 11.5, z: Math.cos(a) * 11.5, r: 0.8, h: 5, rot: a });
  }
  // Gateways on the three roads out of the Sanctum: two posts each. The road
  // itself (the line to each zone) passes cleanly between them.
  for (const key of ['sporefield', 'relay', 'vault']) {
    const zn = ZONES[key];
    const d = Math.hypot(zn.x, zn.z);
    for (const side of [-1, 1]) {
      add({ type: 'gatepost', x: (zn.x / d) * 14.6 + (-zn.z / d) * side * 2.05, z: (zn.z / d) * 14.6 + (zn.x / d) * side * 2.05, r: 0.45, h: 5 });
    }
  }
  add({ type: 'console', x: 5.2, z: -4.6, hw: 1.3, hd: 0.6, h: 1.3 });
  add({ type: 'crate', x: -5.5, z: -5.0, hw: 0.8, hd: 0.8, h: 1.2 });
  add({ type: 'crate', x: -7.0, z: -4.2, hw: 0.6, hd: 0.6, h: 0.9 });

  // --- The Sporefield: giant fungal growths ---
  const sf = ZONES.sporefield;
  for (let i = 0; i < 11; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 5 + rnd() * 17;
    const s = 0.8 + rnd() * 1.1;
    add({ type: 'sporetree', x: sf.x + Math.sin(a) * d, z: sf.z + Math.cos(a) * d, r: 0.55 * s, h: 5 * s, s, seed: Math.floor(rnd() * 1e6) });
  }
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 4 + rnd() * 18;
    add({ type: 'pod', x: sf.x + Math.sin(a) * d, z: sf.z + Math.cos(a) * d, r: 0.9, h: 1.4, s: 0.8 + rnd() * 0.6 });
  }

  // --- Derelict Relay: ruined technology ---
  const rl = ZONES.relay;
  add({ type: 'relaytower', x: rl.x + 1, z: rl.z - 1, r: 2.4, h: 14 });
  add({ type: 'wall', x: rl.x - 7, z: rl.z + 9, hw: 5, hd: 0.6, h: 3.2 });
  add({ type: 'wall', x: rl.x + 9, z: rl.z + 8, hw: 3.5, hd: 0.6, h: 2.2 });
  add({ type: 'wall', x: rl.x + 12.5, z: rl.z - 2, hw: 0.6, hd: 5.5, h: 3.6 });
  add({ type: 'wall', x: rl.x - 11, z: rl.z - 5, hw: 0.6, hd: 4, h: 2.6 });
  add({ type: 'wall', x: rl.x - 3, z: rl.z - 11, hw: 4.5, hd: 0.6, h: 1.8 });
  add({ type: 'dish', x: rl.x + 6, z: rl.z - 9, r: 2.2, h: 2.5 });
  add({ type: 'crate', x: rl.x - 5, z: rl.z + 3, hw: 0.9, hd: 0.9, h: 1.3 });

  // --- Resonance Vault: a ring of monoliths open on its south side, facing the Sanctum ---
  const vt = ZONES.vault;
  for (let i = 0; i < 12; i++) {
    if (i === 0 || i === 11) continue; // the gateway
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    add({ type: 'monolith', x: vt.x + Math.sin(a) * 15.5, z: vt.z + Math.cos(a) * 15.5, r: 1.35, h: 7 + ((i * 37) % 5), rot: a });
  }

  // --- The Listening Stone: an obelisk hidden in a rock hollow ---
  const ob = ZONES.obelisk;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    // Leave a gap on the east side so the hollow can be entered.
    if (i === 2) continue;
    add({ type: 'rock', x: ob.x + Math.sin(a) * 7.2, z: ob.z + Math.cos(a) * 7.2, r: 2.6, h: 4.5 + (i % 3) * 1.4, s: 2.6, seed: 500 + i });
  }

  // --- Scatter: rocks, crystal outcrops, conduit trees ---
  const blocked = (x, z, pad) => {
    if (Math.hypot(x, z) > WORLD.radius - 12) return true;
    for (const k of Object.keys(ZONES)) {
      if (k === 'survey' || k === 'sinter' || k === 'deep') continue; // preserve the legacy scatter sequence
      const zn = ZONES[k];
      if (Math.hypot(x - zn.x, z - zn.z) < zn.r + pad) return true;
    }
    return false;
  };
  const scatterStart = props.length;
  let placed = 0;
  let guard = 0;
  while (placed < 46 && guard++ < 2000) {
    const x = (rnd() * 2 - 1) * WORLD.radius;
    const z = (rnd() * 2 - 1) * WORLD.radius;
    if (blocked(x, z, 3)) continue;
    const roll = rnd();
    const s = 0.7 + rnd() * 1.3;
    if (roll < 0.4) add({ type: 'rock', x, z, r: 1.0 * s, h: 1.6 * s, s, seed: Math.floor(rnd() * 1e6) });
    else if (roll < 0.7) add({ type: 'crystal', x, z, r: 0.7 * s, h: 3 * s, s, seed: Math.floor(rnd() * 1e6) });
    else add({ type: 'conduit', x, z, r: 0.5 * s, h: 6 * s, s, seed: Math.floor(rnd() * 1e6) });
    placed++;
  }
  // Replace only old scatter within the cut; keep the original world layout elsewhere.
  const survey = ZONES.survey;
  const sinter = ZONES.sinter;
  const retained = props.slice(0, scatterStart).concat(props.slice(scatterStart).filter(p => [survey, sinter].every(zn => Math.hypot(p.x - zn.x, p.z - zn.z) >= zn.r + 2) && !(Math.abs(p.x - ZONES.deep.x) < 21 && Math.abs(p.z - ZONES.deep.z) < 15)));
  retained.push(
    { type: 'survey_pump', x: 43, z: -39, hw: 2.15, hd: 1.45, h: 4.8 },
    { type: 'survey_tower', x: 51, z: -32, hw: 2.15, hd: 1.45, h: 4.8 },
    { type: 'wall', x: 43, z: -43, hw: 5, hd: 0.6, h: 2.8 },
    { type: 'wall', x: 53, z: -37, hw: 0.6, hd: 3.5, h: 2.4 },
    { type: 'survey_workstation', x: 38, z: -39, hw: 1.15, hd: 0.64, h: 1.8 },
    { type: 'survey_engineering', x: 49, z: -39, hw: 1.1, hd: 0.7, h: 1.8 },
  );
  // Leave the central north-south approach open; no random obstacles in the new bed.
  retained.push(
    { type: 'sinter_ridge', x: -2, z: 54, hw: 2.5, hd: 1.1, h: 2.8, seed: 741 },
    { type: 'sinter_ridge', x: 14, z: 54, hw: 2.0, hd: 1.3, h: 1.9, seed: 742 },
    { type: 'sinter_ridge', x: -4, z: 64, hw: 2.3, hd: 1.5, h: 3.2, seed: 743 },
    { type: 'sinter_ridge', x: 16, z: 62, hw: 1.8, hd: 1.1, h: 2.4, seed: 744 },
    { type: 'sinter_ridge', x: 1, z: 69, hw: 2.1, hd: 1.2, h: 1.6, seed: 745 },
    { type: 'sinter_ridge', x: 12, z: 69, hw: 2.0, hd: 1.0, h: 2.1, seed: 746 },
    { type: 'sinter_colony', x: 9, z: 64, hw: 1.5, hd: 1.25, h: 1.8, seed: 747 },
  );
  // Roof footprint and structural wall colliders share the same dimensions.
  // Only the eastern portal is open; interior vessels do not block the aisle.
  retained.push(
    { type: 'deep_wall', x: DEEP.x, z: DEEP.z - DEEP.hd, hw: DEEP.hw, hd: 0.42, h: DEEP.roofBottom - DEEP.floor },
    { type: 'deep_wall', x: DEEP.x, z: DEEP.z + DEEP.hd, hw: DEEP.hw, hd: 0.42, h: DEEP.roofBottom - DEEP.floor },
    { type: 'deep_wall', x: DEEP.x - DEEP.hw, z: DEEP.z, hw: 0.42, hd: DEEP.hd, h: DEEP.roofBottom - DEEP.floor },
    { type: 'deep_vessel', x: -61.1, z: -12, r: 1.05, h: 2.9, seed: 1701 },
    { type: 'deep_vessel', x: -61.1, z: -4, r: 1.05, h: 2.55, seed: 1702 },
  );
  // Grounded foothill scenery replaces the old non-colliding cliff ring.
  // Independent seed preserves the existing scatter, encounters and lore sites.
  const foothillRng=mulberry32(7347);
  const ringCount=18;
  for(let i=0;i<ringCount;i++){
    const tree=i%3!==2;
    const s=tree?0.46+foothillRng()*0.12:1.45+foothillRng()*0.48;
    const radius=tree?0.85:s;
    const height=tree?15.9*s:1.65*s;
    const seed=Math.floor(foothillRng()*1000000);
    const angle=i/ringCount*Math.PI*2;
    for(let attempt=0;attempt<8;attempt++){
      const a=angle+(foothillRng()-.5)*.28;
      const d=WORLD.radius-13-foothillRng()*7;
      const x=Math.sin(a)*d,z=Math.cos(a)*d;
      const pad=radius+2.5;
      if(Math.hypot(x,z)+radius+1>=WORLD.radius-9)continue;
      if(Object.values(ZONES).some(zone=>Math.hypot(x-zone.x,z-zone.z)<zone.r+pad+3))continue;
      if(retained.some(p=>Math.hypot(x-p.x,z-p.z)<(p.r??Math.hypot(p.hw??0,p.hd??0))+pad))continue;
      const heights=[groundHeight(x,z)];
      for(let k=0;k<8;k++){
        const t=k*Math.PI/4;
        heights.push(groundHeight(x+Math.cos(t)*(radius+.25),z+Math.sin(t)*(radius+.25)));
      }
      if(Math.max(...heights)-Math.min(...heights)>.42)continue;
      retained.push({type:tree?'conduit':'rock',x,z,r:radius,h:height,s,seed,foothill:true});
      break;
    }
  }
  return retained;
}

// Three connected chambers. Offset openings prevent a straight firing lane.
export const ANNEX_PARTITIONS=Object.freeze([
 ...[[12,6],[-9,-6]].flatMap(([z,gap])=>{
  const left=gap-2.7,right=gap+2.7;
  return [[-16,left],[right,16]].map(([a,b])=>Object.freeze({type:'annex_wall',x:RIFT_ANNEX.x+(a+b)/2,z,hw:(b-a)/2,hd:.55,h:4.5}));
 })
]);
export function annexArea(x,z){
 if(!inRiftAnnex(x,z))return null;
 return z>12?'Arrival Gallery':z>-9?'Relay Workshop':'Null Chamber';
}
// Mineral intrusions into the old industrial deck. Their footprints are
// deliberately outside the entry, return and offset bulkhead openings.
export const ANNEX_FORMATIONS=Object.freeze([
  [-13,24,1.45,2.5,81], [12,20,1.65,2.9,82], [-13,14,1.15,1.8,83],
  [-12,8,1.7,2.8,84], [13,1,1.45,2.3,85], [11,-6,1.25,2.1,86],
  [-13,-16,1.65,3.0,87], [13,-20,1.7,3.3,88], [-11,-30,1.35,2.4,89], [11,-31,1.1,1.9,90]
].map(([dx,z,r,h,seed])=>Object.freeze({type:'annex_formation',x:RIFT_ANNEX.x+dx,z,r,h,seed})));
// Ambient Stillpoint marker (presentation only; the living creature has no static collider).
export const STILLPOINT_SITE=Object.freeze({type:'stillpoint_rest',x:8,z:-1.5,r:2,h:1.9,seed:107});
export const PROPS = [...buildProps(),...ANNEX_PARTITIONS,...ANNEX_FORMATIONS,STILLPOINT_SITE,...SEVERANCE_PROPS,...FOUNDRY_COLLIDERS,...FEN_COLLIDERS];
export const COLLIDERS = PROPS.filter((p) => p.type!=='stillpoint_rest' && (p.r !== undefined || p.hw !== undefined));

// Conservative horizontal cover test against the same solid prop footprints
// used for movement. Small ground details and characters are not cover.
// A small endpoint tolerance avoids self-intersections with boundary contact.
export function hasLineOfSight(a, b, obstacles = COLLIDERS) {
  if(!sameTravelRegion(a,b))return false;
  const dx = b.x - a.x, dz = b.z - a.z, len2 = dx*dx + dz*dz;
  if (![a.x,a.z,b.x,b.z].every(Number.isFinite)) return false;
  if (len2 < 1e-10) return true;
  const eps = Math.min(0.01 / Math.sqrt(len2), 0.1);
  for (const o of obstacles) {
    if (o.h !== undefined && o.h < 0.8) continue;
    if (o.r !== undefined) {
      const t = Math.max(eps, Math.min(1-eps, ((o.x-a.x)*dx+(o.z-a.z)*dz)/len2));
      if ((a.x+dx*t-o.x)**2+(a.z+dz*t-o.z)**2 < o.r**2-1e-9) return false;
    } else {
      let lo=eps, hi=1-eps;
      for (const [start,delta,centre,half] of [[a.x,dx,o.x,o.hw],[a.z,dz,o.z,o.hd]]) {
        if (Math.abs(delta)<1e-10) {
          if (start<=centre-half || start>=centre+half) {lo=1;hi=0;break;}
        } else {
          const t1=(centre-half-start)/delta,t2=(centre+half-start)/delta;
          lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));
          if (lo>=hi) break;
        }
      }
      if (lo<hi) return false;
    }
  }
  return true;
}

/** Interactive, non-hostile world objects. The server owns their state. */
export const OBJECTS = [
  {key:'initiation_terminal',type:'initiation_terminal',name:'Arrival orientation terminal',x:INITIATION_SITE.terminalX,z:INITIATION_SITE.terminalZ,r:0,embedded:true},
  {key:'sanctum_fabricator',type:'sanctum_fabricator',name:'Sanctum Precision Fabricator',x:SANCTUM_FABRICATOR.x,z:SANCTUM_FABRICATOR.z,r:0,embedded:true},
  { key: 'obelisk', type: 'obelisk', name: 'The Listening Stone', x: ZONES.obelisk.x, z: ZONES.obelisk.z, r: 1.0 },
  { key: 'archivist', type: 'archivist', name: 'Archivist Venn', x: 4.2, z: -2.6, r: 0.5 },
  { key: 'survey_signal', type: 'survey_signal', name: 'Pressure Receiver', x: 39, z: -32, r: 0.8 },
  { key: 'survey_ledger', type: 'survey_ledger', name: 'Shift Ledger', x: 47, z: -32, r: 0.8 },
  { key: 'brine_research', type: 'brine_research', name: 'A · Research Station', x: 38, z: -39, r: 0, embedded: true },
  { key: 'brine_engineering', type: 'brine_engineering', name: 'B · Engineering Station', x: 49, z: -39, r: 0, embedded: true },
  { key: 'sinter_sampler', type: 'sinter_sampler', name: 'Strata Interferometer', x: -5.2, z: 58.4, r: 0.8 },
  { key: 'deep_console', type: 'deep_console', name: 'Kestrel Phase Recorder', x: -61.5, z: -8, r: 0.8 },
  { key: 'quartermaster', type: 'quartermaster', name: 'Sanctum Quartermaster', x: -5.6, z: -1.8, r: 0.5 },
];

// A small additive site outside established zones. Never delete or relocate
// existing props to make room. Ordered candidates keep placement deterministic.
// Place the Reach thresholds against the inner face of the enclosing ridge.
// Select along the same ~80m contour, not the open plaza. The last 2-3m
// beyond the portal foundation lead directly into the rising mountain wall.
function reachWallCandidates(){
 const out=[];
 for(const radius of [80.4,79.8,79.2,78.6])for(let i=0;i<=48;i++){
  const angle=.66+i*.027;
  out.push([Math.round(Math.sin(angle)*radius*100)/100,Math.round(Math.cos(angle)*radius*100)/100]);
 }
 return out;
}
function wallSiteClear(x,z,spacing=6){
 if(Math.hypot(x,z)>WORLD.radius-11.3)return false;
 if(Object.values(ZONES).some(a=>Math.hypot(x-a.x,z-a.z)<a.r+spacing))return false;
 if([...PROPS,...OBJECTS].some(o=>Math.hypot(x-o.x,z-o.z)<spacing+(o.r??Math.hypot(o.hw??0,o.hd??0))))return false;
 const h=groundHeight(x,z),rad=Math.hypot(x,z),ix=x/rad,iz=z/rad;
 // Verify the walk-in (inward) half, not the intentionally steep wall behind.
 for(const forward of [2.8,5.2])for(const side of [-2.8,0,2.8]){
  const sx=x-ix*forward-iz*side,sz=z-iz*forward+ix*side;
  if(Math.abs(groundHeight(sx,sz)-h)>1.55)return false;
 }
 return true;
}
function findRiftSite(){
 for(const [x,z] of reachWallCandidates())if(wallSiteClear(x,z,5.2))
  return Object.freeze({x,z,r:8.5,hazard:5.5});
 return null;
}

export const RIFT_SITE=findRiftSite();
if(RIFT_SITE){
  const {x,z}=RIFT_SITE;
  OBJECTS.push({key:'phase_scar',type:'phase_scar',name:'Phase Scar',x,z,r:PHASE_RIFT_RADIUS,yaw:Math.atan2(-x,-z)},
    {key:'rift_indexer',type:'rift_indexer',name:'Phase Indexer',x:x-z/Math.hypot(x,z)*6.25,z:z+x/Math.hypot(x,z)*6.25,r:.65},
    {key:'rift_regulator',type:'rift_regulator',name:'Counterphase Regulator',x:x+z/Math.hypot(x,z)*6.25,z:z-x/Math.hypot(x,z)*6.25,r:.65},
    {key:'rift_return',type:'rift_return',name:'Return to the Reach',x:RIFT_ANNEX.x,z:RIFT_ANNEX.exitZ,r:PHASE_RIFT_RADIUS,yaw:Math.PI},
    {key:'annex_cache',type:'annex_cache',name:'Null Chamber Recovery Cache',x:RIFT_ANNEX.x,z:-30,r:.9});
}
// The Severance Gate threshold (inside the passage, at the portal) and the
// approach pocket's return beacon. The threshold is embedded in the gate's own
// collision footprint, so it adds no collider.
OBJECTS.push({key:'severance_gate',type:'severance_gate',name:'Severance Gate',x:GATE_THRESHOLD.x,z:GATE_THRESHOLD.z,r:0,embedded:true},
  {key:'severance_return',type:'severance_return',name:'Return to the Reach',x:SEVERANCE_POCKET.beacon.x,z:SEVERANCE_POCKET.beacon.z,r:PHASE_RIFT_RADIUS,
    yaw:Math.atan2(SEVERANCE_POCKET.arrival.x-SEVERANCE_POCKET.beacon.x,SEVERANCE_POCKET.arrival.z-SEVERANCE_POCKET.beacon.z)});
for (const v of SEVERANCE_VEINS) OBJECTS.push({ key: v.key, type: 'resonant_vein', name: 'Resonant shard vein', x: v.x, z: v.z, r: v.r, yaw: v.yaw });
// The Silent Foundry: its return portal (back to the gate) and the Depths cache.
OBJECTS.push({key:'foundry_return',type:'foundry_return',name:'Return to the Severance Gate',x:SILENT_FOUNDRY.exit.x,z:SILENT_FOUNDRY.exit.z,r:PHASE_RIFT_RADIUS,yaw:Math.PI},
  {key:'foundry_cache',type:'foundry_cache',name:'Depths Recovery Cache',x:SILENT_FOUNDRY.cache.x,z:SILENT_FOUNDRY.cache.z,r:.9},
  // the Null Breach behind the Overseer's ground: the way into the Null Annex (level 13-15)
  {key:'null_breach',type:'null_breach',name:'Null Breach',x:SILENT_FOUNDRY.x-9,z:SILENT_FOUNDRY.z-99,r:PHASE_RIFT_RADIUS,yaw:0});
OBJECTS.push({key:'expedition_quartermaster',type:'expedition_quartermaster',name:'Expedition Quartermaster',x:EXPEDITION_OUTPOST.quartermaster.x,z:EXPEDITION_OUTPOST.quartermaster.z,r:.5,yaw:EXPEDITION_OUTPOST.quartermaster.yaw});
for(const c of EXPEDITION_OUTPOST.crew)OBJECTS.push({key:c.key,type:'outpost_crew',look:c.key,name:c.name,x:c.x,z:c.z,r:.45,yaw:c.yaw});
// Interaction anchor uses the existing terrain-conforming mineral bed. No added collider or duplicate art.
OBJECTS.push({key:'sinter_recovery',type:'sinter_recovery',name:'Loose mineral shedding',x:SINTER_SITES.mineral.x,z:SINTER_SITES.mineral.z,r:0,embedded:true});
// Four Halo Construct wardens stand outside the Sanctum perimeter, one per
// sector between the three roads, facing away from the centre. Positions were
// solved against this module's roads, colliders, objects and ground slope
// (>= 5.9 m from every road centreline, flat ground, nothing within 1.4 m) and
// are appended after the rift-site search so no existing placement moves.
// Yaw follows the game convention (0 faces +Z; forward = (sin yaw, cos yaw)),
// so the outward yaw is the bearing from the centre.
export const SANCTUM_GUARD_RADIUS = 16;
export const SANCTUM_GUARDS = Object.freeze([15, 105, 200, 280].map((deg, i) => {
  const a = deg * Math.PI / 180;
  const x = Math.round((WORLD.sanctum.x + Math.sin(a) * SANCTUM_GUARD_RADIUS) * 1000) / 1000;
  const z = Math.round((WORLD.sanctum.z + Math.cos(a) * SANCTUM_GUARD_RADIUS) * 1000) / 1000;
  return Object.freeze({ key: `sanctum_guard_${i + 1}`, type: 'sanctum_guard', name: 'Sanctum Warden', x, z, r: 0.45,
    yaw: Math.atan2(x - WORLD.sanctum.x, z - WORLD.sanctum.z), variant: i });
}));
OBJECTS.push(...SANCTUM_GUARDS);
// Two independent rifts on the same Reach approach should read as a
// deliberate portal row, not randomly scattered openings. Prefer a second
// rootglass slot directly beside the accepted Phase Scar, with the same Z
// alignment and sufficient room for its Indexer/Regulator and player approach.
// Recompute the shared location for both client and authoritative server.
function findLumenfenEntry(){
 if(!RIFT_SITE)return null;
 // The second gate occupies the same ridge contour at least 14m along it;
 // choosing along the arc keeps both backs against rock, unlike a straight
 // X/Z row whose outer gate would sit far out in the open.
 const r=Math.hypot(RIFT_SITE.x,RIFT_SITE.z),base=Math.atan2(RIFT_SITE.x,RIFT_SITE.z);
 for(const step of [.21,-.21,.24,-.24,.28,-.28,.32,-.32,.38,-.38]){
  const a=base+step,x=Math.round(r*Math.sin(a)*100)/100,z=Math.round(r*Math.cos(a)*100)/100;
  if(wallSiteClear(x,z,5.0)&&Math.hypot(x-RIFT_SITE.x,z-RIFT_SITE.z)>13.3)
   return Object.freeze({x,z});
 }
 return null;
}

export const LUMENFEN_ENTRY_SITE=findLumenfenEntry();
if(LUMENFEN_ENTRY_SITE){
 OBJECTS.push({key:'lumenfen_entry',type:'lumenfen_entry',name:'Rootglass Tear',...LUMENFEN_ENTRY_SITE,r:PHASE_RIFT_RADIUS,yaw:Math.atan2(-LUMENFEN_ENTRY_SITE.x,-LUMENFEN_ENTRY_SITE.z)});
 OBJECTS.push(...FEN_RIFTS);
}
const STATIC_COLLIDERS = COLLIDERS.concat(OBJECTS.filter(o => !o.embedded).map((o) => ({ x: o.x, z: o.z, r: o.r })));
const DEEP_WALLS = COLLIDERS.filter(p => p.type === 'deep_wall'||p.type==='annex_wall');

/** Exact segment/rectangle test limited to the new enclosed research deck.
 * Old outdoor obstacles retain their existing planar combat semantics.
 */
export function deepLineClear(a, b) {
  if(!sameTravelRegion(a,b))return false;
  for (const c of DEEP_WALLS) {
    let lo = 0, hi = 1;
    for (const [origin, delta, min, max] of [
      [a.x, b.x-a.x, c.x-c.hw, c.x+c.hw],
      [a.z, b.z-a.z, c.z-c.hd, c.z+c.hd],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (origin < min || origin > max) { lo = 1; hi = 0; break; }
      } else {
        const t0 = (min-origin)/delta, t1 = (max-origin)/delta;
        lo = Math.max(lo, Math.min(t0,t1));
        hi = Math.min(hi, Math.max(t0,t1));
        if (lo > hi) break;
      }
    }
    if (lo <= hi) return false;
  }
  return true;
}

/**
 * Push a circle of radius `rad` out of all static colliders and keep it inside
 * the world. Mutates and returns `p` ({x, z}).
 */
export function resolveCollisions(p, rad) {
  const annex=inRiftAnnex(p.x,p.z,4),a=RIFT_ANNEX,pocket=!annex&&inSeverancePocket(p.x,p.z,4),foundry=!annex&&!pocket&&inSilentFoundry(p.x,p.z,4),fen=!annex&&!pocket&&!foundry&&inLumenfen(p.x,p.z,4);
  if(pocket)clampToPocket(p,rad);
  if(foundry)clampToFoundry(p,rad);
  if(fen)clampToLumenfen(p,rad);
  const clampAnnex=()=>{p.x=Math.max(a.x-a.hw+rad,Math.min(a.x+a.hw-rad,p.x));p.z=Math.max(a.z-a.hd+rad,Math.min(a.z+a.hd-rad,p.z));};
  if(annex)clampAnnex();
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < STATIC_COLLIDERS.length; i++) {
      const c = STATIC_COLLIDERS[i];
      if (c.r !== undefined) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const min = c.r + rad;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2);
          if (d < 1e-6) {
            p.x = c.x + min;
          } else {
            p.x = c.x + (dx / d) * min;
            p.z = c.z + (dz / d) * min;
          }
        }
      } else {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const cx = dx < -c.hw ? -c.hw : dx > c.hw ? c.hw : dx;
        const cz = dz < -c.hd ? -c.hd : dz > c.hd ? c.hd : dz;
        const ox = dx - cx;
        const oz = dz - cz;
        const d2 = ox * ox + oz * oz;
        if (d2 < rad * rad) {
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            p.x = c.x + cx + (ox / d) * rad;
            p.z = c.z + cz + (oz / d) * rad;
          } else {
            // Centre is inside the box: exit through the nearest face.
            const px = c.hw - Math.abs(dx);
            const pz = c.hd - Math.abs(dz);
            const outX=c.x+(dx<0?-1:1)*(c.hw+rad);
            // A bulkhead ends at the region boundary: an outward x correction
            // would be clamped back into the wall. Resolve toward its z face.
            if(px<pz&&(!annex||outX>=a.x-a.hw+rad&&outX<=a.x+a.hw-rad))p.x=outX;
            else p.z=c.z+(dz<0?-1:1)*(c.hd+rad);
          }
        }
      }
    }
  }
  if(annex){clampAnnex();return p;}
  if(pocket){clampToPocket(p,rad);return p;}
  if(foundry){clampToFoundry(p,rad);return p;}
  if(fen){clampToLumenfen(p,rad);return p;}
  const lim = WORLD.radius - 6;
  const r = Math.hypot(p.x, p.z);
  if (r > lim) {
    p.x = (p.x / r) * lim;
    p.z = (p.z / r) * lim;
  }
  return p;
}

/**
 * Advance one fixed movement step. `s` is {x, z, jy, vy}; `inp` is
 * {f, s, yaw, j} where f/s are -1..1 forward/strafe intents in character
 * space. `speedMul` of 0 means the character cannot move (rooted / dead).
 * Yaw 0 faces +Z; forward = (sin yaw, cos yaw); right = (-cos yaw, sin yaw).
 */
export function stepMove(s, inp, speedMul) {
  let f = inp.f;
  let st = inp.s;
  const len = Math.hypot(f, st);
  if (len > 1) {
    f /= len;
    st /= len;
  }
  if (speedMul > 0 && len > 0) {
    const speed = RUN_SPEED * speedMul * (f < 0 ? BACK_SPEED_MUL : 1);
    const sin = Math.sin(inp.yaw);
    const cos = Math.cos(inp.yaw);
    s.x += (sin * f - cos * st) * speed * MOVE_DT;
    s.z += (cos * f + sin * st) * speed * MOVE_DT;
    resolveCollisions(s, PLAYER_RADIUS);
  }
  if (s.jy > 0 || s.vy > 0) {
    s.vy -= GRAVITY * MOVE_DT;
    s.jy += s.vy * MOVE_DT;
    if (s.jy <= 0) {
      s.jy = 0;
      s.vy = 0;
    }
  } else if (inp.j && speedMul > 0) {
    s.vy = JUMP_VELOCITY;
    s.jy = s.vy * MOVE_DT;
  }
  return s;
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function inSanctum(p) {
  return Math.hypot(p.x - WORLD.sanctum.x, p.z - WORLD.sanctum.z) < WORLD.sanctum.r;
}
/** Safe zones: no hostile damage or aggro, faster recovery (Sanctum, Expedition Outpost). */
export function inSafeZone(p) {
  return inSanctum(p) || inExpeditionOutpost(p);
}

export function zoneAt(x, z) {
  if(inRiftAnnex(x,z,2))return annexArea(x,z)?RIFT_ANNEX.name+' · '+annexArea(x,z):RIFT_ANNEX.name;
  if(inSilentFoundry(x,z,2))return foundryArea(x,z)?SILENT_FOUNDRY.name+' · '+foundryArea(x,z):SILENT_FOUNDRY.name;
  if(inSeverancePocket(x,z,2))return SEVERANCE_POCKET.name+' · '+pocketArea(x,z);
  if(inLumenfen(x,z,2))return LUMENFEN.name+' · '+fenArea(x,z);
  for (const k of Object.keys(ZONES)) {
    const zn = ZONES[k];
    if (Math.hypot(x - zn.x, z - zn.z) < zn.r) return zn.name;
  }
  if(RIFT_SITE&&Math.hypot(x-RIFT_SITE.x,z-RIFT_SITE.z)<RIFT_SITE.r)return 'The Phase Scar';
  return WORLD.name;
}
