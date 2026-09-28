import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {staticModelKey} from '../build/static-model-key.mjs';
import {buildGroundModel,restoreGroundModel} from '../src/ground/model.mjs';
const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json','utf8'));
test('baked model signature matches current sources, data and dependencies',()=>{
 assert.equal(pack.schema,1);assert.equal(pack.key,staticModelKey(process.cwd()).key);
 assert.ok(pack.generic.buildings.length>300);assert.ok(pack.station.masses.length>0);
 for(const tier of ['high','medium','low'])assert.equal(pack.detail[tier].tier,tier);
});
test('baked ground preserves geometry and curb ramp heights',()=>{
 const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json','utf8'));
 const live=buildGroundModel(data),restored=restoreGroundModel(pack.ground);
 for(const key of ['roads','sidewalks','flatSidewalk','curbTop','ramps','corridors','crossings','boundaries','stopLines','guides','arrows','tactiles'])assert.deepEqual(restored[key],live[key],key);
 for(let x=-240;x<=240;x+=5)for(let z=-240;z<=240;z+=5)assert.equal(restored.height([x,z]),live.height([x,z]));
});
