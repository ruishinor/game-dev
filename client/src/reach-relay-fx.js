// Reach relay: intermittent contact fault, owned entirely by the service cabinet.
// Persistent ambient content must not allocate the pooled ability VFX ribbons,
// particle capacity or flash lights. All local geometry is allocated just once.
export const RELAY_FX_BUDGET = Object.freeze({
  near: 28, cadence: 5.8, initial: 2.3, sparks: 6, duration: .24,
  localDraws: 2, globalEmissions: 0,
});

export function createReachRelayFx(T,tower,vfx) {
  const local = new T.Group();local.name='relay:local-fault';
  tower.add(local);
  // These are genuine contacts on the fitted cabinet, in tower-local coordinates.
  const source = new T.Vector3(1.48,1.17,.33);
  const sink = new T.Vector3(1.24,1.48,.39);
  const points=[];
  for(let i=0;i<=12;i++){
    const p=source.clone().lerp(sink,i/12);
    const taper=Math.sin(Math.PI*i/12);
    p.x+=Math.sin(i*7.23)*.018*taper;
    p.z+=Math.cos(i*5.71)*.013*taper;
    points.push(p);
  }
  const geometry=new T.TubeGeometry(new T.CatmullRomCurve3(points),24,.006,4,false);
  const arcMat=new T.MeshBasicMaterial({
    color:0xa9d4ca,transparent:true,opacity:0,
    blending:T.AdditiveBlending,depthWrite:false,toneMapped:false,
  });
  const arc=new T.Mesh(geometry,arcMat);arc.name='relay:contact-arc';local.add(arc);
  const sparkGeo=new T.SphereGeometry(.012,5,4);
  const sparkMat=new T.MeshBasicMaterial({
    color:0xd3ece3,transparent:true,opacity:0,
    blending:T.AdditiveBlending,depthWrite:false,toneMapped:false,
  });
  const sparks=new T.InstancedMesh(sparkGeo,sparkMat,RELAY_FX_BUDGET.sparks);
  sparks.name='relay:local-sparks';sparks.frustumCulled=false;local.add(sparks);
  const dummy=new T.Object3D(),world=new T.Vector3();
  const velocities=Array.from({length:RELAY_FX_BUDGET.sparks},(_,i)=>{
    const a=(i*2.39996);
    return new T.Vector3(Math.cos(a)*.36,.58+(i%3)*.16,Math.sin(a)*.32);
  });
  let disposed=false,remaining=RELAY_FX_BUDGET.initial,active=0,clock=0,activations=0;
  local.visible=false;
  function update(dt,focus) {
    if(disposed)return;
    if(!vfx||vfx.quality<=0||vfx.reducedMotion||!Number.isFinite(dt)||dt<=0||
      !focus||!Number.isFinite(focus.x)||!Number.isFinite(focus.z)){
      local.visible=false;active=0;return;
    }
    tower.getWorldPosition(world);
    if(Math.hypot(focus.x-world.x,focus.z-world.z)>RELAY_FX_BUDGET.near){
      local.visible=false;active=0;return;
    }
    const step=Math.min(dt,.1);
    remaining-=step;clock+=step;
    if(remaining<=0){
      remaining=RELAY_FX_BUDGET.cadence;
      active=RELAY_FX_BUDGET.duration;
      activations++;
    }
    if(active<=0){local.visible=false;return;}
    active=Math.max(0,active-step);
    const elapsed=RELAY_FX_BUDGET.duration-active;
    const fade=Math.sin(Math.PI*(active/RELAY_FX_BUDGET.duration));
    arcMat.opacity=Math.max(0,fade)*(.40+.10*Math.sin(clock*73));
    sparkMat.opacity=Math.max(0,fade)*.50;
    // One instanced draw for all deterministic sparks; zero global particle use.
    for(let i=0;i<RELAY_FX_BUDGET.sparks;i++){
      const v=velocities[i];
      dummy.position.copy(sink).addScaledVector(v,elapsed);
      dummy.position.y-=3.2*elapsed*elapsed;
      const scale=(1-elapsed/RELAY_FX_BUDGET.duration)*(.7+(i%3)*.14);
      dummy.scale.setScalar(Math.max(.001,scale));
      dummy.updateMatrix();
      sparks.setMatrixAt(i,dummy.matrix);
    }
    sparks.instanceMatrix.needsUpdate=true;
    local.visible=active>0;
  }
  return {
    update,
    stats(){return {activations,disposed,local:true,draws:RELAY_FX_BUDGET.localDraws,globalEmissions:0,visible:local.visible};},
    dispose(){
      if(disposed)return;disposed=true;
      local.removeFromParent();geometry.dispose();arcMat.dispose();sparkGeo.dispose();sparkMat.dispose();
    },
  };
}
