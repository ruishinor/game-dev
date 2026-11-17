import { kit } from './geometry.mjs';
// Local +Z lies toward wearer; padded contact surface remains near mount plane.
// Shoulder straps require rig-aware attachment and are intentionally not baked.
export function build({variant='research',reservoirs=2}={}){
 if(!['research','kinetic','biotech','utility'].includes(variant)||!Number.isInteger(reservoirs)||reservoirs<0||reservoirs>4)throw Error('invalid backpack configuration');
 const k=kit(),{box,rod,ring}=k,accent={research:'cyan',kinetic:'amber',biotech:'green',utility:'ochre'}[variant];
 const bolt=(x,y,z,s=.006)=>rod('steel',[x,y,z],[x,y,z-.004],s,{sides:8});
 const hose=(points,r=.008)=>{for(let j=1;j<points.length;j++)rod('black',points[j-1],points[j],r,{sides:10});};
 // Layered carrier, shaped frame and discrete padded wearer-contact surfaces.
 box('frame',[0,0,-.068],[.286,.408,.095],{bevel:.027});box('fabric',[0,0,-.018],[.26,.378,.048],{bevel:.021});
 for(const x of [-.086,.086]){box('fabric',[x,.082,.009],[.092,.176,.038],{bevel:.020});box('fabric',[x,-.107,.007],[.093,.142,.035],{bevel:.018});box('frame',[x,0,-.044],[.024,.415,.036]);for(const y of [-.188,.185]){box('steel',[x,y,.011],[.045,.032,.016]);box('black',[x,y,.022],[.026,.015,.012]);}}
 box('black',[0,-.169,.009],[.069,.063,.031],{bevel:.011});box('fabric',[0,.193,.008],[.14,.035,.035]);
 // Rear housing has segmented, replaceable armor rather than one slab.
 box('frame',[0,.012,-.122],[.306,.405,.087],{bevel:.023});box('ochre',[0,.13,-.172],[.255,.147,.038],{bevel:.017});
 box('ceramic',[0,-.027,-.179],[.247,.154,.049],{bevel:.018});box('frame',[0,-.147,-.174],[.24,.075,.050],{bevel:.012});
 for(const x of [-.133,.133]){box('steel',[x,.003,-.164],[.026,.345,.055],{bevel:.009});for(const y of [-.14,-.03,.09,.15])bolt(x,y,-.194);}
 for(const y of [-.202,.20]){box('frame',[0,y,-.124],[.255,.031,.108]);for(const x of [-.10,.10])box('ochre',[x,y,-.185],[.049,.029,.017]);}
 box('frame',[-.036,.129,-.199],[.124,.078,.019],{bevel:.008});box('screen',[-.036,.129,-.211],[.102,.057,.008]);
 for(let i=0;i<5;i++)box(accent,[-.071+i*.017,.119+(i%3)*.005,-.217],[.008,.012+(i%3)*.009,.003]);
 for(const x of [.055,.079,.103])box('black',[x,.128,-.202],[.012,.052,.010]);
 // Replaceable center module and localized indicators.
 box('frame',[0,-.028,-.212],[.166,.104,.033],{bevel:.009});
 if(variant==='kinetic'){ring('copper',[0,-.027,-.233],.037,.008,{sides:24,segments:8});rod('amber',[0,-.027,-.231],[0,-.027,-.244],.022,{sides:16});}
 else if(variant==='biotech'){for(let i=0;i<3;i++)rod('dermal',[-.048+i*.048,-.060,-.235],[-.033+i*.048,.006,-.236],.014,{sides:12});rod('green',[-.064,-.039,-.251],[.064,-.039,-.251],.004,{sides:8});}
 else {for(let i=0;i<5;i++)box(i%2?'steel':'black',[0,-.062+i*.017,-.233],[.137,.009,.014],{bevel:.002});if(variant==='research')box('cyan',[.057,-.015,-.244],[.012,.057,.007]);}
 for(const x of [-.069,-.023,.023,.069]){box('black',[x,-.152,-.206],[.036,.041,.015]);box(accent,[x,-.139,-.216],[.023,.009,.005]);}
 // Top carry grip and side mount rails.
 rod('steel',[-.062,.235,-.116],[.062,.235,-.116],.012,{sides:16});for(const x of [-.062,.062])rod('frame',[x,.207,-.116],[x,.235,-.116],.014,{sides:12});
 for(let i=0;i<reservoirs;i++){const x=(i%2?-1:1)*.177,y=i<2?.074:-.106,z=-.132;
  rod(accent,[x,y-.056,z],[x,y+.056,z],.022,{sides:20});for(const s of [-1,1]){rod('frame',[x,y+s*.054,z],[x,y+s*.073,z],.030,{sides:16});rod('steel',[x,y+s*.066,z],[x,y+s*.076,z],.027,{sides:16});}
  for(const a of [0,2.094,4.189]){const dx=Math.cos(a)*.028,dz=Math.sin(a)*.028;rod('steel',[x+dx,y-.062,z+dz],[x+dx,y+.062,z+dz],.0042,{sides:8});}
  box('frame',[x*.94,y,z+.028],[.040,.048,.037]);box('ochre',[x*1.08,y-.055,z-.019],[.025,.027,.020]);if(i<2)hose([[x,y+.074,z],[x,y+.092,z],[x*.76,y+.103,z-.018],[x*.70,y+.085,z-.027]],.007);
 }
 for(const x of [-.105,.105]){box('black',[x,-.154,-.218],[.04,.07,.019]);for(let i=0;i<3;i++)box('steel',[x,-.175+i*.021,-.230],[.028,.005,.009]);}
 if(variant==='research'){rod('black',[.11,.208,-.15],[.11,.284,-.15],.010,{sides:10});rod('steel',[.11,.284,-.15],[.11,.326,-.15],.005,{sides:10});rod('cyan',[.11,.326,-.15],[.11,.335,-.15],.006,{sides:10});}
 else {box('frame',[.083,.212,-.14],[.074,.026,.056]);box(accent,[.083,.229,-.14],[.043,.006,.012]);}
 // Apply actual edge machining to major rigid housings and padded contact forms, not tiny fasteners.
 for(const p of k.parts)if(p.kind==='box'&&Math.min(...p.size)>.015)p.bevel3d=Math.min(.009,Math.min(...p.size)*(p.material==='fabric'?.20:.12));
 return k.parts;
}
