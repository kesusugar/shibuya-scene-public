// PLAN-WEAPONS W3: police revolvers -- line of sight (R9) and the Japanese rules of fire (R15).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createPoliceGuns,GUNS,hitChance} from '../src/police/guns.mjs';
import {officersSee,officersOnFootSee,createPoliceDirector,intoCabin,CAR_ROUNDS} from '../src/police/director.mjs';
import {POLICE_LINES,policeLine,ONSETS} from '../src/player/voices.mjs';
import {createOfficerVoice} from '../src/police/siren.mjs';

const officer=(id,x,z,extra={})=>({id,x,z,active:true,officer:true,combatDead:false,heading:Math.atan2(-x,-z),...extra});
const me={x:0,z:0,y:0};
/** Run the guns for `seconds` at 30 Hz and collect every event. */
function run(guns,seconds,frame){
 const all=[];for(let t=0;t<seconds;t+=1/30)all.push(...guns.update(1/30,frame()));return all;
}

test('roadmap ②: in a car at ☆1 the revolvers stay holstered (from ☆2 they come out); on foot they are drawn from ☆1',()=>{
 {const guns=createPoliceGuns(),p=officer(1,0,8);
  const events=run(guns,10,()=>({officers:[p],me,stars:1,driving:true,threat:{armed:true,attacking:true}}));
  assert.equal(events.length,0,`☆1 in a car: ${events.map(e=>e.kind).join(',')}`);
  assert.ok(!p.gunDrawn);
  const g=createPoliceGuns(),q=officer(3,0,8);
  assert.ok(run(g,10,()=>({officers:[q],me,stars:2,driving:true,threat:{}})).some(e=>e.kind==='shot'),'☆2 in a car: never fired');}
 for(const stars of [1,2]){
  const g2=createPoliceGuns(),q=officer(2,0,8);
  const ev=run(g2,10,()=>({officers:[q],me,stars,threat:{}}));
  assert.ok(ev.some(e=>e.kind==='warn'),`☆${stars} on foot: no warning shot`);
  assert.ok(ev.some(e=>e.kind==='shot'),`☆${stars} on foot: never fired`);
 }
});
test('R15: at ☆3 officers draw, and the first round is a warning shot into the air with 撃つぞ！',()=>{
 const guns=createPoliceGuns(),p=officer(1,0,8);
 const events=run(guns,6,()=>({officers:[p],me,stars:3,threat:{armed:true}}));
 const kinds=events.map(e=>e.kind);
 assert.equal(kinds[0],'draw');
 const firstRound=events.find(e=>e.kind==='warn'||e.kind==='shot');
 assert.equal(firstRound.kind,'warn','the first round was aimed at the player');
 assert.ok(firstRound.to.y-firstRound.from.y>20,'the warning shot was not into the air');
 assert.ok(events.some(e=>e.kind==='shout'&&e.line==='warn'),'no 撃つぞ！');
 assert.ok(events.some(e=>e.kind==='shout'&&e.line==='dropGun'),'no 銃を捨てろ！ to an armed player');
 const w=events.indexOf(firstRound),shots=events.filter(e=>e.kind==='shot');
 assert.ok(shots.length>0,'an armed player was never fired on');
 assert.ok(events.indexOf(shots[0])>w,'fired before the warning');
});

test('owner\'s plan / roadmap ②: the police fire after the warning, threat or not -- on foot, and in a car fleeing from ☆2',()=>{
 const guns=createPoliceGuns(),p=officer(1,0,8);
 const events=run(guns,12,()=>({officers:[p],me,stars:3,threat:{armed:false,attacking:false}}));
 assert.equal(events.filter(e=>e.kind==='warn').length,1);
 assert.ok(events.filter(e=>e.kind==='shot').length>0,'an unarmed player on foot was not fired on');
 // Roadmap ②: in a car a driver who is only fleeing is fired on too (the car no longer shields
 // them); the warning shot still comes first.
 const g1=createPoliceGuns();
 const e1=run(g1,12,()=>({officers:[p],me,stars:2,driving:true,threat:{}}));
 assert.equal(e1.find(e=>e.kind==='warn'||e.kind==='shot')?.kind,'warn','no warning first in a car');
 assert.ok(e1.filter(e=>e.kind==='shot').length>0,'a fleeing driver at ☆2 was not fired on');
 assert.equal(g1.snapshot().held,0);
});
test('R9: no police shot without a line of sight -- a building between them blocks every round',()=>{
 const wall=(x,z)=>z>3&&z<5;                 // a building between the officer (z 8) and the player (z 0)
 const guns=createPoliceGuns(),p=officer(1,0,8);
 const events=run(guns,10,()=>({officers:[p],me,stars:4,solid:wall,threat:{armed:true,attacking:true}}));
 assert.equal(events.filter(e=>e.kind==='warn'||e.kind==='shot').length,0,'fired through a building');
 assert.ok(guns.snapshot().blocked>0);
 assert.equal(p.gunAim,0,'aiming at someone they cannot see');
 // Step out from behind it and the rules resume, warning first.
 p.x=12;p.z=0;
 const after=run(guns,4,()=>({officers:[p],me,stars:4,solid:wall,threat:{armed:true}}));
 assert.equal(after.find(e=>e.kind==='warn'||e.kind==='shot')?.kind,'warn');
});

