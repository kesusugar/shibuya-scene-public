import * as T from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
// Original authored geometry and animation; no external model/clip assets.
const root=new T.Group();root.name='player-figure';
const bones=[],parts=new Map(),materials=[0xb9503c,0x253344,0xdfb994,0x24232a,0x151b25,0xe6ded0].map(color=>new T.MeshStandardMaterial({color,roughness:.82}));
function bone(name,parent,x=0,y=0,z=0){const b=new T.Bone();b.name=name;b.position.set(x,y,z);parent.add(b);bones.push(b);return b;}
const body=bone('Body',root),spine=bone('Spine',body,0,.92),head=bone('Head',spine,0,.64);
const limbs=[];
for(const side of [-1,1]){const tag=side<0?'L':'R';const hip=bone('Hip'+tag,body,side*.105,.9),knee=bone('Knee'+tag,hip,0,-.4),shoulder=bone('Arm'+tag,spine,side*.225,.46),elbow=bone('Elbow'+tag,shoulder,0,-.27);limbs.push({side,hip,knee,shoulder,elbow});}
root.updateMatrixWorld(true);
function add(g,b,mat,scale,position,blend=null){g.scale(...scale);g.translate(...position);g.applyMatrix4(b.matrixWorld);g.deleteAttribute('uv');const n=g.attributes.position.count,indices=new Uint16Array(n*4),weights=new Float32Array(n*4),v=new T.Vector3(),inverse=b.matrixWorld.clone().invert();
 for(let i=0;i<n;i++){indices[i*4]=bones.indexOf(b);weights[i*4]=1;if(blend){v.fromBufferAttribute(g.attributes.position,i).applyMatrix4(inverse);const w=Math.max(0,Math.min(.45,(blend.start-v.y)/.12));indices[i*4+1]=bones.indexOf(blend.child);weights[i*4]=1-w;weights[i*4+1]=w;}}
 g.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));if(!parts.has(mat))parts.set(mat,[]);parts.get(mat).push(g);
}
const sphere=(b,m,s,p)=>add(new T.SphereGeometry(1,12,8),b,m,s,p);
const box=(b,m,s,p)=>add(new T.BoxGeometry(1,1,1),b,m,s,p);
// Jacket, shirt, waistband, facial planes, ears and actual eyes replace featureless head.
add(new T.CapsuleGeometry(.23,.28,4,12),spine,0,[1,1,.61],[0,.26,0]);
box(spine,5,[.13,.36,.018],[0,.32,.165]);box(spine,1,[.33,.15,.23],[0,.02,0]);
for(const side of [-1,1]){box(spine,0,[.068,.13,.035],[side*.10,.46,.16]);box(spine,3,[.09,.012,.025],[side*.13,.19,.17]);sphere(head,2,[.029,.049,.024],[side*.119,.02,0]);sphere(head,5,[.029,.012,.012],[side*.042,.045,.113]);sphere(head,3,[.010,.010,.006],[side*.042,.045,.126]);}
sphere(head,2,[.112,.142,.11],[0,.04,0]);sphere(head,2,[.023,.034,.032],[0,.02,.111]);box(head,3,[.040,.006,.008],[0,-.033,.102]);
add(new T.SphereGeometry(1,16,10,0,Math.PI*2,0,Math.PI*.43),head,3,[.116,.146,.115],[0,.047,-.005]);
sphere(head,3,[.112,.083,.057],[0,.055,-.068]);
add(new T.CylinderGeometry(.062,.073,.12,10),spine,2,[1,1,1],[0,.56,0]);
for(const {side,hip,knee,shoulder,elbow} of limbs){
 add(new T.CapsuleGeometry(.077,.26,3,8),hip,1,[1,1,.95],[0,-.19,0],{child:knee,start:-.29});
 add(new T.CapsuleGeometry(.063,.25,3,8),knee,1,[1,1,1],[0,-.18,0]);box(knee,4,[.135,.095,.255],[0,-.435,.052]);box(knee,5,[.137,.022,.257],[0,-.473,.052]);
 add(new T.CapsuleGeometry(.068,.17,3,8),shoulder,0,[1,1,1],[0,-.13,0],{child:elbow,start:-.20});
 add(new T.CapsuleGeometry(.055,.16,3,8),elbow,0,[1,1,1],[0,-.13,0]);sphere(elbow,2,[.046,.073,.036],[0,-.29,.006]);sphere(elbow,2,[.025,.038,.023],[-side*.037,-.278,.025]);
}
const skeleton=new T.Skeleton(bones);
for(const [mat,list] of parts){const merged=mergeGeometries(list,false),g=mergeVertices(merged,1e-5);merged.dispose();list.forEach(g=>g.dispose());const mesh=new T.SkinnedMesh(g,materials[mat]);mesh.name='HeroMaterial'+mat;mesh.frustumCulled=false;root.add(mesh);mesh.bind(skeleton);}
const specs={Idle:[2,0],Walk:[1,1.55],Run:[.72,3.1],Sprint:[.6,4.2],Punch:[.42,0],Hit:[.34,0],Startle:[.4,0],Guard:[1,0],Enter:[.78,0],Exit:[.9,0],Fall:[.6,0],Death:[1,0]};
const clips=[];
for(const [name,[duration,speed]] of Object.entries(specs)){
 const times=[];
 const count=Math.round(duration*30);for(let i=0;i<=count;i++)times[i]=i*duration/count;
 const tracks=[],angles=new Map(bones.map(b=>[b.name,[]])),positions=[];
 for(const t of times){const f=t/duration,p=f*Math.PI*2,move=speed>0,run=speed>2,amp=run?.72:.42,pose=Object.fromEntries(bones.map(b=>[b.name,[0,0,0]]));
  pose.Spine=[move?(run?.12:.035):Math.sin(p)*.008,move?Math.sin(p)*(run?.08:.045):0,0];pose.Head=[0,move?-Math.sin(p)*.035:Math.sin(p)*.025,0];
  for(const {side} of limbs){const tag=side<0?'L':'R',swing=Math.sin(p+(side<0?0:Math.PI));pose['Hip'+tag]=[move?swing*amp:0,0,0];pose['Knee'+tag]=[move?Math.max(0,-swing)*(run?1.1:.65):.025,0,0];pose['Arm'+tag]=[move?-swing*amp*.7:-.07,0,side*.035];pose['Elbow'+tag]=[run?-.9:-.18,0,0];}
  let y=move?Math.abs(Math.cos(p))*(run?.026:.012):Math.sin(p)*.002;
  if(name==='Punch'){const k=Math.sin(Math.PI*f);pose.ArmR=[-1.65*k,0,-.12*k];pose.ElbowR=[-.8*(1-k)-.1,0,0];pose.Spine=[.07*k,-.25*k,0];}
  if(name==='Hit'){const k=Math.sin(Math.PI*f);pose.Spine=[-.28*k,0,0];pose.ArmL=[-.25*k,0,.3*k];pose.ArmR=[-.25*k,0,-.3*k];}
  if(name==='Guard'||name==='Startle'){const k=name==='Guard'?1:Math.sin(Math.PI*f);pose.Spine=[-.12*k,0,0];pose.ArmL=[-1.1*k,0,(name==='Guard'?.35:-.15)*k];pose.ArmR=[-1.1*k,0,(name==='Guard'?-.35:.15)*k];pose.ElbowL=[-1.15*k,0,0];pose.ElbowR=[-1.15*k,0,0];}
  if(name==='Enter'||name==='Exit'){const q=name==='Enter'?f:1-f;
   // Three separate curves, because getting into a car is three things at once and a single
   // arch made it one. `settle` is monotonic -- the body goes down into the seat and stays
   // there; with an arch it stood back up again just as it arrived, which reads as a bob
   // rather than as sitting. `duck` is the arch that clears the door frame. `reach` is the
   // hand going out to the door and coming back, and it happens early, not throughout.
   const settle=q*q*(3-2*q),duck=Math.sin(q*Math.PI);
   const reach=Math.sin(Math.min(1,q/.45)*Math.PI);
   // The trailing leg follows the leading one in rather than swinging with it.
   const l=Math.max(0,Math.min(1,(q-.25)/.75)),settleL=l*l*(3-2*l);
   pose.Spine=[.3*duck+.34*settle,-.12*reach,0];
   pose.Head=[.16*duck,-.2*reach,0];
   // Door-side arm reaches, and the elbow bends to do it. Previously both elbows were left
   // at the standing default, so the hand went to the door on a straight arm.
   pose.ArmL=[-1.15*reach-.25*settle,0,-.3*reach];pose.ElbowL=[-1.25*reach-.3*settle,0,0];
   pose.ArmR=[-.4*settle,0,.05];pose.ElbowR=[-.62*settle,0,0];
   // Both legs fold. HipL and KneeL were never written at all, so the left leg stayed
   // rigidly straight through the whole motion.
   pose.HipR=[-1.18*settle,0,0];pose.KneeR=[1.28*settle,0,0];
   pose.HipL=[-1.02*settleL,0,0];pose.KneeL=[1.16*settleL,0,0];
   y=-.17*settle-.04*duck;}
  if(name==='Fall'||name==='Death'){const k=name==='Death'?1:f*f*(3-2*f);pose.Body=[0,0,k*Math.PI/2];pose.ArmL=[0,0,.25*k];pose.KneeR=[.35*k,0,0];y=.23*k;}
  positions.push(0,y,0);
  for(const b of bones){const q=new T.Quaternion().setFromEuler(new T.Euler(...pose[b.name]));angles.get(b.name).push(q.x,q.y,q.z,q.w);}
 }
 for(const b of bones)tracks.push(new T.QuaternionKeyframeTrack(b.name+'.quaternion',times,angles.get(b.name)));
 tracks.push(new T.VectorKeyframeTrack('Body.position',times,positions));clips.push(new T.AnimationClip(name,duration,tracks));
}
// Remove exactly redundant samples offline; interpolation and clip duration stay intact.
for(const clip of clips)clip.optimize();
root.animations=clips;
const sourceKey=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
let text=JSON.stringify({version:1,sourceKey,gait:Object.fromEntries(Object.entries(specs).filter(([,s])=>s[1]>0).map(([n,s])=>[n,s[1]])),scene:root.toJSON()},(key,value)=>typeof value==='number'?Math.round(value*100000)/100000:value);
const ids=new Map();text=text.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,id=>{if(!ids.has(id))ids.set(id,'hero-'+ids.size);return ids.get(id);});
mkdirSync('src/player/generated',{recursive:true});writeFileSync('src/player/generated/character.mjs','// Offline original character. Run npm run bake:character.\nexport default JSON.parse('+JSON.stringify(text)+');\n');
console.log('Character baked:',text.length,'bytes;',bones.length,'bones;',clips.length,'clips');
