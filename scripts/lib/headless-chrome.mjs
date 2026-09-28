// A headless Chrome page for asset conversion scripts (RUN 12.1 / 12.3).
//
// The converters use the browser's own decoders and encoders (Web Audio, canvas) so the
// shipped assets are made by the same code that will read them. Chrome is found through
// CHROME_PATH, then the usual install locations.
import {spawn} from 'node:child_process';
import {existsSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';

export function findChrome(){
 const list=[process.env.CHROME_PATH,
  ...(existsSync('/opt/pw-browsers')?readdirSync('/opt/pw-browsers').filter(d=>d.startsWith('chromium-')).map(d=>`/opt/pw-browsers/${d}/chrome-linux/chrome`):[]),
  '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'];
 const found=list.find(p=>p&&existsSync(p));
 if(!found)throw new Error('No Chrome found; set CHROME_PATH');
 return found;
}

/** Open about:blank in a private headless Chrome. `evaluate` returns the value of an expression. */
export async function openPage(){
 const dir=join(process.env.TMPDIR??'/tmp',`shibuya-convert-${process.pid}-${Date.now()}`);
 const chrome=spawn(findChrome(),['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${dir}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
 const endpoint=await new Promise((resolve,reject)=>{let text='';
  chrome.stderr.on('data',d=>{text+=d;const m=/DevTools listening on (ws:\/\/\S+)/.exec(text);if(m)resolve(m[1]);});
  chrome.on('exit',()=>reject(new Error('Chrome exited: '+text.slice(-400))));});
 const port=new URL(endpoint).port;
 const page=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let n=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
 const call=(method,params)=>new Promise(r=>{const id=++n;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const m=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(m.result?.exceptionDetails)throw new Error(m.result.exceptionDetails.exception?.description??'evaluate failed');return m.result.result.value;};
 return {evaluate,close(){try{ws.close();}catch{}chrome.kill();try{rmSync(dir,{recursive:true,force:true});}catch{}}};
}
