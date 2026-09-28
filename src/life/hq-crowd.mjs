/**
 * A crowd of high-fidelity people that costs almost nothing per person.
 *
 * RUN 7A. The requirement is not "a few good bodies near the camera and cardboard behind" --
 * it is a scramble crossing full of people who can all SEE a car and all react to it. So
 * visual quality and per-character runtime cost are separated completely:
 *
 *   - Quality comes from the RUN 6.8 geometry, decimated offline, drawn with real skinning.
 *   - Animation comes from a bone matrix atlas baked offline and sampled in the vertex
 *     shader. There is NO Skeleton and NO AnimationMixer per citizen, at any count.
 *   - Time advances on the GPU. A citizen's phase and clip live in instanced attributes, so
 *     a walking crowd costs the CPU nothing at all between state changes.
 *   - State lives in typed arrays, not objects. One citizen is a few numbers at an index.
 *
 * What the CPU does per frame is write a transform for the citizens that moved. What it does
 * on a state change -- a car arrives, someone is hit -- is write one integer.
 *
 * The draw call count is the archetype count, not the population: four instanced meshes carry
 * two thousand people.
 */
import {InstancedMesh,InstancedBufferAttribute,BufferGeometry,BufferAttribute,
        MeshStandardMaterial,DataTexture,RGBAFormat,FloatType,NearestFilter,
        Object3D,Group,DynamicDrawUsage} from 'three';
import {PACE,paceStep,cadence} from './pace.mjs';
import {GARMENT_PATTERN_GLSL,GARMENT_UNPACK_GLSL,packGarment} from './garment-pattern.mjs';

/** The states a citizen can be in. Index into CLIP_FOR, and what the CPU writes. */
/**
 * The numeric order gives the priority of NORMAL through DOWNED. RECOVER is appended for
 * compatibility with the existing atlas index, but `priority()` ranks it below fresh danger.
 * `setState` refuses lower priority changes while a state is held: a glance cannot overwrite
 * a knockdown, and an approaching car can interrupt recovery.
 *
 * RUN 10 added STARTLE between LOOK and AVOID: a brief surprise is more than noticing and
 * less than stepping out of the way. Nothing persists these numbers -- the bake addresses
 * clips by name -- so renumbering was safe.
 */
export const STATE=Object.freeze({
 NORMAL:0,LOOK:1,STARTLE:2,AVOID:3,FLEE:4,HIT:5,KNOCKDOWN:6,DOWNED:7,RECOVER:8
});
// RECOVER is stored at index 8 for the atlas but is lower priority than fresh danger.
// Damage still outranks every visual reaction; being wary cannot make a new impact harmless.
const priority=b=>b===STATE.RECOVER?2:b;
/** Which baked clip each state plays. Several states share one clip on purpose. */
export const CLIP_FOR=Object.freeze({
 [STATE.NORMAL]:'Walk',[STATE.LOOK]:'Walk',[STATE.STARTLE]:'Startle',
 [STATE.AVOID]:'Run',[STATE.FLEE]:'Run',
 [STATE.HIT]:'Startle',[STATE.KNOCKDOWN]:'Fall',[STATE.DOWNED]:'Fall',[STATE.RECOVER]:'Guard'
});
/**
 * The clip a citizen actually plays: `CLIP_FOR`, except that someone standing at a kerb for
 * the signal plays Idle instead of walking on the spot.
 *
 * Signal waiting is a STATE the simulation sets (`p.state === 'waiting'`, a crossing queue or
 * the scramble cast at its kerb), not a speed: a body that is merely blocked for a moment, or
 * one of the frozen poses, must not turn into Idle because its speed reads zero. Priority is
 * physical (HIT..RECOVER) over awareness (LOOK..FLEE) over waiting/locomotion, and only
 * NORMAL and LOOK -- the states that borrow the locomotion clip -- are ever replaced, so a
 * waiting citizen who STARTLEs, AVOIDs or FLEEs still plays exactly that reaction.
 */
export function clipFor(behaviour,waiting,moving=true,fast){
 // RUN 11.0: LOOK is not a whole-body reaction -- it has no clip of its own and borrows the
 // locomotion one -- so it keeps the stance underneath. A waiting citizen who glanced at the
 // player was playing Walk on the spot; 16-32 of the 1,455 at a red light, live.
 //
 // claude/crowd-realism: `moving` is the body's MEASURED pace (src/life/pace.mjs), with
 // hysteresis. Anyone the simulation is not actually moving stands, whatever the reason --
 // a jam, a queue, a blocked cast member -- and a reaction that is not carrying the body
 // anywhere holds a wary Guard instead of running on the spot. `fast` picks Run over Walk from
 // the same measured pace; left undefined it keeps each state's own clip.
 const locomotion=behaviour===STATE.NORMAL||behaviour===STATE.LOOK;
 const escaping=behaviour===STATE.AVOID||behaviour===STATE.FLEE;
 if(locomotion&&(waiting||!moving))return 'Idle';
 // Getting over a fright while walking back to where they were: the legs walk. Guard is a
 // standing pose, and playing it on a moving body slides it.
 if(behaviour===STATE.RECOVER&&moving)return fast?'Run':'Walk';
 if(escaping&&!moving)return 'Guard';
 if(locomotion||escaping)return (fast??escaping)?'Run':'Walk';
 return CLIP_FOR[behaviour];
}

/**
 * How long after a reaction has fully drained before the same citizen may be alarmed again.
 *
 * RUN 10. Without it, somebody standing next to a lingering player cycles LOOK, NORMAL, LOOK
 * forever: the hold timer drains the state, the threat is still there, and they notice it all
 * over again on the next pass. The cooldown is set HERE, where the drain happens, because the
 * awareness pass cannot see a transition it did not make.
 */
export const REACTION_COOLDOWN=1.15;

/**
 * Crossfade seconds between baked clips (claude/crowd-realism). A hit is sudden, so it blends
 * in almost at once; standing up off the ground is the slow one, and doubles as the get-up the
 * pack has no clip for; everything else -- Idle/Walk/Run, a flinch giving way to flight -- is
 * a quarter second, the usual locomotion blend.
 */
