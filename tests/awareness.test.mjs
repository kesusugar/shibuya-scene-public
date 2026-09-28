import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHQCrowd,STATE,STATE_HOLD} from '../src/life/hq-crowd.mjs';
import {createCrowdGrid,applyVehicleThreat} from '../src/life/hq-threat.mjs';
import {createAwareness,playerThreat,wantedFor,traitsOf,AWARE} from '../src/life/hq-awareness.mjs';
import {appearanceOf,ARCHETYPES} from '../src/life/appearance.mjs';

const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const laneOf=new Map(manifest.archetypes.map((a,i)=>[a.id,i]));

/** A crowd holding `people`, each {id,x,z,heading}. */
function crowdOf(people){
 const crowd=createHQCrowd(manifest,bin,{capacity:people.length+8,lod:'L1'});
 for(const p of people){
  const look=appearanceOf(p.id);
  crowd.spawn(p.id,look,laneOf.get(look.archetype.id)??0,
   {x:p.x,z:p.z,heading:p.heading??0,speed:p.speed??1.2});
 }
 return crowd;
}
const gridFor=crowd=>{const g=createCrowdGrid();g.rebuild(crowd);return g;};
const player=(o={})=>({x:0,z:0,heading:0,course:0,speed:0,alive:true,...o});
/** Run the awareness pass for `seconds`, rebuilding the grid as the real layer does. */
function run(aware,crowd,p,seconds,dt=1/30){
 const g=createCrowdGrid();
 for(let t=0;t<seconds;t+=dt){g.rebuild(crowd);aware.update(crowd,g,p,dt);crowd.update(dt,{time:t});}
 return crowd;
}
const stateOf=(crowd,slot=0)=>crowd.state.behaviour[slot];

test('a severe nearby punch interrupts recovery, a glance does not',()=>{
 const id=Array.from({length:50},(_,i)=>i+10).find(i=>traitsOf(i).nerve<.4);
 const crowd=crowdOf([{id,x:0,z:.3,heading:Math.PI}]);
 crowd.setState(0,STATE.RECOVER,{force:true});
 const aware=createAwareness(),grid=gridFor(crowd);
 aware.witness(crowd,grid,{x:0,z:0,severity:.12,radius:11});
 assert.equal(stateOf(crowd),STATE.RECOVER,'a harmless glance interrupted recovery');
 aware.witness(crowd,grid,{x:0,z:0,severity:1,radius:11});
 assert.ok(stateOf(crowd)>=STATE.AVOID&&stateOf(crowd)<=STATE.FLEE,
  'a new violent event was ignored during recovery');
 crowd.dispose();
});

test('an urgent vehicle approach interrupts recovery without waiting for player perception',()=>{
 const crowd=crowdOf([{id:17,x:0,z:4,heading:Math.PI}]);
 crowd.setState(0,STATE.RECOVER,{force:true});
 const result=applyVehicleThreat(crowd,gridFor(crowd),
  {x:0,z:0,heading:0,speed:11},1/60,[]);
 assert.ok(result.fled>=1,'recovery hid an approaching vehicle');
 assert.equal(stateOf(crowd),STATE.FLEE);
 crowd.dispose();
});

// ------------------------------------------------------------------ perception

test('a distant pedestrian is left alone',()=>{
 const crowd=crowdOf([{id:1,x:40,z:40}]);
 const aware=createAwareness();
 run(aware,crowd,player(),3);
 assert.equal(stateOf(crowd),STATE.NORMAL,'someone forty metres away reacted to a standing player');
 assert.equal(aware.stats.evaluated,0,'a citizen outside the radius was still evaluated');
 crowd.dispose();
});

test('the player standing close can be noticed',()=>{
 // Several people, because nerve varies: the claim is that SOMEBODY notices, not everybody.
 const people=[];for(let i=0;i<24;i++)people.push({id:100+i,x:1.6+i*.05,z:.9,heading:Math.PI});
 const crowd=crowdOf(people);
 const aware=createAwareness();
 run(aware,crowd,player(),4);
 let noticed=0;
 for(let i=0;i<crowd.population;i++)if(crowd.state.behaviour[i]!==STATE.NORMAL)noticed++;
 assert.ok(noticed>0,'nobody noticed a player standing on top of them');
 assert.ok(noticed<crowd.population,'every single person reacted -- the crowd is a switch');
 crowd.dispose();
});

