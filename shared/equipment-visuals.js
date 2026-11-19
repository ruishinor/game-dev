// Only visible, authored presentation identifiers cross the public snapshot.
const CHEST=Object.freeze({field_chest:'field',reinforced_chest:'reinforced',resonant_chest:'resonant'});
const SOCIAL=Object.freeze({social_service_coat:'service',social_relay_coat:'relay'});
const WEAPON=Object.freeze({field_emitter:'field',tuned_emitter:'tuned',dense_pulse_core:'dense',longpoint_emitter:'longpoint'});
export function equipmentVisuals(equipped={}){
 const cv=Object.hasOwn(CHEST,equipped.chest)?CHEST[equipped.chest]:null;
 const sv=Object.hasOwn(SOCIAL,equipped.social_torso)?SOCIAL[equipped.social_torso]:null;
 const wv=Object.hasOwn(WEAPON,equipped.weapon)?WEAPON[equipped.weapon]:null;
 return {...(cv?{cv}:{}),...(sv?{sv}:{}),...(wv?{wv}:{})};
}
