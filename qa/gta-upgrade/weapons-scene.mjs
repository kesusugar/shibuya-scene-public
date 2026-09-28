// PLAN-WEAPONS: the weapons in the real scene, headless (console errors and stills only).
//
//   npm run dev:local          (in another shell)
//   node qa/gta-upgrade/weapons-scene.mjs [outDir] [query]
//
// Opens the scene, enters player mode with the button a person would press, and through the
// ?qa=1 hooks: draws the katana and cuts, draws the pistol, aims and fires at whoever the lock-on
// picks, and (W3) raises the wanted level to ☆3 to bring armed officers. A still is taken at each
// step, and every console error and exception is recorded to <outDir>/scene.json.
//
// A software renderer runs this at a fraction of a frame per second: nothing here is a frame
// rate, and anything timed is driven off game state, not wall time (§16a, RUN 10).
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {findChrome} from '../../scripts/lib/headless-chrome.mjs';

const out=process.argv[2]??'evidence/weapons',query=process.argv[3]??'qa=1&tier=high&time=day&camera=scramble';
const base=process.env.SHIBUYA_URL??'http://127.0.0.1:5174/';
const W=+(process.env.W??960),H=+(process.env.H??540);
mkdirSync(out,{recursive:true});
const dir=join(process.env.TMPDIR??'/tmp',`weapons-scene-${process.pid}`);
const chrome=spawn(findChrome(),['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required',
 '--remote-debugging-port=0',`--user-data-dir=${dir}`,`--window-size=${W},${H}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
const endpoint=await new Promise((resolve,reject)=>{let text='';chrome.stderr.on('data',d=>{text+=d;const m=/DevTools listening on (ws:\/\/\S+)/.exec(text);if(m)resolve(m[1]);});
 chrome.on('exit',()=>reject(new Error('Chrome exited: '+text.slice(-400))));});
const port=new URL(endpoint).port;
const page=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let n=0;const pending=new Map(),log=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);
 if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
 if(m.method==='Runtime.consoleAPICalled')log.push({type:m.params.type,text:m.params.args.map(a=>a.value??a.description).join(' ').slice(0,600)});
 if(m.method==='Runtime.exceptionThrown')log.push({type:'exception',text:(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text).slice(0,800)});
 if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')log.push({type:'log-error',text:m.params.entry.text.slice(0,600)});});
const call=(method,params={})=>new Promise(r=>{const id=++n;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});
const js=async expression=>{const m=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(m.result?.exceptionDetails)throw new Error(m.result.exceptionDetails.exception?.description??'evaluate failed');return m.result.result.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(expr,seconds,label)=>{for(let i=0;i<seconds*2;i++){if(await js(`(()=>{try{return !!(${expr})}catch{return false}})()`))return true;await sleep(500);}
 console.log(`  timed out waiting for ${label}`);return false;};
const steps=[];
async function shot(name,note){
 const r=await call('Page.captureScreenshot',{format:'png'});
 writeFileSync(join(out,name+'.png'),Buffer.from(r.result.data,'base64'));
 const state=await js(`(()=>{const q=window.__SHIBUYA_QA__?.metrics,a=window.__SHIBUYA_ARSENAL__?.snapshot(),p=window.__SHIBUYA_PLAYER__?.state,po=window.__SHIBUYA_POLICE__;
  return {weapons:a&&{current:a.current,rounds:a.rounds,shots:a.shots,hits:a.hits,headshots:a.headshots,walls:a.walls,cars:a.cars,misses:a.misses,maxPanic:a.maxPanic,lastShot:a.lastShot&&{kind:a.lastShot.kind,zone:a.lastShot.zone,distance:a.lastShot.distance,outcome:a.lastShot.outcome}},
   melee:q?.melee&&{swings:q.melee.swings,hits:q.melee.hits,cuts:q.melee.cuts,clanks:q.melee.clanks,shotHits:q.melee.shotHits,npcDeaths:q.melee.npcDeaths},
   player:p&&{x:+p.x.toFixed(2),z:+p.z.toFixed(2),weapon:p.weapon,aim:p.aim,health:p.health},
   wanted:po?.wanted?.snapshot?.()&&{stars:po.wanted.snapshot().stars},
   police:po?.guns?.snapshot?.()??null,
   drawCalls:q?.drawCalls??null,fps:q?.fps??null};})()`);
 steps.push({name,note,state});console.log(`  ${name}: ${note}`,JSON.stringify(state).slice(0,300));
}
/** Let the game run `frames` rendered frames (the scene advances only as it renders). */
const frames=async(k,limit=240)=>{const start=await js('window.__FRAMES__=(window.__FRAMES__??0)');void start;for(let i=0;i<limit;i++){await sleep(250);
 const f=await js('window.__SHIBUYA_QA__?.metrics?.fps');void f;if(i*250>=k*400)break;}};

await call('Runtime.enable');await call('Page.enable');await call('Log.enable');
await call('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:false});
const url=base+'?'+query;console.log('opening',url);
await call('Page.navigate',{url});
await until('window.__SHIBUYA_QA__',180,'the QA hook');
await until('window.__SHIBUYA_QA__?.metrics?.crowdCount>0',420,'the crowd');
await shot('00-scene','the scene, observe mode');
// Enter player mode by the button.
await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='プレイヤー')?.click()`);
await until('window.__SHIBUYA_PLAYER__&&window.__SHIBUYA_ARSENAL__',120,'player mode');
await frames(8);
// The start point is inside the kerb crowd, where a shoulder camera sees only heads. Move to the
// quietest walkable spot within 60 m and face the nearest facade, so a still shows the weapon.
const spot=await js(`(()=>{const ctx=window.__SHIBUYA_CTX__,sim=window.__SHIBUYA_LIFE__?.sim,p=window.__SHIBUYA_PLAYER__;
 let best=null;for(let r=8;r<=60;r+=4)for(let a=0;a<24;a++){const x=p.state.x+Math.sin(a/24*6.283)*r,z=p.state.z+Math.cos(a/24*6.283)*r;
  if(!ctx.safe(x,z)||ctx.onRoad?.(x,z))continue;let n=0;for(const q of sim.pool)if(q.active&&Math.hypot(q.x-x,q.z-z)<7)n++;
  let wall=null;for(let k=0;k<16&&!wall;k++)for(let d=4;d<=22;d+=.5)if(ctx.solid(x+Math.sin(k/16*6.283)*d,z+Math.cos(k/16*6.283)*d,.05)){wall={h:k/16*6.283,d};break;}
  const sc=n+(wall?0:50)+(wall?Math.abs(wall.d-12)*.2:0);if(!best||sc<best.sc)best={x,z,sc,n,wall};}
 if(best){p.place(best.x,best.z,best.wall?.h??0);p.state.heading=best.wall?.h??0;p.state.pitch=-.05;}return best;})()`);
console.log('  moved to',JSON.stringify(spot));
await frames(10);
await shot('01-player','player mode, fists, pistol at the hip, katana on the back');
// The katana: 3, then a cut.
await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'3'}))`);
await frames(6);
await shot('02-katana','katana drawn: the two-handed guard (SwordIdle, CMU 02_07)');
await js(`window.__SHIBUYA_MELEE__.request()`);
await until('window.__SHIBUYA_MELEE__.phase==="active"||window.__SHIBUYA_MELEE__.snapshot().cuts>0',60,'the cut');
await shot('03-katana-cut','the two-handed cut, in its window');
await until('window.__SHIBUYA_MELEE__.phase==="idle"',90,'the cut to end');
// §9ai: hits that land. Bring the nearest pedestrian in front of the player and cut them twice:
// the first cut shows the catch, the blood and the flinch; the second kills, and the ragdoll falls.
if(process.env.HITS!=='0'){
 const put=`(()=>{const sim=window.__SHIBUYA_LIFE__?.sim,s=window.__SHIBUYA_PLAYER__.state;let best=null,d=1e9;
  for(const q of sim.pool){if(!q.active||q.controlled||q.struck!==undefined||q.combatDead||q.archetype==='kid'||q.crossing)continue;const k=Math.hypot(q.x-s.x,q.z-s.z);if(k<d){d=k;best=q;}}
  if(!best)return null;const h=s.heading;best.x=best.renderX=best.previousX=s.x+Math.sin(h)*1.3;best.z=best.renderZ=best.previousZ=s.z+Math.cos(h)*1.3;
  best.speed=0;best.pause=30;best.mode='idle';best.state='idle';best.heading=h+Math.PI;window.__HIT_TARGET__=best.id;return {id:best.id,d};})()`;
 console.log('  target',JSON.stringify(await js(put)));
 await frames(6);
 await until('window.__SHIBUYA_LIFE__?.nearCharacters?.bodyOf?.(window.__HIT_TARGET__)==="humanoid"',60,'the target to get a humanoid');
 await js(`window.__SHIBUYA_MELEE__.request()`);
 await until('window.__SHIBUYA_LIFE__.sim.pool[window.__HIT_TARGET__].hitSeq>0',90,'the cut to land');
 await shot('03b-cut-lands','a cut lands: the catch, the blood, the flinch');
 await until('window.__SHIBUYA_MELEE__.phase==="idle"',90,'the cut to end');
 await js(`window.__SHIBUYA_MELEE__.request()`);
 await until('window.__SHIBUYA_LIFE__.sim.pool[window.__HIT_TARGET__].combatDead',120,'the second cut to kill');
 await frames(2);
 await shot('03c-ragdoll-falls','the second cut kills: the ragdoll falls along the cut');
 await frames(12);
 await shot('03d-ragdoll-down','down, where the cut put them');
 await until('window.__SHIBUYA_MELEE__.phase==="idle"',90,'the cut to end');
}
// The pistol: 2, aim, fire.
await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'2'}))`);
await frames(4);
await js(`window.__SHIBUYA_ARSENAL__.aim(true)`);
await until('window.__SHIBUYA_FIGURE__?.aim?.aimWeight>.95',60,'the aim');
await shot('04-pistol-aim','pistol aimed over the shoulder, crosshair');
for(let k=0;k<3;k++){
 const before=await js('window.__SHIBUYA_ARSENAL__.snapshot().shots');
 await js(`window.__SHIBUYA_ARSENAL__.trigger()`);
 await until(`window.__SHIBUYA_ARSENAL__.snapshot().shots>${before}`,60,'a shot');
 await shot(`05-pistol-shot-${k}`,'a shot, the frame it was fired');
 await frames(3);
}
await js(`window.__SHIBUYA_ARSENAL__.aim(false)`);
// §9ah: the submachine gun: 4, the low ready, then aim and hold the trigger for a burst.
await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'4'}))`);
await until('window.__SHIBUYA_FIGURE__?.weapons?.current==="smg"',60,'the submachine gun');
await frames(4);
await shot('08-smg-low','submachine gun drawn: the low ready');
await js(`window.__SHIBUYA_ARSENAL__.aim(true)`);
await until('window.__SHIBUYA_FIGURE__?.aim?.aimWeight>.95',60,'the aim');
await shot('09-smg-aim','submachine gun shouldered, crosshair');
{const before=await js('window.__SHIBUYA_ARSENAL__.snapshot().shots');
 await js(`window.__SHIBUYA_ARSENAL__.trigger();window.__SHIBUYA_ARSENAL__.hold(true)`);
 await until(`window.__SHIBUYA_ARSENAL__.snapshot().shots>=${before}+2`,120,'a burst');
 await shot('10-smg-burst','a burst: recoil and the open crosshair');
 await until(`window.__SHIBUYA_ARSENAL__.snapshot().shots>=${before}+6`,240,'a longer burst');
 await js(`window.__SHIBUYA_ARSENAL__.hold(false)`);
 await shot('11-smg-burst-end','the burst released');}
await js(`window.__SHIBUYA_ARSENAL__.aim(false)`);
if(process.env.POLICE!=='0'){
 // W3: ☆3 by the wanted level's own rule (a police car taken), then wait for armed officers.
 await js(`(()=>{const p=window.__SHIBUYA_POLICE__,s=window.__SHIBUYA_PLAYER__.state;p?.wanted.crime('policeCarTaken',{x:s.x,z:s.z,t:0});})()`);
 await until('window.__SHIBUYA_POLICE__?.guns?.snapshot?.().drawn>0',600,'an officer to draw');
 await shot('06-police-drawn','☆3: an officer with a revolver drawn');
 await until('window.__SHIBUYA_POLICE__?.guns?.snapshot?.().warnings>0',600,'the warning shot');
 await shot('07-police-warning','the warning shot (撃つぞ！)');
}
const errors=log.filter(l=>l.type==='error'||l.type==='exception'||l.type==='log-error');
writeFileSync(join(out,'scene.json'),JSON.stringify({url:url.replace(base,'<local>/'),viewport:[W,H],steps,
 console:{messages:log.length,errors:errors.length,list:errors,warnings:log.filter(l=>l.type==='warning').slice(0,20)}},null,1)+'\n');
console.log(`${out}: ${steps.length} stills, ${log.length} console messages, ${errors.length} errors`);
for(const e of errors.slice(0,10))console.log('  ',e.type,e.text.slice(0,300));
ws.close();chrome.kill();try{rmSync(dir,{recursive:true,force:true});}catch{}
process.exit(0);
