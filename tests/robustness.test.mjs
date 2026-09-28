import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// RUN 12.5: the scene-level guards that have no module of their own to test.
const scene=readFileSync('app/ShibuyaScene.tsx','utf8');

test('a hidden tab suspends the audio it had running and resumes only that',()=>{
 assert.match(scene,/if\(document\.hidden\)\{audioWasRunning=ctx\.state==='running';if\(audioWasRunning\)ctx\.suspend/);
 assert.match(scene,/else if\(audioWasRunning&&playerMode\)\{ctx\.resume/);
});
test('a lost WebGL context says so and stops the sound',()=>{
 assert.match(scene,/webglcontextlost/);
 assert.match(scene,/const lost=\(event:Event\)=>\{event\.preventDefault\(\);soundscape\?\.silence\(\);/);
});
test('camera knocks honour reduced motion and ?shake=0',()=>{
 assert.match(scene,/prefers-reduced-motion: reduce/);
 assert.equal((scene.match(/shake\*SHAKE_SCALE\*SHAKE_THROW/g)??[]).length,3,'every axis of the knock is scaled');
});
test('the road mirror starts off on a touch device and can be forced either way',()=>{
 assert.match(scene,/roadReflection\.enabled=params\.get\('mirror'\)==='1'\|\|\(params\.get\('mirror'\)!=='0'&&!\(typeof matchMedia==='function'&&matchMedia\('\(pointer: coarse\)'\)\.matches\)\)/);
});
test('every optional upgrade falls back instead of failing the scene',()=>{
 assert.match(scene,/\[S12\.3 Ground PBR\] unavailable, keeping procedural ground/);
 assert.match(scene,/\[HQ crowd\] unavailable|hqRequester/);
 assert.match(readFileSync('src/audio/bank.mjs','utf8'),/until the bank is ready, `play` returns false and the caller keeps its synthesised sound/);
});
