// Turning the high-fidelity crowd on, once per crowd, and keeping it on.
//
// Found in the browser (claude/crowd-realism). The scene used a single `hqRequested` flag, set
// the first time it asked. The crowd module is rebuilt whenever traffic is toggled (and on any
// other dependency rebuild), and the new crowd came up with no HQ layer at all: the flag was
// already set, so nobody asked again. Measured live after one traffic toggle: HQ off, 442
// legacy capsules and 21 baked near bodies within 25 m of the player, the old-model crowd the
// user reported. The humanoid asset was lost the same way, which is why the near pool fell
// back to its baked figures.
//
// So the request is keyed on the crowd instance, not on the page. The pack is fetched once and
// shared; each new crowd gets its own layer; a crowd disposed while the pack was in flight is
// never enabled (it must not resurrect); and a tier change re-applies the tier's budget.

/** Pedestrians the HQ crowd may draw at each tier when `?hq=` asks for the tier default. */
export const HQ_TIER_BUDGET=Object.freeze({high:1978,medium:512,low:0});

/** What budget `asked` (from `?hq=`) means at `tier`. 0 is off. */
export function hqBudgetFor(asked,tier){
 if(asked===null||asked===undefined||asked===0)return 0;
 const max=HQ_TIER_BUDGET[tier]??0;
 return asked<0?max:Math.min(asked,max);
}

/**
 * @param {{load:()=>Promise<[any,any]>, current:()=>any, options?:(crowd:any)=>object,
 *   onEnabled?:(crowd:any,layer:any,budget:number,pack:[any,any])=>void,
 *   onError?:(error:any)=>void}} deps
 */
export function createHQRequester({load,current,options=()=>({}),onEnabled=()=>{},onError=()=>{}}){
 let pack=null;                     // Promise of [manifest, bin], shared by every crowd
 let failed=false;
 const asked=new WeakSet();         // crowds already asked for (in flight or done)
 const budgets=new WeakMap();       // crowd -> budget it was last given
 return {
  /**
   * Call every frame. Cheap when nothing changed: two WeakMap lookups.
   * Returns true when the crowd has (or is getting) an HQ layer.
   */
  ensure(crowd,{asked:want,tier}){
   if(!crowd?.enableHQCrowd||failed)return false;
   const budget=hqBudgetFor(want,tier);
   if(crowd.hqCrowd){
    // Already on: follow the tier. A tier with no HQ budget turns it back off.
    if(budgets.get(crowd)!==budget){
     budgets.set(crowd,budget);
     if(budget>0)crowd.setHQBudget(budget);
     // Off, and forgotten, so a later tier with a budget asks again from the cached pack.
     else{crowd.disableHQCrowd();asked.delete(crowd);budgets.delete(crowd);}
    }
    return budget>0;
   }
   if(!budget||asked.has(crowd))return asked.has(crowd);
   asked.add(crowd);
   pack??=load();
   pack.then(loaded=>{
    // Built for a crowd that has since been replaced or disposed: leave it alone. The
    // replacement asks for itself on its next frame.
    if(current()!==crowd||crowd.hqCrowd)return;
    const layer=crowd.enableHQCrowd(loaded[0],loaded[1],{budget,...options(crowd)});
    budgets.set(crowd,budget);
    onEnabled(crowd,layer,budget,loaded);
   },error=>{failed=true;onError(error);});
   return true;
  },
  /** The pack could not be loaded; the scene stays on the legacy crowd. */
  get failed(){return failed;}
 };
}
