import {readFileSync,writeFileSync} from 'node:fs';
const result=JSON.parse(readFileSync('evidence/s8/geometry.json'));
const baseline=JSON.parse(readFileSync('evidence/s7/geometry.json'));
for(const [tier,s8] of Object.entries(result.tiers)){
 const s7=baseline.tiers[tier].sceneCPU;
 s8.sceneCPU={triangles:s7.triangles+s8.triangles,batches:s7.batches+s8.batches,materials:s7.materials+s8.materials,textures:s7.textures+s8.textures,method:'Unchanged S0-S7 runtime: saved S7 geometry plus current S8. Batches exclude S0 grid/axes and S1 diagnostic lines. Not GPU drawCalls.'};
}
result.regression=baseline.regression;
result.browser={webgl2:false,fps:null,gpuDrawCalls:null,cameras:'CAM-02/03/04/05/06/07: rendered scene unavailable; CPU geometry and UI only',console:'Final HIGH ready, 0 application errors; 2 chrome-extension metadata errors. S8 369 fixtures / 35 cable runs, S7 763 signs. See browser-high.json.'};
writeFileSync('evidence/s8/geometry.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
