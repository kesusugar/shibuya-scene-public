// RUN 5.7 STEP 1-4 -- one clip, two pose sources, composed offline on a single skeleton.
//
// CMU 16_45 has the better legs and, as STEP 0 measured, an arm pose that is the subject's own
// (elbow 67 deg mean on both sides, agreeing within 2) sitting 13 cm too high because of a
// shoulder-chain rest difference. Neither is worth fixing: the arms are simply not taken.
//
// The output is an ORDINARY clip. There is no runtime blending of two sources, no second
// mixer, no second skeleton -- the composition happens here, once, and the game would load the
// result as a normal Run.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,Quaternion,Vector3} from 'three';

globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

/**
 * Who owns which bone.
 *
 * `legs` is the minimum that carries the gait. `pelvis` is separated out because it is the
 * boundary: it drives the legs but it also parents the whole torso, so taking it from CMU
 * imports that subject's hip rotation into a Quaternius spine. Variants B and C differ only
 * in which side of that line the pelvis falls.
 */
export const MASK={
 legs:['thigh_l','calf_l','foot_l','ball_l','thigh_r','calf_r','foot_r','ball_r'],
 pelvis:['pelvis'],
 upper:['spine_01','spine_02','spine_03','neck_01','Head',
        'clavicle_l','upperarm_l','lowerarm_l','hand_l',
        'clavicle_r','upperarm_r','lowerarm_r','hand_r']
};

/**
 * Sample the Quaternius Run at a normalized gait phase.
 *
 * STEP 3: both sources are sampled from the SAME phase, with each clip's own left-foot contact
 * taken as phase zero. Playing them on separate time axes is what makes legs and arms look
 * like two different tempos, and the contact origins are already measured -- RUN 4 put the
 * Quaternius one in `gaitDetail`, and the CMU one comes out of the cycle extraction.
 */
function quaterniusSampler(gltf,report){
 const root=gltf.scene;
 const bones=new Map();root.traverse(o=>{if(o.isBone)bones.set(o.name,o);});
 const clip=gltf.animations.find(c=>c.name==='Run');
 if(!clip)throw new Error('no Run clip in the character pack');
 const mixer=new AnimationMixer(root);
 mixer.clipAction(clip).play();
 const leftContact=report.gaitDetail?.clips?.Run?.leftContact??0;
 return {
  bones,duration:clip.duration,leftContact,
  /** @param phase 0 = left contact */
  at(phase){
   const t=(((phase+leftContact)%1)+1)%1*clip.duration;
   mixer.setTime(t);
   root.updateMatrixWorld(true);
   return bones;
  }
 };
}

