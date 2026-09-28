// CPU-only replay of the browser's MEDIUM construction sequence. No GPU/FPS claims.
import {readFileSync,writeFileSync} from 'node:fs';
import {buildGround} from '../src/ground/render.mjs';import {buildBuildingsAsync} from '../src/buildings/render.mjs';import {buildHeroScene} from '../src/heroes/render.mjs';import {buildStationAsync} from '../src/station/render.mjs';import {buildStationDetailsAsync} from '../src/station-detail/render.mjs';import {buildSignageAsync} from '../src/signs/render.mjs';import {buildStreetscapeAsync} from '../src/streetscape/render.mjs';import {buildTraffic} from '../src/traffic/render.mjs';import {buildCrowd} from '../src/life/render.mjs';import {buildTrains} from '../src/trains/render.mjs';import {buildNightglow} from '../src/nightglow/render.mjs';import {buildConstruction} from '../src/construction/render.mjs';import {TimeState} from '../src/app/foundation.mjs';import {yieldFrame} from '../src/quality/runtime.mjs';
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json')),wet=JSON.parse(readFileSync('public/data/shibuya-wet-model.json')).model;
const originals=[[Array.prototype,'push'],[Array.prototype,'slice'],[Array.prototype,'concat'],[Math,'hypot'],[Math,'sqrt']].map(([o,n])=>[o,n,o[n]]);
const P = { c: {}, s: {}, t0: performance.now(), log: [] };
const wrap = (o, n, k, every) => {
  const f = o[n];
  o[n] = function () {
    P.c[k] = (P.c[k] || 0) + 1;
    if (P.c[k] % every === 0) {
      const st = new Error().stack.split('\n').slice(3, 6).join(' <- ');
      P.s[k + ' ' + st] = (P.s[k + ' ' + st] || 0) + 1;
    }
    return f.apply(this, arguments);
  };
};
wrap(Array.prototype, 'push',  'push',  20000);
wrap(Array.prototype, 'slice', 'slice',  5000);
wrap(Array.prototype, 'concat','concat', 2000);
wrap(Math, 'hypot', 'hypot', 5000);
wrap(Math, 'sqrt',  'sqrt', 50000);
try {new PerformanceObserver(l=>{for(const e of l.getEntries())P.log.push(Math.round(e.duration)+'ms');}).observe({entryTypes:['longtask']});}catch(e){}
globalThis.P=P;
const stages=[],resources=[];async function stage(id,run){await yieldFrame();const t=performance.now(),before=P.c.slice??0,r=await run();stages.push({id,ms:performance.now()-t,slice:(P.c.slice??0)-before});resources.push(r);return r;}
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
 result={environment:'Node CPU replay; no browser/Canvas/GPU/render-loop instrumentation',tier:'medium',counts:{...P.c},stacks:{...P.s},stages,totalMs:performance.now()-P.t0,crowd:life.stats.total,signs:s.stats.signCount,sliceTargetMet:(P.c.slice??0)<100000,longtasks:null};
}finally{for(const [o,n,f] of originals)o[n]=f;for(const r of resources.reverse())r?.dispose?.();delete globalThis.P;}
writeFileSync(process.argv[2]??'evidence/performance-da/counts.json',JSON.stringify(result,null,2)+'\n');console.table(result.stages);console.table(result.counts);
