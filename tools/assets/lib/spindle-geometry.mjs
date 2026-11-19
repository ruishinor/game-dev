import { CylinderGeometry, Vector3, Quaternion, CatmullRomCurve3, TubeGeometry, ShapeUtils, Vector2 } from 'three';
import { island } from './spindle-surfaces.mjs';

const axisY=new Vector3(0,1,0);
const vec=p=>new Vector3(...p);
const tau=Math.PI*2;
export const radians=degrees=>degrees*Math.PI/180;
export const polar=(x,r,a)=>[x,r*Math.cos(a),r*Math.sin(a)];

// Each rigid link is batched into a single primitive. Its parent stays an
// unscaled pivot even when the production compressor quantizes its geometry.
export class RigidMesh {
  constructor(doc,material,name,parent,offset=[0,0,0]) {
    this.doc=doc; this.material=material; this.name=name;
    this.pivot=doc.createNode(name).setTranslation(offset);
    parent.addChild(this.pivot);
    this.positions=[]; this.normals=[]; this.uv=[]; this.indices=[];
  }
  vertex(p,n,tile,u,v) {
    this.positions.push(...p); this.normals.push(...n); this.uv.push(...island(tile,u,v));
    return this.positions.length/3-1;
  }
  geometry(g,tile) {
    const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
    const start=this.positions.length/3;
    for(let i=0;i<p.count;i++)this.vertex([p.getX(i),p.getY(i),p.getZ(i)],
      [n.getX(i),n.getY(i),n.getZ(i)],tile,uv.getX(i),uv.getY(i));
    for(const i of g.index.array)this.indices.push(start+i);
    g.dispose();
  }
  rod(a,b,rA,rB,tile,sides=10) {
    const direction=vec(b).sub(vec(a));
    const g=new CylinderGeometry(rB,rA,direction.length(),sides,1);
    const q=new Quaternion().setFromUnitVectors(axisY,direction.normalize());
    g.applyQuaternion(q); g.translate(...a.map((v,i)=>(v+b[i])/2));
    this.geometry(g,tile);
  }
  hose(points,radius,tile,steps=13) {
    const g=new TubeGeometry(new CatmullRomCurve3(points.map(vec)),steps,radius,6);
    this.geometry(g,tile);
  }
  // Lathed cross section. Supply the contact surface first, running from -X
  // to +X, then return along the inner radius. End insets trim cast-panel
  // corners, preserving a curved outer crown and an unequal inner opening.
  arc(profile,start,end,tiles,{origin=[0,0,0],insets=[],steps,uvRows,shape}={}) {
    const count=steps??Math.max(3,Math.ceil((end-start)/radians(7.5)));
    const point=(row,t)=>{
      const [x,r]=shape?shape(profile[row],row,t):profile[row],trim=insets[row]||[0,0];
      const a=start+trim[0]+t*(end-start-trim[0]-trim[1]);
      return [origin[0]+x,origin[1]+r*Math.cos(a),origin[2]+r*Math.sin(a)];
    };
    for(let j=0;j<profile.length;j++) {
      const k=(j+1)%profile.length,dx=profile[k][0]-profile[j][0],dr=profile[k][1]-profile[j][1];
      const base=this.positions.length/3,tile=Array.isArray(tiles)?tiles[j]:tiles;
      for(let i=0;i<=count;i++)for(const [row,v] of [[j,0],[k,1]]) {
        const p=point(row,i/count),a=Math.atan2(p[2]-origin[2],p[1]-origin[1]);
        const normal=new Vector3(-dr,dx*Math.cos(a),dx*Math.sin(a)).normalize().toArray();
        this.vertex(p,normal,tile,i/count,uvRows?(uvRows[row]??v):.18+v*.64);
      }
      for(let i=0;i<count;i++){const h=base+2*i;this.indices.push(h,h+2,h+3,h,h+3,h+1);}
    }
    if(end-start<tau-1e-5) {
      // The end contour may be concave (split lips, return flanges).
      const faces=ShapeUtils.triangulateShape(profile.map(p=>new Vector2(...p)),[]);
      for(const t of [0,1])for(const face of faces) {
        const vertices=face.map(i=>point(i,t)),a=t?end:start;
        this.face(vertices,Array.isArray(tiles)?tiles[0]:tiles,
          [0,(t?-1:1)*Math.sin(a),(t?1:-1)*Math.cos(a)]);
      }
    }
  }
  face(points,tile,out) {
    const [a,b,c]=points.map(vec);
    const n=b.sub(a).cross(c.sub(a)).normalize();
    if(n.lengthSq()<.9)return;
    if(n.dot(vec(out))<0){points=[...points].reverse();n.negate();}
    const start=this.positions.length/3;
    for(let i=0;i<points.length;i++)this.vertex(points[i],n.toArray(),tile,...[[0,0],[1,0],[1,1],[0,1]][i]);
    for(let i=2;i<points.length;i++)this.indices.push(start,start+i-1,start+i);
  }
  // Chamfered irregular plate extruded in the axle direction. Outline uses
  // machine-space [Y,Z]. Flat caps keep stamping visible on both sides.
  plate(x,depth,outline,tile,edge=tile,bevel=.004) {
    const o=outline.map(p=>new Vector2(...p)),c=o.reduce((s,v)=>s.add(v),new Vector2()).divideScalar(o.length);
    const faces=ShapeUtils.triangulateShape(o,[]);
    const ys=o.map(p=>p.x),zs=o.map(p=>p.y),y0=Math.min(...ys),z0=Math.min(...zs);
    const dy=Math.max(...ys)-y0,dz=Math.max(...zs)-z0;
    const layers=[[-depth/2,bevel],[-depth/2+bevel,0],[depth/2-bevel,0],[depth/2,bevel]].map(([ox,b])=>
      o.map(p=>{const v=c.clone().sub(p).normalize().multiplyScalar(b);return [x+ox,p.x+v.x,p.y+v.y];}));
    for(const side of [0,3]){
      const points=layers[side],sign=side?1:-1,base=this.positions.length/3;
      for(const p of points)this.vertex(p,[sign,0,0],tile,(p[2]-z0)/dz,(p[1]-y0)/dy);
      for(const f of faces){const ids=sign>0?f:[...f].reverse();for(const i of ids)this.indices.push(base+i);}
    }
    for(let j=0;j<o.length;j++) {
      const k=(j+1)%o.length;
      const out=[0,(o[j].x+o[k].x)/2-c.x,(o[j].y+o[k].y)/2-c.y];
      for(let i=0;i<3;i++)this.face([layers[i][j],layers[i][k],layers[i+1][k],layers[i+1][j]],i===1?edge:tile,out);
    }
  }
  finish() {
    const doc=this.doc,buf=doc.getRoot().listBuffers()[0];
    const attribute=(type,values,ArrayType=Float32Array)=>doc.createAccessor().setType(type).setArray(new ArrayType(values)).setBuffer(buf);
    const primitive=doc.createPrimitive().setMaterial(this.material)
      .setAttribute('POSITION',attribute('VEC3',this.positions))
      .setAttribute('NORMAL',attribute('VEC3',this.normals))
      .setAttribute('TEXCOORD_0',attribute('VEC2',this.uv))
      .setIndices(attribute('SCALAR',this.indices,this.positions.length/3>65535?Uint32Array:Uint16Array));
    this.pivot.addChild(doc.createNode(this.name+'Assembly').setMesh(doc.createMesh(this.name).addPrimitive(primitive)));
  }
}
