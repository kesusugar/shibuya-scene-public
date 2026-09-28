import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareHero} from '../src/heroes/model.mjs';
import {HERO_DEFINITIONS} from '../src/heroes/config.mjs';
import {buildQFront} from '../src/heroes/builders.mjs';
import {refineQfrontGlass} from '../src/heroes/qfront-glass.mjs';
test('QFRONT retains cafe and surveyed footprint with a fine curtain-wall finish',()=>{
 const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
 const h=prepareHero(data,HERO_DEFINITIONS.find(h=>h.key==='qfront'));buildQFront(h);
 const footprint=JSON.stringify(h.footprint),anchors=JSON.stringify(h.anchors);refineQfrontGlass(h);
 assert.equal(JSON.stringify(h.footprint),footprint);assert.equal(JSON.stringify(h.anchors),anchors);
 assert.ok(h.masses.filter(m=>m.bottom>=7.5).every(m=>m.material==='qfrontGlass'));
 assert.ok(h.panels.every(p=>p.position[1]<8));
 assert.ok(h.details.filter(d=>d.role==='curtain-mullion').length>70);
 for(const d of h.details){assert.ok([...d.position,...d.scale].every(Number.isFinite));if(d.role==='curtain-mullion'&&Math.cos(d.heading)>.95){const lo=d.position[1]-d.scale[1]/2,hi=d.position[1]+d.scale[1]/2;assert.ok(hi<17.3||lo>27.8,'front mullions must not cross the monitor');}}
});
