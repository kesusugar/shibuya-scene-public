// PLAN-POLICE-AND-OWN-CAR W1 (wanted level) and W3 (siren and lamps).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createWanted,WANTED,reportDelayOf} from '../src/police/wanted.mjs';
import {SIREN,sirenHz,doppler,nearestSirens,flashPhase,createLoudspeaker,createSirens} from '../src/police/siren.mjs';
import {createPoliceDirector,officersSee} from '../src/police/director.mjs';

const at=(w,t,o={})=>w.update(1/30,{t,...o});
const seen={seenByOfficer:true};

test('the crime table: each row raises the level to at least its star',()=>{
 const rows=[
  [['meleeKill'],0],[['meleeKill','meleeKill'],1],
  [['runoverKill'],1],
  [['officerAssault'],1],
  [['policeRam'],2],
  [['meleeKill','meleeKill','meleeKill','meleeKill'],2],
  [['policeCarTaken'],3],[['officerKill'],3],
  [Array(8).fill('meleeKill'),3],
  [Array(15).fill('meleeKill'),4],[['officerKill','officerKill'],4],
  [Array(25).fill('meleeKill'),5],[Array(4).fill('officerKill'),5],
  [['carjack'],1]
 ];
 for(const [crimes,stars] of rows){
  const w=createWanted();
  crimes.forEach((c,i)=>w.crime(c,{t:i*100,...seen}));    // far apart: no run-over pairing
  assert.equal(w.snapshot().stars,stars,crimes.join('+'));
 }
});

test('the user\'s rules: two fight kills, one run-over, a stolen patrol car',()=>{
 const a=createWanted();a.crime('meleeKill',{t:0,...seen});assert.equal(a.snapshot().stars,0);
 a.crime('meleeKill',{t:5,...seen});assert.equal(a.snapshot().stars,1,'two killed in fights is ☆1');
 const b=createWanted();b.crime('runoverKill',{t:0});assert.equal(b.snapshot().stars,1,'a run-over kill is ☆1 at once, seen or not');
 b.crime('runoverKill',{t:40});assert.equal(b.snapshot().stars,2,'a second inside 60 s is ☆2');
 const c=createWanted();c.crime('runoverKill',{t:0});c.crime('runoverKill',{t:61});assert.equal(c.snapshot().stars,1);
 const d=createWanted();d.crime('policeCarTaken',{t:0});assert.equal(d.snapshot().stars,3,'taking a police car is ☆3');
});

test('punching an officer is ☆1, or one more when already wanted',()=>{
 const w=createWanted();w.crime('officerAssault',{t:0});assert.equal(w.snapshot().stars,1);
 w.crime('officerAssault',{t:1});assert.equal(w.snapshot().stars,2);
});

test('a crime only civilians saw is reported after its delay, and cancelled with its witnesses',()=>{
 const w=createWanted();
 w.crime('meleeKill',{t:0,id:7,witnesses:2});w.crime('meleeKill',{t:0,id:8,witnesses:2});
 assert.equal(w.snapshot().stars,0,'known before the report');
 const due=Math.max(reportDelayOf(7),reportDelayOf(8));
 assert.ok(due>=WANTED.reportDelay[0]&&due<=WANTED.reportDelay[1]);
 at(w,due-.05);assert.equal(w.snapshot().stars,0);
 at(w,due+.01);assert.equal(w.snapshot().stars,1,'the reports arrived');
 // Witness ids: all gone before the report -> nothing.
 const x=createWanted();
 x.crime('meleeKill',{t:0,id:1,witnesses:[11,12]});x.crime('meleeKill',{t:0,id:2,witnesses:[13]});
 at(x,9,{witnessStill:()=>false});assert.equal(x.snapshot().stars,0,'dead or fled witnesses report nothing');
 // Nobody at all saw it -> unknown.
 const y=createWanted();assert.equal(y.crime('meleeKill',{t:0}),'unseen');
});