test('someone facing away is less alert than someone facing you',()=>{
 // Same person, same distance, same player: only the heading differs.
 const facing=playerThreat(player({speed:1.5,course:0}),0,6,Math.PI,7);
 const away  =playerThreat(player({speed:1.5,course:0}),0,6,0,7);
 assert.ok(facing>away,`facing ${facing.toFixed(3)} should exceed turned-away ${away.toFixed(3)}`);
 assert.ok(away>0,'someone with their back turned perceives nothing at all');
});

test('at arm’s length, facing stops mattering',()=>{
 const close=AWARE.close*.5;
 const facing=playerThreat(player({speed:1.5}),0,close,Math.PI,7);
 const away  =playerThreat(player({speed:1.5}),0,close,0,7);
 assert.equal(facing,away,'a body brushing past was ignored because of where the head pointed');
});

test('running at someone is more alarming than running past them',()=>{
 // Identical speed and distance; the difference is entirely the direction of travel.
 const at=playerThreat(player({speed:5,course:0}),0,5,Math.PI,7);
 const past=playerThreat(player({speed:5,course:Math.PI/2}),0,5,Math.PI,7);
 assert.ok(at>past,`collision course ${at.toFixed(3)} should exceed parallel ${past.toFixed(3)}`);
});

test('running is more alarming than walking, which is more than standing',()=>{
 const p=(speed,course=0)=>playerThreat(player({speed,course}),0,7,Math.PI,7);
 assert.ok(p(4)>p(1.2),'running read no louder than walking');
 assert.ok(p(1.2)>p(0),'walking read no louder than standing still');
});

// ------------------------------------------------------------------ the clocks

test('reaction is delayed, and the delay differs between people',()=>{
 const a=traitsOf(0).reactionDelay,b=traitsOf(12).reactionDelay;
 assert.ok(a>0&&b>0);
 assert.notEqual(a,b,'two different people share one reaction time');

 // One person, a very close player, and a single short pass: too soon to have reacted.
 //
 // The id matters and is chosen, not assumed. The pass runs at AWARE.interval, so a citizen
 // whose reaction delay is SHORTER than one interval reacts on the first tick and always
 // will -- the interval quantises the delay, which is a real limitation and is recorded as
 // one. This asserts the mechanism on somebody it can actually be observed on.
 const slow=[...Array(64).keys()].find(i=>traitsOf(i).reactionDelay>AWARE.interval*2);
 assert.ok(slow!==undefined,'no citizen in the first 64 ids reacts slower than two passes');
 const crowd=crowdOf([{id:slow,x:1.2,z:0,heading:Math.PI}]);
 const aware=createAwareness();
 const g=gridFor(crowd);
 aware.update(crowd,g,player({speed:4,course:Math.PI/2}),AWARE.interval);
 assert.equal(stateOf(crowd),STATE.NORMAL,'the reaction arrived on the first tick');
 // Now give it time. The END state is not the question -- a reaction has a hold and then
 // drains, so checking the last frame asks whether it has finished, not whether it happened.
 let peak=STATE.NORMAL;
 const g2=createCrowdGrid();
 for(let t=0;t<2;t+=1/30){
  g2.rebuild(crowd);
  aware.update(crowd,g2,player({speed:4,course:Math.PI/2}),1/30);
  crowd.update(1/30,{time:t});
  if(stateOf(crowd)>peak)peak=stateOf(crowd);
 }
 assert.ok(peak>STATE.NORMAL,'the reaction never arrived at all');
 crowd.dispose();
});

test('personality is stable: the same id is always the same person',()=>{
 for(const id of [3,57,912,100000]){
  const a=traitsOf(id),b=traitsOf(id);
  assert.deepEqual(a,b,'traits changed between two calls for one id');
 }
 // ...and different people really are different.
 const nerves=new Set();for(let i=0;i<64;i++)nerves.add(traitsOf(i).nerve.toFixed(4));
 assert.ok(nerves.size>20,`only ${nerves.size} distinct nerves across 64 people`);
});

