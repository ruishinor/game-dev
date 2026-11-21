// Owner-only, server-authorized character preview. Never send the allowlist
// or a privilege flag to a client. No grant exists without server configuration.
import { MAX_LEVEL } from '../shared/content.js';
import { WORLD, ZONES, RIFT_SITE, RIFT_ANNEX, PLAYER_RADIUS, resolveCollisions, travelRegionAt } from '../shared/world.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const deny = reason => ({ ok: false, reason });

export function gmIds(value = '') {
  return new Set((typeof value === 'string' ? value : '').split(',')
    .map(id => id.trim().toLowerCase()).filter(id => UUID.test(id)));
}

// Check the *current* authenticated session, persisted character owner,
// active simulation entity and exclusive character socket for every command.
export function gmAuthorized(conn, ids, store, sessions, game) {
  if (!(ids instanceof Set) || !conn?.account || !conn?.accountToken || !conn?.char || !conn?.player) return false;
  const account = store?.authenticateAccount(conn.accountToken);
  return account === conn.account &&
    ids.has(account.id.toLowerCase()) &&
    conn.char.accountId === account.id &&
    store.chars.get(conn.char.id) === conn.char &&
    conn.player.char === conn.char &&
    game?.players.get(conn.player.id) === conn.player &&
    sessions?.get(conn.char.id) === conn;
}

// Only existing main-branch locations. In particular, preview teleport never
// starts a shared Expanse, Annex or Foundry encounter.
const destinations = Object.freeze({
  reach: () => ({ ...WORLD.spawn }),
  scar: () => RIFT_SITE ? { x: RIFT_SITE.x, z: RIFT_SITE.z + 3.6 } : null,
  sporefield: () => ({ x: ZONES.sporefield.x, z: ZONES.sporefield.z }),
  relay: () => ({ x: ZONES.relay.x, z: ZONES.relay.z }),
  sinter: () => ({ x: ZONES.sinter.x, z: ZONES.sinter.z }),
  annex: () => ({ x: RIFT_ANNEX.x, z: RIFT_ANNEX.arrivalZ }),
});

export const GM_HELP = 'GM preview: /gm help, /gm status, /gm level 1–' + MAX_LEVEL +
  ', /gm tp reach|scar|sporefield|relay|sinter|annex, /gm unlock, /gm heal, /gm god on|off.';

function destinationFor(name) {
  const raw = Object.hasOwn(destinations, name) ? destinations[name]() : null;
  if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.z)) return null;
  const intended = name === 'annex' ? 'phase_annex' : 'reach';
  if (travelRegionAt(raw.x, raw.z) !== intended) return null;
  const resolved = resolveCollisions({ ...raw }, PLAYER_RADIUS);
  if (!Number.isFinite(resolved.x) || !Number.isFinite(resolved.z) ||
      travelRegionAt(resolved.x, resolved.z) !== intended ||
      Math.hypot(resolved.x - raw.x, resolved.z - raw.z) > 8) return null;
  return resolved;
}

// This function is called only after gmAuthorized in the WebSocket dispatcher.
export function executeGm(game, p, line) {
  if (typeof line !== 'string' || line.length > 120 || /[\u0000-\u001f\u007f]/.test(line) || !p?.char)
    return deny('Invalid GM request.');
  const parts = line.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length || (parts[0] === 'help' && parts.length === 1)) {
    game.message(p, 'info', GM_HELP);
    return { ok: true, action: 'help' };
  }
  if (parts[0] === 'status' && parts.length === 1) {
    game.message(p, 'info', 'GM preview active. Level ' + p.char.level + '/' + MAX_LEVEL +
      '; invulnerability ' + (p.gmInvulnerable === true ? 'on' : 'off') + '.');
    return { ok: true, action: 'status' };
  }
  if (parts[0] === 'level' && parts.length === 2) {
    if (!/^[1-9]\d*$/.test(parts[1])) return deny('Level must be 1–' + MAX_LEVEL + '.');
    const level = Number(parts[1]);
    if (!Number.isSafeInteger(level) || level > MAX_LEVEL) return deny('Level must be 1–' + MAX_LEVEL + '.');
    if (p.dead) return deny('Respawn before changing level.');
    p.char.level = level;
    p.char.xp = 0;
    game.refreshStats(p);
    p.hp = p.maxHp;
    p.metaVer += 1;
    game.syncChar(p);
    game.markDirty(p);
    game.message(p, 'gain', 'GM set level to ' + level + '.');
    return { ok: true, action: 'level', target: String(level) };
  }
  if (parts[0] === 'tp' && parts.length === 2) {
    if (p.dead) return deny('Respawn before teleporting.');
    const destination = destinationFor(parts[1]);
    if (!destination) return deny('Unsupported or unavailable destination. Use /gm help.');
    game.transferPlayer(p, destination);
    game.message(p, 'info', 'GM teleported to ' + parts[1] + '. No encounter was opened.');
    return { ok: true, action: 'tp', target: parts[1] };
  }
  if (parts[0] === 'unlock' && parts.length === 1) {
    if (!p.char.attunements.includes('resonance')) p.char.attunements.push('resonance');
    p.char.riftCalibration = 'completed';
    game.refreshStats(p);
    game.markDirty(p);
    game.message(p, 'gain', 'GM preview unlocked Resonance and Phase Scar calibration for this character.');
    return { ok: true, action: 'unlock' };
  }
  if (parts[0] === 'heal' && parts.length === 1) {
    if (p.dead) return deny('Respawn before healing.');
    p.hp = p.maxHp;
    game.syncChar(p);
    game.markDirty(p);
    game.message(p, 'info', 'GM health restored.');
    return { ok: true, action: 'heal' };
  }
  if (parts[0] === 'god' && parts.length === 2 && (parts[1] === 'on' || parts[1] === 'off')) {
    p.gmInvulnerable = parts[1] === 'on';
    game.message(p, 'info', 'GM invulnerability ' + parts[1] + ' for this session only.');
    return { ok: true, action: 'god', target: parts[1] };
  }
  return deny('Unsupported GM command. Use /gm help.');
}
