import test from 'node:test';
import assert from 'node:assert/strict';
import {createAsphaltMaterial} from '../src/ground/render.mjs';

test('asphalt reuses its existing deterministic texture for subtle surface relief',()=>{
 const a=createAsphaltMaterial(),b=createAsphaltMaterial();
 assert.equal(a.map,a.bumpMap);
 assert.ok(a.bumpScale>0&&a.bumpScale<.05);
 assert.equal(a.roughness,.96);
 assert.equal(a.metalness,0);
 assert.deepEqual(a.map.image.data,b.map.image.data);
 for(const m of [a,b]){m.map.dispose();m.dispose();}
});
