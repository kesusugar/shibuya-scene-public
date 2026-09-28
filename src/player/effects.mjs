// The player's car's smoke, sparks and dust.
//
// Roadmap ③: the smoke was a faceted solid (an icosahedron at detail 0, one flat opacity) and read
// as grey boxes. Each particle is now a camera-facing quad drawn by its own small shader: a soft,
// lobed puff (a few fixed ripples on its edge, a little variation inside, never a hard rim) that
// fades in, grows, turns slowly and thins out as it rises. Sparks are small hot dots through the
// same shader. One InstancedMesh, one draw call, a fixed pool of `FX.pool` -- nothing grows.
import {Group,InstancedMesh,PlaneGeometry,ShaderMaterial,Object3D,Color,DynamicDrawUsage,InstancedBufferAttribute,NormalBlending} from 'three';

export const FX = Object.freeze({
 pool: 72,
 // A damaged car's smoke (damage over `smokeFrom`): a puff every `smokeEvery` s off the bonnet.
 smokeFrom: .4, smokeEvery: .12, smokeLife: [2, 2.8], smokeSize: [.3, 1.6], smokeAlpha: .8, darkAlpha: .62,
 // A crash: sparks and a burst of puffs off the front.
 crashSparks: 12, crashPuffs: 6, puffLife: [1, 1.5], puffSize: [.25, 1],
 sparkLife: .35, sparkSize: .05,
 dustLife: .9
});

const VERT = /* glsl */`
attribute float fxSize; attribute float fxAlpha; attribute float fxRot; attribute float fxSeed; attribute vec3 fxColor;
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying vec3 vColor;
void main(){
 vec4 mv = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
 float c = cos(fxRot), s = sin(fxRot);
 mv.xy += mat2(c, s, -s, c) * position.xy * fxSize;
 gl_Position = projectionMatrix * mv;
 vUv = position.xy; vAlpha = fxAlpha; vSeed = fxSeed; vColor = fxColor;
}`;
const FRAG = /* glsl */`
uniform float uLight;
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying vec3 vColor;
void main(){
 float r = length(vUv);
 if (r >= 1.0 || vAlpha <= 0.0) discard;
 float a = atan(vUv.y, vUv.x);
 // A lobed, soft edge: a few ripples round it, so no two puffs are the same disc.
 float edge = .78 + .1 * sin(a * 3. + vSeed * 6.3) + .06 * sin(a * 5. + vSeed * 11.1);
 float m = 1. - smoothstep(edge * .25, edge, r);
 // A little billow inside: darker and lighter patches that turn with the puff.
 float n = .78 + .22 * sin(vUv.x * 4.1 + vSeed * 9.) * sin(vUv.y * 3.7 - vSeed * 7.);
 // A spark (seed below 0) is its own light.
 gl_FragColor = vec4(vColor * (.86 + .14 * n) * (vSeed < 0. ? 1. : uLight), m * n * vAlpha);
}`;

