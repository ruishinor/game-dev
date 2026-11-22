// Enemy behaviour: idle wander, aggro, threat-based targeting, chase,
// attacks, telegraphed specials, leashing and respawn.

import { levelHpMul } from './enemy-levels.js';
import { ENEMIES } from '../../shared/content.js';
import { dist, inSanctum, inSafeZone, resolveCollisions, hasLineOfSight, sinterSiteAt, sameTravelRegion } from '../../shared/world.js';
import { addThreat, dealDamage, expireBuffs, getBuff } from './combat.js';
import {COMBAT_LINGER_MS} from './game.js';
import {resetWildlife,cancelWildHunt,tickWildPredator,tickWildHerd} from './sinter-wildlife.js';

// Long patrols leash to the point where they broke off their route (their
// post), not to the route's start; static enemies and short circuits use home.
const anchorOf = (e) => (e.patrol && e.post) ? e.post : e.home;

// The humanoid locomotion controller enters its jog cycle above 2.2 m/s.
// Keep idle Severance infantry below it, while allowing measured catch-up
// in formation and normal full-speed pursuit once combat begins.
export const SOLDIER_WALK_SPEED = Object.freeze({ patrol: 1.8, follow: 2.05 });

/** Max HP at no encounter scaling: the type's, scaled by levels above its base and a per-instance elite multiplier. */
export function baseHp(e) {
  return Math.round(ENEMIES[e.type].hp * levelHpMul(e) * (e.elite?.hp ?? 1));
}

export function resetEnemy(game, e) {
  const def = ENEMIES[e.type];
  e.x = e.home.x;
  e.z = e.home.z;
  e.yaw = e.yaw ?? (e.route ? Math.atan2(e.route[1].x - e.home.x, e.route[1].z - e.home.z) : game.rng() * Math.PI * 2);
  e.hp = baseHp(e);
  e.maxHp = e.hp;
  e.scale = 1;
  e.state = 'idle';
  e.threat = new Map();
  e.target = 0;
  e.fixate = null;
  e.buffs = [];
  e.cast = null;
  e.basicWindup = null;
  e.nextAttack = 0;
  e.specialAt = {};
  e.deadAt = 0;
  e.respawnAt = 0;
  e.lootByPlayer=null;
  e.wanderAt = e.route ? game.time : game.time + 2000 + game.rng() * 5000;
  e.routeIndex = 1;
  e.ecologyMode = 'travel';
  e.routeLaps = 0;
  e.grown = false;
  e.mineralDose=0;e.calcified=false;e.scarred=false;
  e.alarmUntil = 0;
  e.alarmFrom = null;
  e.alarmKind = null;
  e.wildAlarmAt = 0;
  e.callUntil = 0;
  e.wander = null;
  e.steerUntil = 0;
  e.post = e.patrol ? { x: e.home.x, z: e.home.z } : null;
  e.steerSign = 1;
  e.progressAt = 0;
  e.progressDist = Infinity;
  e.evadeSince = 0;
  if(e.form||e.type==='faultstalker')resetWildlife(e,game.time);
}

function moveToward(e, tx, tz, step, radius, steer) {
  let dx = tx - e.x;
  let dz = tz - e.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return 0;
  dx /= d;
  dz /= d;
  if (steer) {
    // Sidestep around whatever is blocking the direct path.
    const px = -dz * steer;
    const pz = dx * steer;
    dx = dx + px * 1.6;
    dz = dz + pz * 1.6;
    const n = Math.hypot(dx, dz);
    dx /= n;
    dz /= n;
  }
  const s = Math.min(step, d);
  e.x += dx * s;
  e.z += dz * s;
  resolveCollisions(e, radius);
  e.yaw = Math.atan2(dx, dz);
  return s;
}

/** Another member of e's squad is alive and in combat. */
function squadFighting(game, e) {
  const lead = e.lead ? game.ents.get(e.lead) : e;
  for (const id of lead?.squad || []) {
    if (id === e.id) continue;
    const o = game.ents.get(id);
    if (o && o.state === 'combat' && o.hp > 0) return true;
  }
  return false;
}

