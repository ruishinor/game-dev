import { kit } from './geometry.mjs';
// Static industrial field installation. Ground-centred, +Y up.
export function build({state='deployed'}={}){
 if(!['deployed','folded','disabled'].includes(state))throw Error('invalid tower state');
 const k=kit(),{box,rod,ring}=k,lit=state==='deployed'?'amber':'copper',spread=state==='folded'?.34:1.12;
 box('frame',[0,.13,0],[.49,.26,.49],{bevel:.045});box('ochre',[0,.31,0],[.39,.13,.39]);
 rod('steel',[0,.35,0],[0,1.65,0],.105,{sides:12});for(const x of [-.10,.10])rod('frame',[x,.38,0],[x,1.57,0],.035,{sides:8});
 box('frame',[0,.78,0],[.36,.21,.36]);box('ochre',[0,1.49,0],[.42,.21,.42]);
 // Exposed luminous containment rods, protected by a structural cage.
 rod('frame',[0,1.59,0],[0,1.72,0],.18,{sides:14});rod('steel',[0,2.47,0],[0,2.59,0],.18,{sides:14});
 rod('frame',[0,2.58,0],[0,2.71,0],.20,{sides:14});box(state==='deployed'?'screen':'black',[0,2.64,.202],[.085,.039,.014]);
 for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,x=Math.cos(a)*.083,z=Math.sin(a)*.083;
  rod(lit,[x,1.74,z],[x,2.45,z],.025,{sides:10});
  const cx=Math.cos(a)*.151,cz=Math.sin(a)*.151;rod('frame',[cx,1.67,cz],[cx,2.52,cz],.025,{sides:8});
 }
 ring('steel',[0,1.72,0],.157,.018,{axis:[0,1,0],sides:18});ring('steel',[0,2.46,0],.157,.018,{axis:[0,1,0],sides:18});
 // Machined cartridge terminals and insulating collars.
 for(const y of [1.74,2.43]){rod('ceramic',[0,y-.024,0],[0,y+.024,0],.090,{sides:20});ring('copper',[0,y,0],.125,.009,{axis:[0,1,0],sides:20,segments:6});}
 rod('frame',[0,1.74,0],[0,2.45,0],.045,{sides:16});
 for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,x=Math.cos(a)*.083,z=Math.sin(a)*.083;
 for(const y of [1.75,2.44])rod('copper',[x,y-.028,z],[x,y+.028,z],.036,{sides:12});}
 for(const x of [-.13,.13])for(const z of [-.13,.13])rod('steel',[x,.263,z],[x,.29,z],.017,{sides:10});
 box('ceramic',[0,.78,.184],[.27,.14,.021]);for(let i=0;i<5;i++)box('black',[0,.735+i*.020,.198],[.21,.009,.008]);
 // Three radial supports with secondary telescopic piston and grounded feet.
 for(let i=0;i<3;i++){
  const a=Math.PI*2*i/3+.25,dir=[Math.cos(a),0,Math.sin(a)],p=[dir[0]*.19,1.49,dir[2]*.19],mid=[dir[0]*(.20+spread*.40),.77,dir[2]*(.20+spread*.40)],foot=[dir[0]*spread,.10,dir[2]*spread];
  rod('frame',p,mid,.048,{sides:8});rod('steel',mid,foot,.035,{sides:8});
  rod('ochre',[dir[0]*.24,1.43,dir[2]*.24],[dir[0]*(.20+spread*.50),.61,dir[2]*(.20+spread*.50)],.022,{sides:8});
  rod('black',[foot[0],0,foot[2]],[foot[0],.023,foot[2]],.116,{sides:14});
  rod('steel',[foot[0],.023,foot[2]],[foot[0],.072,foot[2]],.110,{sides:14,r2:.085});
  rod('frame',[foot[0],.072,foot[2]],[foot[0],.10,foot[2]],.052,{sides:12});
  const side=[-dir[2],0,dir[0]];
  for(const q of [p,mid])rod('steel',q.map((v,j)=>v-side[j]*.07),q.map((v,j)=>v+side[j]*.07),.039,{sides:12});
  const brace=[dir[0]*.13,.43,dir[2]*.13],join=mid.map((v,j)=>(v+foot[j])/2);
  rod('frame',brace,brace.map((v,j)=>(v+join[j])/2),.027,{sides:8});
  rod('steel',brace.map((v,j)=>(v+join[j])/2),join,.016,{sides:10});
 }
 // Ground-level power and control box; short external routing only when deployed.
 if(state!=='folded'){
  box('frame',[.53,.22,-.45],[.46,.44,.36]);box('ceramic',[.53,.24,-.65],[.38,.34,.055]);box(state==='deployed'?'screen':'black',[.53,.31,-.686],[.23,.12,.02]);box(lit,[.53,.15,-.687],[.14,.035,.018]);box('ochre',[.53,.03,-.46],[.43,.055,.37]);
  for(let i=0;i<5;i++)box('steel',[.771,.12+i*.049,-.45],[.025,.018,.22]);
  rod('steel',[.44,.46,-.45],[.62,.46,-.45],.018,{sides:12});
  for(const x of [.44,.62])rod('frame',[x,.43,-.45],[x,.46,-.45],.021,{sides:10});
  rod('steel',[.30,.12,-.45],[.26,.12,-.45],.032,{sides:12});
  const cable=[[.53,.12,-.45],[.36,.045,-.34],[.20,.045,-.23],[.14,.12,-.14]];
  for(let j=1;j<cable.length;j++)rod('black',cable[j-1],cable[j],.024,{sides:8});
 }
 for(const p of k.parts){if(p.kind==='box'&&Math.min(...p.size)>.022){delete p.bevel;p.bevel3d=Math.min(.015,Math.min(...p.size)*.13);}for(const key of ['a','b','center','size'])if(p[key])p[key]=p[key].map(n=>Math.round(n*1e7)/1e7);}
 return k.parts;
}
