import test from 'node:test';
import assert from 'node:assert/strict';
import {LIFE,AWARENESS,traitsOf,createAwareness} from '../src/life/awareness.mjs';

/** The smallest crowd the module actually uses: a pool, a clock, a cell key, and scatter. */
function crowd(people=[]){
 const scattered=[];
 return {
  time:0,pool:people,scattered,
  cell(x,z){return Math.floor(x/2)+','+Math.floor(z/2);},
  scatter(p,dx,dz,urgency){scattered.push({id:p.id,dx,dz,urgency});return true;}
 };
}
const citizen=(id,x,z,extra={})=>({id,active:true,controlled:false,x,z,heading:0,speed:1.2,
 crossing:null,edge:3,route:[3],combatTarget:null,combatAction:0,combatDead:false,
 reactionUntil:-1,trafficReaction:null,...extra});
/** Advance the world in real steps rather than one huge dt, which is what the holds see. */
function run(aw,c,focus,player,seconds,step=1/15){
 for(let t=0;t<seconds;t+=step){c.time+=step;aw.update(c,focus,player,step);}
}

test('traits are stable per citizen and spread across their ranges',()=>{
 assert.deepEqual(traitsOf(42),traitsOf(42),'the same id must be the same person');
 assert.notDeepEqual(traitsOf(42),traitsOf(43));
 const all=Array.from({length:400},(_,i)=>traitsOf(i));
 for(const key of ['reactionDelay','lookFor','fleeUrgency','nerve']){
  const values=all.map(t=>t[key]);
  const lo=Math.min(...values),hi=Math.max(...values);
  assert.ok(hi-lo>0,`${key} never varies`);
  // A trait that clusters is not variation. Require the spread to cover most of its range.
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  assert.ok(mean>lo&&mean<hi,`${key} is degenerate`);
 }
 const sides=all.map(t=>t.side);
 assert.ok(sides.includes(1)&&sides.includes(-1),'everyone steps the same way');
});

test('a citizen reacts to a sprinting player, and not instantly',()=>{
 const p=citizen(7,1.5,0);
 const c=crowd([p]),aw=createAwareness();
 const player={x:0,z:0,speed:5,heading:0,alive:true};
 // One tick is not a reaction: every citizen has a reaction delay before anything happens.
 c.time+=1/15;aw.update(c,player,player,1/15);
 assert.equal(p.lifeState??LIFE.CALM,LIFE.CALM,'reacted within one frame of noticing');
 run(aw,c,player,player,1.2);
 assert.notEqual(p.lifeState,LIFE.CALM,'never reacted to a player sprinting at them');
});

test('nothing beyond the perception radius is perceived',()=>{
 const near=citizen(1,2,0),far=citizen(2,AWARENESS.far+6,0);
 const c=crowd([near,far]),aw=createAwareness();
 const player={x:0,z:0,speed:5,heading:0,alive:true};
 run(aw,c,player,player,2);
 assert.notEqual(near.lifeState,LIFE.CALM);
 assert.equal(far.lifeState??LIFE.CALM,LIFE.CALM,'a citizen 40 m away reacted');
});

test('a reaction is held for its minimum duration, then recovers rather than snapping',()=>{
 const p=citizen(11,1.2,0);
 const c=crowd([p]),aw=createAwareness();
 const player={x:0,z:0,speed:6,heading:0,alive:true};
 run(aw,c,player,player,2);
 const alarmed=p.lifeState;
 assert.ok(alarmed!==LIFE.CALM&&alarmed!==LIFE.RECOVER,`expected an alarmed state, got ${alarmed}`);
 // The danger goes away entirely.
 const calm={x:200,z:200,speed:0,heading:0,alive:true};
 let sawRecover=false;
 for(let t=0;t<4;t+=1/15){
  c.time+=1/15;aw.update(c,player,calm,1/15);
  if(p.lifeState===LIFE.RECOVER)sawRecover=true;
 }
 assert.ok(sawRecover,'went straight from alarmed to calm with no recovery');
 assert.equal(p.lifeState,LIFE.CALM,'never settled back down');
});