function tickFollower(game, e, def, dt) {
  const lead = game.ents.get(e.lead);
  if (!lead || lead.state !== 'idle' || lead.threat?.size) return false;
  const s = Math.sin(lead.yaw || 0), c = Math.cos(lead.yaw || 0);
  const tx = lead.x + e.slot.side * c + e.slot.back * s, tz = lead.z - e.slot.side * s + e.slot.back * c;
  const d = Math.hypot(tx - e.x, tz - e.z);
  if (d > 40) return false;
  if (d > 0.25) {
    const speed = def.speed * Math.min(0.95, 0.5 + 0.15 * d);
    const walk = e.severancePatrol && e.type === 'severance_soldier' ? Math.min(speed, SOLDIER_WALK_SPEED.follow) : speed;
    moveToward(e, tx, tz, walk * dt, def.radius, 0);
  }
  else e.yaw = lead.yaw;
  if (e.patrol) e.post = { x: e.x, z: e.z };
  return true;
}

function startEvade(game, e) {
  e.state = 'evade';
  e.threat.clear();
  e.fixate = null;
  e.target = 0;
  e.cast = null;
  e.basicWindup = null;
  e.buffs = [];
  e.evadeSince = game.time;
  if(e.form||e.type==='faultstalker')resetWildlife(e,game.time);
}

function pickTarget(game, e) {
  if (e.fixate) {
    const f = game.players.get(e.fixate.id);
    if (f && !f.dead && game.time < e.fixate.until && e.threat.has(f.id)) return f;
    e.fixate = null;
  }
  let best = null;
  let bestThreat = -1;
  for (const [id, threat] of e.threat) {
    const p = game.players.get(id);
    if (!p) continue;
    // The current target is sticky: a challenger needs 10% more threat.
    const eff = id === e.target ? threat * 1.1 : threat;
    if (eff > bestThreat) {
      bestThreat = eff;
      best = p;
    }
  }
  return best;
}

// Elite and scripted encounters retain their authored auto and special cadence.
// Basic committed-facing warnings apply to ordinary melee enemies only.
function telegraphsOrdinaryMelee(e, def) {
  return def.attack.kind === 'melee' && !def.elite && !e.elite &&
    !(e.specials || def.specials || []).length;
}

function beginSpecial(game, e, sp, target) {
  const at = sp.at === 'target' ? { x: target.x, z: target.z } : { x: e.x, z: e.z };
  e.cast = { sp, until: game.time + sp.windup, x: at.x, z: at.z };
  e.specialAt[sp.id] = game.time + sp.cd;
  game.emitWorldEvent({ e: 'tele', id: e.id, k: sp.id, n: sp.name, x: at.x, z: at.z, r: sp.radius, ms: sp.windup, g: sp.at === 'all' ? 0 : 1 });
}

function resolveSpecial(game, e) {
  const { sp, x, z } = e.cast;
  e.cast = null;
  game.emitWorldEvent({ e: 'fx', k: sp.id, s: e.id, x, z, r: sp.radius });
  for (const p of [...game.players.values()]) {
    if (p.dead) continue;
    if (sp.at === 'all') {
      if (e.threat.has(p.id) && dist(e, p) <= sp.radius && hasLineOfSight(e,p)) dealDamage(game, e, p, sp.dmg, sp.id);
    } else if (Math.hypot(p.x - x, p.z - z) <= sp.radius + p.radius * 0.5 && hasLineOfSight({x,z},p)) {
      dealDamage(game, e, p, sp.dmg, sp.id,{origin:{x,z}});
    }
  }
}

