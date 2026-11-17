import { kit } from './geometry.mjs';
// Complete ground-centred fallbacks or tabletop add-ons for existing sanctum desk.
export function build({kind='research',base=true}={}){
 if(!['research','engineering'].includes(kind)||typeof base!=='boolean')throw Error('invalid workstation configuration');
 const k=kit(),{box,rod,ring}=k,oy=base?.94:0;
 const add=(material,x,y,z,w,h,d,opts)=>box(material,[x,y+oy,z],[w,h,d],opts);
 const pole=(material,a,b,r,opts)=>rod(material,[a[0],a[1]+oy,a[2]],[b[0],b[1]+oy,b[2]],r,opts);
 if(base){
  box('frame',[0,.885,0],[2.10,.11,.87],{bevel:.025});box('ceramic',[0,.946,0],[2.02,.022,.82],{bevel:.008});
  for(const x of [-.91,.91])for(const z of [-.33,.33]){box('steel',[x,.42,z],[.10,.84,.10]);box('black',[x,.035,z],[.17,.07,.16]);}
  box('frame',[0,.28,-.29],[1.71,.09,.10]);box('ochre',[0,.79,.40],[1.8,.07,.05]);
  for(const x of [-.70,.70]){box('frame',[x,.67,-.11],[.32,.27,.53]);box('steel',[x,.67,.164],[.29,.20,.025]);box('black',[x,.68,.185],[.13,.025,.018]);}
 }
 add('frame',0,.065,-.12,1.45,.13,.56);add('ceramic',0,.141,-.12,1.38,.022,.51);
 // Upright industrial display anchored to two posts; faces the operator (+Z).
 for(const x of [-.44,.44])pole('steel',[x,.16,-.28],[x,.44,-.28],.028,{sides:8});
 add('frame',0,.46,-.28,1.10,.38,.075,{bevel:.025});add('screen',0,.46,-.231,1.022,.304,.018,{bevel:.015});
 for(let i=0;i<7;i++)add('cyan',-.39+i*.105,.415+.025*(i%3),-.219,.035,.065+.023*(i%3),.005);
 for(const y of [.55,.575])add('steel',.23,y,-.218,.32,.008,.005);
 if(kind==='research'){
  add('black',-.22,.167,.12,.48,.035,.29);add('screen',-.22,.19,.12,.43,.012,.24);
  ring('cyan',[-.22,oy+.212,.12],.089,.006,{axis:[0,1,0],sides:24});
  for(const x of [.17,.29,.41]){pole('frame',[x,.155,.14],[x,.192,.14],.038);pole(x===.29?'green':'amber',[x,.193,.14],[x,.345,.14],.026,{sides:10});pole('steel',[x,.346,.14],[x,.371,.14],.037);}
  add('ochre',.62,.188,.03,.16,.052,.17);add('black',.62,.221,.03,.12,.014,.13);
 }else{
  add('steel',-.30,.19,.12,.37,.06,.25);for(const x of [-.43,-.17]){add('frame',x,.26,.12,.085,.11,.23);add('steel',x,.324,.12,.10,.023,.18);}
  pole('steel',[-.47,.24,.12],[-.11,.24,.12],.018,{sides:8});pole('frame',[-.51,.24,.05],[-.51,.24,.20],.012,{sides:8});
  add('ochre',.28,.24,.10,.34,.16,.32);add('frame',.28,.33,.10,.25,.035,.24);add('screen',.28,.354,.10,.18,.014,.15);
  for(const x of [.49,.60])pole('copper',[x,.155,.11],[x,.29,.11],.021,{sides:8});
 }
 return k.parts;
}
