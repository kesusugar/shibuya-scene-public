// Open the real scene headless and report what the renderer does: frames per second over time,
// WebGL context loss, the GPU string, console errors. The first step in making real-scene
// stills possible (the old captures ran at 0.1 fps and lost the context).
//
//   npm run dev:local            (in another shell)
//   node qa/gta-upgrade/scene-probe.mjs [query] [seconds] [flags...]
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {findChrome} from '../../scripts/lib/headless-chrome.mjs';
const query=process.argv[2]??'qa=1&tier=low&time=day&camera=scramble',seconds=+(process.argv[3]??90),extra=process.argv.slice(4);
const W=+(process.env.W??960),H=+(process.env.H??540),base=process.env.SHIBUYA_URL??'http://127.0.0.1:5174/';
const dir=join(process.env.TMPDIR??'/tmp',`scene-probe-${process.pid}`);
const flags=extra.length?extra:['--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const chrome=spawn(findChrome(),['--headless=new','--no-sandbox',...flags,'--remote-debugging-port=0',`--user-data-dir=${dir}`,`--window-size=${W},${H}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='';
const endpoint=await new Promise((resolve,reject)=>{chrome.stderr.on('data',d=>{stderr+=d;const m=/DevTools listening on (ws:\/\/\S+)/.exec(stderr);if(m)resolve(m[1]);});chrome.on('exit',()=>reject(new Error('exit '+stderr.slice(-400))));});
const port=new URL(endpoint).port;
const page=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let n=0;const pending=new Map(),log=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
 if(m.method==='Runtime.consoleAPICalled'&&/error|warn/.test(m.params.type))log.push(m.params.type+': '+m.params.args.map(a=>a.value??a.description).join(' ').slice(0,300));
 if(m.method==='Runtime.exceptionThrown')log.push('exception: '+(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text).slice(0,300));});
const call=(method,params={})=>new Promise(r=>{const id=++n;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});
const js=async e=>(await call('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result?.result?.value;
await call('Runtime.enable');await call('Page.enable');
// Count frames and context loss from the first line of the page.
await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.__PROBE__={frames:0,lost:0,restored:0};
 (function f(){window.__PROBE__.frames++;requestAnimationFrame(f);})();
 addEventListener('webglcontextlost',e=>{window.__PROBE__.lost++;window.__PROBE__.lostAt=performance.now();},true);
 addEventListener('webglcontextrestored',()=>window.__PROBE__.restored++,true);`});
await call('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:false});
const t0=Date.now();await call('Page.navigate',{url:base+'?'+query});
const samples=[];let last=0;
for(let s=0;s<seconds;s+=5){await new Promise(r=>setTimeout(r,5000));
 const p=await js(`JSON.stringify({f:window.__PROBE__?.frames,lost:window.__PROBE__?.lost,ready:!!window.__SHIBUYA_QA__?.ready,crowd:window.__SHIBUYA_QA__?.metrics?.crowdCount??null,tri:window.__SHIBUYA_QA__?.metrics?.triangles??null,calls:window.__SHIBUYA_QA__?.metrics?.drawCalls??null})`);
 const v=p?JSON.parse(p):{};samples.push({t:Math.round((Date.now()-t0)/1000),fps:+(((v.f??0)-last)/5).toFixed(2),...v});last=v.f??0;
 console.log(JSON.stringify(samples.at(-1)));}
const gpu=await js(`(()=>{const c=document.createElement('canvas').getContext('webgl2');const d=c&&c.getExtension('WEBGL_debug_renderer_info');return d?c.getParameter(d.UNMASKED_RENDERER_WEBGL):null})()`);
console.log('gpu',gpu);console.log(log.slice(0,15).join('\n'));
writeFileSync(join(process.env.TMPDIR??'/tmp','scene-probe.json'),JSON.stringify({query,flags,gpu,samples,log},null,1));
chrome.kill();process.exit(0);