test('a citizen on a threshold does not flicker between animations',()=>{
 // Park a person where a small movement crosses the LOOK threshold, then jiggle the player by
 // five centimetres at 3 Hz. What matters is not how MANY times the state changes -- a
 // reaction legitimately holds and then drains -- but how CLOSE TOGETHER two changes can be.
 // Flicker is changes faster than the hold allows; a cycle at the hold rate is the design.
 const crowd=crowdOf([{id:21,x:0,z:5,heading:Math.PI}]);
 const aware=createAwareness();
 const g=createCrowdGrid();
 // `lastAt` starts as null, not 0: the first transition is not a gap from anything, and
 // measuring it as one reports the reaction delay as flicker.
 let last=stateOf(crowd),lastAt=null,shortest=Infinity,changes=0;
 for(let t=0;t<6;t+=1/30){
  const wobble=Math.sin(t*20)*.05;
  g.rebuild(crowd);
  aware.update(crowd,g,player({x:0,z:wobble,speed:1.2,course:0}),1/30);
  crowd.update(1/30,{time:t});
  if(stateOf(crowd)!==last){
   changes++;
   if(lastAt!==null)shortest=Math.min(shortest,t-lastAt);
   lastAt=t;last=stateOf(crowd);
  }
 }
 if(changes>1)assert.ok(shortest>=STATE_HOLD[STATE.LOOK]-1e-6,
  `two state changes ${shortest.toFixed(3)} s apart -- shorter than the ${STATE_HOLD[STATE.LOOK]} s hold, which is flicker`);
 // And the cooldown keeps the cycle slow rather than continuous.
 assert.ok(changes<=10,`state changed ${changes} times in six seconds of a 5 cm wobble`);
 crowd.dispose();
});

test('a cooldown stops a repeated glance, not a threat that is getting worse',()=>{
 // RUN 10 browser QA, direct approach: a runner was noticed at 8 m (LOOK), the LOOK hold ran
 // out, the drain started the cooldown, and for the next 1.15 s nothing got through -- the
 // person went back to strolling while the runner closed six metres, and fled at 2.3 m. The
 // cooldown exists to stop a LINGERING player re-triggering the same glance; it must not hide
 // a threat that now asks for more than the reaction that just ended.
 const id=Array.from({length:200},(_,i)=>i+300).find(i=>Math.abs(traitsOf(i).nerve-.5)<.08);
 const drained=()=>{
  const crowd=crowdOf([{id,x:0,z:10,heading:Math.PI}]);
  crowd.setState(0,STATE.LOOK);crowd.state.timer[0]=1e-4;crowd.update(1/30,{time:0});
  assert.equal(stateOf(crowd),STATE.NORMAL);
  assert.ok(crowd.state.ready[0]>1,'the drain did not start the cooldown');
  return crowd;
 };
 // Worse: running straight at them from three metres.
 let crowd=drained();
 run(createAwareness(),crowd,player({x:0,z:7,speed:4.2,course:0,heading:0}),.5);
 assert.ok(stateOf(crowd)>STATE.LOOK,
  `a runner three metres away was ignored for the cooldown (state ${stateOf(crowd)})`);
 assert.ok(crowd.state.ready[0]>0,'the test must have run inside the cooldown');
 crowd.dispose();
 // The same again: a standing player two metres away asks only for another glance.
 crowd=drained();
 run(createAwareness(),crowd,player({x:0,z:8,speed:0}),.5);
 assert.equal(stateOf(crowd),STATE.NORMAL,'the cooldown no longer stops a repeated glance');
 crowd.dispose();
});

// ------------------------------------------------------------------ priority

test('a glance can never overwrite being hit, knocked down, or getting up',()=>{
 for(const protectedState of [STATE.HIT,STATE.KNOCKDOWN,STATE.DOWNED,STATE.RECOVER]){
  const crowd=crowdOf([{id:31,x:1.0,z:0,heading:Math.PI}]);
  const aware=createAwareness();
  crowd.setState(0,protectedState,{force:true});
  // Drain the hold to zero. While a hold is running, `setState` refuses the downgrade on its
  // own and the awareness guard is never asked -- so testing only the held case proves the
  // wrong mechanism. A body lying on the ground with an expired timer is the real case.
  crowd.state.timer[0]=0;
  const g=gridFor(crowd);
  for(let i=0;i<20;i++)aware.update(crowd,g,player({speed:5,course:Math.PI/2}),AWARE.interval);
  assert.equal(stateOf(crowd),protectedState,
   `awareness overwrote ${Object.keys(STATE).find(k=>STATE[k]===protectedState)}`);
  crowd.dispose();
 }
});

