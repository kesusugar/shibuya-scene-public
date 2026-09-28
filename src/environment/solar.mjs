import {Color,Vector3,Mesh,SphereGeometry,ShaderMaterial,BackSide} from 'three';

export const SOLAR_PHASES=Object.freeze({
 dawn:{angle:.10,night:.45,sky:0x947d99,horizon:0xffc594,sun:0xffbf80,key:1.0,fill:.30,exposure:.78},
 day:{angle:1.12,night:0,sky:0x80acd1,horizon:0xc9d0d5,sun:0xfff3e2,key:1.65,fill:.30,exposure:.74},
 dusk:{angle:3.00,night:.55,sky:0x635c8b,horizon:0xffa46b,sun:0xff985a,key:.85,fill:.24,exposure:.80},
 night:{angle:3.55,night:1,sky:0x03060c,horizon:0x101727,sun:0xacc5ec,key:.08,fill:.22,exposure:.86}
});
export function solarSample(from,to,t){const a=SOLAR_PHASES[from],b=SOLAR_PHASES[to],s=Math.max(0,Math.min(1,t));return blend(a,b,s*s*(3-2*s));}
const WHITE=new Color(0xffffff),DAY_FILL=new Color(0xfff6e9);
function blend(a,b,t){const out={};for(const k of ['angle','night','key','fill','exposure'])out[k]=a[k]+(b[k]-a[k])*t;for(const k of ['sky','horizon','sun'])out[k]=new Color(a[k]).lerp(new Color(b[k]),t);return out;}
export class SolarCycle{
 constructor(scene,environment,fidelity,clock){Object.assign(this,{scene,environment,fidelity,clock});this.phase=clock.value;this.state=blend(SOLAR_PHASES[this.phase],SOLAR_PHASES[this.phase],0);this.transition=null;
  this.material=new ShaderMaterial({side:BackSide,depthWrite:false,toneMapped:true,uniforms:{top:{value:new Color()},horizon:{value:new Color()},sunColor:{value:new Color()},direction:{value:new Vector3()},sunVisible:{value:0}},vertexShader:'varying vec3 ray;void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 ray;uniform vec3 top,horizon,sunColor,direction;uniform float sunVisible;void main(){vec3 r=normalize(ray);float h=pow(max(r.y,0.),.45);vec3 c=mix(horizon,top,h);float d=dot(r,direction);float disc=smoothstep(.9993,.99965,d);float glow=pow(max(d,0.),180.)*.4;gl_FragColor=vec4(c+sunColor*(disc*3.+glow)*sunVisible,1.);}'});
  this.sky=new Mesh(new SphereGeometry(900,24,12),this.material);this.sky.name='solar-sky';this.sky.frustumCulled=false;this.sky.renderOrder=-100;this.sky.userData.noAO=true;scene.add(this.sky);
 }
 select(phase,animate=true){if(!SOLAR_PHASES[phase])throw Error('Invalid solar phase');this.phase=phase;this.clock.set(phase==='night'||phase==='dusk'?'night':'day');const target=blend(SOLAR_PHASES[phase],SOLAR_PHASES[phase],0);this.transition=animate?{from:this.state,to:target,elapsed:0}:null;if(!animate)this.state=target;this.update(0);}
 update(dt){if(this.transition){const tr=this.transition;tr.elapsed+=Math.max(0,dt);const t=Math.min(1,tr.elapsed/5),s=t*t*(3-2*t);this.state=blend(tr.from,tr.to,s);if(t===1)this.transition=null;}
  const e=this.environment,f=this.fidelity,s=this.state;if(!e.active){this.sky.visible=false;return;}this.sky.visible=true;
  const direction=this.material.uniforms.direction.value.set(-Math.cos(s.angle),Math.sin(s.angle),.25).normalize();
  e.key.position.copy(direction).multiplyScalar(220);if(direction.y<0)e.key.position.y=80;e.key.color.copy(s.sun);e.key.intensity=s.key;e.fill.intensity=s.fill;e.fill.color.copy(s.sky).lerp(WHITE,.65).lerp(DAY_FILL,(1-s.night)*.7);
  if(e.renderer)e.renderer.toneMappingExposure=s.exposure;
  this.material.uniforms.top.value.copy(s.sky);this.material.uniforms.horizon.value.copy(s.horizon);this.material.uniforms.sunColor.value.copy(s.sun);this.material.uniforms.sunVisible.value=Math.max(0,Math.min(1,direction.y*15));
  if(this.scene.fog)this.scene.fog.color.copy(s.horizon);
  for(const r of e.roots.values())for(const b of r.materials.values()){if(b.emission){b.emission.uniform.value=s.night;b.emission.glow.value=e.nightglow*s.night;}if(b.night!==null)b.material.emissiveIntensity=b.intensity+(b.night-b.intensity)*s.night;}
  for(const l of [...f.lights,...f.spots])l.intensity=l.visible?l.userData.nightIntensity*s.night:0;
 }
 dispose(){this.sky.removeFromParent();this.sky.geometry.dispose();this.material.dispose();}
}
