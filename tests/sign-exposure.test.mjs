import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Group,Mesh,PlaneGeometry,MeshStandardMaterial} from 'three';
import {DayNightSystem} from '../src/environment/day-night.mjs';
import {TimeState} from '../src/app/foundation.mjs';

test('night signage separates printed faces, screens and accent sources and restores day values',()=>{
 const scene=new Scene(),time=new TimeState(),env=new DayNightSystem(scene,null,time),root=new Group();
 const levels={'signs-print':1.15,'signs-led':1.8,'signs-heroScreen':1.6,'center-gai-advertisements':1.2,'center-gai-rim':7,'sign-accent-bulbs':18};
 const meshes=Object.keys(levels).map(name=>{const mesh=new Mesh(new PlaneGeometry(),new MeshStandardMaterial({emissiveIntensity:.18}));mesh.name=name;root.add(mesh);return mesh;});
 scene.add(root);env.enable();env.register(root);
 for(let cycle=0;cycle<2;cycle++){
  time.set('night');env.setNightglow(1);
  for(const mesh of meshes)assert.equal(mesh.material.emissiveIntensity,levels[mesh.name]);
  time.set('day');for(const mesh of meshes)assert.equal(mesh.material.emissiveIntensity,.18);
 }
 time.set('night');env.unregister(root);
 for(const mesh of meshes){assert.equal(mesh.material.emissiveIntensity,.18);mesh.geometry.dispose();mesh.material.dispose();}
 env.dispose();
});
