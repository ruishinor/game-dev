import { kit } from './geometry.mjs';
// Mount origin; +Z towards wearer, +Y up.
export function build({variant='research',reservoirs=2}={}){
 if(!['research','kinetic','biotech','utility'].includes(variant)||!Number.isInteger(reservoirs)||reservoirs<0||reservoirs>4)throw Error('invalid backpack configuration');
 const k=kit(),{box,rod,ring}=k;const accent={research:'cyan',kinetic:'amber',biotech:'green',utility:'ochre'}[variant];
 box('fabric',[0,0,-.055],[.30,.43,.13]);box('frame',[0,0,-.128],[.32,.46,.08]);box('ceramic',[0,0,-.178],[.27,.40,.045],{bevel:.018});
 box('frame',[0,.053,-.208],[.20,.14,.022]);box('screen',[0,.053,-.224],[.155,.092,.012]);
 for(const x of [-.112,.112]){box('steel',[x,0,-.206],[.035,.31,.025]);for(const y of [-.135,.132])rod('black',[x,y,-.221],[x,y,-.23],.009,{sides:6});}
 for(const y of [-.185,.185])box('ochre',[0,y,-.216],[.23,.028,.021]);
 box('frame',[0,-.13,-.225],[.15,.09,.024]);for(let i=0;i<3;i++)box(accent,[-.045+i*.045,-.13,-.241],[.022,.053,.007]);
 rod('steel',[-.065,.233,-.119],[.065,.233,-.119],.012);for(const x of [-.065,.065])rod('frame',[x,.208,-.119],[x,.233,-.119],.014);
 for(let i=0;i<reservoirs;i++){const x=(i%2?-1:1)*.179,y=i<2?.085:-.10;rod(accent,[x,y-.057,-.132],[x,y+.057,-.132],.024);for(const a of [-1,1])rod('steel',[x,y+a*.058,-.132],[x,y+a*.073,-.132],.031);for(const a of [0,2.094,4.189]){const dx=Math.cos(a)*.029,dz=Math.sin(a)*.029;rod('frame',[x+dx,y-.060,-.132+dz],[x+dx,y+.060,-.132+dz],.0045,{sides:6});}box('frame',[x,y,-.104],[.04,.045,.03]);}
 if(variant==='research'){rod('black',[.11,.23,-.15],[.11,.32,-.15],.007);rod('cyan',[.11,.32,-.15],[.11,.333,-.15],.009);for(let i=0;i<4;i++)box('cyan',[-.047+i*.032,.035+i%2*.026,-.232],[.015,.025+i%2*.02,.004]);}
 if(variant==='kinetic'){ring('copper',[0,.05,-.236],.044,.008);box('amber',[0,.05,-.248],[.046,.022,.008]);}
 if(variant==='biotech'){rod('dermal',[-.06,-.06,-.24],[.06,.02,-.24],.014);rod('green',[-.06,-.06,-.253],[.06,.02,-.253],.004);}
 if(variant==='utility'){for(const y of [.04,.075])box('steel',[0,y,-.241],[.12,.014,.01]);}
 return k.parts;
}
