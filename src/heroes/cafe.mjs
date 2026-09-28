import {CanvasTexture,DataTexture,RGBAFormat,SRGBColorSpace,MeshStandardMaterial,PlaneGeometry,Mesh} from 'three';
import {edges,facadePoint} from './model.mjs';
import {merge} from '../geo/geometry.mjs';
import {createCafeFrames} from './cafe-frames.mjs';

// A shared two-storey shopfront texture; geometry remains on the existing footprint.
export function paintCafe(ctx,w,h){
 ctx.fillStyle='#172125';ctx.fillRect(0,0,w,h);
 for(const [floor,top,bottom] of [[1,.06,.43],[0,.59,.95]]){
  for(let bay=0;bay<8;bay++){
   const x=w*(.025+bay*.12),bw=w*.112,yt=h*top,bh=h*(bottom-top);
   const room=ctx.createLinearGradient(0,yt,0,yt+bh);
   room.addColorStop(0,'#574638');room.addColorStop(.45,bay%3===0?'#66523b':'#98744a');room.addColorStop(1,'#262e2d');
   ctx.fillStyle=room;ctx.fillRect(x,yt,bw,bh);
   ctx.fillStyle='#bd9564';ctx.fillRect(x,yt+bh*.12,bw,h*.006);
   if(floor===1){
    // Cafe: hanging fixtures, window counters, varied seated silhouettes.
    ctx.fillStyle='#242b2e';ctx.fillRect(x+bw*.48,yt,bw*.015,bh*.19);
    ctx.fillStyle='#ffe2a1';ctx.beginPath();ctx.ellipse(x+bw*.49,yt+bh*.21,bw*.12,bh*.045,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ba8b54';ctx.fillRect(x,yt+bh*.68,bw,h*.013);
    for(let seat=0;seat<3;seat++){
     const sx=x+bw*(.18+seat*.31),occupied=(bay+seat)%3!==0;
     ctx.fillStyle='#35302d';ctx.fillRect(sx-bw*.08,yt+bh*.8,bw*.16,bh*.06);ctx.fillRect(sx-bw*.015,yt+bh*.86,bw*.03,bh*.14);
     if(occupied){ctx.fillStyle=['#202a30','#463633','#314040'][(bay+seat)%3];ctx.beginPath();ctx.ellipse(sx,yt+bh*.5,bw*.06,bh*.065,0,0,Math.PI*2);ctx.fill();ctx.fillRect(sx-bw*.08,yt+bh*.57,bw*.16,bh*.18);}
     ctx.fillStyle='#efdfb9';ctx.fillRect(sx+bw*.06,yt+bh*.63,bw*.035,bh*.04);
    }
   }else if(bay===3||bay===4){
    // Double entrance doors remain visually distinct from merchandise bays.
    ctx.fillStyle='#17272d';ctx.fillRect(x+bw*.08,yt+bh*.1,bw*.84,bh*.9);
    ctx.fillStyle='#acb7af';ctx.fillRect(x+bw*.49,yt+bh*.1,bw*.018,bh*.9);
    ctx.fillRect(x+bw*.41,yt+bh*.55,bw*.018,bh*.15);ctx.fillRect(x+bw*.57,yt+bh*.55,bw*.018,bh*.15);
   }else{
    for(let shelf=0;shelf<3;shelf++){
     const sy=yt+bh*(.2+shelf*.22);
     for(let book=0;book<5;book++){ctx.fillStyle=['#d0be95','#677f7e','#a76952','#c6a36a','#d2d8ce'][(book+bay+shelf)%5];ctx.fillRect(x+bw*(.08+book*.17),sy,bw*.11,bh*(.13+((book+bay)%2)*.03));}
     ctx.fillStyle='#493b30';ctx.fillRect(x,sy+bh*.17,bw,bh*.025);
    }
   }
   ctx.fillStyle='#bbd3da16';ctx.fillRect(x+bw*.73,yt,bw*.1,bh);
  }
  ctx.fillStyle='#485457';for(let bay=0;bay<=8;bay++)ctx.fillRect(w*(.015+bay*.12),h*top,w*.009,h*(bottom-top));
 }
 // Neutral fascia and illuminated tenant lettering, not a broad green strip.
 ctx.fillStyle='#202a2b';ctx.fillRect(0,h*.445,w,h*.125);
 ctx.fillStyle='#f8e6b8';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${h*.047}px Arial`;ctx.fillText('STARBUCKS',w*.32,h*.51,w*.52);
 ctx.fillStyle='#f1f2ec';ctx.font=`700 ${h*.038}px Arial`;ctx.fillText('TSUTAYA',w*.79,h*.51,w*.29);
 ctx.fillStyle='#827b65';ctx.fillRect(0,h*.44,w,h*.006);ctx.fillRect(0,h*.57,w,h*.006);
 ctx.fillStyle='#464b49';ctx.fillRect(0,h*.975,w,h*.025);
}

export function createQfrontCafe(hero,{canvasFactory}={}){
 const canvas=canvasFactory?canvasFactory():typeof document!=='undefined'?document.createElement('canvas'):null;
 let texture;if(canvas){canvas.width=2048;canvas.height=1024;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Cafe Canvas2D unavailable');paintCafe(ctx,2048,1024);texture=new CanvasTexture(canvas);}else texture=new DataTexture(new Uint8Array([210,183,139,255]),1,1,RGBAFormat);
 texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;
 const fronts=edges(hero.footprint).filter(e=>e.length>3&&e.normal[0]*hero.primaryFacade.direction[0]+e.normal[1]*hero.primaryFacade.direction[1]>.25);
 const pieces=fronts.map(e=>{const g=new PlaneGeometry(e.length-.18,6.7);g.rotateY(e.heading);g.translate(...facadePoint(e,e.length/2,3.8,.24));return g;});
 const geometry=merge(pieces);pieces.forEach(g=>g.dispose());
 const material=new MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:.12,roughness:.42,metalness:.08});
 const mesh=new Mesh(geometry,material);mesh.name='hero-cafe-frontage';mesh.userData.noAO=true;
 const frames=createCafeFrames(fronts);mesh.add(frames.root);let disposed=false;
 return {mesh,fronts,frames,triangles:fronts.length*2+frames.triangles,dispose(){if(disposed)return;disposed=true;frames.dispose();mesh.removeFromParent();geometry.dispose();material.dispose();texture.dispose();}};
}