test('the state numbers are a priority order',()=>{
 assert.ok(STATE.NORMAL<STATE.LOOK,'NORMAL outranks LOOK');
 assert.ok(STATE.LOOK<STATE.STARTLE,'a glance outranks a start');
 assert.ok(STATE.STARTLE<STATE.AVOID);
 assert.ok(STATE.AVOID<STATE.FLEE);
 assert.ok(STATE.FLEE<STATE.HIT,'fleeing outranks being hit');
 assert.ok(STATE.HIT<STATE.KNOCKDOWN);
 assert.ok(STATE.KNOCKDOWN<STATE.DOWNED);
 // Every state has a clip and a hold, or the renderer has nothing to play.
 for(const [name,v] of Object.entries(STATE))assert.ok(STATE_HOLD[v]!==undefined,`${name} has no hold`);
});

// ------------------------------------------------------------------ recovery

test('every awareness state drains back to NORMAL, and none is terminal',()=>{
 for(const from of [STATE.LOOK,STATE.STARTLE,STATE.AVOID,STATE.FLEE]){
  const crowd=crowdOf([{id:41,x:60,z:60,heading:0}]);   // far from any player
  crowd.setState(0,from,{force:true});
  const aware=createAwareness();
  run(aware,crowd,player(),14);
  assert.equal(stateOf(crowd),STATE.NORMAL,
   `${Object.keys(STATE).find(k=>STATE[k]===from)} never drained to NORMAL`);
  crowd.dispose();
 }
});

test('fleeing drains through RECOVER rather than straight back to walking',()=>{
 const crowd=crowdOf([{id:42,x:60,z:60,heading:0}]);
 crowd.setState(0,STATE.FLEE,{force:true});
 const seen=new Set();
 for(let t=0;t<6;t+=1/30){crowd.update(1/30,{time:t});seen.add(stateOf(crowd));}
 assert.ok(seen.has(STATE.RECOVER),'a runner went straight from fleeing to strolling');
 assert.equal(stateOf(crowd),STATE.NORMAL);
 crowd.dispose();
});

test('a player who walks away leaves nobody reacting',()=>{
 const people=[];for(let i=0;i<40;i++)people.push({id:200+i,x:-3+i*.15,z:1.2,heading:Math.PI});
 const crowd=crowdOf(people);
 const aware=createAwareness();
 run(aware,crowd,player({speed:4,course:0}),3);
 run(aware,crowd,player({x:300,z:300}),16);
 let reacting=0;
 for(let i=0;i<crowd.population;i++)if(crowd.state.behaviour[i]!==STATE.NORMAL)reacting++;
 assert.equal(reacting,0,`${reacting} people were still reacting to a player 300 m away`);
 crowd.dispose();
});

// ------------------------------------------------------------------ violence

test('a punch is witnessed by a bounded, mixed group',()=>{
 const people=[];
 for(let i=0;i<300;i++){
  const a=i*.618*Math.PI*2,r=Math.sqrt(i)*.9;
  people.push({id:500+i,x:Math.cos(a)*r,z:Math.sin(a)*r,heading:a});
 }
 const crowd=crowdOf(people);
 const aware=createAwareness();
 const g=gridFor(crowd);
 const reacted=aware.witness(crowd,g,{x:0,z:0,severity:.72,radius:AWARE.witnessRadius});
 assert.ok(reacted>0,'nobody noticed a punch in a dense crowd');
 assert.ok(reacted<crowd.population,'the entire crowd reacted to one punch');

 const counts={};
 for(let i=0;i<crowd.population;i++){
  const b=crowd.state.behaviour[i];
  counts[b]=(counts[b]??0)+1;
 }
 // The point of personality: one event, several different answers.
 const kinds=[STATE.LOOK,STATE.STARTLE,STATE.AVOID,STATE.FLEE].filter(k=>counts[k]>0);
 assert.ok(kinds.length>=2,
  `one punch produced a single reaction (${JSON.stringify(counts)}) -- that reads as a script`);
 assert.ok((counts[STATE.NORMAL]??0)>0,'not one person ignored a punch across the street');
 crowd.dispose();
});

