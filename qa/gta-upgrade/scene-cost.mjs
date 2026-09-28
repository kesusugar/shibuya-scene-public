// Where the frame's CPU time goes in the real scene, per situation (roadmap follow-up, item 2).
//
//   npm run dev:local            (in another shell)
//   node qa/gta-upgrade/scene-cost.mjs [out.json] [query]
//
// Drawing is off (`__SHIBUYA_QA__.render(false)`), so this is the game's own work -- the part a
// software renderer can measure honestly. ?perf=1 makes the probe; each situation runs a few
// seconds of game time, the probe is reset, then 120 frames are summarised: the frame's total CPU
// and each named section (the stages' systems are wrapped by `timed` in ShibuyaScene).
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {findChrome} from '../../scripts/lib/headless-chrome.mjs';

const out=process.argv[2]??'evidence/roadmap/scene/cost.json',query=process.argv[3]??'qa=1&perf=1&tier=high&time=day&camera=scramble';
const base=process.env.SHIBUYA_URL??'http://127.0.0.1:5174/';
const dir=join(process.env.TMPDIR??'/tmp',`scene-cost-${process.pid}`);
const chrome=spawn(findChrome(),['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required',
 '--remote-debugging-port=0',`--user-data-dir=${dir}`,'--window-size=960,540','about:blank'],{stdio:['ignore','ignore','pipe']});
const endpoint=await new Promise((resolve,reject)=>{let t='';chrome.stderr.on('data',d=>{t+=d;const m=/DevTools listening on (ws:\/\/\S+)/.exec(t);if(m)resolve(m[1]);});chrome.on('exit',()=>reject(new Error('Chrome exited '+t.slice(-300))));});
const port=new URL(endpoint).port;
const page=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let n=0;const pending=new Map(),errors=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
 if(m.method==='Runtime.exceptionThrown')errors.push((m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text).slice(0,600));
 if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value??a.description).join(' ').slice(0,400));});
