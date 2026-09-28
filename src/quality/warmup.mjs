/**
 * Shader warm-up that can be cancelled.
 *
 * `WebGLRenderer.compileAsync` compiles a subtree's programs and then polls the materials
 * every 10 ms until `KHR_parallel_shader_compile` says they are ready. The poll holds the
 * material set and has no stop: three.js reads `properties.get(material).currentProgram` on
 * every tick, and `WebGLProperties.get` hands back a fresh empty object once the material has
 * been removed from it. Disposing a material during the wait therefore turns the next tick
 * into `Cannot read properties of undefined (reading 'isReady')`, thrown from a setTimeout
 * where neither the try/catch around the call nor the promise's .catch can see it.
 *
 * That is not a hypothetical ordering. Every build stage warms up the subtree it just added,
 * and a stage that is torn down -- a stale rebuild dropping its result, a tier change, an
 * effect cleanup, the renderer going away -- disposes exactly those materials. Measured
 * against the real scene: tearing down 4 s into the build (shaders still compiling) throws;
 * at 6 s and 8 s, with compilation finished, it does not. It is a race with the warm-up
 * window, which is why it comes and goes.
 *
 * So the warm-up is owned rather than fired and forgotten. A material that is disposed says
 * so -- three.js dispatches a `dispose` event, which is the structural signal that there is
 * nothing left to wait for -- and it leaves the set. Tearing down the owner stops every poll
 * it started. Nothing is caught and nothing is silenced; the poll simply stops asking about
 * things that no longer exist.
 */
export function createShaderWarmup(renderer,{timeoutMs=30000,now=()=>Date.now()}={}){
 let disposed=false;
 const running=new Set();
 return {
  /** Warm `root`'s programs. Returns a stop function; calling it twice is harmless. */
  warm(root,camera){
   if(disposed||!renderer||!root)return()=>{};
   const materials=renderer.compile(root,camera);
   if(!materials||materials.size===0)return()=>{};
   const properties=renderer.properties;
   let timer=null;
   const onDispose=event=>{
    materials.delete(event.target);
    event.target.removeEventListener('dispose',onDispose);
   };
   for(const material of materials)material.addEventListener('dispose',onDispose);
   const stop=()=>{
    if(timer!==null){clearTimeout(timer);timer=null;}
    for(const material of materials)material.removeEventListener('dispose',onDispose);
    materials.clear();
    running.delete(stop);
   };
   const deadline=now()+timeoutMs;
   const tick=()=>{
    timer=null;
    if(disposed)return stop();
    for(const material of [...materials]){
     const program=properties.get(material).currentProgram;
     // `undefined` means this material's properties are gone -- renderer.dispose() resets the
     // whole store, and a material disposed between ticks is removed from it. Either way the
     // program it was waiting for no longer exists, so there is nothing to wait for.
     if(program===undefined||program.isReady())materials.delete(material);
    }
    // Warm-up is an optimisation: the scene renders correctly whether or not it finishes. A
    // driver that never reports ready must not leave a 10 ms timer running for the session.
    if(materials.size===0||now()>=deadline)return stop();
    timer=setTimeout(tick,10);
   };
   running.add(stop);
   tick();
   return stop;
  },
  /** How many warm-ups are still polling. For tests and the QA metrics. */
  get pending(){return running.size;},
  dispose(){
   if(disposed)return;
   disposed=true;
   for(const stop of [...running])stop();
   running.clear();
  }
 };
}
