// RUN 5.6 STEP 3-5 -- retarget one CMU cycle onto the 65-bone humanoid, offline.
//
// Nothing here runs at runtime. The output is a JSON of quaternion tracks keyed by target bone
// name plus an in-place root track, which the comparison bench turns into an AnimationClip.
// No BVH ever reaches the browser.
//
// The one idea that matters is in `restCorrected` below: bone names are matched, but rotations
// are NOT copied. What is copied is each joint's rotation RELATIVE TO ITS OWN RIG'S REST POSE.
// Copying world rotations between two skeletons whose rest poses differ is what produces
// inverted knees and twisted shoulders, and the two rigs here do differ -- CMU's arms hang at
// the sides in its rest pose, the Quaternius rig's are in a T.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Quaternion,Vector3,Matrix4} from 'three';
import {parseBVH,forward,deriveScale} from './bvh.mjs';

globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

/**
 * CMU MotionBuilder naming -> the character's UE naming.
 *
 * Fingers are deliberately absent: this run is locomotion, the brief forbids retargeting them,
 * and CMU's hands are a three-joint stub that would only add noise. LHipJoint and RHipJoint are
 * zero-length helpers between the hips and the thighs with no counterpart, so they are skipped
 * and their rotation is folded in by the thigh's own rest correction.
 */
export const BONE_MAP={
 Hips:'pelvis',
 LowerBack:'spine_01', Spine:'spine_02', Spine1:'spine_03',
 Neck:'neck_01', Head:'Head',
 LeftShoulder:'clavicle_l', LeftArm:'upperarm_l', LeftForeArm:'lowerarm_l', LeftHand:'hand_l',
 RightShoulder:'clavicle_r', RightArm:'upperarm_r', RightForeArm:'lowerarm_r', RightHand:'hand_r',
 LeftUpLeg:'thigh_l', LeftLeg:'calf_l', LeftFoot:'foot_l', LeftToeBase:'ball_l',
 RightUpLeg:'thigh_r', RightLeg:'calf_r', RightFoot:'foot_r', RightToeBase:'ball_r'
};

/** World rotation of every source joint on a frame, and in the source rest pose. */
function sourceWorld(bvh,frame,scale){
 const out=new Map();
 for(const [name,m] of forward(bvh,frame,scale))
  out.set(name,new Quaternion().setFromRotationMatrix(m));
 return out;
}
function sourceRest(bvh,scale){
 // The source rest pose is FRAME 0 -- the T-pose the conversion adds -- not the zero-rotation
 // hierarchy.
 //
 // READMEFIRST.txt says why it is there: "the joint renaming and the addition of the T-pose
 // make it possible to use these motions for animation retargetting". It is the reference pose
 // the whole conversion is built around. Using the zero-rotation hierarchy instead looks
 // reasonable and is wrong: CMU's joint axes are not aligned to that pose, and the resulting
 // correction left every foot pointing 177 degrees away from the hips while the knees, elbows
 // and pelvis all measured fine. The file said which pose to use; it had to be read twice.
 return sourceWorld(bvh,0,scale);
}

