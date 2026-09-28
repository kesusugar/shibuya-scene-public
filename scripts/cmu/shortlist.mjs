// RUN 5.6 STEP 1 -- narrow the CMU shortlist by what the files actually contain.
// Reads only the trials already fetched; does not touch the other ~2600.
import {readFileSync,readdirSync} from 'node:fs';
import {parseBVH,rootTrack} from './bvh.mjs';

const DIR=process.argv[2];
if(!DIR){console.error('usage: node scripts/cmu/shortlist.mjs <dir-of-bvh>');process.exit(1);}

// The cgspeed conversion keeps CMU's original scale. CMU's skeleton is authored in a unit where
// a subject is roughly 1.7/0.45 units tall; the conventional factor to metres is 0.056444
// (1/17.7), which is inches-to-metres via the 2.54 cm inch. Verified below against each
// subject's own hip height rather than assumed: a standing human hip sits near 0.9-1.0 m.
const INCH=0.0254;

const rows=[];
for(const file of readdirSync(DIR).filter(f=>f.endsWith('.bvh')).sort()){
 const bvh=parseBVH(readFileSync(`${DIR}/${file}`,'utf8'));
 const root=rootTrack(bvh);
 const dur=bvh.frames*bvh.frameTime;
 // Total ground travel and the straightest-line displacement, so a trial that turns or
 // doubles back is visible as a large difference between the two.
 let path=0;
 for(let f=1;f<bvh.frames;f++){
  path+=Math.hypot(root[f*3]-root[(f-1)*3],root[f*3+2]-root[(f-1)*3+2]);
 }
 const straight=Math.hypot(root[(bvh.frames-1)*3]-root[0],root[(bvh.frames-1)*3+2]-root[2]);
 // Mean hip height over the trial, as a sanity check on the unit scale.
 let hip=0;for(let f=0;f<bvh.frames;f++)hip+=root[f*3+1];
 hip/=bvh.frames;
 rows.push({
  file:file.replace('.bvh',''),
  frames:bvh.frames,fps:Math.round(1/bvh.frameTime),dur,
  joints:bvh.joints.length,
  pathM:path*INCH,straightM:straight*INCH,
  meanSpeed:path*INCH/dur,
  straightness:straight/Math.max(1e-9,path),
  hipM:hip*INCH
 });
}
rows.sort((a,b)=>b.meanSpeed-a.meanSpeed);
const f=(v,d=2)=>v.toFixed(d);
console.log('CMU shortlist -- what the files actually contain\n');
console.log('trial    frames  fps   dur    joints   path    straight  straightness  mean m/s   hip m');
for(const r of rows)
 console.log(r.file.padEnd(8),String(r.frames).padStart(6),String(r.fps).padStart(4),
  f(r.dur).padStart(6),String(r.joints).padStart(8),
  f(r.pathM).padStart(7),f(r.straightM).padStart(10),
  f(r.straightness,3).padStart(13),f(r.meanSpeed).padStart(10),f(r.hipM).padStart(7));
console.log(`
mean m/s     is over the WHOLE trial including the approach and the stop, so it understates the
             steady running speed. It ranks the trials; it does not measure the gait.
straightness straight-line displacement over path length. 1.0 is a straight run; well under 1.0
             means the trial turns, veers or doubles back and is a poor loop source.
hip m        mean root height. A standing adult hip is around 0.9-1.0 m, so a plausible value
             here is the check that the inch scale is right rather than assumed.`);