export function createVehicleEffects(){
 const root=new Group();root.name='player-effects';const obj=new Object3D(),color=new Color();let cursor=0,emit=0,disposed=false;
 const N=FX.pool,geometry=new PlaneGeometry(2,2);
 const size=new Float32Array(N),alpha=new Float32Array(N),rot=new Float32Array(N),seed=new Float32Array(N),tint=new Float32Array(N*3);
 const attr=(name,array,k=1)=>{const a=new InstancedBufferAttribute(array,k);a.setUsage(DynamicDrawUsage);geometry.setAttribute(name,a);return a;};
 const aSize=attr('fxSize',size),aAlpha=attr('fxAlpha',alpha),aRot=attr('fxRot',rot),aSeed=attr('fxSeed',seed),aColor=attr('fxColor',tint,3);
 // Unlit, so it is dimmed by hand at night (`setLight`): a mid-grey puff glows on a dark street.
 const material=new ShaderMaterial({vertexShader:VERT,fragmentShader:FRAG,uniforms:{uLight:{value:1}},transparent:true,depthWrite:false,blending:NormalBlending});
 const mesh=new InstancedMesh(geometry,material,N);mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;mesh.name='player-smoke';root.add(mesh);
 // kind: 0 smoke (grows, rises, slows), 1 spark (falls), 2 dust (low, quick)
 const particles=Array.from({length:N},()=>({life:0,max:1,x:0,y:0,z:0,vx:0,vy:0,vz:0,size0:0,size1:0,peak:0,kind:0,spin:0,rot:0,seed:0,hex:0}));
 const take=()=>particles[cursor++%N];
 const r=k=>{const v=Math.sin(cursor*127.1+k*311.7)*43758.5453;return v-Math.floor(v);};
 const front=state=>{const s=Math.sin(state.heading),c=Math.cos(state.heading);return {s,c,x:state.x+s*1.5,z:state.z+c*1.5};};
 const smoke=(state)=>{const p=take(),f=front(state),dark=state.damage>.7,life=FX.smokeLife[0]+r(1)*(FX.smokeLife[1]-FX.smokeLife[0]);
  Object.assign(p,{kind:0,life,max:life,x:f.x+(r(2)-.5)*.4,y:(state.y??0)+.9,z:f.z+(r(3)-.5)*.4,vx:(r(4)-.5)*.5,vz:(r(5)-.5)*.5,vy:1+r(6)*.4,
   size0:FX.smokeSize[0]*(.8+.4*r(7)),size1:FX.smokeSize[1]*(.8+.4*r(8)),peak:dark?FX.darkAlpha:FX.smokeAlpha,spin:(r(9)-.5)*.8,rot:r(10)*6.28,seed:r(11),
   hex:dark?(state.damage>.9?(r(12)<.5?0x2c3035:0x3d4248):(r(12)<.5?0x40464d:0x50565c)):(r(12)<.5?0xb9c2c8:0xa7b0b6)});};
 const spark=(state)=>{const p=take(),f=front(state),a=r(1)*6.28;
  Object.assign(p,{kind:1,life:FX.sparkLife,max:FX.sparkLife,x:f.x,y:(state.y??0)+.9,z:f.z,vx:Math.sin(a)*3,vz:Math.cos(a)*3,vy:1.5,size0:FX.sparkSize,size1:FX.sparkSize,peak:1,spin:0,rot:0,seed:-1,hex:0xffb64a});};
 const puff=(state)=>{const p=take(),f=front(state),a=r(1)*6.28,life=FX.puffLife[0]+r(2)*(FX.puffLife[1]-FX.puffLife[0]);
  Object.assign(p,{kind:0,life,max:life,x:f.x+Math.sin(a)*.3,y:(state.y??0)+.55,z:f.z+Math.cos(a)*.3,vx:Math.sin(a)*1.4,vz:Math.cos(a)*1.4,vy:.5+r(3)*.4,
   size0:FX.puffSize[0],size1:FX.puffSize[1]*(.8+.4*r(4)),peak:.85,spin:(r(5)-.5)*1.2,rot:r(6)*6.28,seed:r(7),hex:r(8)<.5?0xc9cdcf:0xb3aea5});};
 // RUN 11.4: a low puff of road dust where a body met the car -- movement and weight rather than
 // more blood. Shares the same pool, so it cannot add a draw call or grow.
 const dust=(x,y,z,intensity=.7)=>{const n=3+Math.round(3*intensity);for(let k=0;k<n;k++){const p=take(),a=cursor*2.4;
  Object.assign(p,{kind:2,life:FX.dustLife,max:FX.dustLife,x:x+Math.sin(a)*.3,y:y+.12,z:z+Math.cos(a)*.3,vx:Math.sin(a)*(.6+intensity),vz:Math.cos(a)*(.6+intensity),vy:.35,
   size0:.12+.06*intensity,size1:.45+.3*intensity,peak:.7,spin:(r(1)-.5),rot:r(2)*6.28,seed:r(3),hex:0xa99f92});}};
 return {root,dust,
  /** How lit the street is, 0..1 (the scene: 1 by day, less at dusk and night). Sparks keep their glow. */
  setLight(k){material.uniforms.uLight.value=Math.max(.05,Math.min(1,k));},
  /** A crash: sparks and a burst of smoke off the front. */
  impact(state){for(let i=0;i<FX.crashSparks;i++)spark(state);for(let i=0;i<FX.crashPuffs;i++)puff(state);},
  update(dt,state){if(disposed)return;root.visible=true;
   if(state?.active&&state.damage>FX.smokeFrom){emit+=dt;while(emit>FX.smokeEvery){emit-=FX.smokeEvery;smoke(state);}}else emit=0;
   let count=0;
   for(const p of particles){if(p.life<=0)continue;p.life-=dt;if(p.life<=0)continue;
    const t=1-p.life/p.max;
    if(p.kind===1)p.vy-=7*dt;
    else{const drag=Math.exp(-(p.kind===2?2.5:.9)*dt);p.vx*=drag;p.vz*=drag;p.vy*=p.kind===2?drag:Math.exp(-.35*dt);}
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.rot+=p.spin*dt;
    // Grows fast then slower (a puff spreading); fades in over the first tenth, out over the rest.
    const grow=1-(1-t)*(1-t);
    const a=p.kind===1?Math.min(1,p.life/.1):p.peak*Math.min(1,t/.1)*(1-t)**.9;
    obj.position.set(p.x,p.y,p.z);obj.updateMatrix();mesh.setMatrixAt(count,obj.matrix);
    size[count]=p.size0+(p.size1-p.size0)*grow;alpha[count]=a;rot[count]=p.rot;seed[count]=p.seed;
    color.setHex(p.hex);tint[count*3]=color.r;tint[count*3+1]=color.g;tint[count*3+2]=color.b;count++;}
   mesh.count=count;mesh.instanceMatrix.needsUpdate=true;
   for(const a of [aSize,aAlpha,aRot,aSeed,aColor])a.needsUpdate=true;
  },
  /** Live particles by kind (for tests). */
  get live(){const out={smoke:0,spark:0,dust:0};for(const p of particles)if(p.life>0)out[['smoke','spark','dust'][p.kind]]++;return out;},
  hide(){root.visible=false;for(const p of particles)p.life=0;emit=0;},
  dispose(){if(disposed)return;disposed=true;root.removeFromParent();mesh.dispose();geometry.dispose();material.dispose();}};
}
