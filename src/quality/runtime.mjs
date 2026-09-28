import {PROFILES} from '../app/foundation.mjs';
export function renderRatio(tier,deviceDpr=1){const p=PROFILES[tier];if(!p)throw Error('Invalid quality tier');return Math.min(Number.isFinite(deviceDpr)&&deviceDpr>0?deviceDpr:1,p.dpr)*p.scale;}
// Skip complete scene ticks, preserving elapsed time for the existing simulations.
export class FrameGate{
 constructor(tier='medium'){this.tier=tier;this.last=null;}
 setTier(tier){if(!PROFILES[tier])throw Error('Invalid quality tier');this.tier=tier;this.last=null;}
 step(now){if(this.last===null){this.last=now;return 0;}const elapsed=now-this.last;if(elapsed+0.01<1000/PROFILES[this.tier].fps)return null;this.last=now;return Math.min(.1,Math.max(0,elapsed/1000));}
}
// Yield between expensive module builds; never drain all loaded modules in one microtask turn.
export function afterPaint(run,_meta=undefined){
 // Background tabs can suspend rAF entirely. Resume once, with a bounded fallback.
 let completed=false,frame;const resume=()=>{if(completed)return;completed=true;clearTimeout(timer);if(frame!==undefined)globalThis.cancelAnimationFrame?.(frame);run();};
 const timer=setTimeout(resume,100);
 if(typeof requestAnimationFrame==='function')frame=requestAnimationFrame(()=>setTimeout(resume,0));else setTimeout(resume,0);
}
// CPU construction needs an event-loop yield, not a completed GPU frame.
// Waiting for rAF here couples every 8 ms compute slice to expensive HIGH rendering.
export const yieldFrame=()=>new Promise(resolve=>{
 // Timer nesting/background throttling can turn hundreds of slices into minutes.
 // A posted message remains a real task boundary without waiting for a GPU frame.
 if(typeof MessageChannel==='undefined'){setTimeout(resolve,0);return;}
 const channel=new MessageChannel();
 channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve(undefined);};
 channel.port2.postMessage(null);
});
export function finishSteps(steps){let item;do{item=steps.next();}while(!item.done);return item.value;}
export async function finishStepsAsync(steps,pause=yieldFrame,timing=null){
 let sliceStart=performance.now();try{while(true){const start=performance.now(),item=steps.next();if(timing)timing.computeMs=(timing.computeMs??0)+performance.now()-start;if(item.done)return item.value;
 // Coalesce cheap chunks into an 8 ms slice; injected schedulers retain exact-yield semantics.
 if(pause!==yieldFrame||performance.now()-sliceStart>=8){const waitStart=performance.now();await pause();if(timing){timing.cooperativeWaitMs=(timing.cooperativeWaitMs??0)+performance.now()-waitStart;timing.yieldCount=(timing.yieldCount??0)+1;}sliceStart=performance.now();}
 }}finally{steps.return?.();}
}
export function createBuildQueue(schedule=afterPaint,observe=/** @type {((event: any)=>void)|null} */ (null)){
 const jobs=[];let running=false,closed=false,active=null,sequence=0;
 const snapshot=()=>({queueLength:jobs.length,activeBuildName:active?.meta?.name??null,nextBuildName:jobs[0]?.meta?.name??null});
 const emit=(type,job=null,extra={})=>observe?.({type,atMs:performance.now(),jobId:job?.id??null,meta:job?.meta??null,...snapshot(),...extra});
 function next(){if(running||!jobs.length||closed)return;running=true;const scheduled=jobs[0];emit('scheduler-wait-start',scheduled);schedule(async()=>{const job=jobs.shift();if(!job){running=false;return;}active=job;emit('job-start',job);try{job.resolve(closed?undefined:await job.run());emit('job-end',job,{completedSuccessfully:true});}catch(e){emit('job-end',job,{completedSuccessfully:false,error:String(e)});job.reject(e);}finally{active=null;running=false;emit('queue-boundary',job);next();}},scheduled?.meta);}
 return {enqueue(run,meta={}){if(closed)return Promise.resolve();return new Promise((resolve,reject)=>{const job={id:++sequence,run,resolve,reject,meta};jobs.push(job);emit('enqueue',job);next();});},snapshot,dispose(){closed=true;for(const job of jobs.splice(0))job.resolve();emit('dispose');}};
}
export function deferredLatest(apply,schedule=f=>setTimeout(f,150),cancel=clearTimeout){let handle=null,closed=false;return {set(value){if(closed)return;if(handle!==null)cancel(handle);handle=schedule(()=>{handle=null;if(!closed)apply(value);});},dispose(){closed=true;if(handle!==null)cancel(handle);}};}
