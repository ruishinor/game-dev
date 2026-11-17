import { png } from './image.mjs';
// Original geometric visual vocabulary. All symbols share 64x64 viewBox.
// No fonts, external URLs, filters, raster dependencies or meaning encoded solely by colour.
const L=(...points)=>({type:'line',points});
const C=(x,y,r)=>({type:'circle',x,y,r});
const P=(...points)=>L(...points,points[0]);
const A=(x,y,r,start,end)=>L(...Array.from({length:17},(_,i)=>{const a=(start+(end-start)*i/16)*Math.PI/180;return [Math.round((x+r*Math.cos(a))*100)/100,Math.round((y+r*Math.sin(a))*100)/100];}));
const mark=()=>L([12,52],[52,12]);
export const glyphs={
 aegis:{group:'ability',label:'Aegis',shapes:[P([32,8],[51,16],[51,35],[43,47],[32,56],[21,47],[13,35],[13,16]),L([20,22],[32,16],[44,22]),L([32,23],[32,46]),L([23,32],[41,32])]},
 hinge:{group:'transform',label:'Hinge',shapes:[A(29,32,20,-90,90),L([29,12],[29,52]),P([17,32],[35,25],[48,32],[35,39]),C(29,32,3)]},
 span:{group:'transform',label:'Span',shapes:[C(15,37,6),C(49,37,6),L([21,37],[43,37]),L([15,31],[15,25],[23,17],[41,17],[49,25],[49,31]),L([32,17],[32,27])]},
 relay:{group:'transform',label:'Relay',shapes:[C(12,42,4),C(32,12,4),C(52,42,4),L([14,38],[30,16]),L([34,16],[50,38]),L([16,42],[48,42]),L([25,34],[32,29],[39,34])]},
 persist:{group:'transform',label:'Persist',shapes:[A(32,32,22,-80,225),L([10,31],[10,22],[19,22]),L([32,19],[32,32],[42,38]),C(32,32,3)]},
 divide:{group:'transform',label:'Divide',shapes:[C(32,11,4),C(12,49,4),C(52,49,4),L([32,15],[32,30],[15,45]),L([32,30],[49,45]),P([26,30],[32,24],[38,30],[32,36])]},
 lattice:{group:'transform',label:'Lattice',shapes:[P([32,7],[54,19],[54,45],[32,57],[10,45],[10,19]),L([10,19],[32,31],[54,19]),L([32,31],[32,57]),L([21,13],[43,25],[43,51]),L([43,13],[21,25],[21,51])]},
 stabilize:{group:'environment',label:'Stabilize',shapes:[P([32,8],[55,50],[9,50]),L([32,21],[32,43]),L([20,43],[44,43]),P([27,30],[37,30],[32,22])]},
 reroute:{group:'environment',label:'Reroute',shapes:[C(32,10,4),C(32,54,4),L([32,14],[32,21],[48,32],[32,43],[32,50]),L([32,21],[16,32],[22,32]),L([16,32],[19,26]),L([16,32],[20,38])]},
 phase:{group:'environment',label:'Phase',shapes:[A(25,32,18,65,298),A(39,32,18,-115,118),L([25,32],[39,32]),L([25,28],[25,36]),L([39,28],[39,36])]},
 resonate:{group:'environment',label:'Resonate',shapes:[L([32,54],[32,10]),L([32,26],[19,18],[12,18]),L([32,35],[49,24],[54,24]),L([32,44],[19,37],[10,37]),C(32,10,3),C(12,18,3),C(54,24,3),C(10,37,3)]},
 bond:{group:'link',label:'Bond',shapes:[P([7,32],[19,19],[31,32],[19,45]),P([33,32],[45,19],[57,32],[45,45]),L([24,32],[40,32]),L([19,25],[19,39]),L([45,25],[45,39])]},
 conduit:{group:'link',label:'Conduit',shapes:[C(10,32,4),C(54,32,4),L([14,27],[26,27],[30,22],[34,42],[38,37],[50,37]),L([14,37],[23,37]),L([41,27],[50,27])]},
 anchor:{group:'link',label:'Anchor',shapes:[C(32,15,7),L([32,22],[32,48]),L([18,32],[46,32]),A(32,34,19,0,180),L([13,34],[13,27]),L([51,34],[51,27]),L([23,54],[41,54])]},
 network:{group:'link',label:'Network',shapes:[P([32,8],[56,32],[32,56],[8,32]),L([32,8],[32,56]),L([8,32],[56,32]),C(32,32,5),C(32,8,3),C(56,32,3),C(32,56,3),C(8,32,3)]},
 unstrike:{group:'counterglyph',label:'The Unstrike',shapes:[L([32,10],[40,20],[32,31],[40,38],[25,54],[29,36],[21,29],[32,10]),mark()]},
 unmended:{group:'counterglyph',label:'The Unmended',shapes:[P([26,10],[38,10],[38,26],[54,26],[54,38],[38,38],[38,54],[26,54],[26,38],[10,38],[10,26],[26,26]),mark()]},
 unwall:{group:'counterglyph',label:'The Unwall',shapes:[L([11,48],[11,21],[25,14],[25,41]),L([29,40],[29,21],[43,14],[43,41]),L([47,40],[47,21],[54,17],[54,36]),mark()]},
 unseen:{group:'counterglyph',label:'The Unseen',shapes:[P([8,32],[20,21],[32,17],[44,21],[56,32],[44,43],[32,47],[20,43]),C(32,32,9),mark()]}
};
const attr='fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="bevel"';
function shapes(g){return g.shapes.map(s=>s.type==='circle'?'<circle cx="'+s.x+'" cy="'+s.y+'" r="'+s.r+'"/>':'<polyline points="'+s.points.map(p=>p.join(',')).join(' ')+'"/>').join('');}
export function svg(id){const g=glyphs[id];if(!g||!Object.hasOwn(glyphs,id))throw Error('unknown glyph');return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="'+g.label+'"><g '+attr+'>'+shapes(g)+'</g></svg>\n';}
export function sprite(){return '<svg xmlns="http://www.w3.org/2000/svg"><defs>'+Object.entries(glyphs).map(([id,g])=>'<symbol id="glyph-'+id+'" viewBox="0 0 64 64"><title>'+g.label+'</title><g '+attr+'>'+shapes(g)+'</g></symbol>').join('')+'</defs></svg>\n';}
export function preview(){
 const ids=Object.keys(glyphs),cell=80,w=cell*5,h=cell*Math.ceil(ids.length/5),rgb=new Uint8Array(w*h*3);rgb.fill(27);
 const col={ability:[148,213,223],transform:[158,207,214],environment:[159,200,166],link:[186,166,214],counterglyph:[217,156,128]};
 function dot(x,y,c){for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){let px=Math.round(x)+i,py=Math.round(y)+j;if(px>=0&&px<w&&py>=0&&py<h)rgb.set(c,(py*w+px)*3);}}
 for(let i=0;i<ids.length;i++){const g=glyphs[ids[i]],ox=i%5*cell+8,oy=Math.floor(i/5)*cell+8,c=col[g.group];
  for(const s of g.shapes){let p=s.type==='circle'?Array.from({length:49},(_,j)=>[s.x+s.r*Math.cos(Math.PI*2*j/48),s.y+s.r*Math.sin(Math.PI*2*j/48)]):s.points;
   for(let j=1;j<p.length;j++){const a=p[j-1],b=p[j],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2));for(let k=0;k<=n;k++)dot(ox+a[0]+(b[0]-a[0])*k/n,oy+a[1]+(b[1]-a[1])*k/n,c);}
  }
 }
 return png(w,h,rgb);
}
