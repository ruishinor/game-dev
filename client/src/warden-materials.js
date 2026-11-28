// Warden occupational material adaptation. Retains authored GLB UVs, normal,
// AO and ORM maps; selectively tones *neutral dark plates* to ebony without
// washing out ivory ceramic or warm bronze. No runtime texture rebuild.
function deepenEbony(mat,tag){
  const old=mat.onBeforeCompile;
  mat.onBeforeCompile=(shader,renderer)=>{
    old?.(shader,renderer);
    // Classify painted plate texels after their actual base-colour map resolves.
    // Bronze has appreciable warm chroma; ceramic is bright. Neither is graded.
    const anchor='#include <map_fragment>';
    if(!shader.fragmentShader.includes(anchor))return;
    shader.fragmentShader=shader.fragmentShader.replace(anchor,anchor+`
      float wardenHighest=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
      float wardenLowest=min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b));
      float wardenChroma=(wardenHighest-wardenLowest)/(wardenHighest+0.05);
      float wardenNeutral=1.0-smoothstep(0.10,0.31,wardenChroma);
      float wardenDark=1.0-smoothstep(0.28,0.62,wardenHighest);
      float wardenEbony=wardenNeutral*wardenDark;
      diffuseColor.rgb=mix(diffuseColor.rgb,
        diffuseColor.rgb*vec3(0.47,0.41,0.36),wardenEbony*0.86);
    `);
  };
  mat.customProgramCacheKey=()=>`warden-ebony-v1-${tag}`;
  mat.needsUpdate=true;
  return mat;
}
export function applyWardenMaterials(inst,optic){
  let body=null,ring=null,armour=null,extras=0;
  inst.traverse(node=>{
    if(!node.isMesh)return;
    const name=node.name;
    if(!['body','ring_vertical','security','equip_pouches','equip_radio','equip_baton','stave'].includes(name))return;
    const mat=node.material.clone();
    mat.isShared=false;
    if(name==='body'){
      // Preserve ceramic albedo and mapped surface normals/cavities.
      mat.roughness=1;
      mat.metalness=1;
      mat.emissive.setRGB(...optic);
      body=mat;
    }else if(name==='ring_vertical'){
      // Independent material: head optics no longer overwrite body emission.
      mat.roughness=.88;
      mat.metalness=1;
      mat.emissive.setRGB(...optic);
      ring=mat;
    }else{
      mat.roughness=.96;
      mat.metalness=1;
      if(name==='security')armour=mat;
      else extras++;
    }
    deepenEbony(mat,name);
    node.material=mat;
  });
  return {body:!!body,ring:!!ring,armour:!!armour,extras};
}