const call=(method,params={})=>new Promise(r=>{const id=++n;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});
const js=async expression=>{const m=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(m.result?.exceptionDetails)throw new Error(m.result.exceptionDetails.exception?.description??'evaluate failed');return m.result.result.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(expr,seconds)=>{for(let i=0;i<seconds*4;i++){if(await js(`(()=>{try{return !!(${expr})}catch{return false}})()`))return true;await sleep(250);}return false;};
const gameTime=()=>js('window.__SHIBUYA_LIFE__?.sim?.time??0');
/** Run `seconds` of game time with `each` evaluated every tick (inputs held, fire held...). */
// Every tick: kept alive (a death or an arrest would clear the stars and end the situation), and the
// highest wanted level seen recorded.
const KEEP=`(()=>{const p=window.__SHIBUYA_PLAYER__?.state;if(p&&p.alive!==false)p.health=100;const w=window.__SHIBUYA_POLICE__?.wanted?.state;window.__MAXSTARS__=Math.max(window.__MAXSTARS__??0,w?.stars??0);})()`;
const run=async(seconds,each=null)=>{const t0=await gameTime();for(let i=0;i<seconds*200;i++){await js(KEEP);if(each)await js(each);if(await gameTime()-t0>=seconds)break;await sleep(10);}};
const key=(k,down=true)=>js(`window.dispatchEvent(new KeyboardEvent('${down?'keydown':'keyup'}',{key:'${k}'}))`);
const results={};
// PROFILE=<name>: a CPU profile over that situation's measured frames, self time summed by function.
const PROFILE=process.env.PROFILE??'';
const profiles={};
async function measure(name,note,{warm=3,each=null}={}){
 await run(warm,each);
 const prof=PROFILE.split(',').includes(name);
 if(prof){await call('Profiler.enable');await call('Profiler.setSamplingInterval',{interval:200});await call('Profiler.start');}
 await js('window.__SHIBUYA_PERF__.reset()');
 await js('window.__MAXSTARS__=0');
 for(let i=0;i<960&&!(await js('window.__SHIBUYA_PERF__.frames>=120'));i++){await js(KEEP);if(each)await js(each);await sleep(250);}
 if(prof){const r=await call('Profiler.stop');const {nodes,samples,timeDeltas}=r.result.profile;const byId=new Map(nodes.map(n=>[n.id,n]));const self=new Map();
  samples.forEach((id,i)=>{const n=byId.get(id),f=n.callFrame,k=`${f.functionName||'(anon)'} ${f.url.replace(/^.*\/(src|app|node_modules)\//,'$1/').replace(/\?.*$/,'')}:${f.lineNumber+1}`;self.set(k,(self.get(k)??0)+(timeDeltas[i]??0)/1000);});
  const total=[...self.values()].reduce((a,b)=>a+b,0);profiles[name]=[...self.entries()].sort((a,b)=>b[1]-a[1]).slice(0,40).map(([k,v])=>[k,+(v/total*100).toFixed(1)]);
  console.log(`  profile ${name} (self time %):`);for(const [k,v] of profiles[name].slice(0,22))console.log(`   ${v}%  ${k}`);}
 const s=await js(`(()=>{const s=window.__SHIBUYA_PERF__.summary();const p=window.__SHIBUYA_POLICE__?.wanted?.state;const m=window.__SHIBUYA_QA__.metrics;
  return {cpu:s.cpu,sections:s.sections,stars:p?.stars??null,maxStars:window.__MAXSTARS__,shots:window.__SHIBUYA_ARSENAL__?.snapshot()?.shots??null,alive:window.__SHIBUYA_PLAYER__?.state?.alive,crowd:m.crowdCount,near:m.nearCharacters,hq:m.hqCrowd?.count??m.hqCrowd??null};})()`);
 results[name]={note,...s};
 const top=Object.entries(s.sections).sort((a,b)=>b[1]-a[1]).slice(0,9).map(([k,v])=>`${k} ${v}`).join(', ');
 console.log(`${name}: cpu mean ${s.cpu.mean} p95 ${s.cpu.p95} ms, ☆${s.stars} (max ☆${s.maxStars}) shots ${s.shots} alive ${s.alive} | ${top}`);
}

await call('Runtime.enable');await call('Page.enable');
console.log('opening',base+'?'+query);await call('Page.navigate',{url:base+'?'+query});
await until('window.__SHIBUYA_QA__?.ready',600);
await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='プレイヤー')?.click()`);
await until('window.__SHIBUYA_PLAYER__&&window.__SHIBUYA_ARSENAL__&&window.__SHIBUYA_CAR__&&window.__SHIBUYA_PERF__',120);
await js('window.__SHIBUYA_QA__.render(false)');
await run(3);
await measure('a-idle','on foot, standing at the start, nothing happening');
// B: the submachine gun held on the trigger into the crowd, turning slowly.
await key('4');await key('4',false);await run(1.5);await js('window.__SHIBUYA_ARSENAL__.aim?.(true)');
await key('e');await js('window.__SHIBUYA_ARSENAL__.hold?.(true)');
await measure('b-firefight','the submachine gun firing held into the crowd (marks, casings, smoke, blood, panic, ☆ rising)',
 {warm:4,each:`(()=>{const p=window.__SHIBUYA_PLAYER__.state;p.heading+=.01;})()`});
await key('e',false);await js('window.__SHIBUYA_ARSENAL__.aim?.(false)');
// C: ☆5 -- the helicopter, roadblocks, the pincer.
await js(`(()=>{const w=window.__SHIBUYA_POLICE__.wanted,p=window.__SHIBUYA_PLAYER__.state;for(let i=0;i<6;i++)w.crime('policeCarTaken',{x:p.x,z:p.z,t:window.__SHIBUYA_LIFE__.sim.time,seenByOfficer:true});})()`);
await measure('c-wanted5','☆5 (as many crimes as it takes): the helicopter, units closing, roadblocks',{warm:8});
// D: the stars gone, the dead left: onlookers film and call, the ambulance comes.
await js(`window.__SHIBUYA_POLICE__.clear?.('qa')`);
await measure('d-aftermath','☆0 with the dead still down: onlookers, the ambulance and patrol car',{warm:22});
// E: on the motorbike, the radio on, riding.
await js(`(()=>{const car=window.__SHIBUYA_CAR__,p=window.__SHIBUYA_PLAYER__;let b=null;for(const v of window.__SHIBUYA_TRAFFIC__.sim.pool){if(!v.active||v.type!=='motorbike')continue;const d=Math.hypot(v.x-p.state.x,v.z-p.state.z);if(!b||d<b.d)b={v,d};}
 if(b){const a=car.anchors(b.v,-1).entry;p.place(a.x,a.z,0);}})()`);
await run(.5);await js(`document.querySelector('.play-drive')?.click()`);
await until(`document.querySelector('.play-speed')?.textContent!=='徒歩'`,5);
for(let i=0;i<40&&await js(`document.querySelector('.play-speed')?.textContent==='徒歩'`);i++)await run(.5);
await key('w');
await measure('e-bike-radio','riding the motorbike with the radio on (the rider figure, the bike model, the radio scheduling)',{warm:3,
 each:`(()=>{const c=window.__SHIBUYA_CAR__.state;if(Math.abs(c.speed)<.5)c.heading+=.4;})()`});
await key('w',false);
// F: a chase mission from the saddle.
await js(`document.querySelector('.play-mission-list button[data-mission="chase"]')?.click()??[...document.querySelectorAll('.play-mission-list button')].find(b=>b.textContent.includes('追跡'))?.click()`);
await key('w');
await measure('f-chase','a chase mission running (the target car driven over the road field), riding',{warm:3,
 each:`(()=>{const c=window.__SHIBUYA_CAR__.state;if(Math.abs(c.speed)<.5)c.heading+=.4;})()`});
await key('w',false);
writeFileSync(out,JSON.stringify({query,results,profiles,errors},null,1)+'\n');
console.log(`written ${out}; ${errors.length} errors`);for(const e of errors.slice(0,5))console.log('  ',e);
chrome.kill();process.exit(0);
