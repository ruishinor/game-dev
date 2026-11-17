// Bounded transient authored effects. Only authoritative server events call spawn.
// These never change abilities, reach, damage or simulation time.
import { createArtEffect } from './artfx/common.js';
import { kineticSampler } from './artfx/kinetic.js';
import { restorativeSampler } from './artfx/restorative.js';
import { aegisSampler } from './artfx/aegis.js';
const samplers={kinetic:kineticSampler,restorative:restorativeSampler,aegis:aegisSampler};
export class LiveCasts {
  constructor(THREE,scene,limit=10){this.THREE=THREE;this.scene=scene;this.limit=limit;this.active=[];this.serial=0;}
  spawn(name,family,options,now){
    if(!Number.isFinite(now)||!Object.hasOwn(samplers,family))return false;
    const duration=options.duration??1;
    let effect;
    try{
      const sample=samplers[family](options);
      effect=createArtEffect(this.THREE,sample);
      effect.update(.01);
    }catch{effect?.dispose();return false;}
    while(this.active.length>=this.limit)this.active.shift().effect.dispose();
    effect.group.name='live-cast:'+name+':'+ ++this.serial;this.scene.add(effect.group);
    this.active.push({effect,start:now,duration});return true;
  }
  update(now){
    this.active=this.active.filter(entry=>{
      const t=(now-entry.start)/1000;
      if(t>=entry.duration){entry.effect.dispose();return false;}
      entry.effect.update(Math.max(.01,t));return true;
    });
  }
  clear(){for(const entry of this.active)entry.effect.dispose();this.active=[];}
}
