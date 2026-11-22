// Native marsh wildlife: lantern drifters and rooted quadruped stalkers.
// No Severance soldier rigs or ash textures are reused.
export function makeFenLantern(T){
 const group=new T.Group();group.name='lumenfen:lantern-drifter';
 const shell=new T.MeshStandardMaterial({color:0x28584d,roughness:.55,metalness:.08,emissive:0x11392c,emissiveIntensity:.6});
 const glow=new T.MeshBasicMaterial({color:0x99e5a7,transparent:true,opacity:.82,depthWrite:false});
 const body=new T.Mesh(new T.IcosahedronGeometry(.44,1),shell);body.scale.set(1,.63,1);body.position.y=.86;group.add(body);
 for(let i=0;i<7;i++){const a=i*2*Math.PI/7;const f=new T.Mesh(new T.ConeGeometry(.09,.8,5),shell);f.position.set(Math.cos(a)*.3,.5,Math.sin(a)*.3);f.rotation.z=Math.sin(a)*.3;group.add(f);}
 for(let i=0;i<5;i++){const a=i*2*Math.PI/5;const light=new T.Mesh(new T.IcosahedronGeometry(.11,1),glow);light.position.set(Math.cos(a)*.35,1.13,Math.sin(a)*.35);group.add(light);}
 return {group,height:1.5,radius:.6,hover:.4,update(dt,st={}){group.position.y=.2+Math.sin((st.t||0)*1.5)*.1;body.rotation.y+=(dt||0)*.22;},dispose(){group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});shell.dispose();glow.dispose();}};
}
export function makeFenStalker(T){
 const group=new T.Group();group.name='lumenfen:bog-stalker';
 const bark=new T.MeshStandardMaterial({color:0x344b42,roughness:.85,metalness:0});
 const moss=new T.MeshStandardMaterial({color:0x4f7661,roughness:.94,emissive:0x102a1a,emissiveIntensity:.12});
 const eye=new T.MeshBasicMaterial({color:0xb4f7c0});
 const body=new T.Mesh(new T.CapsuleGeometry(.57,1.5,6,10),bark);
 body.rotation.x=Math.PI/2;body.scale.set(1,.78,1);body.position.y=.88;group.add(body);
 const head=new T.Mesh(new T.IcosahedronGeometry(.48,1),moss);head.scale.set(.83,.72,1.25);head.position.set(0,.95,1.18);group.add(head);
 for(const x of [-.22,.22]){const iris=new T.Mesh(new T.IcosahedronGeometry(.075,1),eye);iris.position.set(x,1.12,1.57);group.add(iris);}
 const legs=[];
 for(const x of [-.46,.46])for(const z of [-.68,.75]){
   const leg=new T.Group();leg.position.set(x,.74,z);
   const segment=new T.Mesh(new T.CylinderGeometry(.17,.12,1.05,6),bark);segment.position.y=-.43;segment.rotation.z=(x>0?1:-1)*.18;leg.add(segment);
   const foot=new T.Mesh(new T.DodecahedronGeometry(.25,0),moss);foot.position.set(x>0?.14:-.14,-.9,.13);foot.scale.y=.48;leg.add(foot);group.add(leg);legs.push(leg);
 }
 for(let i=0;i<9;i++){const tuft=new T.Mesh(new T.ConeGeometry(.12+(i%3)*.045,.46+(i%4)*.11,5),moss);tuft.position.set(Math.sin(i*2.3)*.42,1.28,Math.cos(i*1.7)*.63);group.add(tuft);}
 return {group,height:1.9,radius:.83,hover:0,update(dt,st={}){const k=Math.min(1,(st.speed||0)/5),t=(st.t||0)*7;legs.forEach((l,i)=>{l.rotation.x=Math.sin(t+(i%2?Math.PI:0)+(i>1?Math.PI:0))*.42*k;});body.rotation.z=Math.sin(t*.5)*.025*k;},dispose(){group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});bark.dispose();moss.dispose();eye.dispose();}};
}
