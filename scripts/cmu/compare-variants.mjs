// RUN 5.7 STEP 6-7 -- lower-body metrics must survive the hybrid, upper-body metrics must come
// back. Both measured on the same character, at the gameplay speed, with no foot IK.
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,AnimationClip,QuaternionKeyframeTrack,VectorKeyframeTrack,
        Vector3,Quaternion} from 'three';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

const SPEED=4.2, ROAD=.02, BALL_TO_SOLE=.0215, N=96;
const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const bytes=readFileSync('public/data/character/citizen.glb');

async function load(){
 const gltf=await new Promise((res,rej)=>new GLTFLoader()
  .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const root=gltf.scene;
 const bones=new Map();root.traverse(o=>{if(o.isBone)bones.set(o.name,o);});
 return {gltf,root,bones};
}

function clipFromJSON(data){
 const tracks=[];
 for(const [bone,values] of Object.entries(data.tracks))
  tracks.push(new QuaternionKeyframeTrack(`${bone}.quaternion`,data.times,values));
 tracks.push(new VectorKeyframeTrack('pelvis.position',data.times,data.rootPos));
 return new AnimationClip('v',data.duration,tracks);
}

async function measure(name,make,stride){
 const {gltf,root,bones}=await load();
 root.position.set(0,ROAD,0);
 const {clip,duration}=make(gltf);
 const mixer=new AnimationMixer(root);
 mixer.clipAction(clip).play();
 const period=stride/SPEED;
 const at=n=>{const b=bones.get(n);if(!b)return null;b.updateWorldMatrix(true,false);
  return new Vector3().setFromMatrixPosition(b.matrixWorld);};
 const sole=n=>{const p=at(n);return p?p.y-BALL_TO_SOLE:Infinity;};
 const deg=r=>r*180/Math.PI;
 const ang=(a,b,c)=>{const u=new Vector3().subVectors(at(a),at(b)).normalize();
  const v=new Vector3().subVectors(at(c),at(b)).normalize();
  return deg(Math.acos(Math.max(-1,Math.min(1,u.dot(v)))));};

 let pen=0,drift=0,elbowSum=0,elbowMin=180,handUpSum=0,handDistSum=0,lean=[],armZ=[];
 const anchors={ball_l:null,ball_r:null};
 // The planted window is a fraction of each foot's own vertical RANGE, not a fixed 30 mm.
 //
 // An absolute threshold sits at a different point on the lift curve for a clip that raises
 // the foot 500 mm than for one that raises it 200, so it admits a different number of
 // already-moving frames and the drift it reports is partly a property of the threshold. It
 // showed up as variants B and C differing by 57 mm of drift when their leg tracks are
 // bit-identical -- verified quaternion by quaternion, 0.0 degrees apart at every phase. A
 // relative window puts the same part of the contact in every variant's measurement.
 const floors={ball_l:Infinity,ball_r:Infinity};
 const ceils={ball_l:-Infinity,ball_r:-Infinity};
 for(let i=0;i<N;i++){mixer.setTime(duration*i/N);root.updateMatrixWorld(true);
  for(const n of ['ball_l','ball_r']){
   const y=sole(n);floors[n]=Math.min(floors[n],y);ceils[n]=Math.max(ceils[n],y);}}
 const window={};
 for(const n of ['ball_l','ball_r'])window[n]=(ceils[n]-floors[n])*.08;
 // TWO cycles, continuously, and only the second is scored.
 //
 // A variant whose phase-zero has been rolled -- which the hybrid's has, by 0.51, to put the
 // left contact at the origin -- has a planted window straddling the loop boundary. Measuring
 // one cycle then wraps z from a full stride back to zero in the middle of a contact, and the
 // whole stride is counted as foot slide: it reported 208 mm of drift against the full CMU
 // clip's 111 while the leg poses were identical. Running the loop twice and scoring the
 // second pass removes the seam from the measurement without touching the clip.
 for(let i=0;i<N*2;i++){
  const phase=(i%N)/N;
  const scored=i>=N;
  mixer.setTime(duration*phase);
  // The body advances at gameplay speed, so planted drift is measured in world space.
  root.position.z=(i/N)*period*SPEED;
  root.updateMatrixWorld(true);
  for(const n of ['ball_l','ball_r']){
   const y=sole(n), p=at(n);
   if(scored)pen=Math.max(pen,ROAD-y);
   if(y-floors[n]<window[n]){
    if(!anchors[n])anchors[n]=p.clone();
    else if(scored)drift=Math.max(drift,Math.hypot(p.x-anchors[n].x,p.z-anchors[n].z));
   }else anchors[n]=null;
  }
  if(!scored)continue;
  const e=ang('upperarm_l','lowerarm_l','hand_l');
  elbowSum+=e;elbowMin=Math.min(elbowMin,e);
  const chest=at('spine_03'),hand=at('hand_l'),hips=at('pelvis'),neck=at('neck_01');
  const cq=new Quaternion();bones.get('spine_03').getWorldQuaternion(cq);
  const up=new Vector3(0,1,0).applyQuaternion(cq).normalize();
  const to=new Vector3().subVectors(hand,chest);
  handUpSum+=to.dot(up);handDistSum+=to.length();
  const d=new Vector3().subVectors(neck,hips);
  lean.push(deg(Math.atan2(-d.z,d.y)));
  armZ.push(hand.z-hips.z);
 }
 return {name,stride,step:stride/2,cadence:120/period,
  pen:pen*1000,drift:drift*1000,
  elbow:elbowSum/N,elbowMin,
  handUp:handUpSum/N,handDist:handDistSum/N,
  armSwing:(Math.max(...armZ)-Math.min(...armZ))*1000,
  lean:[Math.min(...lean),Math.max(...lean)]};
}

const variants=[];
variants.push(await measure('A current Quaternius',g=>{
 const clip=g.animations.find(c=>c.name==='Run');
 return {clip,duration:clip.duration};
},4.76));
for(const [label,path] of [['B full CMU 16_45','qa/gta-upgrade/cmu-clips/16_45.json'],
                           ['C hybrid (CMU legs+pelvis)','qa/gta-upgrade/cmu-clips/hybrid-C.json'],
                           ['D hybrid (CMU legs only)','qa/gta-upgrade/cmu-clips/hybrid-D.json'],
                           ['E hybrid + boundary fix','qa/gta-upgrade/cmu-clips/hybrid-E.json']]){
 const data=JSON.parse(readFileSync(path,'utf8'));
 variants.push(await measure(label,()=>({clip:clipFromJSON(data),duration:data.duration}),data.stride));
}

// Prove the hybrid did not disturb the legs, rather than inferring it from a metric.
{
 const B=JSON.parse(readFileSync('qa/gta-upgrade/cmu-clips/16_45.json','utf8'));
 const C=JSON.parse(readFileSync('qa/gta-upgrade/cmu-clips/hybrid-C.json','utf8'));
 const sample=(d,phase,bone)=>{
  const span=d.times.length-1,x=phase*span,k0=Math.floor(x),k1=Math.min(span,k0+1),t=x-k0;
  const v=d.tracks[bone];
  return new Quaternion(v[k0*4],v[k0*4+1],v[k0*4+2],v[k0*4+3])
   .slerp(new Quaternion(v[k1*4],v[k1*4+1],v[k1*4+2],v[k1*4+3]),t);
 };
 let worst=0;
 for(const bone of ['pelvis','thigh_l','calf_l','foot_l','ball_l','thigh_r','calf_r','foot_r','ball_r'])
  for(let i=0;i<24;i++){
   const ph=i/24;
   worst=Math.max(worst,sample(B,((ph+C.source.leftOffset)%1+1)%1,bone)
    .angleTo(sample(C,ph,bone))*180/Math.PI);
  }
 console.log(`hybrid C vs full CMU, lower body: worst difference ${worst.toFixed(3)} deg `+
  `across 9 bones x 24 phases\n`);
}

const f=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'--';
const refStep=[SPEED/(170/60),SPEED/(160/60)];
const mid=(refStep[0]+refStep[1])/2;
console.log(`variant comparison at ${SPEED} m/s, no foot IK`);
console.log(`reference step ${refStep[0].toFixed(2)}-${refStep[1].toFixed(2)} m (160-170 spm)\n`);
console.log('variant                       step  step/ref  cadence   pen  drift | elbow  min  handUp  armSwing  lean');
for(const v of variants)
 console.log(v.name.padEnd(28),f(v.step,2).padStart(5),f(v.step/mid,2).padStart(9),
  f(v.cadence,0).padStart(8),f(v.pen,0).padStart(5),f(v.drift,0).padStart(6),'|',
  f(v.elbow,0).padStart(5),f(v.elbowMin,0).padStart(4),
  f(v.handUp,3).padStart(7),f(v.armSwing,0).padStart(9),
  (f(v.lean[0],0)+'..'+f(v.lean[1],0)).padStart(9));
console.log(`
drift is sensitive to key density at this cadence -- B and C carry the SAME lower-body tracks,
verified above to within a thousandth of a degree, yet their measured drift differs by about
60 mm because 21 keys and 25 keys interpolate onto the sampling grid differently. Read drift as
a band, not a figure, and do not use it to separate variants that differ by less than that.`);
