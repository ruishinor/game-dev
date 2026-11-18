// Opt-in prototype only: keep the live donor rig as the default and fallback.
// Resources loaded once are shared; each visual owns only its dynamic rig.
import { makeMenderVisual } from './artfx/mender-visual.js';
export function prepareMenderCarapace(T,root){
 if(!root?.isObject3D||root.parent)throw Error('detached Mender body required');
 root.updateMatrixWorld(true);const b=new T.Box3().setFromObject(root),s=b.getSize(new T.Vector3()),center=b.getCenter(new T.Vector3());
 if(![s.x,s.y,s.z,center.x,center.y,center.z].every(Number.isFinite)||Math.min(s.x,s.y,s.z)<.001||Math.max(s.x,s.y,s.z)>2)throw Error('invalid prototype bounds');
 // The original carapace was authored around the centre, for lens z=.205
 // and tendril anchors at y=-.207. Require compatible bounds, not a blind fit.
 if(s.x>.78||s.y>.65||s.z>.76||center.length()>.13)throw Error('incompatible carapace attachment coordinates');
 root.traverse(o=>{if(!o.isMesh)return;o.geometry.userData.shared=true;for(const m of Array.isArray(o.material)?o.material:[o.material])m.isShared=true;o.castShadow=true;o.receiveShadow=true;});
 return root;
}
export function createMenderPrototype(T,template){
 const body=template.clone(true);const visual=makeMenderVisual(T,body),group=visual.group;group.name='mender:original-carapace-preview';let flash=0,done=false;
 return {kind:'glb',group,height:.8,radius:.4,hover:1.5,
  update(dt,st){if(done)return;const step=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;flash=Math.max(0,flash-step*3);
   visual.update({time:Number.isFinite(st.t)?Math.max(0,st.t):0,speed:Number.isFinite(st.speed)?st.speed:0,cast:Math.max(flash,Number.isFinite(st.cast)?st.cast:0),mode:st.mode,act:st.act,reducedMotion:!!st.reducedMotion});},
  trigger(kind){if(kind==='cast'||kind==='attack'||kind==='ability')flash=1},
  dispose(){if(done)return;done=true;visual.dispose();}
 };
}
