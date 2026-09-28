// Capture qa/gta-upgrade/weaponbench.html in headless Chrome (PLAN-WEAPONS evidence).
//
//   node qa/gta-upgrade/weaponbench-capture.mjs [out.png] [query] [page]
//
// `page` is another bench in qa/gta-upgrade/ that reports the same way (cmu-weaponbench.html).
//
// Serves the repository root on a free local port, opens the bench, waits for it to report
// ready, and writes the screenshot plus every console message and exception to `<out>.json`.
// A software renderer is enough for a still; no frame rate is read from it.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {extname,join,dirname,normalize} from 'node:path';
import {spawn} from 'node:child_process';
import {rmSync} from 'node:fs';
import {findChrome} from '../../scripts/lib/headless-chrome.mjs';

const out=process.argv[2]??'weaponbench.png',query=process.argv[3]??'',bench=process.argv[4]??'weaponbench.html';
const TYPES={'.css':'text/css','.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png'};
const server=createServer(async(req,res)=>{
 const path=normalize(decodeURIComponent(new URL(req.url,'http://x').pathname)).replace(/^([/\\])+/,'');
 try{const body=await readFile(join(process.cwd(),path));res.writeHead(200,{'content-type':TYPES[extname(path)]??'application/octet-stream'});res.end(body);}
 catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/qa/gta-upgrade/${bench}${query?'?'+query:''}`;

const dir=join(process.env.TMPDIR??'/tmp',`weaponbench-${process.pid}`);
const chrome=spawn(findChrome(),['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader',
 '--remote-debugging-port=0',`--user-data-dir=${dir}`,'--window-size=1920,2600','about:blank'],{stdio:['ignore','ignore','pipe']});
const endpoint=await new Promise((resolve,reject)=>{let text='';chrome.stderr.on('data',d=>{text+=d;const m=/DevTools listening on (ws:\/\/\S+)/.exec(text);if(m)resolve(m[1]);});
 chrome.on('exit',()=>reject(new Error('Chrome exited: '+text.slice(-400))));});
const port=new URL(endpoint).port;
const page=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let n=0;const pending=new Map(),log=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);
 if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
 if(m.method==='Runtime.consoleAPICalled')log.push({type:m.params.type,text:m.params.args.map(a=>a.value??a.description).join(' ')});
 if(m.method==='Runtime.exceptionThrown')log.push({type:'exception',text:m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text});});
const call=(method,params={})=>new Promise(r=>{const id=++n;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});
await call('Runtime.enable');await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride',{width:1920,height:2600,deviceScaleFactor:1,mobile:false});
await call('Page.navigate',{url});
let ready=false,report=null;
for(let i=0;i<240&&!ready;i++){
 await new Promise(r=>setTimeout(r,500));
 const m=await call('Runtime.evaluate',{expression:'document.title==="ready"?JSON.stringify(window.__BENCH__):null',returnByValue:true});
 report=m.result?.result?.value;ready=!!report;
}
// Crop to the bench's canvas.
const size=(await call('Runtime.evaluate',{expression:'JSON.stringify(window.__BENCH__?.size??[document.querySelector("canvas")?.width??1280,document.querySelector("canvas")?.height??720])',returnByValue:true})).result.result.value;
const [cw,ch]=JSON.parse(size);
await call('Emulation.setDeviceMetricsOverride',{width:cw,height:ch,deviceScaleFactor:1,mobile:false});
const shot=await call('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:cw,height:ch,scale:1}});
await mkdir(dirname(out)||'.',{recursive:true});
await writeFile(out,Buffer.from(shot.result.data,'base64'));
const errors=log.filter(l=>l.type==='error'||l.type==='exception');
// Stage 6: a bench may hand back files (base64), written next to the screenshot and left out of the log.
const result=report&&JSON.parse(report);
if(result?.files){for(const [name,data] of Object.entries(result.files))await writeFile(join(dirname(out)||'.',name),Buffer.from(data,'base64'));delete result.files;}
await writeFile(out.replace(/\.png$/,'')+'.json',JSON.stringify({url:url.replace(/127\.0\.0\.1:\d+/,'<local>'),ready,bench:result,
 console:log,errors:errors.length},null,1)+'\n');
console.log(`${out}: ready=${ready}, ${log.length} console messages, ${errors.length} errors`);
for(const l of errors)console.log('  ',l.type,l.text.slice(0,300));
ws.close();chrome.kill();server.close();try{rmSync(dir,{recursive:true,force:true});}catch{}
process.exit(ready&&!errors.length?0:1);
