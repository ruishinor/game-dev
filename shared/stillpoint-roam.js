// Deterministic presentation-only wander synchronized to the existing server clock.
// No creature interaction, reward, collision, or other authoritative gameplay state.
const R=1.45, CX=7.3, CZ=.65, SPEED=.4, RAMP=1.5;
const HALF=Math.PI*R;
const WALK=HALF/SPEED+RAMP;
const FIRST_REST=4, SECOND_REST=6;
export const STILLPOINT_CYCLE=FIRST_REST+SECOND_REST+2*WALK;
function leg(t){
 if(t<RAMP)return {distance:SPEED*t*t/(2*RAMP),speed:SPEED*t/RAMP};
 if(t>WALK-RAMP){const remain=WALK-t;return {distance:HALF-SPEED*remain*remain/(2*RAMP),speed:SPEED*remain/RAMP};}
 return {distance:SPEED*(t-RAMP/2),speed:SPEED};
}
export function stillpointPose(seconds){
 let t=((Number.isFinite(seconds)?seconds:0)%STILLPOINT_CYCLE+STILLPOINT_CYCLE)%STILLPOINT_CYCLE;
 let distance=0,speed=0,clip='Idle';
 if(t>=FIRST_REST){
  t-=FIRST_REST;
  if(t<WALK){({distance,speed}=leg(t));clip='Walk';}
  else {
   t-=WALK;distance=HALF;clip='WeightShift';
   if(t>=SECOND_REST){const step=leg(t-SECOND_REST);distance+=step.distance;speed=step.speed;clip='Walk';}
  }
 }
 const a=-Math.PI/2+distance/R;
 // Authored GLB faces +Z. Tangent is (-sin(a), cos(a)).
 return {x:CX+R*Math.cos(a),z:CZ+R*Math.sin(a),yaw:Math.atan2(-Math.sin(a),Math.cos(a)),speed,clip};
}
