// One place every hit, throw, scream and swing is announced, so audio and the camera can listen
// without the systems that produce them knowing either exists. RUN 11.3.
//
// Bounded by construction. A car through the scramble produces over a hundred contacts a
// second; each KIND has a cooldown, each frame has a cap, and coincident events of one kind
// merge into one with the loudest intensity -- a crowd going over the bonnet is one thud with
// weight, not a hundred clicks. Pure: no audio, no DOM, no clock of its own.

export const FEEDBACK=Object.freeze({
 kinds:Object.freeze({
  punch_swing:{cooldown:.12,cap:1},
  punch_hit:{cooldown:.08,cap:1},
  pain_voice:{cooldown:.35,cap:1},
  vehicle_impact:{cooldown:.09,cap:1},
  vehicle_runover:{cooldown:.25,cap:1},
  pedestrian_scream:{cooldown:.3,cap:2},
  crowd_gasp:{cooldown:1.2,cap:1},
  panic_voice:{cooldown:.5,cap:1},
  player_bump:{cooldown:.25,cap:1}    // the player walking or running into someone
 }),
 perFrame:6        // across every kind, per drain
});

export function createFeedbackBus(){
 const queue=[],last=new Map();
 const stats={emitted:0,merged:0,throttled:0,delivered:0,frames:0,maxPerFrame:0};
 const listeners=new Set();
 return {
  stats,
  /** Announce something. `time` is the game clock. Returns false if it was throttled. */
  emit(kind,time,{x=0,z=0,intensity=1,id=null}={}){
   const spec=FEEDBACK.kinds[kind];if(!spec)return false;
   stats.emitted++;
   // Same kind already queued this frame: keep one, at the strongest intensity.
   const same=queue.filter(e=>e.kind===kind);
   if(same.length>=spec.cap){const e=same.reduce((a,b)=>a.intensity>=b.intensity?a:b);
    if(intensity>e.intensity)Object.assign(e,{x,z,intensity,id});e.count++;stats.merged++;return true;}
   if(time-(last.get(kind)??-Infinity)<spec.cooldown){stats.throttled++;return false;}
   last.set(kind,time);
   queue.push({kind,time,x,z,intensity:Math.max(0,Math.min(1,intensity)),id,count:1});
   return true;
  },
  on(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  /** Deliver this frame's events, at most FEEDBACK.perFrame, loudest first. */
  drain(){
   stats.frames++;
   if(!queue.length)return 0;
   queue.sort((a,b)=>b.intensity-a.intensity);
   const out=queue.splice(0,FEEDBACK.perFrame);
   stats.throttled+=queue.length;queue.length=0;
   stats.maxPerFrame=Math.max(stats.maxPerFrame,out.length);
   for(const e of out)for(const fn of listeners){try{fn(e);}catch{}}
   stats.delivered+=out.length;
   return out.length;
  },
  get pending(){return queue.length;}
 };
}
