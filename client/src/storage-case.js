// Reusable cargo cases, scaled to existing authoritative rectangular props.
// No loot, access, reward or collision semantics are introduced.
import { mergeGeometries, paintTexture } from './gear-kit.js';

export function buildStorageCase(T,p){
  const g=new T.Group();g.name='industrial:storage:'+p.x+':'+p.z;
  const large=p.hw>.7, W=p.hw*2,D=p.hd*2,H=p.h;
  const mat=(color,roughness,metalness,extra={})=>new T.MeshStandardMaterial({color,roughness,metalness,...extra});
  const maps=paintTexture(T,'storage:'+String(large),{base:large?'#77745d':'#526c69',metal:'#86877d',seed:large?183:391,seams:false});
  const body=mat(maps?0xffffff:large?0x77745d:0x526c69,.82,.23,maps??{});
  const frame=mat(0x444b48,.64,.56), gasket=mat(0x272c29,.94,.03), hardware=mat(0x96917a,.51,.64);
  const groups=new Map();
  const box=(m,w,h,d,x,y,z)=>{
    const geo=new T.BoxGeometry(w*W,h*H,d*D).translate(x*W,y*H,z*D);
    if(!groups.has(m))groups.set(m,[]);groups.get(m).push(geo);
  };
  // Two ground-contact runners, heavy frame and protected recessed panels.
  for(const side of [-1,1]){
    box(frame,.19,.13,.98,side*.35,.065,0);
    box(hardware,.17,.026,.86,side*.35,.142,0);
  }
  box(body,.88,.65,.88,0,.48,0);
  box(frame,.96,.075,.96,0,.1825,0);
  box(gasket,.90,.025,.90,0,.81,0);
  box(body,.91,.135,.91,0,.89,0);
  box(frame,.98,.055,.98,0,.9725,0);
  for(const s of [-1,1]){
    for(const z of [-.42,.42]){
      box(frame,.075,.74,.075,s*.4525,.53,z);
      box(hardware,.10,.08,.10,s*.435,.89,z);
    }
    // End frames, recessed grips and load ribs, inside the collider.
    box(frame,.035,.48,.68,s*.4625,.49,0);
    box(body,.023,.34,.53,s*.485,.49,0);
    box(gasket,.012,.105,.27,s*.498,.56,0);
    for(const x of [-.25,0,.25])box(frame,.044,.48,.03,x,.49,s*.452);
  }
  for(const x of [-.27,.27]){
    box(frame,.13,.18,.04,x,.82,.47);
    box(hardware,.085,.105,.025,x,.82,.4875);
  }
  // Inert serial plate, not a misleading interaction or mission indicator.
  box(hardware,.25,.11,.025,0,.61,.4775);
  for(const [m,parts] of groups){
    const geometry=mergeGeometries(T,parts);
    for(const part of parts)part.dispose();
    const mesh=new T.Mesh(geometry,m);mesh.castShadow=true;mesh.receiveShadow=true;g.add(mesh);
  }
  return g;
}
