import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {buildDetailModel} from '../src/station-detail/model.mjs';
import {buildStreetscapeModel} from '../src/streetscape/model.mjs';
import {buildPedestrianNetwork} from '../src/life/network.mjs';
import {buildCrowd} from '../src/life/render.mjs';

// RUN 11.0. Live at HIGH with the HQ crowd up, the legacy renderer still drew 971 props --
// box phones, bags and suitcases, cylinder canes and cone umbrellas sized for its capsules --
// on citizens the HQ crowd was drawing. They tumbled on the legacy arc after a hit. That is
// what read as old blocky bodies mixed into the crowd.
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGroundModel(data),generic=buildBuildingModel(data);
const core=buildStationModel(data,{ground,generic});
const detail=buildDetailModel(data,{tier:'high',ground,generic,core});
const street=buildStreetscapeModel(data,{tier:'high',ground,generic,core});
const network=buildPedestrianNetwork(data,{ground,generic,street,core,detail});
const manifest=JSON.parse(readFileSync('public/data/crowd/hq-crowd.json','utf8'));
const raw=readFileSync('public/data/crowd/hq-crowd.bin');
const bin=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
const PROPS=['phone','bag','cane','suitcase','umbrella'];

test('a citizen the HQ crowd draws carries no legacy prop',()=>{
 const crowd=buildCrowd(data,{ground,generic,street,core,detail,network,tier:'high',nearRigs:false});
 crowd.update(1/60,{x:0,z:0});
 const before=PROPS.reduce((n,k)=>n+crowd.meshes[k].count,0);
 assert.ok(before>100,`the legacy crowd should carry its props (${before})`);
 crowd.enableHQCrowd(manifest,bin,{budget:1978});
 crowd.setHQCamera({x:0,z:0});
 crowd.update(1/60,{x:0,z:0});
 const own=crowd.ownership(),legacy=own.filter(o=>o.owner==='legacy').length;
 const after=PROPS.reduce((n,k)=>n+crowd.meshes[k].count,0);
 assert.equal(legacy,0,'the HQ crowd should draw everyone at this budget');
 assert.equal(after,0,`${after} legacy props drawn on HQ citizens`);
 assert.equal(crowd.meshes.head.count,0,'a legacy head drawn on an HQ citizen');
 // rolling back to the legacy crowd brings the props back with the bodies
 crowd.disableHQCrowd();crowd.update(1/60,{x:0,z:0});
 assert.equal(PROPS.reduce((n,k)=>n+crowd.meshes[k].count,0),before);
 crowd.dispose();
});
