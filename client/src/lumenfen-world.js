// Independent, organic biome built on the Expanse's shared-authority principles,
// not its rock kit: liquid basins, rootglass canopy, fungal understorey and mist.
import {LUMENFEN,FEN_TREES,FEN_POOLS,fenHeight,inLumenfen} from '../../shared/lumenfen.js';
import {buildLumenfenSites} from './lumenfen-sites.js';
export function buildLumenfenWorld(T,scene,{sky,ambient,sun,detail=1,reducedMotion=()=>false}={}){
 const P=LUMENFEN,group=new T.Group();group.name='lumenfen:landscape';group.visible=false;scene.add(group);
 const soil=new T.MeshStandardMaterial({vertexColors:true,roughness:.95});
 const foliage=new T.MeshStandardMaterial({color:0x245c4b,roughness:.83,side:T.DoubleSide});
 const bark=new T.MeshStandardMaterial({color:0x30403e,roughness:.93});
 const leaf=new T.MeshStandardMaterial({color:0x427968,roughness:.72,emissive:0x143c35,emissiveIntensity:.5});
 const glass=new T.MeshStandardMaterial({color:0x83c7af,roughness:.4,transparent:true,opacity:.58,emissive:0x2a8279,emissiveIntensity:.75,depthWrite:false,side:T.DoubleSide});
 const water=new T.MeshPhysicalMaterial({color:0x183f43,roughness:.18,metalness:.16,transparent:true,opacity:.72,depthWrite:false,side:T.DoubleSide,emissive:0x0d2728,emissiveIntensity:.3});
 const w=(P.hw+35)*2,d=(P.hd+35)*2;
 const floor=new T.PlaneGeometry(w,d,155,175);floor.rotateX(-Math.PI/2);floor.translate(P.x,0,P.z);
 const a=floor.attributes.position,colors=[];
 const c=new T.Color();
 for(let i=0;i<a.count;i++){
  const x=a.getX(i),z=a.getZ(i),h=fenHeight(x,z);a.setY(i,h);
  const low=h<-.13,alt=Math.sin(x*.16+z*.09)*.16+Math.cos(z*.11)*.13;
  c.setHSL(low?.48:.37,low?.18:.28,Math.max(.11,Math.min(.33,(low?.18:.23)+alt*.13)));
  colors.push(c.r,c.g,c.b);
 }
 floor.setAttribute('color',new T.Float32BufferAttribute(colors,3));floor.computeVertexNormals();
 const mesh=new T.Mesh(floor,soil);mesh.receiveShadow=true;group.add(mesh);
 // Root pillars and translucent leaf crowns are instanced and remain aligned
 // with their server-authoritative trunk colliders.
 const trunks=new T.InstancedMesh(new T.CylinderGeometry(.34,.5,1,7),bark,FEN_TREES.length);
 const crowns=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),foliage,FEN_TREES.length);
 const caps=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),leaf,FEN_TREES.length);
 const m=new T.Matrix4(),p=new T.Vector3(),s=new T.Vector3(),q=new T.Quaternion();
 FEN_TREES.forEach((tree,i)=>{
  const y=fenHeight(tree.x,tree.z),h=tree.h;
  p.set(tree.x,y+h*.43,tree.z);s.set(tree.r*1.05,h*.86,tree.r*.98);m.compose(p,q,s);trunks.setMatrixAt(i,m);
  p.set(tree.x,y+h*.92,tree.z);s.set(tree.r*2.5,h*.26,tree.r*2.2);m.compose(p,q,s);crowns.setMatrixAt(i,m);
  p.set(tree.x+tree.r*.35,y+h*1.04,tree.z-tree.r*.2);s.set(tree.r*1.95,h*.16,tree.r*1.7);m.compose(p,q,s);caps.setMatrixAt(i,m);
 });
 for(const i of [trunks,crowns,caps]){i.receiveShadow=true;i.castShadow=false;group.add(i);}
 // Water follows the shared floor instead of introducing a second walkable deck.
 for(const pool of FEN_POOLS){
  const g=new T.CircleGeometry(1,58);g.rotateX(-Math.PI/2);
  const o=new T.Mesh(g,water);o.name='lumenfen:mirrorpool';o.scale.set(pool.rx,1,pool.rz);
  o.position.set(pool.x,fenHeight(pool.x,pool.z)-.12,pool.z);group.add(o);
  const rim=new T.Mesh(new T.TorusGeometry(1,.015,5,64),glass);
  rim.rotation.x=Math.PI/2;rim.scale.set(pool.rx, pool.rz,1);rim.position.set(pool.x,fenHeight(pool.x,pool.z)+.02,pool.z);group.add(rim);
 }
 // Low fungal clusters: explicitly cosmetic, never blocking entry or combat.
 const spores=[];for(let i=0;i<145*detail;i++){
  const a=i*2.399963,w=Math.sqrt((i+.5)/145),x=P.x+Math.cos(a)*w*125,z=P.z+Math.sin(a)*w*145;
  if(FEN_TREES.some(t=>Math.hypot(t.x-x,t.z-z)<t.r+1.8))continue;
  const pod=new T.Mesh(new T.SphereGeometry(.11+(i%4)*.06,6,5),glass);
  pod.position.set(x,fenHeight(x,z)+.18+(i%5)*.09,z);pod.scale.y=1.35;group.add(pod);spores.push(pod);
 }
 const sites=buildLumenfenSites(T);group.add(sites.group);
 const glowLight=new T.PointLight(0x64ba9e,3.0,34,2);glowLight.position.set(P.x+20,7,P.z-22);group.add(glowLight);
 let prior=null,clock=0;
 const active=eye=>!!eye&&inLumenfen(eye.x,eye.z,35);
 return {group,stats:()=>({trees:FEN_TREES.length,pools:FEN_POOLS.length,spores:spores.length,landmarks:sites.stats()}),
  update(dt,t,eye){
   const inside=active(eye);group.visible=inside;
   if(inside){
    if(!prior){prior={fog:scene.fog?{color:scene.fog.color.getHex(),near:scene.fog.near,far:scene.fog.far}:null,
       sky:sky?.position.clone(),ambient:ambient?.intensity,sun:sun?.intensity};}
    if(scene.fog){scene.fog.color.setHex(0x1d3436);scene.fog.near=36;scene.fog.far=200;}
    if(ambient)ambient.intensity=.85;if(sun)sun.intensity=1.1;
    if(sky)sky.position.set(eye.x,0,eye.z);
    clock+=Math.max(0,dt||0);
    sites.update(dt,typeof reducedMotion==='function' ? reducedMotion() : !!reducedMotion);
    if(!detail)return;
    for(let i=0;i<spores.length;i++)spores[i].scale.y=1.1+.4*Math.sin(clock*.6+i*.17);
   }else if(prior){
    if(prior.fog&&scene.fog){scene.fog.color.setHex(prior.fog.color);scene.fog.near=prior.fog.near;scene.fog.far=prior.fog.far;}
    if(sky&&prior.sky)sky.position.copy(prior.sky);
    if(ambient&&Number.isFinite(prior.ambient))ambient.intensity=prior.ambient;
    if(sun&&Number.isFinite(prior.sun))sun.intensity=prior.sun;
    prior=null;
   }
  }
 };
}
