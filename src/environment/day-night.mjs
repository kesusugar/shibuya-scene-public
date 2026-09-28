import {Group,Color,HemisphereLight,DirectionalLight} from 'three';
import {ROAD_SPILL_GLSL} from '../nightglow/road-spill.mjs';
import {ROAD_REFLECTION_GLSL,ROAD_REFLECTION_UNIFORMS} from '../nightglow/road-reflection.mjs';
import {FRONTAGE_SPILL_GLSL} from '../nightglow/frontage-spill.mjs';
export const DAY_NIGHT=Object.freeze({day:{sky:0x9fb5ce,exposure:.9,ambient:.4,key:1.2},night:{sky:0x03060c,exposure:1,ambient:.22,key:.08}});
// One uniform per existing shared material. No geometry, extra pass, or per-frame allocation.
export function installNightEmission(material,mode){
 const original=material.onBeforeCompile,key=material.customProgramCacheKey,uniform={value:0},glow={value:0};
 material.onBeforeCompile=shader=>{original.call(material,shader);shader.uniforms.s12Night=uniform;shader.uniforms.s13Nightglow=glow;
  let vertex='',fragment='uniform float s12Night;\nuniform float s13Nightglow;\n',body='';
  if(mode==='window'||mode==='curtainWindow'||mode==='storefront'||mode==='heroStorefront'){vertex='uniform float s13Nightglow;\nvarying float s12Window;\nvarying vec3 s12WindowTint;\n';fragment+='varying float s12Window;\nvarying vec3 s12WindowTint;\n';body=`s12Window=0.0;s12WindowTint=vec3(1.0,0.72,0.39);
#ifdef USE_INSTANCING
float seed=mod(abs(dot(instanceMatrix[3].xyz,vec3(12.9898,78.233,37.719))),7.0);
s12Window=seed<4.0?0.38+seed*0.12:0.0;
s12Window*=mix(1.0,0.18,smoothstep(90.0,210.0,length(instanceMatrix[3].xz)));\ns12WindowTint=seed<1.0?vec3(1.0,0.48,0.16):(seed<2.0?vec3(1.0,0.72,0.34):(seed<3.0?vec3(1.0,0.88,0.66):vec3(0.82,0.90,1.0)));
#endif`;
   if(mode==='curtainWindow')body+='\n#ifdef USE_INSTANCING\ns12Window=0.65*mix(1.0,0.12,smoothstep(70.0,170.0,length(instanceMatrix[3].xz)));s12WindowTint=vec3(0.58,0.78,1.0);\n#endif';
   if(mode==='heroStorefront')body+='\n#ifdef USE_INSTANCING\nif(instanceMatrix[3].y<14.0&&length(instanceMatrix[3].xz)<95.0)s12Window=max(s12Window,1.48);\n#endif';
   if(mode==='storefront')body+='\n#ifdef USE_INSTANCING\nif(instanceMatrix[3].y<14.0)s12Window=max(s12Window,1.48);\n#endif';
   shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += s12WindowTint*s12Window*s12Night*(1.0+0.65*s13Nightglow);');
  }else if(mode==='wall'){
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(0.68,0.70,0.72),vec3(0.32,0.37,0.46),s12Night);');
  }else if(mode==='groundPool'||mode==='groundPoolRoad'||mode==='groundPoolWalk'){
   if(mode==='groundPoolRoad'){
    fragment+=ROAD_SPILL_GLSL;
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
float roadWetMask=smoothstep(.23,.76,roadNoise(s161Position.xz*.42));
roughnessFactor=mix(roughnessFactor,mix(.82,.28,roadWetMask),s12Night*s13Nightglow);`);
   }
   if(mode==='groundPoolWalk')fragment+=FRONTAGE_SPILL_GLSL;
   vertex='varying vec3 s161Position;\n';fragment+='varying vec3 s161Position;\n';body='s161Position=(modelMatrix*vec4(transformed,1.0)).xyz;';
   // RUN 12.2: the real mirror, shared by every asphalt program; black and zero until one exists.
   if(mode==='groundPoolRoad'){fragment+=ROAD_REFLECTION_GLSL;Object.assign(shader.uniforms,ROAD_REFLECTION_UNIFORMS);}
   shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
vec2 q=s161Position.xz;
float alley=(1.-smoothstep(3.0,3.6,abs(q.x-q.y-4.0)))*smoothstep(-96.,-90.,q.x)*(1.-smoothstep(-35.,-31.,q.x));
float plank=step(.1,fract((q.x+q.y)*1.4));
diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.24,.115,.07)*mix(.65,1.,plank),alley);
totalEmissiveRadiance+=vec3(.24,.13,.065)*alley*s12Night*(.25+.75*pow(.5+.5*cos((q.x+q.y)*.32),6.));
${mode==='groundPoolRoad'?'totalEmissiveRadiance+=billboardRoadSpill(q)*s12Night*(1.0-.55*s13ReflectStrength);totalEmissiveRadiance+=roadMirror(q,smoothstep(.23,.76,roadNoise(q*.42)))*s12Night;':''}
${mode==='groundPoolWalk'?'totalEmissiveRadiance+=frontageSpill(q)*s12Night;':''}
float pool=0.0;
for(int i=0;i<4;i++){vec2 c=vec2(i<2?-22.0:22.0,mod(float(i),2.0)<0.5?-19.0:19.0);pool+=(0.20+0.018*float(i))*pow(max(0.0,1.0-length(q-c)/16.0),2.4);}
totalEmissiveRadiance+=vec3(1.0,0.69,0.38)*pool*s12Night;`);
  }else if(mode==='sign'){vertex='attribute float s13GlowWeight;\nvarying float s13Sign;\n';fragment+='varying float s13Sign;\n';body='s13Sign=s13GlowWeight;';shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0+s13Nightglow*(max(s13Sign,0.8)-1.0);');
  }else if(mode==='train'){vertex='attribute vec3 s12Emission;\nattribute float s12LampEnd;\nattribute vec2 s12Cab;\nvarying vec3 s12Train;\n';fragment+='varying vec3 s12Train;\n';body=`s12Train=s12Emission;
float cab=s12LampEnd< -0.5?s12Cab.x:(s12LampEnd>0.5?s12Cab.y:0.0);
if(abs(cab)>0.5)s12Train=cab>0.0?vec3(1.0,0.86,0.62):vec3(0.75,0.025,0.015);`;
   shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += s12Train*s12Night*(1.0+0.18*s13Nightglow);');
  }else if(mode==='coloredLamp')shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
  shader.vertexShader=vertex+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+body);shader.fragmentShader=fragment+shader.fragmentShader;
 };
 material.customProgramCacheKey=()=>key.call(material)+':s12-'+mode;material.needsUpdate=true;
 return {uniform,glow,restore(){uniform.value=0;glow.value=0;material.onBeforeCompile=original;material.customProgramCacheKey=key;material.needsUpdate=true;}};
}
export class DayNightSystem{
 constructor(scene,renderer,time){this.scene=scene;this.renderer=renderer;this.time=time;this.roots=new Map();this.active=false;this.nightglow=0;this.savedBackground=scene.background;this.savedExposure=renderer?.toneMappingExposure??1;this.background=new Color();this.root=new Group();this.root.name='s12-environment';this.fill=new HemisphereLight(0xeaf2ff,0x38435b,2);this.key=new DirectionalLight(0xfff6e9,2.2);this.key.position.set(-80,180,90);this.root.add(this.fill,this.key);this.off=time.subscribe(()=>this.apply());}
 setNightglow(value){if(!Number.isFinite(value))throw Error('Invalid nightglow');this.nightglow=Math.max(0,Math.min(1,value));this.apply();}
 enable(){if(this.active)return;this.active=true;this.scene.add(this.root);this.apply();}
 register(root){if(this.roots.has(root))return;const materials=new Map(),lights=[];
  root.traverse(o=>{if(o.isLight)lights.push({light:o,intensity:o.intensity});if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m?.isMeshStandardMaterial)continue;let mode=null,night=null;
   if(/^(buildings-wall|hero-(concreteLight|concreteDark|roof)|station-.*(wall|concrete))$/.test(o.name))mode='wall';
   if(/^buildings-(windows|shopWindows)$/.test(o.name)||/^hero-panels-glass/.test(o.name))mode='window';
   if(o.name==='buildings-curtainWindows')mode='curtainWindow';
   if(/^ground-(asphalt|sidewalk|curb|paint|tactile|land)$/.test(o.name))mode='groundPool';
   if(o.name==='ground-asphalt')mode='groundPoolRoad';
   if(o.name==='ground-sidewalk'||o.name==='ground-land')mode='groundPoolWalk';
   if(/^hero-panels-glass/.test(o.name))mode='heroStorefront';
   if(o.name==='buildings-shopWindows')mode='storefront';
   if(/^train-(JR|Ginza)$/.test(o.name))mode='train';
   // Keep printed colors below the display peak; bulbs and rims remain separate.
   if(/^signs-(print|led|heroScreen|reference)$/.test(o.name)){night=o.name==='signs-print'?1.15:o.name==='signs-led'?1.8:o.name==='signs-reference'?1.6:1.6;mode='sign';}
   if(o.name==='center-gai-advertisements')night=1.2;
   if(o.name==='center-gai-light')night=7;
   if(o.name==='center-gai-rim')night=7;
   if(o.name==='sign-accent-bulbs')night=18;
   if(o.name==='hero-109-finish')night=1.5;
   if(/^traffic-.*-front$/.test(o.name))night=6;
   if(/^traffic-.*-rear$/.test(o.name)){night=1.65;mode='coloredLamp';}
   if(o.name==='s9-signal-lenses'){night=.85;mode='coloredLamp';}
   if(/^station-detail-.*-glow$/.test(o.name))night=4.5;
   if(/^streetscape-.*-emissive$/.test(o.name))night=5;
   if(o.name==='hero-cafe-frontage')night=.42;
   if(o.name==='qfront-interior-warm')night=1.5;
   if(o.name==='qfront-interior-shell')night=.28;
   if(o.name==='qfront-interior-wood')night=.2;
   if(o.name==='qfront-interior-dim')night=.16;
   if(o.name==='hero-polish-storefront')night=.85;
   if(o.name==='hero-polish-marquee')night=3.8;
   if(o.name==='hero-polish-canopies')night=.5;
   const wet=o.name==='ground-asphalt';if(!mode&&night===null&&!wet)continue;if(materials.has(m))continue;
   materials.set(m,{material:m,intensity:m.emissiveIntensity,night,wet,roughness:m.roughness,metalness:m.metalness,vehicle:/^traffic-.*-(front|rear)$/.test(o.name),emission:mode?installNightEmission(m,mode):null});
  }});
  const removed=()=>this.unregister(root);root.addEventListener('removed',removed);this.roots.set(root,{materials,lights,removed});this.apply();
 }
 unregister(root){const r=this.roots.get(root);if(!r)return;root.removeEventListener('removed',r.removed);for(const b of r.materials.values()){b.material.emissiveIntensity=b.intensity;if(b.wet){b.material.roughness=b.roughness;b.material.metalness=b.metalness;}b.emission?.restore();}for(const b of r.lights)b.light.intensity=b.intensity;this.roots.delete(root);this.apply();}
 apply(){const night=this.active&&this.time.isDark(),settings=DAY_NIGHT[this.time.value];let hemis=0,suns=0;
  for(const r of this.roots.values()){for(const b of r.lights){b.light.intensity=this.active?0:b.intensity;if(b.light.isHemisphereLight)hemis++;if(b.light.isDirectionalLight)suns++;}for(const b of r.materials.values()){b.material.emissiveIntensity=night&&b.night!==null?b.night*(b.vehicle?1+this.nightglow*.15:1):b.intensity;if(b.wet){b.material.roughness=night&&this.nightglow>0?.68-.15*this.nightglow:b.roughness;b.material.metalness=night&&this.nightglow>0?.04+.03*this.nightglow:b.metalness;}if(b.emission){b.emission.uniform.value=night?1:0;b.emission.glow.value=night?this.nightglow:0;}}}
  if(!this.active){this.onApplied?.();return;}this.background.setHex(settings.sky);this.scene.background=this.background;if(this.renderer)this.renderer.toneMappingExposure=settings.exposure;
  this.fill.color.setHex(night?0x9ab5e7:0xf0f5ff);this.fill.groundColor.setHex(night?0x25324b:0x73706a);this.fill.intensity=settings.ambient;
  this.key.color.setHex(night?0xa4bcea:0xfff6e9);this.key.intensity=settings.key;this.onApplied?.();
 }
 snapshot(){return {state:this.time.value,dayFactor:this.time.isDark()?0:1,nightFactor:this.time.isDark()?1:0,active:this.active,exposure:this.renderer?.toneMappingExposure??DAY_NIGHT[this.time.value].exposure,ambient:this.fill.intensity,sunMoon:this.key.intensity,registeredRoots:this.roots.size,emissiveMaterials:[...this.roots.values()].reduce((n,r)=>n+r.materials.size,0),pointLights:0,shadowLights:0};}
 disable(){this.active=false;this.root.removeFromParent();this.apply();this.scene.background=this.savedBackground;if(this.renderer)this.renderer.toneMappingExposure=this.savedExposure;}
 dispose(){this.off();this.disable();for(const root of [...this.roots.keys()])this.unregister(root);this.fill.dispose();this.key.dispose();this.root.clear();}
}
