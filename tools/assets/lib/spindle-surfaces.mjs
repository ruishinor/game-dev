// Original finishes. Four rows of four UV islands keep both material maps shared
// across moving links. UV coordinates in each island run from corner to corner.
import sharp from 'sharp';

const TILE = 160;
const SIDE = TILE * 4;
// sRGB coating, roughness, metalness. Paint and its exposed substrate have
// separate BRDF values even where they share a single geometric face.
const finishes = [
  [[194,182,161],.57,.15], [[213,200,177],.52,.12], [[181,169,149],.59,.16], [[201,193,177],.54,.14],
  [[159,111,52],.60,.21], [[166,122,58],.55,.20], [[90,91,88],.36,.72], [[112,103,84],.39,.66],
  [[52,55,52],.45,.65], [[42,43,41],.47,.73], [[37,37,35],.80,.04], [[57,57,53],.73,.04],
  [[141,145,140],.29,.77], [[83,72,50],.42,.62], [[30,33,32],.47,.53], [[91,118,115],.22,.58],
];
export const finish = { ivory:0, chalk:1, bone:2, repair:3, ochre:4, yellow:5, iron:6, bronze:7,
  gunmetal:8, graphite:9, rubber:10, belt:11, nickel:12, patina:13, recess:14, glass:15 };

export function island(tile,u,v) {
  const gutter=4;
  return [(tile%4*TILE+gutter+u*(TILE-2*gutter))/SIDE,
    (Math.floor(tile/4)*TILE+gutter+v*(TILE-2*gutter))/SIDE];
}

function grain(x,y,seed) {
  let h=Math.imul(x+seed*17,0x45d9f3b)^Math.imul(y+113,0x27d4eb2d);
  h=Math.imul(h^(h>>>16),0x45d9f3b);
  return ((h^(h>>>16))>>>0)/4294967296;
}
function field(x,y,seed,scale) {
  const ix=Math.floor(x/scale),iy=Math.floor(y/scale);
  let a=x/scale-ix,b=y/scale-iy;
  a=a*a*(3-2*a); b=b*b*(3-2*b);
  return (1-b)*((1-a)*grain(ix,iy,seed)+a*grain(ix+1,iy,seed))
    +b*((1-a)*grain(ix,iy+1,seed)+a*grain(ix+1,iy+1,seed));
}

// UV-space damage around individual fixings, exposed corners and handholds.
// The original chart positions vary per finish so adjacent panels have
// different histories. Distances are in texels at the authored resolution.
const chipSites=Array.from({length:6},(_,id)=>[
  [8+grain(1,2,id)*8, 22+grain(2,2,id)*19, 9,13],
  [123+grain(3,2,id)*17, 103+grain(4,2,id)*28, 12,6],
  [28+grain(5,2,id)*22, 105+grain(6,2,id)*18, 8,5],
  [60+grain(7,2,id)*48, 148+grain(8,2,id)*5, 14,6],
  [146, 53+grain(9,2,id)*43, 7,12],
  [83+grain(11,2,id)*21, 42+grain(12,2,id)*28, 4,6],
]);

export async function spindleMaterial(doc) {
  const colour=Buffer.alloc(SIDE*SIDE*3),orm=Buffer.alloc(colour.length);
  for (let y=0;y<SIDE;y++) for (let x=0;x<SIDE;x++) {
    const u=x%TILE,v=y%TILE,id=Math.floor(y/TILE)*4+Math.floor(x/TILE);
    let [rgb,rough,metal]=finishes[id];
    const broad=field(u,v,id,31),fine=grain(u,v,id),patch=field(u,v,id,7),speck=field(u,v,id,2);
    let shade=(broad-.5)*10+(fine-.5)*5;
    if (id<6) {
      // Abrasion follows the perimeter with small, connected islands of exposed
      // primer. Away from a seam most of the painted face remains quiet.
      const edge=Math.min(u-4,v-4,TILE-5-u,TILE-5-v);
      const chip=patch*.68+speck*.32+Math.max(0,1-Math.max(0,edge)/12)*.27;
      const wash=Math.max(0,1-Math.max(0,edge)/18);
      shade-=wash*(9+17*(1-broad))+Math.max(0,.42-broad)*31;
      if (chip>.865) {rgb=chip>.94?[86,80,66]:[129,112,86];metal=.6;rough=.64;}
      else if(chip>.831 && edge<14) {rgb=[164,148,120];rough=.70;}
      const scratch=Math.abs(v-(.16*u+22+id*17));
      if(scratch<.75 && u>30 && u<93 && patch>.43){shade-=25;metal=.38;}
      let abrasion=0;
      for(const [cx,cy,rx,ry] of chipSites[id]){
        const vx=(u-cx)/rx,vy=(v-cy)/ry;
        const radius=Math.sqrt(vx*vx+vy*vy);
        if(radius<1.8)abrasion=Math.max(abrasion,1.25-radius+.65*(patch-.5)+.46*(speck-.5));
      }
      // Layered primer, darkened substrate and occasional polished high spot.
      // The outer stain extends past the fractured enamel edge.
      if(abrasion>.20){
        shade-=Math.min(1,abrasion*2)*18;
        if(abrasion>.43 && speck+abrasion>.83) {
          rgb=abrasion>.72?[89,73,51]:[141,122,91];
          if(abrasion>.92 && patch>.56)rgb=[166,157,136];
          metal=.58;rough=.63+(1-speck)*.12;
        }
      }
      // A faded alignment witness sits close to the panel return. Another
      // finish has two separate dots, as on replacement caps in the study.
      const mark=(id===2 && u>106 && u<121 && (v>89 && v<92 || v>95 && v<97 && u<116))
        || (id===3 && (u-34)**2+(v-64)**2<5)
        || (id===3 && (u-41)**2+(v-64)**2<5);
      if(mark && speck>.30){rgb=[101,99,83];rough=.72;}
      if(id>=4){
        // Lifted ochre paint along the latch catch and the handled edge.
        const wipe=Math.max(0,1-Math.abs(v-.17*u-(id===4?71:27))/9);
        shade-=wipe*(9+14*broad);
        if(wipe>.5 && patch+speck*.45>1.01){rgb=[127,111,79];metal=.53;}
      }
    } else if (id===6 || id===12) {
      shade+=(grain(u>>1,v>>3,id)-.5)*9;
    }
    const i=(y*SIDE+x)*3;
    for(let c=0;c<3;c++)colour[i+c]=Math.max(0,Math.min(255,Math.round(rgb[c]+shade)));
    orm[i]=255; orm[i+1]=Math.round(255*Math.max(.05,Math.min(1,rough+(broad-.5)*.08)));
    orm[i+2]=Math.round(255*metal);
  }
  const texture=async (name,pixels)=>doc.createTexture(name).setMimeType('image/png')
    .setImage(await sharp(pixels,{raw:{width:SIDE,height:SIDE,channels:3}}).png().toBuffer());
  return doc.createMaterial('Factory enamel, machined hardware and composite')
    .setBaseColorTexture(await texture('Spindle finish atlas',colour))
    .setMetallicRoughnessTexture(await texture('Spindle roughness and metalness',orm))
    .setRoughnessFactor(1).setMetallicFactor(1);
}
