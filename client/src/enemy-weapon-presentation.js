// Presentation-only equipment: Severance soldiers are authoritative melee
// brawlers (2.4m range), so show the already-approved Cinderlock electrical
// combat rod rather than inventing rifle attacks their AI cannot perform.
export const SEVERANCE_SOLDIER_ROD=Object.freeze({mode:'rod',rodClass:'vanguard'});
export function enemyWeaponPresentation(meta){
 return meta?.k==='e'&&meta?.c==='severance_soldier'?SEVERANCE_SOLDIER_ROD:null;
}
