// Only visible, authored presentation identifiers cross the public snapshot.
const CHEST=Object.freeze({field_chest:'field',reinforced_chest:'reinforced',resonant_chest:'resonant'});
const SOCIAL=Object.freeze({social_service_coat:'service',social_relay_coat:'relay'});
export function equipmentVisuals(equipped={}){
 const cv=Object.hasOwn(CHEST,equipped.chest)?CHEST[equipped.chest]:null;
 const sv=Object.hasOwn(SOCIAL,equipped.social_torso)?SOCIAL[equipped.social_torso]:null;
 return {...(cv?{cv}:{}),...(sv?{sv}:{})};
}
