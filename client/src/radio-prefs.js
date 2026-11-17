// Radio settings are local to the browser, not character or gameplay state.
export const VOICE_MODES=Object.freeze(['auto','manual','off']);
export const RADIO_OPACITIES=Object.freeze([100,80,60,40]);
const unit=n=>Math.min(1,Math.max(0,n));
export function radioPrefs(raw,legacy){
 const p=raw&&typeof raw==='object'?raw:{};
 return {mode:VOICE_MODES.includes(p.mode)?p.mode:legacy==='0'?'manual':'auto',
  opacity:RADIO_OPACITIES.includes(p.opacity)?p.opacity:100,
  locked:typeof p.locked==='boolean'?p.locked:true,
  pos:p.pos&&Number.isFinite(p.pos.x)&&Number.isFinite(p.pos.y)?{x:unit(p.pos.x),y:unit(p.pos.y)}:null};
}
export function radioPosition(view,card,tracker,pos){
 const maxX=Math.max(0,view.width-card.width-8),maxY=Math.max(0,view.height-card.height-8);
 const clamp=(n,m)=>Math.min(m,Math.max(Math.min(8,m),n));
 if(pos)return {x:clamp(pos.x*maxX,maxX),y:clamp(pos.y*maxY,maxY)};
 if(tracker&&tracker.left>=card.width+16&&view.width>=720)
  return {x:clamp(tracker.left-card.width-12,maxX),y:clamp(tracker.top+8,maxY)};
 return {x:clamp(view.width-card.width-8,maxX),y:clamp(tracker?tracker.bottom+8:Math.round(view.height*.42),maxY)};
}
export function relativeRadioPosition(x,y,view,card){
 return {x:unit(x/Math.max(1,view.width-card.width-8)),y:unit(y/Math.max(1,view.height-card.height-8))};
}
