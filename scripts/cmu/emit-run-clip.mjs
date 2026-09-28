// PHASE A1 -- write the hybrid Run as a committed derived clip.
//
// This is the only CMU-derived artefact that enters the repository, and it is deliberately the
// smallest thing that works: one gait cycle of quaternions on the game's own 65-bone skeleton,
// with the provenance beside it. No BVH, no motion-capture dataset, no third-party asset pack
// -- the project's rule has always been to pre-convert exactly what Shibuya needs, and this is
// that. `scripts/convert-character.mjs` folds it into citizen.glb as an ordinary clip named
// Run, so the runtime gains nothing to understand.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildHybrid} from './hybrid.mjs';

const OUT='assets/character/hybrid-run.json';
// Quaternion components to four decimals is about 0.006 degrees of error -- three orders of
// magnitude below anything visible -- and it takes the file from 46 KiB to a fraction of that.
const round=(v,d=4)=>Number(v.toFixed(d));

const cmuPath=process.argv[2]??'qa/gta-upgrade/cmu-clips/16_45.json';
const clip=await buildHybrid({cmuPath,glbPath:'public/data/character/citizen.glb',
 reportPath:'public/data/character/citizen.json',variant:'E'});

const cmu=JSON.parse(readFileSync(cmuPath,'utf8'));
const out={
 name:'Run',
 provenance:{
  lowerBody:{
   source:'CMU Graphics Lab Motion Capture Database, trial 16_45',
   conversion:'Motionbuilder-friendly BVH conversion by Bruce Hahne (cgspeed), 2010 v1.1',
   frames:`${cmu.source.from}..${cmu.source.to} of the trial, one gait cycle`,
   licence:'CMU places no restrictions; free for use in research and commercial projects '+
    'worldwide. See docs/CHARACTER-ASSET-PROVENANCE.md.',
   acknowledgment:'The data used in this project was obtained from mocap.cs.cmu.edu. '+
    'The database was created with funding from NSF EIA-0196217.',
   bones:clip.source.cmuBones
  },
  upperBody:{
   source:'Quaternius Universal Animation Library [Standard], Jog_Fwd_Loop, CC0-1.0',
   note:'Sampled at the same normalized gait phase as the lower body.',
   bones:clip.source.quaterniusBones
  },
  boundary:{
   bone:'spine_01',
   correction:'(CMU pelvis)^-1 * (Quaternius pelvis), applied once at bake time so the torso '+
    'lands in the orientation the Quaternius clip puts it in.'
  },
  rootMotion:'Stripped. The clip is in place; the player controller owns world movement. '+
   'The measured stride is carried in `gait` for RUN 4 to drive the period from.'
 },
 // Measured from the root-motion build of the source, not inferred from foot movement.
 gait:{
  duration:round(clip.duration,5),
  stride:round(clip.stride,4),
  speed:round(clip.speed,4),
  leftContactAtPhase:0
 },
 times:clip.times.map(t=>round(t,5)),
 tracks:Object.fromEntries(Object.entries(clip.tracks)
  .map(([b,v])=>[b,v.map(x=>round(x))])),
 rootPos:clip.rootPos.map(v=>round(v,5))
};
mkdirSync('assets/character',{recursive:true});
const text=JSON.stringify(out);
writeFileSync(OUT,text+'\n');
console.log(`${OUT}  ${(text.length/1024).toFixed(1)} KiB  `+
 `${out.times.length} keys, ${Object.keys(out.tracks).length} bones, `+
 `stride ${out.gait.stride} m, native ${out.gait.speed} m/s`);
console.log(`sha256 ${createHash('sha256').update(text).digest('hex').slice(0,16)}`);
