// Brineworks visual enrichment. No simulated world props or collision changes.
// The two tabletop GLBs are already shipped, unlike raw ZIP building blocks.
export const BRINEWORKS_MODULES=Object.freeze([
  Object.freeze({id:'research',file:'research_tabletop_module_refined.glb',fallbackFile:'research_tabletop_module.glb',x:38,z:-39,w:1.7,d:.92,h:.54}),
  Object.freeze({id:'engineering',file:'engineering_tabletop_module_refined.glb',fallbackFile:'engineering_tabletop_module.glb',x:49,z:-39,w:1.65,d:.92,h:.55})
]);
export const BRINEWORKS_STREAM_RADIUS=42;
export const BRINEWORKS_GAUGES=Object.freeze([
  Object.freeze({id:'pressure',x:43,z:-37.58,y:1.95}),
  Object.freeze({id:'tower',x:51,z:-30.54,y:2.06})
]);
export function buildBrineworksDetail(T,loader,height,{enabled=true,reducedMotion=()=>false,streamModels=false}={}){
 const group=new T.Group();group.name='brineworks:detail';
 const ownedGeometry=[],ownedMaterials=[],donors=[],needles=[],fluids=[];
 const status={modules:{},sources:{},triangles:{},gauges:0,detailMeshes:0};
 let vfxEngine=null,nextVfxAt=-Infinity;
 let disposed=false;
 function material(color,roughness,metalness,clearcoat=0){
   const m=new T.MeshPhysicalMaterial({color,roughness,metalness,clearcoat,clearcoatRoughness:.24});
   ownedMaterials.push(m);return m;
 }
 const steel=material(0x606c66,.48,.68,.12),bronze=material(0xb08350,.45,.63,.16);
 const porcelain=material(0xc0b6a0,.78,.15,.14),gasket=material(0x2a3735,.91,.09);
 const brine=new T.MeshPhysicalMaterial({color:0x68aa99,transparent:true,opacity:.68,depthWrite:false,roughness:.19,metalness:.11,clearcoat:.7});
 const signal=new T.MeshStandardMaterial({color:0x87bcb2,emissive:0x3e8b78,emissiveIntensity:.65,roughness:.38});
 ownedMaterials.push(brine,signal);
 function add(parent,shape,mat,x,y,z,name){
   const mesh=new T.Mesh(shape,mat);mesh.name='brineworks:'+name;
   mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;
   parent.add(mesh);ownedGeometry.push(shape);status.detailMeshes++;return mesh;
 }
 const cube=(p,m,x,y,z,w,h,d,n)=>add(p,new T.BoxGeometry(w,h,d),m,x,y,z,n);
 const cyl=(p,m,x,y,z,r,h,n,s=24)=>add(p,new T.CylinderGeometry(r,r,h,s),m,x,y,z,n);
 function tube(p,points,material,r,name){
   const curve=new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v)));
   return add(p,new T.TubeGeometry(curve,Math.max(16,points.length*8),r,8,false),material,0,0,0,name);
 }
 function workstation(s){
   const root=new T.Group();root.name='brineworks:worktop:'+s.id;
   root.position.set(s.x,height(s.x,s.z),s.z);group.add(root);
   // Retain base station mesh and clickable footprint, enrich the work surface.
   for(const side of [-1,1]){
     cube(root,steel,side*.61,1.10,-.47,.36,.07,.11,s.id+':mount');
     for(const x of [side*.47,side*.75])
       cyl(root,bronze,x,1.16,-.47,.035,.034,s.id+':fastener',12);
   }
   const vx=s.id==='research'?.53:-.53;
   cyl(root,brine,vx,1.34,.10,.17,.37,s.id+':sample-glass',36).castShadow=false;
   const fluid=cyl(root,signal,vx,1.24,.10,.128,.15,s.id+':fluid',28);
   fluid.castShadow=false;fluids.push(fluid);
   for(const y of [1.145,1.55])cyl(root,bronze,vx,y,.10,.188,.043,s.id+':ferrule',28);
   tube(root,[[vx,1.55,.1],[vx*.6,1.73,.1],[0,1.69,-.29]],steel,.024,s.id+':conduit');
   for(let i=0;i<4;i++){
     cube(root,porcelain,-vx*.7,1.12+i*.10,-.44,.35,.028,.09,s.id+':instrument-slot');
     cube(root,bronze,-vx*.7,1.12+i*.10,-.39,.10,.017,.008,s.id+':connector');
   }
 }
 function gauge(s){
   const root=new T.Group();root.name='brineworks:gauge:'+s.id;
   root.position.set(s.x,height(s.x,s.z)+s.y,s.z);group.add(root);
   cube(root,gasket,0,0,-.09,.85,.8,.14,s.id+':backplate');
   const face=cyl(root,porcelain,-.1,.05,.02,.28,.065,s.id+':dial',48);face.rotation.x=Math.PI/2;
   add(root,new T.TorusGeometry(.278,.026,8,56),bronze,-.1,.05,.07,s.id+':bezel');
   for(let j=-4;j<=4;j++){
      const angle=j*.26;
      const tick=cube(root,steel,-.1+Math.sin(angle)*.226,.05+Math.cos(angle)*.226,.08,.016,.054,.013,s.id+':tick');
      tick.rotation.z=-angle;
   }
   const needle=cube(root,steel,-.1,.05,.095,.014,.2,.012,s.id+':needle');
   needle.geometry.translate(0,.092,0);needles.push(needle);
   cyl(root,signal,.27,.06,.07,.066,.09,s.id+':pilot',18).rotation.x=Math.PI/2;
   cube(root,porcelain,.27,-.20,.04,.21,.08,.045,s.id+':status-plaque');
   status.gauges++;
 }
 const pending=[];
 let streamRequested=false;
 if(enabled){
   for(const s of BRINEWORKS_MODULES)workstation(s);
   for(const s of BRINEWORKS_GAUGES)gauge(s);
   // Pipes hug the existing pump/tower shells, without changing traversability.
   const py=height(43,-39),ty=height(51,-32);
   tube(group,[[41.3,py+1.14,-39.5],[41.45,py+1.73,-39.5],[42.2,py+1.77,-39.25]],bronze,.06,'pressure-distribution');
   tube(group,[[52.6,ty+2.71,-32.3],[52.5,ty+1.9,-32.3],[51.95,ty+1.5,-32.3]],steel,.064,'tower-distribution');
 }
 // Defer expensive 58k-triangle GLB decoding and upload until the player
 // approaches Brineworks. Procedural equipment remains visible at distance.
 function startModuleLoads(){
   if(streamRequested||disposed||!enabled)return;
   streamRequested=true;
   for(const s of BRINEWORKS_MODULES){
   status.modules[s.id]='loading';
   if(!loader?.loadAsync){status.modules[s.id]='fallback';continue;}
   pending.push(Promise.resolve().then(async()=>{
     try {return {gltf:await loader.loadAsync('/client/asset-derivatives/brineworks/'+s.file),source:'remeshed'};}
     catch(refinedError){
       console.warn('[brineworks] '+s.id+' refined GLB unavailable; using original:',refinedError.message||refinedError);
       return {gltf:await loader.loadAsync('/client/art-assets/'+s.fallbackFile),source:'original-fallback'};
     }
   }).then(({gltf,source})=>{
     if(disposed)return;
     const root=gltf?.scene;if(!root)throw Error('Missing model scene');
     root.updateMatrixWorld(true);
     const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
     if(![size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>.0001))throw Error('Invalid model bounds');
     const scale=Math.min(2.5,s.w/size.x,s.h/size.y,s.d/size.z);
     root.traverse(obj=>{
       if(!obj.isMesh)return;
       obj.castShadow=true;obj.receiveShadow=true;
       const finish=(old)=>{
         const out=new T.MeshPhysicalMaterial({
           color:old?.color?.clone()??new T.Color(0xb0b3a8),
           map:old?.map??null,normalMap:old?.normalMap??null,
           roughnessMap:old?.roughnessMap??null,metalnessMap:old?.metalnessMap??null,
           aoMap:old?.aoMap??null,aoMapIntensity:old?.aoMapIntensity??1,
           normalScale:old?.normalScale?.clone?.()??new T.Vector2(1,1),
           emissiveMap:old?.emissiveMap??null,
           emissive:old?.emissive?.clone()??new T.Color(0),
           emissiveIntensity:Math.min(1,old?.emissiveIntensity??1),
           roughness:Math.min(.94,Math.max(.2,old?.roughness??.65)),
           metalness:Math.min(.96,Math.max(.03,old?.metalness??.28)),
           clearcoat:old?.clearcoat??.14,clearcoatRoughness:old?.clearcoatRoughness??.24,
           side:old?.side??T.FrontSide,transparent:!!old?.transparent,opacity:old?.opacity??1,
           alphaTest:old?.alphaTest??0,depthWrite:old?.depthWrite??true
         });
         ownedMaterials.push(out);return out;
       };
       obj.material=Array.isArray(obj.material)?obj.material.map(finish):finish(obj.material);
     });
     // Normalize the GLB in its native coordinates *before* applying fit scale.
     // Scaling root while translating it independently displaced off-origin donors.
     root.position.set(-center.x,-bounds.min.y,-center.z);
     const fitted=new T.Group();fitted.name='brineworks:fit:'+s.id;
     fitted.scale.setScalar(scale);fitted.add(root);
     const holder=new T.Group();holder.name='brineworks:refined-glb:'+s.id;
     holder.position.set(s.x,height(s.x,s.z)+1.12,s.z-.04);
     holder.add(fitted);group.add(holder);donors.push(root);
     status.modules[s.id]='ready';
     status.sources[s.id]=source;
     let triangles=0;
     root.traverse(obj=>{if(obj.isMesh){const geom=obj.geometry;triangles+=(geom.index?.count??geom.attributes.position?.count??0)/3;}});
     status.triangles[s.id]=triangles;
   }).catch(err=>{
     status.modules[s.id]='fallback';
     console.warn('[brineworks] '+s.id+' tabletop donor failed; preserving station: '+(err.message||err));
   }));
   }
 }
 if(streamModels&&enabled)for(const s of BRINEWORKS_MODULES)status.modules[s.id]='dormant';
 if(!streamModels)startModuleLoads();
 return {
   group,get ready(){return Promise.all(pending);},
   stats:()=>({...status,modules:{...status.modules},sources:{...status.sources},triangles:{...status.triangles}}),
   attachVfx(engine){vfxEngine=engine;},
   update(dt,t,focus){
     if(disposed||!enabled)return;
     if(streamModels&&!streamRequested&&focus&&Number.isFinite(focus.x)&&Number.isFinite(focus.z)&&
        Math.hypot(focus.x-44,focus.z+36)<=BRINEWORKS_STREAM_RADIUS)startModuleLoads();
     const calm=!!reducedMotion?.();
     for(let i=0;i<needles.length;i++)needles[i].rotation.z=calm?0:Math.sin(t*.75+i)*.28;
     signal.emissiveIntensity=calm?.48:.59+.12*Math.sin(t*1.15);
     for(let i=0;i<fluids.length;i++)fluids[i].scale.y=calm?1:.9+.1*Math.sin(t*.82+i);
     // Local condensation/microdroplets: budgeted by the shared VFX engine,
     // distance-capped, low-frequency, and suppressed by reduced-motion preferences.
     if(vfxEngine?.burst&&!calm&&Number.isFinite(t)&&focus&&
        Math.hypot(focus.x-43,focus.z+36)<24&&t>=nextVfxAt){
       nextVfxAt=t+2.6;
       vfxEngine.burst({at:[43,height(43,-37.58)+2.10,-37.58],shape:'sphere',radius:.12,
         count:5,color:0x9bc8bc,color2:0xd6e3d7,blend:'alpha',
         speed:[.045,.19],dir:[0,1,0],spread:1.2,life:[.6,1.15],size:[.018,.048]});
     }
   },
   dispose(){
     if(disposed)return;
     disposed=true;group.removeFromParent();
     for(const root of donors)root.traverse(obj=>{if(obj.isMesh)obj.geometry?.dispose?.();});
     for(const geo of ownedGeometry)geo.dispose();
     for(const mat of ownedMaterials)mat.dispose();
   }
 };
}
