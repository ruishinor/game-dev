import { kit } from './geometry.mjs';
// Local mount origin; +Z toward wearer. Opaque organic core in protected cage.
export function build({culture='restorative'}={}){
 if(!['restorative','resonant'].includes(culture))throw Error('invalid culture');
 const k=kit(),{box,rod,orb,ring}=k,accent=culture==='restorative'?'green':'violet';
 box('frame',[0,0,-.055],[.155,.36,.11]);box('ochre',[0,-.145,-.114],[.135,.06,.07]);
 const z=-.146;for(const y of [-.19,.18]){rod('steel',[0,y-.021,z],[0,y+.021,z],.071);ring('frame',[0,y,z],.069,.007,{axis:[0,1,0],sides:18});}
 orb('dermal',[0,-.015,z],[.048,.143,.049],{sides:12,rows:10});
 for(let i=0;i<7;i++){let t=i*2.4,y=-.106+i*.033;orb(i%3===0?'membrane':accent,[Math.cos(t)*.039,y,z+Math.sin(t)*.039],[.023,.033,.022],{sides:9,rows:6});}
 for(let i=0;i<4;i++){const a=i*Math.PI/2+.7,x=.064*Math.cos(a),zz=z+.064*Math.sin(a);rod('frame',[x,-.168,zz],[x,.158,zz],.008,{sides:8});}
 for(const x of [-.039,.039]){rod('copper',[x,.201,z],[x,.25,z+.04],.013);rod('steel',[x,.244,z+.036],[x,.263,z+.052],.016);}
 box('frame',[0,-.13,z-.065],[.09,.063,.02]);box(accent,[0,-.13,z-.078],[.043,.021,.006]);
 return k.parts;
}
