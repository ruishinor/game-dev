// World-synchronised Lumenfen climate. One server wall-clock source; no
// per-client weather randomness and no client authority over gameplay rewards.
import { WORLD_CLOCK, worldClockPhase } from './world-clock.js';

export const FEN_CLIMATE = Object.freeze({
  daysPerSeason: 24,
  monsoonStartDay: 14,
  monsoonEndDay: 20,
  transitionDays: 2,
  periodMs: WORLD_CLOCK.periodMs * 24,
});
const clamp01=n=>Math.max(0,Math.min(1,n));
const smooth=n=>{const x=clamp01(n);return x*x*(3-2*x);};

export function lumenfenClimate(wallMs) {
  if(!Number.isFinite(wallMs))wallMs=0;
  const period=FEN_CLIMATE.periodMs;
  const elapsed=((wallMs%period)+period)%period;
  const day=elapsed/WORLD_CLOCK.periodMs;
  const start=FEN_CLIMATE.monsoonStartDay,end=FEN_CLIMATE.monsoonEndDay;
  // Rain ramps through two pre-monsoon days, peaks for six days, recedes
  // through two post-monsoon days, then returns to a clear wetland season.
  const onset=smooth((day-(start-FEN_CLIMATE.transitionDays))/FEN_CLIMATE.transitionDays);
  const retreat=1-smooth((day-end)/FEN_CLIMATE.transitionDays);
  const strength=onset*retreat;
  const rainfall=clamp01(strength*(.70+.26*Math.sin(day*2.7)**2));
  const season=day>=start&&day<end?'monsoon':strength>.02?'transition':'clear';
  return Object.freeze({
    season,
    // Stable quantities keep snapshots compact; step changes do not change
    // terrain collision or imply the client can alter drop probabilities.
    rain:Math.round(rainfall*100)/100,
    flood:Math.round(smooth(strength)*100)/100,
    wind:Math.round((.12+.8*rainfall)*100)/100,
    day:Math.floor(day),
    phase:worldClockPhase(wallMs),
  });
}
