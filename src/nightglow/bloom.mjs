import {WebGLRenderTarget,HalfFloatType,LinearFilter,Scene,OrthographicCamera,PlaneGeometry,Mesh,ShaderMaterial,Vector2} from 'three';
import {NIGHT_PROFILES} from './model.mjs';
const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
export function createNightBloom(renderer){
 const base=new WebGLRenderTarget(1,1,{type:HalfFloatType,minFilter:LinearFilter,magFilter:LinearFilter}),soft=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:false,minFilter:LinearFilter,magFilter:LinearFilter});
 const extract=new ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{source:{value:base.texture},stepUV:{value:new Vector2(1,1)},threshold:{value:1.1}},vertexShader:vertex,fragmentShader:`uniform sampler2D source;uniform vec2 stepUV;uniform float threshold;varying vec2 vUv;
void main(){vec3 sum=vec3(0.);for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){vec3 c=texture2D(source,vUv+vec2(float(x),float(y))*stepUV*1.5).rgb;float b=max(c.r,max(c.g,c.b));sum+=c*max(b-threshold,0.)/max(b,.001);}gl_FragColor=vec4(sum/9.,1.);}`});
 const combine=new ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{source:{value:base.texture},glow:{value:soft.texture},strength:{value:0}},vertexShader:vertex,fragmentShader:`uniform sampler2D source;uniform sampler2D glow;uniform float strength;varying vec2 vUv;
void main(){gl_FragColor=vec4(texture2D(source,vUv).rgb+texture2D(glow,vUv).rgb*strength,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`});
 const geometry=new PlaneGeometry(2,2),camera=new OrthographicCamera(-1,1,1,-1,0,1),a=new Scene(),b=new Scene();a.add(new Mesh(geometry,extract));b.add(new Mesh(geometry,combine));const size=new Vector2();let width=0,height=0,scale=0,disposed=false;
 return {base,soft,extract,combine,render(scene,view,tier,active){const p=NIGHT_PROFILES[tier];if(disposed||!active||!p.bloom){renderer.render(scene,view);return 0;}renderer.getDrawingBufferSize(size);if(width!==size.x||height!==size.y||scale!==p.scale){width=size.x;height=size.y;scale=p.scale;base.setSize(width,height);soft.setSize(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)));extract.uniforms.stepUV.value.set(1/soft.width,1/soft.height);}combine.uniforms.strength.value=p.bloom;const target=renderer.getRenderTarget(),autoReset=renderer.info.autoReset;renderer.info.autoReset=false;if(autoReset)renderer.info.reset();try{renderer.setRenderTarget(base);renderer.render(scene,view);renderer.setRenderTarget(soft);renderer.render(a,camera);renderer.setRenderTarget(target);renderer.render(b,camera);}finally{renderer.setRenderTarget(target);renderer.info.autoReset=autoReset;}return 2;},dispose(){if(disposed)return;disposed=true;base.dispose();soft.dispose();geometry.dispose();extract.dispose();combine.dispose();a.clear();b.clear();}};
}