test('solid while seen, flashing while searched for, cleared after the escape time outside the circle',()=>{
 for(let stars=1;stars<=5;stars++){
  const w=createWanted();
  const crimes={1:['runoverKill'],2:['policeRam'],3:['policeCarTaken'],4:['officerKill','officerKill'],5:Array(4).fill('officerKill')}[stars];
  crimes.forEach((c,i)=>w.crime(c,{t:0,x:0,z:0,id:i+1}));
  assert.equal(w.snapshot().stars,stars);
  let s=at(w,.1,{x:0,z:0,seen:true});assert.equal(s.flashing,false);assert.equal(s.seen,true);
  s=at(w,.2,{x:5,z:0,seen:false});assert.equal(s.flashing,true);
  // Inside the circle, unseen: the clock does not run.
  let t=.2;for(let i=0;i<600;i++){t+=1/30;s=w.update(1/30,{t,x:WANTED.searchRadius[stars]-5,z:0});}
  assert.equal(s.stars,stars,'escaped without leaving the circle');
  // Outside: cleared after the escape time, not before.
  const need=WANTED.escapeSeconds[stars];let cleared=0;
  for(let i=0;i<(need+2)*30;i++){t+=1/30;s=w.update(1/30,{t,x:WANTED.searchRadius[stars]+10,z:0});if(!s.stars&&!cleared)cleared=i/30;}
  assert.ok(cleared>=need-.1&&cleared<=need+.2,`☆${stars}: cleared after ${cleared}s, wanted ${need}`);
  assert.equal(w.snapshot().cleared,'escaped');
 }
});

test('being seen again restarts the escape clock, and 90 s at ☆3 becomes ☆4',()=>{
 const w=createWanted();w.crime('policeCarTaken',{t:0,x:0,z:0});
 let t=0;for(let i=0;i<20*30;i++){t+=1/30;w.update(1/30,{t,x:500,z:0});}
 assert.equal(w.snapshot().stars,3);
 w.update(1/30,{t:t+=1/30,x:500,z:0,seen:true});
 for(let i=0;i<22*30;i++){t+=1/30;w.update(1/30,{t,x:1000,z:0});}
 assert.equal(w.snapshot().stars,3,'the clock was not restarted by being seen');
 const h=createWanted();h.crime('policeCarTaken',{t:0});
 for(let i=0;i<91*30;i++)h.update(1/30,{t:i/30,x:0,z:0,seen:true});
 assert.equal(h.snapshot().stars,4);
});

test('arrest, death and respawn clear the level and the pending reports',()=>{
 for(const reason of ['arrested','death','respawn']){
  const w=createWanted();w.crime('policeCarTaken',{t:0});w.crime('meleeKill',{t:0,witnesses:3});
  w.clear(reason);const s=w.snapshot();
  assert.equal(s.stars,0);assert.equal(s.pending,0);assert.equal(s.cleared,reason);
 }
});

test('the siren is a slow Japanese wail between 650 and 1450 Hz, and a faster yelp',()=>{
 assert.equal(sirenHz(0),SIREN.low);
 assert.ok(Math.abs(sirenHz(SIREN.up)-SIREN.high)<1);
 assert.ok(Math.abs(sirenHz(SIREN.up+SIREN.down)-SIREN.low)<1);
 let lo=Infinity,hi=-Infinity;for(let t=0;t<10;t+=.01){const f=sirenHz(t);lo=Math.min(lo,f);hi=Math.max(hi,f);}
 assert.ok(lo>=SIREN.low-1&&hi<=SIREN.high+1);
 assert.ok(sirenHz(SIREN.yelpPeriod/2,'yelp')>SIREN.high-1,'the yelp peaks in half its short period');
 assert.ok(doppler(20)>1&&doppler(-20)<1&&doppler(0)===1);
});

