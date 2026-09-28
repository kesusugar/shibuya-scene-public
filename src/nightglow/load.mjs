import {loadSceneData} from '../data/normalize.mjs';
// Baked from the unchanged S13 algorithm: no polygon booleans on the UI thread.
export async function loadWetScene(_,options={}){
 const [data,response]=await Promise.all([loadSceneData(undefined,options),fetch('data/shibuya-wet-model.json',{signal:options.signal})]);
 if(!response.ok)throw Error('Wet model load failed: '+response.status);
 const asset=await response.json();if(asset.schema!==1||!Array.isArray(asset.model?.patches)||!Array.isArray(asset.model?.reflections))throw Error('Invalid wet model');
 return {data,model:asset.model};
}
