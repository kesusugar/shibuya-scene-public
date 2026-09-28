import {PlaneGeometry,Mesh,ShaderMaterial,AdditiveBlending} from 'three';
import {merge} from '../geo/geometry.mjs';
// A single batch around at most eight existing Hero screens; no new sign identities.
export function createHeroHalos(model){const list=[];for(const s of model.signs.filter(s=>s.hero&&s.category==='screen').slice(0,8)){const g=new PlaneGeometry(s.width+1.2,s.height+1.2);g.rotateY(s.heading);g.translate(s.position[0]+s.normal[0]*(s.depth/2+.08),s.position[1],s.position[2]+s.normal[2]*(s.depth/2+.08));list.push(g);}if(!list.length)return null;const geometry=merge(list);list.forEach(g=>g.dispose());const material=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,uniforms:{night:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform float night;varying vec2 vUv;void main(){vec2 d=abs(vUv-.5)*2.;float edge=max(d.x,d.y);float a=smoothstep(.65,.86,edge)*(1.-smoothstep(.86,1.,edge))*.12*night;gl_FragColor=vec4(vec3(.45,.7,1.2),a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});const mesh=new Mesh(geometry,material);mesh.name='s163-halo';mesh.userData.noAO=true;return {mesh,count:list.length,dispose(){geometry.dispose();material.dispose();mesh.removeFromParent();}};}
