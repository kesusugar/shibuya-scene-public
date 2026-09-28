import {Group,BoxGeometry,ConeGeometry,MeshStandardMaterial,Vector3,Quaternion,Euler} from 'three';
import {InstancedBuilder,triangleCount} from '../geo/geometry.mjs';
import {buildConstructionModel,CONSTRUCTION_PROFILES} from './model.mjs';
export function constructionParts(model){
 const parts=[];const colors={crane:0xd4a23e,steel:0x7c8890,sheet:0x587782,concrete:0x52585c,warning:0xff5029};
 for(const [index,z] of model.zones.entries()){
  let role='crane';const add=(p,size,color='crane',detail=0,rotation=[0,0,0],shape='box')=>parts.push({zone:index,role,detail,p:[p[0]+z.point[0],p[1]+z.base,p[2]+z.point[1]],size,rotation,shape,color:colors[color],marker:color==='warning',rank:Math.max(detail,role==='crane'?(index===0?0:index<3?1:2):(index<2?0:index===2?1:2))});
  const bar=(a,b,width=.12,color='crane',detail=0)=>{const d=new Vector3(...b).sub(new Vector3(...a)),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.clone().normalize()),e=new Euler().setFromQuaternion(q);add(a.map((v,i)=>(v+b[i])/2),[width,d.length(),width],color,detail,[e.x,e.y,e.z]);};
  const h=z.height;add([-1,.3,0],[3,.6,3],'concrete');for(const x of [-1.7,-.3])for(const k of [-.7,.7])bar([x,.6,k],[x,h,k],.16);
  for(let y=1;y<h;y+=3){for(const k of [-.7,.7]){bar([-1.7,y,k],[-.3,y,k]);bar([-1.7,y,k],[-.3,Math.min(h,y+3),k],.09,'crane',1);}for(const x of [-1.7,-.3])bar([x,y,-.7],[x,y,.7]);}
  for(const k of [-.6,.6]){bar([-9,h,k],[11,h,k],.16);bar([-9,h+1.4,k],[11,h+1.4,k],.12);for(let x=-9;x<11;x+=2)bar([x,h,k],[x+2,h+1.4,k],.09,'crane',1);}
  for(let x=-9;x<=11;x+=2)bar([x,h,-.6],[x,h,.6]);
  add([-7,h-.65,0],[2.5,1.3,1.5],'concrete');add([.5,h-.65,0],[1.5,1.3,1.3],'sheet');add([6,h-.2,0],[.8,.4,1.4],'steel');bar([6,h-.4,0],[6,h-10,0],.055,'steel');bar([6,h-10,0],[6.45,h-10,0],.14,'steel');bar([6.45,h-10,0],[6.45,h-9.5,0],.14,'steel');add([11,h+1.65,0],[.24,.35,.24],'warning');
  role='zone';
  for(const k of [-3.4,3.4]){add([0,.7,k],[6.8,1.4,.08],'sheet');add([k,.7,0],[.08,1.4,6.8],'sheet');for(const x of [-3.2,0,3.2])add([x,1.55,k],[.09,3.1,.09],'steel',1);add([k,1.55,0],[.09,3.1,.09],'steel',1);add([k,1.45,k],[.2,.12,.2],'warning');}
  // Small roof-service refurbishment scaffold; no whole-building wrapping.
  for(const x of [1.3,3])for(const k of [-2,2])bar([x,0,k],[x,5,k],.08,'steel',1);
  for(const y of [1.6,3.2,4.8]){for(const x of [1.3,3])bar([x,y,-2],[x,y,2],.07,'steel',1);for(const k of [-2,2])bar([1.3,y,k],[3,y,k],.07,'steel',1);add([2.15,y,0],[1.7,.08,4],'concrete',1);}
  add([3.05,3,0],[.035,3.6,4],'sheet',1);
  for(let i=0;i<4;i++){add([-2.8+i*.65,.25,2.4],[.8,.5,.7],'concrete',2);add([-2.8+i*1.3,.25,-2.7],[.22,.5,.22],'warning',2,[0,0,0],'cone');}
 }
 return parts;
}
/** @param {any} data @param {{generic?:any,time?:any,tier?:string,model?:any}} options */
export function buildConstruction(data,{generic,time,tier='medium',model=buildConstructionModel(data,{generic})}={}){
 const root=new Group();root.name='s15-construction';const parts=constructionParts(model),box=new BoxGeometry(1,1,1),cone=new ConeGeometry(1,1,6),material=new MeshStandardMaterial({roughness:.8}),warning=new MeshStandardMaterial({roughness:.65,emissive:0xff3715,emissiveIntensity:0});
 const buckets=[{name:'structure',parts:parts.filter(p=>p.shape==='box'&&!p.marker),geometry:box,material},{name:'markers',parts:parts.filter(p=>p.shape==='box'&&p.marker),geometry:box,material:warning},{name:'cones',parts:parts.filter(p=>p.shape==='cone'),geometry:cone,material}];
 for(const b of buckets){b.parts.sort((a,b)=>a.rank-b.rank);b.builder=new InstancedBuilder(b.geometry,b.material,b.parts.length);for(const p of b.parts)b.builder.add(...p.p,0,p.size,p.color,p.rotation);b.mesh=b.builder.build();b.mesh.name='s15-'+b.name;root.add(b.mesh);}
 const stats={tier,cranes:0,zones:0,instances:0,triangles:0,drawCalls:0,geometries:2,materials:2,textures:0,lights:0};let disposed=false;
 function setTier(t){const p=CONSTRUCTION_PROFILES[t];if(!p)throw Error('Invalid construction tier');stats.tier=t;stats.cranes=p.cranes;stats.zones=p.zones;stats.instances=0;stats.triangles=0;stats.drawCalls=0;for(const b of buckets){b.mesh.count=b.parts.filter(r=>r.rank<=p.detail).length;stats.instances+=b.mesh.count;stats.triangles+=b.mesh.count*triangleCount(b.geometry);stats.drawCalls+=b.mesh.count?1:0;}}
 const refresh=()=>{warning.emissiveIntensity=time?.isDark()?.65:0;};const off=time?.subscribe(refresh);refresh();setTier(tier);
 return {root,model,parts,buckets,stats,setTier,dispose(){if(disposed)return;disposed=true;off?.();root.removeFromParent();buckets.forEach(b=>b.builder.dispose());box.dispose();cone.dispose();material.dispose();warning.dispose();root.clear();}};
}
