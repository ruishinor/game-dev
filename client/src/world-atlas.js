// Cartography presentation: use only existing public geometry and delivered snapshots.
import {WORLD,ZONES,RIFT_ANNEX,SEVERANCE_POCKET,inRiftAnnex,inSeverancePocket,sameTravelRegion} from '../../shared/world.js';
import {reachAtlasTerrain,clusterMapMarkers} from './atlas-cartography.js';
import {loadSavedPoints,persistSavedPoints,MAX_SAVED_POINTS,MAX_NOTE_LENGTH} from './atlas-saved-points.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function regionFor(pos){
 const a=inRiftAnnex(pos.x,pos.z,2)?RIFT_ANNEX:inSeverancePocket(pos.x,pos.z,2)?SEVERANCE_POCKET:null;
 return a?{area:a,name:a.name||'Current region',x:a.x,z:a.z,hw:a.hw,hd:a.hd}:{area:null,name:WORLD.name,x:0,z:0,hw:WORLD.radius,hd:WORLD.radius};
}
export function project(r,w,h,zoom=1,pan={x:0,z:0}){
 // Atlas blueprint: rectangular, edge-to-edge terrain plate (not a circle
 // centered inside unused black canvas). Keep independent axis scales so every
 // public region coordinate remains visible at zoom=1.
 const kx=(w-28)/(2*r.hw)*zoom,kz=(h-28)/(2*r.hd)*zoom;
 const k=Math.min(kx,kz);
 return {k,kx,kz,X:x=>w/2+(x-r.x-pan.x)*kx,Z:z=>h/2+(z-r.z-pan.z)*kz};
}
export function pointInsideRegion(r,x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z))return false;
 if(r.area)return Math.abs(x-r.x)<=r.hw&&Math.abs(z-r.z)<=r.hd;
 return Math.hypot(x,z)<=WORLD.radius;
}
export function waypointRelative(position,target){
 if(!position||!target)return null;
 const x=target.x-position.x,z=target.z-position.z;
 return {distance:Math.hypot(x,z),bearing:(Math.atan2(x,-z)*180/Math.PI+360)%360};
}
export function pixelToWorld(r,projection,w,h,px,py,pan={x:0,z:0}){
 return {x:r.x+pan.x+(px-w/2)/(projection.kx??projection.k),z:r.z+pan.z+(py-h/2)/(projection.kz??projection.k)};
}
export function daylightDisplay(state){
 if(!state?.applied||!Number.isFinite(state.t))return null;
 // Existing renderer anchors: day/noon 0, dusk .25, night .5, dawn .75.
 const minutes=((Math.floor(state.t*1440)+720)%1440+1440)%1440;
 return {minutes,phase:minutes>=360&&minutes<1080?'day':'night',preview:state.mode!=='live'};
}
export function formatMinutes(minutes,format='24'){
 const hours=Math.floor(minutes/60)%24,m=String(minutes%60).padStart(2,'0');
 return format==='12'?(hours%12||12)+':'+m+' '+(hours<12?'AM':'PM'):String(hours).padStart(2,'0')+':'+m;
}
// Preserve the existing texture API for callers; render the richer terrain plate.
export const reachTerrain=reachAtlasTerrain;
export class WorldAtlas{
 constructor(root,settings,focusWorld){
 this.focusWorld=focusWorld;this.zoom=1;this.pan={x:0,z:0};this.waypoint=null;this.selection=null;this.layers=new Set(['places','party','players','enemies','objects']);
  this.owner=null;this.savedPoints=[];this.activeSavedId=null;this.staticPaints=0;
 this.el=el('section','world-atlas');this.el.hidden=true;this.el.setAttribute('role','dialog');this.el.setAttribute('aria-label','World atlas');
 const head=el('header','atlas-header');this.title=el('h2',null,'World atlas');
 const full=el('button',null,'Full screen');full.type='button';full.setAttribute('aria-pressed','false');
 full.addEventListener('click',()=>{const on=this.el.classList.toggle('atlas-fullscreen');full.setAttribute('aria-label',on?'Restore window':'Full screen');full.title=full.getAttribute('aria-label');full.textContent=on?'⤡':'⤢';full.setAttribute('aria-pressed',String(on));this.draw();});
 const close=el('button',null,'Close');close.onclick=()=>this.close();head.append(this.title,close);
 const body=el('div','atlas-body'),tools=el('aside','atlas-tools'),view=el('div','atlas-view');
 this.search=el('input');this.search.type='search';this.search.placeholder='Search visible places and entities';this.search.setAttribute('aria-label','Search map');this.search.oninput=()=>this.draw();this.regionName=el('div','atlas-region',WORLD.name);tools.append(this.regionName,this.search,el('h3',null,'Map layers'));
 for(const [id,label] of [['places','Places'],['party','Party'],['players','Players'],['enemies','Enemies (visible)'],['objects','Objects (visible)']]){
 const l=el('label'),c=el('input');c.type='checkbox';c.checked=true;c.onchange=()=>{c.checked?this.layers.add(id):this.layers.delete(id);this.draw();};l.append(c,document.createTextNode(' '+label));tools.append(l);}
 this.details=el('p','atlas-details','Select a place or click the map to set a personal waypoint.');
 this.details.setAttribute('aria-live','polite');
 this.waypointDetails=el('p','atlas-waypoint-details','No waypoint selected.');
 this.results=el('div','atlas-results');
 this.setSelected=el('button',null,'Mark selected place');this.setSelected.disabled=true;
 this.setSelected.addEventListener('click',()=>{
  if(this.selection)this.setWaypoint(this.selection.x,this.selection.z,this.selection.name);
 });
 this.clearButton=el('button',null,'Clear waypoint');this.clearButton.disabled=true;
 this.clearButton.addEventListener('click',()=>this.clearWaypoint());
 this.markerLabel=el('input','atlas-marker-title');this.markerLabel.type='text';this.markerLabel.maxLength=52;this.markerLabel.placeholder='Marker name';this.markerLabel.setAttribute('aria-label','Saved marker name');
 this.noteInput=el('textarea','atlas-marker-note');this.noteInput.rows=2;this.noteInput.maxLength=MAX_NOTE_LENGTH;this.noteInput.placeholder='Optional note (private to this browser)';this.noteInput.setAttribute('aria-label','Saved marker note');
 this.savePointButton=el('button',null,'Save point and note');this.savePointButton.type='button';this.savePointButton.disabled=true;this.savePointButton.addEventListener('click',()=>this.savePoint());
 this.savedList=el('div','atlas-saved-list');this.savedList.setAttribute('aria-label','Saved map points');
 this.noteStatus=el('p','atlas-note-status','Saved points are local to this browser and character.');this.noteStatus.setAttribute('aria-live','polite');
 tools.append(el('p','atlas-legend','▲ Enemies   ● Players   ◆ Objects   ◉ Party   ◇ Personal waypoint'),
   this.details,this.setSelected,this.clearButton,this.waypointDetails,
   el('h3',null,'Saved locations'),this.markerLabel,this.noteInput,this.savePointButton,this.noteStatus,this.savedList,
   this.results,el('p','muted','Saved markers are private to this browser. Distances are straight-line estimates. Drag to pan; click to mark; scroll to zoom.'));
 this.canvas=el('canvas');this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','Current region map');const controls=el('div','atlas-controls');
 for(const [label,fn] of [['Zoom +',()=>this.scale(1.25)],['Zoom −',()=>this.scale(.8)],['Center on player',()=>{this.pan={x:this.state.me.pos.x-this.region.x,z:this.state.me.pos.z-this.region.z};this.draw();}],['Reset view',()=>{this.zoom=1;this.pan={x:0,z:0};this.draw();}]]){
 const icon=({'Zoom +':'+','Zoom −':'−','Center on player':'⌖','Reset view':'⟲'})[label];const b=el('button',null,icon);b.type='button';b.title=label;b.setAttribute('aria-label',label);b.onclick=fn;controls.append(b);}
 full.textContent='⤢';full.setAttribute('aria-label','Full screen');full.title='Full screen';controls.append(full);
 this.playerMarker=el('div','atlas-player-marker','▲');this.playerMarker.setAttribute('role','img');this.playerMarker.setAttribute('aria-label','Your current position');this.playerMarker.title='Your current position';this.playerMarker.hidden=true;
 view.append(this.canvas,this.playerMarker,controls);body.append(tools,view);this.el.append(head,body);root.append(this.el);
 this.el.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();this.close();}});
 this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.scale(e.deltaY<0?1.2:1/1.2);},{passive:false});
 this.canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.drag={x:e.clientX,y:e.clientY,moved:false};this.canvas.setPointerCapture(e.pointerId);});
 this.canvas.addEventListener('pointermove',e=>{if(!this.drag||!this.p)return;
  const rect=this.canvas.getBoundingClientRect(),dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
  const moved=this.drag.moved||Math.hypot(dx,dy)>4;
  this.drag={x:e.clientX,y:e.clientY,moved};
  if(!moved)return;
  this.pan.x=clamp(this.pan.x-dx*this.canvas.width/rect.width/this.p.kx,-this.region.hw,this.region.hw);
  this.pan.z=clamp(this.pan.z-dy*this.canvas.height/rect.height/this.p.kz,-this.region.hd,this.region.hd);
  this.draw();
 });
 this.canvas.addEventListener('pointerup',e=>{
  if(this.drag&&!this.drag.moved&&this.p&&this.region){
   const rect=this.canvas.getBoundingClientRect();
   const px=(e.clientX-rect.left)*this.canvas.width/rect.width,py=(e.clientY-rect.top)*this.canvas.height/rect.height;
   const point=pixelToWorld(this.region,this.p,this.canvas.width,this.canvas.height,px,py,this.pan);
   if(pointInsideRegion(this.region,point.x,point.z))this.setWaypoint(point.x,point.z,'Custom waypoint');
  }
  this.drag=null;
 });
 for(const event of ['pointercancel','lostpointercapture'])this.canvas.addEventListener(event,()=>{this.drag=null;});
 this.waypointBrief=el('button','map-waypoint-brief');this.waypointBrief.type='button';this.waypointBrief.hidden=true;
 this.waypointBrief.title='Open atlas at your personal waypoint';
 this.waypointBrief.addEventListener('click',()=>{this.open();if(this.waypoint){this.pan={x:this.waypoint.x-this.region.x,z:this.waypoint.z-this.region.z};this.draw();}});
 this.clock=el('div','map-clock-row');this.day=el('span','map-day');this.game=el('span','map-game-clock');this.real=el('span','map-real-clock');this.clock.append(this.day,this.game,this.real);
 const section=el('section','map-settings');section.append(el('h3',null,'Map and clocks'));this.prefs={};
 for(const [key,label] of [['phase','Show day/night indicator'],['game','Show game clock'],['real','Show local real-time clock']]){
 const row=el('label'),check=el('input');check.type='checkbox';check.checked=key==='phase';
 try{const stored=localStorage.getItem('attunement.map.'+key);if(stored!==null)check.checked=stored==='1';}catch{}
 this.prefs[key]=check;check.onchange=()=>{this.save(key,check.checked?'1':'0');this.clocks();};row.append(check,document.createTextNode(' '+label));section.append(row);}
 for(const key of ['gameFormat','realFormat']){const label=el('label',null,key==='gameFormat'?'Game clock format':'Real clock format'),select=el('select');for(const v of ['24','12']){const o=el('option',null,v+'-hour');o.value=v;select.append(o);}try{select.value=localStorage.getItem('attunement.map.'+key)==='12'?'12':'24';}catch{}this.prefs[key]=select;select.onchange=()=>{this.save(key,select.value);this.clocks();};label.append(select);section.append(label);}
 settings.append(section);this.clocks();
 }
 save(k,v){try{localStorage.setItem('attunement.map.'+k,v);}catch{}}
 clocks(){
 const s=this.state?.daylight;
 const inExpanse=this.region?.area===SEVERANCE_POCKET;
 const d=inExpanse?daylightDisplay(s):null,n=new Date();
 // Use the authoritative cycle when present; a deliberate preview must say so.
 // A paired icon is intentionally neutral, not a claim about actual world time.
 this.day.hidden=!this.prefs.phase.checked;
 this.day.textContent=d?(d.phase==='day'?'☀ Day':'☾ Night'):'☀ / ☾';
 this.day.title=d?(d.preview?'Expanse lighting preview · ':'Expanse world time · ')+d.phase:inExpanse?'Expanse day/night cycle not active yet':'No active day/night cycle in this region';
 this.day.setAttribute('aria-label',this.day.title);
 this.day.dataset.status=d?'active':'pending';
 this.game.hidden=!this.prefs.game.checked;
 this.game.textContent=d?(d.preview?'Preview ':'Game ')+formatMinutes(d.minutes,this.prefs.gameFormat.value):'Game time —';
 this.real.hidden=!this.prefs.real.checked;
 this.real.textContent='Local '+formatMinutes(n.getHours()*60+n.getMinutes(),this.prefs.realFormat.value);
 this.clock.hidden=this.day.hidden&&this.game.hidden&&this.real.hidden;
}
 clearWaypoint(){this.waypoint=null;this.clearButton.disabled=true;this.refreshWaypoint();this.draw();}
 setWaypoint(x,z,label='Custom waypoint'){
  if(!this.region||!pointInsideRegion(this.region,x,z))return false;
  this.waypoint={x,z,label,region:this.region.name};
  this.clearButton.disabled=false;this.refreshWaypoint();this.draw();return true;
 }
 waypointFor(pos){
  if(!this.waypoint||!this.region||this.waypoint.region!==regionFor(pos).name)return null;
  return {...this.waypoint,...waypointRelative(pos,this.waypoint)};
 }
 refreshWaypoint(){
  const wp=this.state?.me?this.waypointFor(this.state.me.pos):null;
  this.waypointBrief.hidden=!wp;
  if(wp){
   const rounded=Math.round(wp.distance);
   this.waypointBrief.textContent='◇ '+wp.label+' · '+rounded+' m';
   this.waypointBrief.setAttribute('aria-label',wp.label+', approximately '+rounded+' metres straight line; open world atlas');
   this.waypointDetails.textContent='Waypoint: '+wp.label+' · '+rounded+' m straight-line';
  }else this.waypointDetails.textContent='No personal waypoint selected.';
 }
 open(){this.el.hidden=false;this.draw();this.el.querySelector('button')?.focus();}
 close(focus=true){if(this.el.hidden)return false;this.el.hidden=true;this.drag=null;if(focus)this.focusWorld();return true;}
 scale(f){this.zoom=clamp(this.zoom*f,1,5);this.draw();}
 update(st){this.state=st;const next=regionFor(st.me.pos);
 if(!this.region||this.region.x!==next.x||this.region.z!==next.z){
  this.zoom=1;this.pan={x:0,z:0};this.selection=null;this.setSelected.disabled=true;
  this.details.textContent='Select a place or click the map to set a personal waypoint.';
  // A private marker never silently follows the player to another region.
  this.waypoint=null;this.clearButton.disabled=true;
 }
 this.region=next;this.clocks();this.refreshWaypoint();
 if(!this.el.hidden)this.draw();
}
 draw(){
 if(this.el.hidden||!this.state||!this.region)return;const c=this.canvas,rect=c.getBoundingClientRect();if(rect.width<40||rect.height<40)return;
 const w=Math.round(Math.min(rect.width,1400)),h=Math.round(Math.min(rect.height,1000));if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;
 const g=c.getContext('2d'),r=this.region,st=this.state,p=project(r,w,h,this.zoom,this.pan);this.p=p;this.title.textContent=r.name+' · Atlas';this.regionName.textContent='ACTIVE REGION · '+r.name;
 g.fillStyle='#273339';g.fillRect(0,0,w,h);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
 if(!r.area)g.drawImage(reachTerrain(),p.X(-r.hw),p.Z(-r.hd),2*r.hw*p.kx,2*r.hd*p.kz);
 else{g.fillStyle='#3b4546';g.fillRect(p.X(r.x-r.hw),p.Z(r.z-r.hd),2*r.hw*p.kx,2*r.hd*p.kz);}
 g.strokeStyle='rgba(142,170,177,.12)';g.lineWidth=.8;g.beginPath();for(let x=r.x-r.hw;x<=r.x+r.hw;x+=20){g.moveTo(p.X(x),p.Z(r.z-r.hd));g.lineTo(p.X(x),p.Z(r.z+r.hd));}for(let z=r.z-r.hd;z<=r.z+r.hd;z+=20){g.moveTo(p.X(r.x-r.hw),p.Z(z));g.lineTo(p.X(r.x+r.hw),p.Z(z));}g.stroke();
 // Raw collision boxes do not belong on an illustrated map; visible snapshot objects retain markers.
 const party=new Set(st.party.map(m=>m.id)),term=this.search.value.trim().toLowerCase(),entries=[],labelBounds=[],clusterCandidates=[];
 const mark=(name,x,z,category,color,shape='dot')=>{
  if(!this.layers.has(category)||!name.toLowerCase().includes(term))return;
  entries.push({name,x,z,category});
  const px=p.X(x),py=p.Z(z),sz=shape==='place'?4.5:5;
  if(!term&&this.zoom<=1.5&&(category==='enemies'||category==='objects')){
   if(px>=0&&px<=w&&py>=0&&py<=h)clusterCandidates.push({x:px,y:py,category,color});
   return;
  }
  g.fillStyle=color;g.beginPath();
  if(category==='enemies'){
    g.moveTo(px,py-sz);g.lineTo(px+sz,py+sz*.75);g.lineTo(px-sz,py+sz*.75);g.closePath();
  }else if(category==='objects'||category==='places'){
    g.moveTo(px,py-sz);g.lineTo(px+sz,py);g.lineTo(px,py+sz);g.lineTo(px-sz,py);g.closePath();
  }else g.arc(px,py,sz,0,Math.PI*2);
  g.fill();g.strokeStyle='#111c22';g.lineWidth=2;g.stroke();
  if(category==='party'){g.beginPath();g.arc(px,py,sz+3,0,Math.PI*2);g.strokeStyle='#bce9f2';g.lineWidth=1.5;g.stroke();}
  if(shape==='place'||term){
    g.font='600 13px sans-serif';g.textAlign='center';
    const labelY=py-12,labelWidth=g.measureText(name).width+10;
    const bounds={left:px-labelWidth/2,right:px+labelWidth/2,top:labelY-14,bottom:labelY+3};
    const visible=bounds.left>=4&&bounds.right<=w-4&&bounds.top>=4&&bounds.bottom<=h-4;
    const overlaps=labelBounds.some(b=>bounds.left<b.right&&bounds.right>b.left&&bounds.top<b.bottom&&bounds.bottom>b.top);
    if(visible&&!overlaps){
      labelBounds.push(bounds);g.strokeStyle='#10171b';g.lineWidth=4;
      g.strokeText(name,px,labelY);g.fillStyle='#e7eceb';g.fillText(name,px,labelY);
    }
  }
 };
 if(!r.area)for(const z of Object.values(ZONES))mark(z.name,z.x,z.z,'places','#a4c5ca','place');
 for(const e of st.ents.values()){if(e.id===st.me.id||!sameTravelRegion(st.me.pos,e.pos))continue;const k=e.meta.k,category=k==='p'?(party.has(e.id)?'party':'players'):k==='e'&&!e.dead?'enemies':k==='o'?'objects':null;if(category)mark(e.meta.n||'Unknown',e.pos.x,e.pos.z,category,{party:'#74d3e2',players:'#8ec5a9',enemies:'#dd8b84',objects:'#95b5bd'}[category]);}
 for(const cluster of clusterMapMarkers(clusterCandidates,22)){
  const {x,y,count,color,category}=cluster,radius=count>1?11:5;
  g.save();g.beginPath();
  if(count===1&&category==='enemies'){
   g.moveTo(x,y-radius);g.lineTo(x+radius,y+radius*.75);g.lineTo(x-radius,y+radius*.75);g.closePath();
  }else if(count===1){
   g.moveTo(x,y-radius);g.lineTo(x+radius,y);g.lineTo(x,y+radius);g.lineTo(x-radius,y);g.closePath();
  }else g.arc(x,y,radius,0,Math.PI*2);
  g.fillStyle=count>1?'#15262d':color;
  g.fill();g.strokeStyle=color;g.lineWidth=count>1?2.5:1.6;g.stroke();
  if(count>1){g.font='bold 11px sans-serif';g.fillStyle='#eef6f7';g.textAlign='center';g.fillText(String(count),x,y+3.8);}
  g.restore();
 }
 if(this.waypoint?.region===r.name){
  const x=p.X(this.waypoint.x),y=p.Z(this.waypoint.z),s=9;
  g.save();g.translate(x,y);g.beginPath();g.moveTo(0,-s);g.lineTo(s,0);g.lineTo(0,s);g.lineTo(-s,0);g.closePath();
  g.fillStyle='#7acbdf';g.strokeStyle='#17252a';g.lineWidth=3;g.fill();g.stroke();
  g.font='bold 14px sans-serif';g.textAlign='center';g.lineWidth=4;g.strokeStyle='#131c21';
  g.strokeText(this.waypoint.label,0,-15);g.fillStyle='#e3f0f2';g.fillText(this.waypoint.label,0,-15);g.restore();
 }
 g.save();g.translate(p.X(st.me.pos.x),p.Z(st.me.pos.z));g.rotate(Math.PI-st.yaw);g.fillStyle='#fff';g.beginPath();g.moveTo(0,-8);g.lineTo(5,6);g.lineTo(0,3);g.lineTo(-5,6);g.closePath();g.fill();g.restore();g.fillStyle='#dce8ea';g.font='bold 14px sans-serif';g.textAlign='left';g.fillText('N ↑',12,21);
 const sig=JSON.stringify(entries.map(e=>[e.name,e.category,e.x,e.z]));
 this.entries=entries;
 if(sig!==this.sig){
  this.sig=sig;this.results.replaceChildren();
  for(let i=0;i<Math.min(entries.length,200);i++){
   const b=el('button',null,entries[i].name+' · '+entries[i].category);
   b.onclick=()=>{
    const e=this.entries[i];if(!e)return;
    this.selection=e;this.setSelected.disabled=false;
    this.pan={x:clamp(e.x-r.x,-r.hw,r.hw),z:clamp(e.z-r.z,-r.hd,r.hd)};
    this.zoom=Math.max(2,this.zoom);
    this.details.textContent=e.name+' · '+e.category+' · Select “Mark selected place” to create a waypoint.';
    this.draw();
   };
   this.results.append(b);
  }
 }
 }
}
