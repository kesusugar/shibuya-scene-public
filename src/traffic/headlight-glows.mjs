import {InstancedMesh,PlaneGeometry,ShaderMaterial,AdditiveBlending,Object3D} from 'three';
import {VEHICLES} from './config.mjs';

// Camera-facing soft cores; depth testing keeps headlights behind buildings opaque.
export function headlightGlows(capacity,source){
 const geometry=new PlaneGeometry(2.3,2.3),material=new ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,blending:AdditiveBlending,uniforms:{strength:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;vec4 p=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);p.xy+=position.xy;gl_Position=projectionMatrix*p;}',fragmentShader:'uniform float strength;varying vec2 vUv;void main(){float r=length(vUv*2.-1.);float a=(exp(-r*r*12.)*.65+exp(-r*r*55.)*.35)*(1.-smoothstep(.75,1.,r));gl_FragColor=vec4(1.,.93,.76,a*strength);}'});
 const mesh=new InstancedMesh(geometry,material,capacity*2),o=new Object3D();mesh.count=0;mesh.frustumCulled=false;mesh.name='traffic-headlight-halos';
 mesh.onBeforeRender=()=>{material.uniforms.strength.value=Math.max(0,Math.min(.95,(source.emissiveIntensity-.2)/5));};
 return {mesh,sync(vehicles){let n=0;for(const v of vehicles){if(!v.active||(v.parked&&!v.controlled))continue;const d=VEHICLES[v.type],s=Math.sin(v.heading),c=Math.cos(v.heading);for(const side of [-1,1]){o.position.set(v.x+s*(d.length/2+.08)+c*d.width*.32*side,.69+(v.y??0),v.z+c*(d.length/2+.08)-s*d.width*.32*side);o.updateMatrix();mesh.setMatrixAt(n++,o.matrix);}}mesh.count=n;mesh.instanceMatrix.needsUpdate=true;},dispose(){mesh.removeFromParent();mesh.dispose();geometry.dispose();material.dispose();}};
}
