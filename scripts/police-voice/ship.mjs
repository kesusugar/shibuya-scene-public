// Roadmap ①: the chosen voices into the game -- public/audio/police/*.mp3 and its manifest.
//
//   node scripts/police-voice/ship.mjs megaphone=<dir> shout=<dir> radio=<dir>
//
// Each <dir> is a generate.py output (dry WAVs and voice.json); a line is taken from the voice chosen
// for its `use`. The owner's choice (2026-09-27): megaphone and radio Kokoro jm_kumo, shouts
// Style-Bert-VITS2 JVNV M1 (Angry). The loudspeaker and radio processing happens in the game, so
// what ships is the dry voice.
import {readFileSync,writeFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {readWav,encodeMp3} from './convert.mjs';

const OUT='public/audio/police';
const pick=Object.fromEntries(process.argv.slice(2).map(a=>a.split('=')));
for(const use of ['megaphone','shout','radio'])if(!pick[use])throw new Error(`no voice for ${use}`);
const {lines}=JSON.parse(readFileSync('assets/police-voice/lines.json','utf8'));
if(existsSync(OUT))rmSync(OUT,{recursive:true});
mkdirSync(OUT,{recursive:true});
const voices={},clips=[];
for(const line of lines){
 const dir=pick[line.use],meta=JSON.parse(readFileSync(join(dir,'voice.json'),'utf8'));
 voices[line.use]={engine:meta.engine,model:meta.model,voice:meta.voice??null,style:meta.style??null,licence:meta.licence,page:meta.page,credit:meta.credit??null};
 const {samples,rate}=readWav(readFileSync(join(dir,line.id+'.wav')));
 const mp3=encodeMp3(samples,rate,96);
 writeFileSync(join(OUT,line.id+'.mp3'),mp3);
 clips.push({id:line.id,situation:line.situation,use:line.use,text:line.text,file:line.id+'.mp3',duration:+(samples.length/rate).toFixed(3),bytes:mp3.length});
 console.log(line.id,line.use,`${(samples.length/rate).toFixed(2)}s`,`${(mp3.length/1024).toFixed(1)} KB`);
}
writeFileSync(join(OUT,'manifest.json'),JSON.stringify({version:1,generator:'scripts/police-voice/ship.mjs',voices,clips},null,1)+'\n');
console.log(`${clips.length} clips, ${(clips.reduce((a,c)=>a+c.bytes,0)/1024).toFixed(0)} KB`);
