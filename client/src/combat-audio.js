// P05: short, opt-out weapon sounds driven ONLY by replicated, accepted events.
// Synthetic SFX avoid loading assets or exposing server mechanics. No combat authority.
const ROD_ABILITIES = new Set(['auto','rending_arc','melee_light','melee_heavy']);
const RIFLE_VISUALS = new Set(['longpoint','field','tuned']);
export const AUDIO_PRESETS = Object.freeze({
  'rod-swing':  { waveform:'triangle', start:330, end:115, duration:.18, peak:.018, noise:.004 },
  'rod-impact': { waveform:'sawtooth', start:1200, end:105, duration:.25, peak:.050, noise:.030 },
  'rod-block':  { waveform:'triangle', start:740, end:260, duration:.22, peak:.034, noise:.011 },
  'longpoint':  { waveform:'triangle', start:265, end:58, duration:.30, peak:.065, noise:.045 },
  'field':      { waveform:'triangle', start:630, end:175, duration:.14, peak:.041, noise:.016 },
  'tuned':      { waveform:'sine', start:960, end:230, duration:.17, peak:.039, noise:.012 },
});

// A windup may whoosh but must never sound like a confirmed electrical impact.
// Damage and shield contact sounds require an accepted server 'dmg' event.
// Unknown and non-weapon abilities intentionally remain silent.
export function combatCue(event, attacker) {
  if (!attacker || attacker.meta?.k !== 'p') return null;
  const rod=[1,2].includes(attacker.row?.er);
  if (event?.e === 'melee_start')
    return rod && ['1','2','3','heavy','counter'].includes(event.style) ? 'rod-swing' : null;
  if (event?.e !== 'dmg' || !(event.a > 0 || event.sh > 0)) return null;
  if (rod && event.k === 'melee' && ROD_ABILITIES.has(event.ab))
    return event.a > 0 ? 'rod-impact' : 'rod-block';
  if (event.k === 'bolt' && event.ab === 'auto' && RIFLE_VISUALS.has(event.wv))
    return event.wv;
  return null;
}

export function soundDistanceGain(source, listener) {
  if (!source || !listener || ![source.x,source.z,listener.x,listener.z].every(Number.isFinite)) return 0;
  const d=Math.hypot(source.x-listener.x,source.z-listener.z);
  return d > 30 ? 0 : 1/(1+(d/9)**2);
}

const storageKey='attunement.combatAudio';
// The browser unlocks sound only following a user gesture. Voices are quiet,
// distance-attenuated, non-looping, pooled by a hard cap and never used as hit
// prediction. No third-party audio, network or microphone activity.
export class CombatAudio {
  constructor({createContext=null,storage=null}={}) {
    this.createContext=createContext;
    try { this.storage=storage??globalThis.localStorage; } catch { this.storage=null; }
    try { this.enabled=this.storage?.getItem(storageKey)!=='0'; } catch { this.enabled=true; }
    this.ctx=null;this.noise=null;this.voices=new Set();this.last=new Map();
  }
  setEnabled(on){
    this.enabled=!!on;
    try { this.storage?.setItem(storageKey,this.enabled?'1':'0'); } catch {}
    if (!this.enabled) this.stop();
    else this.unlock();
  }
  unlock(){
    if(!this.enabled)return false;
    if(!this.ctx){
      try {
        const C=globalThis.AudioContext||globalThis.webkitAudioContext;
        this.ctx=this.createContext?this.createContext():C?new C():null;
      } catch { this.ctx=null; }
    }
    if(this.ctx?.state==='suspended')void Promise.resolve(this.ctx.resume()).catch(()=>{});
    return !!this.ctx;
  }
  stop(){
    for(const voice of this.voices){try{voice.stop();}catch{}}
    this.voices.clear();this.last.clear();
  }
  // A small deterministic broad-band click accompanies each pitched transient.
  noiseBuffer(){
    if(this.noise)return this.noise;
    const ctx=this.ctx,n=Math.max(1,Math.floor(ctx.sampleRate*.12)),b=ctx.createBuffer(1,n,ctx.sampleRate);
    const out=b.getChannelData(0);let seed=0x5b321a9;
    for(let i=0;i<n;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;out[i]=(seed/2147483648)*.5;}
    this.noise=b;return b;
  }
  play(cue, source, listener, hidden=false) {
    if(!this.enabled||hidden||!Object.hasOwn(AUDIO_PRESETS,cue)||!this.ctx||this.ctx.state!=='running')return false;
    const level=soundDistanceGain(source,listener),ctx=this.ctx;
    if(level<.03||this.voices.size>=6)return false;
    const now=ctx.currentTime,previous=this.last.get(cue)??-Infinity;
    if(now-previous<.075)return false;
    const p=AUDIO_PRESETS[cue];
    try {
      const osc=ctx.createOscillator(),env=ctx.createGain();
      osc.type=p.waveform;
      osc.frequency.setValueAtTime(p.start,now);
      osc.frequency.exponentialRampToValueAtTime(p.end,now+p.duration*.93);
      env.gain.setValueAtTime(.0001,now);
      env.gain.linearRampToValueAtTime(p.peak*level,now+.009);
      env.gain.exponentialRampToValueAtTime(.0001,now+p.duration);
      osc.connect(env);env.connect(ctx.destination);
      let snap=null,filter=null,snapGain=null;
      if(p.noise>0){
        snap=ctx.createBufferSource();snap.buffer=this.noiseBuffer();
        filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=cue==='longpoint'?1450:2100;
        snapGain=ctx.createGain();
        snapGain.gain.setValueAtTime(.0001,now);
        snapGain.gain.linearRampToValueAtTime(p.noise*level,now+.003);
        snapGain.gain.exponentialRampToValueAtTime(.0001,now+.09);
        snap.connect(filter);filter.connect(snapGain);snapGain.connect(ctx.destination);
      }
      const voice={stop:()=>{osc.stop();try{snap?.stop();}catch{}}};
      this.voices.add(voice);this.last.set(cue,now);
      osc.onended=()=>{this.voices.delete(voice);for(const n of [osc,env,snap,filter,snapGain])try{n?.disconnect();}catch{}};
      osc.start(now);osc.stop(now+p.duration+.015);
      if(snap){snap.start(now);snap.stop(now+.11);}
      return true;
    }catch{return false;}
  }
  playEvent(event, attacker, listener, hidden=false){
    const cue=combatCue(event,attacker);
    return cue ? this.play(cue,attacker?.pos,listener?.pos,hidden) : false;
  }
}
