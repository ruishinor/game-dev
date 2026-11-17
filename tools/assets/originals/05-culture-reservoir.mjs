import { kit } from './geometry.mjs';
// Local mount origin; +Z toward wearer. Opaque organic core in protected cage.
export function build({culture='restorative'}={}){
 if(!['restorative','resonant'].includes(culture))throw Error('invalid culture');
 const k=kit(),{box,rod,orb,ring}=k,accent=culture==='restorative'?'green':'violet';
 box('frame',[0,0,-.055],[.155,.36,.11]);box('ochre',[0,-.145,-.114],[.135,.06,.07]);
 const z=-.146;for(const y of [-.19,.18]){rod('steel',[0,y-.021,z],[0,y+.021,z],.071);ring('frame',[0,y,z],.069,.007,{axis:[0,1,0],sides:18});}
 orb('dermal',[0,-.015,z],[.043,.137,.046],{sides:20,rows:12,smooth:true});
 for(let i=0;i<7;i++){let t=i*2.4,y=-.106+i*.033;orb(i%3===0?'bioRidge':'membrane',[Math.cos(t)*.039,y,z+Math.sin(t)*.039],[.023,.033,.022],{sides:12,rows:8,smooth:true});if(i%2===0)orb(accent,[Math.cos(t)*.052,y,z+Math.sin(t)*.052],[.008,.014,.008],{sides:8,rows:5,smooth:true});}
 for(let i=0;i<4;i++){const a=i*Math.PI/2+.7,x=.064*Math.cos(a),zz=z+.064*Math.sin(a);rod('frame',[x,-.168,zz],[x,.158,zz],.008,{sides:8});}
 for(const x of [-.039,.039]){rod('copper',[x,.201,z],[x,.25,z+.04],.013);rod('steel',[x,.244,z+.036],[x,.263,z+.052],.016);}
 box('frame',[0,-.13,z-.065],[.09,.063,.02]);box(accent,[0,-.13,z-.078],[.043,.021,.006]);
 // Serviceable culture cartridge: compression seals, guarded windows, and carrier pads.
 for(const y of [-.161,.155]){
  ring('black',[0,y,z],.061,.006,{axis:[0,1,0],sides:20,segments:6});
  for(const x of [-.043,.043])rod('copper',[x,y-.008,z],[x,y+.008,z],.013,{sides:10});
 }
 for(const x of [-.059,.059]){
  box('fabric',[x,-.068,-.004],[.041,.122,.025]);
  box('fabric',[x,.081,-.004],[.041,.117,.025]);
  box('steel',[x,-.122,-.106],[.025,.028,.033]);
  rod('steel',[x,.144,-.103],[x,.169,-.103],.009,{sides:10});
 }
 for(const x of [-.039,.039]){
  rod('frame',[x,.225,z+.023],[x,.245,z+.038],.017,{sides:12});
  ring('copper',[x,.247,z+.04],.014,.003,{axis:[0,1,0],sides:14,segments:6});
 }
 for(const a of [0,.5*Math.PI,Math.PI,1.5*Math.PI]){
  const x=.065*Math.cos(a+.7),zz=z+.065*Math.sin(a+.7);
  for(const y of [-.141,.136])rod('steel',[x,y-.012,zz],[x,y+.012,zz],.012,{sides:10});
 }
 for(const p of k.parts){if(p.kind==='box'&&Math.min(...p.size)>.015)p.bevel3d=Math.min(.007,Math.min(...p.size)*.13);for(const key of ['a','b','center'])if(p[key])p[key]=p[key].map(x=>Math.round(x*1e7)/1e7);}
 return k.parts;
}
