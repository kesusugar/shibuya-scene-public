// Roadmap ① (tests/police-voice.test.mjs is the older formant voice): the police speak in recorded voices -- the loudspeaker (Kokoro jm_kumo), an officer's
// shouts (Style-Bert-VITS2 JVNV M1) and the dispatcher's radio (Kokoro jm_kumo) -- in the words
// Japanese police use, chosen by the situation; and the radio cues come at the right moments.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {createPoliceClips} from '../src/police/voice-clips.mjs';
import {createDispatch,dispatchCue,markSaid,DISPATCH} from '../src/police/dispatch.mjs';
import {createPoliceDirector} from '../src/police/director.mjs';
import {createMegaphone,createOfficerVoice} from '../src/police/siren.mjs';

const LINES=JSON.parse(readFileSync('assets/police-voice/lines.json','utf8')).lines;
const MANIFEST=JSON.parse(readFileSync('public/audio/police/manifest.json','utf8'));

function fakeCtx(){
 let time=0;const made={sources:0,shapers:0,oscillators:0};
 const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}});
 const node=()=>({connect(){},disconnect(){},start(){},stop(){},gain:param(),frequency:param(),Q:param(),delayTime:param(),
  positionX:param(),positionY:param(),positionZ:param(),buffer:null,curve:null,loop:false,type:null});
 return {made,get currentTime(){return time;},advance(s){time+=s;},sampleRate:44100,state:'running',destination:node(),
  createGain:node,createBiquadFilter:node,createDelay:node,createPanner:node,
  createWaveShaper:()=>{made.shapers++;return node();},createOscillator:()=>{made.oscillators++;return node();},
  createBufferSource:()=>{made.sources++;return node();},createBuffer:()=>({getChannelData:()=>new Float32Array(4)})};
}
function clipsFor(ids=LINES){
 const c=createPoliceClips(()=>null);
 for(const l of ids)c.add({id:l.id,situation:l.situation,use:l.use,text:l.text,buffer:{duration:1.5}});
 return c;
}

test('①: every line is shipped, in the owner\'s voices -- loudspeaker and radio Kokoro, shouts JVNV M1',()=>{
 assert.equal(MANIFEST.clips.length,LINES.length);
 for(const l of LINES){
  const c=MANIFEST.clips.find(x=>x.id===l.id);
  assert.ok(c,`${l.id} not shipped`);assert.equal(c.situation,l.situation);assert.equal(c.text,l.text);
  const f=`public/audio/police/${c.file}`;assert.ok(existsSync(f)&&statSync(f).size>2000,`${f} missing or empty`);
  assert.ok(c.duration>.3&&c.duration<10,`${l.id} is ${c.duration}s`);
 }
 assert.equal(MANIFEST.voices.megaphone.voice,'jm_kumo');assert.equal(MANIFEST.voices.radio.voice,'jm_kumo');
 assert.match(MANIFEST.voices.shout.model,/jvnv-M1-jp/);
 for(const v of Object.values(MANIFEST.voices))assert.ok(['Apache-2.0','CC-BY-SA-4.0'].includes(v.licence));
 assert.ok(existsSync('public/licenses/police-voice.txt'),'no licence/credit file');
 // The words: a car, a motorbike and a person are each addressed as the police do.
 const text=s=>LINES.filter(l=>l.situation===s).map(l=>l.text).join('|');
 assert.match(text('stopCar'),/前の車、止まりなさい/);assert.match(text('stopCar'),/左に寄せて止まりなさい/);
 assert.match(text('stopBike'),/そこのバイク、止まりなさい/);assert.match(text('stop'),/止まりなさい/);
 assert.match(text('fleeingCar'),/^警視庁から各局/);
 assert.ok(!LINES.some(l=>/^止まれ/.test(l.text)),'「止まれ」 is not how a patrol car speaks');
});

test('①: a situation with several lines rotates, and the one just said is not repeated',()=>{
 const c=clipsFor();
 const a=c.pick('stopCar'),b=c.pick('stopCar'),d=c.pick('stopCar',b.id);
 assert.notEqual(a.id,b.id);assert.notEqual(d.id,b.id);
 assert.equal(c.pick('nothing'),null);
 const empty=createPoliceClips(()=>null);assert.equal(empty.pick('stopCar'),null,'a line before anything loaded');
});

