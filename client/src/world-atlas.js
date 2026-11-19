// Cartography presentation: use only existing public geometry and delivered snapshots.
import {WORLD,ZONES,COLLIDERS,RIFT_ANNEX,SEVERANCE_POCKET,inRiftAnnex,inSeverancePocket,sameTravelRegion,groundHeight} from '../../shared/world.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function regionFor(pos){
 const a=inRiftAnnex(pos.x,pos.z,2)?RIFT_ANNEX:inSeverancePocket(pos.x,pos.z,2)?SEVERANCE_POCKET:null;
 return a?{area:a,name:a.name||'Current region',x:a.x,z:a.z,hw:a.hw,hd:a.hd}:{area:null,name:WORLD.name,x:0,z:0,hw:WORLD.radius,hd:WORLD.radius};
}
export function project(r,w,h,zoom=1,pan={x:0,z:0}){
 const k=Math.min((w-28)/(2*r.hw),(h-28)/(2*r.hd))*zoom;
 return {k,X:x=>w/2+(x-r.x-pan.x)*k,Z:z=>h/2+(z-r.z-pan.z)*k};
}
export function daylightDisplay(state){
 if(!state?.applied||!Number.isFinite(state.t))return null;
 // Existing renderer anchors: day/noon 0, dusk .25, night .5, dawn .75.
 const minutes=((Math.floor(state.t*1440)+720)%1440+1440)%1440;
 return {minutes,phase:minutes>=360&&minutes<1080?'day':'night',preview:true};
}
export function formatMinutes(minutes,format='24'){
 const hours=Math.floor(minutes/60)%24,m=String(minutes%60).padStart(2,'0');
 return format==='12'?(hours%12||12)+':'+m+' '+(hours<12?'AM':'PM'):String(hours).padStart(2,'0')+':'+m;
}
let terrain;
function reachTerrain(){
 if(terrain)return terrain;
 const c=el('canvas');c.width=c.height=192;const g=c.getContext('2d'),a=g.createImageData(192,192),r=WORLD.radius,s=2*r/192;
 for(let j=0;j<192;j++)for(let i=0;i<192;i++){
 const x=-r+(i+.5)*s,z=-r+(j+.5)*s;if(Math.hypot(x,z)>r)continue;
 const h=groundHeight(x,z),slope=groundHeight(x-s,z-s)-h,shade=clamp(1+h*.018+slope*.25,.62,1.35),base=h<-2?[78,100,98]:h>3?[143,129,101]:[105,124,93],off=(j*192+i)*4;
 for(let k=0;k<3;k++)a.data[off+k]=base[k]*shade;a.data[off+3]=255;
 }
 g.putImageData(a,0,0);terrain=c;return c;
}
export class WorldAtlas{
 constructor(root,settings,focusWorld){
 this.focusWorld=focusWorld;this.zoom=1;this.pan={x:0,z:0};this.layers=new Set(['places','party','players','enemies','objects']);
 this.el=el('section','world-atlas');this.el.hidden=true;this.el.setAttribute('role','dialog');this.el.setAttribute('aria-label','World atlas');
 const head=el('header','atlas-header');this.title=el('h2',null,'World atlas');const close=el('button',null,'Close');close.onclick=()=>this.close();head.append(this.title,close);
 const body=el('div','atlas-body'),tools=el('aside','atlas-tools'),view=el('div','atlas-view');
 this.search=el('input');this.search.type='search';this.search.placeholder='Search visible places and entities';this.search.setAttribute('aria-label','Search map');this.search.oninput=()=>this.draw();tools.append(this.search,el('h3',null,'Map layers'));
 for(const [id,label] of [['places','Places'],['party','Party'],['players','Players'],['enemies','Enemies (visible)'],['objects','Objects (visible)']]){
 const l=el('label'),c=el('input');c.type='checkbox';c.checked=true;c.onchange=()=>{c.checked?this.layers.add(id):this.layers.delete(id);this.draw();};l.append(c,document.createTextNode(' '+label));tools.append(l);}
 this.details=el('p','atlas-details','Select an entry to locate it.');this.results=el('div','atlas-results');tools.append(this.details,this.results,el('p','muted','Current region only. Drag to pan; scroll to zoom.'));
 this.canvas=el('canvas');this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','Current region map');const controls=el('div','atlas-controls');
 for(const [label,fn] of [['Zoom +',()=>this.scale(1.25)],['Zoom −',()=>this.scale(.8)],['Reset view',()=>{this.zoom=1;this.pan={x:0,z:0};this.draw();}]]){
 const b=el('button',null,label);b.onclick=fn;controls.append(b);}
 view.append(this.canvas,controls);body.append(tools,view);this.el.append(head,body);root.append(this.el);
 this.el.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();this.close();}});
 this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.scale(e.deltaY<0?1.2:1/1.2);},{passive:false});
 this.canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.drag={x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);});
 this.canvas.addEventListener('pointermove',e=>{if(!this.drag||!this.p)return;const rect=this.canvas.getBoundingClientRect(),dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.drag={x:e.clientX,y:e.clientY};this.pan.x=clamp(this.pan.x-dx*this.canvas.width/rect.width/this.p.k,-this.region.hw,this.region.hw);this.pan.z=clamp(this.pan.z-dy*this.canvas.height/rect.height/this.p.k,-this.region.hd,this.region.hd);this.draw();});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])this.canvas.addEventListener(event,()=>{this.drag=null;});
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
 clocks(){const s=this.state?.daylight,d=daylightDisplay(s),n=new Date();this.day.hidden=!this.prefs.phase.checked||!d;this.day.textContent=d?.phase==='day'?'☀':'☾';this.day.title=d?'Lighting preview · '+d.phase:'';this.game.hidden=!this.prefs.game.checked;this.game.textContent=d?'Preview '+formatMinutes(d.minutes,this.prefs.gameFormat.value):'Game time —';this.real.hidden=!this.prefs.real.checked;this.real.textContent='Local '+formatMinutes(n.getHours()*60+n.getMinutes(),this.prefs.realFormat.value);this.clock.hidden=this.day.hidden&&this.game.hidden&&this.real.hidden;}
 open(){this.el.hidden=false;this.draw();this.el.querySelector('button')?.focus();}
 close(focus=true){if(this.el.hidden)return false;this.el.hidden=true;this.drag=null;if(focus)this.focusWorld();return true;}
 scale(f){this.zoom=clamp(this.zoom*f,1,5);this.draw();}
 update(st){this.state=st;const next=regionFor(st.me.pos);if(!this.region||this.region.x!==next.x||this.region.z!==next.z){this.zoom=1;this.pan={x:0,z:0};this.details.textContent='Select an entry to locate it.';}this.region=next;this.clocks();if(!this.el.hidden)this.draw();}
 draw(){
 if(this.el.hidden||!this.state||!this.region)return;const c=this.canvas,rect=c.getBoundingClientRect();if(rect.width<40||rect.height<40)return;
 const w=Math.round(Math.min(rect.width,1400)),h=Math.round(Math.min(rect.height,1000));if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;
 const g=c.getContext('2d'),r=this.region,st=this.state,p=project(r,w,h,this.zoom,this.pan);this.p=p;this.title.textContent=r.name+' · Atlas';
 g.fillStyle='#182226';g.fillRect(0,0,w,h);
 if(!r.area)g.drawImage(reachTerrain(),p.X(-r.hw),p.Z(-r.hd),2*r.hw*p.k,2*r.hd*p.k);
 else{g.fillStyle='#3b4546';g.fillRect(p.X(r.x-r.hw),p.Z(r.z-r.hd),2*r.hw*p.k,2*r.hd*p.k);}
 g.strokeStyle='#b8ac8050';g.beginPath();for(let x=r.x-r.hw;x<=r.x+r.hw;x+=20){g.moveTo(p.X(x),p.Z(r.z-r.hd));g.lineTo(p.X(x),p.Z(r.z+r.hd));}for(let z=r.z-r.hd;z<=r.z+r.hd;z+=20){g.moveTo(p.X(r.x-r.hw),p.Z(z));g.lineTo(p.X(r.x+r.hw),p.Z(z));}g.stroke();
 if(!r.area){g.fillStyle='#b4a58a80';for(const o of COLLIDERS){if(Math.hypot(o.x,o.z)>WORLD.radius)continue;const a=Math.max(1,(o.r??Math.max(o.hw,o.hd))*p.k);g.fillRect(p.X(o.x)-a,p.Z(o.z)-a,a*2,a*2);}}
 const party=new Set(st.party.map(m=>m.id)),term=this.search.value.trim().toLowerCase(),entries=[];
 const mark=(name,x,z,category,color,shape='dot')=>{if(!this.layers.has(category)||!name.toLowerCase().includes(term))return;entries.push({name,x,z,category});const px=p.X(x),py=p.Z(z);g.fillStyle=color;g.beginPath();g.arc(px,py,shape==='place'?3:4,0,Math.PI*2);g.fill();if(shape==='place'||term){g.font='12px sans-serif';g.textAlign='center';g.strokeStyle='#10171b';g.lineWidth=3;g.strokeText(name,px,py-9);g.fillStyle='#e9e0cc';g.fillText(name,px,py-9);}};
 if(!r.area)for(const z of Object.values(ZONES))mark(z.name,z.x,z.z,'places','#e4cc93','place');
 for(const e of st.ents.values()){if(e.id===st.me.id||!sameTravelRegion(st.me.pos,e.pos))continue;const k=e.meta.k,category=k==='p'?(party.has(e.id)?'party':'players'):k==='e'&&!e.dead?'enemies':k==='o'?'objects':null;if(category)mark(e.meta.n||'Unknown',e.pos.x,e.pos.z,category,{party:'#73d6ee',players:'#8be0a8',enemies:'#e69a83',objects:'#e4cc93'}[category]);}
 g.save();g.translate(p.X(st.me.pos.x),p.Z(st.me.pos.z));g.rotate(Math.PI-st.yaw);g.fillStyle='#fff';g.beginPath();g.moveTo(0,-8);g.lineTo(5,6);g.lineTo(0,3);g.lineTo(-5,6);g.closePath();g.fill();g.restore();g.fillStyle='#f3e7c3';g.font='bold 14px sans-serif';g.textAlign='left';g.fillText('N ↑',12,21);
 const sig=JSON.stringify(entries.map(e=>[e.name,e.category]));this.entries=entries;if(sig!==this.sig){this.sig=sig;this.results.replaceChildren();for(let i=0;i<Math.min(entries.length,200);i++){const b=el('button',null,entries[i].name+' · '+entries[i].category);b.onclick=()=>{const e=this.entries[i];if(!e)return;this.pan={x:clamp(e.x-r.x,-r.hw,r.hw),z:clamp(e.z-r.z,-r.hd,r.hd)};this.zoom=Math.max(2,this.zoom);this.details.textContent=e.name+' · '+e.category;this.draw();};this.results.append(b);}}
 }
}
