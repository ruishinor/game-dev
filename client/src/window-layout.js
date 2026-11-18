// Browser-local layout preferences. No character or gameplay state.
const levels=[100,80,60,40];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const marginFor=v=>Math.min(8,Math.floor(Math.min(v.w,v.h)/4));

export function sanitizeWindowLayout(raw){
  const v=raw&&typeof raw==='object'?raw:{},rect=v.rect;
  return {
    locked:v.locked===true,
    opacity:levels.includes(v.opacity)?v.opacity:100,
    rect:rect&&['x','y','w','h'].every(k=>finite(rect[k]))&&rect.w>0&&rect.h>0
      ? {x:rect.x,y:rect.y,w:rect.w,h:rect.h}:null,
  };
}

export function constrainWindow(rect,viewport,min={w:480,h:240}){
  const margin=marginFor(viewport);
  const maxW=Math.max(1,viewport.w-margin*2),maxH=Math.max(1,viewport.h-margin*2);
  const w=clamp(rect.w,Math.min(min.w,maxW),maxW),h=clamp(rect.h,Math.min(min.h,maxH),maxH);
  return {x:clamp(rect.x,margin,viewport.w-margin-w),y:clamp(rect.y,margin,viewport.h-margin-h),w,h};
}

// Anchor the opposite edge while resizing. Small viewports take precedence
// over a window's preferred minimum so no title bar becomes unreachable.
export function resizeWindow(rect,edge,dx,dy,viewport,min={w:480,h:240}){
  const a=constrainWindow(rect,viewport,min),m=marginFor(viewport);
  const minW=Math.min(min.w,viewport.w-2*m),minH=Math.min(min.h,viewport.h-2*m);
  let {x,y,w,h}=a;
  if(edge.includes('w')){x=clamp(a.x+dx,m,a.x+a.w-minW);w=a.x+a.w-x;}
  if(edge.includes('e'))w=clamp(a.w+dx,minW,viewport.w-m-a.x);
  if(edge.includes('n')){y=clamp(a.y+dy,m,a.y+a.h-minH);h=a.y+a.h-y;}
  if(edge.includes('s'))h=clamp(a.h+dy,minH,viewport.h-m-a.y);
  return {x,y,w,h};
}