test('a steady witness ignores what a nervous one runs from',()=>{
 // Same event, same distance, same heading: only the person differs.
 const steady=[...Array(400).keys()].map(i=>i).filter(i=>traitsOf(i).nerve>.8)[0];
 const jumpy =[...Array(400).keys()].map(i=>i).filter(i=>traitsOf(i).nerve<.3)[0];
 assert.ok(steady!==undefined&&jumpy!==undefined,'no steady/nervous pair in the first 400 ids');
 const crowd=crowdOf([{id:steady,x:3,z:0,heading:0},{id:jumpy,x:3,z:0,heading:0}]);
 const aware=createAwareness();
 aware.witness(crowd,gridFor(crowd),{x:0,z:0,severity:.72,radius:AWARE.witnessRadius});
 const a=crowd.state.behaviour[0],b=crowd.state.behaviour[1];
 assert.ok(b>a,`the nervous one (${b}) did not react harder than the steady one (${a})`);
 crowd.dispose();
});

test('witnessing cannot pull someone off the ground',()=>{
 const crowd=crowdOf([{id:61,x:1,z:0,heading:0}]);
 crowd.setState(0,STATE.DOWNED,{force:true});
 const aware=createAwareness();
 aware.witness(crowd,gridFor(crowd),{x:0,z:0,severity:1,radius:AWARE.witnessRadius});
 assert.equal(stateOf(crowd),STATE.DOWNED,'a punch nearby stood a downed body up to look');
 crowd.dispose();
});

// ------------------------------------------------------------------ cars

test('a car still gets its urgent reaction, and beats a nearby player',()=>{
 const people=[];for(let i=0;i<40;i++)people.push({id:700+i,x:0,z:2+i*.3,heading:0});
 const crowd=crowdOf(people);
 const g=gridFor(crowd);
 const before=crowd.inspect().byState;
 const result=applyVehicleThreat(crowd,g,{x:0,z:0,heading:0,speed:11},1/30,[]);
 assert.ok(result.candidates>0,'the car saw nobody');
 assert.ok(result.fled+result.avoided+result.looked>0,'a car at 11 m/s moved nobody');
 // And awareness cannot then calm them down while the car is still coming.
 const aware=createAwareness();
 const fleeing=[];
 for(let i=0;i<crowd.population;i++)if(crowd.state.behaviour[i]===STATE.FLEE)fleeing.push(i);
 assert.ok(fleeing.length>0,'nobody fled a car doing 11 m/s');
 for(let k=0;k<10;k++)aware.update(crowd,g,player({x:0,z:2.2}),AWARE.interval);
 for(const i of fleeing)
  assert.ok(crowd.state.behaviour[i]>=STATE.AVOID,'a standing player talked someone out of fleeing a car');
 assert.ok(before!==null);
 crowd.dispose();
});

// ------------------------------------------------------------------ cost

test('the query is bounded by density, not by population',()=>{
 const build=n=>{
  const people=[];
  for(let i=0;i<n;i++){
   const a=i*.618*Math.PI*2,r=6+Math.sqrt(i)*2.2;      // a ring well outside the radius
   people.push({id:900+i,x:Math.cos(a)*r,z:Math.sin(a)*r,heading:a});
  }
  return crowdOf(people);
 };
 const small=build(60),big=build(900);
 const aware=createAwareness();
 aware.update(small,gridFor(small),player(),AWARE.interval);
 const few=aware.stats.candidates;
 const aware2=createAwareness();
 aware2.update(big,gridFor(big),player(),AWARE.interval);
 const many=aware2.stats.candidates;
 // Fifteen times the population must not mean fifteen times the candidates: the extra people
 // are further away, and the grid never visits their cells.
 assert.ok(many<big.population*.5,
  `${many} candidates from a population of ${big.population} -- the query is scanning everyone`);
 assert.ok(few<=many);
 small.dispose();big.dispose();
});

