// RUN 5.5 STEP 1-2 -- every forward locomotion clip in the upstream archive, one benchmark.
//
// Measured on the ROOT-MOTION build (UAL1_Standard_RM.glb). The archive ships two files and
// the difference matters here: the non-RM build has root motion stripped, so a clip's speed
// can only be inferred from how its feet move, which is what RUN 4 had to do. The RM build
// carries the real translation, so speed and stride are read rather than derived.
//
// The floor is the same for every candidate -- the plane the Idle clip's soles rest on -- and
// it does not move per clip, because a floor that moved would hide exactly the defect being
// looked for.
//
// Writes docs/ANIMATION-LOCOMOTION-AUDIT.md.
import {readFileSync,writeFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,Vector3,Quaternion} from 'three';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};

const UP='assets/character/upstream/ual1/';
const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const SCALE=report.body.scaleToGame;            // upstream metres -> game metres
const BALL_TO_SOLE=.0215;
const SAMPLES=240;

const load=async file=>{
 const b=readFileSync(UP+file);
 return new Promise((res,rej)=>new GLTFLoader()
  .parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',res,rej));
};
const rm=await load('UAL1_Standard_RM.glb');
const still=await load('UAL1_Standard.glb');

/** Bones by name, and the root the mixer drives. */
function rig(gltf){
 const root=gltf.scene;
 root.scale.setScalar(SCALE);
 root.updateMatrixWorld(true);
 const mixer=new AnimationMixer(root);
 const clips=new Map(gltf.animations.map(c=>[c.name,c]));
 return {root,mixer,clips};
}
const A=rig(rm),B=rig(still);

const v=new Vector3();
const worldY=(root,name)=>{const b=root.getObjectByName(name);if(!b)return null;
 b.updateWorldMatrix(true,false);return v.setFromMatrixPosition(b.matrixWorld).y;};
const worldPos=(root,name,out)=>{const b=root.getObjectByName(name);if(!b)return null;
 b.updateWorldMatrix(true,false);return out.setFromMatrixPosition(b.matrixWorld);};

/** Play `name` on `rigged` and hand each sample to `fn`. */
function sweep(rigged,name,fn){
 const clip=rigged.clips.get(name);
 if(!clip)return null;
 rigged.mixer.stopAllAction();
 const action=rigged.mixer.clipAction(clip);
 action.reset().play();
 for(let i=0;i<SAMPLES;i++){
  action.time=clip.duration*i/SAMPLES;
  rigged.mixer.update(0);
  rigged.root.updateMatrixWorld(true);
  fn(i/SAMPLES,i);
 }
 rigged.mixer.stopAllAction();
 return clip;
}

/** The plane Idle's soles rest on, in the still rig. Every clip is judged against this. */
let idleFloor=Infinity;
sweep(B,'Idle_Loop',()=>{
 idleFloor=Math.min(idleFloor,
  worldY(B.root,'ball_l')-BALL_TO_SOLE, worldY(B.root,'ball_r')-BALL_TO_SOLE);
});

function audit(name){
 const clip=B.clips.get(name);
 if(!clip)return null;

 // ---- root motion: speed and stride, from the RM build --------------------------------
 const hips=new Vector3();
 let first=null,last=null,rise=[];
 const rmClip=sweep(A,name,()=>{
  worldPos(A.root,'pelvis',hips);
  if(!first)first=hips.clone();
  last=hips.clone();
  rise.push(hips.y);
 });
 const travel=rmClip?Math.hypot(last.x-first.x,last.z-first.z)*SAMPLES/(SAMPLES-1):0;
 const speed=rmClip?travel/rmClip.duration:0;
 const hipRise=rise.length?(Math.max(...rise)-Math.min(...rise))*1000:0;

 // ---- feet, arms, lean: from the still build, so translation does not confound ---------
 const L=[],R=[],arm=[],lean=[];
 const pl=new Vector3(),pr=new Vector3(),sh=new Vector3(),hp=new Vector3(),hn=new Vector3();
 sweep(B,name,t=>{
  worldPos(B.root,'ball_l',pl);worldPos(B.root,'ball_r',pr);
  L.push({t,y:pl.y-BALL_TO_SOLE,z:pl.z,x:pl.x});
  R.push({t,y:pr.y-BALL_TO_SOLE,z:pr.z,x:pr.x});
  // Arm swing: how far the hands travel front-to-back relative to the hips.
  const h=worldPos(B.root,'hand_l',new Vector3());
  worldPos(B.root,'pelvis',hp);
  arm.push(h.z-hp.z);
  // Lean: the spine's tilt from vertical, taken from pelvis to neck.
  worldPos(B.root,'neck_01',hn);
  lean.push(Math.atan2(hn.z-hp.z,hn.y-hp.y)*180/Math.PI);
 });

 // Contact: a foot is planted while it is within 20 mm of this clip's own lowest point for
 // that foot AND travelling backwards relative to the hips (RUN 4's rule -- height alone also
 // matches a foot passing through the bottom of its swing).
 const band=(F)=>{
  const low=Math.min(...F.map(s=>s.y));
  const planted=F.map((s,i)=>{
   const prev=F[(i-1+F.length)%F.length];
   return s.y<low+.02&&(s.z-prev.z)<=0;
  });
  // first index where planted turns on, and the fraction of the cycle it stays on
  let start=planted.findIndex((p,i)=>p&&!planted[(i-1+planted.length)%planted.length]);
  if(start<0)start=planted.indexOf(true);
  const count=planted.filter(Boolean).length;
  return {contact:start<0?0:start/F.length,duty:count/F.length,low};
 };
 const bl=band(L),br=band(R);
 let offset=(br.contact-bl.contact+1)%1;

 const floor=Math.min(bl.low,br.low);
 const pen=(idleFloor-floor)*1000;                       // mm below the idle plane
 const duty=(bl.duty+br.duty)/2;
 const airborne=Math.max(0,1-(bl.duty+br.duty));
 // Planted drift has to be measured on the ROOT-MOTION build. In the stripped build the body
 // never advances, so a correctly planted foot slides backwards by a whole step by
 // construction -- measuring there reported 600 mm of "drift" for a clean walk, which is the
 // stride, not a defect. With root motion the body moves and a planted foot should stand
 // still in world space, so what is left over is real slip.
 const RL=[],RR=[];
 sweep(A,name,()=>{
  RL.push(worldPos(A.root,'ball_l',new Vector3()).clone());
  RR.push(worldPos(A.root,'ball_r',new Vector3()).clone());
 });
 const driftRM=(pts,F,b)=>{
  // Use the same planted band the stripped build identified, by index.
  const idx=F.map((s,i)=>s.y<b.low+.02?i:-1).filter(i=>i>=0);
  if(idx.length<2)return 0;
  // Consecutive runs only: the band wraps, and measuring across the wrap spans a whole stride.
  let worst=0,runStart=idx[0];
  for(let k=1;k<=idx.length;k++){
   if(k===idx.length||idx[k]!==idx[k-1]+1){
    const a=pts[runStart],b2=pts[idx[k-1]];
    if(a&&b2)worst=Math.max(worst,Math.hypot(b2.x-a.x,b2.z-a.z));
    if(k<idx.length)runStart=idx[k];
   }
  }
  return worst*1000;
 };
 const stride=speed*clip.duration;
 return {
  name,duration:clip.duration,speed,stride,step:stride/2,
  cadence:clip.duration?120/clip.duration:0,
  leftContact:bl.contact,rightContact:br.contact,offset,
  duty,airborne,
  symmetry:Math.abs(offset-.5),
  penetration:pen,
  drift:Math.max(driftRM(RL,L,bl),driftRM(RR,R,br)),
  hipRise,
  armSwing:(Math.max(...arm)-Math.min(...arm))*1000,
  lean:{min:Math.min(...lean),max:Math.max(...lean)}
 };
}

// Every clip that moves the body forwards on two feet. Crouch, push and swim are forward
// loops too and are measured rather than dismissed by name, as instructed.
const CANDIDATES=['Walk_Loop','Walk_Formal_Loop','Jog_Fwd_Loop','Sprint_Loop',
 'Crouch_Fwd_Loop','Push_Loop','Swim_Fwd_Loop'];
const rows=CANDIDATES.map(audit).filter(Boolean);

const f=(v,d=2)=>Number.isFinite(v)?v.toFixed(d):'--';
let md=`# Locomotion clip audit — the whole upstream candidate pool

RUN 5.5 STEP 1–2. Every forward locomotion clip in the Quaternius Universal Animation Library
\\[Standard\\], measured on one benchmark, against one floor.

Generated by \`node scripts/audit-locomotion.mjs\`. Re-run it rather than editing this file.

## How these were measured

**Root motion is read, not inferred.** The archive ships two builds —
\`UAL1_Standard.glb\` with root motion stripped and \`UAL1_Standard_RM.glb\` with it baked in.
RUN 4 only had the stripped build, so it derived each clip's speed from how the feet moved.
Speed, stride and step here come from the RM build's actual pelvis translation; contact, duty,
penetration, drift, arm swing and lean come from the stripped build, so that translation does
not confound them.

**One floor for every clip**: the plane the \`Idle_Loop\` soles rest on. It does not move per
clip. \`penetration\` is how far below that plane a clip's lowest sole reaches — a property of
the clip alone, with no blend, no controller and no foot IK. See
\`qa/gta-upgrade/penetration-definitions.mjs\` for why that qualification matters.

All lengths are in game metres (upstream × ${SCALE.toFixed(5)} body scale).

## The candidates

| clip | dur | native m/s | stride | step | cadence | L contact | R contact | L→R | duty | airborne |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
`;
for(const r of rows)
 md+=`| \`${r.name}\` | ${f(r.duration,3)} s | ${f(r.speed)} | ${f(r.stride)} m | ${f(r.step)} m | ${f(r.cadence,0)} spm | ${f(r.leftContact,3)} | ${f(r.rightContact,3)} | **${f(r.offset,3)}** | ${f(r.duty,3)} | ${f(r.airborne,3)} |\n`;

md+=`
| clip | penetration vs idle floor | planted drift | hip rise | arm swing | lean (min…max) | symmetry error |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
`;
for(const r of rows)
 md+=`| \`${r.name}\` | ${f(r.penetration,1)} mm | ${f(r.drift,0)} mm | ${f(r.hipRise,0)} mm | ${f(r.armSwing,0)} mm | ${f(r.lean.min,1)}° … ${f(r.lean.max,1)}° | ${f(r.symmetry,3)} |\n`;

// ---- STEP 3: what each candidate costs at the fixed gameplay speeds ----------------------
// Gameplay speed is NOT negotiable here: PLAYER.walk 1.5, PLAYER.run 4.2. RUN 4 drives a clip
// at `period = blended stride / ground speed`, so the playback rate a clip needs at a target
// speed is target / native, and everything else follows from it.
const TARGETS=[['walk',1.5],['run',4.2]];
md+=`
## STEP 3 — what each candidate costs at the gameplay speeds

Gameplay speed is fixed: \`PLAYER.walk\` 1.5 m/s and \`PLAYER.run\` 4.2 m/s. Speeds are not
moved to suit an animation. RUN 4 drives each clip at \`period = stride / ground speed\`, so
the rate a clip needs is \`target / native\` and cadence and perceived stride follow from it.

A rate near 1.0 means the clip is being played close to as authored. Below about 0.8 it is
slow motion; above about 1.25 it is a fast-forward.

| clip | native | @1.5 m/s rate | cadence | @4.2 m/s rate | cadence | perceived step @4.2 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
`;
for(const r of rows){
 if(!r.speed)continue;
 const cells=TARGETS.map(([,t])=>{
  const rate=t/r.speed;
  return {rate,cadence:r.cadence*rate};
 });
 md+=`| \`${r.name}\` | ${f(r.speed)} m/s | ${f(cells[0].rate,3)}× | ${f(cells[0].cadence,0)} spm | **${f(cells[1].rate,3)}×** | ${f(cells[1].cadence,0)} spm | ${f(r.step)} m |\n`;
}
md+=`
Perceived step does not change with playback rate: the stride is baked into the keyframes, and
playing a clip slower makes the same long step take longer rather than making it shorter. That
is the whole of the Run problem and no amount of retiming touches it.

## Conclusion — the upstream pool contains no Run replacement

Forty-three clips in the library, and exactly four of them are upright forward locomotion:

- \`Walk_Loop\` and \`Walk_Formal_Loop\` have **identical root motion** — same 0.93 m/s, same
  1.24 m stride, same contact phases, same duty. They differ only above the waist: formal
  swings its arms 77 mm against 347 mm and leans about 2° less. It is the same walk with its
  hands kept still, not a faster one.
- \`Jog_Fwd_Loop\` at 5.10 m/s with a **2.38 m step**.
- \`Sprint_Loop\` at 7.85 m/s with a 2.62 m step, and asymmetric contacts (0.538, not 0.500).

The remaining forward loops are crouched, pushing, or swimming, at 46°–88° of lean. They are
measured above rather than dismissed by name, and they are not candidates.

**There is nothing between 0.93 m/s and 5.10 m/s.**

The gameplay run is 4.2 m/s. **At a fixed speed, step length and cadence are the same fact**
— \`step = speed / (spm/60)\` — so they are not two independent things a clip can get wrong.
The one free variable is cadence, and people running at 4.2 m/s turn their legs over at
roughly 160–170 spm, which fixes the step at **1.48–1.58 m** (1.53 m at 165 spm).

The only clip in range is \`Jog_Fwd_Loop\`, which at 4.2 m/s gives **2.38 m steps at
106 spm** — 1.55× the reference step, equivalently 0.64× the reference cadence. One
number, stated two ways. It is a bound, and that is why it reads as slow motion.

So the first pool is exhausted. The next section covers the second one.

## The second Quaternius library — checked, and it does not help

Quaternius published a **Universal Animation Library 2**, which this audit did not start
from and which had to be found. It matters for two reasons and disappoints for a third.

**Licence: CC0-1.0, verified from the bundled file, not a web page.** The archive's own
\`License.txt\` reads \`CC0 1.0 Universal ... Public Domain Dedication\`, identical in wording
to UAL1's. It was read from a repository that preserved the original archive layout
(\`Universal Animation Library 2[Standard]/Unreal-Godot/\`), so it is the licence as shipped.

**Bytes: \`UAL2_Standard.glb\`, 8,091,444 B, sha256 \`8cee20ab1bc55130…\`**, corroborated by
four unrelated repositories — two that committed the bytes, one that committed a Git-LFS
pointer recording the same hash independently, and one that committed both the bytes and the
archive layout with the licence. The official host is still unreachable from this
environment, so this is the same verify-the-bytes method RUN 2 used.

**Skeleton: identical.** 65 bones, \`root / pelvis / spine_01..03 / neck_01 / Head /
clavicle_l / upperarm_l / …\` — the same UE naming the current character uses. Anything from
UAL2 is a drop-in with no retargeting at all.

**Content: no run, and no jog.** All 43 clips were measured for root-motion speed rather than
judged by name. The fastest upright forward motions are:

| clip | duration | travel | speed |
| --- | ---: | ---: | ---: |
| \`Slide_Start\` | 0.833 s | 3.88 m | 4.65 m/s |
| \`Slide_Loop\` | 2.000 s | 8.57 m | 4.28 m/s |
| \`Hit_Knockback\` | 0.833 s | 2.93 m | 3.51 m/s |
| \`ClimbUp_1m\` | 0.667 s | 1.59 m | 2.39 m/s |
| \`Zombie_Walk_Fwd_Loop\` | 1.333 s | 1.33 m | 1.00 m/s |
| \`Walk_Carry_Loop\` | 2.000 s | 1.24 m | 0.62 m/s |

\`Slide_Loop\` reaches 4.28 m/s, almost exactly the gameplay run speed, and it is a **slide**
— the character is not on its feet. UAL2 is a themed action pack (sword, shield, farming,
zombie, ninja), not a locomotion pack. It contains no running gait of any kind.

**One finding worth keeping for later:** \`Hit_Knockback\` carries 2.93 m of travel, against a
current \`Hit\` that barely moves at all. When the deferred *hit = C* item is picked up, this
is very likely the answer, it is CC0, and it needs no retargeting. Not implemented here —
RUN 5.5 is the Run slot only.

## Conclusion — this is the \`IF NO GOOD CLIP EXISTS\` branch

Both Quaternius libraries have been enumerated and measured. Neither contains a clip that can
serve a 4.2 m/s run. There is no UAL3. The brief's instruction for this case is explicit: do
not modify the existing clip to fit, investigate external sources, and **stop and report
before introducing anything**. That is what has been done; see the RUN 5.5 note.
`;

writeFileSync('docs/ANIMATION-LOCOMOTION-AUDIT.md',md);
console.log(md);
