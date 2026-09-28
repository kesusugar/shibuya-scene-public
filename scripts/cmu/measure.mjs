// RUN 5.6 STEP 6-7 -- extract a clean gait cycle from each trial and measure it on the same
// benchmark the Quaternius clips were measured on.
//
// CMU trials are short continuous captures: an approach, some running, a stop. Using a whole
// trial as a loop would splice a decelerating stride onto an accelerating one. So a single
// cycle is cut between two successive left-foot contacts in the steady middle of the trial,
// and the discontinuity across that cut is MEASURED rather than crossfaded away.
import {readFileSync,readdirSync} from 'node:fs';
import {Vector3,Quaternion,Matrix4} from 'three';
import {parseBVH,forward,deriveScale} from './bvh.mjs';

const DIR=process.argv[2];
const JSON_OUT=process.argv.includes('--json');

// The same reference the Quaternius audit used, restated: at a fixed speed, step length and
// cadence are one fact. 160-170 spm at 4.2 m/s fixes the step at 1.48-1.58 m.
const REF_SPM=[160,170];

function analyse(file){
 const bvh=parseBVH(readFileSync(file,'utf8'));
 const scale=deriveScale(bvh);
 const dt=bvh.frameTime;

 // Frame 0 is discarded, and this is not a tidying detail.
 //
 // READMEFIRST.txt says it outright: "Every BVH file has a T-pose added as its new first
 // frame." That synthetic pose is not part of the capture, and in several trials its toe sits
 // four centimetres below anything in the actual running -- so taking it as the foot's lowest
 // point puts the floor underground and no real frame ever counts as a contact. It made
 // 35_17, 16_46, 35_20 and nine others read as "no foot lands twice" while their gait was
 // perfectly clean. The file said so; the data agreed; the code had to be told.
 const FIRST=1;
 const N=bvh.frames;

 // Forward kinematics once per frame; everything below reads this.
 const P=[];
 for(let f=FIRST;f<N;f++){
  const w=forward(bvh,f,scale);
  const at=n=>new Vector3().setFromMatrixPosition(w.get(n));
  P.push({
   hips:at('Hips'),head:at('Head'),neck:at('Neck'),
   lf:at('LeftFoot'),rf:at('RightFoot'),
   lt:at('LeftToeBase'),rt:at('RightToeBase'),
   lh:at('LeftHand'),rh:at('RightHand')
  });
 }
 // The floor: the lowest any toe reaches across the trial. CMU captures are on a real floor,
 // so this is a real plane and not an authoring convention.

 // Contact: a toe near ITS OWN lowest point and nearly stationary in WORLD space.
 //
 // Two corrections to the obvious version, both found by looking at the data rather than by
 // reasoning about it. First, each foot gets its own floor: in a real capture the two feet do
 // not reach the same minimum -- in 16_45 the right toe touches 0 mm and the left bottoms out
 // at 17 mm -- so a single shared floor silently disqualifies one foot entirely. Second,
 // "planted" is judged by world-space speed, not by movement relative to the hips: a planted
 // foot is stationary while the body travels past it, which is true whichever way the capture
 // happens to face. The relative-to-hips test used elsewhere in this project is sign-dependent
 // on the direction of travel, and CMU trials do not all run the same way.
 const perFoot={
  l:Math.min(...P.map(p=>p.lt.y)),
  r:Math.min(...P.map(p=>p.rt.y))
 };
 // P is dense from FIRST; index it with i = f - FIRST.
 const M=P.length;
 const toeSpeed=(i,side)=>{
  if(i<=0)return Infinity;
  const a=side==='l'?P[i-1].lt:P[i-1].rt, b=side==='l'?P[i].lt:P[i].rt;
  return Math.hypot(b.x-a.x,b.z-a.z)/dt;
 };
 // The threshold scales with how fast the trial is going, so it does not need retuning per
 // subject: a foot moving at under a fifth of body speed is not swinging.
 let bodySpeed=0;
 for(let i=1;i<M;i++)bodySpeed+=Math.hypot(P[i].hips.x-P[i-1].hips.x,P[i].hips.z-P[i-1].hips.z)/dt;
 bodySpeed/=Math.max(1,M-1);
 const planted=(i,side)=>{
  const toe=side==='l'?P[i].lt:P[i].rt;
  return toe.y-perFoot[side]<.045&&toeSpeed(i,side)<bodySpeed*.2;
 };
 const contacts=side=>{
  const on=[];
  for(let i=2;i<M;i++)if(planted(i,side)&&!planted(i-1,side))on.push(i);
  return on;
 };
 const L=contacts('l'), R=contacts('r');

 // A cycle runs between two successive contacts of the SAME foot, and which foot that is has
 // to be chosen per trial rather than fixed.
 //
 // These captures are short -- 1.1 to 1.6 seconds, three or four steps -- so a given foot may
 // land only once in the whole trial. Keying on the left foot alone reported almost every
 // trial unusable while the data was in fact clean: 16_45 plants right, left, right, which is
 // a complete cycle measured right-to-right, with the left contact falling at phase 0.506.
 // Take whichever foot actually gives two landings, preferring the one with more.
 const lead=(R.length>=2&&R.length>=L.length)?{side:'r',on:R,otherOn:L}
           :(L.length>=2)?{side:'l',on:L,otherOn:R}
           :null;
 if(!lead)return {file,usable:false,
  reason:`no foot lands twice (L ${L.length}, R ${R.length})`};
 // From the middle of the trial, where the runner is steadiest.
 const mid=Math.max(1,Math.floor(lead.on.length/2));
 const a=lead.on[mid-1], b=lead.on[mid];
 const frames=b-a;
 if(frames<8)return {file,usable:false,reason:'cycle too short'};
 const cycle=frames*dt;

 // Speed over exactly that cycle, from hip travel.
 const travel=Math.hypot(P[b].hips.x-P[a].hips.x, P[b].hips.z-P[a].hips.z);
 const speed=travel/cycle;
 const stride=travel, step=stride/2, cadence=120/cycle;

 // The opposite foot's contact, as a phase of this cycle. 0.5 is a symmetric gait.
 const otherIn=lead.otherOn.filter(f=>f>a&&f<b);
 const offset=otherIn.length?(otherIn[0]-a)/frames:NaN;

 // Duty and airborne, over the cycle.
 let lOn=0,rOn=0,air=0;
 for(let i=a;i<b;i++){
  const l=planted(i,'l'), r=planted(i,'r');
  if(l)lOn++; if(r)rOn++; if(!l&&!r)air++;
 }
 const duty=(lOn+rOn)/2/frames;

 // Sole penetration below the floor, and planted drift, over the cycle.
 let pen=0,drift=0;
 for(const side of ['l','r']){
  let anchor=null;
  for(let i=a;i<b;i++){
   const toe=side==='l'?P[i].lt:P[i].rt;
   pen=Math.max(pen,perFoot[side]-toe.y);
   if(planted(i,side)){
    if(!anchor)anchor=toe.clone();
    else drift=Math.max(drift,Math.hypot(toe.x-anchor.x,toe.z-anchor.z));
   }else anchor=null;
  }
 }

 // Pelvis vertical travel, lean, arm swing.
 const hipY=[];for(let i=a;i<b;i++)hipY.push(P[i].hips.y);
 const hipRise=Math.max(...hipY)-Math.min(...hipY);
 const leans=[];for(let i=a;i<b;i++){
  const d=new Vector3().subVectors(P[i].neck,P[i].hips);
  leans.push(Math.atan2(-d.z,d.y)*180/Math.PI);
 }
 const armZ=[];for(let i=a;i<b;i++)armZ.push(P[i].lh.z-P[i].hips.z);
 const armSwing=Math.max(...armZ)-Math.min(...armZ);

 // Loop seam: how different the pose is at the cut. Measured in the hips' frame so the
 // forward travel of a whole stride does not count as discontinuity.
 const rel=(p,n)=>new Vector3().subVectors(p[n],p.hips);
 let seam=0;
 for(const n of ['lf','rf','lh','rh','head','neck','lt','rt'])
  seam=Math.max(seam,rel(P[a],n).distanceTo(rel(P[b],n)));
 // And the height step across the cut, which a crossfade would hide as a bob.
 const seamY=Math.abs(P[a].hips.y-P[b].hips.y);

 const refStep=REF_SPM.map(c=>speed/(c/60));
 return {file,usable:true,scale,lead:lead.side,
  frames,cycle,speed,stride,step,cadence,duty,
  offset,symmetry:Math.abs((offset||0)-.5),
  airborne:air/frames,
  penetration:pen*1000,drift:drift*1000,hipRise:hipRise*1000,
  lean:[Math.min(...leans),Math.max(...leans)],
  armSwing:armSwing*1000,
  seam:seam*1000,seamY:seamY*1000,
  refStep,stepRatio:step/((refStep[0]+refStep[1])/2),
  cadenceRatio:cadence/((REF_SPM[0]+REF_SPM[1])/2),
  a,b};
}

