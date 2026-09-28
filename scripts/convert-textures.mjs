// Re-encode the verified upstream ground textures into what the scene ships (RUN 12.3).
//
//   npm run fetch:textures && npm run convert:textures
//
// Poly Haven's 1K JPEGs are ~0.5-1.2 MB each at high quality, which is right for an asset
// library and too much for a page. The browser's own canvas re-encodes them at 1024 px: colour
// and roughness at q .82, the normal map at q .92 (block artefacts in a normal map read as
// bumps). The manifest records each set's real-world size, so the scene can tile it at scale.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {openPage} from './lib/headless-chrome.mjs';
import {TEXTURE_LOCK_PATH,upstreamTexture} from './fetch-texture-upstream.mjs';

export const OUT='public/textures/ground';
export const SIZE=1024;
export const QUALITY={diff:.82,rough:.8,normal:.92};

async function main(){
 const lock=JSON.parse(readFileSync(TEXTURE_LOCK_PATH,'utf8'));
 mkdirSync(OUT,{recursive:true});
 const page=await openPage();
 const sets=[];
 try{
  await page.evaluate(`window.__encode=async(b64,size,q)=>{const img=new Image();img.src='data:image/jpeg;base64,'+b64;await img.decode();
   const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(img,0,0,size,size);
   const m=document.createElement('canvas');m.width=m.height=64;const mg=m.getContext('2d');mg.drawImage(c,0,0,64,64);
   const d=mg.getImageData(0,0,64,64).data;let r=0,gg=0,b=0;for(let i=0;i<d.length;i+=4){r+=d[i];gg+=d[i+1];b+=d[i+2];}const n=d.length/4;
   return {b64:c.toDataURL('image/jpeg',q).split(',')[1],mean:[r/n,gg/n,b/n].map(v=>+v.toFixed(2))};}`);
  for(const source of lock.sources){
   const set={id:source.id,use:source.use,title:source.title,authors:source.authors,licence:source.licence,page:source.source_page,
    metres:source.dimensions_mm.map(v=>+(v/1000).toFixed(3)),maps:{}};
   for(const file of source.files){
    const bytes=readFileSync(upstreamTexture(source,file));
    const {b64,mean}=await page.evaluate(`__encode(${JSON.stringify(bytes.toString('base64'))},${SIZE},${QUALITY[file.role]})`);
    const out=Buffer.from(b64,'base64'),name=`${source.use}_${file.role}.jpg`;
    // The average sRGB colour, so the scene can keep its calibrated albedo (see src/ground/pbr.mjs).
    if(file.role==='diff')set.meanSrgb=mean;
    writeFileSync(join(OUT,name),out);
    set.maps[file.role]={file:name,bytes:out.length};
    console.log(`${name.padEnd(22)} ${(bytes.length/1024).toFixed(0).padStart(5)} KB -> ${(out.length/1024).toFixed(0).padStart(4)} KB`);
   }
   sets.push(set);
  }
 }finally{page.close();}
 writeFileSync(join(OUT,'manifest.json'),JSON.stringify({version:1,size:SIZE,quality:QUALITY,generator:'scripts/convert-textures.mjs',sets},null,1)+'\n');
 const total=sets.reduce((s,x)=>s+Object.values(x.maps).reduce((a,m)=>a+m.bytes,0),0);
 console.log(`${sets.length} sets, ${(total/1e6).toFixed(2)} MB`);
}
if(import.meta.url===`file://${process.argv[1]}`)await main();
