import {Group,PlaneGeometry,BoxGeometry,CylinderGeometry,MeshStandardMaterial,DataTexture,RGBAFormat,UnsignedByteType,SRGBColorSpace,LinearFilter,LinearMipmapLinearFilter} from 'three';
import {InstancedBuilder,triangleCount} from '../geo/geometry.mjs';
import {distance,seededRandom} from '../geo/core.mjs';

function texture(width,height,paint){
 const data=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,[r,g,b,a]=paint(x,y,width,height);data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=a;}
 const map=new DataTexture(data,width,height,RGBAFormat,UnsignedByteType);map.colorSpace=SRGBColorSpace;map.generateMipmaps=true;map.minFilter=LinearMipmapLinearFilter;map.magFilter=LinearFilter;map.anisotropy=4;map.needsUpdate=true;return map;
}

export function createFacadeDetailTextures(){
 const stain=texture(64,128,(x,y,w,h)=>{const nx=Math.abs(x/w-.5)*2,tail=Math.max(0,1-y/h),edge=Math.max(0,1-nx*(1.8+1.2*y/h)),a=Math.round(105*edge*tail*(.72+.28*Math.sin(x*.83+y*.17)**2));return [43,50,53,a];});
 const sticker=texture(128,160,(x,y,w,h)=>{const cards=[[.08,.08,.43,.32,236,92,112],[.51,.13,.9,.42,66,167,199],[.14,.48,.72,.72,244,205,91],[.38,.76,.92,.94,103,187,131]],hit=cards.find(c=>x/w>=c[0]&&x/w<=c[2]&&y/h>=c[1]&&y/h<=c[3]);return hit?[hit[4],hit[5],hit[6],245]:[255,255,255,0];});
 return {stain,sticker};
}