export async function retarget({bvhPath,glbPath,from,to,fps=30,leftOffset=0}){
 const bvh=parseBVH(readFileSync(bvhPath,'utf8'));
 const scale=deriveScale(bvh);

 const bytes=readFileSync(glbPath);
 const gltf=await new Promise((res,rej)=>new GLTFLoader()
  .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
 const root=gltf.scene;
 root.updateMatrixWorld(true);
 const bones=new Map();
 root.traverse(o=>{if(o.isBone)bones.set(o.name,o);});

 // Target rest: the bind pose as the file ships it, read before anything is animated.
 const tgtRest=new Map(), tgtRestParent=new Map();
 for(const [cmu,ue] of Object.entries(BONE_MAP)){
  const b=bones.get(ue);
  if(!b){console.warn(`  target bone missing: ${ue}`);continue;}
  b.updateWorldMatrix(true,false);
  tgtRest.set(ue,new Quaternion().setFromRotationMatrix(b.matrixWorld));
  if(b.parent)tgtRestParent.set(ue,new Quaternion().setFromRotationMatrix(b.parent.matrixWorld));
 }

 const srcRest=sourceRest(bvh,scale);

 // Resample the chosen window to a fixed rate. CMU is 120 fps; 30 is plenty for a gait loop
 // and keeps the payload small.
 const dt=bvh.frameTime;
 const duration=(to-from)*dt;
 const steps=Math.max(2,Math.round(duration*fps));
 const times=[];
 const tracks=new Map();          // ue name -> flat quaternion array
 for(const ue of tgtRest.keys())tracks.set(ue,[]);
 const rootPos=[];

 const delta=new Quaternion(), world=new Quaternion(), local=new Quaternion();
 const invParent=new Quaternion();
 const hips0=new Vector3(), down=new Vector3();

 // Everything the pelvis height needs, taken once from the bind pose.
 const pelvisBone=bones.get('pelvis');
 const bindPelvis=pelvisBone.position.clone();
 const pelvisParentInv=new Quaternion();
 const pelvisScale=new Vector3(1,1,1);
 if(pelvisBone.parent){
  pelvisBone.parent.updateWorldMatrix(true,false);
  const t=new Vector3();
  pelvisBone.parent.matrixWorld.decompose(t,pelvisParentInv,pelvisScale);
  pelvisParentInv.invert();
 }
 // The height the source hips sit at in the source's own rest pose, so the track carries the
 // bob relative to standing rather than an absolute that depends on the capture's floor.
 const restHipY=new Vector3().setFromMatrixPosition(forward(bvh,0,scale).get('Hips')).y;

 for(let s=0;s<steps;s++){
  const t=s/(steps-1)*duration;
  times.push(t);
  const frame=Math.min(to-1,from+Math.round(t/dt));
  const src=sourceWorld(bvh,frame,scale);

  // Parent world rotations are needed to convert to local, and they must come from THIS
  // frame's retargeted result rather than from the rest pose, so they are built top-down.
  const solvedWorld=new Map();
  for(const [cmu,ue] of Object.entries(BONE_MAP)){
   const sw=src.get(cmu), sr=srcRest.get(cmu), tr=tgtRest.get(ue);
   if(!sw||!sr||!tr)continue;
   // The rest correction, in one line: how far this joint has turned from ITS OWN rest,
   // applied to the target's rest.
   delta.copy(sw).multiply(sr.clone().invert());
   world.copy(delta).multiply(tr);
   solvedWorld.set(ue,world.clone());
  }
  for(const [ue,w] of solvedWorld){
   const bone=bones.get(ue);
   const parentName=bone.parent?.name;
   const pw=solvedWorld.get(parentName)??tgtRestParent.get(ue)??new Quaternion();
   invParent.copy(pw).invert();
   local.copy(invParent).multiply(w);
   tracks.get(ue).push(local.x,local.y,local.z,local.w);
  }
  // Root: vertical only, and expressed in the PELVIS'S OWN PARENT FRAME.
  //
  // STEP 5 -- the controller owns horizontal movement at runtime, so the clip is baked in
  // place and the horizontal travel survives only in the metadata as `stride`.
  //
  // The vertical part cannot simply be written into pelvis.position.y. This skeleton is
  // authored Z-up: the pelvis's bind position is (0.005, 0.086, 0.877) and the height is that
  // 0.877 on Z. Writing a world height into .y displaces the character backwards by most of a
  // metre -- RUN 5 hit exactly this in the foot-IK pelvis drop, and a first version of this
  // exporter hit it again. So a world-space offset is rotated into the parent's frame and
  // added to the bind position, which is right whatever axis the next rig uses.
  const hips=new Vector3().setFromMatrixPosition(forward(bvh,frame,scale).get('Hips'));
  if(s===0)hips0.copy(hips);
  down.set(0,hips.y-restHipY,0).applyQuaternion(pelvisParentInv);
  rootPos.push(bindPelvis.x+down.x/pelvisScale.x,
               bindPelvis.y+down.y/pelvisScale.y,
               bindPelvis.z+down.z/pelvisScale.z);
 }

 // ---- Ground the clip, at bake time ---------------------------------------------------
 //
 // The source subject's hips sit at some height above ITS floor; the target character's sit at
 // another above ITS bind plane. Scaling the legs to match does not make those two agree, and
 // the residual showed up exactly as you would expect: the first retarget ran 25 to 100 mm
 // above the road for the whole cycle, never touching it.
 //
 // So the whole clip is shifted vertically, once, by the amount that puts its LOWEST sole of
 // the cycle on the floor. This is a constant offset applied offline to the baked track. It is
 // not foot IK and it is not per-frame: it cannot hide a clip whose feet are in the wrong
 // place relative to each other, because every frame moves together. That distinction is the
 // whole of RUN 5's boundary and it is worth keeping sharp.
 const BALL_TO_SOLE=.0215;
 const applyKey=k=>{
  for(const [ue,vals] of tracks){
   const bone=bones.get(ue);
   if(bone)bone.quaternion.set(vals[k*4],vals[k*4+1],vals[k*4+2],vals[k*4+3]);
  }
  const pb=bones.get('pelvis');
  pb.position.set(rootPos[k*3],rootPos[k*3+1],rootPos[k*3+2]);
  root.updateMatrixWorld(true);
 };
 const soleOf=name=>{
  const b=bones.get(name);
  if(!b)return Infinity;
  b.updateWorldMatrix(true,false);
  return new Vector3().setFromMatrixPosition(b.matrixWorld).y-BALL_TO_SOLE;
 };
 let lowest=Infinity;
 for(let k=0;k<steps;k++){
  applyKey(k);
  lowest=Math.min(lowest,soleOf('ball_l'),soleOf('ball_r'));
 }
 // Express that world-space drop in the pelvis's parent frame, for the same Z-up reason as
 // the per-frame height above.
 const lift=new Vector3(0,-lowest,0).applyQuaternion(pelvisParentInv);
 for(let k=0;k<steps;k++){
  rootPos[k*3]  +=lift.x/pelvisScale.x;
  rootPos[k*3+1]+=lift.y/pelvisScale.y;
  rootPos[k*3+2]+=lift.z/pelvisScale.z;
 }
 const groundOffset=-lowest;

 // Horizontal travel across the window, for the gait metadata.
 const a=new Vector3().setFromMatrixPosition(forward(bvh,from,scale).get('Hips'));
 const b=new Vector3().setFromMatrixPosition(forward(bvh,to,scale).get('Hips'));
 const stride=Math.hypot(b.x-a.x,b.z-a.z);

 return {
  source:{bvh:bvhPath,from,to,scale,fps:bvh.frameTime?Math.round(1/bvh.frameTime):0},
  duration,fps,times,groundOffset,leftOffset,
  stride,speed:stride/duration,
  tracks:Object.fromEntries(tracks),
  rootPos
 };
}

if(process.argv[1].endsWith('retarget.mjs')){
 const [,,bvhPath,from,to,out,leftOffset]=process.argv;
 if(!out){console.error('usage: retarget.mjs <bvh> <fromFrame> <toFrame> <out.json> [leftOffset]');process.exit(1);}
 // leftOffset: where the LEFT foot lands within this cycle, as a fraction. The cycle is cut
 // between two contacts of whichever foot lands twice (16_45 leads with the right), so the
 // hybrid needs this to roll both sources onto a shared phase-zero.
 const clip=await retarget({bvhPath,glbPath:'public/data/character/citizen.glb',
  from:+from,to:+to,leftOffset:leftOffset?+leftOffset:0});
 mkdirSync(dirname(out),{recursive:true});
 writeFileSync(out,JSON.stringify(clip));
 console.log(`${out}: ${clip.duration.toFixed(3)} s, ${clip.times.length} keys, `+
  `stride ${clip.stride.toFixed(2)} m, native ${clip.speed.toFixed(2)} m/s, `+
  `${Object.keys(clip.tracks).length} bones, grounded by `+
  `${(clip.groundOffset*1000).toFixed(0)} mm`);
}
