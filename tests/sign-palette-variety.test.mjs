import test from 'node:test';
import assert from 'node:assert/strict';
import {definitions,paintCity} from '../src/signs/atlas.mjs';
test('each sign category receives four distinct high-tier color palettes',()=>{
 const signs=definitions(32);
 for(const category of new Set(signs.map(s=>s.category))){
  assert.equal(new Set(signs.filter(s=>s.category===category).map(s=>s.palette.join(','))).size,4);
 }
});
test('commercial atlas paints every horizontal brand at a prominent normalized height',()=>{
 const calls=[],ctx=new Proxy({},{get(target,key){return target[key]??=(...args)=>calls.push([key,...args]);}});
 const entries=paintCity(ctx,2048,32);
 assert.equal(entries.length,32);
 assert.equal(calls.filter(c=>c[0]==='save').length,calls.filter(c=>c[0]==='restore').length);
 for(const d of definitions().filter(d=>!['blade','directory'].includes(d.category))){
  assert.ok(calls.some(c=>c[0]==='fillText'&&c[1]===d.text));
 }
 assert.ok(calls.some(c=>c[0]==='scale'&&c[1]===256&&c[2]===512));
});
