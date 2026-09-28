import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildWetModel} from '../src/nightglow/model.mjs';
const source=readFileSync('public/data/shibuya-scene-data.json'),model=buildWetModel(JSON.parse(source));
writeFileSync('public/data/shibuya-wet-model.json',JSON.stringify({schema:1,sourceHash:createHash('sha256').update(source).digest('hex'),model:{patches:model.patches,reflections:model.reflections}}));
console.log({patches:model.patches.length,reflections:model.reflections.length});
