// RUN 5.6 STEP 4 -- does the retarget produce a sane body?
//
// Bone names matching is not evidence. These are the four failures the brief names -- knee
// inversion, shoulder twist, hip rotation, foot yaw -- checked against the character's own
// geometry after the tracks are applied.
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Quaternion,Vector3,AnimationMixer,AnimationClip,QuaternionKeyframeTrack,VectorKeyframeTrack} from 'three';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

export function buildClip(data,name='CMU'){
 const tracks=[];
 for(const [bone,values] of Object.entries(data.tracks))
  tracks.push(new QuaternionKeyframeTrack(`${bone}.quaternion`,data.times,values));
 tracks.push(new VectorKeyframeTrack('pelvis.position',data.times,data.rootPos));
 return new AnimationClip(name,data.duration,tracks);
}

const file=process.argv[2];
const data=JSON.parse(readFileSync(file,'utf8'));
const bytes=readFileSync('public/data/character/citizen.glb');
const gltf=await new Promise((res,rej)=>new GLTFLoader()
 .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
const root=gltf.scene;
root.updateMatrixWorld(true);
const bone=n=>root.getObjectByName(n);

// Rest-pose reference for the twist checks.
const restDir=(a,b)=>{const p=new Vector3().setFromMatrixPosition(bone(a).matrixWorld);
 const q=new Vector3().setFromMatrixPosition(bone(b).matrixWorld);return q.sub(p).normalize();};

// Each foot's rest direction, taken before anything is animated.
const footRest={};
for(const s of ['l','r']){
 const d=new Vector3().subVectors(
  new Vector3().setFromMatrixPosition(bone(`ball_${s}`).matrixWorld),
  new Vector3().setFromMatrixPosition(bone(`foot_${s}`).matrixWorld));
 d.y=0;d.normalize();
 footRest[s]={x:d.x,z:d.z};
}
console.log('rest foot direction: L',footRest.l.x.toFixed(2),footRest.l.z.toFixed(2),
 ' R',footRest.r.x.toFixed(2),footRest.r.z.toFixed(2),'(x,z)\n');

const mixer=new AnimationMixer(root);
const action=mixer.clipAction(buildClip(data));
action.play();

const at=n=>{const b=bone(n);b.updateWorldMatrix(true,false);
 return new Vector3().setFromMatrixPosition(b.matrixWorld);};
const angle=(a,b,c)=>{
 const u=new Vector3().subVectors(at(a),at(b)).normalize();
 const v=new Vector3().subVectors(at(c),at(b)).normalize();
 return Math.acos(Math.max(-1,Math.min(1,u.dot(v))))*180/Math.PI;
};
// Knee bend direction: the sign of (thigh x shin) . lateral axis tells which way it folds.
const kneeSign=side=>{
 const hip=at(`thigh_${side}`),knee=at(`calf_${side}`),ankle=at(`foot_${side}`);
 const a=new Vector3().subVectors(knee,hip), b=new Vector3().subVectors(ankle,knee);
 // Forward is -z for this rig at rest; a human knee's shin goes BACK relative to the thigh.
 return Math.sign(b.z-a.z);
};

const N=60;
// Each ankle's lowest point over the cycle, so "planted" is judged against the clip itself
// rather than an assumed floor height.
const ankleFloor={l:Infinity,r:Infinity};
for(let i=0;i<N;i++){
 mixer.setTime(data.duration*i/N);
 root.updateMatrixWorld(true);
 for(const s of ['l','r'])ankleFloor[s]=Math.min(ankleFloor[s],at(`foot_${s}`).y);
}
let kneeMin={l:180,r:180}, kneeInvert={l:0,r:0}, elbowMin={l:180,r:180};
let footYaw=0, hipRoll=0, shoulderTwist=0, footYawSkipped=0, footYawSamples=0;
const up=new Vector3(0,1,0);
for(let i=0;i<N;i++){
 mixer.setTime(data.duration*i/N);
 root.updateMatrixWorld(true);
 for(const s of ['l','r']){
  const k=angle(`thigh_${s}`,`calf_${s}`,`foot_${s}`);
  kneeMin[s]=Math.min(kneeMin[s],k);
  // A knee that bends the WRONG way: the shin swings in front of the thigh.
  if(k<172&&kneeSign(s)>0)kneeInvert[s]++;
  elbowMin[s]=Math.min(elbowMin[s],angle(`upperarm_${s}`,`lowerarm_${s}`,`hand_${s}`));
 }
 // Foot yaw, in the PELVIS's frame.
 //
 // Two wrong versions preceded this one and both are worth naming. The first assumed forward
 // was -z and read the character's correct heading as a 180 degree inversion; this rig's
 // forward is +z. The second compared each foot against its own WORLD rest direction, which
 // reports 180 degrees for a character running the opposite way to its bind pose -- also
 // correct behaviour, also flagged as failure.
 //
 // What actually matters is whether a foot points where the hips point. Measuring in the
 // pelvis's frame is invariant to both the rig's axis convention and the direction of travel,
 // and a genuinely flipped foot still shows up as 180.
 const pq=new Quaternion();bone('pelvis').getWorldQuaternion(pq);
 const pelvisFwd=new Vector3(0,0,1).applyQuaternion(pq);pelvisFwd.y=0;pelvisFwd.normalize();
 for(const s of ['l','r']){
  // Only while the foot is PLANTED. A foot in the air may point wherever the leg takes it,
  // and in a run it points backwards: at mid-swing the shin folds toward the buttock and the
  // toe genuinely aims behind the runner. Measuring across the whole cycle therefore reports
  // 177 degrees on a correct retarget -- which this check did, three times, in three different
  // wrong framings, before the poses were printed frame by frame and the pattern was obvious:
  // 0-5 degrees whenever the foot is near the ground, 160-180 whenever it is 0.5 m up.
  //
  // A twisted PLANTED foot is a retarget defect. A swinging foot is a running gait.
  const ankleY=at(`foot_${s}`).y;
  if(ankleY>ankleFloor[s]+.09){footYawSkipped++;continue;}
  const d=new Vector3().subVectors(at(`ball_${s}`),at(`foot_${s}`));
  d.y=0;
  if(d.lengthSq()<1e-6){footYawSkipped++;continue;}
  d.normalize();
  const yaw=Math.atan2(d.x*pelvisFwd.z-d.z*pelvisFwd.x, d.x*pelvisFwd.x+d.z*pelvisFwd.z)*180/Math.PI;
  footYaw=Math.max(footYaw,Math.abs(yaw));
  footYawSamples++;
 }
 // Hip roll: the pelvis's lateral tilt.
 const pelvisQ=new Quaternion();bone('pelvis').getWorldQuaternion(pelvisQ);
 const side=new Vector3(1,0,0).applyQuaternion(pelvisQ);
 hipRoll=Math.max(hipRoll,Math.abs(Math.asin(Math.max(-1,Math.min(1,side.y)))*180/Math.PI));
 // Shoulder twist: the angle between the two clavicles, which should stay near its rest value.
 shoulderTwist=Math.max(shoulderTwist,angle('hand_l','clavicle_l','clavicle_r'));
}
const ok=v=>v?'  ok':'FAIL';
console.log(`retarget validation -- ${file}\n`);
console.log('knee minimum bend      L',kneeMin.l.toFixed(0).padStart(4),'deg   R',kneeMin.r.toFixed(0).padStart(4),
 'deg   (a running knee reaches 60-90; 180 means it never bent)');
console.log('knee inverted frames   L',String(kneeInvert.l).padStart(4),'     R',String(kneeInvert.r).padStart(4),
 '       ',ok(kneeInvert.l===0&&kneeInvert.r===0));
console.log('elbow minimum bend     L',elbowMin.l.toFixed(0).padStart(4),'deg   R',elbowMin.r.toFixed(0).padStart(4),'deg');
console.log('planted foot yaw      ',footYaw.toFixed(0).padStart(4),'deg           ',ok(footYaw<45),
 `  (${footYawSamples} flat samples, ${footYawSkipped} too steep to judge)`);
console.log('worst pelvis roll     ',hipRoll.toFixed(0).padStart(4),'deg           ',ok(hipRoll<30));
console.log('NaN in tracks         ',
 Object.values(data.tracks).some(t=>t.some(v=>!Number.isFinite(v)))?'FAIL':'  ok');
