import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
globalThis.ProgressEvent??=class{constructor(t,i={}){Object.assign(this,{type:t},i);}};
const UP='assets/character/upstream';
function loadPair(base){
 const json=JSON.parse(readFileSync(base+'.gltf','utf8'));
 const bin=readFileSync(base+'.bin');
 json.buffers=[{byteLength:bin.length,uri:'data:application/octet-stream;base64,'+bin.toString('base64')}];
 delete json.images;delete json.textures;delete json.samplers;
 for(const m of json.materials??[]){delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;
  const p=m.pbrMetallicRoughness;if(p){delete p.baseColorTexture;delete p.metallicRoughnessTexture;}}
 return new Promise((res,rej)=>new GLTFLoader().parse(JSON.stringify(json),'',res,rej));
}
const grab=async rel=>{
 const g=await loadPair(`${UP}/${rel}`);
 g.scene.updateMatrixWorld(true);
 const m=[];g.scene.traverse(o=>{if(o.isSkinnedMesh)m.push(o);});
 return {gltf:g,meshes:m,skeleton:m[0].skeleton,mesh:m[0]};
};
const ref=await grab('ubc/BaseCharacters/Superhero_Male_FullBody');
console.log('reference: Superhero_Male_FullBody');
console.log('  meshes :',ref.meshes.map(m=>`${m.name}(${m.geometry.attributes.position.count}v)`).join(' '));
console.log('  bindMatrix identity:',ref.mesh.bindMatrix.equals(new T.Matrix4()));
for(const rel of ['ubc/BaseCharacters/Superhero_Female_FullBody',
                  'ubc/Hairstyles/Hair_Buzzed','ubc/Hairstyles/Hair_Long','ubc/Hairstyles/Hair_SimpleParted']){
 const g=await grab(rel);
 let maxPos=0,maxQuat=0,maxInv=0;
 for(let i=0;i<ref.skeleton.bones.length;i++){
  const a=ref.skeleton.bones[i],b=g.skeleton.bones[i];
  if(!b||a.name!==b.name){console.log(rel,'BONE MISMATCH at',i);break;}
  maxPos=Math.max(maxPos,a.position.distanceTo(b.position));
  maxQuat=Math.max(maxQuat,Math.abs(a.quaternion.dot(b.quaternion)));
  const ia=ref.skeleton.boneInverses[i].elements,ib=g.skeleton.boneInverses[i].elements;
  for(let k=0;k<16;k++)maxInv=Math.max(maxInv,Math.abs(ia[k]-ib[k]));
 }
 console.log(`${rel.split('/').pop().padEnd(28)} meshes=${g.meshes.length} `
  +`maxRestPosDelta=${maxPos.toExponential(2)} maxBoneInverseDelta=${maxInv.toExponential(2)} `
  +`bindIdentity=${g.mesh.bindMatrix.equals(new T.Matrix4())} `
  +`meshNames=${g.meshes.map(m=>m.name).join('/')}`);
}

console.log('\n--- which bones actually differ ---');
for(const rel of ['ubc/BaseCharacters/Superhero_Female_FullBody','ubc/Hairstyles/Hair_SimpleParted']){
 const g=await grab(rel);
 const diffs=[];
 for(let i=0;i<ref.skeleton.bones.length;i++){
  const a=ref.skeleton.bones[i],b=g.skeleton.bones[i];
  const d=a.position.distanceTo(b.position);
  if(d>1e-4)diffs.push([a.name,d]);
 }
 diffs.sort((x,y)=>y[1]-x[1]);
 console.log(`\n${rel.split('/').pop()}: ${diffs.length}/${ref.skeleton.bones.length} bones differ`);
 for(const [name,d] of diffs.slice(0,12))console.log(`   ${name.padEnd(22)} ${(d*100).toFixed(2)} cm`);
 const fingerish=diffs.filter(([n])=>/(index|middle|pinky|ring|thumb)_/.test(n)).length;
 console.log(`   of which finger bones: ${fingerish}`);
}
