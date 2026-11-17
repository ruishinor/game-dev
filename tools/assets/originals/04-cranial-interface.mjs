import { kit } from './geometry.mjs';
// Local origin near the temple: Y vertical, Z forward, X towards outside of head.
export function build({side='right'}={}){
 if(!['left','right'].includes(side))throw Error('invalid side');
 const k=kit(),{ring,rod,orb,box}=k,s=side==='right'?-1:1;
 // Curved track in temple plane. Partial ring, no full halo.
 ring('steel',[s*.006,0,0],.042,.0033,{axis:[1,0,0],arc:2.15,start:2.10,sides:24,segments:8});
 const a=[s*.010,.037,.017],b=[s*.016,.013,.039],c=[s*.011,-.035,-.017],d=[s*.006,-.065,-.034];
 const arcStart=[s*.006,.042*Math.sin(2.10),-.042*Math.cos(2.10)],arcEnd=[s*.006,.042*Math.sin(4.25),-.042*Math.cos(4.25)];
 for(const [p,q] of [[a,b],[a,arcStart],[c,arcEnd],[c,d]])rod('frame',p,q,.0038,{sides:8});
 for(const p of [a,b,c]){orb('steel',p,[.007,.009,.008],{sides:12,rows:8,smooth:true});rod('black',[p[0]+s*.004,p[1],p[2]],[p[0]+s*.007,p[1],p[2]],.0052,{sides:12});orb('cyan',[p[0]+s*.007,p[1],p[2]],[.0018,.0025,.0025],{sides:10,rows:6,smooth:true});}
 box('frame',[s*.007,-.069,-.034],[.012,.021,.012],{bevel:.0025});
 // Flexible insulated surface leads and recessed contact pads.
 ring('black',[s*.003,0,0],.042,.0020,{axis:[1,0,0],arc:2.15,start:2.10,sides:24,segments:6});
 for(const p of [a,b,c]){orb('black',[p[0]-s*.004,p[1],p[2]],[.0025,.007,.006],{sides:10,rows:6,smooth:true});}
 box('ceramic',[s*.011,-.069,-.034],[.006,.016,.010],{bevel3d:.001});
 for(const y of [-.073,-.066])rod('steel',[s*.013,y,-.034],[s*.015,y,-.034],.0016,{sides:8});
 for(const p of k.parts)for(const key of ['a','b','center'])if(p[key])p[key]=p[key].map(x=>Math.round(x*1e7)/1e7);
 return k.parts;
}
