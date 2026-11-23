// A small, local reward signature for server-authorized wetland loot.
// This is NOT a source of rewards: it receives only personal corpse
// collection events and uses the existing pooled VFX engine.
import { CELL } from './vfx/textures.js';

const FEN_LOOT_VFX = Object.freeze({
  fen_lantern_membrane: {color:0x7ae1bd,cell:CELL.spore},
  bog_chitin: {color:0x6da682,cell:CELL.petal},
  rootglass_fibre: {color:0x83daca,cell:CELL.streak},
  monsoon_silt: {color:0x92bac9,cell:CELL.bubble},
  fen_molt_skin: {color:0x779e7c,cell:CELL.petal},
  mirrorpool_pearl: {color:0xaee8e3,cell:CELL.bubble,rare:true},
  blueprint_fen_culture_ampoule: {color:0x75e4bf,cell:CELL.spore,rare:true},
  blueprint_tidal_service_cassette: {color:0xb5dabf,cell:CELL.streak,rare:true},
  rootglass_crown_shard: {color:0xb9f2ef,cell:CELL.streak,rare:true},
});
export const FEN_LOOT_VFX_IDS=Object.freeze(Object.keys(FEN_LOOT_VFX));

export function emitFenLootFx(vfx,at,item){
 const entry=FEN_LOOT_VFX[item];
 if(!entry||!vfx||vfx.quality<=0||typeof vfx.burst!=='function')return false;
 if(!at||![at.x,at.y,at.z].every(Number.isFinite))return false;
 const color=entry.color,rare=!!entry.rare;
 const root=[at.x,at.y+.85,at.z];
 vfx.burst({
   at:root,shape:'ring',radius:rare?.50:.32,
   count:rare?17:9,blend:'alpha',color,color2:0xdef8e6,
   cell:[entry.cell,CELL.spore,CELL.petal],
   size:rare?[.032,.052]:[.021,.037],sizeEnd:.006,
   life:[.45,.9],dir:[0,1,0],radial:true,up:.75,
   speed:rare?[.65,1.25]:[.28,.8],gravity:.2,drag:1.2,
   alpha:rare?.72:.47,swirl:rare?.16:.07,
 });
 if(rare && typeof vfx.sigil==='function' && vfx.quality>=2)
   vfx.sigil({at:[at.x,at.y+.12,at.z],radius:.42,
     color,style:'resonance',life:.75,spin:0,alpha:.30});
 return true;
}
