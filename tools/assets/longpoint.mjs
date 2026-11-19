// Original nonfunctional game prop based on the supplied exterior art direction.
// Coordinates are normalized art units, not manufacturing dimensions. All
// front faces are closed; no interior, ammunition or working mechanism exists.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import validator from 'gltf-validator';
import { weld } from '@gltf-transform/functions';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

export async function createLongpoint() {
const doc=new Document(); const buffer=doc.createBuffer();
const scene=doc.createScene('Longpoint Emitter');doc.getRoot().setDefaultScene(scene);
const root=doc.createNode('Longpoint');scene.addChild(root);
// Visual groups can be controlled by an engine without changing mesh data.
const groups=new Map();
function group(name,parent=root,translation=[0,0,0]){const n=doc.createNode(name).setTranslation(translation);parent.addChild(n);groups.set(name,{node:n,parts:new Map()});return n;}
group('Body');group('Optic');group('Core');group('MagazineShell');group('FrontShroud');
const bipod=group('Bipod');group('SupportLeft',bipod,[.46,-.065,.055]);group('SupportRight',bipod,[.46,-.065,-.055]);
const finishes={
  gunmetal:[[.29,.305,.315],.73,.43], graphite:[[.14,.154,.167],.55,.59],
  polymer:[[.106,.116,.127],.07,.82], edge:[[.43,.45,.46],.83,.38],
  recess:[[.045,.052,.058],.23,.88], optic:[[.055,.16,.18],.55,.24],
  cyan:[[.12,.67,.72],.25,.26,[.035,.24,.27]], label:[[.31,.38,.39],.12,.72],
  ceramic:[[.185,.205,.208],.19,.58], seal:[[.065,.075,.079],.08,.77], accent:[[.44,.32,.155],.55,.56], pale:[[.57,.64,.61],.16,.64]
};
const materials=new Map(Object.entries(finishes).map(([key,[rgb,metal,rough,emit]])=>[key,doc.createMaterial(key).setBaseColorFactor([...rgb,1]).setMetallicFactor(metal).setRoughnessFactor(rough).setEmissiveFactor(emit||[0,0,0])]));
function hash(x,y,z,seed){let h=(Math.imul(Math.round(x*8192),73856093)^Math.imul(Math.round(y*8192),19349663)^Math.imul(Math.round(z*8192),83492791)^seed)>>>0; h=Math.imul(h^(h>>>16),0x45d9f3b)>>>0;return (h^(h>>>16))>>>0;}
// A shared, deterministic, original surface map; fine finishing variation only.
// Directional abrasion, fine pitting and non-uniform patina; all original.
const texSize=512, albedo=Buffer.alloc(texSize*texSize*3), orm=Buffer.alloc(albedo.length), normal=Buffer.alloc(albedo.length), height=new Float32Array(texSize*texSize);
const smooth=(x)=>x*x*(3-2*x);
function noise(x,y,step,seed){const u=x/step,v=y/step,ix=Math.floor(u),iy=Math.floor(v),a=smooth(u-ix),b=smooth(v-iy);const r=(i,j)=>(hash(i/8192,j/8192,0,seed)%65536)/65535;return (r(ix,iy)*(1-a)+r(ix+1,iy)*a)*(1-b)+(r(ix,iy+1)*(1-a)+r(ix+1,iy+1)*a)*b;}
for(let y=0;y<texSize;y++)for(let x=0;x<texSize;x++){
  const h=hash(x/8192,y/8192,0,817), broad=noise(x,y,74,190), medium=noise(x,y,17,912), fine=noise(x,y,4,312);
  const directional=noise(x*.21,y*5,6,718);const scratch=(directional>.76&&medium>.40);const pit=h%563===0;
  const tone=Math.max(104,Math.min(255,183+38*broad+24*medium+14*fine+8*(h%101)/100+(scratch?30:0)-(pit?55:0)));
  const i=(y*texSize+x)*3;albedo[i]=tone;albedo[i+1]=Math.min(255,tone+2);albedo[i+2]=Math.min(255,tone+4);
  orm[i]=245;orm[i+1]=Math.round(Math.max(92,Math.min(255,215+25*medium-(scratch?80:0)+(pit?30:0))));orm[i+2]=255;
  height[y*texSize+x]=.34*broad+.12*medium+.04*fine+.014*(h%101)/100-(scratch?.014:0)-(pit?.09:0);
}
for(let y=0;y<texSize;y++)for(let x=0;x<texSize;x++){const h=(a,b)=>height[((b+texSize)%texSize)*texSize+(a+texSize)%texSize];const dx=(h(x+1,y)-h(x-1,y))*.65,dy=(h(x,y+1)-h(x,y-1))*.65;const l=Math.hypot(dx,dy,1);const i=(y*texSize+x)*3;normal[i]=Math.round(127.5*(1-dx/l));normal[i+1]=Math.round(127.5*(1-dy/l));normal[i+2]=Math.round(127.5*(1+1/l));}
const makeMap=async(name,pixels)=>doc.createTexture(name).setMimeType('image/png').setImage(await sharp(pixels,{raw:{width:texSize,height:texSize,channels:3}}).png().toBuffer());
const [surface,roughness,normalMap]=await Promise.all([makeMap('Graphite patina',albedo),makeMap('Directional finish variation',orm),makeMap('Micro-surface height normal',normal)]);
for(const [key,mat] of materials)if(!['cyan','optic','pale'].includes(key)){mat.setBaseColorTexture(surface).setMetallicRoughnessTexture(roughness).setNormalTexture(normalMap).setNormalScale(key==='polymer'?.35:.65);}
let seed=0;
function add(g,mat,geo,pos=[0,0,0],rot=[0,0,0],scale=[1,1,1]){
  geo.scale(...scale);geo.rotateX(rot[0]);geo.rotateY(rot[1]);geo.rotateZ(rot[2]);geo.translate(...pos);
  if(geo.index)geo=geo.toNonIndexed();geo.deleteAttribute('uv');
  if(!geo.getAttribute('normal'))geo.computeVertexNormals();
  const p=geo.getAttribute('position'),c=new Float32Array(p.count*3);const s=++seed;
  for(let i=0;i<p.count;i++){const h=hash(p.getX(i),p.getY(i),p.getZ(i),s);let a=.90+(h%101)/1010; if(mat==='cyan'||mat==='optic')a=.95+(h%11)/220;else if(h%43===0)a=1.17;for(let j=0;j<3;j++)c[3*i+j]=a;}
  const uv=new Float32Array(p.count*2),norm=geo.getAttribute('normal');
  for(let i=0;i<p.count;i++){const ax=Math.abs(norm.getX(i)),ay=Math.abs(norm.getY(i)),az=Math.abs(norm.getZ(i));
    if(ax>=ay&&ax>=az){uv[2*i]=p.getZ(i)*3;uv[2*i+1]=p.getY(i)*3;}else{uv[2*i]=p.getX(i)*3;uv[2*i+1]=(ay>az?p.getZ(i):p.getY(i))*3;}}
  const tangent=new Float32Array(p.count*4);const va=new T.Vector3(),vb=new T.Vector3(),vc=new T.Vector3(),u=new T.Vector3(),v=new T.Vector3(),n=new T.Vector3(),t=new T.Vector3(),bit=new T.Vector3(),cross=new T.Vector3();
  for(let j=0;j<p.count;j+=3){
    va.fromBufferAttribute(p,j);vb.fromBufferAttribute(p,j+1);vc.fromBufferAttribute(p,j+2);u.subVectors(vb,va);v.subVectors(vc,va);
    const a=uv[2*j+2]-uv[2*j],b=uv[2*j+3]-uv[2*j+1],c=uv[2*j+4]-uv[2*j],d=uv[2*j+5]-uv[2*j+1],det=a*d-b*c;
    const tr=Math.abs(det)>1e-10?u.clone().multiplyScalar(d).addScaledVector(v,-b).divideScalar(det):new T.Vector3(1,0,0);
    const br=Math.abs(det)>1e-10?v.clone().multiplyScalar(a).addScaledVector(u,-c).divideScalar(det):new T.Vector3(0,1,0);
    for(let k=j;k<j+3;k++){n.fromBufferAttribute(norm,k).normalize();t.copy(tr).addScaledVector(n,-tr.dot(n));if(t.lengthSq()<1e-12){t.set(Math.abs(n.x)<.9?1:0,Math.abs(n.x)<.9?0:1,0).addScaledVector(n,-(Math.abs(n.x)<.9?n.x:n.y));}t.normalize();cross.crossVectors(n,t);tangent.set([t.x,t.y,t.z,cross.dot(br)<0?-1:1],4*k);}
  }
  geo.setAttribute('tangent',new T.BufferAttribute(tangent,4));
  geo.setAttribute('uv',new T.BufferAttribute(uv,2));geo.setAttribute('color',new T.BufferAttribute(c,3));const parts=groups.get(g).parts;if(!parts.has(mat))parts.set(mat,[]);parts.get(mat).push(geo);
}
function shape(g,mat,outline,depth,x=0,y=0,z=0,bevel=.004,holes=[]){
  const sh=new T.Shape();outline.forEach(([a,b],i)=>i?sh.lineTo(a,b):sh.moveTo(a,b));sh.closePath();
  for(const hole of holes){const h=new T.Path();hole.forEach(([a,b],i)=>i?h.lineTo(a,b):h.moveTo(a,b));h.closePath();sh.holes.push(h);}
  const geo=new T.ExtrudeGeometry(sh,{depth:Math.max(.001,depth-2*bevel),bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,steps:1,curveSegments:10});
  geo.translate(0,0,-(Math.max(.001,depth-2*bevel))/2);add(g,mat,geo,[x,y,z]);
}
function box(g,mat,x,y,z,sx,sy,sz,b=.003){b=Math.min(b,sx/7,sy/7,sz/7);const a=sx/2-b,d=sy/2-b;shape(g,mat,[[-a,-d],[a,-d],[a,d],[-a,d]],sz,x,y,z,b);}
function cyl(g,mat,x,y,z,length,r1,r2=r1,axis='x',sides=24){const rot=axis==='x'?[0,0,-Math.PI/2]:axis==='z'?[Math.PI/2,0,0]:[0,0,0];add(g,mat,new T.CylinderGeometry(r2,r1,length,sides,1,false),[x,y,z],rot);}
function link(g,mat,a,b,width,depth){const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];const geo=new T.BoxGeometry(width,Math.hypot(dx,dy,dz),depth);const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(dx,dy,dz).normalize());geo.applyQuaternion(q);add(g,mat,geo,a.map((v,i)=>(v+b[i])/2));}
// Stock: open graphic silhouette, rubber heel, angled frame, cheek panel.
shape('Body','graphite',[[-.96,.08],[-.72,.09],[-.57,.035],[-.59,-.02],[-.68,-.18],[-.95,-.225],[-.985,-.19]],.09,0,0,0,.006,[[[-.925,-.035],[-.91,-.175],[-.73,-.139],[-.66,-.035]]]);
shape('Body','polymer',[[-.96,.09],[-.68,.09],[-.70,.015],[-.91,.005]],.117,0,0,0,.008);
box('Body','polymer',-.983,-.067,0,.037,.30,.113,.007);for(let i=0;i<9;i++)box('Body','edge',-1.001,-.188+i*.029,0,.006,.009,.092,.001);
box('Body','gunmetal',-.57,.035,0,.29,.108,.103,.008);
// Main body and asymmetric layered shell panels, purely exterior decoration.
shape('Body','gunmetal',[[-.53,.105],[.25,.105],[.33,.06],[.29,-.065],[.03,-.11],[-.25,-.106],[-.49,-.079],[-.55,-.024]],.135,0,0,0,.009);
shape('Body','graphite',[[-.50,-.034],[.18,-.035],[.16,-.11],[-.03,-.145],[-.45,-.12]],.153,0,0,0,.006);
for(const z of [-.073,.073]){
  shape('Body','graphite',[[-.42,.079],[-.17,.079],[-.13,.031],[-.17,-.017],[-.43,-.018]],.013,0,0,z,.003);
  box('Body','edge',-.46,.022,z,.027,.07,.012,.002);
  shape('Body','recess',[[-.12,.083],[.145,.083],[.18,.05],[.155,-.012],[-.12,-.012]],.019,0,0,z,.004);
  box('Core','cyan',.02,.039,z*1.30,.169,.032,.011,.003);
  box('Core','optic',.02,.066,z*1.27,.183,.009,.013,.002);
  for(let i=0;i<4;i++)box('Core','edge',-.078+i*.065,.038,z*1.35,.007,.044,.011,.001);
  box('Body','label',.075,-.045,z*1.13,.09,.034,.013,.004);
  for(let i=0;i<4;i++)box('Body','recess',.047+i*.018,-.045,z*1.24,.011,.004,.003,.0005);
  for(const x of [-.46,-.205,.205])cyl('Body','edge',x,.065,z*1.18,.009,.011,.011,'z',8);
}
// Grip and negative-space trigger-guard silhouette (decorative, solid).
shape('Body','polymer',[[-.40,-.097],[-.26,-.116],[-.325,-.302],[-.439,-.28],[-.455,-.252]],.092,0,0,0,.008);
for(let i=0;i<8;i++)for(const z of [-.05,.05])box('Body','graphite',-.384-i*.004,-.157-i*.014,z,.076,.006,.003,.001);
shape('Body','graphite',[[-.27,-.115],[-.10,-.126],[-.09,-.198],[-.14,-.23],[-.285,-.207]],.034,0,0,0,.006,[[[-.25,-.139],[-.125,-.149],[-.118,-.184],[-.151,-.204],[-.26,-.185]]]);
// Solid removable-looking prop shell, no cavity or functional detail.
shape('MagazineShell','graphite',[[-.09,-.106],[.148,-.1],[.144,-.34],[-.079,-.36],[-.106,-.315]],.104,0,0,0,.007);
for(const z of [-.055,.055])for(let i=0;i<3;i++)box('MagazineShell','gunmetal',-.062+i*.076,-.234,z,.009,.19,.006,.002);
box('MagazineShell','polymer',.021,-.346,0,.242,.025,.119,.004);
// Long front silhouette, raised rails and false dark relief slots.
shape('FrontShroud','graphite',[[.25,.09],[.70,.09],[.755,.051],[.747,-.054],[.27,-.067]],.12,0,0,0,.008);
for(const z of [-.066,.066]){
  for(let i=0;i<9;i++){box('FrontShroud','recess',.293+i*.047,.054,z,.031,.020,.005,.003);box('FrontShroud','gunmetal',.293+i*.047,-.013,z,.035,.027,.011,.002);}
  box('FrontShroud','edge',.49,-.039,z,.41,.011,.006,.001);
}
box('Body','graphite',.08,.115,0,1.31,.026,.078,.003);
for(let i=0;i<31;i++)box('Body','gunmetal',-.552+i*.04,.136,0,.020,.012,.089,.0015);
// Closed imaginary projection tube and stylized front ornament. No bore.
cyl('FrontShroud','gunmetal',.97,.017,0,.56,.031,.027,'x',24);
cyl('FrontShroud','graphite',.77,.017,0,.104,.047,.037,'x',20);
cyl('FrontShroud','edge',1.215,.017,0,.027,.039,.039,'x',20);
shape('FrontShroud','graphite',[[1.217,-.022],[1.25,-.04],[1.424,-.039],[1.449,-.018],[1.449,.055],[1.421,.073],[1.25,.072],[1.217,.051]],.112,0,0,0,.006);
for(const z of [-.06,.06])for(let i=0;i<3;i++){box('FrontShroud','recess',1.267+i*.055,.017,z,.026,.075,.003,.004);box('FrontShroud','edge',1.255+i*.055,.017,z*1.04,.005,.069,.002,.001);}
cyl('FrontShroud','recess',1.453,.017,0,.006,.029,.029,'x',20);cyl('FrontShroud','optic',1.457,.017,0,.004,.015,.015,'x',16);
// Observational optic: capped lens faces, rings and decorative adjustment dials.
for(const x of [-.265,.145]){box('Optic','graphite',x,.164,0,.099,.061,.096,.003);cyl('Optic','gunmetal',x,.224,0,.041,.05,.05,'x',24);}
cyl('Optic','graphite',-.045,.227,0,.53,.041,.041,'x',24);
cyl('Optic','gunmetal',-.316,.227,0,.13,.06,.048,'x',24);cyl('Optic','graphite',.268,.227,0,.16,.045,.075,'x',24);
for(const x of [-.383,-.34,.343])cyl('Optic','edge',x,.227,0,.017,.065+(x>0?.01:0),.065+(x>0?.01:0),'x',24);
cyl('Optic','optic',-.395,.227,0,.007,.052,.052,'x',24);cyl('Optic','optic',.357,.227,0,.007,.061,.061,'x',24);
cyl('Optic','graphite',-.043,.285,0,.065,.038,.038,'y',24);cyl('Optic','edge',-.043,.321,0,.011,.043,.043,'y',24);
for(const z of [-.06,.06]){cyl('Optic','graphite',-.043,.227,z,.043,.042,.042,'z',24);cyl('Optic','edge',-.043,.227,z*1.49,.010,.044,.044,'z',24);}
// Folded support legs lie along the underside for the held prop. Pivots
// expose a reversible cosmetic display pose; not a physics mechanism.
box('Bipod','graphite',.46,-.074,0,.105,.04,.135,.005);
for(const [name,sign] of [['SupportLeft',1],['SupportRight',-1]]){
  cyl(name,'edge',0,0,0,.029,.026,.026,'z',16);
  box(name,'gunmetal',.143,-.018,sign*.016,.263,.027,.027,.004);
  box(name,'graphite',.246,-.018,sign*.016,.087,.035,.033,.003);
  box(name,'polymer',.29,-.025,sign*.016,.029,.045,.059,.004);
  for(let i=0;i<6;i++)box(name,'recess',.044+i*.032,-.027,sign*.031,.011,.008,.002,.0005);
}
// Art pass: raised protective casings, identity panels and restrained colour.
// Bevels, decorative seals and inset-looking surfaces are solely render geometry.
for(const sign of [-1,1]){
  const z=sign;
  shape('Body','ceramic',[[-.415,.069],[-.19,.069],[-.151,.033],[-.185,-.004],[-.418,-.006]],.012,0,0,z*.084,.0035);
  shape('Body','edge',[[-.423,.073],[-.238,.073],[-.232,.067],[-.423,.067]],.005,0,0,z*.091,.001);
  shape('Body','seal',[[-.46,-.051],[-.19,-.058],[-.16,-.083],[-.278,-.107],[-.443,-.101]],.009,0,0,z*.080,.0025);
  shape('Body','ceramic',[[-.146,-.063],[.144,-.063],[.13,-.101],[-.02,-.126],[-.146,-.118]],.009,0,0,z*.080,.003);
  for(const x of [-.397,-.203,.133]){cyl('Body','seal',x,.052,z*.092,.006,.012,.012,'z',16);cyl('Body','edge',x,.052,z*.096,.005,.006,.006,'z',12);}
  // Longpoint's fictional instrument panel, with a sculpted perimeter.
  shape('Core','edge',[[-.137,.09],[.151,.09],[.187,.054],[.163,-.017],[-.137,-.017]],.012,0,0,z*.084,.0035,[[[-.119,-.006],[.149,-.006],[.174,.052],[.146,.077],[-.119,.077]]]);
  shape('Core','seal',[[-.113,.073],[.143,.073],[.167,.052],[.145,-.001],[-.113,-.001]],.008,0,0,z*.089,.002);
  box('Core','optic',.015,.041,z*.096,.198,.052,.010,.004);
  for(let i=0;i<5;i++)box('Core','cyan',-.06+i*.036,.041,z*.102,.031,.023+(i===3?.008:0),.007,.0025);
  for(let i=0;i<6;i++)box('Core','pale',-.074+i*.033,.015,z*.103,.011,.004,.003,.0007);
  box('Core','accent',.138,.04,z*.102,.012,.034,.005,.0015);
  // Three restrained identification stripes rather than a wall of emissive lights.
  for(let i=0;i<3;i++)shape('Body','accent',[[.177+i*.013,-.027],[.184+i*.013,-.027],[.178+i*.013,-.009],[.171+i*.013,-.009]],.003,0,0,z*.083,.0007);
  for(let i=0;i<4;i++)box('Body','pale',-.42+i*.014,.026,z*.094,.008,.004,.002,.0005);
  shape('Body','ceramic',[[-.944,.002],[-.718,.003],[-.735,-.028],[-.927,-.049]],.012,0,0,z*.049,.003);
  for(const x of [-.922,-.756])cyl('Body','edge',x,-.012,z*.06,.004,.007,.007,'z',12);
  // Layered shroud edgework: shallow, solid decorative plates.
  shape('FrontShroud','ceramic',[[.272,.031],[.713,.031],[.731,.003],[.697,-.04],[.278,-.04]],.010,0,0,z*.067,.003);
  for(let i=0;i<8;i++){
    const x=.305+i*.05;
    shape('FrontShroud','seal',[[x-.016,.026],[x+.016,.026],[x+.022,.008],[x+.016,-.015],[x-.016,-.015],[x-.021,.006]],.006,0,0,z*.075,.0018);
    box('FrontShroud','edge',x,-.025,z*.075,.029,.004,.003,.0007);
  }
  for(const x of [.295,.695])cyl('FrontShroud','edge',x,-.043,z*.073,.006,.009,.009,'z',12);
  shape('MagazineShell','ceramic',[[-.057,-.13],[.12,-.125],[.115,-.306],[-.061,-.321]],.009,0,0,z*.056,.003);
  for(let i=0;i<3;i++)box('MagazineShell','seal',-.034+i*.058,-.224,z*.064,.009,.151,.004,.0015);
  for(let i=0;i<3;i++)box('MagazineShell','pale',-.038+i*.016,-.31,z*.065,.009,.004,.003,.0006);
}
// Rounded ridges across the fantasy observation instrument and front casing.
for(const x of [-.365,-.353,-.341,.317,.33,.343])cyl('Optic','edge',x,.227,0,.006,x>0?.075:.063,x>0?.075:.063,'x',32);
for(let i=0;i<16;i++){
  const a=i*Math.PI/8;
  box('Optic','seal',-.043+Math.cos(a)*.037,.323,Math.sin(a)*.037,.006,.008,.006,.001);
}
for(const x of [.84,1.17])cyl('FrontShroud','edge',x,.017,0,.011,.033,.033,'x',28);
// Cosmetic closed contrast disc, reads as a fictional emitting surface.
cyl('FrontShroud','edge',1.459,.017,0,.005,.024,.024,'x',28);
cyl('FrontShroud','optic',1.463,.017,0,.004,.016,.016,'x',28);
cyl('FrontShroud','cyan',1.466,.017,0,.003,.006,.006,'x',20);
// Presentation anchors only. The root's orientation is +X forward, +Y up.
for(const [name,point] of Object.entries({GripAnchor:[-.37,-.19,0],SupportAnchor:[.42,-.096,0],EffectAnchor:[1.475,.017,0],ShoulderAnchor:[-.95,.01,0]}))root.addChild(doc.createNode(name).setTranslation(point));
let triangles=0, primitives=0;
for(const [name,{node,parts}] of groups){const mesh=doc.createMesh(name+'Mesh');for(const [key,list] of parts){const geo=mergeGeometries(list,false);if(!geo)throw Error('merge failed');const p=doc.createPrimitive().setMaterial(materials.get(key));for(const [attribute,semantic,type] of [['position','POSITION','VEC3'],['normal','NORMAL','VEC3'],['color','COLOR_0','VEC3'],['uv','TEXCOORD_0','VEC2'],['tangent','TANGENT','VEC4']])p.setAttribute(semantic,doc.createAccessor().setType(type).setArray(geo.getAttribute(attribute).array).setBuffer(buffer));triangles+=geo.getAttribute('position').count/3;primitives++;mesh.addPrimitive(p);geo.dispose();list.forEach(g=>g.dispose());}if(parts.size)node.setMesh(mesh);else mesh.dispose();}
// Vertex colour factors must lie in [0,1] for glTF conformance.
for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){const c=p.getAttribute('COLOR_0').getArray();for(let i=0;i<c.length;i++)c[i]=Math.min(1,c[i]);}
await doc.transform(weld());
return {doc,triangles,primitives};
}

