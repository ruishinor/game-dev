// Ephemeral, opt-in parties for a small co-op world.
// Party membership deliberately does not modify loot, XP or combat balancing.
export const PARTY_CAP = 4;
const INVITE_MS = 30000;

export function inviteParty(game, sender, id) {
  const other = game.players.get(id);
  if (!other || other.id === sender.id) return { ok: false, reason: 'Select another connected player to invite.' };
  if (sender.partyId && !game.parties.get(sender.partyId)?.has(sender.id)) return { ok: false, reason: 'Your party is unavailable.' };
  if (other.partyId) return { ok: false, reason: 'That player already has a party.' };
  if (sender.partyId && game.parties.get(sender.partyId).size >= PARTY_CAP) return { ok: false, reason: 'Your party is full.' };
  other.partyInvite = { from: sender.id, until: game.time + INVITE_MS };
  game.message(other, 'info', `${sender.name} invited you to a party. Open Party [P] to respond.`);
  game.message(sender, 'info', `Party invitation sent to ${other.name}.`);
  return { ok: true };
}

export function answerParty(game, player, accept) {
  const pending = player.partyInvite;
  player.partyInvite = null;
  const sender = pending && game.players.get(pending.from);
  if (!pending || pending.until <= game.time || !sender) return { ok: false, reason: 'The party invitation expired.' };
  if (!accept) {
    game.message(sender, 'info', `${player.name} declined the party invitation.`);
    return { ok: true };
  }
  if (player.partyId) return { ok: false, reason: 'You are already in a party.' };
  let members = sender.partyId ? game.parties.get(sender.partyId) : null;
  if (sender.partyId && !members) return { ok: false, reason: 'That party no longer exists.' };
  if (members && members.size >= PARTY_CAP) return { ok: false, reason: 'That party is full.' };
  if (!members) {
    const id = game.nextPartyId++;
    members = new Set([sender.id]);
    game.parties.set(id, members);
    sender.partyId = id;
  }
  members.add(player.id);
  player.partyId = sender.partyId;
  for (const id of members) {
    const p = game.players.get(id);
    if (p) game.message(p, 'info', `${player.name} joined the party.`);
  }
  return { ok: true };
}

export function leaveParty(game, player) {
  const members = game.parties.get(player.partyId);
  if (!members) {
    player.partyId = 0;
    player.partyInvite = null;
    return { ok: true };
  }
  members.delete(player.id);
  player.partyId = 0;
  player.partyInvite = null;
  if (members.size < 2) {
    for (const id of members) {
      const remaining = game.players.get(id);
      if (remaining) remaining.partyId = 0;
    }
    game.parties.delete([...game.parties].find(([, value]) => value === members)?.[0]);
  } else for (const id of members) {
    const p = game.players.get(id);
    if (p) game.message(p, 'info', `${player.name} left the party.`);
  }
  return { ok: true };
}

export function removePartyPlayer(game, player) {
  leaveParty(game, player);
  for (const p of game.players.values()) if (p.partyInvite?.from === player.id) p.partyInvite = null;
}

export function partyState(game, player) {
  const set = game.parties.get(player.partyId);
  const members = set ? [...set].map((id) => game.players.get(id)).filter(Boolean)
    .map((p) => ({ id: p.id, name: p.name, cls: p.cls, level: p.char.level })) : [];
  const invitation = player.partyInvite && player.partyInvite.until > game.time
    ? game.players.get(player.partyInvite.from) : null;
  return { members, invite: invitation ? { id: invitation.id, name: invitation.name } : null, cap: PARTY_CAP };
}
