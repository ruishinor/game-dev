// Owner-only preview console. No privileged role or secret is sent to the
// browser, and no account is privileged by default. Configure UUIDs privately
// on the server using ATTUNEMENT_GM_ACCOUNT_IDS. All actions affect the
// authenticated player's own character, never another account.
import { MAX_LEVEL } from '../shared/content.js';
import { WORLD, RIFT_SITE, SILENT_FOUNDRY, SEVERANCE_POCKET, EXPEDITION_OUTPOST } from '../shared/world.js';
import { GATE_FRONT, SALVAGE_CAMP } from '../shared/severance-gate.js';
import { openFoundry } from './sim/silent-foundry.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const deny=reason=>({ok:false,reason});
export function gmIds(value=''){
  return new Set((typeof value==='string'?value:'').split(',').map(s=>s.trim().toLowerCase()).filter(s=>UUID.test(s)));
}
export function gmAuthorized(conn,ids){
  return !!(conn?.account?.id&&conn.char?.accountId===conn.account.id&&
    conn.player?.char===conn.char&&ids instanceof Set&&ids.has(conn.account.id.toLowerCase()));
}
export const GM_HELP='GM commands: /gm status, /gm level 1–'+MAX_LEVEL+', /gm tp reach|scar|expanse|outpost|scrapyard|gate|foundry|depths, /gm unlock, /gm heal, /gm god on|off. Only an explicitly configured account has access.';

const destinations={
  reach:()=>({...WORLD.spawn}),
  scar:()=>RIFT_SITE?{x:RIFT_SITE.x,z:RIFT_SITE.z+3.6}:null,
  expanse:()=>({...SEVERANCE_POCKET.arrival}),
  outpost:()=>({x:EXPEDITION_OUTPOST.x,z:EXPEDITION_OUTPOST.z}),
  scrapyard:()=>({x:SALVAGE_CAMP.x+18,z:SALVAGE_CAMP.z}),
  gate:()=>({x:GATE_FRONT.x,z:GATE_FRONT.z}),
  foundry:()=>({x:SILENT_FOUNDRY.arrival.x,z:SILENT_FOUNDRY.arrival.z}),
  depths:()=>({x:SILENT_FOUNDRY.x+5,z:SILENT_FOUNDRY.z-80}),
};
export function executeGm(game,p,line){
  if(typeof line!=='string'||line.length>120||!p?.char)return deny('Invalid GM request.');
  const parts=line.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if(parts.length===0||parts[0]==='help'&&parts.length===1){
    game.message(p,'info',GM_HELP);return {ok:true,action:'help'};
  }
  if(parts[0]==='status'&&parts.length===1){
    game.message(p,'info','GM preview active for this character. Level '+p.char.level+'/'+MAX_LEVEL+', invulnerability '+(p.gmInvulnerable?'on':'off')+'.');
    return {ok:true,action:'status'};
  }
  if(parts[0]==='level'&&parts.length===2){
    const level=Number(parts[1]);
    if(!Number.isSafeInteger(level)||level<1||level>MAX_LEVEL)return deny('Level must be 1–'+MAX_LEVEL+'.');
    p.char.level=level;p.char.xp=0;
    game.refreshStats(p);p.hp=p.maxHp;p.dead=false;p.combatUntil=0;p.autoOn=false;
    p.metaVer+=1;game.markDirty(p);
    game.message(p,'gain','GM set character level to '+level+'.');
    return {ok:true,action:'level',target:String(level)};
  }
  if((parts[0]==='tp'||parts[0]==='teleport')&&parts.length===2){
    const place=parts[1],destination=Object.hasOwn(destinations,place)?destinations[place]():null;
    if(!destination||!Number.isFinite(destination.x)||!Number.isFinite(destination.z))return deny('Unknown GM destination. Use /gm help.');
    if(['expanse','outpost','scrapyard','gate'].includes(place))game.openExpanse();
    if(['foundry','depths'].includes(place))openFoundry(game);
    game.transferPlayer(p,destination);
    game.message(p,'info','GM teleported to '+place+'.');
    return {ok:true,action:'tp',target:place};
  }
  if(parts[0]==='unlock'&&parts.length===1){
    if(!p.char.attunements.includes('resonance'))p.char.attunements.push('resonance');
    p.char.riftCalibration='completed';
    game.refreshStats(p);game.markDirty(p);
    game.message(p,'gain','GM preview: Resonance and Phase Scar calibration unlocked on this character.');
    return {ok:true,action:'unlock'};
  }
  if(parts[0]==='heal'&&parts.length===1){
    if(p.dead)return deny('Respawn before healing.');
    p.hp=p.maxHp;p.combatUntil=0;game.message(p,'info','GM health restored.');
    return {ok:true,action:'heal'};
  }
  if(parts[0]==='god'&&parts.length===2&&['on','off'].includes(parts[1])){
    p.gmInvulnerable=parts[1]==='on';
    game.message(p,'info','GM invulnerability '+parts[1]+'. This session only.');
    return {ok:true,action:'god',target:parts[1]};
  }
  return deny('Unsupported GM action. Use /gm help.');
}