test('①: with recordings the loudspeaker and the officers play them; before they load, silence -- never the formant voice',()=>{
 const ctx=fakeCtx(),bus={connect(){}};
 const mega=createMegaphone(()=>ctx,()=>bus,{clips:clipsFor()});
 const line=mega.speak(['stopCar'],1,0,0,0);
 assert.match(line.text,/止まりなさい/);assert.equal(ctx.made.sources,2,'the clip and the mic click');
 assert.equal(ctx.made.oscillators,0,'the formant voice was built');
 const officer=createOfficerVoice(()=>ctx,()=>bus,{clips:clipsFor()});
 assert.equal(officer.shout('dropGun',3,0,0,0).text,'武器を捨てなさい！');
 const quiet=createMegaphone(()=>ctx,()=>bus,{clips:createPoliceClips(()=>null)});
 const osc=ctx.made.oscillators;assert.equal(quiet.speak(['stopCar'],1,0,0,10),null);assert.equal(ctx.made.oscillators,osc);
});

function chase({type='sedan',driving=true,officers=[]}={}){
 const ctx=fakeCtx(),bus={connect(){}},said=[];
 const police=createPoliceDirector({getAudioContext:()=>ctx,getAudioBus:()=>bus,speech:null,clips:clipsFor()});
 const speak=police.megaphone.speak;police.megaphone.speak=(s,...r)=>{const l=speak(s,...r);if(l)said.push(l.situation);return l;};
 const shout=police.voice.shout;police.voice.shout=(s,...r)=>{const l=shout(s,...r);if(l)said.push(l.situation);return l;};
 for(const o of officers)police.units.officers.add(o);
 const patrol={id:9,active:true,type:'police',x:12,z:0,heading:0,speed:0,siren:true};
 police.wanted.crime('policeCarTaken',{x:0,z:0,t:0});
 const car={state:{x:0,z:0,y:0,type,damage:0,speed:6,slot:null}},radio=[];
 for(let t=0;t<30;t+=1/30){const w=police.frame(1/30,{player:{x:0,z:0,y:0,alive:true},car,driving,traffic:{pool:[patrol]},
  weapons:{current:'fists',shots:0},solid:()=>false,hurt:()=>{}});if(w.radio)radio.push(w.radio);ctx.advance(1/30);}
 return {said,radio,police};
}

test('①: the loudspeaker speaks to a car as a car and to a motorbike as a motorbike; on foot, to the person',()=>{
 const car=chase();assert.ok(car.said.length>=2);assert.ok(car.said.every(s=>s==='stopCar'),car.said.join(','));
 const bike=chase({type:'motorbike'});assert.ok(bike.said.length>=2);assert.ok(bike.said.every(s=>s==='stopBike'),bike.said.join(','));
 const foot=chase({driving:false});assert.ok(foot.said.some(s=>s==='chase'||s==='stop'),foot.said.join(','));
});

test('①: the dispatcher opens the incident on the radio (a car, or on foot) with its beeps, once',()=>{
 const car=chase();assert.equal(car.radio[0],'fleeingCar');
 const foot=chase({driving:false});assert.equal(foot.radio[0],'fleeingFoot');
 assert.equal(car.radio.filter(r=>r==='fleeingCar').length,1);
});

test('①: the radio cues -- backup each rise to ☆3+, the helicopter, armed, lost; one channel with a gap',()=>{
 const said={};let s={stars:1,driving:true,heli:false,armed:false,seen:true,escape:0};
 const step=()=>{const c=dispatchCue(s,said);if(c)markSaid(said,c,s);return c?.situation??null;};
 assert.equal(step(),'fleeingCar');assert.equal(step(),null,'the opening repeated');
 s={...s,stars:3};assert.equal(step(),'backup');assert.equal(step(),null);
 s={...s,stars:4};assert.equal(step(),'backup','no backup call at ☆4');
 s={...s,heli:true};assert.equal(step(),'air');
 s={...s,armed:true};assert.equal(step(),'armed');
 s={...s,seen:false,escape:1};assert.equal(step(),null,'lost too soon');
 s={...s,escape:DISPATCH.lostAfter+.1};assert.equal(step(),'lost');assert.equal(step(),null);
 // The channel: a second cue waits for the first transmission and the gap.
 const ctx=fakeCtx(),d=createDispatch(()=>ctx,()=>({connect(){}}),clipsFor());
 assert.equal(d.update({stars:1,driving:true,seen:true},0),'fleeingCar');
 assert.equal(d.update({stars:3,driving:true,seen:true},.5),null,'talked over itself');
 assert.equal(d.update({stars:3,driving:true,seen:true},1.5+.3+DISPATCH.gap+.1),'backup');
 assert.ok(ctx.made.shapers>=2&&ctx.made.oscillators>=4,'no radio band or beeps');
 // Cleared: the next incident opens again.
 d.update({stars:0},20);assert.equal(d.update({stars:1,driving:false,seen:true},21),'fleeingFoot');
});
