import {Group} from 'three';
// Keep baked vehicle data outside the observer's initial dependency graph.
// Until ready, the ordinary traffic renderer keeps ownership of the visible slot.
export function createDeferredVehicleVisual(load=()=>import('./vehicle-visual.mjs')){
 const root=new Group();root.name='deferred-player-vehicle';
 let visual=null,pending=null,latest=null,disposed=false,failedAt=-Infinity,error=null;
 const metrics={requests:0,loadMs:0,constructMs:0};
 // The systems that ramp emissives at dusk and record shadow casting walk a root once, when
 // they are handed it. This root is empty until the pack lands, so whoever registers it needs
 // telling when there is finally something inside to walk.
 const listeners=new Set();
 function request(){
  if(pending||visual||disposed||performance.now()-failedAt<5000)return;
  const started=performance.now();metrics.requests++;
  pending=Promise.resolve().then(load).then(module=>{
   metrics.loadMs=performance.now()-started;
   if(disposed)return;
   // Hidden/scooter state does not allocate a model when a stale request finishes.
   if(!latest?.active||latest.type==='scooter')return;
   const t=performance.now();
   visual=module.createVehicleVisual({onAssetReady:node=>{for(const listener of listeners)listener(node,visual);}});
   root.add(visual.root);
   visual.update(latest,0);metrics.constructMs=performance.now()-t;error=null;
  }).catch(e=>{error=String(e);failedAt=performance.now();visual?.dispose();visual=null;})
   .finally(()=>{pending=null;});
 }
 return {root,
  /**
   * Called with each built vehicle's own root, whenever one is built.
   *
   * Not once: a vehicle that changes type builds a new graph, and whoever registered the old
   * one for lighting and shadows has to be told about the new one.
   */
  onReady(listener){listeners.add(listener);},
  update(state,dt=0){if(disposed)return;latest=state;
   if(visual){visual.update(state,dt);return;}
   if(state?.active&&state.type!=='scooter')request();
  },
  hide(){latest=null;visual?.hide();},
  inspect(){return {...metrics,status:disposed?'disposed':visual?'ready':pending?'loading':error?'failed':'idle',error};},
  whenSettled(){return pending??Promise.resolve();},
  dispose(){if(disposed)return;disposed=true;listeners.clear();latest=null;visual?.dispose();visual=null;root.removeFromParent();root.clear();}
 };
}