export const BLEND=Object.freeze({normal:.25,hit:.1,rise:.6});
/** A standing citizen who noticed something turns this far towards it, at this rate (rad, rad/s). */
export const LOOK_TURN=Object.freeze({max:.9,rate:2.6});
/**
 * RUN 12.4: the head, for someone who notices something while walking (the body keeps its
 * heading, or they would crab), and for the rest of a standing turn past LOOK_TURN.max. Only
 * the vertices above the neck turn, faded over `band` (fraction of the body's height) so the
 * neck bends rather than tears; the pivot is the neck itself, carried by its own bone.
 */
export const HEAD_TURN=Object.freeze({max:.75,rate:3.2,neck:.845,band:.035});

/** How long a state lasts before it can give way, in seconds. 0 means "until told". */
export const STATE_HOLD=Object.freeze({
 [STATE.NORMAL]:0,[STATE.LOOK]:.5,[STATE.STARTLE]:.55,[STATE.AVOID]:.9,[STATE.FLEE]:1.5,
 [STATE.HIT]:.45,[STATE.KNOCKDOWN]:1.4,[STATE.DOWNED]:2.5,[STATE.RECOVER]:1.2
});

const PACK=c=>((c>>16)&255)*65536+((c>>8)&255)*256+(c&255);

/**
 * Standard skinning, with the bone matrices read from a texture instead of a Skeleton.
 *
 * three's own skinning uniform-block holds one skeleton; a crowd needs two hundred different
 * poses in the same draw call, so the matrices move into a texture indexed by (frame, bone)
 * and every instance picks its own row. That is the whole trick, and it is why nothing here
 * needs a Skeleton object.
 */
