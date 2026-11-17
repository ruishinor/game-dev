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
 for(const z of [-.036,.036]){box('ochre',[-s*.034,.094,z],[.085,.01,.014]);for(const x of [-s*.07,-s*.01])rod('black',[x,.10,z],[x,.108,z],.005,{sides:6});}
 box('screen',[-s*.037,.097,0],[.075,.01,.042]);for(let i=0;i<3;i++)box('cyan',[-s*.037+(i-1)*.02,.104,0],[.008,.004,.026]);
 box('steel',[s*.125,.064,0],[.037,.035,.06]);rod('cyan',[s*.142,.064,0],[s*.149,.064,0],.014,{sides:12});
 // Two open padded cuffs and independent dorsal instrument housing.
 for(const x of [-.09,.075]){
  ring('black',[x,0,0],.052,.006,{axis:[1,0,0],sides:20,segments:6});
  for(const z of [-.059,.059]){box('frame',[x,.014,z],[.028,.039,.018]);rod('steel',[x,.034,z],[x,.040,z],.007,{sides:10});}
 }
 for(const z of [-.043,.043]){
  box('frame',[-s*.025,.067,z],[.13,.027,.023]);
  for(const x of [-s*.065,s*.012])rod('steel',[x,.082,z],[x,.090,z],.006,{sides:10});
 }
 // Recessed emitter with a protective machined collar and insulated feed.
 ring('steel',[s*.087,.106,0],.032,.004,{axis:[0,1,0],sides:24,segments:6});
 for(const z of [-.031,.031]){
  rod('black',[s*.031,.077,z],[s*.058,.084,z],.006,{sides:8});
  rod('copper',[s*.058,.084,z],[s*.074,.085,z*.70],.005,{sides:8});
 }
 for(const z of [-.024,.024])box('frame',[s*.126,.080,z],[.026,.020,.017]);
 for(let i=0;i<4;i++)box('steel',[-s*.084,.077,-.025+i*.016],[.014,.007,.008]);
 for(const p of k.parts)if(p.kind==='box'&&Math.min(...p.size)>.016){delete p.bevel;p.bevel3d=Math.min(.006,Math.min(...p.size)*.14);}
 return k.parts;
}
