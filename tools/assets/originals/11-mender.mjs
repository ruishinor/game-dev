import { kit } from './geometry.mjs';
// Hover model centred at local origin, +Z forward. Tendrils/core animation separate.
export function build(){
 const k=kit(),{box,orb,rod,ring}=k;
 orb('frame',[0,0,-.10],[.192,.18,.14],{sides:16,rows:10});
 ring('steel',[0,0,-.045],.214,.019,{sides:24});
 ring('frame',[0,0,.11],.224,.016,{sides:24});
 orb('dermal',[0,0,.035],[.142,.142,.105],{sides:16,rows:10});
 // Open windows around the living core; separate petal plates with industrial fasteners.
 for(let i=0;i<4;i++){let a=i*Math.PI/2+Math.PI/4,x=.207*Math.cos(a),y=.207*Math.sin(a);
  box('ceramic',[x,y,.005],[.20,.096,.15],{angle:a+Math.PI/2,bevel:.018});
  box('ochre',[x*1.15,y*1.15,-.025],[.13,.025,.075],{angle:a+Math.PI/2,bevel:.005});
  rod('frame',[x*.77,y*.77,-.13],[x*.92,y*.92,.12],.018,{sides:8});
  orb('membrane',[x*.60,y*.60,.117],[.032,.036,.024],{sides:8,rows:6});
  for(const z of [-.058,.065])rod('black',[x*1.17,y*1.17,z],[x*1.20,y*1.20,z],.010,{sides:6});
 }
 rod('frame',[0,0,.12],[0,0,.19],.085,{sides:16});ring('copper',[0,0,.19],.076,.012,{sides:24});
 // Mode-coloured animated lens will overlay this dark lens.
 rod('screen',[0,0,.191],[0,0,.206],.055,{sides:16});
 for(const x of [-.128,.128]){box('frame',[x,-.06,.13],[.055,.046,.075]);rod('cyan',[x,-.06,.171],[x,-.06,.179],.012,{sides:8});}
 box('frame',[0,-.178,-.025],[.22,.061,.13]);for(const x of [-.07,0,.07])rod('steel',[x,-.19,-.03],[x,-.225,-.03],.022,{sides:8});
 rod('steel',[0,0,-.24],[0,.11,-.30],.012,{sides:8});rod('cyan',[0,.107,-.299],[0,.136,-.315],.012,{sides:8});
 return k.parts;
}
