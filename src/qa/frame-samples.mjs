// QA-only, bounded and on demand. Records rendered-frame pacing, not RAF callbacks.
export function createFrameSamples(){
 let remaining=0,previous=null,intervals=[],cpu=[];
 return {
  begin(count=120){if(!Number.isInteger(count)||count<2||count>600)throw new Error('Sample count must be 2..600');remaining=count;previous=null;intervals=[];cpu=[];},
  record(now,cpuMs,visible=true){
   if(!remaining)return;
   if(!visible||!Number.isFinite(now)){previous=null;return;}
   if(previous!==null&&now>previous){intervals.push(now-previous);cpu.push(Math.max(0,Number(cpuMs)||0));remaining--;}
   previous=now;
  },
  snapshot(){
   const sorted=[...intervals].sort((a,b)=>a-b),cost=[...cpu].sort((a,b)=>a-b);
   const percentile=(a,p)=>a.length?a[Math.ceil(a.length*p)-1]:null;
   return {complete:remaining===0&&intervals.length>0,samples:intervals.length,
    fps:intervals.length?1000*intervals.length/intervals.reduce((a,b)=>a+b,0):null,
    frameP50Ms:percentile(sorted,.5),frameP95Ms:percentile(sorted,.95),frameMaxMs:sorted.at(-1)??null,
    cpuP95Ms:percentile(cost,.95),over50Ms:intervals.filter(x=>x>50).length};
  }
 };
}
export function waitForRenderedFrames({count,getFrame,isDisposed,timeoutMs=15000,raf=requestAnimationFrame,cancel=cancelAnimationFrame}){
 return new Promise((resolve,reject)=>{
  const target=getFrame()+count;let id=null;
  const timer=setTimeout(()=>{if(id!==null)cancel(id);reject(new Error('Rendered-frame wait timed out; keep the tab visible and check WebGL'));},timeoutMs);
  function check(){
   if(isDisposed()){clearTimeout(timer);reject(new Error('Scene disposed during QA'));return;}
   if(getFrame()>=target){clearTimeout(timer);resolve();return;}
   id=raf(check);
  }
  check();
 });
}
