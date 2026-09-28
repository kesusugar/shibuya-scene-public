import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPedestrianNetwork,buildPedestrianNetworkAsync} from '../src/life/network.mjs';
import {yieldFrame} from '../src/quality/runtime.mjs';

test('CPU construction yields without waiting for a GPU animation frame',async()=>{
 const previous=globalThis.requestAnimationFrame;
 globalThis.requestAnimationFrame=()=>{throw Error('CPU yield must not require a rendered frame');};
 try{await yieldFrame();}finally{if(previous===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previous;}
});

test('CPU yield does not depend on background-throttled timers',async()=>{
 const previous=globalThis.setTimeout;
 globalThis.setTimeout=()=>{throw Error('CPU yield must not use a throttled timer');};
 try{await yieldFrame();}finally{globalThis.setTimeout=previous;}
});

test('cooperative pedestrian build preserves graph and yields to the event loop',async()=>{
 const data={footways:[]};
 const options={ground:{sidewalks:[[[[-6,-6],[6,-6],[6,6],[-6,6],[-6,-6]]]],roads:[],crossings:[],height:()=>0},generic:{buildings:[]},street:{context:{solids:{items:new Map()}},fixtures:[]},core:{supports:[]}};
 const expected=buildPedestrianNetwork(data,options);
 let ticks=0;const timer=setInterval(()=>ticks++,1),timing={};
 let actual;try{actual=await buildPedestrianNetworkAsync(data,options,timing);}finally{clearInterval(timer);}
 assert.ok(expected.nodes.length>10);
 assert.deepEqual(actual.nodes,expected.nodes);
 assert.deepEqual(actual.edges,expected.edges);
 assert.deepEqual(actual.components,expected.components);
 assert.ok(ticks>0,'browser tasks must be able to run during construction');
 assert.ok(timing.yieldCount>0);
});
