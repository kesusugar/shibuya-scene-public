import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareHero} from '../src/heroes/model.mjs';
import {HERO_DEFINITIONS} from '../src/heroes/config.mjs';
import {createQfrontInterior} from '../src/heroes/qfront-interior.mjs';
import {inPolygon} from '../src/geo/core.mjs';
test('QFRONT interiors add bounded finite rooms without per-room lights',()=>{
 const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
 const hero=prepareHero(data,HERO_DEFINITIONS.find(h=>h.key==='qfront'));
 const view=createQfrontInterior(hero);assert.equal(view.batches,5);assert.ok(view.records.length>100);
 for(const r of view.records){assert.ok(r.position.every(Number.isFinite));assert.ok(inPolygon([r.position[0],r.position[2]],hero.footprint));assert.ok(r.position[1]>8&&r.position[1]<43);}
 view.root.traverse(o=>{assert.ok(!o.isLight);if(o.geometry)assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));});
 assert.ok(view.triangles<30000);view.dispose();assert.equal(view.root.children.length,0);
});