test('alarm reaches the people beside a frightened citizen, and stops there',()=>{
 // Isolating second-hand alarm needs bystanders who can see nothing themselves. The scare is
 // a downed body, whose radius is known, so everyone placed beyond it is reacting to their
 // neighbours or to nothing.
 const body=citizen(0,0,0,{struck:.2});
 const witness=citizen(1,1.2,0);                    // inside the body's radius: startles
 const beside=citizen(2,AWARENESS.downed+1.4,0);    // outside it, beside nobody yet
 const chain=[];
 // A line of citizens bridging from the witness out past the body's radius, each within the
 // alarm ring of the one before, so alarm has a path if it travels at all.
 for(let i=0;i<6;i++)chain.push(citizen(10+i,2.6+i*2.2,0));
 const distant=citizen(90,AWARENESS.far-1,0);       // in perception range, far from everyone
 const people=[body,witness,beside,...chain,distant];
 const c=crowd(people),aw=createAwareness();
 const focus={x:0,z:0};

 const peak=new Map();
 for(let t=0;t<5;t+=1/15){
  c.time+=1/15;aw.update(c,focus,null,1/15);
  for(const q of people)if(q.lifeState&&q.lifeState!==LIFE.CALM&&!peak.has(q.id))peak.set(q.id,q.lifeState);
 }

 assert.ok(peak.has(witness.id),'nobody reacted to a body beside them');
 // Alarm must actually do something, or every assertion below is vacuous. Only citizens
 // outside every danger radius count: anyone within the body's own reach saw it themselves,
 // and counting them would let this test pass with propagation switched off. It did, once.
 const outside=q=>Math.hypot(q.x-body.x,q.z-body.z)>AWARENESS.downed;
 const bystanders=[...chain,beside].filter(outside);
 assert.ok(bystanders.length>=3,'the test needs bystanders who can see nothing themselves');
 const secondHand=bystanders.filter(q=>peak.has(q.id));
 assert.ok(secondHand.length>0,
  'no citizen outside the danger ever caught alarm from a neighbour -- propagation is dead');
 // ...and it must not escalate. Second-hand alarm turns heads; it does not start a stampede.
 for(const q of secondHand)
  assert.ok(peak.get(q.id)===LIFE.LOOK||peak.get(q.id)===LIFE.STARTLE,
   `citizen ${q.id} reached ${peak.get(q.id)} on second-hand alarm alone`);
 assert.ok(AWARENESS.alarmCap<AWARENESS.enter.avoid,
  'second-hand alarm can reach the evasion threshold');
 // And it must not reach across the street.
 assert.equal(distant.lifeState??LIFE.CALM,LIFE.CALM,
  'alarm reached a citizen at the edge of perception with nobody near them');
});

test('perception never touches crossing, route or signal state',()=>{
 // A pedestrian who abandons a crossing without releasing its signal group freezes every
 // signal on the map. Whatever this module does, it must not be able to cause that.
 const p=citizen(5,1,0,{crossing:'hachiko-n',edge:12,route:[12,13],queueKey:'k'});
 const before={crossing:p.crossing,edge:p.edge,route:[...p.route],queueKey:p.queueKey};
 const c=crowd([p]),aw=createAwareness();
 const player={x:0,z:0,speed:6,heading:0,alive:true};
 run(aw,c,player,player,3);
 assert.equal(p.crossing,before.crossing,'a reaction cleared a crossing');
 assert.equal(p.edge,before.edge);
 assert.deepEqual(p.route,before.route);
 assert.equal(p.queueKey,before.queueKey);
 assert.ok(p.lifeState!==LIFE.CALM,'the test proved nothing -- they never reacted');
});

test('a downed body is noticed by the people near it',()=>{
 const body=citizen(1,0,0,{struck:0.2});
 const witness=citizen(2,2,0);
 const bystander=citizen(3,AWARENESS.downed+9,0);
 const c=crowd([body,witness,bystander]),aw=createAwareness();
 const focus={x:0,z:0};
 run(aw,c,focus,null,2);
 assert.notEqual(witness.lifeState,LIFE.CALM,'nobody noticed a body two metres away');
 assert.equal(bystander.lifeState??LIFE.CALM,LIFE.CALM,
  'a citizen well outside the radius noticed a body');
 assert.equal(body.lifeState??LIFE.CALM,LIFE.CALM,'the struck body was given a reaction');
});

test('evasion is handed to the simulation, not performed here',()=>{
 const p=citizen(9,1,0);
 const c=crowd([p]),aw=createAwareness();
 const before={x:p.x,z:p.z};
 const player={x:0,z:0,speed:7,heading:0,alive:true};
 run(aw,c,player,player,2.5);
 assert.equal(p.x,before.x,'awareness moved a pedestrian directly');
 assert.equal(p.z,before.z,'awareness moved a pedestrian directly');
 if(c.scattered.length){
  for(const s of c.scattered){
   assert.ok(Number.isFinite(s.dx)&&Number.isFinite(s.dz),'scatter got a bad direction');
   assert.ok(Math.abs(Math.hypot(s.dx,s.dz)-1)<1e-6,'scatter direction is not a unit vector');
   assert.ok(s.urgency>=0&&s.urgency<=1,`urgency out of range: ${s.urgency}`);
  }
 }
});

test('losing focus forgets every reaction',()=>{
 const p=citizen(4,1,0);
 const c=crowd([p]),aw=createAwareness();
 const player={x:0,z:0,speed:6,heading:0,alive:true};
 run(aw,c,player,player,2);
 assert.notEqual(p.lifeState,LIFE.CALM);
 aw.clear(c);
 assert.equal(p.lifeState,LIFE.CALM);
 assert.equal(aw.inspect().alarmCells,0);
});

test('the work is bounded by the radius, not by the size of the crowd',()=>{
 // Two thousand people, nearly all of them far away. What costs anything is how many are
 // close, and that is what `perceived` has to report.
 const people=[];
 for(let i=0;i<2000;i++){
  const angle=i*.37,radius=i<24?2+i*.4:60+(i%200);
  people.push(citizen(i,Math.cos(angle)*radius,Math.sin(angle)*radius));
 }
 const c=crowd(people),aw=createAwareness();
 const focus={x:0,z:0},player={x:0,z:0,speed:1,heading:0,alive:true};
 run(aw,c,focus,player,1);
 const seen=aw.inspect().perceived;
 assert.ok(seen<=64,`perceived ${seen} citizens in one tick from a crowd of 2000`);
});
