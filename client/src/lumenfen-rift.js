// Rootglass thresholds are an independent living architecture family. The
// approved Phase Scar exterior model and shader are never modified here.
// These share the server's existing radius/traversal contract.
export const ROOTGLASS_LIMITS=Object.freeze({layers:3,lights:1,leafMotes:22,roots:21});

export function makeLumenfenRift(T,kind='lumenfen_entry'){
  const group=new T.Group();group.name='lumenfen:rootglass:'+kind;
  const returning=kind==='lumenfen_return',crossing=kind==='lumenfen_spring'||kind==='lumenfen_crown';
  const mats=[],geometries=[];
  const take=(m)=>{mats.push(m);return m;};
  const bark=take(new T.MeshStandardMaterial({color:0x152724,roughness:.92,metalness:.06}));
  const heartwood=take(new T.MeshStandardMaterial({color:0x2e4d41,roughness:.74,metalness:.10}));
  const stone=take(new T.MeshStandardMaterial({color:0x343c3c,roughness:.86,metalness:.14}));
  const glass=take(new T.MeshPhysicalMaterial({
    color:crossing?0x85cdb9:0x7ed5c5,roughness:.18,metalness:.1,
    transparent:true,opacity:.88,clearcoat:.6,clearcoatRoughness:.13,
    emissive:0x1b6c66,emissiveIntensity:.38,
  }));
  const add=(geo,material,name,x=0,y=0,z=0)=>{
    const m=new T.Mesh(geo,material);m.name=name;m.position.set(x,y,z);
    m.castShadow=material!==glass;m.receiveShadow=true;
    group.add(m);geometries.push(geo);return m;
  };
  // Multi-layer concave/convex rootglass with a genuine bent 3D surface.
  // No single flat billboard is responsible for the portal's apparent depth.
  function lensGeometry(layer){
    const geo=new T.PlaneGeometry(2.08-(layer*.13),4.88-(layer*.17),28,48);
    const a=geo.attributes.position;
    for(let i=0;i<a.count;i++){
      const x=a.getX(i),y=a.getY(i);
      const nx=x/1.04,ny=y/2.44;
      const envelope=Math.max(0,1-nx*nx-ny*ny);
      const bent=(layer===1?-.14:.13)*Math.pow(envelope,.75)
        +Math.sin(y*1.5+x*2.4+layer)*.035*envelope;
      a.setZ(i,bent);
    }
    a.needsUpdate=true;geo.computeVertexNormals();
    return geo;
  }
  // Refracted bands, layered occlusion and a thin bright edge. Motion is
  // optional and never changes the underlying interaction or rift geometry.
  const fragment=`
    uniform float uTime,uHue,uLayer,uMotion;
    varying vec2 vUv;
    float wave(vec2 p){
      float a=sin(p.y*19.+sin(p.x*9.+uTime*.32)*2.-uTime*.45);
      float b=sin(p.x*16.-p.y*12.+uTime*.28+uLayer*1.7);
      return .5+.26*a+.24*b;
    }
    void main(){
      vec2 p=(vUv-.5)*vec2(1.,1.58);
      float radius=length(p);
      float rim=1.-smoothstep(.73,.97,radius);
      float streak=wave(vUv+vec2(uLayer*.07,uLayer*.05));
      float grain=sin(vUv.y*71.+sin(vUv.x*23.)*2.+uTime*.23);
      vec3 dark=vec3(.017,.08,.10);
      vec3 jade=mix(vec3(.09,.35,.32),vec3(.29,.64,.59),clamp(uHue,0.,1.));
      vec3 light=mix(jade,vec3(.54,.91,.83),.33);
      vec3 col=mix(dark,light,clamp(.33+.43*streak+.09*grain,0.,1.));
      col+=vec3(.12,.36,.35)*pow(max(0.,1.-radius),3.)*.36;
      float alpha=(.76-uLayer*.20)*rim*(.85+.15*streak);
      gl_FragColor=vec4(col,alpha);
    }`;
  const layers=[];
  for(let i=0;i<ROOTGLASS_LIMITS.layers;i++){
    const material=take(new T.ShaderMaterial({
      uniforms:{uTime:{value:0},uHue:{value:returning?.5:crossing?.28:0},
        uLayer:{value:i},uMotion:{value:1}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:fragment,transparent:true,side:T.DoubleSide,depthWrite:false,
    }));
    const pane=add(lensGeometry(i),material,i===0?'lumenfen:membrane':'lumenfen:membrane-depth:'+i,
      .035*i,2.58,i===1?-.21:i===2?-.43:.09);
    pane.renderOrder=6+i;layers.push(pane);
  }
  // Organic arch: load-bearing root strands curve asymmetrically around the
  // membrane. Denser radial sampling removes the coarse five-sided silhouette.
  const addRoot=(points,radius,material,name)=>{
    const path=new T.CatmullRomCurve3(points.map(([x,y,z])=>new T.Vector3(x,y,z)));
    return add(new T.TubeGeometry(path,44,radius,10,false),material,name);
  };
  for(const side of [-1,1]){
    for(let strand=0;strand<3;strand++){
      const d=strand*.09,offset=strand*.13;
      addRoot([
        [side*(1.54+offset),-.03,-.25],
        [side*(1.31+offset),.74,-.18-d],
        [side*(1.12+offset),2.0,.05-d],
        [side*(1.18+offset),3.5,-.12-d],
        [side*(.84+offset),5.1,-.16-d],
        [side*(.36+offset),5.52,-.23-d],
      ],strand===0?.23:.08,strand===0?bark:heartwood,'lumenfen:structural-root');
    }
    for(let i=0;i<6;i++){
      const h=.55+i*.72,seed=i+side*3;
      addRoot([
        [side*(1.3+.07*(i%2)),h-.43,-.12],
        [side*(1.46+.05*i),h-.08,-.05+.09*Math.sin(seed)],
        [side*(1.63+.07*(i%3)),h+.19,-.18],
        [side*(1.66+.05*i),h+.49,-.25],
      ],.042+(i%3)*.013,heartwood,'lumenfen:branch-root');
    }
    // Substantial root and stone ground transition, not an unconnected portal
    // rectangle sitting on the terrain.
    for(let i=0;i<5;i++){
      const angle=(i+.2)*.66,radius=1.07+.19*(i%2);
      const rock=add(new T.DodecahedronGeometry(.32+(i%2)*.1,1),
        i%2?stone:bark,'lumenfen:rootglass-footing',
        side*(radius+Math.sin(angle)*.15),.10+i*.018,Math.cos(angle)*.57);
      rock.scale.set(1.18,.55,1.55);
    }
  }
  addRoot([[-.46,5.48,-.24],[0,5.70,-.19],[.53,5.43,-.24]],.17,bark,'lumenfen:crown-bridge');
  // Translucent mineral veins track the constructed frame and read from
  // outside the activation footprint; no telegraph or collision mutation.
  for(const side of [-1,1]){
    addRoot([[side*.92,.75,.13],[side*.83,2.1,.17],[side*.91,3.7,.12],
      [side*.66,5.15,.01]],.043,glass,'lumenfen:rootglass-conductor');
    for(let i=0;i<4;i++) {
      const chip=add(new T.OctahedronGeometry(.10+i*.017,1),glass,'lumenfen:embedded-glass',side*1.19,1.0+i*.98,.11);
      chip.rotation.z=side*.27;
    }
  }
  const leaf=take(new T.MeshBasicMaterial({color:crossing?0xa7e5cd:0x86d6ac,
    transparent:true,opacity:.7,depthWrite:false}));
  const motes=[];
  for(let i=0;i<ROOTGLASS_LIMITS.leafMotes;i++){
    const a=i*2.39996,r=.65+(i%7)*.11;
    const o=add(new T.IcosahedronGeometry(.027+(i%4)*.01,1),leaf,
      'lumenfen:leaf-mote',Math.cos(a)*r,.2+(i*.317)%4.95,Math.sin(a)*.25);
    motes.push({o,a,r,y:o.position.y});
  }
  const light=new T.PointLight(returning?0x91cba8:0x76b9b4,5.8,11,2);
  light.name='lumenfen:rootglass-local-light';light.position.set(0,2.5,.55);
  light.castShadow=false;group.add(light);
  let elapsed=0;
  return {group,height:5.8,radius:2.45,hover:0,
    update(dt,st={}){
      const reduce=!!st.reducedMotion;
      if(!reduce)elapsed+=Math.max(0,Math.min(dt||0,.1));
      for(let i=0;i<layers.length;i++)layers[i].material.uniforms.uTime.value=reduce?0:elapsed;
      for(const m of motes){
        m.o.position.y=m.y+(reduce?0:.07*Math.sin(elapsed*.8+m.a));
        m.o.position.x=Math.cos(m.a+(reduce?0:elapsed*.09))*m.r;
      }
    },
    dispose(){
      group.removeFromParent();
      for(const g of new Set(geometries))g.dispose();
      for(const m of new Set(mats))m.dispose();
    },
  };
}
