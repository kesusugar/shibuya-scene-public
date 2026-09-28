import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SpatialIndex} from '../src/geo/core.mjs';
import {packContext,restoreContext} from '../src/quality/static-context.mjs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {buildSignModel} from '../src/signs/model.mjs';
import {buildStreetscapeModel,auditStreetscape} from '../src/streetscape/model.mjs';
test('spatial index serialization preserves item order and query results',()=>{
 const index=new SpatialIndex(8);
 for(let i=0;i<50;i++)index.insert(i,{minX:i-1,maxX:i+4,minZ:-3,maxZ:3},{id:i});
 const context=restoreContext(JSON.parse(JSON.stringify(packContext({solids:index}))),{},{});
 for(let x=0;x<55;x++)assert.deepEqual(context.solids.query({minX:x,maxX:x+2,minZ:0,maxZ:1}),index.query({minX:x,maxX:x+2,minZ:0,maxZ:1}));
});
test('HIGH prebuilt signs and streets preserve live placements and valid collision context',()=>{
 const pack=JSON.parse(readFileSync('public/data/shibuya-static-models.json','utf8'));
 const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json','utf8'));
 const ground=restoreGroundModel(pack.ground),generic=pack.generic,core=pack.station;
 const signs=buildSignModel(data,{tier:'high',referenceMatch:true,ground,generic,core});
 assert.deepEqual(pack.signs.high.signs,signs.signs);
 const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core,signs});
 // JSON represents signed zero as zero; compare the serialized geometry contract.
 for(const key of ['fixtures','cables','anchors','rejected'])assert.deepEqual(pack.street.high[key],JSON.parse(JSON.stringify(street[key])),key);
 const restored={...pack.street.high,context:restoreContext(pack.street.high.context,ground,generic)};
 assert.equal(auditStreetscape(restored).major,0);
 assert.deepEqual([...restored.context.solids.items.values()],JSON.parse(JSON.stringify([...street.context.solids.items.values()])));
});
