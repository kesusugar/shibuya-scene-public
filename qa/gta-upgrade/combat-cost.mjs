// RUN 8 STEP 26: what melee and its crowd reaction cost the CPU, measured rather than guessed.
//
// CPU-side only. This project does not accept a SwiftShader frame rate as performance
// evidence, so nothing here reports one -- the numbers are milliseconds of JavaScript per
// frame, on a fixed population, with the clock stepped deterministically.
//
// Two costs are separated on purpose, because they scale differently:
//   melee.update  -- the fight itself. Bounded by the grid cells inside COMBAT.notice, so it
//                    should be flat in population and rise only with the number of hostiles.
//   witness       -- the crowd noticing. Bounded by the query radius, so it rises with
//                    density inside 11 m and not with the size of the city.
import {readFileSync} from 'node:fs';
import {createHQLayer} from '../../src/life/hq-layer.mjs';
import {appearanceOf} from '../../src/life/appearance.mjs';
import {createMeleeCombat,COMBAT} from '../../src/player/combat.mjs';

const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);

/** A stand-in for the parts of the simulation combat touches, with a real spatial grid. */
function world(people){
 const c={time:0,
  network:{ctx:{safe:()=>true,height:()=>0}},
  grid:new Map(),
  cell:(x,z)=>Math.floor(x/2)+','+Math.floor(z/2),
  insert(p){const k=c.cell(p.x,p.z);if(!c.grid.has(k))c.grid.set(k,[]);c.grid.get(k).push(p);},
  leave(p){p.crossing=null;p.queueKey=null;},
  strike(p,dx,dz,speed){c.leave(p);p.struck=0;p.struckX=dx;p.struckZ=dz;p.struckSpeed=speed;return true;},
  say(){return true;},vehicleOverlap:()=>false,blocked:()=>false};
 for(const p of people)c.insert(p);
 return c;
}

/** `count` pedestrians packed at Shibuya crossing density around the origin. */
function population(count){
 const people=[];
 for(let id=0;id<count;id++){
  // A disc of ~1.1 people per square metre at the centre, thinning outwards: the golden-angle
  // spiral the rest of the QA harnesses use, so the numbers are comparable.
  const angle=id*.618*Math.PI*2,radius=Math.sqrt(id)*.95;
  people.push({id,active:true,controlled:false,choreographed:false,archetype:'adult',
   state:'walking',x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,
   renderX:Math.cos(angle)*radius,renderZ:Math.sin(angle)*radius,
   heading:angle,speed:1.3,crossing:null,queueKey:null,combatHealth:100,
   combatTarget:null,combatUntil:0,combatNext:0,combatAction:0,combatDead:false,
   height:0,lod:'far',phase:0,travelled:0,animationTime:0});
 }
 return people;
}

const COUNTS=[64,256,1024,1978];
const FRAMES=600;                                  // ten seconds of fighting at 60 Hz
// How many bystanders are already hostile when the measurement starts. A player who punches
// once fights one person; the number that matters is the worst case the retaliation loop can
// reach, so it is set rather than waited for.
const HOSTILES=Number(process.argv[2]??12);

console.log('RUN 8 melee cost -- '+FRAMES+' frames at 1/60 s, '+HOSTILES+' hostiles.');
console.log('CPU only. No frame rate is claimed: this runs on SwiftShader-class hardware and\n'
 +'a frame rate from it is not evidence of anything.\n');
console.log('people  hostiles  melee ms/f  melee us/f  witness ms  first react  seen  swings hits');

for(const count of COUNTS){
 const people=population(count),c=world(people);
 const layer=createHQLayer(manifest,bin,{budget:Math.min(count,1978)});
 for(const p of people){
  const look=appearanceOf(p.id);
  layer.crowd?.spawn?.(p.id,look,0,{x:p.x,z:p.z,heading:p.heading,speed:p.speed});
 }
 let witnessMs=0,witnessCalls=0,firstReact=-1,candidates=0;
 const melee=createMeleeCombat({onWitness(e){
  const t=performance.now();
  const n=layer.witness(e);
  witnessMs+=performance.now()-t;witnessCalls++;
  // Only the FIRST event's reaction count is reported. Later punches legitimately move fewer
  // people, because someone already fleeing is not made to flee again, and averaging the two
  // would read as the crowd ignoring the fight.
  if(firstReact<0)firstReact=n;
  candidates=Math.max(candidates,layer.inspect().witnessCandidates);
  return n;
 }});
 const state={x:0,z:0,heading:0,bodyHeading:0,alive:true,health:100,attackTime:0,hurtTime:0};
 const player={state,startAttack(){return true;},
  hurt(){state.health=100;return true;}};   // the player never dies, so the fight never stops

 // The retaliation loop is what scales with a brawl, so it is loaded deliberately: the
 // nearest `HOSTILES` pedestrians are already angry, and their health is set beyond what the
 // measured run can remove so the fight lasts the whole measurement.
 const angry=[...people].sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z)).slice(0,HOSTILES);
 for(const p of angry){p.combatHealth=1e6;p.combatTarget='player';p.combatUntil=1e6;}

 for(let f=0;f<60;f++){c.time+=1/60;melee.update(1/60,c,player);}   // warm
 const t0=performance.now();
 for(let f=0;f<FRAMES;f++){
  c.time+=1/60;
  if(f%30===0)melee.request();                  // two punches a second, held down
  melee.update(1/60,c,player);
 }
 const total=performance.now()-t0;
 const meleeMs=(total-witnessMs)/FRAMES;
 const s=melee.snapshot();
 const hostiles=people.filter(p=>p.combatTarget==='player').length;
 console.log(
  String(count).padStart(6)
  +String(hostiles).padStart(10)
  +meleeMs.toFixed(4).padStart(12)
  +(meleeMs*1000).toFixed(1).padStart(12)
  +(witnessCalls?witnessMs/witnessCalls:0).toFixed(3).padStart(12)
  +String(firstReact).padStart(13)
  +String(candidates).padStart(6)
  +String(s.swings).padStart(8)+String(s.hits).padStart(5));
 melee.dispose();layer.dispose();
}
