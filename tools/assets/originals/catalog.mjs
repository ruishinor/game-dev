// Original art catalog. Raw prototypes stay outside the production meshopt directory.
import crypto from 'node:crypto';
import { glb,verify } from './geometry.mjs';
import { finishedGLB } from './finish.mjs';
import { build as atlas } from './06-industrial-atlas.mjs';
import { glyphs,svg,sprite } from './07-glyphs.mjs';
import { build as recipe0 } from './01-backpack.mjs';
import { build as recipe1 } from './02-capacitor-harness.mjs';
import { build as recipe2 } from './03-glyph-gauntlet.mjs';
import { build as recipe3 } from './04-cranial-interface.mjs';
import { build as recipe4 } from './05-culture-reservoir.mjs';
import { build as recipe5 } from './11-mender.mjs';
import { build as recipe6 } from './12-resonance-tower.mjs';
import { build as recipe7 } from './13-workstation.mjs';
import { build as recipe8 } from './14-crystallogenic.mjs';
import { build as recipe9 } from './15-flora.mjs';
const builders={
 '01-backpack':recipe0,
 '02-capacitor-harness':recipe1,
 '03-glyph-gauntlet':recipe2,
 '04-cranial-interface':recipe3,
 '05-culture-reservoir':recipe4,
 '11-mender':recipe5,
 '12-resonance-tower':recipe6,
 '13-workstation':recipe7,
 '14-crystallogenic':recipe8,
 '15-flora':recipe9,
};
export const MODEL_SPECS=[
  {
    "id": "backpack_research",
    "packageId": "01",
    "recipe": "01-backpack",
    "args": {
      "variant": "research"
    },
    "origin": "spine_03 mount; +Z toward wearer",
    "file": "backpack_research.glb"
  },
  {
    "id": "backpack_kinetic",
    "packageId": "01",
    "recipe": "01-backpack",
    "args": {
      "variant": "kinetic"
    },
    "origin": "spine_03 mount; +Z toward wearer",
    "file": "backpack_kinetic.glb"
  },
  {
    "id": "backpack_biotech",
    "packageId": "01",
    "recipe": "01-backpack",
    "args": {
      "variant": "biotech"
    },
    "origin": "spine_03 mount; +Z toward wearer",
    "file": "backpack_biotech.glb"
  },
  {
    "id": "backpack_utility",
    "packageId": "01",
    "recipe": "01-backpack",
    "args": {
      "variant": "utility"
    },
    "origin": "spine_03 mount; +Z toward wearer",
    "file": "backpack_utility.glb"
  },
  {
    "id": "capacitor_spine",
    "packageId": "02",
    "recipe": "02-capacitor-harness",
    "args": {
      "piece": "spine"
    },
    "origin": "spine_03",
    "file": "capacitor_spine.glb"
  },
  {
    "id": "capacitor_shoulder",
    "packageId": "02",
    "recipe": "02-capacitor-harness",
    "args": {
      "piece": "shoulder"
    },
    "origin": "upperarm_l/r",
    "file": "capacitor_shoulder.glb"
  },
  {
    "id": "capacitor_coil",
    "packageId": "02",
    "recipe": "02-capacitor-harness",
    "args": {
      "piece": "coil"
    },
    "origin": "lowerarm_l/r (X axis)",
    "file": "capacitor_coil.glb"
  },
  {
    "id": "capacitor_knee",
    "packageId": "02",
    "recipe": "02-capacitor-harness",
    "args": {
      "piece": "knee"
    },
    "origin": "calf_l/r",
    "file": "capacitor_knee.glb"
  },
  {
    "id": "capacitor_visor",
    "packageId": "02",
    "recipe": "02-capacitor-harness",
    "args": {
      "piece": "visor"
    },
    "origin": "Head",
    "file": "capacitor_visor.glb"
  },
  {
    "id": "glyph_gauntlet_right",
    "packageId": "03",
    "recipe": "03-glyph-gauntlet",
    "args": {
      "hand": "right"
    },
    "origin": "lowerarm; X axis",
    "file": "glyph_gauntlet_right.glb"
  },
  {
    "id": "glyph_gauntlet_left",
    "packageId": "03",
    "recipe": "03-glyph-gauntlet",
    "args": {
      "hand": "left"
    },
    "origin": "lowerarm; X axis",
    "file": "glyph_gauntlet_left.glb"
  },
  {
    "id": "cranial_interface_right",
    "packageId": "04",
    "recipe": "04-cranial-interface",
    "args": {
      "side": "right"
    },
    "origin": "Head; temple origin",
    "file": "cranial_interface_right.glb"
  },
  {
    "id": "cranial_interface_left",
    "packageId": "04",
    "recipe": "04-cranial-interface",
    "args": {
      "side": "left"
    },
    "origin": "Head; temple origin",
    "file": "cranial_interface_left.glb"
  },
  {
    "id": "culture_reservoir_restorative",
    "packageId": "05",
    "recipe": "05-culture-reservoir",
    "args": {
      "culture": "restorative"
    },
    "origin": "spine_03 mount",
    "file": "culture_reservoir_restorative.glb"
  },
  {
    "id": "culture_reservoir_resonant",
    "packageId": "05",
    "recipe": "05-culture-reservoir",
    "args": {
      "culture": "resonant"
    },
    "origin": "spine_03 mount",
    "file": "culture_reservoir_resonant.glb"
  },
  {
    "id": "mender_carapace",
    "packageId": "11",
    "recipe": "11-mender",
    "args": {},
    "origin": "hover centre; +Z forward",
    "file": "mender_carapace.glb"
  },
  {
    "id": "resonance_tower_deployed",
    "packageId": "12",
    "recipe": "12-resonance-tower",
    "args": {
      "state": "deployed"
    },
    "origin": "ground",
    "file": "resonance_tower_deployed.glb"
  },
  {
    "id": "resonance_tower_folded",
    "packageId": "12",
    "recipe": "12-resonance-tower",
    "args": {
      "state": "folded"
    },
    "origin": "ground",
    "file": "resonance_tower_folded.glb"
  },
  {
    "id": "resonance_tower_disabled",
    "packageId": "12",
    "recipe": "12-resonance-tower",
    "args": {
      "state": "disabled"
    },
    "origin": "ground",
    "file": "resonance_tower_disabled.glb"
  },
  {
    "id": "research_workstation",
    "packageId": "13",
    "recipe": "13-workstation",
    "args": {
      "kind": "research",
      "base": true
    },
    "origin": "ground",
    "file": "research_workstation.glb"
  },
  {
    "id": "research_tabletop_module",
    "packageId": "13",
    "recipe": "13-workstation",
    "args": {
      "kind": "research",
      "base": false
    },
    "origin": "tabletop",
    "file": "research_tabletop_module.glb"
  },
  {
    "id": "engineering_workstation",
    "packageId": "13",
    "recipe": "13-workstation",
    "args": {
      "kind": "engineering",
      "base": true
    },
    "origin": "ground",
    "file": "engineering_workstation.glb"
  },
  {
    "id": "engineering_tabletop_module",
    "packageId": "13",
    "recipe": "13-workstation",
    "args": {
      "kind": "engineering",
      "base": false
    },
    "origin": "tabletop",
    "file": "engineering_tabletop_module.glb"
  },
  {
    "id": "colony_ground",
    "packageId": "14",
    "recipe": "14-crystallogenic",
    "args": {
      "variant": "ground",
      "seed": 417,
      "density": 8
    },
    "origin": "ground +Y",
    "file": "colony_ground.glb"
  },
  {
    "id": "colony_mature",
    "packageId": "14",
    "recipe": "14-crystallogenic",
    "args": {
      "variant": "mature",
      "seed": 807,
      "density": 13
    },
    "origin": "ground +Y",
    "file": "colony_mature.glb"
  },
  {
    "id": "colony_wall",
    "packageId": "14",
    "recipe": "14-crystallogenic",
    "args": {
      "variant": "wall",
      "seed": 153,
      "density": 8
    },
    "origin": "wall +Z",
    "file": "colony_wall.glb"
  },
  {
    "id": "colony_pipe",
    "packageId": "14",
    "recipe": "14-crystallogenic",
    "args": {
      "variant": "pipe",
      "seed": 92,
      "density": 8
    },
    "origin": "pipe Z axis",
    "file": "colony_pipe.glb"
  },
  {
    "id": "adaptive_nodules_small",
    "packageId": "15",
    "recipe": "15-flora",
    "args": {
      "species": "nodules",
      "seed": 417,
      "count": 3
    },
    "origin": "ground",
    "file": "adaptive_nodules_small.glb"
  },
  {
    "id": "adaptive_nodules_mature",
    "packageId": "15",
    "recipe": "15-flora",
    "args": {
      "species": "nodules",
      "seed": 701,
      "count": 5,
      "mature": true
    },
    "origin": "ground",
    "file": "adaptive_nodules_mature.glb"
  },
  {
    "id": "resonant_fungi_small",
    "packageId": "15",
    "recipe": "15-flora",
    "args": {
      "species": "fungi",
      "seed": 313,
      "count": 4
    },
    "origin": "ground",
    "file": "resonant_fungi_small.glb"
  },
  {
    "id": "resonant_fungi_mature",
    "packageId": "15",
    "recipe": "15-flora",
    "args": {
      "species": "fungi",
      "seed": 812,
      "count": 7,
      "mature": true
    },
    "origin": "ground",
    "file": "resonant_fungi_mature.glb"
  }
];
const utf8=s=>Buffer.from(s,'utf8');
const metadata=(path,bytes)=>({path,bytes:bytes.length,gitBlob:crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),source:'original'});
export function generateOriginals(){
 const generated=new Map();
 for(const spec of MODEL_SPECS){const parts=builders[spec.recipe](spec.args);const out=['01','11','13'].includes(spec.packageId)?finishedGLB(spec.id,parts,spec.packageId==='13'?2.5:spec.packageId==='11'?6:5):glb(spec.id,parts);verify(out.bytes,9000);generated.set(spec.file,Buffer.from(out.bytes));}
 const a=atlas();
 for(const [name,bytes] of Object.entries(a.files))generated.set('industrial_'+name+'.png',Buffer.from(bytes));
 generated.set('industrial_atlas.json',utf8(JSON.stringify({width:a.width,height:a.height,cell:a.cell,gutter:a.gutter,seed:a.seed,tiles:a.tiles,files:{base:'industrial_base.png',normal:'industrial_normal.png',orm:'industrial_orm.png'}},null,2)));
 const ids=Object.keys(glyphs);
 generated.set('glyphs/sprite.svg',utf8(sprite()));
 generated.set('glyphs/manifest.json',utf8(JSON.stringify(ids.map(id=>({id,label:glyphs[id].label,group:glyphs[id].group,file:id+'.svg'})),null,2)));
 for(const id of ids)generated.set('glyphs/'+id+'.svg',utf8(svg(id)));
 const files=[...generated].map(([path,bytes])=>metadata(path,bytes)).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 generated.set('manifest.json',utf8(JSON.stringify({version:1,status:'authoring-prototypes-not-live',models:MODEL_SPECS,files},null,2)+'\n'));
 return generated;
}
