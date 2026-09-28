// Open the scene headless, wait for a condition, run optional setup, save a still and the console
// (PLAN-PERFORMANCE-AND-PAD evidence). Needs `npm run dev:local` running.
//
//   node qa/gta-upgrade/page-capture.mjs <out.png> "<query>" "<wait expression>" ["<setup expression>"] ["<result expression>"]
//
// SwiftShader is slow (~0.1 fps with the city up): the wait is generous and nothing here is a
// frame rate. `<result expression>` is evaluated at the end and saved with the console in
// <out>.json. Set PAD=switch to present a fake Switch Pro Controller to the page.
import {spawn} from 'node:child_process';
import {writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {findChrome} from '../../scripts/lib/headless-chrome.mjs';

const [out,query='',wait='true',setup='',result='null']=process.argv.slice(2);
const W=+(process.env.W??1280),H=+(process.env.H??720),limit=+(process.env.WAIT_S??2400);
const url=(process.env.SHIBUYA_URL??'http://127.0.0.1:5174/')+'?'+query;
mkdirSync(dirname(out),{recursive:true});
const dir=join(process.env.TMPDIR??'/tmp',`page-capture-${process.pid}`);
const chrome=spawn(findChrome(),['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader',
 '--remote-debugging-port=0',`--user-data-dir=${dir}`,`--window-size=${W},${H}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
const endpoint=await new Promise((res,rej)=>{let t='';chrome.stderr.on('data',d=>{t+=d;const m=/DevTools listening on (ws:\/\/\S+)/.exec(t);if(m)res(m[1]);});chrome.on('exit',()=>rej(new Error(t.slice(-300))));});
const page=(await (await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`)).json()).find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let n=0;const pending=new Map(),log=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
 if(m.method==='Runtime.consoleAPICalled')log.push({type:m.params.type,text:m.params.args.map(a=>a.value??a.description).join(' ').slice(0,400)});
 if(m.method==='Runtime.exceptionThrown')log.push({type:'exception',text:(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text).slice(0,600)});});
const call=(method,params={})=>new Promise(r=>{const id=++n;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});
const js=async e=>{const m=await call('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(m.result?.exceptionDetails)throw new Error(m.result.exceptionDetails.exception?.description??'evaluate failed');return m.result.result.value;};
await call('Runtime.enable');await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:false});
if(process.env.PAD==='switch'){
 // A Switch Pro Controller as Chrome presents it (standard mapping), with state the page can script.
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const pad={id:'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',index:0,connected:true,mapping:'standard',timestamp:0,
  axes:[0,0,0,0],buttons:Array.from({length:18},()=>({pressed:false,touched:false,value:0})),vibrationActuator:{type:'dual-rumble',effects:[],playEffect(t,p){this.effects.push({t,...p});return Promise.resolve('complete');}}};
  window.__FAKE_PAD__=pad;navigator.getGamepads=()=>[pad,null,null,null];})();`});
}
console.log('opening',url);
await call('Page.navigate',{url});
let ok=false;
for(let i=0;i<limit*2&&!ok;i++){await new Promise(r=>setTimeout(r,500));try{ok=!!(await js(`(()=>{try{return !!(${wait})}catch{return false}})()`));}catch{}}
if(!ok)console.log('  timed out waiting for',wait);
if(setup){await js(setup);await new Promise(r=>setTimeout(r,+(process.env.AFTER_MS??8000)));}
const shot=await call('Page.captureScreenshot',{format:'png'});
writeFileSync(out,Buffer.from(shot.result.data,'base64'));
let value=null;try{value=await js(`(async()=>{try{return ${result}}catch(e){return String(e)}})()`);}catch(e){value=String(e);}
const errors=log.filter(l=>l.type==='error'||l.type==='exception');
writeFileSync(out.replace(/\.png$/,'.json'),JSON.stringify({url:url.replace(/^https?:\/\/[^/]+/,'<local>'),waited:ok,result:value,console:{messages:log.length,errors:errors.length,list:errors}},null,1)+'\n');
console.log(`${out}: waited=${ok}, ${log.length} console messages, ${errors.length} errors`);
for(const e of errors.slice(0,8))console.log('  ',e.type,e.text.slice(0,300));
ws.close();chrome.kill();try{rmSync(dir,{recursive:true,force:true});}catch{}
process.exit(0);
