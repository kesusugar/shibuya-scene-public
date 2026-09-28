import test from 'node:test';
import assert from 'node:assert/strict';
import {REAL_BRANDS,paintRealBrand} from '../src/signs/real-brands.mjs';
import {centerGaiLayout,CENTER_ADS} from '../src/signs/center-gai.mjs';
test('reference brands have distinctive text and reuse atlas capacity',()=>{
 for(const ad of REAL_BRANDS){const texts=[],c=new Proxy({fillText:t=>texts.push(t)},{get:(o,k)=>o[k]??(()=>{})});assert.equal(paintRealBrand(c,ad[4]),true);assert.ok(texts.includes(ad[0]));assert.ok(texts.includes(ad[1]));}
 assert.equal(paintRealBrand({},'unrecognised'),false);
 assert.equal(Math.ceil(CENTER_ADS.length/4),8);
 const signs=centerGaiLayout().filter(s=>s.referencePlacement);
 assert.equal(signs.length,2);assert.deepEqual(signs.map(s=>s.variant).sort(),[29,30]);
 for(const s of signs){assert.equal(s.kind,'roof');assert.ok(s.position.every(Number.isFinite));assert.ok(s.position[1]-s.height/2>24);}
});