test('only the two nearest sirens sound',()=>{
 const src=[{id:1,x:100,z:0},{id:2,x:10,z:0},{id:3,x:50,z:0},{id:4,x:900,z:0}];
 assert.deepEqual(nearestSirens(src,{x:0,z:0}).map(s=>s.id),[2,3]);
 assert.equal(nearestSirens([{id:4,x:900,z:0}],{x:0,z:0}).length,0,'out of range');
 // No audio context: silence, not an error.
 const s=createSirens(()=>null,()=>null);s.update(1/30,src,{x:0,z:0});assert.equal(s.stats.sounding,0);s.dispose();
});

test('the roof bar alternates, and the loudspeaker is silent without a Japanese voice',()=>{
 assert.notEqual(flashPhase(0),flashPhase(1/(SIREN.flashHz*2)+.001));
 assert.equal(createLoudspeaker(undefined,undefined).say('止まりなさい',0),false);
 const english={getVoices:()=>[{lang:'en-US'}],speak:()=>{throw new Error('must not speak');}};
 assert.equal(createLoudspeaker(english,function(){}).say('止まりなさい',0),false);
 let spoken=0;const ja={getVoices:()=>[{lang:'ja-JP'}],speak:()=>spoken++};
 const speaker=createLoudspeaker(ja,function(t){this.text=t;});
 assert.equal(speaker.say('そこの人、止まりなさい',0),true);
 assert.equal(speaker.say('そこの人、止まりなさい',3),false,'at most once every 8 s');
 assert.equal(speaker.say('そこの人、止まりなさい',9),true);assert.equal(spoken,2);
});

test('in the game: two fight kills in a crowd bring ☆1 and the nearby patrol car runs its siren',()=>{
 const patrol={id:9,active:true,type:'police',x:120,z:0,heading:0,speed:8};
 const traffic={pool:[patrol]};
 const crowd={pool:Array.from({length:6},(_,i)=>({id:i,active:true,x:i,z:2}))};
 const police=createPoliceDirector({speech:null,Utterance:null});
 const player={x:0,z:0,alive:true};
 let t=0,s=null;const frame=(melee)=>{t+=1/30;return police.frame(1/30,{player,melee,traffic,crowd});};
 frame({npcDeaths:1});frame({npcDeaths:2});
 for(let i=0;i<9*30;i++)s=frame({npcDeaths:2});
 assert.equal(s.stars,1,'reported by the crowd');
 assert.equal(patrol.siren,true,'the patrol car did not respond');
 police.clear('arrested');frame({npcDeaths:2});assert.equal(patrol.siren,false);
});

test('in the game: a run-over is ☆1 at once, and taking a patrol car is ☆3 with H for the siren',()=>{
 const police=createPoliceDirector({speech:null,Utterance:null});
 const slot={id:3,active:true,type:'police',x:0,z:0,heading:0};
 const car={state:{x:0,z:0,type:'sedan',speed:5,slot:{id:1}},impacts:[{kind:'runover',id:44,x:0,z:0}]};
 let s=police.frame(1/30,{player:{x:0,z:0},car,driving:true,traffic:{pool:[]}});
 assert.equal(s.stars,1);
 car.impacts=[{kind:'runover',id:44,x:0,z:0}];s=police.frame(1/30,{player:{x:0,z:0},car,driving:true,traffic:{pool:[]}});
 assert.equal(s.stars,1,'the same body run over twice is one kill');
 const cop={state:{x:0,z:0,type:'police',speed:0,slot},impacts:[]};
 s=police.frame(1/30,{player:{x:0,z:0},car:cop,driving:true,traffic:{pool:[slot]}});
 assert.equal(s.stars,3);
 assert.equal(police.toggleSiren(cop),true);police.frame(1/30,{player:{x:0,z:0},car:cop,driving:true,traffic:{pool:[slot]}});
 assert.equal(slot.siren,true,'H did not start the stolen car\'s siren');
 assert.equal(police.toggleSiren(car),false,'a sedan has no siren: H stays the horn');
 assert.equal(officersSee([slot],10,0,slot),false,'the player\'s own patrol car is not a witness');
});
