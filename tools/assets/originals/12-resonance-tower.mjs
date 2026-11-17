import { kit } from './geometry.mjs';
// Static industrial field installation. Ground-centred, +Y up.
export function build({state='deployed'}={}){
 if(!['deployed','folded','disabled'].includes(state))throw Error('invalid tower state');
 const k=kit(),{box,rod,ring}=k,lit=state==='disabled'?'copper':'amber',spread=state==='folded'?.34:1.12;
 box('frame',[0,.13,0],[.49,.26,.49],{bevel:.045});box('ochre',[0,.31,0],[.39,.13,.39]);
 rod('steel',[0,.35,0],[0,1.65,0],.105,{sides:12});for(const x of [-.10,.10])rod('frame',[x,.38,0],[x,1.57,0],.035,{sides:8});
 box('frame',[0,.78,0],[.36,.21,.36]);box('ochre',[0,1.49,0],[.42,.21,.42]);
 // Exposed luminous containment rods, protected by a structural cage.
 rod('frame',[0,1.59,0],[0,1.72,0],.18,{sides:14});rod('steel',[0,2.47,0],[0,2.59,0],.18,{sides:14});
 rod('frame',[0,2.58,0],[0,2.71,0],.20,{sides:14});box('screen',[0,2.64,.202],[.085,.039,.014]);
 for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,x=Math.cos(a)*.083,z=Math.sin(a)*.083;
  rod(lit,[x,1.74,z],[x,2.45,z],.025,{sides:10});
  const cx=Math.cos(a)*.151,cz=Math.sin(a)*.151;rod('frame',[cx,1.67,cz],[cx,2.52,cz],.025,{sides:8});
 }
 ring('steel',[0,1.72,0],.157,.018,{axis:[0,1,0],sides:18});ring('steel',[0,2.46,0],.157,.018,{axis:[0,1,0],sides:18});
 // Three radial supports with secondary telescopic piston and grounded feet.
 for(let i=0;i<3;i++){
  const a=Math.PI*2*i/3+.25,dir=[Math.cos(a),0,Math.sin(a)],p=[dir[0]*.19,1.49,dir[2]*.19],mid=[dir[0]*(.20+spread*.40),.77,dir[2]*(.20+spread*.40)],foot=[dir[0]*spread,.10,dir[2]*spread];
  rod('frame',p,mid,.048,{sides:8});rod('steel',mid,foot,.035,{sides:8});
  rod('ochre',[dir[0]*.24,1.43,dir[2]*.24],[dir[0]*(.20+spread*.50),.61,dir[2]*(.20+spread*.50)],.022,{sides:8});
  rod('steel',[foot[0],.012,foot[2]],[foot[0],.095,foot[2]],.115,{sides:10});
 }
 // Ground-level power and control box; short external routing only when deployed.
 if(state!=='folded'){
  box('frame',[.53,.22,-.45],[.46,.44,.36]);box('ceramic',[.53,.24,-.65],[.38,.34,.055]);box('screen',[.53,.31,-.686],[.23,.12,.02]);box(lit,[.53,.15,-.687],[.14,.035,.018]);box('ochre',[.53,.03,-.46],[.43,.055,.37]);
  const cable=[[.53,.12,-.45],[.36,.045,-.34],[.20,.045,-.23],[.14,.12,-.14]];
  for(let j=1;j<cable.length;j++)rod('black',cable[j-1],cable[j],.024,{sides:8});
 }
 return k.parts;
}