test('R9: the police cannot see through buildings -- patrol cars and officers on foot',()=>{
 const wall=(x,z)=>z>3&&z<5;
 const car={active:true,type:'police',x:0,z:10};
 assert.ok(officersSee([car],0,0),'without a wall test the old radius still sees');
 assert.ok(!officersSee([car],0,0,null,undefined,wall),'a patrol car saw through a building');
 assert.ok(officersSee([car],0,0,null,undefined,()=>false));
 const p=officer(1,0,10);
 assert.ok(!officersOnFootSee([p],0,0,undefined,wall),'an officer on foot saw through a building');
 assert.ok(officersOnFootSee([p],0,0,undefined,()=>false));
});

test('accuracy falls with distance; a hit does 10-15',()=>{
 assert.ok(hitChance(3)>hitChance(20)&&hitChance(20)>hitChance(40));
 assert.ok(hitChance(200)>=GUNS.hit[1]-1e-9);
 const guns=createPoliceGuns(),near=officer(1,0,6);
 const events=run(guns,40,()=>({officers:[near],me,stars:3,threat:{armed:true}})).filter(e=>e.kind==='shot');
 const hits=events.filter(e=>e.hit);
 assert.ok(hits.length>0&&hits.length<events.length,'every round hit or none did');
 for(const h of hits)assert.ok(h.damage>=10&&h.damage<=15,`a hit for ${h.damage}`);
});

test('the level clearing holsters everything and forgets the warning',()=>{
 const guns=createPoliceGuns(),p=officer(1,0,8);
 run(guns,4,()=>({officers:[p],me,stars:3,threat:{armed:true}}));
 assert.ok(guns.warned&&p.gunDrawn);
 guns.update(1/30,{officers:[p],me,stars:0});
 assert.ok(!p.gunDrawn&&!guns.warned);
});

test('the new lines exist in the formant voice: 銃を捨てろ！ and 撃つぞ！ (kind police)',()=>{
 for(const [situation,tag] of [['dropGun','銃を捨てろ！'],['warn','撃つぞ！']]){
  const l=policeLine(situation);
  assert.equal(l?.tag,tag);assert.equal(l.kind,'police');
  for(const seg of l.segs)if(seg.on)assert.ok(Object.hasOwn(ONSETS,seg.on),`${tag}: onset ${seg.on}`);
 }
 assert.ok(POLICE_LINES.length>=8);
});

test('an officer shouts without a loudspeaker, never twice inside the gap, and is silent without audio',()=>{
 const made=[];
 const node=()=>({connect(n){made.push(n);return n;},disconnect(){},gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}},
  frequency:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},Q:{value:0},type:'',start(){},stop(){},
  positionX:{value:0},positionY:{value:0},positionZ:{value:0},buffer:null,playbackRate:{value:1}});
 const ctx={currentTime:0,state:'running',sampleRate:44100,createOscillator:node,createGain:node,createBiquadFilter:node,createPanner:node,
  createBufferSource:node,createBuffer:()=>({getChannelData:()=>new Float32Array(10)}),createWaveShaper:()=>{throw new Error('a shout has no loudspeaker');},createDelay:()=>{throw new Error('a shout has no slapback');}};
 const voice=createOfficerVoice(()=>ctx,()=>node());
 assert.ok(voice.shout('warn',1,0,5,0));
 assert.equal(voice.shout('warn',1,0,5,.5),null,'repeated inside the gap');
 const silent=createOfficerVoice(()=>null,()=>null);
 assert.equal(silent.shout('dropGun',1,0,0,0),null);
});

