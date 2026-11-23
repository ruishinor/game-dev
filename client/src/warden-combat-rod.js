// Sanctum-only presentation of the established electrical combat rod.
// Neutral NPCs gain no damage, inventory, threat, patrol or server authority.
import * as THREE from 'three';
import { solveArm } from './weapon-pose.js';
import { createHeldElectricalRod } from './electrical-rod.js';
import { DEFAULT_ROD_PALETTE } from './rod-palette.js';

// The ordering matches shared/world.js SANCTUM_GUARDS (variant 0..3).
export const WARDEN_PRIMARY_WEAPONS = Object.freeze(['rifle','combat-rod','rifle','combat-rod']);

const V = () => new THREE.Vector3();
const Q = () => new THREE.Quaternion();
const UP = new THREE.Vector3(0,1,0);
const GRIP = new THREE.Vector3(0,.13,0);
// A charged neutral sentry is not attacking. Keep the joined rod at full
// electrical energy, but avoid an attack-level corona obscuring its silhouette
// during a ten-second watch loop. This does not change player rod VFX.
const FULL_POWER = Object.freeze({
  energized:true, activity:0, quality:2, intensity:.72,
  reducedMotion:false, calm:false, combat:false,
});

/**
 * A joined rod attached to the actual Warden palm; the right arm reaches a
 * low-ready guard pose. The shaft stays visibly powered even while idle.
 * Unlike rifles, only one hand holds the joined melee weapon.
 */
export function createWardenCombatRod(inst,variant=1){
 const upper=inst?.getObjectByName('upperarm_r');
 const lower=inst?.getObjectByName('lowerarm_r');
 const hand=inst?.getObjectByName('hand_r');
 if(!upper||!lower||!hand||lower.parent!==upper||hand.parent!==lower){
  console.warn('[wardens] combat rod cannot attach to the Halo right-arm rig: variant='+variant);
  return null;
 }
 inst.updateWorldMatrix(true,true);
 const other=inst.getObjectByName('upperarm_l');
 const local=n=>inst.worldToLocal(n.getWorldPosition(V()));
 const side=Math.sign(local(upper).x-(other?local(other).x:0))||-1;
 const middle=hand.children.find(b=>b.isBone&&/^middle_/.test(b.name));
 const palm=middle?.position.clone().multiplyScalar(.55)??new THREE.Vector3(0,.02,0);
 // The existing player rod already provides two joined halves, integrated
 // corona/plasma geometry and owned materials; no duplicate VFX pipeline.
 const rod=createHeldElectricalRod(hand,{
  axis:new THREE.Vector3(0,1,0),
  palm,
  palette:DEFAULT_ROD_PALETTE,
 });
 rod.group.name='WardenEnergizedCombatRod';
 rod.setMode('rod');
 rod.update(0,{...FULL_POWER,reducedMotion:true});
 rod.setEnergy(1,1);
 const world=n=>n.getWorldPosition(V());
 const poseTargets=[
  [-.08,-.30,.26],[.00,-.32,.31],[-.12,-.35,.22],
  [.06,-.29,.23],[-.08,-.39,.32],[.02,-.24,.33],
 ];
 let candidate=0,failures=0,recoveries=0,wasReady=false,closed=false;
 let state={mode:'initializing',weapon:'combat-rod',joined:true,energized:true,
  energy:1,gripError:null,armError:null,coronaVisible:0,failures,recoveries,candidate:null};
 const inspect=()=>({...state,visible:rod.group.visible,parent:rod.group.parent?.name??null});
 function update(dt=0,st={}){
  if(closed)return false;
  inst.updateWorldMatrix(true,true);
  const shoulder=local(upper);
  const originalUpper=upper.quaternion.clone(),originalLower=lower.quaternion.clone();
  const restore=()=>{
   upper.quaternion.copy(originalUpper);
   lower.quaternion.copy(originalLower);
   inst.updateWorldMatrix(true,true);
  };
  const pole=inst.localToWorld(new THREE.Vector3(side*.9,-.52,-.38))
   .sub(inst.getWorldPosition(V()));
  const order=[candidate,...poseTargets.map((_,i)=>i).filter(i=>i!==candidate)];
  let ready=false,armError=Infinity;
  for(const i of order){
   restore();
   const [lateral,down,forward]=poseTargets[i];
   const at=inst.localToWorld(shoulder.clone().add(new THREE.Vector3(side*lateral,down,forward)));
   const actual=solveArm(THREE,upper,lower,hand,at,pole);
   const delta=actual?actual.distanceTo(at):Infinity;
   if(delta<=.035){ready=true;armError=delta;candidate=i;break;}
  }
  if(!ready){restore();failures++;}
  else if(!wasReady&&failures)recoveries++;
  wasReady=ready;
  // Fully charged does not mean an attack animation: carry the live staff
  // diagonally outward and forward, away from the vertical head ring.
  // Recalculate after IK so its axis does not drift with wrist movement.
  const desired=new THREE.Vector3(side*.50,.42,.72).normalize()
   .applyQuaternion(inst.getWorldQuaternion(Q()));
  const shaftVerticality=Math.abs(desired.dot(UP));
  const axis=desired.applyQuaternion(hand.getWorldQuaternion(Q()).invert()).normalize();
  rod.group.quaternion.setFromUnitVectors(UP,axis);
  rod.group.position.copy(palm).sub(GRIP.clone().applyQuaternion(rod.group.quaternion));
  // Energy is always at maximum. Graphics quality and explicit comfort
  // preferences only reduce expensive flicker/outer layers, never power.
  const quality=Number.isFinite(st.effectsQuality)
   ? Math.max(0,Math.min(2,st.effectsQuality)) : FULL_POWER.quality;
  const calm=!!st.rodCalm;
  rod.update(Math.max(0,Number.isFinite(dt)?dt:0),{
   ...FULL_POWER,quality,calm,reducedMotion:calm,
  });
  rod.setEnergy(1,1);
  rod.group.visible=true;
  const measured=world(rod.group.getObjectByName('RodRightGrip'))
   .distanceTo(hand.localToWorld(palm.clone()));
  const coronaVisible=[0,1].filter(i=>rod.group.getObjectByName('RodCorona'+i)?.visible).length;
  state={mode:ready?'ready':'hand-carry',weapon:'combat-rod',
   joined:rod.progress>=.95,energized:true,energy:1,
   gripError:measured,armError:ready?armError:null,coronaVisible,shaftVerticality,
   failures,recoveries,candidate:ready?candidate:null};
  return true; // Failed IK still leaves a real rod attached to the actual palm.
 }
 // The caller evaluates the guard's base animation before the first fitting
 // pass; avoid fitting against a stale bind pose (the original rifle defect).
 return {
  id:'combat-rod',group:rod.group,update,inspect,
  dispose(){if(closed)return;closed=true;rod.dispose();},
 };
}
export function syncWardenCombatRod(weapon,stave,dt=0,state={}){
 const equipped=weapon?.update(dt,state)===true;
 if(weapon?.group)weapon.group.visible=equipped;
 if(stave)stave.visible=!equipped;
 return equipped?'combat-rod':stave?'stave':'unarmed';
}
