// Cartography presentation: use only existing public geometry and delivered snapshots.
import {WORLD,ZONES,RIFT_ANNEX,SEVERANCE_POCKET,inRiftAnnex,inSeverancePocket,sameTravelRegion} from '../../shared/world.js';
import {reachAtlasTerrain,reachAtlasContours,clusterMapMarkers,atlasEntityCategory,placeAtlasLabels} from './atlas-cartography.js';
import {loadSavedPoints,persistSavedPoints,MAX_SAVED_POINTS,MAX_NOTE_LENGTH} from './atlas-saved-points.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function regionFor(pos){
 const a=inRiftAnnex(pos.x,pos.z,2)?RIFT_ANNEX:inSeverancePocket(pos.x,pos.z,2)?SEVERANCE_POCKET:null;
 return a?{area:a,name:a.name||'Current region',x:a.x,z:a.z,hw:a.hw,hd:a.hd}:{area:null,name:WORLD.name,x:0,z:0,hw:WORLD.radius,hd:WORLD.radius};
}
export function project(r,w,h,zoom=1,pan={x:0,z:0}){
 // Verdigris Reach uses a circular world radius. Stretching independent
 // X/Z axes to fill a widescreen viewport creates a false oval landscape.
 // Preserve actual distances and geometry on the Reach only. Keep existing
 // independent axes in other regions (including Claude-reserved geography).
 const fitX=(w-28)/(2*r.hw)*zoom,fitZ=(h-28)/(2*r.hd)*zoom;
 const k=Math.min(fitX,fitZ);
 const kx=r.area?fitX:k,kz=r.area?fitZ:k;
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
// The server sends a global clock even in regions with static local lighting.
// Deliberate Expanse lighting previews must remain labelled as previews.
export function atlasClockDisplay(state,inExpanse){
 const local=inExpanse?daylightDisplay(state?.daylight):null;
 if(local?.preview)return local;
 const wc=state?.worldClock;
 if(Number.isFinite(wc)&&wc>=0&&wc<=10000)
  return daylightDisplay({applied:true,t:wc/10000,mode:'live'});
 return local;
}
export function formatMinutes(minutes,format='24'){
 const hours=Math.floor(minutes/60)%24,m=String(minutes%60).padStart(2,'0');
 return format==='12'?(hours%12||12)+':'+m+' '+(hours<12?'AM':'PM'):String(hours).padStart(2,'0')+':'+m;
}
// Preserve the existing texture API for callers; render the richer terrain plate.
export const reachTerrain=reachAtlasTerrain;
export class WorldAtlas{
 constructor(root,settings,focusWorld,captureTerrain=null){
 this.focusWorld=focusWorld;this.zoom=1;this.pan={x:0,z:0};this.waypoint=null;this.selection=null;this.layers=new Set(['places','party','players','objects']);
  this.owner=null;this.savedPoints=[];this.activeSavedId=null;this.staticPaints=0;
  this.captureTerrain=typeof captureTerrain==='function'?captureTerrain:null;
  this.terrainCache=new Map();this.terrainCaptureAttempts=0;
  // Authored Verdigris Reach chart uses the canonical [-radius,+radius] square
  // with (0,0) at SVG (500,500). All dynamic markers retain project() coordinates.
  this.reachArtwork=typeof Image==='function'?new Image():null;
  if(this.reachArtwork){
   this.reachArtwork.onload=()=>{if(this.region&&!this.el.hidden&&!this.region.area)this.draw();};
   this.reachArtwork.onerror=()=>console.warn('[atlas] authored Reach chart unavailable; using terrain fallback');
   this.reachArtwork.src='/client/assets/atlas/reach-handdrawn.svg';
  }
 this.el=el('section','world-atlas');this.el.hidden=true;this.el.setAttribute('role','dialog');this.el.setAttribute('aria-label','World atlas');
 const head=el('header','atlas-header');this.title=el('h2',null,'World atlas');
 const full=el('button',null,'Full screen');full.type='button';full.setAttribute('aria-pressed','false');
 full.addEventListener('click',()=>{const on=this.el.classList.toggle('atlas-fullscreen');full.setAttribute('aria-label',on?'Restore window':'Full screen');full.title=full.getAttribute('aria-label');full.textContent=on?'⤡':'⤢';full.setAttribute('aria-pressed',String(on));this.draw();});
 const close=el('button',null,'Close');close.onclick=()=>this.close();head.append(this.title,close);
 const body=el('div','atlas-body'),tools=el('aside','atlas-tools'),view=el('div','atlas-view');
 const tabs=el('div','atlas-tabs'),mapTab=el('button',null,'Map'),savedTab=el('button',null,'Saved');
 const mapPanel=el('div','atlas-tool-panel atlas-map-panel'),savedPanel=el('div','atlas-tool-panel atlas-saved-panel');
 mapTab.type=savedTab.type='button';
 mapTab.title='Map layers, search and waypoint controls';savedTab.title='Saved locations and notes';
 const selectTab=tab=>{
  const saved=tab==='saved';
  mapPanel.hidden=saved;savedPanel.hidden=!saved;
  mapTab.setAttribute('aria-pressed',String(!saved));savedTab.setAttribute('aria-pressed',String(saved));
 };
 mapTab.onclick=()=>selectTab('map');savedTab.onclick=()=>selectTab('saved');
 tabs.append(mapTab,savedTab);tools.append(tabs,mapPanel,savedPanel);selectTab('map');
 this.selectAtlasTab=selectTab;
 this.search=el('input');this.search.type='search';this.search.placeholder='Search places or visible entities';this.search.title='Search known places and visible non-hostile entities';this.search.setAttribute('aria-label','Search known places and visible non-hostile entities');this.search.oninput=()=>this.draw();this.regionName=el('div','atlas-region',WORLD.name);mapPanel.append(this.regionName,this.search,el('h3',null,'Map layers'));
 for(const [id,label] of [['places','Places'],['party','Party'],['players','Players'],['objects','Objects (visible)']]){
 const l=el('label'),c=el('input');c.type='checkbox';c.checked=true;c.onchange=()=>{c.checked?this.layers.add(id):this.layers.delete(id);this.draw();};l.append(c,document.createTextNode(' '+label));mapPanel.append(l);}
 this.details=el('p','atlas-details','');this.details.hidden=true;
 this.details.setAttribute('aria-live','polite');
 this.waypointDetails=el('p','atlas-waypoint-details','');this.waypointDetails.hidden=true;
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
 this.savedPointPicker=el('select','atlas-saved-picker');this.savedPointPicker.setAttribute('aria-label','Choose saved location');
 this.savedPointPicker.title='Choose any saved location; no scrolling through the Atlas sidebar';
 this.savedPointPicker.addEventListener('change',()=>{
   const point=this.savedPoints.find(p=>p.id===this.savedPointPicker.value);
   if(!point||!this.region||point.region!==this.region.name||!pointInsideRegion(this.region,point.x,point.z))return;
   this.setWaypoint(point.x,point.z,point.label);
   this.activeSavedId=point.id;
   this.noteInput.value=point.note;
   this.markerLabel.value=point.label;
   this.pan={x:clamp(point.x-this.region.x,-this.region.hw,this.region.hw),z:clamp(point.z-this.region.z,-this.region.hd,this.region.hd)};
   this.refreshSavedList();this.draw();
 });
 this.noteStatus=el('p','atlas-note-status','');this.noteStatus.hidden=true;this.noteStatus.setAttribute('aria-live','polite');
 const legend=el('p','atlas-legend','● Players   ◆ Objects   ◉ Party   ◇ Waypoint');
 legend.title='Player: circle · Visible object: diamond · Party: ring · Personal waypoint: hollow diamond';
 this.details.title='Click the map to set a waypoint, or select a search result.';
 this.waypointDetails.title='Distance is straight-line, not a navigation route.';
 this.noteStatus.title='Saved markers remain private to this browser and character.';
 mapPanel.append(legend,this.details,this.setSelected,this.clearButton,this.waypointDetails);
 savedPanel.append(this.markerLabel,this.noteInput,this.savePointButton,this.noteStatus,this.savedPointPicker,this.savedList);
  this.search.after(this.results);this.results.hidden=true;
 this.canvas=el('canvas');this.canvas.tabIndex=0;this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','Current region map. Use arrow keys to pan, Enter to mark the map center, plus and minus to zoom.');this.canvas.title='Click or press Enter to mark a waypoint; drag or use arrow keys to pan; scroll or use plus and minus to zoom. Distances are straight-line.';const controls=el('div','atlas-controls');
 for(const [label,fn] of [['Zoom +',()=>this.scale(1.25)],['Zoom −',()=>this.scale(.8)],['Center on player',()=>{this.pan={x:this.state.me.pos.x-this.region.x,z:this.state.me.pos.z-this.region.z};this.draw();}],['Reset view',()=>{this.zoom=1;this.pan={x:0,z:0};this.draw();}]]){
 const icon=({'Zoom +':'+','Zoom −':'−','Center on player':'⌖','Reset view':'⟲'})[label];const b=el('button',null,icon);b.type='button';b.title=label;b.setAttribute('aria-label',label);b.onclick=fn;controls.append(b);}
 full.textContent='⤢';full.setAttribute('aria-label','Full screen');full.title='Full screen';controls.append(full);
 this.playerMarker=el('div','atlas-player-marker','▲');this.playerMarker.setAttribute('role','img');this.playerMarker.setAttribute('aria-label','Your current position');this.playerMarker.title='Your current position';this.playerMarker.hidden=true;
 view.append(this.canvas,this.playerMarker,controls);body.append(tools,view);this.el.append(head,body);root.append(this.el);
 this.el.addEventListener('keydown',e=>{
  // The map owns focus while open. M should close it as well as open it,
  // except when the user is editing a search, marker name or note.
  e.stopPropagation();
  if(e.key==='Escape'){e.preventDefault();this.close();return;}
  if(e.code==='KeyM'&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&
     !['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName)){
   e.preventDefault();this.close();
  }
 });
 this.canvas.addEventListener('keydown',e=>{
  if(!this.region||!this.p||e.ctrlKey||e.altKey||e.metaKey)return;
  const step=10/this.zoom;
  const offsets={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
  if(Object.hasOwn(offsets,e.key)){
   e.preventDefault();
   const [dx,dz]=offsets[e.key];
   const nextX=clamp(this.pan.x+dx,-this.region.hw,this.region.hw);
   const nextZ=clamp(this.pan.z+dz,-this.region.hd,this.region.hd);
   // Reach is circular: keyboard navigation must not pan the map center
   // into an unmapped corner outside its actual playable geography.
   const length=Math.hypot(nextX,nextZ);
   const radius=this.region.area?Infinity:Math.max(0,WORLD.radius-0.001);
   const ratio=length>radius?radius/length:1;
   this.pan.x=nextX*ratio;
   this.pan.z=nextZ*ratio;
   this.draw();
  }else if(e.key==='Enter'){
   e.preventDefault();
   const point={x:this.region.x+this.pan.x,z:this.region.z+this.pan.z};
   if(pointInsideRegion(this.region,point.x,point.z))this.setWaypoint(point.x,point.z,'Custom waypoint');
  }else if(e.key==='+'||e.key==='='){e.preventDefault();this.scale(1.25);}
  else if(e.key==='-'){e.preventDefault();this.scale(.8);}
 });
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
 const row=el('label'),check=el('input');check.type='checkbox';check.checked=true;
 try{const stored=localStorage.getItem('attunement.map.'+key);if(stored!==null)check.checked=stored==='1';}catch{}
 this.prefs[key]=check;check.onchange=()=>{this.save(key,check.checked?'1':'0');this.clocks();};row.append(check,document.createTextNode(' '+label));section.append(row);}
 for(const key of ['gameFormat','realFormat']){const label=el('label',null,key==='gameFormat'?'Game clock format':'Real clock format'),select=el('select');for(const v of ['24','12']){const o=el('option',null,v+'-hour');o.value=v;select.append(o);}try{select.value=localStorage.getItem('attunement.map.'+key)==='12'?'12':'24';}catch{}this.prefs[key]=select;select.onchange=()=>{this.save(key,select.value);this.clocks();};label.append(select);section.append(label);}
 settings.append(section);this.clocks();
 }
 save(k,v){try{localStorage.setItem('attunement.map.'+k,v);}catch{}}

 setOwner(id){
  this.owner=typeof id==='string'?id:null;
  this.savedPoints=loadSavedPoints(typeof localStorage==='undefined'?null:localStorage,this.owner);
  this.activeSavedId=null;this.waypoint=null;this.clearButton.disabled=true;
  this.markerLabel.value='';this.noteInput.value='';
  this.savePointButton.disabled=true;this.refreshSavedList();this.refreshWaypoint();
  if(!this.el.hidden)this.draw();
 }
 refreshSavedList(){
  this.savedList.replaceChildren();
  const region=this.region?.name;
  const points=this.savedPoints.filter(p=>p.region===region);
  this.savedPointPicker.replaceChildren();
  const placeholder=el('option',null,'Choose saved location');placeholder.value='';this.savedPointPicker.append(placeholder);
  for(const point of points){
    const option=el('option',null,point.label);option.value=point.id;this.savedPointPicker.append(option);
  }
  this.savedPointPicker.hidden=!points.length;
  const selected=points.find(p=>p.id===this.activeSavedId)||points.at(-1);
  if(!selected){
   this.savedList.append(el('p','muted','No saved locations.'));
   return;
  }
  this.savedPointPicker.value=selected.id;
  // Only the selected record is expanded. All other saved records stay
  // accessible through the native picker without an Atlas scrollbar.
  for(const point of [selected]){
   const row=el('div','atlas-saved-point');
   const activate=el('button','atlas-saved-select',point.label);
   activate.type='button';activate.title=point.note||'Show saved point';
   activate.addEventListener('click',()=>{
    if(!this.region||!pointInsideRegion(this.region,point.x,point.z))return;
    this.setWaypoint(point.x,point.z,point.label);
    this.activeSavedId=point.id;
    this.noteInput.value=point.note;
    this.markerLabel.value=point.label;
    this.pan={x:clamp(point.x-this.region.x,-this.region.hw,this.region.hw),z:clamp(point.z-this.region.z,-this.region.hd,this.region.hd)};
    this.draw();
   });
   const remove=el('button','atlas-saved-delete','×');
   remove.type='button';remove.title='Delete '+point.label;remove.setAttribute('aria-label','Delete saved point '+point.label);
   remove.addEventListener('click',()=>{
    const rest=this.savedPoints.filter(p=>p.id!==point.id);
    if(!persistSavedPoints(localStorage,this.owner,rest)){
     this.noteStatus.hidden=false;this.noteStatus.textContent='Could not delete point from local storage.';return;
    }
    this.savedPoints=rest;
    if(this.activeSavedId===point.id)this.activeSavedId=null;
    this.noteStatus.hidden=false;this.noteStatus.textContent='Saved point deleted.';
    this.refreshSavedList();this.draw();
   });
   row.append(activate);
   if(point.note)row.append(el('p','atlas-saved-note',point.note));
   row.append(remove);this.savedList.append(row);
  }
 }
 savePoint(){
  if(!this.waypoint||!this.owner)return false;
  const label=this.markerLabel.value.trim().slice(0,52)||this.waypoint.label;
  const note=this.noteInput.value.trim().slice(0,MAX_NOTE_LENGTH);
  const id=this.activeSavedId||crypto.randomUUID();
  const point={id,x:this.waypoint.x,z:this.waypoint.z,region:this.waypoint.region,label,note};
  const rest=this.savedPoints.filter(p=>p.id!==id);
  if(rest.length>=MAX_SAVED_POINTS){this.noteStatus.hidden=false;this.noteStatus.textContent='Maximum of '+MAX_SAVED_POINTS+' saved points reached.';return false;}
  const next=[...rest,point];
  if(!persistSavedPoints(localStorage,this.owner,next)){
   this.noteStatus.hidden=false;this.noteStatus.textContent='Could not save. Local browser storage may be full or disabled.';
   return false;
  }
  this.savedPoints=next;this.activeSavedId=id;this.waypoint={...this.waypoint,label};
  this.noteStatus.hidden=false;this.noteStatus.textContent='Saved for this character on this browser.';
  this.refreshSavedList();this.refreshWaypoint();this.selectAtlasTab('saved');this.draw();return true;
 }
 updatePlayerMarker(){
  if(!this.playerMarker||this.el.hidden||!this.state?.me||!this.p){
   if(this.playerMarker)this.playerMarker.hidden=true;
   return;
  }
  const rect=this.canvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const x=this.p.X(this.state.me.pos.x)/this.canvas.width*rect.width;
  const y=this.p.Z(this.state.me.pos.z)/this.canvas.height*rect.height;
  const visible=Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<=rect.width&&y<=rect.height;
  this.playerMarker.hidden=!visible;
  if(!visible)return;
  this.playerMarker.style.left=x+'px';this.playerMarker.style.top=y+'px';
  this.playerMarker.style.transform='translate(-50%,-50%) rotate('+(Math.PI-(this.state.yaw||0))+'rad)';
 }

 clocks(){
 const inExpanse=this.region?.area===SEVERANCE_POCKET;
 const d=atlasClockDisplay(this.state,inExpanse),n=new Date();
 // Use the authoritative cycle when present; a deliberate preview must say so.
 // A paired icon is intentionally neutral, not a claim about actual world time.
 this.day.hidden=!this.prefs.phase.checked;
 this.day.textContent=d?(d.phase==='day'?'☀ Day':'☾ Night'):'☀ / ☾';
 this.day.title=d?(d.preview?'Expanse lighting preview · ':'World clock · ')+d.phase+(!inExpanse?' (local lighting is independent)':''):'World clock not received yet';
 this.day.setAttribute('aria-label',this.day.title);
 this.day.dataset.status=d?'active':'pending';
 this.game.hidden=!this.prefs.game.checked;
 this.game.textContent=d?(d.preview?'Preview ':'Game ')+formatMinutes(d.minutes,this.prefs.gameFormat.value):'Game time —';
 this.real.hidden=!this.prefs.real.checked;
 this.real.textContent='Local '+formatMinutes(n.getHours()*60+n.getMinutes(),this.prefs.realFormat.value);
 this.clock.hidden=this.day.hidden&&this.game.hidden&&this.real.hidden;
}
 clearWaypoint(){
  this.waypoint=null;this.activeSavedId=null;this.clearButton.disabled=true;
  this.savePointButton.disabled=true;this.markerLabel.value='';this.noteInput.value='';
  this.refreshWaypoint();this.draw();
 }
 setWaypoint(x,z,label='Custom waypoint'){
  if(!this.region||!pointInsideRegion(this.region,x,z))return false;
  this.waypoint={x,z,label,region:this.region.name};
  this.activeSavedId=null;this.markerLabel.value=label;this.noteInput.value='';
  this.clearButton.disabled=false;this.savePointButton.disabled=!this.owner;
  this.refreshWaypoint();this.draw();return true;
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
  }else this.waypointDetails.textContent='';
  this.waypointDetails.hidden=!wp;
 }
 open(){this.el.hidden=false;this.draw();this.updatePlayerMarker();this.el.querySelector('button')?.focus();}
 close(focus=true){if(this.el.hidden)return false;this.el.hidden=true;this.playerMarker.hidden=true;this.drag=null;if(focus)this.focusWorld();return true;}
 scale(f){this.zoom=clamp(this.zoom*f,1,5);this.draw();}
 update(st){
  // The atlas background is static; only the player marker moves with
  // live state. Entity snapshots refresh when the user interacts.
  this.state=st;const next=regionFor(st.me.pos);
  const changed=!this.region||this.region.x!==next.x||this.region.z!==next.z;
  if(changed){
   this.zoom=1;this.pan={x:0,z:0};this.selection=null;this.setSelected.disabled=true;
   this.details.textContent='';this.details.hidden=true;
   this.waypoint=null;this.activeSavedId=null;this.clearButton.disabled=true;
   this.savePointButton.disabled=true;this.markerLabel.value='';this.noteInput.value='';
  }
  this.region=next;
  if(changed)this.refreshSavedList();
  const now=Date.now();
  if(changed||!this.lastInfoUpdate||now-this.lastInfoUpdate>500){
   this.lastInfoUpdate=now;this.clocks();this.refreshWaypoint();
  }
  if(changed&&!this.el.hidden)this.draw();
  else this.updatePlayerMarker();
 }
 terrainForRegion(region){
  if(!this.terrainCache.has(region.name)){
   this.terrainCaptureAttempts++;
   let plate=null;
   try{plate=this.captureTerrain?.(region)||null;}
   catch(err){console.warn('[atlas] terrain capture failed',err);}
   // A failed GPU capture is cached as null. Never retry every movement tick.
   this.terrainCache.set(region.name,plate);
  }
  return this.terrainCache.get(region.name);
 }
 draw(){
 if(this.el.hidden||!this.state||!this.region)return;const c=this.canvas,rect=c.getBoundingClientRect();if(rect.width<40||rect.height<40)return;
 const w=Math.round(Math.min(rect.width,1400)),h=Math.round(Math.min(rect.height,1000));if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;
 const g=c.getContext('2d'),r=this.region,st=this.state,p=project(r,w,h,this.zoom,this.pan);this.p=p;this.title.textContent=r.name+' · Atlas';this.regionName.textContent='ACTIVE REGION · '+r.name;
 g.fillStyle='#273339';g.fillRect(0,0,w,h);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
 const captured=r.area?this.terrainForRegion(r):null;
 const authored=!r.area&&!!this.reachArtwork?.naturalWidth;
 c.dataset.terrainSource=authored?'authored':captured?'scene':'fallback';
 c.dataset.terrainCaptureCount=String(this.terrainCaptureAttempts);
 // Use authored cartography only for Verdigris Reach. Player markers,
 // party and waypoints share this exact, aspect-preserving projection.
 if(!r.area){
   const left=p.X(-r.hw),top=p.Z(-r.hd),width=2*r.hw*p.kx,height=2*r.hd*p.kz;
   if(authored)g.drawImage(this.reachArtwork,left,top,width,height);
   else{g.drawImage(reachTerrain(),left,top,width,height);g.drawImage(reachAtlasContours(),left,top,width,height);}
 }else if(captured){
   g.drawImage(captured,p.X(r.x-r.hw),p.Z(r.z-r.hd),2*r.hw*p.kx,2*r.hd*p.kz);
 }else{
   g.fillStyle='#3b4546';
   g.fillRect(p.X(r.x-r.hw),p.Z(r.z-r.hd),2*r.hw*p.kx,2*r.hd*p.kz);
 }
 g.strokeStyle='rgba(142,170,177,.12)';g.lineWidth=.8;g.beginPath();for(let x=r.x-r.hw;x<=r.x+r.hw;x+=20){g.moveTo(p.X(x),p.Z(r.z-r.hd));g.lineTo(p.X(x),p.Z(r.z+r.hd));}for(let z=r.z-r.hd;z<=r.z+r.hd;z+=20){g.moveTo(p.X(r.x-r.hw),p.Z(z));g.lineTo(p.X(r.x+r.hw),p.Z(z));}g.stroke();
 // Raw collision boxes do not belong on an illustrated map; visible snapshot objects retain markers.
 const party=new Set((st.party||[]).map(m=>m.id)),term=this.search.value.trim().toLowerCase(),entries=[],labelCandidates=[],markerObstacles=[],clusterCandidates=[];
 let waypointLabel=null;
  this.results.hidden=!term;
 const mark=(name,x,z,category,color,shape='dot')=>{
  if(!this.layers.has(category)||!name.toLowerCase().includes(term))return;
  entries.push({name,x,z,category});
  const px=p.X(x),py=p.Z(z),sz=shape==='place'?4.5:5;
  if(shape==='place'||term)labelCandidates.push({name,x:px,y:py});
  if(px>=0&&px<=w&&py>=0&&py<=h)markerObstacles.push({x:px,y:py,r:sz+3});
  if(!term&&this.zoom<=1.5&&category==='objects'){
   if(px>=0&&px<=w&&py>=0&&py<=h)clusterCandidates.push({x:px,y:py,category,color});
   return;
  }
  g.fillStyle=color;g.beginPath();
  if(category==='objects'||category==='places'){
    g.moveTo(px,py-sz);g.lineTo(px+sz,py);g.lineTo(px,py+sz);g.lineTo(px-sz,py);g.closePath();
  }else g.arc(px,py,sz,0,Math.PI*2);
  g.fill();g.strokeStyle='#111c22';g.lineWidth=2;g.stroke();
  if(category==='party'){g.beginPath();g.arc(px,py,sz+3,0,Math.PI*2);g.strokeStyle='#bce9f2';g.lineWidth=1.5;g.stroke();}
  // Defer labels until all visible marker and cluster positions are known.
 };
 if(!r.area)for(const z of Object.values(ZONES))mark(z.name,z.x,z.z,'places','#a4c5ca','place');
 for(const e of st.ents.values()){
  const category=atlasEntityCategory(e.meta,party.has(e.id));
  if(!category||e.id===st.me.id||!sameTravelRegion(st.me.pos,e.pos))continue;
  mark(e.meta.n||'Unknown',e.pos.x,e.pos.z,category,{party:'#74d3e2',players:'#8ec5a9',objects:'#95b5bd'}[category]);
 }
 for(const cluster of clusterMapMarkers(clusterCandidates,22)){
  const {x,y,count,color,category}=cluster,radius=count>1?11:5;
  markerObstacles.push({x,y,r:radius+3});
  g.save();g.beginPath();
  if(count===1){
   g.moveTo(x,y-radius);g.lineTo(x+radius,y);g.lineTo(x,y+radius);g.lineTo(x-radius,y);g.closePath();
  }else g.arc(x,y,radius,0,Math.PI*2);
  g.fillStyle=count>1?'#15262d':color;
  g.fill();g.strokeStyle=color;g.lineWidth=count>1?2.5:1.6;g.stroke();
  if(count>1){g.font='bold 11px sans-serif';g.fillStyle='#eef6f7';g.textAlign='center';g.fillText(String(count),x,y+3.8);}
  g.restore();
 }
 // Paint saved locations only on map refresh, not on player movement.
 for(const point of this.savedPoints){
  if(point.region!==r.name||!pointInsideRegion(r,point.x,point.z))continue;
  const x=p.X(point.x),y=p.Z(point.z);
  if(x<2||y<2||x>w-2||y>h-2)continue;
  markerObstacles.push({x,y,r:9});
  g.save();g.translate(x,y);g.fillStyle='#4b9eb6';g.strokeStyle='#eef7f9';g.lineWidth=1.5;
  g.beginPath();g.arc(0,0,5,0,Math.PI*2);g.fill();g.stroke();g.restore();
 }
 if(this.waypoint?.region===r.name){
  const x=p.X(this.waypoint.x),y=p.Z(this.waypoint.z),s=9;
  markerObstacles.push({x,y,r:16},{x,y:y-15,r:16});
  g.save();g.translate(x,y);g.beginPath();g.moveTo(0,-s);g.lineTo(s,0);g.lineTo(0,s);g.lineTo(-s,0);g.closePath();
  g.fillStyle='#7acbdf';g.strokeStyle='#17252a';g.lineWidth=3;g.fill();g.stroke();
  g.restore();
  // Personal waypoints participate in the same collision layout as place
  // names. Drawing this caption immediately overlaps the nearby site label.
  waypointLabel={name:this.waypoint.label,x,y,kind:'waypoint'};
 }
 // Reserve the live player position as well as all visible marker clusters.
 markerObstacles.push({x:p.X(st.me.pos.x),y:p.Z(st.me.pos.z),r:19});
 g.save();g.font='bold 13px sans-serif';g.textAlign='center';
 // Place the waypoint first, then shift or suppress lower-priority site labels
 // when their captions would collide. All markers and search entries stay put.
 const labels=waypointLabel?[waypointLabel,...labelCandidates]:labelCandidates;
 for(const label of placeAtlasLabels(labels,markerObstacles,w,h,name=>g.measureText(name).width)){
  g.font=label.kind==='waypoint'?'bold 13px sans-serif':'600 13px sans-serif';
  g.lineJoin='round';g.strokeStyle='#10171b';g.lineWidth=4;
  g.strokeText(label.name,label.x,label.y);
  g.fillStyle=label.kind==='waypoint'?'#e3f0f2':'#e7eceb';g.fillText(label.name,label.x,label.y);
 }
 g.restore();
 // The player position is a lightweight DOM overlay, not static map paint.
 g.fillStyle='#dce8ea';g.font='bold 14px sans-serif';g.textAlign='left';g.fillText('N ↑',12,21);
 const sig=JSON.stringify(entries.map(e=>[e.name,e.category,e.x,e.z]));
 this.entries=entries;
 if(sig!==this.sig){
  this.sig=sig;this.results.replaceChildren();
  for(let i=0;i<Math.min(entries.length,4);i++){
   const b=el('button',null,entries[i].name+' · '+entries[i].category);
   b.onclick=()=>{
    const e=this.entries[i];if(!e)return;
    this.selection=e;this.setSelected.disabled=false;
    this.pan={x:clamp(e.x-r.x,-r.hw,r.hw),z:clamp(e.z-r.z,-r.hd,r.hd)};
    this.zoom=Math.max(2,this.zoom);
    this.details.textContent=e.name+' · '+e.category;this.details.hidden=false;
    this.draw();
   };
   this.results.append(b);
  }
  if(entries.length>4){
    const hint=el('p','atlas-result-hint','Refine search ('+entries.length+' matches)');
    hint.title='Search results are limited to four visible entries to keep Atlas controls fitted without scrolling.';
    this.results.append(hint);
  }
 }
 this.staticPaints++;
 this.canvas.dataset.paintCount=String(this.staticPaints);
 this.updatePlayerMarker();
 }
}
