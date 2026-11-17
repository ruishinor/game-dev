import { kit } from './geometry.mjs';
// Ground-centred station or locally grounded tabletop module.
export function build({kind='research',base=true}={}){
 if(!['research','engineering'].includes(kind)||typeof base!=='boolean')throw Error('invalid workstation configuration');
 const k=kit(),{box,rod,ring}=k,oy=base?.94:0;
 const add=(m,x,y,z,w,h,d,o={})=>box(m,[x,y+oy,z],[w,h,d],o);
 const pole=(m,a,b,r,o)=>rod(m,[a[0],a[1]+oy,a[2]],[b[0],b[1]+oy,b[2]],r,o);
 const cable=(p,r=.014)=>{for(let i=1;i<p.length;i++)pole('black',p[i-1],p[i],r,{sides:8});};
 if(base){
  box('frame',[0,.883,0],[2.10,.105,.87]);box('steel',[0,.936,0],[2.03,.012,.82]);
  for(const x of [-.89,.89]){
   box('frame',[x,.43,0],[.15,.82,.70]);box('ochre',[x,.43,.365],[.13,.67,.034]);
   for(const z of [-.28,.28]){box('steel',[x,.025,z],[.24,.05,.20]);box('black',[x,.08,z],[.17,.065,.15]);}
  }
  box('frame',[0,.27,-.31],[1.69,.17,.12]);box('steel',[0,.68,-.31],[1.69,.12,.09]);
  for(const x of [-.57,.57]){
   box('frame',[x,.58,-.065],[.48,.37,.55]);box('ochre',[x,.58,.216],[.43,.32,.031]);
   for(const y of [.51,.65]){box('frame',[x,y,.239],[.34,.026,.018]);box('steel',[x,y+.012,.257],[.20,.018,.02]);}
   for(const y of [.44,.72])for(const dx of [-.18,.18])rod('steel',[x+dx,y,.238],[x+dx,y,.248],.011,{sides:8});
  }
  for(const x of [-.68,.68])rod('steel',[x,.33,-.30],[Math.sign(x)*.88,.79,-.30],.025,{sides:8});
  box('black',[0,.84,.426],[1.7,.027,.027]);for(let i=0;i<8;i++)box('ochre',[-.77+i*.22,.84,.445],[.12,.026,.01],{angle:.20});
 }
 add('frame',0,.069,-.26,1.75,.138,.29);add('ochre',0,.142,-.26,1.65,.012,.25);
 for(const x of [-.70,.70]){add('steel',x,.24,-.31,.07,.31,.12);add('frame',x,.414,-.31,.15,.068,.16);}
 add('frame',0,.436,-.31,1.38,.37,.115);add('black',0,.436,-.244,1.29,.31,.021);add('screen',-.12,.45,-.229,1.02,.244,.009);
 for(let i=0;i<8;i++){const h=.022+(i%4)*.012;add('cyan',-.55+i*.075,.397+h/2,-.222,.025,h,.004);}
 for(const y of [.465,.493,.521])add('steel',-.18,y,-.222,.30,.006,.004);
 for(let i=0;i<4;i++){add('frame',.54,.332+i*.064,-.227,.11,.043,.018);add(i===0?'amber':'black',.54,.332+i*.064,-.215,.065,.018,.006);}
 for(const x of [-.60,.60])for(const y of [.29,.58])pole('steel',[x,y,-.238],[x,y,-.225],.010,{sides:8});
 if(kind==='engineering'){
  add('frame',-.39,.055,.108,.61,.11,.40);add('steel',-.39,.12,.108,.49,.021,.32);
  for(const x of [-.57,-.20]){add('frame',x,.19,.108,.13,.12,.29);add('steel',x,.261,.108,.139,.025,.25);for(let i=0;i<5;i++)add('black',x,.279,-.005+i*.052,.112,.009,.013);}
  pole('steel',[-.69,.16,.108],[-.10,.16,.108],.021,{sides:16});ring('steel',[-.70,oy+.16,.108],.059,.012,{axis:[1,0,0],sides:20});
  add('frame',.30,.09,.09,.45,.18,.38);add('ochre',.30,.191,.09,.40,.027,.32);add('black',.30,.213,.09,.22,.013,.19);add('screen',.30,.222,.09,.19,.007,.16);
  for(let i=0;i<5;i++)add('frame',.49,.055+i*.025,.285,.046,.009,.012);
  for(const x of [.61,.73]){pole('copper',[x,.026,.13],[x,.22,.13],.023,{sides:16});pole('steel',[x,.21,.13],[x,.25,.13],.030,{sides:12});}
  cable([[.30,.05,-.10],[.30,.045,-.19],[.54,.045,-.22],[.54,.11,-.25]]);
  // Compact articulated service tool; actual pivots, links and tool-head silhouette.
  add('frame',.76,.065,.26,.17,.13,.18);pole('steel',[.76,.125,.26],[.76,.35,.26],.038,{sides:16});
  for(const [x,y] of [[.76,.35],[.48,.53],[.13,.43]]){pole('frame',[x,y,.21],[x,y,.31],.057,{sides:16});pole('steel',[x,y,.311],[x,y,.325],.027,{sides:14});}
  for(const z of [.225,.295]){pole('ochre',[.76,.35,z],[.48,.53,z],.026,{sides:10});pole('frame',[.48,.53,z],[.13,.43,z],.028,{sides:10});}
  pole('steel',[.13,.43,.26],[.13,.35,.26],.037,{sides:12});pole('black',[.13,.35,.26],[.13,.29,.26],.021,{sides:12});pole('cyan',[.13,.29,.26],[.13,.282,.26],.012,{sides:10});
  add('steel',-.39,.225,.108,.22,.10,.16);add('copper',-.39,.284,.108,.13,.018,.10);
 }else{
  add('frame',-.39,.054,.08,.60,.108,.38);add('steel',-.39,.117,.08,.53,.016,.32);add('screen',-.39,.132,.08,.40,.010,.25);
  ring('cyan',[-.39,oy+.144,.08],.092,.004,{axis:[0,1,0],sides:24});
  for(let i=0;i<3;i++){const x=.13+i*.18;pole('frame',[x,.03,.09],[x,.075,.09],.062,{sides:16});pole(i===1?'green':'amber',[x,.075,.09],[x,.28,.09],.037,{sides:18});for(const y of [.075,.28])pole('steel',[x,y,.09],[x,y+.025,.09],.052,{sides:16});for(const z of [.04,.14])pole('frame',[x,.08,z],[x,.29,z],.008,{sides:8});}
  add('ochre',.68,.055,.09,.16,.11,.22);add('frame',.68,.12,.09,.13,.021,.18);add('screen',.68,.134,.09,.10,.007,.14);
  cable([[.15,.04,-.10],[.25,.04,-.19],[.69,.04,-.17],[.69,.11,-.24]]);
  // Research scanner gantry, separate from the articulated engineering tool.
  for(const x of [-.66,-.12]){pole('frame',[x,.05,.20],[x,.39,.20],.026,{sides:10});add('steel',x,.39,.20,.070,.047,.070);}
  add('frame',-.39,.40,.20,.59,.047,.079);add('ceramic',-.39,.37,.20,.21,.060,.13);
  pole('black',[-.39,.34,.20],[-.39,.29,.20],.043,{sides:16});pole('cyan',[-.39,.29,.20],[-.39,.278,.20],.027,{sides:16});
 }
 for(const x of [-.81,.81])for(const z of [-.37,-.15])pole('steel',[x,.145,z],[x,.154,z],.009,{sides:8});
 for(const x of [-.82,.82])add('black',x,.03,.31,.11,.06,.085);
 for(const p of k.parts)if(p.kind==='box'&&Math.min(...p.size)>.024)p.bevel3d=Math.min(.022,Math.min(...p.size)*.12);
 return k.parts;
}
