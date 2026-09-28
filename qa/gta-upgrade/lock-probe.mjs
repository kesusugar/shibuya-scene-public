// Roadmap ④: the pad's lock-on in the real scene, headless -- where the reticle lands on a locked
// person, and that a shooter off to the side is taken over a pedestrian in front. Built on the
// scene-stills harness (same steps to player mode); writes <outDir>/lock.json and stills.
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

const out=process.argv[2]??'evidence/roadmap/lock',query=process.argv[3]??'qa=1&tier=low&time=day&camera=scramble';
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
 // By game time, not by polls: headless Chrome can stall for seconds with no frame at all.
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
await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='プレイヤー')?.click()`);
await until('window.__SHIBUYA_PLAYER__&&window.__SHIBUYA_ARSENAL__&&window.__SHIBUYA_CAR__',120,'player mode');
await run(2);
await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'2'}))`);await js(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'2'}))`);
await run(1.5);
// What the HUD shows against where the lock is: the reticle's centre in page px vs. the lock
// point projected by the page itself.
const results={};
const probe=`(()=>{const a=window.__SHIBUYA_ARSENAL__,l=a.lock,c=document.querySelector('.play-crosshair'),r=c.getBoundingClientRect();
 return {lock:l&&{id:l.id,tier:l.tier,part:l.part},crosshair:{hidden:c.hidden,x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),threat:c.dataset.threat},
  centre:{x:innerWidth/2,y:innerHeight/2},heading:+window.__SHIBUYA_PLAYER__.state.heading.toFixed(3),
  arsenal:(({aiming,current,rounds,reloading,locks,switchedLocks,padLock})=>({aiming,current,rounds,reloading,locks,switchedLocks,padLock}))(a.snapshot()),
  me:(({x,z,aim,weapon})=>({x:+x.toFixed(1),z:+z.toFixed(1),aim,weapon}))(window.__SHIBUYA_PLAYER__.state),
  shooter:window.__SHOOTER__&&{x:+window.__SHOOTER__.x.toFixed(1),z:+window.__SHOOTER__.z.toFixed(1),active:window.__SHOOTER__.active,controlled:!!window.__SHOOTER__.controlled,struck:window.__SHOOTER__.struck,dead:!!window.__SHOOTER__.combatDead}};})()`;
await runUntil(`window.__SHIBUYA_PLAYER__.state.weapon==='pistol'`,5,'the pistol out');
await js('window.__SHIBUYA_ARSENAL__.aim(true,{pad:true})');
// The page can stall for a few seconds here (nothing runs, not even the game's clock); wait it out.
await runUntil('window.__SHIBUYA_ARSENAL__.lock',20,'a lock');
results.pedestrian=await js(probe);console.log('pedestrian',JSON.stringify(results.pedestrian));
await still('lock-pedestrian','ZL held: the nearest person in view, the reticle on them',{hud:true});
// A shooter 60° to the right of the view, 20 m out: a pedestrian made to look like one.
const shooter=await js(`(async()=>{const {lineOfSight}=await import('/src/player/ballistics.mjs');const ctx=window.__SHIBUYA_CTX__,solid=(x,z)=>!!ctx.solid?.(x,z,.05);const sim=window.__SHIBUYA_LIFE__.sim,s=window.__SHIBUYA_PLAYER__.state,lock=window.__SHIBUYA_ARSENAL__.lock;let best=null;
 for(const q of sim.pool){if(!q.active||q.controlled||q.archetype==='kid'||q.id===lock?.id||q.struck!==undefined||q.combatDead)continue;
  const dx=q.x-s.x,dz=q.z-s.z,dist=Math.hypot(dx,dz);let off=Math.atan2(dx,dz)-s.heading;off=Math.atan2(Math.sin(off),Math.cos(off));
  if(dist<8||dist>30||Math.abs(off)<.6||Math.abs(off)>1.4||!lineOfSight(solid,s,q))continue;const d=Math.abs(Math.abs(off)-1)*10+Math.abs(dist-18);if(!best||d<best.d)best={q,d,off,dist};}
 if(!best)return null;best.q.shotAtPlayerLeft=30;best.q.gunDrawn=true;window.__SHOOTER__=best.q;return {id:best.q.id,off:+best.off.toFixed(2),dist:+best.dist.toFixed(1)};})()`);
await js('window.__SHIBUYA_ARSENAL__.aim(false,{pad:true})');await run(1.2);await js('window.__SHIBUYA_ARSENAL__.aim(true,{pad:true})');
await run(1.5,{each:'window.__SHOOTER__&&(window.__SHOOTER__.shotAtPlayerLeft=30)'});
results.shooter={marked:shooter,...await js(probe)};
// Why (or why not) the shooter is a candidate, by the lock's own rule over the scene's world.
results.shooterWhy=await js(`(async()=>{const {lockCandidates,lockOrder}=await import('/src/player/arsenal.mjs');const {lineOfSight}=await import('/src/player/ballistics.mjs');
 const ctx=window.__SHIBUYA_CTX__,sim=window.__SHIBUYA_LIFE__.sim,s=window.__SHIBUYA_PLAYER__.state,q=window.__SHOOTER__,solid=(x,z)=>!!ctx.solid?.(x,z,.05);
 const world={people:()=>sim.pool.filter(p=>p.active),bodyOf:p=>({y:p.height??0,height:1.76}),clear:(a,p)=>lineOfSight(solid,a,p)};
 const cam={position:{x:s.x,y:(s.y??0)+1.6,z:s.z},direction:{x:Math.sin(s.heading),y:0,z:Math.cos(s.heading)}};
 const c=lockCandidates(s,cam,world),mine=c.find(k=>k.p===q),o=lockOrder(c);
 return {candidates:c.length,shooterIn:!!mine,los:lineOfSight(solid,s,q),dist:+Math.hypot(q.x-s.x,q.z-s.z).toFixed(1),struck:q.struck,controlled:!!q.controlled,dead:!!q.combatDead,left:q.shotAtPlayerLeft,
  first:o[0]&&{id:o[0].p.id,tier:o[0].tier}};})()`);console.log('shooter why',JSON.stringify(results.shooterWhy));console.log('shooter',JSON.stringify(results.shooter));
await still('lock-shooter','ZL again after a pause: the one shooting is taken first, the camera turned onto them, ringed reticle',{hud:true});
// ZL let go and pressed again at once: the next target.
// ZL let go and pressed again (the next target) is not probed here: the harness cannot hold a
// release under 0.4 s of game time reliably. tests/pad-aim.test.mjs covers it.
writeFileSync(join(out,'lock.json'),JSON.stringify({query,results,steps,log},null,1)+'\n');
console.log(`written ${out}; ${log.filter(l=>l.type!=='warn').length} errors`);
chrome.kill();process.exit(0);
