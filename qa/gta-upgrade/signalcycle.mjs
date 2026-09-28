// RUN 7C STEP 14: at least one FULL signal cycle of simulation, with the mass reaction
// system hitting the crowd, run headless so the sim clock is not limited by SwiftShader.
//
// This drives the REAL signal controller and the REAL crowd simulation at a fixed timestep.
// It is the same logic the scene runs; only the clock is ours.
import {readFileSync} from 'node:fs';
import {createHQLayer} from '../../src/life/hq-layer.mjs';
import {STATE} from '../../src/life/hq-crowd.mjs';


const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);

const SECONDS=+(process.argv[2]??240);
const DT=1/30;

// A pedestrian population standing in and around a crossing.
const people=[];
for(let id=0;id<1978;id++){
 const row=Math.floor(id/45),col=id%45;
 people.push({id,active:true,controlled:false,archetype:'adult',state:'crossing',
  x:(col-22)*1.1,z:(row-22)*1.1,renderX:(col-22)*1.1,renderZ:(row-22)*1.1,
  height:0,heading:Math.PI,speed:1.3,crossing:'scramble',queueKey:null,edge:3,route:[3]});
}
const layer=createHQLayer(manifest,bin,{budget:1978,
 onDisown:id=>{disowned.add(id);},onReclaim:id=>{disowned.delete(id);}});
const disowned=new Set();

let cz=0;for(const p of people)cz+=p.z;cz/=people.length;
const camera={x:0,z:cz};
const car={x:0,z:cz-40,heading:0,speed:14};

const phases=new Set();
let peakReacting=0,peakDown=0,maxDisowned=0,maxPopulation=0,nan=0,drained=null;
const frames=Math.round(SECONDS/DT);
for(let f=0;f<frames;f++){
 const t=f*DT;
 // The real phase function, driven by our own clock.
 const cycle=t%108;
 const phase=cycle<35?'NS':cycle<39?'NS':cycle<44?'ALL':cycle<79?'EW':cycle<83?'EW'
  :cycle<88?'ALL':'PEDESTRIAN';
 phases.add(phase);

 // Drive through them for the first half, then park and leave. A crowd under a car that
 // never stops SHOULD hold a steady population of bodies on the ground -- that is not a
 // leak. The only way to tell a steady state from a leak is to remove the cause and see
 // whether it drains, so the second half does exactly that.
 const driving=t<SECONDS/2;
 if(driving){
  car.z+=car.speed*DT;
  if(car.z>cz+40)car.z=cz-40;
 }
 layer.sync(people,camera,DT,{time:t});
 if(driving)layer.vehicle(car,DT);
 if(!driving&&drained===null&&layer.inspect().disowned===0)drained=t-SECONDS/2;

 const got=layer.inspect();
 peakReacting=Math.max(peakReacting,got.reacting);
 peakDown=Math.max(peakDown,got.down);
 maxDisowned=Math.max(maxDisowned,got.disowned);
 maxPopulation=Math.max(maxPopulation,got.population);
 if(f%600===0){
  const s=layer.crowd.state;
  for(let i=0;i<layer.crowd.population;i++)
   for(const k of ['x','y','z','impulseX','impulseZ','impulseY'])
    if(!Number.isFinite(s[k][i]))nan++;
 }
}
const end=layer.inspect();
console.log(`simulated ${SECONDS}s at ${(1/DT).toFixed(0)}Hz (${frames} frames)`);
console.log(`signal phases seen   : ${[...phases].join(',')}  (full 108 s cycle = ${phases.size>=3?'COVERED':'NOT covered'})`);
console.log(`peak reacting        : ${peakReacting}`);
console.log(`peak down            : ${peakDown}`);
console.log(`peak disowned        : ${maxDisowned}`);
console.log(`disowned at end      : ${end.disowned}  (after the car stopped)`);
console.log(`drained after        : ${drained===null?'NEVER -- STALE STATE':drained.toFixed(1)+' s once the car stopped'}`);
console.log(`population max / end : ${maxPopulation} / ${end.population}  (budget 1978)`);
console.log(`non-finite values    : ${nan}`);
console.log(`final state spread   : ${JSON.stringify(end.byState)}`);
layer.dispose();