test('awareness never produces a NaN',()=>{
 const people=[];for(let i=0;i<50;i++)people.push({id:1000+i,x:(i%7)-3,z:(i%5)-2,heading:i});
 const crowd=crowdOf(people);
 const aware=createAwareness();
 // Including the degenerate case: a player standing exactly on top of somebody.
 const g=createCrowdGrid();
 for(let t=0;t<4;t+=1/30){
  g.rebuild(crowd);
  aware.update(crowd,g,player({x:0,z:0,speed:t<2?0:6,course:t}),1/30);
  crowd.update(1/30,{time:t});
 }
 const s=crowd.state;
 for(let i=0;i<crowd.population;i++)
  for(const k of ['x','z','heading','noticed','ready','attention','timer'])
   assert.ok(Number.isFinite(s[k][i]),`${k}[${i}] is ${s[k][i]}`);
 crowd.dispose();
});

test('there is one awareness authority, and the old one is not in it',async()=>{
 // The RUN 7 WIP walked every pedestrian every frame. Nothing in the running game may import
 // it: that is the whole point of RUN 10, and it is cheap to keep true.
 const {readdirSync,readFileSync:read}=await import('node:fs');
 const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>
  e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]);
 const sources=[...walk('src'),...walk('app')].filter(f=>/\.(mjs|tsx?|js)$/.test(f));
 const offenders=sources.filter(f=>
  !f.endsWith('hq-awareness.mjs')&&
  /from\s+['"][^'"]*\/awareness\.mjs['"]/.test(read(f,'utf8')));
 assert.deepEqual(offenders,[],`still importing the old awareness WIP: ${offenders.join(', ')}`);
});

test('an accident: close witnesses react at once, the middle distance looks and then reacts, the edge only looks',()=>{
 // RUN 11.3. Everyone within reach of a car hit used to go straight to their final state on
 // the same frame, so a street broke into a run in unison.
 const ids=Array.from({length:400},(_,i)=>i+1000).filter(i=>traitsOf(i).nerve<.45).slice(0,30);
 const people=ids.map((id,k)=>({id,x:0,z:k<10?2+k*.25:k<20?6+(k-10)*.5:13.5+(k-20)*.1,heading:Math.PI}));
 const crowd=crowdOf(people),aware=createAwareness(),grid=gridFor(crowd);
 aware.witness(crowd,grid,{x:0,z:0,severity:1,radius:16,kind:'vehicle'});
 const at=k=>crowd.state.behaviour[k];
 for(let k=0;k<10;k++)assert.ok(at(k)>=STATE.STARTLE,`close witness ${k} only reached ${at(k)}`);
 for(let k=10;k<20;k++)assert.equal(at(k),STATE.LOOK,`middle witness ${k} did not look first`);
 for(let k=20;k<30;k++)assert.ok(at(k)<=STATE.LOOK,`edge witness ${k} reacted beyond a look`);
 // Now let time pass: the middle distance escalates, at different moments.
 const when=new Map();
 for(let t=0;t<3;t+=1/30){aware.flush(crowd,1/30);crowd.update(1/30,{time:t});
  for(let k=10;k<20;k++)if(!when.has(k)&&at(k)>STATE.LOOK)when.set(k,t);}
 assert.ok(when.size>=7,`only ${when.size} of 10 middle witnesses ever escalated`);
 const times=[...when.values()];
 assert.ok(Math.max(...times)-Math.min(...times)>.15,'the middle distance still reacted in unison');
 for(let k=20;k<30;k++)assert.ok(at(k)<=STATE.LOOK);
 crowd.dispose();
});

test('the witness queue is bounded, and a knocked-down witness is not dragged back up',()=>{
 const people=Array.from({length:300},(_,k)=>({id:2000+k,x:(k%20-10)*.6,z:6+Math.floor(k/20)*.4,heading:Math.PI}));
 const crowd=crowdOf(people),aware=createAwareness(),grid=gridFor(crowd);
 aware.witness(crowd,grid,{x:0,z:0,severity:1,radius:16,kind:'vehicle'});
 assert.ok(aware.pending<=256);
 crowd.setState(0,STATE.KNOCKDOWN,{force:true});
 for(let t=0;t<3;t+=1/30)aware.flush(crowd,1/30);
 assert.ok(crowd.state.behaviour[0]===STATE.KNOCKDOWN||crowd.state.behaviour[0]===STATE.DOWNED);
 crowd.dispose();
});
