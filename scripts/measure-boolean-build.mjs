// CPU-only replay of the browser's MEDIUM construction sequence. No GPU/FPS claims.
import {readFileSync,writeFileSync} from 'node:fs';
import pc from 'polygon-clipping';
import {buildGround} from '../src/ground/render.mjs';import {buildBuildingsAsync} from '../src/buildings/render.mjs';import {buildHeroScene} from '../src/heroes/render.mjs';import {buildStationAsync} from '../src/station/render.mjs';import {buildStationDetailsAsync} from '../src/station-detail/render.mjs';import {buildSignageAsync} from '../src/signs/render.mjs';import {buildStreetscapeAsync} from '../src/streetscape/render.mjs';import {buildTraffic} from '../src/traffic/render.mjs';import {buildCrowd} from '../src/life/render.mjs';import {buildTrains} from '../src/trains/render.mjs';import {buildNightglow} from '../src/nightglow/render.mjs';import {buildConstruction} from '../src/construction/render.mjs';import {TimeState} from '../src/app/foundation.mjs';import {yieldFrame} from '../src/quality/runtime.mjs';
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json')),wet=JSON.parse(readFileSync('public/data/shibuya-wet-model.json')).model;
const STATS={stages:{},calls:{},verts:{},ms:{}};let activeStage='setup';const originals=[];
const countVertices=a=>{if(!Array.isArray(a))return 0;if(typeof a[0]==='number')return 1;let n=0;for(const x of a)n+=countVertices(x);return n;};
for(const op of ['union','difference','intersection','xor']){const original=pc[op];if(typeof original!=='function')continue;originals.push([op,original]);pc[op]=function(...args){const begin=performance.now();let vertices=0;for(const a of args)vertices+=countVertices(a);const counted=performance.now();let failed=false;try{return original.apply(this,args);}catch(e){failed=true;throw e;}finally{const finish=performance.now(),bucket=STATS.stages[activeStage]??={};const b=bucket[op]??={calls:0,failures:0,verticesTotal:0,inputVertices:[],ms:0,countingMs:0,maxMs:0,slowest:null};b.calls++;b.failures+=failed?1:0;b.verticesTotal+=vertices;b.inputVertices.push(vertices);b.ms+=finish-counted;b.countingMs+=counted-begin;STATS.calls[op]=(STATS.calls[op]??0)+1;STATS.verts[op]=(STATS.verts[op]??0)+vertices;STATS.ms[op]=(STATS.ms[op]??0)+(finish-counted);if(finish-counted>b.maxMs){b.maxMs=finish-counted;b.slowest={vertices,stack:new Error().stack};}}};}
globalThis.PC_STATS=STATS;const started=performance.now();
const stages=[],resources=[];async function stage(id,run){await yieldFrame();activeStage=id;const t=performance.now(),r=await run();stages.push({id,ms:performance.now()-t});resources.push(r);process.stderr.write(id+' complete\n');return r;}
let result;
try{
 const g=await stage('S2',()=>buildGround(data)),b=await stage('S3',()=>buildBuildingsAsync(data)),h=await stage('S4',()=>buildHeroScene(data)),c=await stage('S5',()=>buildStationAsync(data));
 const common={tier:'medium',ground:g.model,generic:b.model,core:c.model};
 const d=await stage('S6',()=>buildStationDetailsAsync(data,{tier:'medium'}));
 const s=await stage('S7',()=>buildSignageAsync(data,{...common,heroes:h.heroes,referenceMatch:true,fidelity:true}));
 const st=await stage('S8',()=>buildStreetscapeAsync(data,common));
 const t=await stage('S9',()=>buildTraffic(data,{...common,street:st.model}));
 const life=await stage('S10',()=>buildCrowd(data,{...common,choreography:true,traffic:t.sim,detail:d.model,street:st.model}));
 await stage('S11',()=>buildTrains(data,{tier:'medium',core:c.model}));
 await stage('S13',()=>buildNightglow(data,{model:wet,ground:g.model,time:new TimeState('day'),environment:{active:true,setNightglow(){}},tier:'medium'}));
 await stage('S15',()=>buildConstruction(data,{...common}));
 const totalMs=performance.now()-started;
 const summarize=values=>{values.sort((a,b)=>a-b);const n=values.length;return {min:n?values[0]:0,max:n?values[n-1]:0,median:n?(values[Math.floor((n-1)/2)]+values[Math.floor(n/2)])/2:0};};
 const operations={};for(const op of ['union','difference','intersection','xor']){const all=[];let failures=0,countingMs=0;for(const stage of Object.values(STATS.stages)){const b=stage[op];if(!b)continue;for(const v of b.inputVertices)all.push(v);failures+=b.failures;countingMs+=b.countingMs;b.verticesPerCall=summarize(b.inputVertices);delete b.inputVertices;}operations[op]={calls:STATS.calls[op]??0,verticesTotal:STATS.verts[op]??0,verticesPerCall:summarize(all),ms:STATS.ms[op]??0,countingMs,failures};}
 const booleanMs=Object.values(operations).reduce((n,o)=>n+o.ms,0);for(const stage of stages){const ops=STATS.stages[stage.id]??{};stage.operations=ops;stage.calls=Object.values(ops).reduce((n,o)=>n+o.calls,0);stage.booleanMs=Object.values(ops).reduce((n,o)=>n+o.ms,0);stage.booleanPercent=100*stage.booleanMs/stage.ms;}
 result={task:'G measurement only',sourceCommit:'5d3d4bc05458539273f0f762ead2153ff39c1149',environment:'Node CPU replay; MEDIUM; no browser/Canvas/GPU/render-loop instrumentation',timing:'Boolean ms excludes input-vertex counting; stage/total wall time includes measurement overhead and cooperative timer waits. No Array/Math prototype instrumentation.',operations,stages,totalMs,booleanMs,booleanPercent:100*booleanMs/totalMs,crowd:life.stats.total,signs:s.stats.signCount};
}finally{for(const [op,f] of originals)pc[op]=f;for(const r of resources.reverse())r?.dispose?.();delete globalThis.PC_STATS;}
writeFileSync(process.argv[2]??'evidence/performance-round2/boolean-stats.json',JSON.stringify(result,null,2)+'\n');console.table(result.stages.map(({id,ms,calls,booleanMs,booleanPercent})=>({id,ms,calls,booleanMs,booleanPercent})));console.table(result.operations);