export function buildHighBuildingDetails(model){
 const root=new Group();root.name='buildings-high-detail';const textures=createFacadeDetailTextures();
 const materials={
  stain:new MeshStandardMaterial({color:0xa7afb0,map:textures.stain,roughness:.96,alphaTest:.06,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),
  sticker:new MeshStandardMaterial({color:0xffffff,map:textures.sticker,emissiveMap:textures.sticker,emissive:0x151515,emissiveIntensity:.2,roughness:.68,alphaTest:.08,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}),
  utilityDark:new MeshStandardMaterial({color:0x41494c,roughness:.76,metalness:.24,envMapIntensity:.65}),
  utilityLight:new MeshStandardMaterial({color:0xaeb6b3,roughness:.7,metalness:.18,envMapIntensity:.72}),
  roofDark:new MeshStandardMaterial({color:0x596164,roughness:.74,metalness:.28,envMapIntensity:.7}),
  roofLight:new MeshStandardMaterial({color:0xa5aca8,roughness:.66,metalness:.22,envMapIntensity:.78})
 };
 const geometries={plane:new PlaneGeometry(1,1),box:new BoxGeometry(1,1,1),cylinder:new CylinderGeometry(.5,.5,1,8)};
 const definitions={stain:['plane','stain'],sticker:['plane','sticker'],pipe:['cylinder','utilityDark'],ac:['box','utilityLight'],cable:['box','utilityDark'],junction:['box','utilityDark'],roofPosts:['cylinder','roofDark'],roofFrames:['box','roofDark'],roofCapsBox:['box','roofLight'],roofCapsRound:['cylinder','roofLight']};
 const records=Object.fromEntries(Object.keys(definitions).map(k=>[k,[]]));
 const add=(key,position,scale,heading=0,color=0xffffff)=>records[key].push({position,scale,heading,color});
 for(const b of model.buildings){
  const rng=seededRandom(b.key+':high-graphics'),top=b.height+.15,ring=b.polygon.outer;
  for(let i=0;i<ring.length;i++){
   const a=ring[i],z=ring[(i+1)%ring.length],length=distance(a,z);if(length<4)continue;const tx=(z[0]-a[0])/length,tz=(z[1]-a[1])/length,nx=tz,nz=-tx,heading=Math.atan2(nx,nz),point=(along,y,out=.055)=>[a[0]+tx*along+nx*out,y,a[1]+tz*along+nz*out];
   if(top>7&&rng()<.55){const h=Math.min(8,Math.max(2.8,top*.22)),along=length*(.22+rng()*.56);add('stain',point(along,top-h*.55,.058),[Math.min(1.4,length*.16),h,1],heading);}
   if(top>6&&rng()<.5){const h=Math.max(2.5,Math.min(top-1.2,3+rng()*8)),along=length*(.12+rng()*.76);add('pipe',point(along,b.base+h/2,.13),[.11,h,.11],heading,[0x3c4446,0x6a7070][rng()<.35?1:0]);}
   if(top>8&&rng()<.67){const y=Math.min(top-1.2,4.8+Math.floor(rng()*Math.max(1,(top-6)/4))*3.4),along=length*(.18+rng()*.64);add('ac',point(along,y,.24),[.82,.52,.38],heading,[0x9ba5a3,0xc0c4bb,0x7f898a][Math.floor(rng()*3)]);}
   if(top>5&&rng()<.37){const y=Math.min(top-1,3.5+rng()*Math.min(8,top-4.5));add('cable',point(length/2,y,.11),[Math.max(.8,length*.78),.055,.08],heading,0x323a3d);}
   const front=distance(a,b.frontage.a)<.01&&distance(z,b.frontage.b)<.01;
   if(front&&rng()<.28)add('sticker',point(length*(.18+rng()*.64),1.25,.075),[.7,.9,1],heading);
   if(front&&rng()<.42)add('junction',point(length*(.12+rng()*.76),2.2,.18),[.34,.48,.24],heading,[0x596268,0x8e8b78][rng()<.3?1:0]);
  }
  for(const p of b.rooftop){
   const y=top+p.height,dx=Math.max(.15,p.width*.38),dz=Math.max(.15,p.depth*.38);
   add('roofPosts',[p.center[0]-dx,y+.35,p.center[1]-dz],[.08,.7,.08],0,0x667074);add('roofPosts',[p.center[0]+dx,y+.35,p.center[1]+dz],[.08,.7,.08],0,0x667074);
   add('roofFrames',[p.center[0],y+.7,p.center[1]-dz],[Math.max(.45,p.width+.35),.08,.08],0,0x667074);add('roofFrames',[p.center[0]+dx,y+.7,p.center[1]],[.08,.08,Math.max(.45,p.depth+.35)],0,0x667074);
   const round=['tank','mast','vent'].includes(p.type);add(round?'roofCapsRound':'roofCapsBox',[p.center[0],y+.12,p.center[1]],[Math.max(.18,p.width*.55),.24,Math.max(.18,p.depth*.55)],0,p.type==='hut'?0x8e928d:0xb1b6ae);
  }
 }
 const builders=[],batches={};for(const [name,list] of Object.entries(records)){if(!list.length)continue;const [geometryName,materialName]=definitions[name],geometry=geometries[geometryName],builder=new InstancedBuilder(geometry,materials[materialName],list.length);for(const r of list)builder.add(...r.position,r.heading,r.scale,r.color);const mesh=builder.build();mesh.name='buildings-high-'+name;mesh.receiveShadow=true;root.add(mesh);builders.push(builder);batches[name]={instances:list.length,triangles:list.length*triangleCount(geometry)};}
 const stats={instances:Object.values(records).reduce((n,list)=>n+list.length,0),wallInstances:['stain','sticker','pipe','ac','cable','junction'].reduce((n,k)=>n+records[k].length,0),rooftopInstances:['roofPosts','roofFrames','roofCapsBox','roofCapsRound'].reduce((n,k)=>n+records[k].length,0),triangles:Object.values(batches).reduce((n,b)=>n+b.triangles,0),drawCalls:Object.keys(batches).length,materials:Object.keys(materials).length,geometries:Object.keys(geometries).length,textures:2,textureDimensions:[[64,128],[128,160]],batches};
 return {root,records,materials,textures,stats,dispose(){root.removeFromParent();builders.forEach(b=>b.dispose());Object.values(geometries).forEach(g=>g.dispose());Object.values(materials).forEach(m=>m.dispose());Object.values(textures).forEach(t=>t.dispose());root.clear();}};
}
