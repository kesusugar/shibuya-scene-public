// Roadmap ③: a car's smoke as soft camera-facing puffs, not faceted solids.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVehicleEffects,FX} from '../src/player/effects.mjs';

const car=(damage)=>({active:true,x:0,y:0,z:0,heading:0,damage});
const mesh=fx=>fx.root.children[0];
const at=(fx,name,i)=>mesh(fx).geometry.getAttribute(name).array[i];

test('③: a puff is one quad drawn by its own soft shader -- not a faceted solid',()=>{
 const fx=createVehicleEffects(),m=mesh(fx);
 assert.equal(m.geometry.getAttribute('position').count,4,'not a quad');
 assert.equal(m.material.type,'ShaderMaterial');
 assert.match(m.material.fragmentShader,/smoothstep/,'no soft edge');
 assert.equal(m.material.depthWrite,false);
 fx.dispose();
});

test('③: a damaged car smokes -- each puff fades in, grows, turns and thins to nothing',()=>{
 const fx=createVehicleEffects(),s=car(.6);
 fx.update(FX.smokeEvery+.01,s);
 assert.equal(fx.live.smoke,1);
 const track=[];s.active=false;   // no more puffs: follow the first one alone
 for(let t=0;t<3.2;t+=.04){fx.update(.04,s);if(mesh(fx).count)track.push({size:at(fx,'fxSize',0),alpha:at(fx,'fxAlpha',0),rot:at(fx,'fxRot',0)});}
 assert.ok(track.length>25,'the puff did not last');
 for(let i=1;i<track.length;i++)assert.ok(track[i].size>=track[i-1].size-1e-6,'a puff shrank');
 assert.ok(track.at(-1).size>track[0].size*2.5,'a puff did not spread');
 const peak=Math.max(...track.map(p=>p.alpha)),where=track.findIndex(p=>p.alpha===peak);
 assert.ok(peak<=FX.smokeAlpha+1e-6&&peak>.2,`peak opacity ${peak}`);
 assert.ok(where>0&&where<track.length/2,'no fade in, or a late peak');
 assert.ok(track.at(-1).alpha<.05,'it did not thin out');
 assert.notEqual(track[0].rot,track.at(-1).rot,'it did not turn');
 assert.equal(mesh(fx).count,0,'gone at the end of its life');
 fx.dispose();
});

test('③: a crash bursts sparks and puffs; a badly damaged car smokes dark; the pool never grows',()=>{
 const fx=createVehicleEffects(),s=car(.95);
 fx.impact(s);
 assert.deepEqual([fx.live.spark,fx.live.smoke],[FX.crashSparks,FX.crashPuffs]);
 for(let i=0;i<200;i++){fx.update(.05,s);if(i%10===0){fx.impact(s);fx.dust(0,0,0,1);}}
 assert.ok(mesh(fx).count<=FX.pool);
 // The colours in use: dark smoke for a car nearly wrecked.
 const c=mesh(fx).geometry.getAttribute('fxColor').array;let dark=0;
 for(let i=0;i<mesh(fx).count;i++)if(c[i*3]<.1&&c[i*3+1]<.1)dark++;
 assert.ok(dark>0,'no dark smoke from a wrecked car');
 fx.hide();assert.equal(fx.live.smoke+fx.live.spark+fx.live.dust,0);
 fx.dispose();fx.dispose();
});
