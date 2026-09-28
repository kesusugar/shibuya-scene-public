import {readFileSync,writeFileSync} from 'node:fs';
import {buildGround} from '../src/ground/render.mjs';
const ground=buildGround(JSON.parse(readFileSync('public/data/shibuya-scene-data.json')));
writeFileSync('evidence/s2/geometry.json',JSON.stringify(ground.stats,null,2));
writeFileSync('/tmp/s2-model.json',JSON.stringify(ground.model));
console.log(JSON.stringify(ground.stats,null,2));ground.dispose();
