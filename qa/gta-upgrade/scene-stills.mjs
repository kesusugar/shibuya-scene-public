// Stills of the real scene, headless (the check stages 1-6 could not have: they were seen on benches).
//
//   npm run dev:local            (in another shell)
//   node qa/gta-upgrade/scene-stills.mjs [outDir] [query]
//
// A software renderer draws this scene at about one frame in five seconds, and the game advances
// one clamped step (0.1 s) per frame, so waiting for it to play is hopeless. The QA hook turns
// drawing off (`__SHIBUYA_QA__.render(false)`): the game then runs its own loop at full speed and
// only the stills are drawn. Every step is driven by game state through the ?qa=1 globals.
//
// Steps: the crossing; on foot with the katana drawn and walking; the pistol aimed; on the
// motorbike, riding and leaning into a turn; in a car with the radio's banner; a parked car shot
// through its windows and dented; the same car driven into a wall. A still of each, the game
// state beside it, and every console error in <outDir>/scene.json.
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {findChrome} from '../../scripts/lib/headless-chrome.mjs';

const out=process.argv[2]??'evidence/roadmap/scene',query=process.argv[3]??'qa=1&tier=low&time=day&camera=scramble';
const base=process.env.SHIBUYA_URL??'http://127.0.0.1:5174/',W=+(process.env.W??1280),H=+(process.env.H??720);
const only=(process.env.ONLY??'').split(',').filter(Boolean);
mkdirSync(out,{recursive:true});
const dir=join(process.env.TMPDIR??'/tmp',`scene-stills-${process.pid}`);
const chrome=spawn(findChrome(),['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required',
 '--remote-debugging-port=0',`--user-data-dir=${dir}`,`--window-size=${W},${H}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
const endpoint=await new Promise((resolve,reject)=>{let t='';chrome.stderr.on('data',d=>{t+=d;const m=/DevTools listening on (ws:\/\/\S+)/.exec(t);if(m)resolve(m[1]);});chrome.on('exit',()=>reject(new Error('Chrome exited '+t.slice(-300))));});
const port=new URL(endpoint).port;
const page=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let n=0;const pending=new Map(),log=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
 if(m.method==='Runtime.consoleAPICalled'&&/error|warn/.test(m.params.type))log.push({type:m.params.type,text:m.params.args.map(a=>a.value??a.description).join(' ').slice(0,500)});
 if(m.method==='Runtime.exceptionThrown')log.push({type:'exception',text:(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text).slice(0,800)});});
const call=(method,params={})=>new Promise(r=>{const id=++n;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});
const js=async expression=>{const m=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(m.result?.exceptionDetails)throw new Error(m.result.exceptionDetails.exception?.description??'evaluate failed');return m.result.result.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(expr,seconds,label)=>{for(let i=0;i<seconds*4;i++){if(await js(`(()=>{try{return !!(${expr})}catch{return false}})()`))return true;await sleep(250);}
 console.log(`  timed out: ${label}`);return false;};
/** Let the game run `seconds` of its own time, drawing nothing. */
const run=async(seconds,{each=null}={})=>{await js('window.__SHIBUYA_QA__.render(false)');
 const t0=await js('window.__SHIBUYA_LIFE__?.sim?.time??0');
 // By game time, not by polls: headless Chrome can stall for seconds with no frame at all (§9ay).
 const wall=Date.now()+90000;
 while(Date.now()<wall){if(each)await js(each);const t=await js('window.__SHIBUYA_LIFE__?.sim?.time??0');if(t-t0>=seconds)break;await sleep(25);}};
/** Run the game, drawing nothing, until `expr` holds or `seconds` of game time pass. */
const runUntil=async(expr,seconds,label)=>{await js('window.__SHIBUYA_QA__.render(false)');const t0=await js('window.__SHIBUYA_LIFE__?.sim?.time??0');
 for(let i=0;i<seconds*80;i++){if(await js(`(()=>{try{return !!(${expr})}catch{return false}})()`))return true;const t=await js('window.__SHIBUYA_LIFE__?.sim?.time??0');if(t-t0>seconds)break;await sleep(25);}
 console.log(`  not reached: ${label}`);return false;};
const steps=[];
/** Draw two frames and keep the second (the first after a state change can be a frame behind). */
async function still(name,note,{view=null,hud=false}={}){
 // A placed camera (see __SHIBUYA_QA__.view) and, unless the HUD is the point, the panels hidden.
 await js(`window.__SHIBUYA_QA__.view(${JSON.stringify(view)})`);
 await js(`(()=>{let s=document.getElementById('qa-hide');if(!s){s=document.createElement('style');s.id='qa-hide';document.head.appendChild(s);}
  s.textContent=${JSON.stringify(hud?'':HIDE)};})()`);
 await js('window.__SHIBUYA_QA__.render(true)');
 const f0=await js('window.__SHIBUYA_QA__.frames');await until(`window.__SHIBUYA_QA__.frames>=${f0+2}`,90,'two drawn frames');
 const r=await call('Page.captureScreenshot',{format:'jpeg',quality:86});writeFileSync(join(out,name+'.jpg'),Buffer.from(r.result.data,'base64'));
 const state=await js(`(()=>{const p=window.__SHIBUYA_PLAYER__?.state,c=window.__SHIBUYA_CAR__?.state,m=window.__SHIBUYA_QA__.metrics;
  return {player:p&&{x:+p.x.toFixed(1),z:+p.z.toFixed(1),weapon:p.weapon,health:p.health},car:c&&{active:c.active,type:c.type,speed:+(c.speed??0).toFixed(1),damage:+(c.damage??0).toFixed(2),wear:c.slot?.wear?{dents:c.slot.wear.dents.length,panes:c.slot.wear.panes}:null},
   radio:document.querySelector('.play-radio')?.hidden===false?document.querySelector('.play-radio').textContent:null,fps:m.fps,drawCalls:m.drawCalls,triangles:m.triangles};})()`);
 steps.push({name,note,state});await js('window.__SHIBUYA_QA__.view(null)');console.log(`  ${name}: ${note} ${JSON.stringify(state).slice(0,240)}`);
}
const HIDE='.play-dashboard,.play-mission,.play-map,.tc{visibility:hidden!important}';
const want=k=>!only.length||only.includes(k);

await call('Runtime.enable');await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:false});
console.log('opening',base+'?'+query);await call('Page.navigate',{url:base+'?'+query});
await until('window.__SHIBUYA_QA__?.ready',600,'the scene');
if(want('crossing'))await still('00-crossing','the crossing, observe mode');
await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='プレイヤー')?.click()`);
await until('window.__SHIBUYA_PLAYER__&&window.__SHIBUYA_ARSENAL__&&window.__SHIBUYA_CAR__',120,'player mode');
await run(2);
// Somewhere quiet on the pavement near the start, facing along it.
const spot=await js(`(()=>{const ctx=window.__SHIBUYA_CTX__,sim=window.__SHIBUYA_LIFE__.sim,p=window.__SHIBUYA_PLAYER__;
 let best=null;for(let r=6;r<=50;r+=4)for(let a=0;a<24;a++){const x=p.state.x+Math.sin(a/24*6.283)*r,z=p.state.z+Math.cos(a/24*6.283)*r;
  if(!ctx.safe(x,z)||ctx.onRoad?.(x,z))continue;let k=0;for(const q of sim.pool)if(q.active&&Math.hypot(q.x-x,q.z-z)<6)k++;if(!best||k<best.k)best={x,z,k};}
 if(best)p.place(best.x,best.z,p.state.heading);return best;})()`);
console.log('  on foot at',JSON.stringify(spot));
const select=async slot=>{await js(`window.__SHIBUYA_ARSENAL__.select?.(${slot})??window.__SHIBUYA_ARSENAL__.inventory?.select?.(${slot})`);};
if(want('katana')){
 await js(`(()=>{const e=new KeyboardEvent('keydown',{key:'3'});window.dispatchEvent(e);window.dispatchEvent(new KeyboardEvent('keyup',{key:'3'}));})()`);
 await run(1.2);
 // Walk: hold W for a second and a half, then draw mid-stride.
 await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'}))`);await run(1.4);
 await still('10-katana-walk','the katana drawn, walking (the guard, elbows down)',{view:{dist:2.6,height:1.5,yaw:-2.2,target:1.15}});
 await js(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'w'}))`);await run(1);
 await still('11-katana-stand','the katana drawn, standing',{view:{dist:2.4,height:1.5,yaw:2.6,target:1.15}});
}
if(want('pistol')){
 await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'2'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'2'}))`);await run(1);
 await js(`window.__SHIBUYA_ARSENAL__.aim?.(true)`);await run(.8);
 await still('20-pistol-aim','the pistol aimed',{view:{dist:2.6,height:1.55,yaw:-2.3,target:1.3}});
 await js(`window.__SHIBUYA_ARSENAL__.aim?.(false)`);
 await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'1'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'1'}))`);await run(.8);
}
const nearestOf=type=>`(()=>{const p=window.__SHIBUYA_PLAYER__.state;let b=null;for(const v of window.__SHIBUYA_TRAFFIC__.sim.pool){if(!v.active||v.type!==${JSON.stringify(type)}||!v.parked)continue;const d=Math.hypot(v.x-p.x,v.z-p.z);if(!b||d<b.d)b={v,d};}return b;})()`;
const walkTo=async type=>{
 const ok=await js(`(()=>{const b=${nearestOf(type)};if(!b)return null;const car=window.__SHIBUYA_CAR__,d=car.doorPose(b.v,b.v.x,b.v.z)??{x:b.v.x+1.5,z:b.v.z};window.__SHIBUYA_PLAYER__.place(d.x,d.z,0);return {x:+b.v.x.toFixed(1),z:+b.v.z.toFixed(1),d:+b.d.toFixed(1)};})()`);
 console.log(`  to the nearest ${type}:`,JSON.stringify(ok));return ok;};
const drive=()=>js(`document.querySelector('.play-drive')?.click()`);
const onFoot=`document.querySelector('.play-speed')?.textContent==='徒歩'`;
/** Out of whatever is being driven, onto the pavement. */
const dismount=async()=>{if(await js(onFoot))return true;await drive();return runUntil(onFoot+'&&!window.__SHIBUYA_PLAYER__.state.vehiclePhase',15,'on foot');};
const where=label=>js(`JSON.stringify({label:${JSON.stringify(label)},driving:!(${onFoot}),foot:${onFoot},speedText:document.querySelector('.play-speed')?.textContent,drive:document.querySelector('.play-drive')?.textContent,p:[+window.__SHIBUYA_PLAYER__.state.x.toFixed(1),+window.__SHIBUYA_PLAYER__.state.z.toFixed(1)],car:window.__SHIBUYA_CAR__.state.type,phase:window.__SHIBUYA_PLAYER__.state.vehiclePhase})`).then(v=>console.log('   ',v));
if(want('bike')){
 if(await walkTo('motorbike')){
  await run(.5);await drive();await runUntil(`!(${onFoot})&&window.__SHIBUYA_CAR__.state.type==="motorbike"`,25,'on the bike');await run(1);
  await still('30-bike-mounted','on the motorbike, stopped',{view:{dist:3.4,height:1.4,yaw:-1.9,target:.8}});
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'}))`);await run(2.5);
  await still('31-bike-riding','riding (the chase camera)');
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'a'}))`);await run(.9);
  await still('32-bike-lean','leaning into a turn',{view:{dist:4,height:1.3,yaw:3.14,target:.8}});
  await js(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'a'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'w'}))`);await runUntil('Math.abs(window.__SHIBUYA_CAR__.state.speed)<.3',8,'stopped');
  await dismount();await where('off the bike');
 }
}
if(want('car')){
 // The player's own car: in, the radio on, its banner.
 await dismount();
 await js(`(()=>{const c=window.__SHIBUYA_CAR__,own=c.own,p=window.__SHIBUYA_PLAYER__;if(!own)return;for(const side of [-1,1]){const a=c.anchors(own,side).entry;p.place(a.x,a.z,0);if(c.nearestEntry(p.state.x,p.state.z)?.slot===own&&c.nearestEntry(p.state.x,p.state.z).inRange)return;}})()`);
 await run(.5);await where('at the own car');await drive();await runUntil(`!(${onFoot})&&window.__SHIBUYA_CAR__.state.type!=="motorbike"`,25,'in the car');await run(1);
 await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'r'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'r'}))`);await run(.6);
 await where('in the car?');
 await still('40-car-radio','in the car, the radio tuned (its banner at the top)',{hud:true});
 // Into a parked car at 14 m/s (the nearest with a clear run-up; cars collide for certain): the dents and the glass.
 const wall=await js(`(()=>{const c=window.__SHIBUYA_CAR__.state,ctx=window.__SHIBUYA_CTX__;let best=null;
  for(const v of window.__SHIBUYA_TRAFFIC__.sim.pool){if(!v.active||v===c.slot||!v.parked)continue;const d=Math.hypot(v.x-c.x,v.z-c.z);if(d<8||d>45)continue;if(!best||d<best.d)best={v,d};}
  if(!best)return null;const h=Math.atan2(best.v.x-c.x,best.v.z-c.z);c.heading=h;c.course=h;c.speed=14;return {h:+h.toFixed(2),d:+best.d.toFixed(1),type:best.v.type};})()`);
 console.log('  crash into',JSON.stringify(wall));
 await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'}))`);
 await runUntil('(window.__SHIBUYA_CAR__.state.damage??0)>.1',4,'a crash');await run(.4);
 await js(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'w'}))`);await run(.8);
 await still('41-car-crash','after driving into a wall at 14 m/s: the nose dented, the windscreen out',{view:{dist:4.5,height:1.9,yaw:2.5,target:.7}});
 await still('42-car-crash-hud','the same, the damage in the HUD',{hud:true});
 await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'s'}))`);await run(1);await js(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'s'}))`);
 await runUntil('Math.abs(window.__SHIBUYA_CAR__.state.speed)<.3',6,'stopped');await dismount();await where('out of the car');
}
if(want('smoke')){
 // Roadmap ③: the smoke off a crash and off a damaged car, close up -- in the own car, into a
 // parked one, then left standing at 60% and 95% damage.
 await dismount();
 await js(`(()=>{const c=window.__SHIBUYA_CAR__,own=c.own,p=window.__SHIBUYA_PLAYER__;if(!own)return;for(const side of [-1,1]){const a=c.anchors(own,side).entry;p.place(a.x,a.z,0);if(c.nearestEntry(p.state.x,p.state.z)?.slot===own&&c.nearestEntry(p.state.x,p.state.z).inRange)return;}})()`);
 await run(.5);await drive();await runUntil(`!(${onFoot})&&window.__SHIBUYA_CAR__.state.type!=="motorbike"`,25,'in the car');await run(1);
 await js(`(()=>{const c=window.__SHIBUYA_CAR__.state;let best=null;
  for(const v of window.__SHIBUYA_TRAFFIC__.sim.pool){if(!v.active||v===c.slot||!v.parked)continue;const d=Math.hypot(v.x-c.x,v.z-c.z);if(d<8||d>45)continue;if(!best||d<best.d)best={v,d};}
  if(!best)return;const h=Math.atan2(best.v.x-c.x,best.v.z-c.z);c.heading=h;c.course=h;c.speed=14;})()`);
 await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'}))`);
 await runUntil('(window.__SHIBUYA_CAR__.state.damage??0)>.1',4,'a crash');
 await js(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'w'}))`);await run(.25);
 await still('60-crash-smoke','a moment after the crash: the burst of smoke and sparks off the front',{view:{dist:5,height:1.8,yaw:2.3,target:.9}});
 await js(`window.__SHIBUYA_CAR__.state.damage=.6`);await run(2.5);
 await still('61-damaged-smoke','standing at 60% damage: grey smoke off the bonnet',{view:{dist:5.5,height:2,yaw:2.3,target:1.2}});
 await js(`window.__SHIBUYA_CAR__.state.damage=.95`);await run(2.5);
 await still('62-wrecked-smoke','standing at 95% damage: dark smoke',{view:{dist:5.5,height:2,yaw:2.3,target:1.2}});
}
if(want('shoot')){
 await dismount();
 // The nearest parked car (not a bike, not the own car): four rounds through its side windows,
 // then in, so the close-range model shows the damage, seen from outside.
 const target=await js(`(()=>{const p=window.__SHIBUYA_PLAYER__;let b=null;for(const v of window.__SHIBUYA_TRAFFIC__.sim.pool){if(!v.active||!v.parked||v.owned||v.type==='motorbike'||v.controlled)continue;const d=Math.hypot(v.x-p.state.x,v.z-p.state.z);if(!b||d<b.d)b={v,d};}
  if(!b)return null;const v=b.v,s=Math.sin(v.heading),c=Math.cos(v.heading);const side=window.__SHIBUYA_CTX__.safe(v.x+c*4.5,v.z-s*4.5)?1:-1;
  p.place(v.x+c*4.5*side,v.z-s*4.5*side,0);p.state.heading=Math.atan2(v.x-p.state.x,v.z-p.state.z);window.__TARGET__=v;return {x:+v.x.toFixed(1),z:+v.z.toFixed(1),type:v.type,d:+b.d.toFixed(1)};})()`);
 console.log('  target',JSON.stringify(target));
 if(target){
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'2'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'2'}))`);await run(1);
  await js(`window.__SHIBUYA_ARSENAL__.aim?.(true)`);await run(.6);
  for(let i=0;i<4;i++){await js(`(()=>{const v=window.__TARGET__,p=window.__SHIBUYA_PLAYER__.state;p.heading=Math.atan2(v.x-p.x,v.z-p.z)+(${i}-1.5)*.06;p.pitch=.02;})()`);
   await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'e'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'e'}))`);await run(.8);}
  await js(`window.__SHIBUYA_ARSENAL__.aim?.(false)`);
  const wear=await js(`JSON.stringify(window.__TARGET__.wear??null)`);console.log('  its wear',wear);
  console.log('  shots',await js(`JSON.stringify((()=>{const a=window.__SHIBUYA_ARSENAL__.snapshot();return {current:a.current,shots:a.shots,cars:a.cars,walls:a.walls,misses:a.misses,last:a.lastShot&&{kind:a.lastShot.kind,target:a.lastShot.target,d:a.lastShot.distance}};})())`));
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'1'}));window.dispatchEvent(new KeyboardEvent('keyup',{key:'1'}))`);await run(.5);
  await drive();await runUntil(`!(${onFoot})&&window.__SHIBUYA_CAR__.state.slot===window.__TARGET__`,25,'in the shot car');await run(1);
  await still('50-shot-car','the shot car, from outside, after getting in (the model shows its wear)',{view:{dist:4.2,height:1.7,yaw:1.9,target:1}});
  await still('51-shot-car-other','the same car from its other side',{view:{dist:4.2,height:1.7,yaw:-1.9,target:1}});
 }
}
writeFileSync(join(out,'scene.json'),JSON.stringify({query,steps,errors:log.filter(l=>l.type!=='warning'),warnings:log.filter(l=>l.type==='warning').length},null,1)+'\n');
console.log(`${steps.length} stills, ${log.filter(l=>l.type!=='warning').length} errors`);
chrome.kill();process.exit(0);
