import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeOSM,validateData,summarize} from '../../src/data/normalize.mjs';
const [input,output='public/data/shibuya-scene-data.json']=process.argv.slice(2);
if(!input)throw Error('Usage: node scripts/data/normalize.mjs RAW_JSON [OUTPUT]');
const text=await readFile(input,'utf8');const result=validateData(normalizeOSM(JSON.parse(text),{retrievedAt:'2026-09-08',endpoint:'https://www.openstreetmap.org/api/0.6/map?bbox=139.6965,35.6564,139.7046,35.6626',inputSha256:createHash('sha256').update(text).digest('hex')}));
await writeFile(output,JSON.stringify(result));await writeFile('evidence/s1/data-report.json',JSON.stringify(summarize(result),null,2));console.log(JSON.stringify(summarize(result),null,2));
