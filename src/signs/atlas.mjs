import {CanvasTexture,DataTexture,SRGBColorSpace,LinearFilter,RGBAFormat} from 'three';
import {QUALITY,CATEGORIES} from './config.mjs';
const WORDS=['渋谷書店','スクランブル珈琲','道玄坂薬局','センター街眼科','NEON RECORDS','TOKYO MOBILE','宇田川シネマ','SHIBUYA DINER','ハチ公不動産','宮益坂銀行','Q-BEAUTY','109 VISION','文化村 MUSIC','井の頭カメラ','渋谷横丁','MAGNET SPORTS','TSUTAYA BOOKS','SHIBUYA PARLOR','青山クリニック','MEGA KARAOKE','TOKYU STYLE','夜空ゲームズ','東京ラーメン','渋谷百貨店','SAKURA COSME','LIVE SHIBUYA','HACHI TAXI','CITY DRUG','DOGEN CAFE','CENTER FASHION','SHIBUYA NEWS','TOKYO CULTURE'];
const COLORS=[['#f8efe8','#db5966'],['#da4031','#fff7df'],['#f4f2dc','#32836c'],['#e8b4d3','#ffffff'],['#25856c','#fff8e8'],['#386dc0','#ffffff'],['#f2d46d','#433e39'],['#f5f4ee','#497dba']];
export function definitions(count=32){return Array.from({length:count},(_,i)=>({id:i,category:CATEGORIES[i%8],text:WORDS[i%WORDS.length],palette:COLORS[(i+Math.floor(i/8)*3)%8],styleSeed:i,emissiveClass:i%8===6?'screen':'printed',priority:i%8===6?3:1,aspect:[3,2,.3,3,2,.5,2.2,1][i%8],regionAffinity:i%3===0?'centerGai':'any',sizeClass:i%8===4?'large':'small'}));}
export function atlasEntries(size,count){const cols=8,rows=4,padding=Math.max(4,size/256);return Array.from({length:count},(_,id)=>{const x=id%cols*size/cols,y=Math.floor(id/cols)*size/rows,w=size/cols,h=size/rows;return {id,x,y,w,h,padding,u0:(x+padding)/size,u1:(x+w-padding)/size,v0:1-(y+h-padding)/size,v1:1-(y+padding)/size};});}
export function paintCity(ctx,size,count){
 const entries=atlasEntries(size,count),defs=definitions(count);
 ctx.fillStyle='#121721';ctx.fillRect(0,0,size,size);
 for(const e of entries){
  const d=defs[e.id],i=e.id%16,[bg,fg]=d.palette;
  ctx.fillStyle='#18212a';ctx.fillRect(e.x,e.y,e.w,e.h);
  ctx.save();ctx.beginPath();ctx.rect(e.x+e.padding,e.y+e.padding,e.w-2*e.padding,e.h-2*e.padding);ctx.clip();
  ctx.translate(e.x,e.y);ctx.scale(e.w,e.h);ctx.fillStyle=bg;ctx.fillRect(.04,.025,.92,.95);
  ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';
  const vertical=['blade','directory'].includes(d.category);
  if(vertical){
   const text=d.text.replace(/[A-Z ]/g,'').slice(0,5)||'音楽の庭';
   ctx.font='900 .20px sans-serif';
   [...text].forEach((letter,j)=>ctx.fillText(letter,.5,.17+j*.15,.78));
   ctx.fillRect(.18,.91,.64,.018);
  }else{
   // Large pictogram, short Japanese brand, restrained secondary line.
   ctx.fillStyle=fg;
   if(/薬|DRUG|クリニック|眼科/.test(d.text)){ctx.fillRect(.12,.18,.12,.28);ctx.fillRect(.06,.27,.24,.10);}
   else if(/不動産/.test(d.text)){ctx.beginPath();ctx.moveTo(.07,.40);ctx.lineTo(.18,.17);ctx.lineTo(.30,.40);ctx.fill();ctx.fillRect(.12,.37,.12,.11);}
   else if(/珈琲|CAFE|ラーメン|DINER/.test(d.text)){ctx.beginPath();ctx.ellipse(.18,.31,.115,.15,0,0,Math.PI*2);ctx.fill();}
   else {ctx.font='900 .34px sans-serif';ctx.fillText(/銀行/.test(d.text)?'¥':/書店|BOOKS/.test(d.text)?'本':'●',.18,.32,.25);}
   ctx.font='700 .29px sans-serif';ctx.fillText(d.text,.63,.36,.65);
   ctx.font='500 .12px sans-serif';ctx.fillText(['渋谷駅前店','暮らしを、もっと。','SHIBUYA TOKYO','毎日を楽しもう'][i%4],.5,.75,.80);

  }
  ctx.restore();
 }return entries;
}
export function paintScreen(ctx,w,h){
 ctx.fillStyle='#14275b';ctx.fillRect(0,0,w,h);
 for(let y=0;y<h;y+=3){ctx.fillStyle=y%6===0?'#253c79':'#101f52';ctx.fillRect(0,y,w,1);}
 ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillStyle='#385edb';ctx.fillRect(0,h*.08,w,h*.2);
 ctx.fillStyle='#fff5cf';ctx.font=`bold ${h*.075}px sans-serif`;ctx.fillText('アオゾラねっと',w*.46,h*.16,w*.8);
 ctx.font=`bold ${h*.032}px sans-serif`;ctx.fillText('AOZORA NET — 渋谷をつなぐ',w*.5,h*.235,w*.9);
 ctx.fillStyle='#65d6f5';ctx.fillRect(0,h*.4,w,h*.42);
 ctx.fillStyle='#163b52';ctx.font=`bold ${h*.105}px sans-serif`;ctx.fillText('fenn.chat',w*.53,h*.59,w*.8);
 ctx.fillStyle='#efffff';ctx.fillRect(w*.39,h*.7,w*.25,h*.035);
 ctx.fillStyle='#b9edff';ctx.font=`bold ${h*.026}px sans-serif`;ctx.fillText('SHIBUYA  •  HARAJUKU  •  TOKYO  •  SHIBUYA',w*.5,h*.88,w*.95);
}
export function createSignAtlases({tier='medium',maxTextureSize=4096,canvasFactory}={}){const q=QUALITY[tier];if(!q)throw Error('Unknown signs tier');if(!(maxTextureSize>=128))throw Error('GPU texture limit too small');const cap=2**Math.floor(Math.log2(maxTextureSize)),size=Math.min(q.atlas,cap),screenWidth=Math.min(q.screen,cap),count=q.variants;
 const make=(w,h,paint)=>{const canvas=canvasFactory?canvasFactory():typeof document!=='undefined'?document.createElement('canvas'):null;let texture,mode;if(canvas){canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Sign Canvas 2D unavailable');paint(ctx,w,h);texture=new CanvasTexture(canvas);mode='canvas';}else{texture=new DataTexture(new Uint8Array([255,255,255,255]),1,1,RGBAFormat);mode='cpu-placeholder';}texture.colorSpace=SRGBColorSpace;texture.minFilter=LinearFilter;texture.magFilter=LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return {texture,mode};};
 const city=make(size,size,(c,w)=>paintCity(c,w,count)),screen=make(screenWidth,screenWidth/2,paintScreen);let disposed=false;return {city,screen,entries:atlasEntries(size,count),definitions:definitions(count),size,screenWidth,count,dispose(){if(disposed)return;disposed=true;city.texture.dispose();screen.texture.dispose();}};
}
