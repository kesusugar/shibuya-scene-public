import {loadSceneData} from '../data/normalize.mjs';
import {buildBuildingsAsync as buildBuildings} from './render.mjs';
/** Local S3 adapter: stale loads cannot resurrect a disabled/disposed module. */
export function buildingLifecycle({parent,onReport=()=>{},onReady=()=>{},onError=()=>{},onLoadStart=()=>{},onLoadEnd=()=>{},onBuildStart=()=>null,onBuildEnd=()=>{},onAdded=()=>{},queueMeta=()=>({}),load=loadSceneData,build=buildBuildings,schedule=run=>run()}){
 let generation=0,current=null,abort=null;
 return {build(){const token=++generation;abort=new AbortController();onReport({status:'building'});const loadToken=onLoadStart(token);load(undefined,{signal:abort.signal}).then(data=>{onLoadEnd(loadToken,true);return schedule(async()=>{if(token!==generation)return;const stage=onBuildStart(token);try{const result=await build(data,stage);if(token!==generation){result?.dispose();onBuildEnd(stage,null,false,'stale');return;}current=result;parent.add(current.root);onAdded(current,stage);onReport(current.stats);onReady(current);onBuildEnd(stage,current,true);}catch(e){onBuildEnd(stage,null,false,e);throw e;}},queueMeta(token));}).catch(e=>{onLoadEnd(loadToken,false,e);if(token===generation){onReport({error:String(e)});onError(e);}});},dispose(){generation++;abort?.abort();current?.dispose();current=null;onReport(null);},get current(){return current;}};
}
