// RUN 7A STEP 11-12: drive a car through a dense crowd and count who reacts.
import {readFileSync} from 'node:fs';
import {createHQCrowd,STATE} from '../../src/life/hq-crowd.mjs';
import {createCrowdGrid,applyVehicleThreat,THREAT} from '../../src/life/hq-threat.mjs';
import {appearanceOf} from '../../src/life/appearance.mjs';

const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const laneOf=new Map(manifest.archetypes.map((a,i)=>[a.id,i]));

const POP=1978;
const crowd=createHQCrowd(manifest,bin,{capacity:Math.ceil(POP*.42)+32,lod:'L2'});
// A dense block, roughly a scramble crossing's middle: 1.1 m apart.
let placed=0;
for(let id=0;id<POP;id++){
 const look=appearanceOf(id);
 const row=Math.floor(id/45),col=id%45;
 if(crowd.spawn(id,look,laneOf.get(look.archetype.id)??0,
  {x:(col-22)*1.1,z:(row-22)*1.1,heading:Math.PI,speed:1.3})>=0)placed++;
}
const grid=createCrowdGrid();
const scratch=[];
console.log(`crowd ${placed} citizens, grid cell ${grid.cell} m`);
console.log('');
console.log('speed  frame  cells  candidates  %scanned   look  avoid  flee  DOWN  query us  total us'
+'                                        (counts are pedestrians CURRENTLY in that state)');

for(const speed of [3,8,14]){
 // Fresh state each run.
 for(let i=0;i<crowd.population;i++)crowd.setState(i,STATE.NORMAL,{force:true});
 const car={x:0,z:-28,heading:0,speed};
 let peak=null,totalHit=0;
 for(let f=0;f<90;f++){
  car.z+=speed*(1/60);
  grid.rebuild(crowd);
  const t=performance.now();
  const r=applyVehicleThreat(crowd,grid,car,1/60,scratch);
  const queryUs=(performance.now()-t)*1000;
  const t2=performance.now();
  crowd.update(1/60,{time:f/60});
  const totalUs=queryUs+(performance.now()-t2)*1000;
  totalHit+=r.hit;
  // What matters is how many are REACTING right now, not how many changed state this frame:
  // someone already fleeing does not change state, and counting only transitions made a
  // crowd of hundreds look like a crowd of four.
  const live={look:0,avoid:0,flee:0,down:0};
  for(let i=0;i<crowd.population;i++){
   const b=crowd.state.behaviour[i];
   if(b===STATE.LOOK)live.look++;
   else if(b===STATE.AVOID)live.avoid++;
   else if(b===STATE.FLEE)live.flee++;
   else if(b===STATE.HIT||b===STATE.KNOCKDOWN||b===STATE.DOWNED)live.down++;
  }
  const score=live.down*100+live.flee+live.avoid+live.look;
  if(!peak||score>peak.score)peak={...r,...live,score,f,queryUs,totalUs};
 }
 console.log(
  String(speed).padStart(5)
  +String(peak.f).padStart(7)
  +String(peak.cells).padStart(7)
  +String(peak.candidates).padStart(12)
  +((100*peak.candidates/crowd.population).toFixed(1)+'%').padStart(10)
  +String(peak.look).padStart(7)
  +String(peak.avoid).padStart(7)
  +String(peak.flee).padStart(6)
  +String(peak.down).padStart(6)
  +peak.queryUs.toFixed(1).padStart(10)
  +peak.totalUs.toFixed(1).padStart(10)
  +`   (${totalHit} hit over the pass)`);
}

// How many can be knocked down in ONE frame?
console.log('\n--- simultaneous hits in a single frame ---');
for(const width of [1.15,3,6,12,24]){
 for(let i=0;i<crowd.population;i++)crowd.setState(i,STATE.NORMAL,{force:true});
 grid.rebuild(crowd);
 const car={x:0,z:0,heading:0,speed:16};
 const saved=THREAT_WIDTH(width);
 const t=performance.now();
 const r=applyVehicleThreat(crowd,grid,car,1/60,scratch);
 const us=(performance.now()-t)*1000;
 saved();
 console.log(`half-width ${String(width).padStart(5)} m -> ${String(r.hit).padStart(4)} knocked down `
  +`in one frame, ${us.toFixed(1)} us (${r.candidates} candidates scanned)`);
}
function THREAT_WIDTH(w){
 const mod=THREAT;const old=mod.hitRadius;
 Object.defineProperty(mod,'hitRadius',{value:w,configurable:true,writable:true});
 return()=>Object.defineProperty(mod,'hitRadius',{value:old,configurable:true,writable:true});
}

// The claim the grid makes is that cost follows the RADIUS, not the population. Proving it
// needs the same query over the same area at different densities.
console.log('\n--- is the query bounded by radius or by population? ---');
for(const spacing of [1.1,1.6,2.4,3.4]){
 for(let i=0;i<crowd.population;i++){
  const row=Math.floor(i/45),col=i%45;
  crowd.place(i,(col-22)*spacing,0,(row-22)*spacing,Math.PI,1.3);
 }
 grid.rebuild(crowd);
 const t=performance.now();
 applyVehicleThreat(crowd,grid,{x:0,z:0,heading:0,speed:14},1/60,scratch);
 const us=(performance.now()-t)*1000;
 const area=Math.PI*(Math.max(THREAT.look,14*1.2)+2)**2;
 console.log(`spacing ${spacing.toFixed(1)} m -> ${String(scratch.length).padStart(4)} candidates `
  +`of ${crowd.population} (${(100*scratch.length/crowd.population).toFixed(1)}%), `
  +`density ${(crowd.population/((45*spacing)**2)).toFixed(2)}/m2, `
  +`expected ~${Math.round(area*crowd.population/((45*spacing)**2))}, ${us.toFixed(0)} us`);
}
crowd.dispose();
