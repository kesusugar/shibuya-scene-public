// Bring the humanoid in after the city, or not at all.
//
// The baked figure is part of the bundle and costs nothing to construct, so it is what the
// first frame draws and what a slow or failed network keeps drawing. The converted humanoid
// is roughly half a megabyte over the wire and arrives whenever it arrives; when it does, the
// figures swap asset and carry on from the same state. Nothing upstream waits for it, and the
// startup path never touches it -- prebaked geometry stays the thing that decides how fast
// this scene comes up.
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {humanoidCitizen} from './character-asset.mjs';

export const CHARACTER_SOURCE=Object.freeze({
 model:'data/character/citizen.glb', report:'data/character/citizen.json', retrySeconds:8
});

export function createDeferredCharacter(source=CHARACTER_SOURCE){
 let asset=null,pending=null,disposed=false,failedAt=-Infinity,error=null;
 const metrics={requests:0,loadMs:0,bytes:0};
 const listeners=new Set();

 function request(){
  if(pending||asset||disposed)return;
  if(performance.now()-failedAt<source.retrySeconds*1000)return;
  const started=performance.now();metrics.requests++;
  pending=Promise.all([
   fetch(source.report).then(r=>r.ok?r.json():Promise.reject(new Error(`report HTTP ${r.status}`))),
   fetch(source.model).then(r=>r.ok?r.arrayBuffer():Promise.reject(new Error(`model HTTP ${r.status}`)))
  ]).then(([report,buffer])=>{
   metrics.bytes=buffer.byteLength;
   return new Promise((resolve,reject)=>new GLTFLoader().parse(buffer,'',gltf=>resolve([report,gltf]),reject));
  }).then(([report,gltf])=>{
   metrics.loadMs=performance.now()-started;
   if(disposed)return;
   asset=humanoidCitizen(gltf,report);
   error=null;
   for(const listener of listeners)listener(asset);
   listeners.clear();
  }).catch(e=>{error=String(e);failedAt=performance.now();})
   .finally(()=>{pending=null;});
 }

 return {
  request,
  get asset(){return asset;},
  /** Called once with the humanoid, whenever it lands. Never called if it never does. */
  onReady(listener){if(asset)listener(asset);else listeners.add(listener);},
  inspect(){return {...metrics,
   status:disposed?'disposed':asset?'ready':pending?'loading':error?'failed':'idle',error};},
  whenSettled(){return pending??Promise.resolve();},
  dispose(){
   if(disposed)return;disposed=true;listeners.clear();
   asset?.dispose();asset=null;
  }
 };
}
