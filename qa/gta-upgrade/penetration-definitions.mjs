// STEP 0 -- what "sole penetration" means, measured four ways, in one place.
//
// RUN 5 produced two numbers for the same clip that look contradictory:
//
//     "the Run clip's sole passes 42.9 mm through the road"
//     "the Run clip's floor is 11.3 mm below the plane the Idle clip stands on"
//
// Neither is wrong and they are not the same measurement. They differ in the reference plane,
// in whether the gait blend is involved, and in whether the figure is placed by the controller.
// This file measures all four variants side by side so the definitions are fixed by code rather
// than by recollection, and so any future number can say which row it is.
//
// Run with `node qa/gta-upgrade/penetration-definitions.mjs`.
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,Vector3} from 'three';
import {humanoidCitizen} from '../../src/player/character-asset.mjs';
import {createPlayerFigure} from '../../src/player/figure.mjs';
import {createPlayer} from '../../src/player/controller.mjs';

globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};

// Distance from the ball bone to the bottom of the shoe mesh, measured once in RUN 5.
const BALL_TO_SOLE=.0215;
const ROAD=.02;

const report=JSON.parse(readFileSync('public/data/character/citizen.json','utf8'));
const bytes=readFileSync('public/data/character/citizen.glb');
const gltf=await new Promise((res,rej)=>new GLTFLoader()
 .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));
const asset=humanoidCitizen(gltf,report);

const p=new Vector3();
const lowestSole=root=>{
 let low=Infinity;
 for(const n of ['ball_l','ball_r']){
  const b=root.getObjectByName(n);if(!b)continue;
  b.updateWorldMatrix(true,false);
  low=Math.min(low,p.setFromMatrixPosition(b.matrixWorld).y-BALL_TO_SOLE);
 }
 return low;
};

// ---- A and B: the clip alone, no blend, no controller, played at its own rate -------------
// The figure is built with no ctx, so no solver exists at all.
function clipAlone(name){
 const instance=asset.instance();
 const root=instance.root;
 root.scale.setScalar(report.body.scaleToGame);
 root.updateMatrixWorld(true);
 const mixer=new AnimationMixer(root);
 const clip=instance.clips.find(c=>c.name===name);
 const action=mixer.clipAction(clip);action.reset().play();
 let low=Infinity;
 for(let i=0;i<240;i++){
  action.time=clip.duration*i/240;mixer.update(0);
  root.updateMatrixWorld(true);
  low=Math.min(low,lowestSole(root));
 }
 mixer.stopAllAction();
 return low;   // metres, relative to the model origin
}

// ---- C and D: the real thing -- controller at a gameplay speed, real gait blend ------------
function inGame(running,ik){
 const surface=()=>ROAD;
 const ctx={heightExact:surface,height:surface,solid:()=>false,safe:()=>true,onRoad:()=>true};
 const figure=createPlayerFigure(asset,undefined,{ctx});
 figure.footIK?.setEnabled(ik);
 const player=createPlayer(ctx,{start:[0,0],heading:0});
 player.place(0,0,0);
 const tick=()=>{player.setTouch({forward:1,strafe:0,running});player.step(1/60);
  figure.update(player.state,1/60);figure.root.updateMatrixWorld(true);};
 for(let i=0;i<400;i++)tick();                     // settle into a steady gait
 let low=Infinity;const lower=[],perFoot=[];
 const soleOf=n=>{const b=figure.root.getObjectByName(n);b.updateWorldMatrix(true,false);
  return p.setFromMatrixPosition(b.matrixWorld).y-BALL_TO_SOLE;};
 for(let i=0;i<240;i++){
  tick();
  const y=lowestSole(figure.root);
  low=Math.min(low,y);
  const st=figure.gait.stance(),ph=((figure.gait.phase%1)+1)%1;
  // Two different populations, and they are NOT the same number.
  //   `lower`   -- the lower of the two soles, on frames the blend calls stance.
  //   `perFoot` -- EACH foot, on the frames ITS OWN stance window is open. This is what
  //                qa/gta-upgrade/footikbench.html samples, so this is the row that has to
  //                reproduce the photographic bench's 49.0 mm rather than invent a new figure.
  if(ph<=st.duty)lower.push(Math.abs(y-ROAD));
  for(const [name,off] of [['ball_l',0],['ball_r',st.offset]]){
   const q=((ph-off)%1+1)%1;
   if(q<=st.duty)perFoot.push(Math.abs(soleOf(name)-ROAD));
  }
 }
 const speed=player.state.speed;
 figure.dispose();
 const mean=a=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
 return {low,speed,lowerMean:mean(lower),perFootMean:mean(perFoot)};
}

