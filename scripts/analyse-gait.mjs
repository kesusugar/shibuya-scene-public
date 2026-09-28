// What each locomotion clip actually does with its feet.
//
// RUN 2 measured one number per clip -- the speed its root travels in the root-motion variant
// of the library -- and that was enough to stop the figure playing every cycle at one rate. It
// is not enough to blend two cycles together. For that you need to know when each foot is on
// the ground, because two clips blended out of phase put a character on three legs.
//
// So this samples the foot bones through each clip and reads the contacts off them: a foot is
// planted while it is near its own lowest point and not moving forward relative to the body.
// Everything else -- cadence, stride, duty factor, which foot leads -- falls out of that.
//
// Run: node scripts/analyse-gait.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};

const MODEL='public/data/character/citizen.glb';
const REPORT='public/data/character/citizen.json';
const SAMPLES=120;

const bytes=readFileSync(MODEL);
const report=JSON.parse(readFileSync(REPORT,'utf8'));
const gltf=await new Promise((res,rej)=>new GLTFLoader()
 .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));

const root=gltf.scene;
const mixer=new T.AnimationMixer(root);
let skeleton=null;
root.traverse(o=>{if(o.isSkinnedMesh&&!skeleton)skeleton=o.skeleton;});
const bone=name=>skeleton.bones.find(b=>b.name===name);
const feet={left:bone('ball_l'),right:bone('ball_r')};
const hips=bone('pelvis');

/** Sample one clip at `SAMPLES` phases and record where each foot is, in hip-local space. */
function sample(clip){
 const action=mixer.clipAction(clip);
 mixer.stopAllAction();action.reset().play();
 const frames=[];
 for(let i=0;i<SAMPLES;i++){
  action.time=i/SAMPLES*clip.duration;
  mixer.update(0);
  root.updateMatrixWorld(true);
  const origin=new T.Vector3().setFromMatrixPosition(hips.matrixWorld);
  const at=node=>{const v=new T.Vector3().setFromMatrixPosition(node.matrixWorld);return v.sub(origin);};
  frames.push({t:i/SAMPLES,left:at(feet.left),right:at(feet.right)});
 }
 mixer.stopAllAction();
 return frames;
}

/**
 * Which phases a foot is planted.
 *
 * Height alone is unreliable -- a foot passing through the bottom of its swing dips as low as
 * a planted one for an instant -- so a contact also has to be travelling backwards relative to
 * the hips, which is what a foot does only while it is carrying the body over it.
 */
function contacts(frames,side){
 const heights=frames.map(f=>f[side].y);
 const low=Math.min(...heights),high=Math.max(...heights);
 const floor=low+(high-low)*.28;
 const planted=frames.map((f,i)=>{
  const next=frames[(i+1)%frames.length][side].z;
  return f[side].y<=floor&&next-f[side].z<=1e-4;
 });
 // Collect runs, joining one that wraps past the end of the cycle.
 const runs=[];let start=null;
 for(let i=0;i<planted.length*2;i++){
  const on=planted[i%planted.length];
  if(on&&start===null)start=i;
  else if(!on&&start!==null){if(start<planted.length)runs.push([start,i]);start=null;}
  if(i>=planted.length&&start===null&&runs.length)break;
 }
 if(!runs.length)return null;
 const longest=runs.reduce((a,b)=>(b[1]-b[0]>a[1]-a[0]?b:a));
 return {
  from:longest[0]/frames.length,
  to:longest[1]/frames.length,
  duty:(longest[1]-longest[0])/frames.length
 };
}

/**
 * How far the ankle joint sits above the sole, in the idle pose.
 *
 * The solver does not read this: it corrects a foot by the *difference* between the surface
 * under it and the surface the body stands on, and a difference is indifferent to how tall an
 * ankle is. What needs it is measurement -- `qa/gta-upgrade/footikbench.html` reports how far
 * each sole is from the pavement, and it can only do that if it knows where the sole is
 * relative to the joint it can see. It is a property of the model, so it is measured here
 * rather than left as a constant somebody has to remember to change.
 */