export class WindowLayout {
  constructor(panel,body,key,options={}){
    this.panel=panel;this.key='attunement.window.'+key;
    this.min=options.min??{w:480,h:240};
    this.titleSelector=options.titleSelector??'h2';
    this.onOpacity=options.onOpacity;
    let saved;try{saved=JSON.parse(localStorage.getItem(this.key));}catch{}
    this.state=sanitizeWindowLayout(saved??{opacity:options.initialOpacity});
    panel.classList.add('managed-window');body.classList.add('managed-window-content');
    const bar=document.createElement('div');bar.className='window-controls';
    const button=(label,action)=>{
      const b=document.createElement('button');b.type='button';b.textContent=label;
      b.addEventListener('click',action);bar.append(b);return b;
    };
    // Retain accessible keyboard alternatives, not prerequisites for dragging.
    this.move=button('Move',()=>{});
    this.move.title='Drag or use arrow keys to reposition';
    this.size=button('Resize',()=>{});
    this.size.title='Drag or use arrow keys to resize';
    this.lock=button('Lock layout',()=>{
      this.state.locked=!this.state.locked;this.sync();this.save();
    });
    if(!options.onOpacity)this.alpha=button('Opacity 100%',()=>{
      this.setOpacity(levels[(levels.indexOf(this.state.opacity)+1)%levels.length]);
    });
    button('Reset layout',()=>this.reset());
    bar.addEventListener('keydown',e=>{if(['Enter',' ','Tab'].includes(e.key))e.stopPropagation();});
    panel.insertBefore(bar,body);
    for(const edge of ['n','ne','e','se','s','sw','w','nw']){
      const handle=document.createElement('div');handle.className='window-resize-handle';
      handle.dataset.edge=edge;handle.setAttribute('aria-hidden','true');panel.append(handle);
    }
    let drag=null;
    panel.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      this.raise();
      if(this.state.locked||panel.hidden||panel.classList.contains('producing'))return;
      const title=panel.querySelector(this.titleSelector);
      const mode=e.target===this.move?'move':e.target===this.size?'se':
        e.target.closest('.window-resize-handle')?.dataset.edge??
        (title?.contains(e.target)&&!e.target.closest('button,input,select,a')?'move':null);
      if(!mode)return;
      drag={mode,id:e.pointerId,x:e.clientX,y:e.clientY,rect:this.rect()};
      panel.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation();
    });
    panel.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;
      this.transform(drag.rect,drag.mode,e.clientX-drag.x,e.clientY-drag.y);
      e.preventDefault();e.stopPropagation();
    });
    const end=e=>{if(!drag||drag.id!==e.pointerId)return;drag=null;this.save();};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])panel.addEventListener(event,end);
    this.bindKeys(this.move,'move');this.bindKeys(this.size,'se');
    panel.addEventListener('focusin',()=>this.raise());
    // Opening a window (including through a hotkey) brings it to the front.
    let wasHidden=panel.hidden;
    new MutationObserver(()=>{
      const hidden=panel.hidden;
      if(wasHidden&&!hidden){this.sync();this.raise();}
      wasHidden=hidden;
    }).observe(panel,{attributes:true,attributeFilter:['hidden']});
    window.addEventListener('resize',()=>this.sync());
    this.sync();
  }
  raise(){
    const peers=[...this.panel.parentElement.querySelectorAll(':scope > .managed-window:not([hidden])')]
      .filter(p=>p!==this.panel).sort((a,b)=>Number(a.style.zIndex||30)-Number(b.style.zIndex||30));
    [...peers,this.panel].forEach((p,i)=>{p.style.zIndex=String(31+i);});
  }
  reset(){this.state=sanitizeWindowLayout(null);this.sync();this.save();}
  setOpacity(value){
    if(!levels.includes(value))return;
    this.state.opacity=value;this.sync();this.save();
  }
  save(){try{localStorage.setItem(this.key,JSON.stringify(this.state));}catch{}}
  viewport(){return {w:window.innerWidth,h:window.innerHeight};}
  rect(){
    const r=this.panel.getBoundingClientRect();
    return {x:r.left,y:r.top,w:r.width,h:r.height};
  }
  sync(){
    const {panel,state}=this;
    panel.style.setProperty('--window-alpha',String(state.opacity/100));
    panel.dataset.windowLocked=String(state.locked);
    this.lock.textContent=state.locked?'Unlock layout':'Lock layout';
    this.lock.setAttribute('aria-pressed',String(state.locked));
    if(this.alpha)this.alpha.textContent='Opacity '+state.opacity+'%';
    this.onOpacity?.(state.opacity);
    this.move.disabled=this.size.disabled=state.locked;
    if(!state.rect){delete panel.dataset.windowCustom;return;}
    const rect=constrainWindow(state.rect,this.viewport(),this.min);
    panel.dataset.windowCustom='true';
    for(const [k,v] of Object.entries(rect))panel.style.setProperty('--window-'+k,v+'px');
  }
  transform(start,mode,dx,dy){
    if(this.state.locked||this.panel.hidden||this.panel.classList.contains('producing'))return;
    this.state.rect=mode==='move'
      ? constrainWindow({...start,x:start.x+dx,y:start.y+dy},this.viewport(),this.min)
      : resizeWindow(start,mode,dx,dy,this.viewport(),this.min);
    this.sync();
  }
  bindKeys(el,mode){
    el.addEventListener('keydown',e=>{
      const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
      if(!direction)return;
      e.preventDefault();e.stopPropagation();
      const step=e.shiftKey?40:12;
      this.transform(this.rect(),mode,step*direction[0],step*direction[1]);this.save();
    });
  }
}
