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

export const WORLD = {
  name: 'The Verdigris Reach',
  radius: 92,
  sanctum: { x: 0, z: 0, r: 13 },
  spawn: { x: 0, z: 7.5 },
};

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

export const PROPS = buildProps();
export const COLLIDERS = PROPS.filter((p) => p.r !== undefined || p.hw !== undefined);

// Conservative horizontal cover test against the same solid prop footprints
// used for movement. Small ground details and characters are not cover.
// A small endpoint tolerance avoids self-intersections with boundary contact.
export function hasLineOfSight(a, b, obstacles = COLLIDERS) {
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
function findRiftSite(){
  const preferred=[[30,46],[30,50],[34,48],[28,44],[32,52],[34,44]];
  for(let z=40;z<=66;z+=2)for(let x=22;x<=58;x+=2)preferred.push([x,z]);
  for(const [x,z] of preferred){
    if(Math.hypot(x,z)>WORLD.radius-16)continue;
    if(Object.values(ZONES).some(a=>Math.hypot(x-a.x,z-a.z)<a.r+8.6))continue;
    if([...PROPS,...OBJECTS].some(o=>Math.hypot(x-o.x,z-o.z)<8.6+(o.r??Math.hypot(o.hw??0,o.hd??0))))continue;
    const h=groundHeight(x,z),samples=[h];
    for(let i=0;i<20;i++){const a=i*Math.PI/10;for(const rad of [2.2,6.2])samples.push(groundHeight(x+Math.cos(a)*rad,z+Math.sin(a)*rad));}
    if(Math.max(...samples)-Math.min(...samples)>1.55)continue;
    return Object.freeze({x,z,r:8.5,hazard:5.5});
  }
  return null;
}
export const RIFT_SITE=findRiftSite();
if(RIFT_SITE){
  const {x,z}=RIFT_SITE;
  OBJECTS.push({key:'phase_scar',type:'phase_scar',name:'Phase Scar',x,z,r:2.45},
    {key:'rift_indexer',type:'rift_indexer',name:'Phase Indexer',x:x-6.25,z,r:.65},
    {key:'rift_regulator',type:'rift_regulator',name:'Counterphase Regulator',x:x+6.25,z,r:.65});
}
// Interaction anchor uses the existing terrain-conforming mineral bed. No added collider or duplicate art.
OBJECTS.push({key:'sinter_recovery',type:'sinter_recovery',name:'Loose mineral shedding',x:SINTER_SITES.mineral.x,z:SINTER_SITES.mineral.z,r:0,embedded:true});
const STATIC_COLLIDERS = COLLIDERS.concat(OBJECTS.filter(o => !o.embedded).map((o) => ({ x: o.x, z: o.z, r: o.r })));
const DEEP_WALLS = COLLIDERS.filter(p => p.type === 'deep_wall');

/** Exact segment/rectangle test limited to the new enclosed research deck.
 * Old outdoor obstacles retain their existing planar combat semantics.
 */
export function deepLineClear(a, b) {
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
            if (px < pz) p.x = c.x + (dx < 0 ? -1 : 1) * (c.hw + rad);
            else p.z = c.z + (dz < 0 ? -1 : 1) * (c.hd + rad);
          }
        }
      }
    }
  }
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

export function zoneAt(x, z) {
  for (const k of Object.keys(ZONES)) {
    const zn = ZONES[k];
    if (Math.hypot(x - zn.x, z - zn.z) < zn.r) return zn.name;
  }
  if(RIFT_SITE&&Math.hypot(x-RIFT_SITE.x,z-RIFT_SITE.z)<RIFT_SITE.r)return 'The Phase Scar';
  return WORLD.name;
}