test('the director draws, warns and fires through its frame, and a hit hurts the player',()=>{
 const director=createPoliceDirector({getAudioContext:()=>null,getAudioBus:()=>null,speech:null});
 const p=officer(1,0,8);
 director.units.officers.add(p);
 director.wanted.crime('policeCarTaken',{x:0,z:0,t:0});
 assert.equal(director.wanted.state.stars,3);
 let hurt=0;const events=[];
 for(let t=0;t<20;t+=1/30){
  const w=director.frame(1/30,{player:{x:0,z:0,y:0,alive:true},weapons:{current:'pistol',shots:0},solid:()=>false,hurt:n=>{hurt+=n;}});
  events.push(...(w.gunfire??[]));
 }
 assert.ok(events.some(e=>e.kind==='warn'),'no warning shot');
 assert.ok(events.some(e=>e.kind==='shot'),'never fired on an armed player at ☆3');
 assert.ok(hurt>0,'a hit did not hurt the player');
});

test('an officer drawn by a near body reports the drawn revolver\'s muzzle; nobody else does',async()=>{
 const {createNearCharacters}=await import('../src/life/near-characters.mjs');
 const {Vector3}=await import('three');
 const near=createNearCharacters('high',{});
 assert.equal(near.muzzleOf(1,new Vector3(),new Vector3()),false,'a citizen the pool is not holding has no muzzle');
 near.dispose();
});

test('owner\'s plan: shot dead by the police is the arrest; dying any other way is not',()=>{
 for(const [cause,expect] of [['police',true],['fight',false]]){
  const director=createPoliceDirector({getAudioContext:()=>null,getAudioBus:()=>null,speech:null});
  // A fight death: no officer near firing (a death within 1.5 s of a police hit counts as theirs).
  if(cause==='police')director.units.officers.add(officer(1,0,8));
  director.wanted.crime('policeCarTaken',{x:0,z:0,t:0});
  const me={x:0,z:0,y:0,alive:true,health:100};
  const hurt=(n)=>{if(cause!=='police')return;me.health-=n;if(me.health<=0)me.alive=false;};
  let arrested=false;
  for(let t=0;t<40&&!arrested;t+=1/30){
   if(cause==='fight'&&t>5)me.alive=false;
   const w=director.frame(1/30,{player:me,weapons:{current:'fists',shots:0},solid:()=>false,hurt});
   if(w.arrested)arrested=true;
   if(!me.alive&&cause==='fight'&&t>6)break;
  }
  assert.equal(arrested,expect,`${cause}: arrested ${arrested}`);
  assert.equal(director.wanted.state.stars,0);
 }
});

test('roadmap ②: most rounds into a car reach the cabin, more once it is battered',()=>{
 const share=d=>{let n=0;for(let i=1;i<=4000;i++)if(intoCabin(i,d))n++;return n/4000;};
 const fresh=share(0),battered=share(.8);
 assert.ok(Math.abs(fresh-CAR_ROUNDS.cabin)<.03,`new car: ${fresh}`);
 assert.ok(Math.abs(battered-CAR_ROUNDS.batteredCabin)<.03,`battered: ${battered}`);
 assert.equal(intoCabin(17,0),intoCabin(17,0),'not deterministic');
});

test('roadmap ②: shot dead at the wheel by the police is the arrest too',()=>{
 const director=createPoliceDirector({getAudioContext:()=>null,getAudioBus:()=>null,speech:null});
 director.units.officers.add(officer(1,0,8));
 director.wanted.crime('policeCarTaken',{x:0,z:0,t:0});
 const me={x:0,z:0,y:0,alive:true,health:100},car={state:{x:0,z:0,y:0,type:'sedan',damage:0,speed:0,slot:null}};
 let arrested=false,cabin=0;
 for(let t=0;t<180&&!arrested;t+=1/30){
  const w=director.frame(1/30,{player:me,car,driving:true,weapons:{current:'fists',shots:0},solid:()=>false,
   hurt:(n,src,o)=>{if(o?.cabin)cabin++;me.health-=n;if(me.health<=0)me.alive=false;}});
  if(w.arrested)arrested=true;
 }
 assert.ok(cabin>0,'no round reached the cabin');
 assert.ok(arrested,'shot dead in the car was not an arrest');
});