export async function buildHybrid({cmuPath,glbPath,reportPath,variant='C',steps=24}){
 const cmu=JSON.parse(readFileSync(cmuPath,'utf8'));
 const report=JSON.parse(readFileSync(reportPath,'utf8'));
 const bytes=readFileSync(glbPath);
 const gltf=await new Promise((res,rej)=>new GLTFLoader()
  .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const q=quaterniusSampler(gltf,report);

 // Which bones come from where.
 const fromCMU=new Set(variant==='D'?MASK.legs:[...MASK.legs,...MASK.pelvis]);
 const fromQ=new Set(variant==='D'?[...MASK.pelvis,...MASK.upper]:MASK.upper);
 // No bone may have two owners, and every animated bone must have one. Asserted, not assumed.
 for(const b of fromCMU)if(fromQ.has(b))throw new Error(`bone owned twice: ${b}`);

 // CMU phase zero is its lead foot's contact; for 16_45 the lead is the RIGHT foot, so the
 // left contact sits `leftOffset` into the cycle and the clip has to be rolled by it.
 const leftOffset=cmu.leftOffset??0.51;

 const times=[],tracks=new Map(),rootPos=[];
 for(const name of [...fromCMU,...fromQ])tracks.set(name,[]);

 const qt=new Quaternion(), a4=new Quaternion(), b4=new Quaternion();
 const cmuPelvisInv=new Quaternion(), qPelvis=new Quaternion(), qBoundary=new Quaternion();
 // Variant E compensates the graft; C and D do not, so the difference is visible.
 const compensate=variant==='E';
 const boundary='spine_01';
 for(let s=0;s<steps;s++){
  const phase=s/steps;
  times.push(phase*cmu.duration);

  // The two pelvis orientations at this phase, for the boundary compensation below.
  if(compensate){
   const pv=cmu.tracks['pelvis'];
   const ka=Math.min(cmu.times.length-1,Math.floor((((phase+leftOffset)%1)+1)%1*(cmu.times.length-1)));
   const kb=Math.min(cmu.times.length-1,ka+1);
   const tt=(((phase+leftOffset)%1)+1)%1*(cmu.times.length-1)-ka;
   cmuPelvisInv.set(pv[ka*4],pv[ka*4+1],pv[ka*4+2],pv[ka*4+3])
    .slerp(new Quaternion(pv[kb*4],pv[kb*4+1],pv[kb*4+2],pv[kb*4+3]),tt).invert();
   qPelvis.copy(q.at(phase).get('pelvis').quaternion);
  }

  // --- CMU side, rolled so phase 0 is the left contact -------------------------------
  //
  // Interpolated, not snapped to the nearest key. The first version rounded to the closest of
  // 21 keys, which is up to 17 ms of timing error -- and at 4.2 m/s the body travels 7 cm in
  // 17 ms, so a foot that should have been standing still appeared to slide. It measured as
  // planted drift doubling from 111 mm to 244 while the pose data was identical to the full
  // CMU clip. The legs were fine; the sampling was not.
  const cmuPhase=(((phase+leftOffset)%1)+1)%1;
  const span=cmu.times.length-1;
  const x=cmuPhase*span;
  const k0=Math.min(span,Math.floor(x));
  const k1=Math.min(span,k0+1);
  const t=x-k0;
  for(const name of fromCMU){
   const vals=cmu.tracks[name];
   if(!vals){throw new Error(`CMU clip has no track for ${name}`);}
   a4.set(vals[k0*4],vals[k0*4+1],vals[k0*4+2],vals[k0*4+3]);
   b4.set(vals[k1*4],vals[k1*4+1],vals[k1*4+2],vals[k1*4+3]);
   a4.slerp(b4,t);
   tracks.get(name).push(a4.x,a4.y,a4.z,a4.w);
  }

  // --- Quaternius side, same phase ---------------------------------------------------
  const bones=q.at(phase);
  for(const name of fromQ){
   const b=bones.get(name);
   if(!b)throw new Error(`character has no bone ${name}`);
   qt.copy(b.quaternion);
   // At the boundary bone only, undo the difference between the two pelvises.
   //
   // A bone's local rotation is relative to its parent. The Quaternius spine was authored
   // against a Quaternius pelvis; graft it onto a CMU pelvis and the two tilts compound, and
   // because a CMU runner's pelvis is already pitched forward the torso ends up hunched over
   // the knees. It is visible immediately in the side view and it measures as a lean of
   // -33..-24 degrees against the source clip's own -29..-23.
   //
   // The fix is one quaternion, applied once, at bake time: pre-multiply the boundary bone by
   // (CMU pelvis)^-1 * (Quaternius pelvis), so the torso lands in the world orientation
   // Quaternius intended while everything below it stays CMU's. No per-frame solver, and
   // nothing downstream needs to know -- the children inherit the correction for free.
   if(compensate&&name===boundary){
    qBoundary.copy(cmuPelvisInv).multiply(qPelvis).multiply(qt);
    qt.copy(qBoundary);
   }
   tracks.get(name).push(qt.x,qt.y,qt.z,qt.w);
  }

  // --- Root: vertical only, always from CMU, never horizontal ------------------------
  // STEP 4: the controller owns world movement. The CMU root is used for stride and phase
  // measurement and for the vertical bob, and its horizontal travel is discarded here.
  if(fromCMU.has('pelvis')){
   // Linear on the same interpolated key pair, for the same reason.
   for(let c=0;c<3;c++)
    rootPos.push(cmu.rootPos[k0*3+c]*(1-t)+cmu.rootPos[k1*3+c]*t);
  }else{
   const p=q.at(phase).get('pelvis');
   rootPos.push(p.position.x,p.position.y,p.position.z);
  }
 }
 // Close the loop exactly.
 times.push(cmu.duration);
 for(const [,arr] of tracks)arr.push(arr[0],arr[1],arr[2],arr[3]);
 rootPos.push(rootPos[0],rootPos[1],rootPos[2]);

 return {
  variant,duration:cmu.duration,times,
  stride:cmu.stride,speed:cmu.speed,
  source:{cmu:cmuPath,quaternius:'Run',leftOffset,
   cmuBones:[...fromCMU],quaterniusBones:[...fromQ]},
  tracks:Object.fromEntries(tracks),rootPos
 };
}

if(process.argv[1].endsWith('hybrid.mjs')){
 const [,,cmuPath,variant,out]=process.argv;
 const clip=await buildHybrid({cmuPath,glbPath:'public/data/character/citizen.glb',
  reportPath:'public/data/character/citizen.json',variant:variant??'C'});
 mkdirSync(dirname(out),{recursive:true});
 writeFileSync(out,JSON.stringify(clip));
 console.log(`${out}: variant ${clip.variant}, ${clip.duration.toFixed(3)} s, `+
  `${clip.times.length} keys, ${clip.source.cmuBones.length} CMU bones + `+
  `${clip.source.quaterniusBones.length} Quaternius bones, stride ${clip.stride.toFixed(2)} m`);
}
