// Foot contact, in millimetres, without a renderer.
//
// The photographic bench next to this file (footikbench.html) needs a browser and a GPU; this
// needs neither, so the numbers in docs/RUN5-FOOT-IK-2026-09-21.md can be reproduced with
// `node qa/gta-upgrade/footik-contact.mjs` on any checkout. Two tables:
//
//   1. contact error per surface, solver off against solver on
//   2. the pelvis-drop sweep, which is why the hips take the whole of a kerb and not a share
//
// Error is measured at the ball of the foot, not the ankle, because ankle-to-sole distance
// changes with ankle pitch and would conflate a tilted foot with a floating one.
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3} from 'three';
import {humanoidCitizen} from '../../src/player/character-asset.mjs';
import {createPlayerFigure} from '../../src/player/figure.mjs';
import {createPlayer} from '../../src/player/controller.mjs';
import {FOOT_IK} from '../../src/player/foot-ik.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};

const BALL_TO_SOLE=.0215;
// Shibuya's real numbers, from src/ground/config.mjs: road 2 cm, kerb 15 cm, ramp 1.5 m long.
const ROAD=.02,CURB=.15,RAMP=1.5;
const kerb=x=>x<0?CURB:ROAD;
const ramp=x=>x<-RAMP?CURB:x>0?ROAD:ROAD+(CURB-ROAD)*(-x/RAMP);