export function tickEnemy(game, e, dt) {
  const def = ENEMIES[e.type];

  if (e.state === 'dead') {
    if (game.time >= e.respawnAt) {
      e.yaw = undefined;
      resetEnemy(game, e);
      game.emitWorldEvent({ e: 'fx', k: 'spawn', s: e.id });
    }
    return;
  }

  if (e.state === 'evade') {
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.5 * dt);
    const anchor = anchorOf(e);
    const d = dist(e, anchor);
    if (d < 0.6 || game.time - e.evadeSince > 7000) {
      e.x = anchor.x;
      e.z = anchor.z;
      e.scale = 1;
      e.maxHp = baseHp(e);
      e.hp = e.maxHp;
      e.state = 'idle';
      e.wanderAt = game.time + 3000;
      if (!e.patrol) e.routeIndex = 1;      // a patrol resumes its route where it left it
    } else {
      moveToward(e, anchor.x, anchor.z, def.speed * 2.2 * dt, def.radius, 0);
    }
    return;
  }

  expireBuffs(game, e);

  // Passive fauna retaliate normally but never initiate proximity aggro.
  for (const p of game.players.values()) {
    if (def.aggro <= 0) break;
    if (p.dead || e.threat.has(p.id) || inSafeZone(p)) continue;
    if (dist(e, p) <= def.aggro && dist(p, anchorOf(e)) <= def.leash && hasLineOfSight(e,p)) {
      addThreat(e, p.id, 1);
      if (def.social) {
        for (const o of game.enemies) {
          if (o !== e && o.type === e.type && (o.state === 'idle' || o.state === 'combat') && dist(o, e) <= def.social) {
            if (!o.threat.has(p.id)) addThreat(o, p.id, 1);
          }
        }
      }
    }
  }

  // Forget players who died, left, or reached safety.
  for (const id of [...e.threat.keys()]) {
    const p = game.players.get(id);
    if (!p || p.dead || !sameTravelRegion(e,p) || inSafeZone(p) || (e.type==='quarantine_custodian' && !hasLineOfSight(e,p))) e.threat.delete(id);
  }

  if (e.threat.size === 0) {
    if (e.state === 'combat') {
      startEvade(game, e);
      return;
    }
    if(tickWildPredator(game,e,dt)||tickWildHerd(game,e,dt))return;
    // Wildlife reacts to a nearby living, unengaged predator without
    // granting combat threat, damage or XP. A cooldown preserves migration.
    if(e.form&&e.alarmUntil<=game.time&&game.time>=e.wildAlarmAt){
      const stalker=game.enemies.find(o=>o.type==='faultstalker'&&o.state==='idle'&&dist(e,o)<4.8);
      if(stalker){
        e.wildAlarmAt=game.time+22000;
        e.alarmUntil=game.time+(e.form==='shieldback'?1700:2800);
        e.alarmFrom={x:stalker.x,z:stalker.z};
        e.alarmKind='predator';
      }
    }
    // A nearby threat causes non-defending, unengaged herd members to
    // scatter temporarily. Selection and player proximity never trigger it.
    if (e.form && e.alarmUntil > game.time && e.alarmFrom) {
      if(e.form==='shieldback'&&e.alarmKind==='predator'){
        e.ecologyMode='brace';
        e.yaw=Math.atan2(e.alarmFrom.x-e.x,e.alarmFrom.z-e.z);
        return;
      }
      e.ecologyMode = 'scatter';
      const dx=e.x-e.alarmFrom.x, dz=e.z-e.alarmFrom.z;
      const len=Math.hypot(dx,dz)||1;
      const tx=e.x+dx/len*3, tz=e.z+dz/len*3;
      // Flee locally; do not leave the biome or cross an obstacle.
      if (Math.hypot(tx-6,tz-58)<14.5) moveToward(e,tx,tz,def.speed*0.85*dt,def.radius,0);
      return;
    }
    // Squad followers hold their wedge slot behind a sergeant who is on its
    // route; with the sergeant down, engaged or far away they walk the route.
    if (e.lead && tickFollower(game, e, def, dt)) return;
    // Authored migration circuits run in real simulation time.
    if (e.route) {
      if (game.time < e.wanderAt) {
        if(e.form){
          const site=sinterSiteAt(e);
          e.ecologyMode=site==='nursery'?'rest':'forage';
          if(site==='mineral'){
            e.mineralDose+=dt;
            if(e.form==='adult'&&e.grown&&!e.calcified&&e.mineralDose>=14){
              e.calcified=true;
              game.emitWorldEvent({e:'fx',k:'sinter_molt',s:e.id});
            }
          }
        }
        if(e.type==='faultstalker')e.ecologyMode='watch';
        return;
      }
      const waypoint = e.route[e.routeIndex];
      const ox = e.x, oz = e.z;
      if (e.patrol) e.post = { x: e.x, z: e.z };
      const pace = e.form === 'juvenile' ? 0.61 : e.form === 'shieldback' ? 0.38 : 0.47;
      if(e.form)e.ecologyMode='travel';
      const stalking=e.type==='faultstalker';
      if(stalking)e.ecologyMode='stalk';
      const routeSpeed = def.speed * (def.neutral ? pace : stalking ? (e.routeIndex%3===0?0.37:0.56) : 0.56);
      const walkSpeed = e.severancePatrol && e.type === 'severance_soldier' ? Math.min(routeSpeed, SOLDIER_WALK_SPEED.patrol) : routeSpeed;
      moveToward(e, waypoint.x, waypoint.z, walkSpeed * dt, def.radius, 0);
      if(e.form){
        // Soft local spacing, with collision re-resolution. No global
        // flocking or RNG consumption; it affects only the three grazers.
        for(const other of game.enemies){
          if(other===e||!other.form||other.state==='dead')continue;
          const dx=e.x-other.x,dz=e.z-other.z,d=Math.hypot(dx,dz);
          if(d>1e-5&&d<1.85){
            const push=Math.min(def.speed*dt,(1.85-d)*0.5);
            e.x+=dx/d*push;e.z+=dz/d*push;
            resolveCollisions(e,def.radius);
          }
        }
      }
      if (dist(e, waypoint) < 0.30 || (dt > 0 && Math.hypot(e.x - ox, e.z - oz) < 1e-5)) {
        e.routeIndex = (e.routeIndex + 1) % e.route.length;
        if(e.form){
          if(e.routeIndex===1){
            e.routeLaps++;
            if(!e.grown&&e.routeLaps>=2){e.grown=true;game.emitWorldEvent({e:'fx',k:'sinter_molt',s:e.id});}
          }
          // Distinct feeding intervals, long circuits, no per-frame random roll.
          if(e.routeIndex%3===0){
            const site=sinterSiteAt(e);
            const pause=e.form==='juvenile'?1600:e.form==='shieldback'?4200:2700;
            // Long sheltered rest; adapted adults process deposits faster.
            e.wanderAt=game.time+pause+(site==='nursery'?1000:site==='mineral'&&!e.calcified?1700:0);
          }
        }else if(stalking&&e.routeIndex%3===0)e.wanderAt=game.time+2000;
      }
      return;
    }
    // Idle: amble around the spawn point.
    if (e.wander) {
      const moved = moveToward(e, e.wander.x, e.wander.z, def.speed * 0.35 * dt, def.radius, 0);
      if (moved < 1e-3 || dist(e, e.wander) < 0.3 || game.time > e.wander.until) e.wander = null;
    } else if (game.time >= e.wanderAt && !def.elite && !e.elite) {
      const a = game.rng() * Math.PI * 2;
      const r = 1.5 + game.rng() * 3.5;
      e.wander = { x: e.home.x + Math.sin(a) * r, z: e.home.z + Math.cos(a) * r, until: game.time + 5000 };
      e.wanderAt = game.time + 5000 + game.rng() * 6000;
    }
    return;
  }

  // Player combat supersedes autonomous wildlife activity immediately.
  if(e.type==='faultstalker')cancelWildHunt(game,e);
  if(e.form)e.wildWound=0;
  if (dist(e, anchorOf(e)) > def.leash) {
    startEvade(game, e);
    return;
  }

  const target = pickTarget(game, e);
  if (!target) {
    startEvade(game, e);
    return;
  }
  if (e.state !== 'combat') {
    e.state = 'combat';
    e.wander = null;
    // Open the first warned swing immediately so the actual contact lands at
    // the original ~400 ms engagement point, rather than appending a full
    // windup to the prior opening delay.
    e.nextAttack = game.time + (telegraphsOrdinaryMelee(e, def) ? 0 : 400);
    for (const sp of e.specials || def.specials || []) e.specialAt[sp.id] = game.time + sp.first;
    e.progressAt = game.time + 1200;
    e.progressDist = Infinity;
  }
  e.target = target.id;
  // An actively pursuing melee attacker is combat pressure even before its
  // telegraphed first contact. Otherwise passive out-of-combat regeneration
  // heals a low-HP target during the new windup and changes lethal outcomes.
  if(def.attack.kind==='melee')
    target.combatUntil=Math.max(target.combatUntil||0,game.time+COMBAT_LINGER_MS);
  if(e.form)e.ecologyMode=e.form==='shieldback'?'defend':'retaliate';
  if(e.type==='faultstalker')e.ecologyMode='hunt';

  // Encounter scaling: tougher for every extra player who joins the fight.
  if (def.perPlayer) {
    const scale = 1 + def.perPlayer * (e.threat.size - 1);
    if (scale > e.scale) {
      const ratio = e.hp / e.maxHp;
      e.scale = scale;
      e.maxHp = Math.round(baseHp(e) * scale);
      e.hp = e.maxHp * ratio;
    }
  }

  if (e.cast) {
    if (game.time >= e.cast.until) {
      resolveSpecial(game, e);
      e.nextAttack = Math.max(e.nextAttack, game.time + 700);
    }
    return;
  }

  // A basic melee attack now has a committed, readable server-owned windup.
  // It cannot track the player throughout the warning or hit through cover.
  if(e.basicWindup){
    const w=e.basicWindup;
    if(game.time<w.until)return;
    e.basicWindup=null;
    // The next attack was scheduled when the swing began; adding another
    // interval on contact would reduce encounter DPS and break boss pacing.
    const victim=game.players.get(w.targetId);
    if(victim&&!victim.dead&&!inSafeZone(victim)&&sameTravelRegion(e,victim)&&
      dist(e,victim)-victim.radius-e.radius*.5<=def.attack.range&&hasLineOfSight(e,victim)){
      const dx=victim.x-e.x,dz=victim.z-e.z,len=Math.hypot(dx,dz);
      const facing=len<.001||(Math.sin(w.yaw)*dx+Math.cos(w.yaw)*dz)/len>=.14;
      if(facing)dealDamage(game,e,victim,def.attack.dmg,'auto',{kind:'melee',melee:true});
    }
    return;
  }

  for (const sp of e.specials || def.specials || []) {
    if (game.time >= e.specialAt[sp.id] && hasLineOfSight(e,target)) {
      beginSpecial(game, e, sp, target);
      return;
    }
  }

  const gap = dist(e, target) - target.radius - (def.attack.kind === 'melee' ? e.radius * 0.5 : 0);
  // a squad sergeant hangs back behind its soldiers while any of them still fights
  const holdBack = e.rearguard && squadFighting(game, e);
  const stopAt = holdBack ? 4.2 : def.attack.range * (def.attack.kind === 'melee' ? 0.7 : 0.8);
  const rooted = !!getBuff(e, 'root');
  const blocked = !hasLineOfSight(e,target);
  if ((gap > stopAt || blocked) && !rooted) {
    // Detect being stuck behind an obstacle and steer around it.
    if (game.time >= e.progressAt) {
      if (gap > e.progressDist - 0.4) {
        e.steerUntil = game.time + 1400;
        e.steerSign = -e.steerSign;
      }
      e.progressDist = gap;
      e.progressAt = game.time + 1000;
    }
    const steer = game.time < e.steerUntil ? e.steerSign : 0;
    moveToward(e, target.x, target.z, blocked ? def.speed * dt : Math.min(def.speed * dt, gap - stopAt + 0.05), def.radius, steer);
  } else {
    e.progressAt = game.time + 1000;
    e.progressDist = Infinity;
  }
  e.yaw = Math.atan2(target.x - e.x, target.z - e.z);

  // Keep enemies from stacking on one spot.
  for (const o of game.enemies) {
    if (o === e || o.state !== 'combat') continue;
    const dx = e.x - o.x;
    const dz = e.z - o.z;
    const min = e.radius + o.radius;
    const d = Math.hypot(dx, dz);
    if (d < min && d > 1e-3 && !rooted) {
      const push = (min - d) * 0.5;
      e.x += (dx / d) * push;
      e.z += (dz / d) * push;
    }
  }

  const reach = dist(e, target) - target.radius - (def.attack.kind === 'melee' ? e.radius * 0.5 : 0);
  if (reach <= def.attack.range && game.time >= e.nextAttack && hasLineOfSight(e,target)) {
    if(telegraphsOrdinaryMelee(e,def)){
      const windup=Math.max(390,Math.min(610,Math.round(def.attack.interval*.42)));
      e.basicWindup={targetId:target.id,yaw:e.yaw,until:game.time+windup};
      // Retain the original start-to-start cadence: the windup is part of
      // the interval rather than an additional unbalanced recovery delay.
      e.nextAttack=game.time+def.attack.interval;
      // Existing event/render paths already support bounded enemy warnings.
      // This is a frontal weapon swing, NOT a ground AoE; don't draw a false hazard circle.
      game.emitWorldEvent({e:'tele',id:e.id,k:'basic_melee',n:'Incoming melee strike',x:e.x,z:e.z,r:Math.min(2.2,def.attack.range),ms:windup,g:0});
    }else{
      e.nextAttack=game.time+def.attack.interval;
      dealDamage(game,e,target,def.attack.dmg,'auto',{kind:def.attack.kind,melee:def.attack.kind==='melee'});
    }
  } else if (def.attack.far && reach > def.attack.range && reach <= def.attack.far.range && game.time >= e.nextAttack + 600 && hasLineOfSight(e,target)) {
    // Elites punish kiting with a slower ranged strike.
    e.nextAttack = game.time + def.attack.far.interval;
    dealDamage(game, e, target, def.attack.far.dmg, 'hurl', { kind: 'bolt' });
  }
}
