// Public presentation identifiers only. An unowned or arbitrary value is never projected.
const SOCIAL=Object.freeze({social_service_coat:'service',social_relay_coat:'relay'});
export function socialVisualForItem(id) {
  return typeof id==='string'&&Object.hasOwn(SOCIAL,id)?SOCIAL[id]:null;
}
export function publicSocialVisual(char) {
  const id=char?.equipped?.social_torso;
  return Array.isArray(char?.inventory)&&char.inventory.includes(id)?socialVisualForItem(id):null;
}