const rows=readdirSync(DIR).filter(f=>f.endsWith('.bvh')).sort()
 .map(f=>({name:f.replace('.bvh',''),...analyse(`${DIR}/${f}`)}));

if(JSON_OUT){console.log(JSON.stringify(rows,null,1));}
else{
 const f=(v,d=2)=>Number.isFinite(v)?v.toFixed(d):'--';
 console.log('CMU run candidates -- one extracted gait cycle each\n');
 console.log('trial     speed   step  stride  cadence  step/ref  duty   L->R   air   pen   drift  hip   lean        arm   seam  seamY');
 for(const r of rows){
  if(!r.usable){console.log(r.name.padEnd(9),'UNUSABLE -',r.reason);continue;}
  console.log(r.name.padEnd(9),
   f(r.speed).padStart(6),f(r.step).padStart(6),f(r.stride).padStart(7),
   f(r.cadence,0).padStart(8),f(r.stepRatio).padStart(9),
   f(r.duty,2).padStart(6),f(r.offset,2).padStart(6),f(r.airborne,2).padStart(6),
   f(r.penetration,0).padStart(5),f(r.drift,0).padStart(7),f(r.hipRise,0).padStart(5),
   (f(r.lean[0],0)+'..'+f(r.lean[1],0)).padStart(10),
   f(r.armSwing,0).padStart(6),f(r.seam,0).padStart(6),f(r.seamY,0).padStart(6));
 }
 console.log(`
speed/step/stride/cadence are over ONE extracted cycle, not the whole trial.
step/ref    step length against the 160-170 spm reference for that clip's own speed. 1.00 is
            the reference; the current Quaternius Run is 1.32.
pen         mm the toe goes below the capture floor. Real captures should be near zero.
drift       mm a planted toe slides. Real captures have some; it is the honest baseline.
seam        mm of pose discontinuity across the loop cut, in the hips' frame.
seamY       mm of hip-height step across the cut. A crossfade would hide this as a bob.`);
}
