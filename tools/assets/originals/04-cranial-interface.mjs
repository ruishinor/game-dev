import { kit } from './geometry.mjs';
// Local origin near the temple: Y vertical, Z forward, X towards outside of head.
export function build({side='right'}={}){
 if(!['left','right'].includes(side))throw Error('invalid side');
 const k=kit(),{ring,rod,orb,box}=k,s=side==='right'?-1:1;
 // Curved track in temple plane. Partial ring, no full halo.
 ring('steel',[s*.006,0,0],.042,.0033,{axis:[s,0,0],arc:2.15,start:-.55,sides:16,segments:6});
 const a=[s*.010,.037,.017],b=[s*.016,.013,.039],c=[s*.011,-.035,-.017],d=[s*.006,-.065,-.034];
 for(const [p,q] of [[a,b],[c,d]])rod('frame',p,q,.0038,{sides:8});
 for(const p of [a,b,c]){orb('steel',p,[.007,.009,.008],{sides:8,rows:5});orb('cyan',[p[0]+s*.006,p[1],p[2]],[.0028,.0038,.0038],{sides:8,rows:5});}
 box('frame',[s*.007,-.069,-.034],[.012,.021,.012],{bevel:.0025});
 return k.parts;
}
