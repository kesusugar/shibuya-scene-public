// RUN 5.7 STEP 0 -- why do the retargeted arms look wrong?
//
// Two possibilities and they call for different responses: either the subject ran with the
// arms high and folded (in which case the arms are simply not usable and there is nothing to
// fix), or the retarget put them there (in which case it is a bug worth recording). The only
// way to tell them apart is to measure the same quantities on both sides, so that is what this
// does -- the SOURCE skeleton and the RETARGETED character, same angles, same frames.
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3,Quaternion} from 'three';
import {parseBVH,forward,deriveScale} from './bvh.mjs';

globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

const bvhPath=process.argv[2], clipPath=process.argv[3];
const bvh=parseBVH(readFileSync(bvhPath,'utf8'));
const scale=deriveScale(bvh);
const data=JSON.parse(readFileSync(clipPath,'utf8'));

const bytes=readFileSync('public/data/character/citizen.glb');
const gltf=await new Promise((res,rej)=>new GLTFLoader()
 .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
const root=gltf.scene;
const bones=new Map();root.traverse(o=>{if(o.isBone)bones.set(o.name,o);});

const deg=r=>r*180/Math.PI;
const angleAt=(a,b,c)=>{
 const u=new Vector3().subVectors(a,b).normalize();
 const v=new Vector3().subVectors(c,b).normalize();
 return deg(Math.acos(Math.max(-1,Math.min(1,u.dot(v)))));
};

/** Source measurements on one frame. */
function source(frame){
 const w=forward(bvh,frame,scale);
 const at=n=>new Vector3().setFromMatrixPosition(w.get(n));
 const chest=at('Spine1'), hips=at('Hips');
 const sh=at('LeftArm'), el=at('LeftForeArm'), ha=at('LeftHand');
 // The chest frame, so "in front of the chest" means the same thing on both rigs.
 const chestQ=new Quaternion().setFromRotationMatrix(w.get('Spine1'));
 const fwd=new Vector3(0,0,1).applyQuaternion(chestQ).normalize();
 const up=new Vector3(0,1,0).applyQuaternion(chestQ).normalize();
 const toHand=new Vector3().subVectors(ha,chest);
 return {
  elbow:angleAt(sh,el,ha),
  // Shoulder: how far the upper arm is raised from hanging straight down.
  shoulder:deg(Math.acos(Math.max(-1,Math.min(1,
   new Vector3().subVectors(el,sh).normalize().dot(up.clone().negate()))))),
  handAhead:toHand.dot(fwd),
  handUp:toHand.dot(up),
  handDist:toHand.length(),
  armLen:sh.distanceTo(el)+el.distanceTo(ha)
 };
}

/** The same measurements on the retargeted character at key k. */
function target(k){
 for(const [ue,vals] of Object.entries(data.tracks)){
  const b=bones.get(ue);
  if(b)b.quaternion.set(vals[k*4],vals[k*4+1],vals[k*4+2],vals[k*4+3]);
 }
 const pb=bones.get('pelvis');
 pb.position.set(data.rootPos[k*3],data.rootPos[k*3+1],data.rootPos[k*3+2]);
 root.updateMatrixWorld(true);
 const at=n=>{const b=bones.get(n);b.updateWorldMatrix(true,false);
  return new Vector3().setFromMatrixPosition(b.matrixWorld);};
 const chest=at('spine_03');
 const sh=at('upperarm_l'), el=at('lowerarm_l'), ha=at('hand_l');
 const chestQ=new Quaternion();bones.get('spine_03').getWorldQuaternion(chestQ);
 const fwd=new Vector3(0,0,1).applyQuaternion(chestQ).normalize();
 const up=new Vector3(0,1,0).applyQuaternion(chestQ).normalize();
 const toHand=new Vector3().subVectors(ha,chest);
 return {
  elbow:angleAt(sh,el,ha),
  shoulder:deg(Math.acos(Math.max(-1,Math.min(1,
   new Vector3().subVectors(el,sh).normalize().dot(up.clone().negate()))))),
  handAhead:toHand.dot(fwd),
  handUp:toHand.dot(up),
  handDist:toHand.length(),
  armLen:sh.distanceTo(el)+el.distanceTo(ha)
 };
}

const from=data.source.from, to=data.source.to;
console.log(`arm diagnosis -- ${bvhPath} frames ${from}..${to}\n`);
console.log('              SOURCE (CMU skeleton)              RETARGETED (game character)');
console.log('key  frame  elbow  shoulder  ahead    up      | elbow  shoulder  ahead    up');
const S=[],R=[];
for(let k=0;k<data.times.length;k+=3){
 const frame=Math.min(to-1,from+Math.round(data.times[k]/bvh.frameTime));
 const s=source(frame), t=target(k);
 S.push(s);R.push(t);
 const f=(v,d=2)=>v.toFixed(d).padStart(7);
 console.log(String(k).padStart(3),String(frame).padStart(6),
  f(s.elbow,0),f(s.shoulder,0),f(s.handAhead),f(s.handUp),'  |',
  f(t.elbow,0),f(t.shoulder,0),f(t.handAhead),f(t.handUp));
}
const mean=(a,k)=>a.reduce((x,y)=>x+y[k],0)/a.length;
const min=(a,k)=>Math.min(...a.map(y=>y[k]));
console.log(`
arm length            source ${mean(S,'armLen').toFixed(3)} m   target ${mean(R,'armLen').toFixed(3)} m
elbow, mean           source ${mean(S,'elbow').toFixed(0)} deg      target ${mean(R,'elbow').toFixed(0)} deg
elbow, minimum        source ${min(S,'elbow').toFixed(0)} deg      target ${min(R,'elbow').toFixed(0)} deg
hand ahead of chest   source ${mean(S,'handAhead').toFixed(3)} m   target ${mean(R,'handAhead').toFixed(3)} m
hand above chest      source ${mean(S,'handUp').toFixed(3)} m   target ${mean(R,'handUp').toFixed(3)} m

If the two elbow columns agree, the pose is the subject's and the arms are simply not usable.
If the target is markedly more folded than the source, the retarget is doing it.`);