const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const bytes=readFileSync('public/data/character/citizen.glb');
const gltf=await new Promise((res,rej)=>new GLTFLoader()
 .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
const asset=humanoidCitizen(gltf,report);

/**
 * Stand the figure for a second and a half and measure both soles.
 *
 * `seen` is the surface the solver is allowed to query and `real` the one the error is
 * measured against; they differ only in the pelvis sweep, where clamping what the solver can
 * see is how the drop is capped without unfreezing FOOT_IK.
 */
function stand({seen,real=seen,stand:groundY,x=0,ik=true}){
 const ctx={heightExact:seen,height:seen,solid:()=>false,safe:()=>true,onRoad:()=>false};
 const figure=createPlayerFigure(asset,undefined,{ctx});
 figure.footIK.setEnabled(ik);
 const state={x,y:groundY,z:0,heading:0,bodyHeading:0,speed:0,alive:true,vehiclePhase:0};
 for(let i=0;i<90;i++)figure.update(state,1/60);
 figure.root.updateMatrixWorld(true);
 const feet=['ball_l','ball_r'].map(name=>{
  const bone=figure.root.getObjectByName(name);
  bone.updateWorldMatrix(true,false);
  const at=new Vector3().setFromMatrixPosition(bone.matrixWorld);
  return (at.y-BALL_TO_SOLE-real(at.x))*1000;
 });
 const stats={...figure.footIK.stats};
 figure.dispose();
 return {feet,stats};
}

const mm=v=>v.toFixed(1).padStart(8);
const mean=v=>v.reduce((a,b)=>a+Math.abs(b),0)/v.length;

console.log('contact error at the sole, standing (mm; negative is into the ground)\n');
console.log('surface           off L      off R   off mean       on L       on R    on mean  solved  pelvis');
const cases=[
 ['flat pavement',()=>CURB,CURB,0],
 ['flat road',()=>ROAD,ROAD,0],
 ['kerb, astride',kerb,CURB,0],
 ['kerb ramp, mid',ramp,ramp(-RAMP/2),-RAMP/2]
];
for(const [name,surface,groundY,x] of cases){
 const off=stand({seen:surface,stand:groundY,x,ik:false});
 const on=stand({seen:surface,stand:groundY,x,ik:true});
 console.log(name.padEnd(15),mm(off.feet[0]),mm(off.feet[1]),mm(mean(off.feet)),
  mm(on.feet[0]),mm(on.feet[1]),mm(mean(on.feet)),
  String(on.stats.solved).padStart(7),
  (on.stats.pelvisDrop*1000).toFixed(0).padStart(6)+'mm');
}

console.log('\npelvis drop against a 13 cm kerb: how much should the hips take?\n');
console.log('cap(mm)   pelvis    low foot   high foot       mean      worst');
for(const cap of [0,.02,.04,.06,.08,.10,.13,FOOT_IK.maxPelvisDrop]){
 // Capping by clamping what the solver may see: a surface that never drops more than `cap`
 // below the pavement cannot ask for more than `cap` of pelvis. Error is still measured
 // against the real kerb.
 const {feet,stats}=stand({seen:x=>Math.max(kerb(x),CURB-cap),real:kerb,stand:CURB});
 console.log(String(Math.round(cap*1000)).padStart(6),
  (stats.pelvisDrop*1000).toFixed(0).padStart(8)+'mm',
  mm(feet[0]),mm(feet[1]),mm(mean(feet)),mm(Math.max(...feet.map(Math.abs))));
}
console.log('\nFOOT_IK.maxPelvisDrop =',FOOT_IK.maxPelvisDrop*1000,
 'mm -- a safety rail; a 13 cm kerb asks for 13 cm.');

// ---------------------------------------------------------------------------------------
// Foot sliding, which RUN 4 left open and RUN 5 deliberately does not touch.
//
// How far a sole travels across the ground while it is planted. RUN 5 adds no horizontal
// correction -- the plant lock was built, measured, and removed -- so the expected result is
// that the two columns are identical. Printing them is how that stays true.
console.log('\nfoot slide while planted (mm of ground travel per plant)\n');
console.log('gait        speed   IK   plants   mean slide   worst   as % of step');
function slide(forward,running,ik){
 const figure=createPlayerFigure(asset,undefined,{ctx:{heightExact:()=>CURB,height:()=>CURB,
  solid:()=>false,safe:()=>true,onRoad:()=>false}});
 figure.footIK.setEnabled(ik);
 const player=createPlayer({heightExact:()=>CURB,height:()=>CURB,solid:()=>false,
  safe:()=>true,onRoad:()=>false},{start:[0,0],heading:0});
 player.place(0,0,0);
 const p=new Vector3();
 const at=name=>{const b=figure.root.getObjectByName(name);b.updateWorldMatrix(true,false);
  return p.setFromMatrixPosition(b.matrixWorld).clone();};
 const tick=()=>{player.setTouch({forward,strafe:0,running});player.step(1/60);
  figure.update(player.state,1/60);};
 for(let i=0;i<300;i++)tick();                       // settle into a steady gait
 const plants=[];const open={ball_l:null,ball_r:null};
 let steps=0,lastPhase=0;
 for(let i=0;i<360;i++){
  tick();
  figure.root.updateMatrixWorld(true);
  const st=figure.gait.stance(),ph=figure.gait.phase;
  if(ph<lastPhase)steps++;lastPhase=ph;
  for(const [name,off] of [['ball_l',0],['ball_r',st.offset]]){
   const q=((ph-off)%1+1)%1,here=at(name);
   if(q<=st.duty){
    if(!open[name])open[name]={from:here,max:0};
    else open[name].max=Math.max(open[name].max,Math.hypot(here.x-open[name].from.x,here.z-open[name].from.z));
   }else if(open[name]){plants.push(open[name].max*1000);open[name]=null;}
  }
 }
 const step=steps?player.state.speed*(360/60)/(steps*2)*1000:0;
 figure.dispose();
 return {speed:player.state.speed,n:plants.length,step,
  mean:plants.reduce((a,b)=>a+b,0)/Math.max(1,plants.length),
  worst:Math.max(0,...plants)};
}
for(const [forward,running,label] of [[.33,false,'0.5 m/s'],[.66,false,'1.0 m/s'],
                                      [1,false,'walk 1.5'],[1,true,'run 4.2']]){
 for(const ik of [false,true]){
  const r=slide(forward,running,ik);
  console.log(label.padEnd(11),r.speed.toFixed(2).padStart(5),(ik?'on':'off').padStart(5),
   String(r.n).padStart(8),mm(r.mean),mm(r.worst),
   (r.step?(100*r.mean/r.step).toFixed(1):'--').padStart(14));
 }
}

// ---------------------------------------------------------------------------------------
// Where the clips actually put their feet, against where `duty` says they do.
//
// Foot IK corrects the DIFFERENCE between the ground under a foot and the ground the body
// stands on. On flat ground that difference is zero, so the solver correctly does nothing --
// and whatever the clip does with its foot on flat ground is what you see. This table is that:
// the clip's own contact quality, which RUN 5 does not touch and cannot touch by design.
//
// It also checks the stance window against the clip, because `duty` decides when the solver is
// allowed to correct, and a window wider than the real contact lets it correct a swinging foot.
console.log('\nwhat the clips do on flat ground, and how well duty describes it\n');
console.log('gait    speed   sole lowest   real contact band   duty window   mean |error| in window');
for(const [label,running] of [['walk',false],['run',true]]){
 const surface=()=>ROAD;
 const figure=createPlayerFigure(asset,undefined,{ctx:{heightExact:surface,height:surface,
  solid:()=>false,safe:()=>true,onRoad:()=>true}});
 const player=createPlayer({heightExact:surface,height:surface,solid:()=>false,
  safe:()=>true,onRoad:()=>true},{start:[0,0],heading:0});
 player.place(0,0,0);
 const p=new Vector3();
 const sole=()=>{const b=figure.root.getObjectByName('ball_l');b.updateWorldMatrix(true,false);
  return (p.setFromMatrixPosition(b.matrixWorld).y-BALL_TO_SOLE-ROAD)*1000;};
 const tick=()=>{player.setTouch({forward:1,strafe:0,running});player.step(1/60);
  figure.update(player.state,1/60);figure.root.updateMatrixWorld(true);};
 for(let i=0;i<400;i++)tick();
 const rows=[];
 for(let i=0;i<120;i++){tick();
  const st=figure.gait.stance(),ph=((figure.gait.phase%1)+1)%1;
  rows.push({ph,duty:st.duty,y:sole()});}
 const lowest=Math.min(...rows.map(r=>r.y));
 const near=rows.filter(r=>r.y<lowest+20).map(r=>r.ph);
 const inWindow=rows.filter(r=>r.ph<=r.duty).map(r=>Math.abs(r.y));
 console.log(label.padEnd(7),player.state.speed.toFixed(2).padStart(5),
  mm(lowest),
  `   ${Math.min(...near).toFixed(2)}..${Math.max(...near).toFixed(2)}`.padStart(20),
  `0.00..${rows[0].duty.toFixed(2)}`.padStart(14),
  mm(inWindow.reduce((a,b)=>a+b,0)/inWindow.length));
 figure.dispose();
}
console.log(`
The run clip's sole passes through the road. That is the clip, not the solver: on flat ground
the surface under the foot and the surface under the body are the same, the correction is zero,
and the animation is shown as authored. A foot IK that aimed the ankle at an absolute height
would hide it, at the cost of the heel-to-toe roll -- which is the trade this run declined.
The duty window is also wider than the clip's real contact, most of all for the run. On flat
ground that is harmless, because a zero correction is zero however long it lasts. On a kerb it
would let a swinging foot be corrected. Left alone here rather than retuned on one character;
see the RUN 5 note.`);
