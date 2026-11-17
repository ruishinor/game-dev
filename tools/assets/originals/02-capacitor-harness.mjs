import { kit } from './geometry.mjs';
// Separate rigid modules, no baked cross-joint geometry.
export function build({piece='spine'}={}){
 if(!['spine','shoulder','coil','knee','visor'].includes(piece))throw Error('invalid capacitor piece');
 const k=kit(),{box,rod,ring,orb}=k;
 if(piece==='spine'){
  box('frame',[0,0,-.028],[.19,.34,.08]);box('ceramic',[0,0,-.083],[.155,.30,.035],{bevel:.015});
  for(const x of [-.052,.052]){rod('copper',[x,-.118,-.111],[x,.118,-.111],.015);for(const y of [-.119,.119])rod('steel',[x,y-.015,-.111],[x,y+.015,-.111],.021);box('amber',[x,0,-.129],[.017,.165,.007]);}
  for(const y of [-.158,.158])box('ochre',[0,y,-.077],[.16,.035,.035]);
  box('frame',[0,.02,-.126],[.048,.10,.023]);for(let i=0;i<3;i++)box('amber',[0,-.011+i*.03,-.141],[.029,.010,.006]);
  for(const x of [-.071,.071])for(const y of [-.135,.135])rod('black',[x,y,-.104],[x,y,-.115],.008,{sides:6});
 }
 if(piece==='shoulder'){
  box('frame',[0,0,0],[.19,.08,.19],{bevel:.02});box('ceramic',[0,.038,0],[.17,.055,.19],{bevel:.02});
  box('ochre',[0,.071,0],[.12,.012,.145]);for(const z of [-.073,.073])box('steel',[0,.055,z],[.18,.025,.027]);box('amber',[0,.04,.105],[.073,.014,.007]);
 }
 if(piece==='coil'){
  // X-aligned forearm; open annulus, no solid cylinder occluding arm.
  for(const x of [-.049,.049])ring('steel',[x,0,0],.065,.011,{axis:[1,0,0]});
  for(const x of [-.026,0,.026])ring('copper',[x,0,0],.065,.006,{axis:[1,0,0]});
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const y=Math.cos(a)*.068,z=Math.sin(a)*.068;rod('frame',[-.06,y,z],[.06,y,z],.008,{sides:8});}
  box('frame',[0,.077,0],[.105,.028,.05]);box('amber',[0,.094,0],[.075,.006,.026]);
 }
 if(piece==='knee'){box('frame',[0,0,0],[.125,.13,.034]);box('ceramic',[0,0,.025],[.10,.115,.028],{bevel:.017});box('ochre',[0,-.035,.042],[.073,.016,.009]);for(const x of [-.04,.04])rod('black',[x,.037,.04],[x,.037,.047],.007,{sides:6});}
 if(piece==='visor'){box('frame',[0,0,0],[.145,.034,.025],{bevel:.008});box('amber',[0,0,.015],[.102,.012,.007]);for(const x of [-.067,.067])box('steel',[x,0,-.008],[.017,.026,.04]);}
 // Split load-bearing housings, visible power-transfer channels and replaceable fasteners.
 if(piece==='spine'){
  for(const x of [-.079,.079]){box('frame',[x,0,-.077],[.027,.28,.054]);for(const y of [-.107,.107]){rod('steel',[x,y,-.104],[x,y,-.115],.008,{sides:10});box('ochre',[x,y,-.115],[.023,.025,.008]);}}
  for(const x of [-.052,.052])for(const y of [-.090,.090])rod('frame',[x,y-.009,-.111],[x,y+.009,-.111],.021,{sides:12});
  for(let i=0;i<4;i++)box('steel',[0,-.098+i*.014,-.134],[.029,.006,.008]);
  for(const x of [-.061,.061]){rod('black',[x,.135,-.107],[x,.154,-.087],.009,{sides:8});rod('steel',[x,.154,-.087],[x,.166,-.087],.012,{sides:10});}
 }
 if(piece==='shoulder'){
  for(const z of [-.082,.082]){box('frame',[0,.018,z],[.166,.022,.027]);for(const x of [-.061,.061])rod('steel',[x,.065,z],[x,.077,z],.009,{sides:10});}
  for(const x of [-.079,.079])box('black',[x,-.025,0],[.028,.024,.135]);
  for(let i=0;i<3;i++)box('frame',[0,.079,-.04+i*.039],[.095,.009,.008]);
 }
 if(piece==='coil'){
  for(const x of [-.060,.060])ring('black',[x,0,0],.062,.007,{axis:[1,0,0],sides:20,segments:6});
  for(const z of [-.059,.059]){box('frame',[0,.050,z],[.095,.026,.022]);for(const x of [-.033,.033])rod('steel',[x,.063,z],[x,.070,z],.005,{sides:8});}
  for(const z of [-.014,.014])box('black',[0,.095,z],[.065,.007,.005]);
 }
 if(piece==='knee'){
  for(const x of [-.049,.049]){box('frame',[x,-.012,.026],[.018,.084,.024]);rod('steel',[x,.030,.041],[x,.030,.050],.006,{sides:8});}
  box('black',[0,-.031,-.015],[.103,.040,.016]);for(let i=0;i<3;i++)box('frame',[0,-.008+i*.012,.043],[.046,.005,.006]);
 }
 if(piece==='visor'){
  for(const x of [-.060,.060]){box('frame',[x,0,.019],[.018,.027,.013]);rod('steel',[x,.009,.026],[x,.009,.030],.005,{sides:8});}
  box('black',[0,0,.022],[.083,.009,.004]);for(const x of [-.028,0,.028])box('amber',[x,0,.025],[.011,.005,.003]);
 }
 for(const p of k.parts)if(p.kind==='box'&&Math.min(...p.size)>.017){delete p.bevel;p.bevel3d=Math.min(.009,Math.min(...p.size)*.13);}
 return k.parts;
}
