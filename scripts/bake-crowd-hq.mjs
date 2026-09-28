// Bake the RUN 6.8 citizen into something a thousand of can be drawn and animated.
//
// RUN 7A. The old crowd reaches 1,978 people because it is primitives in an InstancedMesh with
// one scalar per instance swinging the limbs in a vertex shader. That shape is right; what is
// wrong is that the bodies are capsules. This script keeps the shape and replaces the bodies.
//
// WHY A BONE ATLAS AND NOT A VERTEX ANIMATION TEXTURE. Both put the animation on the GPU.
// A VAT stores every vertex at every frame: 8,038 vertices x 120 frames is 5.5 MiB of half
// floats FOR ONE ARCHETYPE, so 22 MiB for four, and it has to be rebaked whenever the mesh
// changes. A bone atlas stores every BONE at every frame: 65 bones x 120 frames x a 4x3
// matrix is 366 KiB TOTAL, shared by every archetype, because the archetypes already share one
// clip set (RUN 6.8) and differ only in which vertices are weighted to those bones. Sixty
// times smaller, and the skinning attributes the geometry already carries do the rest.
//
// So each instance needs, per frame, exactly nothing from the CPU: a clip id and a phase sit
// in instanced attributes, the shader turns them into a row of the atlas, and time advances
// on the GPU. The CPU writes a clip id only when a pedestrian CHANGES STATE.
//
// Run: npm run bake:crowd-hq   (after npm run convert:character)
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
globalThis.ProgressEvent??=class{constructor(type,init={}){Object.assign(this,{type},init);}};

const OUT='public/data/crowd';
const SRC='public/data/character';

// The clips a crowd needs. NOT the full fifteen: a pedestrian in a street never sits in a car
// or throws a punch, and every clip in the atlas is paid for by every archetype at once.
// `fps` is the bake rate, not a playback rate -- the shader interpolates between rows.
const CLIPS=[
 {name:'Idle', clip:'Idle',   fps:15},
 {name:'Walk', clip:'Walk',   fps:24},
 {name:'Run',  clip:'Run',    fps:30},
 {name:'Startle',clip:'Startle',fps:24},
 {name:'Guard',clip:'Guard',  fps:15},
 {name:'Fall', clip:'Fall',   fps:24}
];

// Vertex budgets per level of detail. A crowd of two thousand full-resolution bodies is
// 18.5M vertices a frame, which no amount of instancing rescues, so the mass crowd runs on a
// decimated body and the near pool keeps the real one (RUN 6.8 is untouched by this).
const LODS=[
 {name:'L0',target:1.00},
 {name:'L1',target:0.28},
 {name:'L2',target:0.10}
];

const sha=b=>createHash('sha256').update(b).digest('hex');

/**
 * Vertex-cluster decimation that keeps skinning intact.
 *
 * three's SimplifyModifier drops every attribute but position, normal and uv, which would
 * throw away exactly the skin indices and garment mask this crowd is built on. Clustering is
 * cruder than edge collapse and it is enough here: the mass crowd is read as a silhouette at
 * four metres and beyond, and a cell's representative vertex carries its own skin weights, so
 * the body still bends where the bones are.
 */
