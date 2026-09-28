// Run after npm run build. These are artifact/Node diagnostics, not browser READY/FPS.
import {readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
const manifest=JSON.parse(readFileSync('dist/client/.vite/manifest.json','utf8'));
const root='app/ShibuyaScene.tsx',vehicle='src/player/vehicle-visual.mjs',seen=new Set();
function visit(key){if(seen.has(key))return;seen.add(key);for(const child of manifest[key]?.imports??[])visit(child);}
visit(root);
if(!manifest[root]||!manifest[vehicle]||seen.has(vehicle))throw new Error('Vehicle payload must be a separate deferred entry');
const size=path=>{const b=readFileSync(path);return {bytes:b.length,gzipBytes:gzipSync(b).length};};
const {createPlayerFigure}=await import('../src/player/figure.mjs');
const samples=[];for(let i=0;i<9;i++){const start=performance.now(),figure=createPlayerFigure();samples.push(performance.now()-start);figure.dispose();}samples.sort((a,b)=>a-b);
console.log(JSON.stringify({kind:'artifact-and-node-only',scene:size('dist/client/'+manifest[root].file),deferredVehicles:size('dist/client/'+manifest[vehicle].file),character:size('src/player/generated/character.mjs'),vehicleInInitialStaticGraph:seen.has(vehicle),nodeCharacterConstructMedianMs:Math.round(samples[4]*100)/100,nodeVersion:process.version},null,2));
