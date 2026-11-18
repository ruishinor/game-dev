// Browser-local layout preferences. No character or gameplay state.
const levels=[100,80,60,40];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));

export function sanitizeWindowLayout(raw){
  const v=raw&&typeof raw==='object'?raw:{};
  const rect=v.rect;
  return {
    locked:v.locked===true,
    opacity:levels.includes(v.opacity)?v.opacity:100,
    rect:rect&&['x','y','w','h'].every(k=>finite(rect[k]))&&rect.w>0&&rect.h>0
      ? {x:rect.x,y:rect.y,w:rect.w,h:rect.h}:null,
  };
}

export function constrainWindow(rect,viewport,min={w:480,h:240}){
  const margin=Math.min(8,Math.floor(Math.min(viewport.w,viewport.h)/4));
  const maxW=Math.max(1,viewport.w-margin*2),maxH=Math.max(1,viewport.h-margin*2);
  const w=clamp(rect.w,Math.min(min.w,maxW),maxW),h=clamp(rect.h,Math.min(min.h,maxH),maxH);
  return {x:clamp(rect.x,margin,viewport.w-margin-w),y:clamp(rect.y,margin,viewport.h-margin-h),w,h};
}

export class WindowLayout {
  constructor(panel,body,key){
    this.panel=panel;this.key='attunement.window.'+key;
    let saved;try{saved=JSON.parse(localStorage.getItem(this.key));}catch{}
    this.state=sanitizeWindowLayout(saved);
    panel.classList.add('managed-window');
    const bar=document.createElement('div');bar.className='window-controls';
    const button=(label,action)=>{
      const b=document.createElement('button');b.type='button';b.textContent=label;
      b.addEventListener('click',action);bar.append(b);return b;
    };
    this.move=button('Move',()=>{});
    this.move.title='Drag or use arrow keys to reposition';
    this.size=button('Resize',()=>{});
    this.size.title='Drag or use arrow keys to resize';
    this.lock=button('Lock layout',()=>{
      this.state.locked=!this.state.locked;this.sync();this.save();
    });
    this.alpha=button('Opacity 100%',()=>{
      this.state.opacity=levels[(levels.indexOf(this.state.opacity)+1)%levels.length];this.sync();this.save();
    });
    button('Reset layout',()=>{
      this.state=sanitizeWindowLayout(null);this.sync();this.save();
    });
    // Keep native keyboard activation and focus traversal out of gameplay hotkeys.
    bar.addEventListener('keydown',e=>{if(['Enter',' ','Tab'].includes(e.key))e.stopPropagation();});
    panel.insertBefore(bar,body);
    this.bind(this.move,'move');this.bind(this.size,'resize');
    window.addEventListener('resize',()=>this.sync());
    this.sync();
  }

  save(){
    try{localStorage.setItem(this.key,JSON.stringify(this.state));}catch{}
  }
  viewport(){return {w:window.innerWidth,h:window.innerHeight};}
  rect(){
    const r=this.panel.getBoundingClientRect();
    return {x:r.left,y:r.top,w:r.width,h:r.height};
  }
  sync(){
    const {panel,state}=this;
    panel.style.setProperty('--window-alpha',String(state.opacity/100));
    this.lock.textContent=state.locked?'Unlock layout':'Lock layout';
    this.lock.setAttribute('aria-pressed',String(state.locked));
    this.alpha.textContent='Opacity '+state.opacity+'%';
    this.move.disabled=this.size.disabled=state.locked;
    if(!state.rect){delete panel.dataset.windowCustom;return;}
    const rect=constrainWindow(state.rect,this.viewport());
    panel.dataset.windowCustom='true';
    for(const [k,v] of Object.entries(rect))panel.style.setProperty('--window-'+k,v+'px');
  }
  transform(start,mode,dx,dy){
    if(this.state.locked||this.panel.hidden||this.panel.classList.contains('producing'))return;
    const next=mode==='move'?{...start,x:start.x+dx,y:start.y+dy}:{...start,w:start.w+dx,h:start.h+dy};
    this.state.rect=constrainWindow(next,this.viewport());this.sync();
  }
  bind(el,mode){
    let drag=null;
    el.addEventListener('pointerdown',e=>{
      if(e.button!==0||this.state.locked||this.panel.classList.contains('producing'))return;
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,rect:this.rect()};
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;
      this.transform(drag.rect,mode,e.clientX-drag.x,e.clientY-drag.y);
    });
    const end=e=>{if(!drag||drag.id!==e.pointerId)return;drag=null;this.save();};
    el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);
    el.addEventListener('keydown',e=>{
      const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
      if(!direction)return;
      e.preventDefault();e.stopPropagation();
      const step=e.shiftKey?40:12;
      this.transform(this.rect(),mode,step*direction[0],step*direction[1]);this.save();
    });
  }
}
