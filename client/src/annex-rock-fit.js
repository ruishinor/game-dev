// Fit existing licensed nature-kit rock pieces inside each authoritative
// formation radius. Source bounds come from the built asset manifest.
// Pure presentation: no change to collision, encounter or reward state.
export function planAnnexRocks(p,getMeta){
  if(!Number.isFinite(p.r)||p.r<=0||!Number.isFinite(p.h)||p.h<=0||!Number.isSafeInteger(p.seed)||p.seed<0)
    throw new Error('Invalid Annex formation dimensions');
  const angle=p.seed*2.399963229728653;
  const layout=[
    [0,.71,.64,angle],
    [.51,.36,.35,angle+1.1],
    [.56,.30,.31,angle+3.7],
  ];
  return layout.map(([offset,radius,height,ry],i)=>{
    const name='Rock_Medium_'+((p.seed+i)%3+1);
    const meta=getMeta(name);
    const min=meta?.min,max=meta?.max;
    if(!Array.isArray(min)||!Array.isArray(max)||min.length!==3||max.length!==3||
      ![...min,...max].every(Number.isFinite)||max.some((v,j)=>v<=min[j]))
      throw new Error('Missing or invalid donor bounds: '+name);
    const halfDiagonal=Math.hypot((max[0]-min[0])/2,(max[2]-min[2])/2);
    const horizontal=p.r*radius/halfDiagonal;
    const vertical=p.h*height/(max[1]-min[1]);
    return {name,dx:Math.cos(ry)*p.r*offset,dz:Math.sin(ry)*p.r*offset,ry,
      s:[horizontal,vertical,horizontal],origin:[-(min[0]+max[0])/2,-min[1],-(min[2]+max[2])/2]};
  });
}
