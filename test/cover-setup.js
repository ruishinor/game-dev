// Test setup only. Pick clear walkable positions without altering server cover.
import { hasLineOfSight, resolveCollisions, PLAYER_RADIUS, inSanctum, dist } from '../shared/world.js';
export function clearCombatSpot(enemy,dx,dz){
  const length=Math.hypot(dx,dz),angle=Math.atan2(dx,dz);
  for(const rotation of [0,.25,-.25,.5,-.5,.75,-.75,1,-1,1.5,-1.5,2,-2,Math.PI]){
    const a=angle+rotation,spot={x:enemy.x+length*Math.sin(a),z:enemy.z+length*Math.cos(a)};
    const resolved=resolveCollisions({...spot},PLAYER_RADIUS);
    if(dist(spot,resolved)<1e-6 && !inSanctum(spot) && hasLineOfSight(spot,enemy))return spot;
  }
  throw Error('No unobstructed test setup for '+JSON.stringify({enemy:enemy.id,x:enemy.x,z:enemy.z,dx,dz}));
}