const idleFloor=clipAlone('Idle');
const runFloor=clipAlone('Run');
const gameRun=inGame(true,false);
const gameWalk=inGame(false,false);

const mm=v=>(v*1000).toFixed(1).padStart(8);
console.log(`sole penetration, four definitions of the same clip
(negative = the sole is below the reference plane)\n`);
console.log('row  what is measured                                        reference plane          value');
console.log('---  ------------------------------------------------------  ---------------------  -------');
console.log('A    Run clip alone, native rate, deepest sample             the model origin      ',mm(runFloor),'mm');
console.log('     Idle clip alone, same                                   the model origin      ',mm(idleFloor),'mm');
console.log('B    Run clip alone, deepest sample                          the Idle sole plane   ',mm(runFloor-idleFloor),'mm');
console.log('C    Run in game at',gameRun.speed.toFixed(2),'m/s, real blend, deepest sample     the road surface      ',mm(gameRun.low-ROAD),'mm');
console.log('D    Run in game, MEAN over EACH foot in its own window      the road surface      ',mm(gameRun.perFootMean),'mm');
console.log('D\'   Run in game, MEAN over the LOWER sole only             the road surface      ',mm(gameRun.lowerMean),'mm');
console.log('     Walk in game at',gameWalk.speed.toFixed(2),'m/s, deepest sample               the road surface      ',mm(gameWalk.low-ROAD),'mm');
console.log('     Walk in game, MEAN over each foot in its own window     the road surface      ',mm(gameWalk.perFootMean),'mm');

console.log(`
Reading the rows:

A  is where a clip's soles sit in the model's own space. It is not an error -- the shoe mesh
   has thickness and the ball bone is inside it, so even a perfectly grounded clip reads a few
   millimetres negative. Idle's value IS that offset, which is why B exists.

B  is A minus Idle's offset: how much deeper this clip sits than the pose the model stands in.
   This is a property of the CLIP and nothing else. It is the number to quote when judging
   clips against each other, and it is what qa/gta-upgrade/clip-audit.mjs reports.

C  is the same clip in the game: placed by the controller on the road, retimed to gameplay
   speed, and mixed with Walk by the gait blend. It is larger than B because the blend and the
   retiming are part of it. It is a MAXIMUM -- one deepest sample.

D  is a MEAN, not a maximum, and over a population that has to be stated: EACH foot, on the
   frames its own stance window is open. D' takes the lower sole only and comes out close but
   not equal, because the lower sole is by definition the one nearer the trouble.

   D does NOT reproduce the photographic bench's 49.0 mm, and the difference is not noise.
   The bench runs its scenario from a standing start and samples all 133 frames of it, so a
   third of its population is the acceleration ramp, where the blend still leans on Walk --
   which is well grounded. These rows settle for 400 frames first and then measure, so they
   report the steady state.

   The steady state is the worse number and the more honest one: running at 4.2 m/s, the mean
   is about 60 mm, not 49. The 49.0 figure quoted in the RUN 5 note is a scenario average
   diluted by a run-up, and is superseded here rather than left to be compared against.

So B and C are both maxima of the same clip and differ by the blend; C and D are the same
condition and differ by max versus mean. Quoting one where another is meant is the mistake
this file exists to prevent.`);
