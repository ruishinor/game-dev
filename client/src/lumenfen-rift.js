// Lumenfen's own rootglass thresholds. Not a recolour or modification of
// the owner-approved exterior Phase Scar construction.
export function makeLumenfenRift(T,kind='lumenfen_entry'){
 const group=new T.Group();group.name='lumenfen:rootglass:'+kind;
 const returning=kind==='lumenfen_return';
 const crossing=kind==='lumenfen_spring'||kind==='lumenfen_crown';
 const jade=new T.MeshStandardMaterial({color:0x172c2d,roughness:.62,metalness:.16,emissive:0x163b37,emissiveIntensity:.35});
 const glass=new T.MeshStandardMaterial({color:crossing?0x88d1c2:0x7fbeac,roughness:.25,metalness:.15,transparent:true,opacity:.8,emissive:0x1b5e63,emissiveIntensity:.4});
 const membrane=new T.ShaderMaterial({
   transparent:true,side:T.DoubleSide,depthWrite:false,uniforms:{uTime:{value:0},uHue:{value:returning?.45:crossing?.22:0}},
   vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:'uniform float uTime;uniform float uHue;varying vec2 vUv;void main(){vec2 p=(vUv-.5)*vec2(1.,1.55);float edge=1.-smoothstep(.65,.94,length(p));float wave=sin(vUv.y*28.+sin(vUv.x*12.+uTime*.33)*2.-uTime*.7);float fold=sin(vUv.x*14.-vUv.y*9.+uTime*.43);vec3 deep=vec3(.035,.12,.14);vec3 bright=mix(vec3(.16,.53,.42),vec3(.35,.68,.75),uHue);vec3 col=mix(deep,bright,.42+.21*wave+.17*fold);gl_FragColor=vec4(col,edge*(.72+.08*wave));}',
 });
 const path=(side,back=false)=>{
   const pts=[];
   for(let i=0;i<=22;i++){
     const t=i/22,curve=Math.sin(t*Math.PI);
     pts.push(new T.Vector3(side*(.72+curve*.45)+(back?.12:0),t*5.5,back?-.21:.03+Math.sin(t*7+side)*.09));
   }
   return new T.CatmullRomCurve3(pts);
 };
 for(const side of [-1,1]){
   group.add(new T.Mesh(new T.TubeGeometry(path(side),50,.19,7,false),jade));
   const cap=new T.Mesh(new T.TubeGeometry(path(side,true),50,.042,5,false),glass);group.add(cap);
   for(let i=0;i<4;i++){
     const t=.24+i*.17,p=path(side).getPoint(t);
     const branch=new T.Mesh(new T.ConeGeometry(.18,.8,5),jade);
     branch.position.set(p.x+side*.2,p.y,p.z-.02);branch.rotation.z=-side*(.62+i*.08);group.add(branch);
   }
 }
 const bridge=new T.Mesh(new T.TorusGeometry(1.0,.16,8,36,Math.PI),jade);
 bridge.position.y=5.38;bridge.rotation.z=Math.PI;bridge.scale.set(1.12,.65,.8);group.add(bridge);
 const surface=new T.Mesh(new T.PlaneGeometry(1.7,4.95,8,24),membrane);
 surface.name='lumenfen:membrane';surface.position.set(0,2.65,0);group.add(surface);
 const interior=new T.Mesh(new T.PlaneGeometry(1.55,4.6),membrane.clone());
 interior.position.set(.06,2.65,-.19);interior.rotation.y=.09;group.add(interior);
 const leafMat=new T.MeshBasicMaterial({color:crossing?0xa6e8ce:0x82d9a3,transparent:true,opacity:.75,depthWrite:false});
 const petals=[];
 for(let i=0;i<22;i++){
   const angle=i*2.39996;
   const r=.75+(i%7)*.14;
   const petal=new T.Mesh(new T.IcosahedronGeometry(.035+(i%4)*.014,0),leafMat);
   petal.position.set(Math.cos(angle)*r,(i*.317)%5.2+.2,Math.sin(angle)*.3);
   group.add(petal);petals.push({mesh:petal,angle,base:petal.position.y,r});
 }
 const light=new T.PointLight(returning?0x9cd9ad:0x74bcb4,2.4,12,2);light.position.set(0,2.7,.8);group.add(light);
 return {group,height:5.6,radius:2.45,hover:0,
  update(dt,st={}){const t=st.reducedMotion?0:(this._t=(this._t||0)+Math.min(.1,Math.max(0,dt||0)));membrane.uniforms.uTime.value=t;interior.material.uniforms.uTime.value=t;
   for(const p of petals){p.mesh.position.y=p.base+(st.reducedMotion?0:.12*Math.sin(t*.8+p.angle));p.mesh.position.x=Math.cos(p.angle+t*.12)*p.r;}
  },
  dispose(){group.traverse(o=>{if(o.isMesh){o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();}});}
 };
}
