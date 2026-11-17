// Engineered field surface. Static frame with caller-controlled phase; no gameplay.
export function fieldMaterial(THREE,o){
 const uniforms={tint:{value:new THREE.Color(o.color)},alpha:{value:o.opacity},extent:{value:new THREE.Vector2(1,1)},phase:{value:0},motion:{value:o.motion===false?0:1}};
 return new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
 vertexShader: 'varying vec2 vUv; varying vec3 vNormal; varying vec3 vView; void main(){vUv=uv;vec4 q=modelViewMatrix*vec4(position,1.0);vNormal=normalize(normalMatrix*normal);vView=-q.xyz;gl_Position=projectionMatrix*q;}',
 fragmentShader: [
 'uniform vec3 tint; uniform float alpha; uniform vec2 extent; uniform float phase; uniform float motion;',
 'varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;',
 'float hexDistance(vec2 p){p=abs(p);return max(dot(p,vec2(.8660254,.5)),p.y);}',
 'void main(){',
 'vec2 p=vUv*extent*5.0; vec2 period=vec2(1.7320508,1.0);',
 'vec2 a=mod(p,period)-period*.5; vec2 b=mod(p-period*.5,period)-period*.5;',
 'vec2 h=dot(a,a)<dot(b,b)?a:b; h=h.yx;',
 'float d=abs(hexDistance(h)-.5); float lines=1.0-smoothstep(.017,.054,d);',
 'float edge=1.0-smoothstep(.0,.045,min(min(vUv.x,1.0-vUv.x),min(vUv.y,1.0-vUv.y)));',
 'float rim=pow(1.0-abs(dot(normalize(vNormal),normalize(vView))),3.0);',
 'float wave=exp(-pow((vUv.y-fract(phase*.42))*13.0,2.0))*motion;',
 'float opacity=clamp(.055+lines*.40+edge*.50+rim*.23+wave*.17,0.0,.90)*alpha;',
 'gl_FragColor=vec4(tint*(.70+lines*.35+edge*.25),opacity);',
 '}'].join(String.fromCharCode(10))
 });
}