function ankleHeight(){
 const idle=gltf.animations.find(c=>c.name==='Idle');
 if(idle){const action=mixer.clipAction(idle);mixer.stopAllAction();action.reset().play();
  action.time=0;mixer.update(0);}
 root.updateMatrixWorld(true);
 let low=Infinity;const p=new T.Vector3();
 root.traverse(o=>{
  if(!o.isSkinnedMesh)return;
  o.skeleton.update();
  const position=o.geometry.attributes.position;
  for(let i=0;i<position.count;i++){
   p.fromBufferAttribute(position,i);o.applyBoneTransform(i,p);o.localToWorld(p);
   low=Math.min(low,p.y);
  }
 });
 const ankle=bone('foot_l');ankle.updateWorldMatrix(true,false);
 const y=new T.Vector3().setFromMatrixPosition(ankle.matrixWorld).y;
 mixer.stopAllAction();
 return Number((y-low).toFixed(4));
}

const rows=[];
for(const entry of report.clips){
 const clip=gltf.animations.find(c=>c.name===entry.name);
 if(!clip||!report.gait[entry.name])continue;
 const frames=sample(clip);
 const left=contacts(frames,'left'),right=contacts(frames,'right');
 if(!left||!right)continue;
 const speed=report.gait[entry.name];
 // Stride is what one full cycle covers; a cycle is two steps, one per foot.
 const stride=speed*clip.duration;
 const cadence=2/clip.duration*60;         // steps per minute
 // How far apart the two contacts are in the cycle. Half is a symmetric gait; anything else
 // is a limp, and blending two clips whose offsets disagree produces one.
 let offset=right.from-left.from;
 if(offset<0)offset+=1;
 rows.push({clip:entry.name,upstream:entry.upstream,
  seconds:Number(clip.duration.toFixed(3)),speed,
  stride:Number(stride.toFixed(3)),
  step:Number((stride/2).toFixed(3)),
  cadence:Number(cadence.toFixed(1)),
  leftContact:[Number(left.from.toFixed(3)),Number(left.to.toFixed(3))],
  rightContact:[Number(right.from.toFixed(3)),Number(right.to.toFixed(3))],
  duty:Number(((left.duty+right.duty)/2).toFixed(3)),
  contactOffset:Number(offset.toFixed(3)),
  airborne:Number(Math.max(0,1-left.duty-right.duty).toFixed(3))});
}

// Written back into the asset's own report rather than to a second file, so the runtime gets
// it from the fetch it already makes and there is one place that describes this character.
report.gaitDetail={samples:SAMPLES,measured:new Date().toISOString().slice(0,10),
 ankleHeight:ankleHeight(),
 clips:Object.fromEntries(rows.map(r=>[r.clip,{
  seconds:r.seconds,speed:r.speed,stride:r.stride,step:r.step,cadence:r.cadence,
  duty:r.duty,airborne:r.airborne,contactOffset:r.contactOffset,
  // Where the left foot plants, as a fraction of the cycle. Clips are aligned on this, so a
  // blend cannot put one clip's left foot down while another's is swinging.
  leftContact:r.leftContact[0]}]))};
writeFileSync(REPORT,JSON.stringify(report,null,1)+'\n');
const pad=(v,n)=>String(v).padStart(n);
console.log('ankle above sole:',report.gaitDetail.ankleHeight,'m');
console.log('clip     upstream           dur    m/s  stride   step  cadence  duty  air  L contact      R contact     offset');
for(const r of rows)console.log(
 r.clip.padEnd(8),r.upstream.padEnd(18),pad(r.seconds,5),pad(r.speed,6),pad(r.stride,7),pad(r.step,6),
 pad(r.cadence,8),pad(r.duty,5),pad(r.airborne,4),
 ' ['+r.leftContact.join(', ')+']',' ['+r.rightContact.join(', ')+']',pad(r.contactOffset,6));
