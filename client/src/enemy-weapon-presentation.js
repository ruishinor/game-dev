// Presentation-only equipment: Severance soldiers are authoritative melee
// brawlers (2.4m range), so show the already-approved Cinderlock electrical
// combat rod rather than inventing rifle attacks their AI cannot perform.
export const SEVERANCE_SOLDIER_ROD=Object.freeze({mode:'rod',rodClass:'vanguard'});
export function enemyWeaponPresentation(meta){
 if(meta?.k!=='e'||meta?.c!=='severance_soldier')return null;
 // Ranged Null soldiers actually carry the longpoint presentation.
 if(meta.vx==='null_arc'||meta.vx==='null_resonance')return null;
 return SEVERANCE_SOLDIER_ROD;
}
