// Original mechanical tripod. Three articulated legs, linked pistons and an
// independent instrument mast. Units are metres; +Z is forward.
import * as T from 'three';
const TAU=Math.PI*2;
export function createSurveyStrider(){
 const group=new T.Group();group.name='strider:original-tripod';
 const body=new T.Group();body.name='strider:chassis';group.add(body);
 const mat=(color,metalness=.48,roughness=.55)=>new T.MeshStandardMaterial({color,metalness,roughness});
 const enamel=mat(0xb3b6a0,.25,.64),frame=mat(0x2c3b40,.65,.55),bronze=mat(0xa27840,.62,.43),steel=mat(0x91a2a0,.78,.38),dark=mat(0x151e20,.2,.82);
 const signal=new T.MeshStandardMaterial({color:0x5daeb0,emissive:0x207c84,emissiveIntensity:.65,roughness:.42});
 const parts=(g,geo,m,x=0,y=0,z=0)=>{const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;g.add(o);return o;};
 const distanceParts=[],distanceGeometry=[];
 const box=(g,w,h,d,m,x,y,z)=>parts(g,new T.BoxGeometry(w,h,d),m,x,y,z);
 const cyl=(g,r1,r2,h,m,x,y,z,n=12)=>{
  const mesh=parts(g,new T.CylinderGeometry(r1,r2,h,n),m,x,y,z);
  if(n>6)distanceGeometry.push({mesh,near:mesh.geometry,far:new T.CylinderGeometry(r1,r2,h,6)});
  return mesh;
 };
 const sphere=(g,r,m,x,y,z)=>{
  const mesh=parts(g,new T.SphereGeometry(r,12,8),m,x,y,z);
  distanceGeometry.push({mesh,near:mesh.geometry,far:new T.SphereGeometry(r,7,4)});
  return mesh;
 };
 cyl(body,.42,.32,.26,frame,0,1.16,0,6);cyl(body,.44,.38,.33,enamel,0,1.43,0,6);cyl(body,.30,.42,.12,bronze,0,1.65,0,6);
 box(body,.54,.20,.19,frame,0,1.43,.37);box(body,.26,.10,.025,signal,0,1.45,.48);
 for(const side of [-1,1]){
  box(body,.20,.29,.48,frame,side*.43,1.43,-.03);
  box(body,.15,.23,.40,enamel,side*.49,1.46,-.03);
  for(let i=0;i<3;i++)distanceParts.push(box(body,.018,.045,.22,dark,side*.573,1.37+i*.065,-.03));
  box(body,.12,.06,.10,bronze,side*.46,1.62,.05);
 }
 const kit=new T.Group();kit.name='strider:survey-instruments';kit.position.set(0,1.69,-.08);body.add(kit);
 cyl(kit,.07,.10,.16,frame,0,.08,0);cyl(kit,.045,.055,.29,steel,0,.23,0);
 const head=new T.Group();head.position.y=.40;kit.add(head);head.name='strider:pan-head';
 box(head,.34,.18,.22,enamel,0,0,0);box(head,.27,.12,.04,frame,0,0,.12);
 for(const x of [-.075,.075])cyl(head,.047,.047,.045,signal,x,0,.15).rotation.x=Math.PI/2;
 box(head,.19,.055,.13,bronze,0,.12,-.03);
 const legs=[];const up=new T.Vector3(0,1,0);
 function link(r,m){return cyl(group,r*.9,r,1,m,0,0,0);}
 function setLink(mesh,a,b){const v=new T.Vector3().subVectors(b,a);mesh.position.copy(a).addScaledVector(v,.5);mesh.scale.y=v.length();mesh.quaternion.setFromUnitVectors(up,v.normalize());}
 for(let i=0;i<3;i++){
  const angle=i*TAU/3+Math.PI,axis=new T.Vector3(Math.sin(angle),0,Math.cos(angle));
  const hip=sphere(group,.12,bronze,0,0,0),knee=sphere(group,.10,frame,0,0,0);
  const upper=link(.085,enamel),lower=link(.061,frame),piston=link(.028,steel);
  const foot=new T.Group();foot.name='strider:foot-'+i;group.add(foot);
  box(foot,.19,.09,.23,frame,0,.055,0);box(foot,.16,.05,.19,bronze,0,.12,0);
  distanceParts.push(box(foot,.2,.035,.25,dark,0,.018,0));
  distanceParts.push(piston);
  legs.push({axis,hip,knee,upper,lower,piston,foot,angle});
 }
 let phase=0,motion=0,sweep=0,distant=false;
 function setDistance(cameraDistance){
  const next=cameraDistance>(distant?18:22);
  if(next===distant)return;
  distant=next;
  for(const mesh of distanceParts)mesh.visible=!distant;
  for(const {mesh,near,far} of distanceGeometry)mesh.geometry=distant?far:near;
 }
 function update(dt,s={}){
  if(Number.isFinite(s.cameraDistance))setDistance(s.cameraDistance);
  const active=s.act!=='dormant'&&s.act!=='stranded',speed=Math.max(0,Math.min(8,s.speed||0));motion+=(Number(active&&speed>.13)-motion)*(1-Math.exp(-dt*9));
  phase=(phase+speed*dt*6.4)%TAU;sweep+=dt;
  const bob=active?Math.sin(phase*3)*.027*motion:0;body.position.y=bob;
  for(let i=0;i<legs.length;i++){
   const l=legs[i],t=phase+i*TAU/3;
   const hip=l.axis.clone().multiplyScalar(.32);hip.y=1.23+bob;
   const foot=l.axis.clone().multiplyScalar(.73);foot.z+=Math.cos(t)*.15*motion;foot.y=Math.max(0,Math.sin(t))*.14*motion;
   const knee=l.axis.clone().multiplyScalar(.69);knee.z+=Math.cos(t)*.085*motion;knee.y=.77+bob*.5+foot.y*.45;
   l.hip.position.copy(hip);l.knee.position.copy(knee);l.foot.position.copy(foot);l.foot.rotation.y=l.angle;
   setLink(l.upper,hip,knee);setLink(l.lower,knee,foot.clone().add(new T.Vector3(0,.12,0)));
   const side=new T.Vector3(-l.axis.z,0,l.axis.x).multiplyScalar(.08);setLink(l.piston,hip.clone().add(side).add(new T.Vector3(0,-.12,0)),knee.clone().add(side));
  }
  const working=s.act==='surveying'||s.act==='screening'||s.act==='recovering';head.rotation.y=working?(s.reducedMotion?0:Math.sin(sweep*3)*.6):0;
  signal.emissiveIntensity=active?(working?1.4:.65):.08;
 }
 update(0,{});
 return {kind:'procedural',group,height:2.23,radius:.9,hover:0,update,dispose(){const g=new Set(distanceGeometry.flatMap(({near,far})=>[near,far])),m=new Set();group.traverse(o=>{if(o.isMesh){g.add(o.geometry);m.add(o.material);}});g.forEach(x=>x.dispose());m.forEach(x=>x.dispose());}};
}
