import { kit } from './geometry.mjs';
// X-axis follows extended bind-pose forearm. +Y dorsal; mirror X for left/right.
export function build({hand='right'}={}){
 if(!['left','right'].includes(hand))throw Error('invalid hand');
 const k=kit(),{box,rod,ring}=k;const s=hand==='right'?-1:1;
 // Two open cuffs, not a solid cylinder through the forearm.
 for(const x of [-.09,.075])ring('frame',[x,0,0],.057,.012,{axis:[1,0,0],sides:18});
 for(const z of [-.046,.046])rod('steel',[-.09,.036,z],[.075,.036,z],.009,{sides:8});
 box('frame',[0,.056,0],[.21,.037,.106]);box('ceramic',[-s*.018,.079,0],[.155,.022,.092]);
 box('black',[s*.087,.081,0],[.065,.025,.086]);ring('copper',[s*.087,.097,0],.028,.006,{axis:[0,1,0],sides:18});
 rod('cyan',[s*.087,.094,0],[s*.087,.108,0],.017,{sides:12});
 for(const z of [-.036,.036]){box('ochre',[-s*.034,.094,z],[.085,.01,.014]);for(const x of [-.07,.01])rod('black',[x,.10,z],[x,.108,z],.005,{sides:6});}
 box('screen',[-s*.037,.097,0],[.075,.01,.042]);for(let i=0;i<3;i++)box('cyan',[-s*.037+(i-1)*.02,.104,0],[.008,.004,.026]);
 box('steel',[s*.125,.064,0],[.037,.035,.06]);rod('cyan',[s*.142,.064,0],[s*.149,.064,0],.014,{sides:12});
 return k.parts;
}
