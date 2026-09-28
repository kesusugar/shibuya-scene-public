import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restoreGroundModel} from '../src/ground/model.mjs';
import {restoreContext} from '../src/quality/static-context.mjs';
import {centralDetail} from '../src/streetscape/central-detail.mjs';
import {addLightboxes,lightboxIssues} from '../src/streetscape/lightboxes.mjs';
import {fixtureParts} from '../src/streetscape/render.mjs';
import {bounds,SpatialIndex} from '../src/geo/core.mjs';
test('illuminated pavilion stays clear of roads, crossings, paths and existing fixtures',()=>{
 const p=JSON.parse(readFileSync('public/data/shibuya-static-models.json')),s=p.street.high;
 s.context=restoreContext(s.context,restoreGroundModel(p.ground),p.generic);const base=centralDetail(s,p.detail.high),result=addLightboxes(base,p.detail.high),added=result.fixtures.filter(f=>f.category==='lightbox');assert.equal(added.length,3);assert.equal(added.filter(f=>f.entrance).length,2);
 const ctx={...base.context,occupied:new SpatialIndex(8)};for(const f of [...base.fixtures,...p.detail.high.fixtures.filter(f=>f.bottom<6)])ctx.occupied.insert(f.id,bounds(f.polygon.outer),f);
 for(const f of added){assert.deepEqual(lightboxIssues(f,ctx),[]);const {parts}=fixtureParts(f);assert.equal(parts.filter(p=>p.material==='emissive').length,4);for(const p of parts)assert.ok([...p.position,...p.scale].every(Number.isFinite));}
 assert.equal(addLightboxes({...base,tier:'low'},p.detail.high).fixtures.length,base.fixtures.length);
});