export async function buildLongpoint(file) {
  const {doc,triangles,primitives}=await createLongpoint();
  await MeshoptEncoder.ready;await MeshoptDecoder.ready;
  const io=new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
  const raw=await io.writeBinary(doc);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
  const bytes=await io.writeBinary(doc);
  const decoded=await io.readBinary(bytes);decoded.getRoot().listExtensionsUsed().forEach(ext=>ext.dispose());
  const plain=await io.writeBinary(decoded);
  const validation=await validator.validateBytes(plain,{uri:'longpoint-decoded.glb'});
  if(validation.issues.numErrors||validation.issues.numWarnings)throw Error(JSON.stringify(validation.issues));
  await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);
  const sha=createHash('sha256').update(bytes).digest('hex');
  const meta={kind:'rigid',url:path.basename(file),bytes:bytes.length,rawBytes:raw.length,hash:sha.slice(0,12),tris:triangles,textures:3,sources:['original'],note:'Original exterior game prop; generated by tools/assets/longpoint.mjs'};
  return {meta,sha256:sha,primitives,validation:validation.issues,review:plain};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw Error('Specify a separate output directory, or use npm run assets:build -- longpoint');
  const dir=path.resolve(process.argv[2]);const result=await buildLongpoint(path.join(dir,'longpoint.glb'));
  await fs.writeFile(path.join(dir,'longpoint.manifest.json'),JSON.stringify({longpoint:result.meta},null,2)+'\n');
  if(process.argv.includes('--review'))await fs.writeFile(path.join(dir,'longpoint-decoded.glb'),result.review);
  const {review,...summary}=result;console.log(JSON.stringify(summary,null,2));
}