function installCrowdSkinning(material,atlas,size,{interpolate=true,neck=[1.5,.06]}={}){
 material.defines={...material.defines,HQ_CROWD:'1',...(interpolate?{HQ_LERP:'1'}:{})};
 material.onBeforeCompile=shader=>{
  shader.uniforms.boneAtlas={value:atlas};
  shader.uniforms.boneAtlasSize={value:size};
  shader.uniforms.crowdTime={value:0};
  shader.uniforms.crowdNeck={value:neck};
  material.userData.shader=shader;
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec2 aClip;     // x: first row of this clip in the atlas, y: how many rows
attribute vec2 aAnim;     // x: phase 0..1, y: playback rate (0 freezes on the phase)
attribute vec4 aPrev;     // the clip this one replaced: row, frames, phase, rate
attribute vec2 aBlend;    // x: crowd time the change happened, y: crossfade seconds (0: none)
attribute vec4 aPal;      // skin, top, bottom, hair -- each RGB packed into one float
// RUN 12.4: x is the shoe tint; y the head yaw (rad, about the neck). One slot for both: the
// crowd shader already fills the 16 vertex attributes WebGL guarantees, and a 17th fails to link.
attribute vec2 aShoe;
uniform vec2 crowdNeck;   // bind-pose neck height and fade band, model units
uniform sampler2D boneAtlas;
uniform vec2 boneAtlasSize;
uniform float crowdTime;
varying vec4 vPal;
varying float vShoe;
varying vec3 vGarm;       // Step A: bind-pose position, where the clothes' patterns are drawn

vec3 unpackRGB(float v){
 float r=floor(v/65536.0);
 float g=floor(mod(v,65536.0)/256.0);
 float b=mod(v,256.0);
 vec3 c=vec3(r,g,b)/255.0;
 // sRGB -> linear-sRGB, the SAME conversion THREE.Color applies when ColorManagement is on.
 //
 // This is the RUN 7C root cause. The palette is packed as an 8-bit sRGB hex, and the
 // renderer's working space is linear, so handing it straight to diffuseColor made every
 // colour too bright -- and NOT uniformly: measured against new THREE.Color(hex), a dark
 // navy #1c2028 came out 9.5x too bright, a mid grey 2.9x, and a cream top only 1.1x. Dark
 // clothing stopped reading as dark while light clothing looked nearly right, which is
 // exactly what a washed-out crowd is. The RUN 6.8 near characters were correct all along
 // because they pass their palette through THREE.Color, which does this for them.
 //
 // The conversion is done here rather than at pack time on purpose: a linear value for a
 // dark colour is about 0.012, and eight bits of that is three levels, which would band.
 // Eight bits of sRGB expanded here is what an sRGB texture does, and it has the precision
 // where the eye needs it.
 return mix(pow(c*0.9478672986+0.0521327014,vec3(2.4)),c*0.0773993808,step(c,vec3(0.04045)));
}
mat4 readBone(float row,float bone){
 vec2 inv=1.0/boneAtlasSize;
 float x0=bone*3.0;
 float y=(row+0.5)*inv.y;
 vec4 a=texture2D(boneAtlas,vec2((x0+0.5)*inv.x,y));
 vec4 b=texture2D(boneAtlas,vec2((x0+1.5)*inv.x,y));
 vec4 c=texture2D(boneAtlas,vec2((x0+2.5)*inv.x,y));
 return mat4(a.x,b.x,c.x,0.0,
             a.y,b.y,c.y,0.0,
             a.z,b.z,c.z,0.0,
             a.w,b.w,c.w,1.0);
}
mat4 sampleClip(vec2 clip,vec2 anim){
 float frames=max(1.0,clip.y);
 float t=fract(anim.x+crowdTime*anim.y);
 float f=t*frames;
 float f0=floor(f);
 float r0=clip.x+mod(f0,frames);
 mat4 m=
  readBone(r0,skinIndex.x)*skinWeight.x+
  readBone(r0,skinIndex.y)*skinWeight.y+
  readBone(r0,skinIndex.z)*skinWeight.z+
  readBone(r0,skinIndex.w)*skinWeight.w;
#ifdef HQ_LERP
 // Blend to the next baked row. Linear on matrices is not a rotation blend, but over one
 // frame of a 15-30 fps bake the error is far below what a crowd at four metres resolves,
 // and it costs half of what quaternion interpolation would.
 float r1=clip.x+mod(f0+1.0,frames);
 mat4 n=
  readBone(r1,skinIndex.x)*skinWeight.x+
  readBone(r1,skinIndex.y)*skinWeight.y+
  readBone(r1,skinIndex.z)*skinWeight.z+
  readBone(r1,skinIndex.w)*skinWeight.w;
 m=m*(1.0-(f-f0))+n*(f-f0);
#endif
 return m;
}
// claude/crowd-realism: a clip change used to switch rows on the spot, so Idle->Walk, a flinch,
// a fall and getting up all popped. The previous clip keeps playing underneath and is faded
// out over aBlend.y seconds; outside a blend only one clip is sampled.
mat4 crowdSkinMatrix(){
 mat4 m=sampleClip(aClip,aAnim);
 if(aBlend.y>0.0){
  float w=clamp((crowdTime-aBlend.x)/aBlend.y,0.0,1.0);
  if(w<1.0){w=w*w*(3.0-2.0*w);m=sampleClip(aPrev.xy,aPrev.zw)*(1.0-w)+m*w;}
 }
 return m;
}`);
  shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',
`#include <beginnormal_vertex>
 mat4 crowdBone=crowdSkinMatrix();
 objectNormal=mat3(crowdBone)*objectNormal;
 // RUN 12.4: turn the head. Weighted by bind-pose height, so it follows the neck through any clip.
 float crowdHeadW=aShoe.y==0.0?0.0:smoothstep(crowdNeck.x-crowdNeck.y,crowdNeck.x+crowdNeck.y,position.y);
 float crowdHa=aShoe.y*crowdHeadW,crowdHc=cos(crowdHa),crowdHs=sin(crowdHa);
 mat3 crowdHeadRot=mat3(crowdHc,0.0,-crowdHs, 0.0,1.0,0.0, crowdHs,0.0,crowdHc);
 vec3 crowdNeckAt=(crowdBone*vec4(0.0,crowdNeck.x,0.0,1.0)).xyz;
 objectNormal=crowdHeadRot*objectNormal;
 vPal=aPal;vShoe=aShoe.x;vGarm=position;`);
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
`#include <begin_vertex>
 transformed=(crowdBone*vec4(transformed,1.0)).xyz;
 transformed=crowdHeadRot*(transformed-crowdNeckAt)+crowdNeckAt;`);

  // The garment mask, exactly as RUN 6.8's near characters use it: four vertex-colour
  // channels choose between five surfaces, the shoe being whatever the four leave over.
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec4 vPal;
varying float vShoe;
varying vec3 vGarm;
${GARMENT_UNPACK_GLSL}${GARMENT_PATTERN_GLSL}vec3 unpackRGB(float v){
 float r=floor(v/65536.0);
 float g=floor(mod(v,65536.0)/256.0);
 float b=mod(v,256.0);
 vec3 c=vec3(r,g,b)/255.0;
 // sRGB -> linear-sRGB, the SAME conversion THREE.Color applies when ColorManagement is on.
 //
 // This is the RUN 7C root cause. The palette is packed as an 8-bit sRGB hex, and the
 // renderer's working space is linear, so handing it straight to diffuseColor made every
 // colour too bright -- and NOT uniformly: measured against new THREE.Color(hex), a dark
 // navy #1c2028 came out 9.5x too bright, a mid grey 2.9x, and a cream top only 1.1x. Dark
 // clothing stopped reading as dark while light clothing looked nearly right, which is
 // exactly what a washed-out crowd is. The RUN 6.8 near characters were correct all along
 // because they pass their palette through THREE.Color, which does this for them.
 //
 // The conversion is done here rather than at pack time on purpose: a linear value for a
 // dark colour is about 0.012, and eight bits of that is three levels, which would band.
 // Eight bits of sRGB expanded here is what an sRGB texture does, and it has the precision
 // where the eye needs it.
 return mix(pow(c*0.9478672986+0.0521327014,vec3(2.4)),c*0.0773993808,step(c,vec3(0.04045)));
}`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
 float wShoe=max(0.0,1.0-vColor.r-vColor.g-vColor.b-vColor.a);
 // Step A: the top and bottom carry a pattern id in their top three bits (7-bit colour).
 // Evaluated unconditionally: fwidth() inside a branch is undefined.
 vec3 crowdTop=garmentPattern(unpackGarment(vPal.y),garmentId(vPal.y),vGarm);
 vec3 crowdBottom=garmentPattern(unpackGarment(vPal.z),garmentId(vPal.z),vGarm);
 diffuseColor.rgb=vColor.r*unpackRGB(vPal.x)+vColor.g*crowdTop
  +vColor.b*crowdBottom+vColor.a*unpackRGB(vPal.w)+wShoe*unpackRGB(vShoe);`);
  // The same per-garment roughness the near characters use (RUN 6.8). Without it every
  // surface is one number and skin, cotton, denim, hair and a shoe all read as the same
  // plastic -- which under the scene's tone mapping came out as a washed-out white crowd,
  // visibly different from the RUN 6.8 bodies standing next to them.
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
`#include <roughnessmap_fragment>
 roughnessFactor=vColor.r*0.62+vColor.g*0.86+vColor.b*0.80+vColor.a*0.52+wShoe*0.44;`);
 };
 material.customProgramCacheKey=()=>'hq-crowd-'+(interpolate?'lerp':'snap');
}

function geometryFrom(level,bin){
 const g=new BufferGeometry();
 const slice=(e,Ctor,size,normalized=false)=>new BufferAttribute(
  new Ctor(bin,e.byteOffset,e.count),size,normalized);
 g.setAttribute('position',slice(level.position,Float32Array,3));
 g.setAttribute('normal',slice(level.normal,Float32Array,3));
 g.setAttribute('skinIndex',slice(level.skinIndex,Uint8Array,4));
 g.setAttribute('skinWeight',slice(level.skinWeight,Uint8Array,4,true));
 g.setAttribute('color',slice(level.color,Uint8Array,4,true));
 g.setIndex(slice(level.index,level.indexType==='u32'?Uint32Array:Uint16Array,1));
 g.computeBoundingSphere();
 return g;
}

/**
 * Build the crowd.
 *
 * @param manifest public/data/crowd/hq-crowd.json
 * @param bin      its .bin, as an ArrayBuffer
 * @param capacity how many citizens each archetype may hold
 */
export function createHQCrowd(manifest,bin,{capacity=512,lod='L1',lods=null,interpolate=true}={}){
 // RUN 7B: a lane per (archetype, LOD). A citizen moves between LODs by changing lane, which
 // is a slot swap -- geometry, palette and phase all come with them, so nothing about who
 // they are depends on how far away they happen to be.
 const levels=lods??[lod];
 const root=new Group();root.name='hq-crowd';
 const atlasData=new Float32Array(bin,manifest.atlas.byteOffset,manifest.atlas.count);
 const atlas=new DataTexture(atlasData,manifest.atlas.width,manifest.atlas.height,
  RGBAFormat,FloatType);
 atlas.minFilter=atlas.magFilter=NearestFilter;
 atlas.generateMipmaps=false;atlas.needsUpdate=true;
 const atlasSize={x:manifest.atlas.width,y:manifest.atlas.height};

 const clips=new Map(manifest.clips.map(c=>[c.name,c]));
 const lanes=[];                       // one per archetype
 const scratch=new Object3D();

 for(const archetype of manifest.archetypes)for(const wanted of levels){
  const level=archetype.levels.find(l=>l.name===wanted)??archetype.levels[0];
  const geometry=geometryFrom(level,bin);
  const material=new MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:0});
  geometry.computeBoundingBox();
  const low=geometry.boundingBox.min.y,tall=Math.max(1e-3,geometry.boundingBox.max.y-low);
  installCrowdSkinning(material,atlas,atlasSize,{interpolate,neck:[low+tall*HEAD_TURN.neck,tall*HEAD_TURN.band]});
  const mesh=new InstancedMesh(geometry,material,capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled=false;mesh.count=0;
  mesh.name=`hq-crowd-${archetype.id}-${level.name}`;

  const clipAttr=new InstancedBufferAttribute(new Float32Array(capacity*2),2).setUsage(DynamicDrawUsage);
  const animAttr=new InstancedBufferAttribute(new Float32Array(capacity*2),2).setUsage(DynamicDrawUsage);
  const palAttr=new InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(DynamicDrawUsage);
  const shoeAttr=new InstancedBufferAttribute(new Float32Array(capacity*2),2).setUsage(DynamicDrawUsage);
  const prevAttr=new InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(DynamicDrawUsage);
  const blendAttr=new InstancedBufferAttribute(new Float32Array(capacity*2),2).setUsage(DynamicDrawUsage);
  geometry.setAttribute('aPrev',prevAttr);
  geometry.setAttribute('aBlend',blendAttr);
  geometry.setAttribute('aClip',clipAttr);
  geometry.setAttribute('aAnim',animAttr);
  geometry.setAttribute('aPal',palAttr);
  geometry.setAttribute('aShoe',shoeAttr);

  root.add(mesh);
  lanes.push({archetype,mesh,geometry,material,level,lod:level.name,
   clipAttr,animAttr,palAttr,shoeAttr,prevAttr,blendAttr,count:0,
   // slot -> citizen index, so a slot can be vacated by swapping the last one into it.
   owners:new Int32Array(capacity).fill(-1),
   triangles:level.triangles,vertices:level.vertices});
 }

 // ---- per-citizen state, as typed arrays -------------------------------------------
 //
 // No objects. A citizen is an index, and everything about them is a lane in a flat array,
 // so two thousand of them are a handful of allocations made once.
 const max=capacity*lanes.length;
 const state={
  id:new Int32Array(max),           // pedestrian id, for identity across everything
  lane:new Uint8Array(max),         // which archetype, and therefore which mesh
  slot:new Int32Array(max),         // index within that mesh
  x:new Float32Array(max),y:new Float32Array(max),z:new Float32Array(max),
  heading:new Float32Array(max),speed:new Float32Array(max),
  height:new Float32Array(max),width:new Float32Array(max),
  phase:new Float32Array(max),rate:new Float32Array(max),
  behaviour:new Uint8Array(max),    // STATE
  timer:new Float32Array(max),
  impulseX:new Float32Array(max),impulseZ:new Float32Array(max),impulseY:new Float32Array(max),
  fallen:new Float32Array(max),     // 0..1 how far into the ground pose
  health:new Uint8Array(max),
  // RUN 10 awareness. Three numbers per citizen, in the same arrays as everything else,
  // because a JS object per pedestrian is the thing this architecture exists to avoid.
  noticed:new Float32Array(max),    // seconds a threat has been present but not yet acted on
  ready:new Float32Array(max),      // crowd time before which this citizen will not re-alarm
  attention:new Float32Array(max),  // heading toward whatever they last noticed
  calmed:new Uint8Array(max),       // the reaction `ready` is cooling off from
  waiting:new Uint8Array(max),      // standing at a kerb for the signal: Idle, not Walk
  light:new Uint8Array(max),        // this HIT is a flinch that ends standing, not a knockdown
  after:new Uint8Array(max),        // the state a light HIT gives way to
  // claude/crowd-realism: the measured pace (src/life/pace.mjs) and the playback rate last
  // written, so a rate change can keep the pose continuous instead of jumping in the cycle.
  pace:new Float32Array(max),       // smoothed drawn ground speed, m/s
  paceX:new Float32Array(max),paceZ:new Float32Array(max), // ...and the smoothed velocity it comes from
  moving:new Uint8Array(max),       // hysteresis on `pace`: stepping, or standing
  fast:new Uint8Array(max),         // hysteresis on `pace`: Run rather than Walk
  animRate:new Float32Array(max),   // cycles per second currently in the attribute
  // The clip being faded out (see crowdSkinMatrix) and when that started, per citizen, so an
  // LOD move or a swap-remove carries a blend in progress with the body.
  clipRow:new Int16Array(max),prevRow:new Float32Array(max),prevFrames:new Float32Array(max),
  prevPhase:new Float32Array(max),prevRate:new Float32Array(max),
  blendStart:new Float32Array(max),blendDur:new Float32Array(max),
  look:new Float32Array(max),       // extra turn towards what a standing citizen noticed, rad
  head:new Float32Array(max)        // RUN 12.4: head yaw on top of it, rad
 };
 // The palette also lives here, not only in the instanced attribute, because moving a citizen
 // between LOD lanes has to rewrite it into the new lane and an attribute is write-mostly.
 const palette=new Float32Array(max*4),shoe=new Float32Array(max);
 let population=0;
 const byId=new Map();

 let clock=0;                       // the crowd time the GPU is animating against
 const stats={population:0,drawCalls:0,triangles:0,vertices:0,
  stateChanges:0,transformWrites:0,lanes:lanes.length,lod,
  byState:new Uint32Array(Object.keys(STATE).length),byArchetype:new Uint32Array(lanes.length)};

 const clipOf=name=>clips.get(name)??clips.values().next().value;
 const byRow=new Map(manifest.clips.map(c=>[c.row,c]));
 const clipOfRow=row=>byRow.get(row)??null;
 const nameOf=i=>clipFor(state.behaviour[i],state.waiting[i],!!state.moving[i],!!state.fast[i]);
 /** Cycles per second citizen `i` should play `clip` at. */
 function rateOf(i,name,clip){
  if(state.behaviour[i]===STATE.DOWNED)return 0;      // frozen states hold a single pose
  // Walk and Run: stride / measured ground speed, so the planted foot stays planted. Everything
  // else plays at its authored rate with the citizen's own small offset, so a row of idlers is
  // not a chorus line.
  return cadence(name,clip.duration,state.pace[i])??state.rate[i]/Math.max(.01,clip.duration);
 }

 const fallRow=clips.get('Fall')?.row??-1;
 /**
  * How long to crossfade into `name` from the clip at row `from`. claude/crowd-realism.
  * Being hit is sudden; getting up off the ground is not; everything else is a quarter second.
  */
 function blendFor(from,name){
  if(name==='Fall'||name==='Startle')return BLEND.hit;
  if(from===fallRow)return BLEND.rise;
  return BLEND.normal;
 }
 const frac=v=>v-Math.floor(v);

 function writeClip(i,{continuous=true}={}){
  const lane=lanes[state.lane[i]],slot=state.slot[i];
  const name=nameOf(i),clip=clipOf(name);
  const old=state.clipRow[i],changed=continuous&&old>=0&&old!==clip.row;
  if(changed){
   // Keep the outgoing clip playing exactly as it was, and fade it out from now.
   state.prevRow[i]=old;state.prevFrames[i]=clipOfRow(old)?.frames??clip.frames;
   state.prevPhase[i]=state.phase[i];state.prevRate[i]=state.animRate[i];
   state.blendStart[i]=clock;state.blendDur[i]=blendFor(old,name);
  }else if(!continuous){state.blendDur[i]=0;}
  let rate;
  if(state.behaviour[i]===STATE.DOWNED&&name==='Fall'){
   // Lying still means the LAST frame of the fall, not wherever the fall had got to.
   rate=0;state.phase[i]=(clip.frames-1)/clip.frames;
  }else if(clip.loop===false){
   if(changed||!continuous||old<0){
    // A one-shot starts at its first frame, and is timed to finish as the state that plays it
    // does -- a fall lands as KNOCKDOWN gives way to DOWNED, a flinch ends with its HIT -- and
    // never wraps round to play its opening again. Bounded to 0.5-2x its authored speed.
    const hold=state.timer[i]>0?state.timer[i]:clip.duration,natural=1/clip.duration;
    rate=Math.max(natural*.5,Math.min(natural*2,.97/Math.max(.1,hold)));
    state.phase[i]=frac(-clock*rate);
   }else rate=state.animRate[i];
  }else{
   rate=rateOf(i,name,clip);
   // A rewrite that does not change the rate noticeably (an LOD move, a waiting flag) keeps the
   // exact rate, so it cannot nudge the cycle at all.
   if(continuous&&!changed&&Math.abs(rate-state.animRate[i])<=Math.max(.02,state.animRate[i]*.05))rate=state.animRate[i];
   // The shader plays fract(phase + time * rate). Changing the rate alone would jump the pose
   // to wherever the new rate would have been by now; shifting the phase keeps it where it is.
   if(continuous)state.phase[i]=frac(state.phase[i]+clock*(state.animRate[i]-rate));
  }
  state.animRate[i]=rate;state.clipRow[i]=clip.row;
  lane.clipAttr.setXY(slot,clip.row,clip.frames);
  lane.animAttr.setXY(slot,state.phase[i],rate);
  lane.prevAttr.setXYZW(slot,state.prevRow[i],state.prevFrames[i],state.prevPhase[i],state.prevRate[i]);
  lane.blendAttr.setXY(slot,state.blendStart[i],state.blendDur[i]);
  lane.clipAttr.needsUpdate=true;lane.animAttr.needsUpdate=true;
  lane.prevAttr.needsUpdate=true;lane.blendAttr.needsUpdate=true;
 }

 return {
  root,state,stats,lanes,
  get population(){return population;},
  clips:manifest.clips,
  archetypes:manifest.archetypes,

  /** Put a citizen in the crowd. `look` is an appearance from src/life/appearance.mjs. */
  spawn(id,look,laneIndex,{x=0,y=0,z=0,heading=0,speed=0}={}){
   if(byId.has(id))return byId.get(id);
   const lane=lanes[laneIndex];
   if(!lane||lane.count>=lane.mesh.instanceMatrix.count)return -1;
   const i=population++;
   const slot=lane.count++;
   state.id[i]=id;state.lane[i]=laneIndex;state.slot[i]=slot;lane.owners[slot]=i;
   state.x[i]=x;state.y[i]=y;state.z[i]=z;
   state.heading[i]=heading;state.speed[i]=speed;
   state.height[i]=look.height;state.width[i]=look.width;
   // Phase and rate come from the pedestrian id, never from a random number and never from
   // the frame: the same person always walks on the same foot, and a row of citizens is not
   // a chorus line.
   const h=Math.abs(Math.imul(id|0,0x9e3779b1))>>>0;
   state.phase[i]=((h>>>8)&1023)/1023;
   state.rate[i]=.88+((h>>>18)&255)/255*.24;
   state.pace[i]=Math.max(0,speed);state.paceX[i]=Math.sin(heading)*state.pace[i];state.paceZ[i]=Math.cos(heading)*state.pace[i];state.moving[i]=speed>PACE.stopBelow?1:0;
   state.fast[i]=speed>PACE.strollTop?1:0;state.animRate[i]=0;
   state.clipRow[i]=-1;state.blendDur[i]=0;state.look[i]=0;state.head[i]=0;state.prevRow[i]=0;state.prevFrames[i]=1;state.prevPhase[i]=0;state.prevRate[i]=0;
   state.behaviour[i]=STATE.NORMAL;state.timer[i]=0;
   state.noticed[i]=0;state.ready[i]=0;state.attention[i]=0;state.calmed[i]=0;state.waiting[i]=0;state.light[i]=0;state.after[i]=0;
   state.health[i]=100;state.fallen[i]=0;
   state.impulseX[i]=state.impulseZ[i]=state.impulseY[i]=0;
   palette[i*4]=PACK(look.skin);palette[i*4+1]=packGarment(look.top,look.topPattern??0);
   palette[i*4+2]=packGarment(look.bottom,look.bottomPattern??0);palette[i*4+3]=PACK(look.hairColour);
   shoe[i]=PACK(look.shoe);
   lane.palAttr.setXYZW(slot,palette[i*4],palette[i*4+1],palette[i*4+2],palette[i*4+3]);
   lane.shoeAttr.setX(slot,shoe[i]);
   lane.palAttr.needsUpdate=true;lane.shoeAttr.needsUpdate=true;
   writeClip(i,{continuous:false});
   byId.set(id,i);
   return i;
  },

  indexOf(id){return byId.has(id)?byId.get(id):-1;},

  /**
   * Take a citizen out of the crowd.
   *
   * Two swap-removes: one in the lane, so `mesh.count` stays the number actually drawn, and
   * one in the state arrays, so `population` stays the number actually held. Without this a
   * layer that keeps re-choosing who to draw only ever grows: instances drop out of the
   * budget, stop being positioned, and are still rendered -- frozen bodies standing in the
   * street next to the legacy pedestrian they were supposed to replace.
   */
  release(id){
   const i=byId.get(id);
   if(i===undefined)return false;
   const lane=lanes[state.lane[i]],slot=state.slot[i],lastSlot=lane.count-1;
   if(slot!==lastSlot){
    const moved=lane.owners[lastSlot];
    lane.palAttr.setXYZW(slot,lane.palAttr.getX(lastSlot),lane.palAttr.getY(lastSlot),
     lane.palAttr.getZ(lastSlot),lane.palAttr.getW(lastSlot));
    lane.shoeAttr.setX(slot,lane.shoeAttr.getX(lastSlot));
    lane.clipAttr.setXY(slot,lane.clipAttr.getX(lastSlot),lane.clipAttr.getY(lastSlot));
    lane.animAttr.setXY(slot,lane.animAttr.getX(lastSlot),lane.animAttr.getY(lastSlot));
    lane.prevAttr.setXYZW(slot,lane.prevAttr.getX(lastSlot),lane.prevAttr.getY(lastSlot),lane.prevAttr.getZ(lastSlot),lane.prevAttr.getW(lastSlot));
    lane.blendAttr.setXY(slot,lane.blendAttr.getX(lastSlot),lane.blendAttr.getY(lastSlot));
    lane.prevAttr.needsUpdate=lane.blendAttr.needsUpdate=true;
    lane.owners[slot]=moved;
    if(moved>=0)state.slot[moved]=slot;
    lane.palAttr.needsUpdate=lane.shoeAttr.needsUpdate=true;
    lane.clipAttr.needsUpdate=lane.animAttr.needsUpdate=true;
   }
   lane.owners[lastSlot]=-1;lane.count--;
   byId.delete(id);
   const last=population-1;
   if(i!==last){
    for(const key of Object.keys(state))state[key][i]=state[key][last];
    for(let k=0;k<4;k++)palette[i*4+k]=palette[last*4+k];
    shoe[i]=shoe[last];
    byId.set(state.id[i],i);
    lanes[state.lane[i]].owners[state.slot[i]]=i;
   }
   population--;
   return true;
  },

  /** Which lane holds a given archetype at a given LOD, or -1. */
  laneFor(archetypeId,lodName){
   return lanes.findIndex(l=>l.archetype.id===archetypeId&&l.lod===lodName);
  },

  /**
   * Move a citizen to another lane -- in practice, another level of detail.
   *
   * Swap-remove from the old lane: the last instance is moved into the vacated slot and its
   * owner is told where it went, so the lane stays densely packed and `mesh.count` remains
   * the number actually drawn. Everything that makes a citizen who they are -- palette,
   * phase, clip, height, build -- is rewritten into the new lane from their own state, so an
   * LOD change cannot alter their appearance or restart their walk cycle.
   */
  moveLane(i,laneIndex){
   if(i<0||i>=population)return false;
   const from=lanes[state.lane[i]],to=lanes[laneIndex];
   if(!to||from===to)return false;
   if(to.count>=to.mesh.instanceMatrix.count)return false;
   const slot=state.slot[i],last=from.count-1;
   if(slot!==last){
    const moved=from.owners[last];
    // Carry the last instance's attributes into the hole it is filling.
    from.palAttr.setXYZW(slot,from.palAttr.getX(last),from.palAttr.getY(last),
     from.palAttr.getZ(last),from.palAttr.getW(last));
    from.shoeAttr.setX(slot,from.shoeAttr.getX(last));
    from.clipAttr.setXY(slot,from.clipAttr.getX(last),from.clipAttr.getY(last));
    from.animAttr.setXY(slot,from.animAttr.getX(last),from.animAttr.getY(last));
    from.prevAttr.setXYZW(slot,from.prevAttr.getX(last),from.prevAttr.getY(last),from.prevAttr.getZ(last),from.prevAttr.getW(last));
    from.blendAttr.setXY(slot,from.blendAttr.getX(last),from.blendAttr.getY(last));
    from.prevAttr.needsUpdate=from.blendAttr.needsUpdate=true;
    from.owners[slot]=moved;
    if(moved>=0)state.slot[moved]=slot;
    from.palAttr.needsUpdate=from.shoeAttr.needsUpdate=true;
    from.clipAttr.needsUpdate=from.animAttr.needsUpdate=true;
   }
   from.owners[last]=-1;from.count--;
   const target=to.count++;
   state.lane[i]=laneIndex;state.slot[i]=target;to.owners[target]=i;
   to.palAttr.setXYZW(target,palette[i*4],palette[i*4+1],palette[i*4+2],palette[i*4+3]);
   to.shoeAttr.setX(target,shoe[i]);
   to.palAttr.needsUpdate=to.shoeAttr.needsUpdate=true;
   writeClip(i);
   return true;
  },

  /** Move a citizen. Cheap enough to call for everyone, every frame. */
  place(i,x,y,z,heading,speed){
   state.x[i]=x;state.y[i]=y;state.z[i]=z;
   state.heading[i]=heading;
   if(speed!==undefined&&speed!==state.speed[i]){state.speed[i]=speed;}
  },

  /**
   * Change what a citizen is doing.
   *
   * This is the ONLY per-citizen CPU work a reaction costs: one integer, one timer, and four
   * floats of instanced attribute. It is what makes "thirty people react at once" cost the
   * same as thirty writes rather than thirty skeletons.
   */
  /** Waiting at a kerb for the signal, or not. Rewrites the clip only when it changes. */
  setWaiting(i,on){
   if(i<0||i>=population)return false;
   const v=on?1:0;
   if(state.waiting[i]===v)return false;
   state.waiting[i]=v;writeClip(i);
   return true;
  },
  /** The clip a held citizen is playing, by name. For QA and tests. */
  clipName(i){return i<0||i>=population?null:nameOf(i);},
  /** Cycles per second the GPU is playing citizen `i` at. For QA and tests. */
  animRate(i){return i<0||i>=population?null:state.animRate[i];},

  /**
   * Feed the body's drawn displacement (dx, dz) this frame (src/life/pace.mjs). Switches Idle / Walk /
   * Run on the measured pace with hysteresis, and keeps a locomotion clip's cadence on the
   * ground speed. Only touches the attribute when something visible changes.
   */
  pace(i,dx,dz,dt){
   if(i<0||i>=population||!(dt>0))return false;
   const got=paceStep(state.paceX[i],state.paceZ[i],!!state.moving[i],dx,dz,dt);
   state.paceX[i]=got.vx;state.paceZ[i]=got.vz;state.pace[i]=got.speed;
   const moving=got.moving?1:0;
   const b=state.behaviour[i],top=b===STATE.NORMAL||b===STATE.LOOK?PACE.strollTop:PACE.walkTop;
   const fast=state.fast[i]?(got.speed>top-.25?1:0):(got.speed>top+.25?1:0);
   if(moving!==state.moving[i]||fast!==state.fast[i]){state.moving[i]=moving;state.fast[i]=fast;writeClip(i);return true;}
   const name=nameOf(i),clip=clipOf(name);
   if(clip.loop===false||state.behaviour[i]===STATE.DOWNED)return false;
   const rate=rateOf(i,name,clip),old=state.animRate[i];
   if(Math.abs(rate-old)>Math.max(.02,old*.05)){writeClip(i);return true;}
   return false;
  },

  /**
   * Put a thrown body where the simulation's flight has it, arc height included, and drop
   * the crowd's own impulse so the two never pull it different ways. RUN 11.1.
   */
  follow(i,x,y,z){
   if(i<0||i>=population)return false;
   state.x[i]=x;state.y[i]=y;state.z[i]=z;
   state.impulseX[i]=state.impulseZ[i]=state.impulseY[i]=0;
   return true;
  },
  /**
   * Keep the current state from draining for at least `seconds` more. For a body whose end the
   * simulation decides rather than this timer -- someone it is still holding on the ground.
   */
  hold(i,seconds){
   if(i<0||i>=population)return false;
   if(state.timer[i]<seconds)state.timer[i]=seconds;
   return true;
  },

  setState(i,behaviour,{impulseX=0,impulseZ=0,impulseY=0,force=false,light=false,hold,then=STATE.NORMAL}={}){
   if(i<0||i>=population)return false;
   if(!force&&state.timer[i]>0&&priority(behaviour)<priority(state.behaviour[i]))return false;
   if(state.behaviour[i]===behaviour&&!force)return false;
   state.behaviour[i]=behaviour;
   state.timer[i]=hold??STATE_HOLD[behaviour]??0;
   // RUN 11.1/11.2: a LIGHT hit is a flinch or a stumble and ends on the feet. Without it every
   // HIT drained into KNOCKDOWN, so a shove from a creeping car or a jab floored everyone.
   state.light[i]=behaviour===STATE.HIT&&light?1:0;
   // ...and what a light hit gives way to: NORMAL, or the fear or retreat it provoked (RUN 11.2).
   state.after[i]=behaviour===STATE.HIT&&light?then:STATE.NORMAL;
   if(behaviour===STATE.KNOCKDOWN||behaviour===STATE.HIT){
    state.impulseX[i]=impulseX;state.impulseZ[i]=impulseZ;state.impulseY[i]=impulseY;
   }
   if(behaviour===STATE.NORMAL)state.fallen[i]=0;
   writeClip(i);
   stats.stateChanges++;
   return true;
  },

  /**
   * Advance timers, carry anyone who is falling, and write the transforms.
   *
   * Animation is NOT advanced here -- the GPU does that from the phase and the clock. What
   * this loop does is arithmetic on flat arrays, which is why its cost per citizen is a few
   * nanoseconds rather than a mixer update.
   */
  update(dt,{time=0}={}){
   const start=(typeof performance!=='undefined'?performance.now():0);
   clock=time;
   stats.byState.fill(0);stats.byArchetype.fill(0);
   let writes=0;
   for(const lane of lanes){
    const shader=lane.material.userData.shader;
    if(shader)shader.uniforms.crowdTime.value=time;
   }
   for(let i=0;i<population;i++){
    const behaviour=state.behaviour[i];
    if(state.timer[i]>0){
     state.timer[i]-=dt;
     if(state.timer[i]<=0){
      // Knockdown settles into downed; downed waits to be recovered; everything else calms.
      // HIT -> KNOCKDOWN -> DOWNED -> RECOVER -> NORMAL. The chain must CLOSE.
      //
      // It did not: DOWNED was excluded from the fall-through on the theory that it "waits to
      // be recovered", and nothing ever recovered it. Over 240 simulated seconds that left
      // 132 bodies permanently DOWNED and permanently disowned from their own routes --
      // stale state that only grows, which is precisely what a long-running crossing must not
      // accumulate. A body now gets up.
      //
      // RUN 10 added one link: FLEE drains through RECOVER rather than straight to NORMAL.
      // Somebody who has just run from something does not resume strolling on the same
      // frame they stop, and RECOVER is the state that already means "wary, getting over
      // it". Every awareness state still ends at NORMAL; none of them is terminal.
      const next=behaviour===STATE.HIT?(state.light[i]?state.after[i]:STATE.KNOCKDOWN)
       :behaviour===STATE.KNOCKDOWN?STATE.DOWNED
       :behaviour===STATE.DOWNED?STATE.RECOVER
       :behaviour===STATE.FLEE?STATE.RECOVER
       :STATE.NORMAL;
      state.behaviour[i]=next;
      state.timer[i]=STATE_HOLD[next]??0;
      if(next===STATE.NORMAL){
       state.fallen[i]=0;state.noticed[i]=0;
       // Coming down off a reaction starts the cooldown. Anything above NORMAL was a
       // reaction to something, so the test is simply "was I doing something".
       if(behaviour!==STATE.NORMAL){
        state.ready[i]=REACTION_COOLDOWN;
        // ...for THIS reaction. RECOVER is the tail of a flight or a fall, so it counts as
        // the strongest thing awareness can ask for.
        state.calmed[i]=Math.min(behaviour,STATE.FLEE);
       }
      }
      writeClip(i);
     }
    }
    if(state.ready[i]>0)state.ready[i]=Math.max(0,state.ready[i]-dt);
    // A body that has been hit carries its own impulse and slides to a halt. No rigid body,
    // no ragdoll: an impulse, a drag, and a ground clamp, which is all a crowd needs to show
    // that a car went through it.
    if(state.impulseX[i]!==0||state.impulseZ[i]!==0||state.impulseY[i]!==0){
     state.x[i]+=state.impulseX[i]*dt;
     state.z[i]+=state.impulseZ[i]*dt;
     state.y[i]+=state.impulseY[i]*dt;
     state.impulseY[i]-=9.81*dt;
     if(state.y[i]<=0){state.y[i]=0;state.impulseY[i]=0;
      const drag=Math.max(0,1-6*dt);
      state.impulseX[i]*=drag;state.impulseZ[i]*=drag;
      if(Math.hypot(state.impulseX[i],state.impulseZ[i])<.05){state.impulseX[i]=0;state.impulseZ[i]=0;}
     }
     state.fallen[i]=Math.min(1,state.fallen[i]+dt*2.5);
    }
    stats.byState[behaviour]++;
    stats.byArchetype[state.lane[i]]++;

    const lane=lanes[state.lane[i]];
    const archetype=lane.archetype;
    const k=archetype.scaleToGame*state.height[i]/archetype.naturalHeight;
    scratch.position.set(state.x[i],state.y[i],state.z[i]);
    // claude/crowd-realism: someone standing who has noticed something turns towards it. LOOK
    // had no visible sign at all on this crowd (it borrows the locomotion clip and the head is
    // baked), so a witness across the road read as not reacting. Walkers keep their heading:
    // turning the whole body while stepping would crab-walk.
    {const b=state.behaviour[i],standing=!state.moving[i]&&(b===STATE.LOOK||b===STATE.STARTLE||b===STATE.RECOVER);
     let want=0;if(standing){const d=Math.atan2(Math.sin(state.attention[i]-state.heading[i]),Math.cos(state.attention[i]-state.heading[i]));want=Math.max(-LOOK_TURN.max,Math.min(LOOK_TURN.max,d));}
     const d=want-state.look[i],k=LOOK_TURN.rate*dt;state.look[i]+=Math.abs(d)<=k?d:Math.sign(d)*k;
     // RUN 12.4: the head does what the body may not -- all of it for a walker, the rest past
     // the body's limit for someone standing. Nothing for anyone in a physical state.
     const noticing=b===STATE.LOOK||b===STATE.STARTLE||b===STATE.RECOVER;let head=0;
     if(noticing){const toward=Math.atan2(Math.sin(state.attention[i]-state.heading[i]),Math.cos(state.attention[i]-state.heading[i]));
      head=Math.max(-HEAD_TURN.max,Math.min(HEAD_TURN.max,toward-state.look[i]));}
     const dh=head-state.head[i],kh=HEAD_TURN.rate*dt;state.head[i]+=Math.abs(dh)<=kh?dh:Math.sign(dh)*kh;
     lane.shoeAttr.setY(state.slot[i],state.head[i]);}
    scratch.rotation.set(0,state.heading[i]+state.look[i],0);
    scratch.scale.set(k*state.width[i],k,k*state.width[i]);
    scratch.updateMatrix();
    lane.mesh.setMatrixAt(state.slot[i],scratch.matrix);
    writes++;
   }
   let triangles=0,vertices=0,draws=0;
   for(const lane of lanes){
    lane.mesh.count=lane.count;
    lane.mesh.instanceMatrix.needsUpdate=true;
    if(lane.count)lane.shoeAttr.needsUpdate=true;
    if(lane.count){draws++;triangles+=lane.count*lane.triangles;vertices+=lane.count*lane.vertices;}
   }
   stats.population=population;stats.drawCalls=draws;
   stats.triangles=triangles;stats.vertices=vertices;stats.transformWrites=writes;
   stats.updateMs=(typeof performance!=='undefined'?performance.now():0)-start;
   return stats;
  },

  inspect(){
   const byLod={};for(const l of lanes)byLod[l.lod]=(byLod[l.lod]??0)+l.count;
   return {population,lod,lods:levels,byLod,drawCalls:stats.drawCalls,triangles:stats.triangles,
    vertices:stats.vertices,updateMs:Number((stats.updateMs??0).toFixed(3)),
    stateChanges:stats.stateChanges,
    skeletons:0,mixers:0,
    byState:Object.fromEntries(Object.entries(STATE).map(([k,v])=>[k,stats.byState[v]])),
    byArchetype:Object.fromEntries(lanes.map((l,i)=>[l.archetype.name,stats.byArchetype[i]]))};
  },

  dispose(){
   for(const lane of lanes){lane.geometry.dispose();lane.material.dispose();
    lane.mesh.dispose?.();lane.mesh.removeFromParent();}
   atlas.dispose();root.removeFromParent();root.clear();
   population=0;byId.clear();
  }
 };
}
