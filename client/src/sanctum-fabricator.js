// Original fitted precision fabrication cell. Operator access is on +Z.
// No external assets. The collision envelope is declared in shared/world.js.
export function buildSanctumFabricator(T) {
 const g=new T.Group();g.name='sanctum-precision-fabricator';
 const m=(color,metalness=.55,roughness=.44)=>new T.MeshStandardMaterial({color,metalness,roughness});
 const dark=m(0x263038),panel=m(0x566568),trim=m(0xa47c46,.75),steel=m(0x9ca9a8,.8),rubber=m(0x11191e,.1,.85),light=new T.MeshStandardMaterial({color:0x48c7cc,emissive:0x167a82,emissiveIntensity:.9});
 function box(w,h,d,x,y,z,mat,parent=g){const o=new T.Mesh(new T.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
 function cyl(r1,r2,h,x,y,z,mat,parent=g){const o=new T.Mesh(new T.CylinderGeometry(r1,r2,h,16),mat);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;}
 box(2.72,.13,1.46,0,.065,0,dark);for(const x of [-.99,.99]){box(.54,.86,1.14,x,.55,-.08,panel);box(.48,.08,.12,x,.8,.51,trim);for(let i=0;i<4;i++)box(.37,.035,.03,x,.3+i*.085,.51,rubber);}
 box(2.7,.14,1.4,0,1.03,0,steel);box(2.5,.08,1.25,0,1.14,0,dark);
 // Recessed component platen and copper clamp rails.
 box(.91,.045,.75,0,1.20,.04,panel);for(const x of [-.43,.43]){box(.10,.07,.7,x,1.25,.04,trim);box(.18,.13,.18,x,1.32,.05,steel);}
 for(const x of [-1.13,1.13]){box(.16,1.33,.28,x,1.72,-.53,dark);box(.08,1.05,.035,x,1.77,-.37,trim);}
 box(2.46,.19,.38,0,2.42,-.53,panel);box(2.14,.055,.10,0,2.30,-.33,light);
 // Overhead precision spindle, concentric bearings and collet.
 box(.49,.20,.37,0,2.30,-.49,dark);cyl(.22,.22,.28,0,2.08,-.38,trim);
 const spindle=new T.Group();spindle.name='fabricator:spindle';spindle.position.set(0,1.79,-.38);g.add(spindle);
 cyl(.15,.15,.33,0,0,0,steel,spindle);cyl(.055,.10,.21,0,-.27,0,dark,spindle);box(.025,.21,.035,.09,0,.12,trim,spindle);
 // Side manipulator: pivot joints, offset links and inspection head.
 const pivot=new T.Group();pivot.name='fabricator:manipulator';pivot.position.set(-.94,1.22,-.26);g.add(pivot);
 cyl(.17,.22,.17,0,.09,0,trim,pivot);const arm=box(.17,.67,.17,.15,.38,0,panel,pivot);arm.rotation.z=-.48;cyl(.11,.11,.15,.30,.68,0,steel,pivot).rotation.x=Math.PI/2;const link=box(.53,.13,.13,.49,.68,0,trim,pivot);link.rotation.z=-.29;box(.18,.17,.19,.74,.61,0,dark,pivot);box(.13,.04,.12,.74,.52,0,light,pivot);
 // Dedicated diagnostic display and physical input switches.
 box(.83,.48,.12,.81,1.82,-.43,dark);box(.71,.35,.025,.81,1.83,-.35,light);for(let i=0;i<5;i++)box(.09,.025,.09,.54+i*.12,1.21,.48,i===0?trim:steel);
 for(const x of [-1.18,1.18]){box(.12,.10,.06,x,1.2,.63,trim);box(.075,.05,.025,x,1.2,.67,light);}
 const part=box(.44,.16,.36,0,1.33,.04,steel);part.name='fabricator:workpiece';part.visible=false;
 const ring=cyl(.19,.19,.055,0,1.43,.04,trim);ring.visible=false;
 let activity=0;
 g.userData.updateWork=(dt,time,work,calm=false)=>{
  const active=!!work&&Number.isFinite(work.q),q=active?Math.min(1,Math.max(0,work.q)):0,cut=active&&q>=.2&&q<.83;
  activity+=(Number(cut)-activity)*(1-Math.exp(-dt*7));
  spindle.position.y=1.79-.14*activity;spindle.rotation.y+=calm?0:dt*13*activity;
  pivot.rotation.y=active?(calm?-.15:Math.sin(time*2.4)*.17*activity):0;
  part.visible=ring.visible=active;ring.rotation.y=calm?0:Math.PI*q;
  light.emissiveIntensity=active?1.2:.45;
  g.userData.working=active;g.userData.stage=active?(q<.2?'prepare':q<.83?'work':'inspect'):'idle';
 };
 return g;
}
