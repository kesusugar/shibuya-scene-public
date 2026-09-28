import {ShaderMaterial,ShaderLib,UniformsUtils,WebGLRenderTarget,HalfFloatType,Vector2} from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
const vertex='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
// PLAN-WEAPONS R12: a muzzle flash lights nothing (no point light; the night light budget), but
// the frame of a shot blooms a little more: `value` 0..1 is set by the scene for that frame.
// PLAN-PERFORMANCE P0: single passes switched off for the ?perf=sweep A/B (and ?off=).
export const PIPELINE_OFF={ao:false,bloom:false,smaa:false};
export const BLOOM_KICK={value:0,strength:.35,threshold:1.6};
export const FIDELITY={dpr:1.5,shadow:4096,aoScale:.5,radius:2.5,thickness:1.5,samples:12,blend:.85,denoiseRings:2,denoiseSamples:12,exposureDay:.74,exposureNight:.86,environmentDay:.3,environmentNight:.12,bloomStrength:.35,bloomThreshold:4.2};
export const noAO=o=>!!o.userData.noAO||/^(signs-(print|led|heroScreen)|s13-|s163-halo|traffic-.*-(front|rear)|s9-signal-lenses)/.test(o.name)||o.material?.isShaderMaterial;
export function configureAO(ao){
 // Store an exclusion bit in the existing G-buffer alpha, without another scene render.
 ao.normalMaterial.dispose();const uniforms=UniformsUtils.clone(ShaderLib.normal.uniforms);uniforms.s163NoAO={value:0};
 let fragment=ShaderLib.normal.fragmentShader;const end=fragment.lastIndexOf('}');fragment=fragment.slice(0,end)+'gl_FragColor.a=1.0-s163NoAO;\n'+fragment.slice(end);
 ao.normalMaterial=new ShaderMaterial({uniforms,vertexShader:ShaderLib.normal.vertexShader,fragmentShader:'uniform float s163NoAO;\n'+fragment});
 ao.normalMaterial.onBeforeRender=(_r,_s,_c,_g,object)=>{uniforms.s163NoAO.value=noAO(object)?1:0;ao.normalMaterial.uniformsNeedUpdate=true;};
 // Excluded samples do not occlude neighbours; excluded receivers bypass the denoised AO.
 ao.gtaoMaterial.fragmentShader=ao.gtaoMaterial.fragmentShader.replace('float getDepth(const vec2 uv) {','float getDepth(const vec2 uv) {\nif(textureLod(tNormal,uv,0.0).a<0.5)return 1.0;');
 ao.blendMaterial.uniforms.s163Normal={value:ao.normalRenderTarget.texture};ao.blendMaterial.fragmentShader='uniform sampler2D s163Normal;\n'+ao.blendMaterial.fragmentShader.replace('texel.rgb, intensity','texel.rgb, intensity*step(0.5,texture2D(s163Normal,vUv).a)');
 const renderAO=ao.render.bind(ao);ao.render=(renderer,...args)=>{const auto=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;try{return renderAO(renderer,...args);}finally{renderer.shadowMap.autoUpdate=auto;}};
 ao.blendIntensity=FIDELITY.blend;ao.updateGtaoMaterial({radius:2.5,thickness:1.5,samples:12,screenSpaceRadius:false});ao.updatePdMaterial({rings:2,samples:12,radius:4});
}
export class SoftBloomPass extends Pass{
 constructor(){super();this.strength=FIDELITY.bloomStrength;this.threshold=FIDELITY.bloomThreshold;this.soft=new WebGLRenderTarget(1,1,{type:HalfFloatType,depthBuffer:false});this.extract=new ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{source:{value:null},stepUV:{value:new Vector2()},threshold:{value:this.threshold}},vertexShader:vertex,fragmentShader:`uniform sampler2D source;uniform vec2 stepUV;uniform float threshold;varying vec2 vUv;void main(){vec3 sum=vec3(0.);for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){vec3 c=texture2D(source,vUv+vec2(float(x),float(y))*stepUV*1.5).rgb;float b=max(c.r,max(c.g,c.b));sum+=c*max(b-threshold,0.)/max(b,.001);}gl_FragColor=vec4(sum/9.,1.);}`});this.combine=new ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{source:{value:null},glow:{value:this.soft.texture},strength:{value:this.strength}},vertexShader:vertex,fragmentShader:'uniform sampler2D source;uniform sampler2D glow;uniform float strength;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(source,vUv).rgb+texture2D(glow,vUv).rgb*strength,1.);}'});this.quad=new FullScreenQuad();}
 setSize(w,h){this.soft.setSize(Math.max(1,Math.round(w*.25)),Math.max(1,Math.round(h*.25)));this.extract.uniforms.stepUV.value.set(1/this.soft.width,1/this.soft.height);}
 render(r,write,read){this.extract.uniforms.source.value=read.texture;this.extract.uniforms.threshold.value=this.threshold;this.quad.material=this.extract;r.setRenderTarget(this.soft);this.quad.render(r);this.combine.uniforms.source.value=read.texture;this.combine.uniforms.strength.value=this.strength;this.quad.material=this.combine;r.setRenderTarget(this.renderToScreen?null:write);this.quad.render(r);}
 dispose(){this.soft.dispose();this.extract.dispose();this.combine.dispose();this.quad.dispose();}
}
export const NightGrade={uniforms:{tDiffuse:{value:null},night:{value:0}},vertexShader:vertex,fragmentShader:`uniform sampler2D tDiffuse;uniform float night;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));vec3 g=mix(vec3(l),c,1.025);g+=vec3(.002,.005,.009)*(1.-smoothstep(.02,.4,l));g*=1.+.025*tanh((l-.18)*2.);g*=1.-.045*smoothstep(.2,.72,length(vUv-.5));gl_FragColor=vec4(mix(c,max(g,vec3(0.)),night),1.);}`};
export function createFidelityPipeline(renderer,scene,camera){
 const composer=new EffectComposer(renderer),beauty=new RenderPass(scene,camera),ao=new GTAOPass(scene,camera,1,1);configureAO(ao);
 const resizeAO=ao.setSize.bind(ao);ao.setSize=(w,h)=>resizeAO(Math.max(1,Math.round(w*.5)),Math.max(1,Math.round(h*.5)));
 const bloom=new SoftBloomPass(),grade=new ShaderPass(NightGrade),smaa=new SMAAPass(),output=new OutputPass();
 // Installed Three r185 SMAA expects linear-sRGB; ACES + output conversion happen once, last.
 const passes=[beauty,ao,bloom,grade,smaa,output];for(const p of passes)composer.addPass(p);composer.setPixelRatio(1);const size=new Vector2();let w=0,h=0,disposed=false;
 return {composer,ao,bloom,grade,smaa,passes,render(night){if(disposed)return;renderer.getDrawingBufferSize(size);if(size.x!==w||size.y!==h){w=size.x;h=size.y;composer.setSize(w,h);}ao.enabled=!PIPELINE_OFF.ao;smaa.enabled=!PIPELINE_OFF.smaa;bloom.enabled=!PIPELINE_OFF.bloom;bloom.strength=FIDELITY.bloomStrength+BLOOM_KICK.value*BLOOM_KICK.strength;bloom.threshold=FIDELITY.bloomThreshold-BLOOM_KICK.value*BLOOM_KICK.threshold;grade.uniforms.night.value=night?1:0;const auto=renderer.info.autoReset,target=renderer.getRenderTarget();renderer.info.autoReset=false;if(auto)renderer.info.reset();try{composer.render();}finally{renderer.info.autoReset=auto;renderer.setRenderTarget(target);}},dispose(){if(disposed)return;disposed=true;passes.forEach(p=>p.dispose?.());composer.dispose();}};
}
