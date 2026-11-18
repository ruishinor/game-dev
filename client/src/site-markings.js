// Authored public site labels; decorative, not gameplay prompts or hidden intel.
const GLYPHS={
 A:[14,17,17,31,17,17,17],B:[30,17,17,30,17,17,30],C:[15,16,16,16,16,16,15],D:[30,17,17,17,17,17,30],E:[31,16,16,30,16,16,31],F:[31,16,16,30,16,16,16],G:[15,16,16,19,17,17,15],H:[17,17,17,31,17,17,17],I:[31,4,4,4,4,4,31],K:[17,18,20,24,20,18,17],L:[16,16,16,16,16,16,31],N:[17,25,25,21,19,19,17],P:[30,17,17,30,16,16,16],R:[30,17,17,30,20,18,17],S:[15,16,16,14,1,1,30],T:[31,4,4,4,4,4,4],U:[17,17,17,17,17,17,14],W:[17,17,17,21,21,27,17],Y:[17,17,10,4,4,4,4],'-':[0,0,0,31,0,0,0],' ':[0,0,0,0,0,0,0]
};
export const SITE_MARKINGS=Object.freeze([
 Object.freeze({id:'research',label:'A - RESEARCH',x:38,z:-37.64,w:2.24,h:.39}),
 Object.freeze({id:'engineering',label:'B - ENGINEERING',x:49,z:-37.64,w:2.24,h:.39})
]);
export function rasterMarking(label,{width=512,height=128,seed=1}={}){
 if(!label||[...label].some(c=>!GLYPHS[c]))throw Error('unsupported public stencil');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<128||height<64||width>1024||height>256)throw Error('invalid stencil dimensions');
 const data=new Uint8Array(width*height*4),textWidth=6*label.length-1;
 const px=Math.min(Math.floor((width-76)/textWidth),Math.floor((height-38)/7));
 if(px<1)throw Error('stencil too long');
 const ox=Math.round((width-textWidth*px)/2),oy=Math.round((height-7*px)/2);
 const put=(x,y,c)=>{if(x<0||x>=width||y<0||y>=height)return;let i=((height-1-y)*width+x)*4;data.set(c,i)};
 const rand=(x,y)=>{let n=Math.imul(x+seed,1973)^Math.imul(y+1,9277);n=Math.imul(n^(n>>>15),0x45d9f3b);return ((n^(n>>>16))>>>0)%1000};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const noise=rand(x,y),edge=x<9||x>=width-9||y<9||y>=height-9;
   let c=edge?[105,96,67,255]:[43+noise%9,47+noise%9,43+noise%9,255];
   if(x<30&&x>13||x>width-31&&x<width-14){if(((x+y)>>3)%2===0)c=[154,125,64,255]}
   put(x,y,c);
 }
 for(let k=0;k<label.length;k++)for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(GLYPHS[label[k]][row]&(1<<(4-col))){
   for(let yy=0;yy<px;yy++)for(let xx=0;xx<px;xx++){const x=ox+(6*k+col)*px+xx,y=oy+row*px+yy;if(rand(x,y)<18)continue;put(x,y,[203,194,153,255]);}
 }
 return {data,width,height};
}
export function buildSiteMarkings(T,deckY){
 const root=new T.Group();root.name='brineworks-site-markings';
 for(const s of SITE_MARKINGS){
   const img=rasterMarking(s.label),tex=new T.DataTexture(img.data,img.width,img.height,T.RGBAFormat);
   tex.colorSpace=T.SRGBColorSpace;tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
   const mat=new T.MeshStandardMaterial({map:tex,roughness:.94,metalness:.02});
   const m=new T.Mesh(new T.PlaneGeometry(s.w,s.h),mat);m.name='brineworks:stencil:'+s.id;m.rotation.x=-Math.PI/2;
   m.position.set(s.x,deckY+.057,s.z);m.receiveShadow=true;root.add(m);
 }
 let disposed=false;
 return {group:root,dispose(){if(disposed)return;disposed=true;for(const m of root.children){m.geometry.dispose();m.material.map.dispose();m.material.dispose();}}};
}