function decimate(geometry,fraction){
 if(fraction>=1)return geometry;
 const position=geometry.attributes.position;
 const count=position.count;
 const target=Math.max(64,Math.round(count*fraction));
 geometry.computeBoundingBox();
 const box=geometry.boundingBox;
 const size=new T.Vector3().subVectors(box.max,box.min);
 // Choose a grid whose cell count lands near the target. Volume-proportional, then nudged.
 let grid=Math.cbrt(target);
 const cellFor=res=>{
  const cell=new Map();
  const sx=size.x/res,sy=size.y/res,sz=size.z/res;
  for(let i=0;i<count;i++){
   const x=Math.floor((position.getX(i)-box.min.x)/(sx||1));
   const y=Math.floor((position.getY(i)-box.min.y)/(sy||1));
   const z=Math.floor((position.getZ(i)-box.min.z)/(sz||1));
   const key=`${x},${y},${z}`;
   let bucket=cell.get(key);
   if(!bucket){bucket=[];cell.set(key,bucket);}
   bucket.push(i);
  }
  return cell;
 };
 let cell=cellFor(grid);
 for(let tries=0;tries<24&&Math.abs(cell.size-target)/target>.12;tries++){
  grid*=Math.pow(target/Math.max(1,cell.size),1/3);
  cell=cellFor(grid);
 }

 const names=Object.keys(geometry.attributes);
 const remap=new Int32Array(count).fill(-1);
 const chosen=[];
 for(const bucket of cell.values()){
  // The representative is the vertex nearest the cell's centroid, so the silhouette is kept
  // rather than being pulled to whichever vertex happened to be first.
  let cx=0,cy=0,cz=0;
  for(const i of bucket){cx+=position.getX(i);cy+=position.getY(i);cz+=position.getZ(i);}
  cx/=bucket.length;cy/=bucket.length;cz/=bucket.length;
  let best=bucket[0],bestD=Infinity;
  for(const i of bucket){
   const d=(position.getX(i)-cx)**2+(position.getY(i)-cy)**2+(position.getZ(i)-cz)**2;
   if(d<bestD){bestD=d;best=i;}
  }
  const slot=chosen.length;chosen.push(best);
  for(const i of bucket)remap[i]=slot;
 }

 const out=new T.BufferGeometry();
 for(const name of names){
  const source=geometry.attributes[name];
  const Ctor=source.array.constructor;
  const array=new Ctor(chosen.length*source.itemSize);
  for(let s=0;s<chosen.length;s++)
   for(let k=0;k<source.itemSize;k++)
    array[s*source.itemSize+k]=source.array[chosen[s]*source.itemSize+k];
  out.setAttribute(name,new T.BufferAttribute(array,source.itemSize,source.normalized));
 }
 const index=geometry.index;
 const kept=[];
 for(let t=0;t<index.count;t+=3){
  const a=remap[index.getX(t)],b=remap[index.getX(t+1)],c=remap[index.getX(t+2)];
  if(a===b||b===c||a===c)continue;            // collapsed to a sliver
  kept.push(a,b,c);
 }
 out.setIndex(kept);
 out.computeVertexNormals();
 return out;
}

