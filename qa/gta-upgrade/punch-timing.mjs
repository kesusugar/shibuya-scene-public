// RUN 8 STEP 2: measure the punch clips instead of guessing when a fist lands.
//
// The impact frame is where the striking hand is furthest from the pelvis along the body's
// forward axis. Wind-up is everything before the hand starts travelling forward; recovery is
// everything after the peak. These are read off the clip, not chosen.
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};

const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const b=readFileSync('public/data/character/citizen.glb');
const gltf=await new Promise((r,j)=>new GLTFLoader()
 .parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j));

const rigOf=id=>{let f=null;gltf.scene.traverse(o=>{if(!f&&o.userData?.rig===id)f=o;});return f;};
const rig=rigOf(report.rigs[0].id);
const bone=name=>{let f=null;rig.traverse(o=>{if(!f&&o.isBone&&o.name===name)f=o;});return f;};

const mixer=new T.AnimationMixer(rig);
const pelvis=bone('pelvis');
const hands={hand_l:bone('hand_l'),hand_r:bone('hand_r')};
const world=new T.Vector3(),hip=new T.Vector3();

for(const name of ['Punch','PunchCross']){
 const clip=gltf.animations.find(c=>c.name===name);
 if(!clip){console.log(name,'MISSING');continue;}
 const action=mixer.clipAction(clip);action.reset();action.play();
 const STEPS=120;
 const reach={hand_l:[],hand_r:[]};
 for(let i=0;i<=STEPS;i++){
  // Order matters: setTime(0) rewinds every action, so the sample time must be written
  // AFTER the rewind, not before it. Getting this backwards samples the same pose forever.
  mixer.setTime(0);
  action.time=(i/STEPS)*clip.duration;
  mixer.update(0);
  rig.updateMatrixWorld(true);
  pelvis.getWorldPosition(hip);
  for(const [key,h] of Object.entries(hands)){
   h.getWorldPosition(world);
   // The rig is Z-up in bone space and its forward is +Z; measure reach along the body's
   // own forward rather than a world axis, so a turning clip is not mistaken for a punch.
   reach[key].push(world.distanceTo(hip));
  }
 }
 action.stop();
 // Whichever hand travels furthest is the striking one.
 const span=k=>Math.max(...reach[k])-Math.min(...reach[k]);
 const striking=span('hand_l')>span('hand_r')?'hand_l':'hand_r';
 const series=reach[striking];
 const peakAt=series.indexOf(Math.max(...series));
 const lo=Math.min(...series),hi=Math.max(...series);
 // The active window is where the hand is within 12% of full extension: that is the part of
 // the swing where a fist would actually be touching someone.
 const gate=lo+(hi-lo)*0.88;
 let first=-1,last=-1;
 for(let i=0;i<series.length;i++){if(series[i]>=gate){if(first<0)first=i;last=i;}}
 const t=i=>(i/STEPS)*clip.duration;
 console.log(`\n${name}  duration ${clip.duration.toFixed(3)}s  striking ${striking}`);
 console.log(`  reach ${lo.toFixed(3)} -> ${hi.toFixed(3)} m  (peak at ${t(peakAt).toFixed(3)}s, phase ${(peakAt/STEPS).toFixed(3)})`);
 console.log(`  WINDUP    0.000 - ${t(first).toFixed(3)}s   (phase 0.000 - ${(first/STEPS).toFixed(3)})`);
 console.log(`  ACTIVE    ${t(first).toFixed(3)} - ${t(last).toFixed(3)}s   (phase ${(first/STEPS).toFixed(3)} - ${(last/STEPS).toFixed(3)})`);
 console.log(`  RECOVERY  ${t(last).toFixed(3)} - ${clip.duration.toFixed(3)}s`);
}
