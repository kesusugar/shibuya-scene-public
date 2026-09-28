import expectedKey from 'virtual:shibuya-static-key';
import {restoreGroundModel} from '../ground/model.mjs';
import {restoreContext} from './static-context.mjs';
import {restoreTrafficGraph} from '../traffic/graph.mjs';
import {restorePedestrianNetwork} from '../life/network.mjs';
let pending;
export function loadStaticModels(){
 if(typeof location!=='undefined'&&new URLSearchParams(location.search).get('prebuilt')==='0')return Promise.resolve(null);
 return pending??=fetch('data/shibuya-static-models.json?v='+expectedKey).then(async response=>{
  if(!response.ok)throw Error('HTTP '+response.status);
  const pack=await response.json();
  if(pack.schema!==1||pack.key!==expectedKey)throw Error('stale static models');
  pack.ground=restoreGroundModel(pack.ground);
  for(const models of [pack.signs,pack.street])for(const model of Object.values(models??{}))model.context=restoreContext(model.context,pack.ground,pack.generic);
  for(const model of Object.values(pack.traffic??{}))Object.assign(model,restoreTrafficGraph(model));
  for(const [tier,model] of Object.entries(pack.life??{}))pack.life[tier]=restorePedestrianNetwork(model,pack.ground);
  console.info('[Static models] loaded',pack.key,pack.timings);
  return pack;
 }).catch(error=>{console.warn('[Static models] runtime fallback',String(error));return null;});
}
