import {InstancedMesh,PlaneGeometry,ShaderMaterial,Matrix4,AdditiveBlending} from 'three';

// One camera-facing batch: lamp glare, not dozens of extra real-time lights.
export function lampGlows(anchors,emissive){
 const geometry=new PlaneGeometry(2.2,2.2),material=new ShaderMaterial({
  uniforms:{strength:{value:0}},transparent:true,depthWrite:false,depthTest:true,blending:AdditiveBlending,
  vertexShader:'varying vec2 vUv; void main(){vUv=uv;vec4 p=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);p.xy+=position.xy;gl_Position=projectionMatrix*p;}',
  fragmentShader:'uniform float strength;varying vec2 vUv;void main(){float r=length(vUv*2.0-1.0);float a=exp(-r*r*9.0)*(1.0-smoothstep(0.7,1.0,r))*strength;gl_FragColor=vec4(1.0,0.88,0.69,a);}'
 });
 const mesh=new InstancedMesh(geometry,material,Math.max(1,anchors.length)),matrix=new Matrix4();
 mesh.name='streetscape-lamp-glare';mesh.count=anchors.length;mesh.frustumCulled=false;
 anchors.forEach((a,i)=>mesh.setMatrixAt(i,matrix.makeTranslation(...a.position)));
 mesh.onBeforeRender=()=>{material.uniforms.strength.value=Math.max(0,Math.min(.9,(emissive.emissiveIntensity-.2)/4.8));};
 return {mesh,dispose(){mesh.dispose();geometry.dispose();material.dispose();}};
}
