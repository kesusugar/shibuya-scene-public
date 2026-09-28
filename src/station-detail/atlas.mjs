import {CanvasTexture,DataTexture,RGBAFormat,SRGBColorSpace,LinearFilter} from 'three';
/** Station-only original artwork. Static illustrative departures, no live claims. */
export const TILES=[
 ['station','SHIBUYA','渋谷 / JR', '#227851'],['departure','DEPARTURES','LOCAL  --:--','#162d37'],['wayfinding','EXIT  →','HACHIKO / WEST','#e9e5d7'],['metro','G','GINZA LINE','#edac33'],
 ['bus','BUS','STATION STOP','#397993'],['taxi','TAXI','WAIT HERE','#247761'],['map','AREA MAP','STATION / YOU ARE HERE','#e7e0ca'],['clock','12 : 00','STATION TIME / DEMO','#273944'],
 ['kiosk','INFORMATION','MAP / GUIDE','#537a81'],['vending','DRINKS','COLD / HOT','#c4473e'],['menu','MENU','NOODLES / RICE / TEA','#e5cf9d'],['izakaya','食事処','DINING / ORIGINAL','#803e30'],
 ['ramen','らーめん','NOODLE SHOP','#c89241'],['convenience','SHOP','DAILY GOODS','#4b9374'],['noren','めし','WELCOME','#264a68'],['police','KOBAN','POLICE / 交番','#33485e']
];
export const tileIndex=key=>{const i=TILES.findIndex(t=>t[0]===key);if(i<0)throw Error('Unknown station tile '+key);return i;};
export function paintAtlas(ctx,size=1024){const tile=size/4;ctx.textAlign='center';ctx.textBaseline='middle';for(let i=0;i<TILES.length;i++){const [key,title,subtitle,bg]=TILES[i],x=i%4*tile,y=Math.floor(i/4)*tile;ctx.fillStyle=bg;ctx.fillRect(x,y,tile,tile);ctx.fillStyle='#f3f2e9';ctx.fillRect(x+10,y+10,tile-20,5);ctx.fillStyle=['wayfinding','map','menu','ramen'].includes(key)?'#24323a':'#f6f3e7';ctx.font=`bold ${key==='metro'?92:27}px sans-serif`;ctx.fillText(title,x+tile/2,y+tile*.3,tile-24);ctx.font='16px sans-serif';ctx.fillText(subtitle,x+tile/2,y+tile*.51,tile-22);
 if(key==='vending'){for(let r=0;r<2;r++)for(let c=0;c<6;c++){ctx.fillStyle=['#e9c268','#76b5c4','#e6ede1'][c%3];ctx.fillRect(x+20+c*36,y+150+r*33,23,25);}}
 else if(key==='map'){ctx.strokeStyle='#7b9886';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(x+30,y+200);ctx.lineTo(x+220,y+180);ctx.moveTo(x+140,y+145);ctx.lineTo(x+130,y+231);ctx.stroke();ctx.fillStyle='#b9503a';ctx.fillRect(x+115,y+182,18,18);}
 else{ctx.fillStyle=key==='departure'?'#dbaa4e':'#c7cfbd';for(let r=0;r<3;r++)ctx.fillRect(x+25,y+164+r*18,tile-50-r*25,5);}
 }return {width:size,height:size,tiles:TILES.length};}
export function createStationAtlas(canvasFactory){const canvas=canvasFactory?.()??(typeof document!=='undefined'?document.createElement('canvas'):null);let texture,mode;if(canvas){canvas.width=canvas.height=1024;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Station atlas Canvas 2D unavailable');paintAtlas(ctx);texture=new CanvasTexture(canvas);mode='canvas';}else{texture=new DataTexture(new Uint8Array([255,255,255,255]),1,1,RGBAFormat);texture.needsUpdate=true;mode='cpu-placeholder';}texture.colorSpace=SRGBColorSpace;texture.minFilter=LinearFilter;texture.magFilter=LinearFilter;texture.generateMipmaps=false;return {texture,mode,tiles:TILES.length,dispose(){texture.dispose();}};}
/** UV inset prevents neighbouring station tiles bleeding on merged sign faces. */
export function atlasUV(key){const i=tileIndex(key),x=i%4,y=Math.floor(i/4),e=2/1024;return {u0:x/4+e,u1:(x+1)/4-e,v0:1-(y+1)/4+e,v1:1-y/4-e};}