// ---- load the RUN 6.8 character -------------------------------------------------------
const report=JSON.parse(readFileSync(`${SRC}/citizen.json`,'utf8'));
if(!report.rigs)throw new Error('citizen.json has no rigs; run npm run convert:character first');
const bytes=readFileSync(`${SRC}/citizen.glb`);
const gltf=await new Promise((res,rej)=>new GLTFLoader()
 .parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',res,rej));

// Bone names are renamed per rig by glTF; put them back exactly as the runtime does.
const armature=id=>{let found=null;gltf.scene.traverse(o=>{if(!found&&o.userData?.rig===id)found=o;});return found;};
const bonesOf=node=>{const out=[];node.traverse(o=>{if(o.isBone)out.push(o);});return out;};
const reference=bonesOf(armature(report.rigs[0].id)).map(b=>b.name);
for(const rig of report.rigs.slice(1)){
 const bones=bonesOf(armature(rig.id));
 for(let i=0;i<bones.length&&i<reference.length;i++)bones[i].name=reference[i];
}

// The canonical rig. Its bone order is what the atlas rows and every skinIndex refer to, and
// the archetype loop below needs it to fold fingers, so it is resolved before either.
const rig=armature(report.rigs[0].id);
const bones=bonesOf(rig);
const boneIndex=new Map(bones.map((b,i)=>[b.name,i]));
const skinned=[];gltf.scene.traverse(o=>{if(o.isSkinnedMesh&&!skinned.length)skinned.push(o);});
const boneInverses=skinned[0].skeleton.boneInverses;

// ---- the archetypes, matching src/life/appearance.mjs ---------------------------------
const {ARCHETYPES}=await import('../src/life/appearance.mjs');

console.log(`baking ${ARCHETYPES.length} archetypes x ${LODS.length} LODs, `
 +`${CLIPS.length} clips, ${reference.length} bones`);

const buffers=[];let offset=0;
const push=(typed)=>{
 const view=Buffer.from(typed.buffer,typed.byteOffset,typed.byteLength);
 const pad=(4-(view.length%4))%4;
 buffers.push(view);if(pad)buffers.push(Buffer.alloc(pad));
 const at=offset;offset+=view.length+pad;
 return {byteOffset:at,byteLength:view.length,count:typed.length};
};

const archetypes=[];
for(const archetype of ARCHETYPES){
 const rigNode=armature(archetype.rig);
 if(!rigNode)throw new Error(`no rig ${archetype.rig}`);
 const parts=[];
 rigNode.traverse(o=>{
  if(!o.isSkinnedMesh)return;
  const hair=o.userData?.hair;
  if(hair&&hair!==archetype.hair)return;      // only this archetype's hairstyle
  if(o.name==='Eyes'||o.name==='Eyebrows'||/Eyes|Eyebrows/.test(o.name))return; // too small to survive decimation
  parts.push(o);
 });
 if(!parts.length)throw new Error(`archetype ${archetype.id} has no meshes`);

 // Merge body and hair into ONE geometry: the crowd draws one instanced mesh per archetype,
 // so a citizen is one draw call no matter how many pieces they are made of.
 const merged=mergeSkinned(parts);
 // Fold the fingers into the hand BEFORE decimating.
 //
 // Forty of the sixty-five bones are finger joints, and the vertices weighted to them are
 // small, dense and adjacent. Clustering merges them into one representative that keeps a
 // single finger's weights, and the result is a hand pulled into spikes -- which is exactly
 // what the first bake produced. A crowd body has no use for articulated fingers at any
 // distance this is drawn from, so every finger weight is reassigned to its own hand and the
 // hand becomes a mitt. The atlas keeps all sixty-five bones because the near pool and the
 // player still use them; only the crowd geometry is simplified.
 foldFingers(merged,boneIndex);
 const levels=[];
 for(const lod of LODS){
  const g=decimate(merged,lod.target);
  const pos=new Float32Array(g.attributes.position.array);
  const nor=new Float32Array(g.attributes.normal.array);
  const si=new Uint8Array(g.attributes.skinIndex.count*4);
  const sw=new Uint8Array(g.attributes.skinWeight.count*4);
  for(let i=0;i<g.attributes.skinIndex.count;i++)for(let k=0;k<4;k++){
   si[i*4+k]=g.attributes.skinIndex.getComponent(i,k);
   sw[i*4+k]=Math.round(Math.max(0,Math.min(1,g.attributes.skinWeight.getComponent(i,k)))*255);
  }
  const col=new Uint8Array(g.attributes.color.count*4);
  for(let i=0;i<g.attributes.color.count;i++)for(let k=0;k<4;k++)
   col[i*4+k]=Math.round(Math.max(0,Math.min(1,g.attributes.color.getComponent(i,k)))*255);
  const idx=g.index.count>65535?new Uint32Array(g.index.array):new Uint16Array(g.index.array);
  levels.push({name:lod.name,
   vertices:g.attributes.position.count,triangles:g.index.count/3,
   indexType:idx.BYTES_PER_ELEMENT===4?'u32':'u16',
   position:push(pos),normal:push(nor),skinIndex:push(si),skinWeight:push(sw),
   color:push(col),index:push(idx)});
  if(lod.target<1)g.dispose();
 }
 archetypes.push({id:archetype.id,name:archetype.name,rig:archetype.rig,hair:archetype.hair,
  height:archetype.height,width:archetype.width,
  scaleToGame:report.rigs.find(r=>r.id===archetype.rig).scaleToGame,
  naturalHeight:report.rigs.find(r=>r.id===archetype.rig).height,
  levels});
 console.log(`  ${archetype.name.padEnd(11)} `
  +levels.map(l=>`${l.name} ${l.vertices}v/${l.triangles}t`).join('  '));
}

/** Reassign every finger vertex weight to the hand it belongs to. */
function foldFingers(geometry,index){
 const si=geometry.attributes.skinIndex,sw=geometry.attributes.skinWeight;
 const fold=new Map();
 for(const [name,i] of index)
  if(/^(index|middle|pinky|ring|thumb)_/.test(name))
   fold.set(i,index.get(name.endsWith('_l')?'hand_l':'hand_r'));
 let moved=0;
 for(let v=0;v<si.count;v++){
  // Sum the weights per target bone, so a vertex split across three fingers becomes one
  // weight on the hand rather than three competing ones.
  const acc=new Map();
  for(let k=0;k<4;k++){
   const bone=fold.get(si.getComponent(v,k))??si.getComponent(v,k);
   const weight=sw.getComponent(v,k);
   if(weight<=0)continue;
   if(fold.has(si.getComponent(v,k)))moved++;
   acc.set(bone,(acc.get(bone)??0)+weight);
  }
  const sorted=[...acc.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);
  const total=sorted.reduce((n,[,w])=>n+w,0)||1;
  for(let k=0;k<4;k++){
   si.setComponent(v,k,sorted[k]?sorted[k][0]:0);
   sw.setComponent(v,k,sorted[k]?sorted[k][1]/total:0);
  }
 }
 return moved;
}

/** Merge several SkinnedMeshes that share one skeleton into one geometry. */
function mergeSkinned(parts){
 const keep=['position','normal','skinIndex','skinWeight','color'];
 let vertices=0,indices=0;
 for(const p of parts){vertices+=p.geometry.attributes.position.count;indices+=p.geometry.index.count;}
 const out=new T.BufferGeometry();
 const make=(name,size)=>new Float32Array(vertices*size);
 const pos=make('position',3),nor=make('normal',3),si=make('skinIndex',4),
       sw=make('skinWeight',4),col=make('color',4);
 const index=new Uint32Array(indices);
 let v=0,i=0;
 for(const part of parts){
  const g=part.geometry,n=g.attributes.position.count;
  for(let k=0;k<n;k++){
   for(let c=0;c<3;c++){pos[(v+k)*3+c]=g.attributes.position.getComponent(k,c);
                        nor[(v+k)*3+c]=g.attributes.normal.getComponent(k,c);}
   for(let c=0;c<4;c++){
    si[(v+k)*4+c]=g.attributes.skinIndex.getComponent(k,c);
    sw[(v+k)*4+c]=g.attributes.skinWeight.getComponent(k,c);
    col[(v+k)*4+c]=g.attributes.color?g.attributes.color.getComponent(k,c):(c===3?0:0);
   }
  }
  for(let k=0;k<g.index.count;k++)index[i+k]=g.index.getX(k)+v;
  v+=n;i+=g.index.count;
 }
 out.setAttribute('position',new T.BufferAttribute(pos,3));
 out.setAttribute('normal',new T.BufferAttribute(nor,3));
 out.setAttribute('skinIndex',new T.BufferAttribute(si,4));
 out.setAttribute('skinWeight',new T.BufferAttribute(sw,4));
 out.setAttribute('color',new T.BufferAttribute(col,4));
 out.setIndex(new T.BufferAttribute(index,1));
 for(const name of Object.keys(out.attributes))if(!keep.includes(name))out.deleteAttribute(name);
 return out;
}

// ---- the bone atlas -------------------------------------------------------------------
//
// One row per baked frame, one set of three RGBA texels per bone: a 4x3 matrix is all a
// skinning transform needs, and dropping the constant fourth row saves a quarter of the file.
//
// The matrices are boneMatrixWorld * boneInverse, exactly what three's Skeleton uploads --
// computed here, once, offline, for every frame of every clip, instead of on the CPU for two
// thousand people sixty times a second.

const mixerRoot=rig;
const mixer=new T.AnimationMixer(mixerRoot);
const atlasRows=[];const clipTable=[];
const scratch=new T.Matrix4();
for(const spec of CLIPS){
 const clip=gltf.animations.find(c=>c.name===spec.clip);
 if(!clip){console.warn(`  no clip ${spec.clip}, skipped`);continue;}
 const frames=Math.max(2,Math.round(clip.duration*spec.fps));
 const action=mixer.clipAction(clip);
 action.reset();action.play();action.setEffectiveWeight(1);
 const start=atlasRows.length;
 for(let f=0;f<frames;f++){
  mixer.setTime(0);
  action.time=(f/frames)*clip.duration;
  mixer.update(0);
  rig.updateMatrixWorld(true);
  const row=new Float32Array(bones.length*12);
  for(let b=0;b<bones.length;b++){
   scratch.multiplyMatrices(bones[b].matrixWorld,boneInverses[b]);
   const e=scratch.elements;
   // column-major 4x4 -> three rows of four, dropping the constant last row
   row[b*12+0]=e[0];row[b*12+1]=e[4];row[b*12+2]=e[8]; row[b*12+3]=e[12];
   row[b*12+4]=e[1];row[b*12+5]=e[5];row[b*12+6]=e[9]; row[b*12+7]=e[13];
   row[b*12+8]=e[2];row[b*12+9]=e[6];row[b*12+10]=e[10];row[b*12+11]=e[14];
  }
  atlasRows.push(row);
 }
 action.stop();
 clipTable.push({name:spec.name,source:spec.clip,row:start,frames,
  duration:Number(clip.duration.toFixed(4)),fps:spec.fps,
  loop:!['Fall','Startle'].includes(spec.name)});
 console.log(`  clip ${spec.name.padEnd(8)} rows ${start}..${start+frames-1} (${frames} @ ${spec.fps}fps)`);
}
const atlas=new Float32Array(atlasRows.length*bones.length*12);
atlasRows.forEach((row,r)=>atlas.set(row,r*bones.length*12));
const atlasEntry=push(atlas);

// ---- write ----------------------------------------------------------------------------
mkdirSync(OUT,{recursive:true});
const bin=Buffer.concat(buffers);
writeFileSync(`${OUT}/hq-crowd.bin`,bin);
const manifest={
 generated:new Date().toISOString().slice(0,10),
 source:'public/data/character/citizen.glb (RUN 6.8)',
 architecture:'shared GPU bone animation atlas + per-archetype instanced skinned geometry',
 bones:bones.length,
 boneNames:bones.map(b=>b.name),
 atlas:{...atlasEntry,rows:atlasRows.length,texelsPerBone:3,
  width:bones.length*3,height:atlasRows.length,format:'RGBA32F'},
 clips:clipTable,
 archetypes,
 output:{file:'public/data/crowd/hq-crowd.bin',bytes:bin.length,sha256:sha(bin)}
};
writeFileSync(`${OUT}/hq-crowd.json`,JSON.stringify(manifest,null,1)+'\n');

console.log(`\nhq-crowd.bin  ${(bin.length/1024).toFixed(1)} KiB`);
console.log(`  atlas ${manifest.atlas.width} x ${manifest.atlas.height} RGBA32F `
 +`(${(atlas.byteLength/1024).toFixed(1)} KiB) -- shared by every archetype`);
for(const a of archetypes)
 console.log(`  ${a.name.padEnd(11)} ${a.levels.map(l=>l.name+' '+l.triangles+'t').join(' ')}`);
