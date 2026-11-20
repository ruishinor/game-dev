// Character selection uses the owner's original gate image, not a re-rendered
// approximation. Environment visuals are a static image behind the *actual*
// live Three.js gameplay character. No portal/terrain instance runs on this
// screen, so model rotation cannot move the background and performance is stable.
// Authoritative gameplay/world state is unchanged.
export function preloadSelectionGate(){return Promise.resolve();}
export function createSelectionEnvironment(){
 return {
  ready:true,
  unavailable:false,
  update(){},
  dispose(){},
 };
}
