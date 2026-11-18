// Cosmetic field pouch geometry in local coordinates, instantiated per wearer.
import { mergeGeometries } from './gear-kit.js';
const STYLES=Object.freeze({
  conductor:{w:.09,h:.12,d:.050,color:0x2a4a44,trim:0x152e2b,closure:0x638c7d},
  keeper:{w:.09,h:.12,d:.055,color:0xa28b61,trim:0x574b39,closure:0x7c8174},
  surveyor:{w:.10,h:.15,d:.060,color:0x9b713d,trim:0x433e30,closure:0xb2a17b}
});
export function buildUtilityPouch(T,style){
 const s=STYLES[style];if(!s)throw Error('unknown cosmetic pouch style');
 const root=new T.Group();root.name='utility-pouch:'+style;
 const materials=[new T.MeshStandardMaterial({color:s.color,roughness:.88}),new T.MeshStandardMaterial({color:s.trim,roughness:.95}),new T.MeshStandardMaterial({color:s.closure,roughness:.57,metalness:.48})];
 const sets=materials.map(()=>[]),{w,h,d}=s;
 const box=(m,ww,hh,dd,x=0,y=0,z=0)=>{const g=new T.BoxGeometry(w*ww,h*hh,d*dd);g.translate(w*x,h*y,d*z);sets[m].push(g)};
 // Gusset, overlapped lid, binding and retention loop, inside prior size.
 box(0,.86,.78,.76,0,-.065,-.035);
 box(1,.90,.09,.80,0,-.43,-.035);
 for(const side of [-1,1])box(1,.075,.73,.80,side*.435,-.065,-.035);
 box(0,.96,.23,.90,0,.365,-.025);
 box(1,.12,.45,.065,0,-.01,.401);
 box(2,.19,.15,.065,0,-.075,.467);
 box(1,.64,.10,.07,0,.38,-.465);
 for(let i=0;i<3;i++)box(2,.09,.018,.038,-.28+i*.28,.30,.44);
 for(let i=0;i<3;i++){const g=mergeGeometries(T,sets[i]);for(const p of sets[i])p.dispose();const m=new T.Mesh(g,materials[i]);m.castShadow=true;root.add(m)}
 return root;
}
