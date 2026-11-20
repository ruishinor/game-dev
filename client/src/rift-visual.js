// Original scene-scale interference structure. Persistent membrane is a
// presentation of the authoritative snapshot, not the encounter clock.
import { PHASE_RIFT_RADIUS } from '../../shared/world.js';
const PHASES={dormant:.18,opening:.62,unstable:1,stabilized:.8,cooling:.25};
function palette(T){
 const std=(color,roughness=.68,metalness=.4)=>new T.MeshStandardMaterial({color,roughness,metalness});
 return {stone:std(0x3d4645,.93,.1),steel:std(0x66716d,.59,.62),dark:std(0x283536,.72,.52),brass:std(0x977d56,.62,.52),glass:new T.MeshStandardMaterial({color:0x96bfb1,emissive:0x335f57,emissiveIntensity:.65,roughness:.34,metalness:.34})};
}
function dispose(group){const mats=new Set(),geos=new Set();group.traverse(o=>{if(o.isMesh){geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);if(o.isInstancedMesh)o.dispose?.();}else if(o.isLine){geos.add(o.geometry);mats.add(o.material);}});for(const g of geos)g.dispose();for(const m of mats)m.dispose();}
function mesh(T,root,geometry,material,x=0,y=0,z=0){const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
function tube(T,pts,r,mat,root){const curve=new T.CatmullRomCurve3(pts.map(p=>new T.Vector3(...p)));return mesh(T,root,new T.TubeGeometry(curve,30,r,8,false),mat);}
function membraneGeometry(T){
 const rows=52,cols=26,vertices=[],uv=[],index=[];
 for(let j=0;j<=rows;j++){
  const v=j/rows,y=.72+v*3.98,edge=Math.pow(Math.sin(Math.PI*v),.73),center=.31*Math.sin(v*5.6)-.17;
  for(let i=0;i<=cols;i++){
   const u=i/cols,s=u*2-1;
   vertices.push(center+s*edge*(1.12+.15*Math.sin(v*17)),y,.10*Math.sin(v*10+s*6)+edge*.22*Math.cos(s*Math.PI/2));
   uv.push(u,v);
   if(j<rows&&i<cols){const a=j*(cols+1)+i;index.push(a,a+1,a+cols+1,a+1,a+cols+2,a+cols+1);}
  }
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}
const vertex=`varying vec2 vUv; uniform float uTime;uniform float uPhase;void main(){vUv=uv;vec3 p=position;p.z+=sin(p.y*5.2+uTime*1.1)*sin(uv.x*3.14159)*.13*uPhase;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
const fragment=`varying vec2 vUv;uniform float uTime;uniform float uPhase;uniform float uStable;void main(){vec2 uv=vUv;float x=uv.x*2.-1.;float band=sin(uv.y*22.+sin(x*5.+uTime*.43)*3.+uTime*.82);float thin=pow(.5+.5*sin(x*27.+uv.y*35.+band*3.),11.);float crease=exp(-abs(x+.18*sin(uv.y*10.+uTime*.32))*8.);float edge=smoothstep(0.,.12,uv.x)*smoothstep(0.,.12,1.-uv.x)*smoothstep(0.,.1,uv.y)*smoothstep(0.,.1,1.-uv.y);float fil=.3+.7*pow(1.-abs(x),1.4);vec3 dark=vec3(.045,.054,.092);vec3 luminous=mix(vec3(.67,.55,.87),vec3(.48,.78,.72),uStable);vec3 c=mix(dark,luminous,clamp(crease*.72+thin*.28+max(band,0.)*.13,0.,1.));gl_FragColor=vec4(c,edge*fil*clamp(uPhase*(.49+crease*.47+thin*.25),0.,.94));}`;

// Bounded ambient layers shared by the Reach Phase Scar and its Expanse return.
// Cosmetic only: no new hazard, target, collision, activation or teleport logic.
export const RIFT_FIELD_LIMITS=Object.freeze({motes:32,filaments:6,segments:20,lights:1});
const DEPTH_FS=[
 'varying vec2 vUv;',
 'uniform float uTime; uniform float uPhase; uniform float uStable;',
 'void main(){',
 ' vec2 p=vUv*2.0-1.0;',
 ' float r=length(vec2(p.x*0.92,p.y*0.74));',
 ' float a=atan(p.y,p.x);',
 ' float spiral=0.5+0.5*sin(14.0*r-a*6.0-uTime*0.64+sin(p.y*9.0)*0.6);',
 ' float rings=pow(0.5+0.5*sin(32.0*r-uTime*1.2+a*2.0),8.0);',
 ' float throat=1.0-smoothstep(0.12,0.96,r);',
 ' float edge=smoothstep(0.0,0.1,vUv.x)*smoothstep(0.0,0.1,1.0-vUv.x)*smoothstep(0.0,0.09,vUv.y)*smoothstep(0.0,0.09,1.0-vUv.y);',
 ' vec3 dark=vec3(0.012,0.023,0.058);',
 ' vec3 teal=vec3(0.16,0.42,0.45);',
 ' vec3 violet=vec3(0.46,0.25,0.61);',
 ' vec3 c=mix(dark,mix(teal,violet,0.5+0.5*sin(a*2.0-uTime*0.18)),0.22+spiral*0.38);',
 ' c+=rings*(0.12+0.14*uStable)*vec3(0.58,0.72,1.0);',
 ' gl_FragColor=vec4(c,edge*min(0.94,(0.42+throat*0.30)*uPhase+0.20));',
 '}'
].join('\n');

function createRiftField(T,group,site,ground,uniforms){
 const depth=new T.Mesh(membraneGeometry(T),new T.ShaderMaterial({
  uniforms,vertexShader:vertex,fragmentShader:DEPTH_FS,
  transparent:true,depthWrite:false,side:T.DoubleSide
 }));
 depth.name='rift:depth-veil';depth.position.z=-.29;depth.renderOrder=5;group.add(depth);

 // A short, ground-hugging signature halo, never the Reach danger telegraph.
 const geo=new T.RingGeometry(PHASE_RIFT_RADIUS+.10,PHASE_RIFT_RADIUS+.19,80);
 geo.rotateX(-Math.PI/2);
 if(site&&ground){
  const pos=geo.attributes.position,h=ground(site.x,site.z),co=Math.cos(.9),si=Math.sin(.9);
  for(let i=0;i<pos.count;i++){
   const x=pos.getX(i),z=pos.getZ(i);
   pos.setY(i,ground(site.x+x*co+z*si,site.z-x*si+z*co)-h+.07);
  }
  pos.needsUpdate=true;geo.computeVertexNormals();
 }else geo.translate(0,.07,0);
 const halo=new T.Mesh(geo,new T.MeshBasicMaterial({
  color:0x75bdd1,transparent:true,opacity:.26,side:T.DoubleSide,
  blending:T.AdditiveBlending,depthWrite:false
 }));
 halo.name='rift:footprint-halo';halo.renderOrder=7;group.add(halo);

 const arcs=new Float32Array(RIFT_FIELD_LIMITS.filaments*RIFT_FIELD_LIMITS.segments*6);
 const arcGeo=new T.BufferGeometry();
 arcGeo.setAttribute('position',new T.BufferAttribute(arcs,3).setUsage(T.DynamicDrawUsage));
 const filaments=new T.LineSegments(arcGeo,new T.LineBasicMaterial({
  color:0xb0d3f9,transparent:true,opacity:.6,
  blending:T.AdditiveBlending,depthWrite:false
 }));
 filaments.name='rift:filaments';filaments.frustumCulled=false;filaments.renderOrder=8;group.add(filaments);

 const motes=new T.InstancedMesh(new T.IcosahedronGeometry(.055,0),new T.MeshBasicMaterial({
  color:0xffffff,transparent:true,opacity:.78,blending:T.AdditiveBlending,depthWrite:false
 }),RIFT_FIELD_LIMITS.motes);
 motes.name='rift:field-motes';motes.instanceMatrix.setUsage(T.DynamicDrawUsage);
 motes.frustumCulled=false;motes.renderOrder=9;group.add(motes);
 const dummy=new T.Object3D();
 for(let i=0;i<RIFT_FIELD_LIMITS.motes;i++){
  motes.setColorAt(i,new T.Color(i%3===0?0xc6a6ff:i%3===1?0x74cfc4:0xdce6ff));
 }
 motes.instanceColor.needsUpdate=true;

 const light=new T.PointLight(0x86acdb,0,8,2);
 light.name='rift:ambient-light';light.position.set(0,2.5,.35);
 light.castShadow=false;group.add(light);

 function update(t,phase,st){
  const q=Math.min(2,Math.max(0,Number.isFinite(st.effectsQuality)?st.effectsQuality:1));
  const level=PHASES[phase]??PHASES.dormant;
  depth.visible=q>0;
  halo.visible=q>0;
  halo.material.opacity=.10+level*.28;
  filaments.visible=q>0;
  filaments.material.opacity=.2+level*.47;
  const count=q===0?0:q===1?14:RIFT_FIELD_LIMITS.motes;
  motes.count=count;
  const motion=st.reducedMotion?0:1;
  for(let i=0;i<RIFT_FIELD_LIMITS.filaments;i++){
   const polarity=i%2?1:-1,magnitude=i<2?.99:i<4?.65:.28;
   for(let j=0;j<RIFT_FIELD_LIMITS.segments;j++){
    for(let k=0;k<2;k++){
     const p=(j+k)/RIFT_FIELD_LIMITS.segments;
     const y=.77+p*3.86,edge=Math.pow(Math.sin(Math.PI*p),.73);
     const x=.31*Math.sin(p*5.6)-.17+polarity*magnitude*edge*(1.12+.15*Math.sin(p*17))
      +.06*motion*Math.sin(p*22+t*(1.1+i*.15)+i*1.7)*edge;
     const z=.21*Math.cos(p*13+polarity)+.12*motion*Math.sin(p*10-t*.7+i)+.18;
     const off=(i*RIFT_FIELD_LIMITS.segments*2+j*2+k)*3;
     arcs[off]=x;arcs[off+1]=y;arcs[off+2]=z;
    }
   }
  }
  arcGeo.attributes.position.needsUpdate=true;
  for(let i=0;i<count;i++){
   const seed=(i*.61803398875)%1;
   const angle=(i*2.39996)+t*(.28+(i%4)*.10)*motion;
   const radius=.6+((i*7)%13)/13*1.65;
   dummy.position.set(Math.sin(angle)*radius,.78+((seed+t*.10*motion)%1)*3.9,Math.cos(angle)*.60+.28);
   const size=.6+(i%5)*.19;
   dummy.scale.setScalar(size*(.75+.25*Math.sin(i*1.6+t*2.3*motion)));
   dummy.updateMatrix();motes.setMatrixAt(i,dummy.matrix);
  }
  if(count)motes.instanceMatrix.needsUpdate=true;
  motes.material.opacity=.29+level*.53;
  // One bounded local light only for high-quality close-up; disabled at distance.
  light.intensity=q>=2&&st.cameraDistance<24&&!st.reducedMotion ? level*1.05:0;
 }
 return {update};
}

export function buildRift(T,site,ground,{returning=false}={}){
 const group=new T.Group();group.name=returning?'rift:severance-return':'rift:phase-scar';const m=palette(T);
 // Buried octagonal foundation is wide enough for its visible support feet.
 mesh(T,group,new T.CylinderGeometry(2.24,2.43,.58,12),m.stone,0,-.2,0);
 mesh(T,group,new T.CylinderGeometry(1.75,2.05,.16,12),m.dark,0,.13,0);
 for(const sign of [-1,1]){
  const x=sign*1.6;
  mesh(T,group,new T.BoxGeometry(.92,.31,1.48),m.steel,x,.26,0);
  const pts=sign<0?[[-1.75,.37,.28],[-1.57,1.45,.17],[-1.11,3.08,.05],[-.77,4.65,.24]]:[[1.75,.37,-.21],[1.56,1.72,-.12],[1.13,3.36,.10],[.42,4.95,-.04]];
  tube(T,pts,.18,m.steel,group);
  const brace=[ [x,.32,.57],[sign*1.86,1.25,.46],[sign*1.34,2.78,.16] ];
  tube(T,brace,.11,m.dark,group);tube(T,pts.map(([a,b,c])=>[a-sign*.12,b,c+.12]),.034,m.brass,group);
  for(let i=0;i<3;i++){const coil=mesh(T,group,new T.CylinderGeometry(.24,.24,.18,10),m.brass,x-sign*.1,.58+i*.29,.4);coil.rotation.z=sign*.22;}
  const fin=mesh(T,group,new T.BoxGeometry(.3,.85,.48),m.dark,sign*1.29,2.74,.12);fin.rotation.z=sign*.18;
  mesh(T,group,new T.BoxGeometry(.11,.19,.22),m.glass,sign*1.16,3.12,.28);
 }
 const uniforms={uTime:{value:0},uPhase:{value:returning?PHASES.stabilized:PHASES.dormant},uStable:{value:returning?1:0}};
 const skin=new T.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:T.DoubleSide});
 const surface=mesh(T,group,membraneGeometry(T),skin);surface.name='rift:interference-membrane';surface.castShadow=false;surface.receiveShadow=false;surface.renderOrder=6;
 const atmosphere=createRiftField(T,group,site,ground,uniforms);
 // Only the original Reach anomaly owns hazardous phases and a warning ring.
 let ring=null;
 if(!returning){
 const r=site?.hazard??5.5,geo=new T.RingGeometry(r-.16,r,96);geo.rotateX(-Math.PI/2);
 // Existing object yaw is .9 radians; match its local-to-world transform.
 if(site&&ground){const pos=geo.attributes.position,h=ground(site.x,site.z),co=Math.cos(.9),si=Math.sin(.9);
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,ground(site.x+x*co+z*si,site.z-x*si+z*co)-h+.085);}
  pos.needsUpdate=true;geo.computeVertexNormals();
 }else geo.translate(0,.09,0);
 ring=mesh(T,group,geo,new T.MeshBasicMaterial({color:0xe2a07c,transparent:true,opacity:.88,side:T.DoubleSide,depthWrite:false}));
 ring.name='rift:persistent-warning';ring.visible=false;ring.castShadow=false;ring.receiveShadow=false;ring.renderOrder=8;
 }
 let time=0;
 return {group,height:5.15,radius:PHASE_RIFT_RADIUS,hover:0,update(dt,st){
   const phase=returning?'stabilized':Object.hasOwn(PHASES,st.riftPhase)?st.riftPhase:'dormant';
   if(!st.reducedMotion)time=(time+Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0)))%4096;
   uniforms.uTime.value=st.reducedMotion?0:time;
   uniforms.uPhase.value=PHASES[phase];uniforms.uStable.value=phase==='stabilized'?1:0;
   if(ring)ring.visible=phase==='unstable'&&st.riftWarning>0;
   atmosphere.update(time,phase,st);
 },dispose(){dispose(group);}};
}
export function buildRiftControl(T,regulator){
 const group=new T.Group();group.name=regulator?'rift:regulator':'rift:indexer';const m=palette(T);
 mesh(T,group,new T.CylinderGeometry(.5,.64,.26,8),m.stone,0,.04,0);
 mesh(T,group,new T.BoxGeometry(.64,.73,.58),m.dark,0,.5,0);
 const cap=mesh(T,group,new T.BoxGeometry(.86,.22,.65),m.steel,0,.94,0);cap.rotation.x=-.18;
 const glass=mesh(T,group,new T.BoxGeometry(.56,.035,.36),m.glass,0,1.04,.02);glass.rotation.x=-.18;
 for(const side of [-1,1])mesh(T,group,new T.CylinderGeometry(.065,.065,.36,10),m.brass,side*.29,.69,.19);
 if(regulator)mesh(T,group,new T.CylinderGeometry(.24,.24,.23,10),m.brass,0,1.31,-.16);
 else mesh(T,group,new T.CylinderGeometry(.04,.08,.52,8),m.steel,0,1.26,-.17);
 return {group,height:1.55,radius:.65,hover:0,update(dt,st){m.glass.emissiveIntensity=st.riftPhase==='unstable'?1:st.riftPhase==='stabilized'?.52:.2;},dispose(){dispose(group);}};
}
