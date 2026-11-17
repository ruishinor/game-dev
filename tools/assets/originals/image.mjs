// Deterministic 8-bit RGB PNG encoder and neutral software-model preview.
// No WebGL, tone mapping, shadows, textures or transparency: NOT in-game evidence.
function concat(arr){let total=arr.reduce((a,b)=>a+b.length,0),out=new Uint8Array(total),p=0;for(const a of arr){out.set(a,p);p+=a.length;}return out;}
function be(n){return Uint8Array.of(n>>>24,(n>>>16)&255,(n>>>8)&255,n&255);}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,bytes){const name=Uint8Array.from(type,c=>c.charCodeAt(0)),data=concat([name,bytes]);return concat([be(bytes.length),data,be(crc32(data))]);}
function zlib(data){const blocks=[Uint8Array.of(0x78,0x01)];let a=1,b=0;for(let i=0;i<data.length;i+=65535){const len=Math.min(65535,data.length-i),last=i+len===data.length?1:0;blocks.push(Uint8Array.of(last,len&255,len>>>8,(~len)&255,((~len)>>>8)&255),data.slice(i,i+len));}for(const x of data){a=(a+x)%65521;b=(b+a)%65521;}blocks.push(be((b<<16)|a));return concat(blocks);}
function png(w,h,pixels){if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h*3!==pixels.length)throw Error('invalid RGB image');const raw=new Uint8Array(h*(w*3+1));for(let y=0;y<h;y++)raw.set(pixels.subarray(y*w*3,(y+1)*w*3),y*(w*3+1)+1);return concat([Uint8Array.of(137,80,78,71,13,10,26,10),chunk('IHDR',concat([be(w),be(h),Uint8Array.of(8,2,0,0,0)])),chunk('IDAT',zlib(raw)),chunk('IEND',new Uint8Array())]);}
function base64(bytes){const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='';for(let i=0;i<bytes.length;i+=3){const n=(bytes[i]<<16)|((bytes[i+1]||0)<<8)|(bytes[i+2]||0);out+=chars[n>>>18]+chars[(n>>>12)&63]+(i+1<bytes.length?chars[(n>>>6)&63]:'=')+(i+2<bytes.length?chars[n&63]:'=');}return out;}
function preview(compiled,materials,{width=260,height=260,yaw=0.75,pitch=.28}={}){
 const {groups,min,max}=compiled;const center=min.map((x,i)=>(x+max[i])/2);
 const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);const sub=(a,b)=>a.map((x,i)=>x-b[i]);
 const eye=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)],right=[Math.cos(yaw),0,-Math.sin(yaw)],up=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch)];
 const all=[];for(const g of groups.values())for(let i=0;i<g.p.length;i+=3){const p=sub(g.p.slice(i,i+3),center);all.push([dot(p,right),dot(p,up)]);}
 let sx=0,sy=0;for(const p of all){sx=Math.max(sx,Math.abs(p[0]));sy=Math.max(sy,Math.abs(p[1]));}const scale=Math.min(width*.43/Math.max(sx,.001),height*.43/Math.max(sy,.001));
 const proj=p=>{p=sub(p,center);return [width/2+dot(p,right)*scale,height/2-dot(p,up)*scale,dot(p,eye)];};
 const pixels=new Uint8Array(width*height*3),z=new Float32Array(width*height);z.fill(-Infinity);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const t=Math.max(0,1-Math.hypot((x-width/2)/width,(y-height/2)/height)*1.2);const i=(y*width+x)*3;pixels.set([Math.round(20+t*17),Math.round(27+t*18),Math.round(32+t*19)],i);}
 const srgb=x=>Math.round(Math.max(0,Math.min(1,x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055))*255);
 const edge=(a,b,x,y)=>(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);
 for(const [mat,g] of groups){const m=materials[mat],base=m.pbrMetallicRoughness.baseColorFactor;for(let i=0;i<g.p.length;i+=9){
  const n=g.n.slice(i,i+3);if(dot(n,eye)<=0)continue;
  const a=proj(g.p.slice(i,i+3)),b=proj(g.p.slice(i+3,i+6)),c=proj(g.p.slice(i+6,i+9)),area=edge(a,b,c[0],c[1]);if(Math.abs(area)<1e-7)continue;
  const light=.35+Math.max(0,dot(n,[-.35,.83,.43]))*.75+Math.max(0,dot(n,[.75,.22,-.62]))*.25;
  const col=base.slice(0,3).map((v,j)=>srgb(v*light+(m.emissiveFactor?.[j]||0)*.45));
  const loX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),hiX=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0]))),loY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),hiY=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
  for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){const u=edge(b,c,x+.5,y+.5)/area,v=edge(c,a,x+.5,y+.5)/area,w=1-u-v;if(u<0||v<0||w<0)continue;const depth=u*a[2]+v*b[2]+w*c[2],j=y*width+x;if(depth>z[j]){z[j]=depth;pixels.set(col,j*3);}}
 }}
 return png(width,height,pixels);
}
export {png,base64,preview};
