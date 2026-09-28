import test from 'node:test';import assert from 'node:assert/strict';
import {Scene,PerspectiveCamera} from 'three';
import {TimeState} from '../src/app/foundation.mjs';import {DayNightSystem} from '../src/environment/day-night.mjs';import {RenderFidelity} from '../src/fidelity/look.mjs';import {SolarCycle,solarSample,SOLAR_PHASES} from '../src/environment/solar.mjs';
test('four solar presets interpolate and stop, interrupted transitions remain continuous, QA snaps',()=>{
 const s=new Scene(),t=new TimeState('night'),e=new DayNightSystem(s,null,t),f=new RenderFidelity(s,null,new PerspectiveCamera(),t,e,{tier:'high'});e.enable();const c=new SolarCycle(s,e,f,t);
 c.select('day');c.update(2);const mid=c.state.angle;c.select('dawn');assert.equal(c.state.angle,mid);c.update(5);assert.equal(c.transition,null);const east=e.key.position.x;
 c.select('dusk',false);assert.ok(e.key.position.x*east<0);assert.equal(c.transition,null);assert.equal(t.value,'night');
 c.select('day',false);assert.equal(t.value,'day');assert.equal(c.state.night,0);assert.ok(e.key.position.y>100);
 c.select('night',false);assert.equal(c.material.uniforms.sunVisible.value,0);assert.ok(e.key.position.y>0);
 assert.throws(()=>c.select('invalid'));c.dispose();assert.equal(s.getObjectByName('solar-sky'),undefined);f.dispose();e.dispose();
});
test('solar interpolation is clamped and finite',()=>{for(const t of [-1,0,.5,1,2]){const v=solarSample('dawn','day',t);assert.ok(Number.isFinite(v.angle));assert.ok(v.night>=0&&v.night<=1);}});

test('solar runtime owns final daylight exposure and preserves settled night lighting',()=>{
 const scene=new Scene(),renderer={toneMappingExposure:1,shadowMap:{enabled:false,type:null}},time=new TimeState('night');
 const env=new DayNightSystem(scene,renderer,time),look=new RenderFidelity(scene,renderer,new PerspectiveCamera(),time,env,{tier:'high'});
 env.enable();const solar=new SolarCycle(scene,env,look,time);
 solar.select('day',false);for(let i=0;i<60;i++)solar.update(1/60);
 assert.equal(renderer.toneMappingExposure,.74);assert.equal(env.key.intensity,1.65);assert.equal(env.fill.intensity,.30);
 assert.ok(env.fill.color.r>env.fill.color.b,'day fill should not cast a blue wash');
 const dayFill=env.fill.color.clone();solar.select('night',false);solar.update(0);
 assert.equal(renderer.toneMappingExposure,.86);assert.equal(env.key.intensity,.08);assert.equal(env.fill.intensity,.22);
 assert.equal(SOLAR_PHASES.night.sky,0x03060c);
 solar.select('day',false);assert.ok(env.fill.color.equals(dayFill));
 solar.dispose();look.dispose();env.dispose();
});
