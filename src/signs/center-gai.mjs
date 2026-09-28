import {Group,Mesh,BoxGeometry,PlaneGeometry,MeshStandardMaterial,CanvasTexture,DataTexture,SRGBColorSpace,BufferGeometry,Float32BufferAttribute,LineSegments,LineBasicMaterial,TubeGeometry,CatmullRomCurve3,Vector3} from 'three';
import {merge} from '../geo/geometry.mjs';
import {REAL_BRANDS,paintRealBrand} from './real-brands.mjs';

// Surveyed alley-facing edges, not the road-facing facade chosen by generic signage.
export const CENTER_FACADES=[
 {id:'way/136690966',a:[-58.88,-55.94],b:[-32.22,-29.27],normal:[.707,-.707],top:24.25,columns:3,stairs:true},
 {id:'way/1233446448',a:[-31.29,-44.25],b:[-37.98,-49.60],normal:[-.625,.781],top:9.35,columns:1},
 {id:'way/136691389',a:[-40.92,-52.03],b:[-57.50,-68.95],normal:[-.714,.700],top:24.35,columns:2}
];
export const CENTER_ADS=[
 ['英会話 NEKON','ネコン英会話 5F','#fffaf5','#456ed9','speech'],
 ['ぴょんモバイル','PYON MOBILE 6G ¥980','#345bec','#fff3b6','phone'],
 ['サクラ美容外科','SAKURA CLINIC 6F','#f9c7de','#fffbed','flower'],
 ['ふわふわ生','FUWA FUWA BEER','#ef493b','#fff0a8','beer'],
 ['ひとみ眼科','EYE CLINIC / 3F','#fffdf5','#73d69d','cross'],
 ['おおもり堂','古書 BOOKS','#fff8ef','#ec716e','book'],
 ['メガネのニャン','GLASSES 2F','#f5f4ff','#6a84d8','glasses'],
 ['ラーメンスター','24H 営業中','#ffe78a','#e98c4c','bowl'],
 ['渋谷センター街','バスケットボールストリート','#f8d25e','#26343c','gate'],
 ['フロア案内','FLOOR GUIDE','#eeeadd','#354352','directory'],
 ['しごとネコ','求人 さがすなら','#5983d7','#fffdf0','paw'],
 ['サウナ極','男・女 24H','#173640','#ffdf8a','steam'],
 ['ひかり薬局','PHARMACY 1F','#f27648','#fff9ed','vertical'],
 ['ピタッとシップ','毎日を、軽やかに。','#77cba7','#fffdf0','split'],
 ['にゃんPay','次世代のおサイフ','#f28e93','#fff9f0','pay'],
 ['LIVE SHIBUYA','LIVE・フェス・配信','#202b41','#fff9ed','live'],
 ['PachiPachi','パチパチ / 2F','#fff1b4','#bd9241','star'],
 ['ぷるぷる','PURU PURU COSME','#efacd4','#fffbed','drop'],
 ['MEOW MART','あなたの街のマーケット','#b9dce8','#fff4b7','market'],
 ['茶房 こもれび','MATCHA & COFFEE / 3F','#267b68','#fff3cf','tea'],
 ['ねこ銀行','NEKO BANK','#fffaf4','#e96e79','bank'],
 ['住みねこ不動産','お部屋さがし 3F','#82d8a4','#fffdec','house'],
 ['NC','NC CARD','#fffdf8','#648be0','card'],
 ['のどスッキリ','のど飴ダイレクト','#ef665b','#fff9ed','pill'],
 ['MOCHI HADA','もち肌スキンケア','#fff6f5','#f7b9d8','mochi'],
 ['fenn.chat','chat with your world','#61d5f4','#17405a','chat'],
 ['にじいろサウンド','MUSIC / LIVE / SHIBUYA','#c845dc','#fff8ed','rainbow'],
 ['Q F R O N T','','#08131e','#ffffff','qfront'],
 ['Coca-Cola','','#d41422','#fff8ee','coca'],
 ...REAL_BRANDS
];
export function centerGaiLayout(){const signs=[];for(const [bi,f] of CENTER_FACADES.entries()){
 const dx=f.b[0]-f.a[0],dz=f.b[1]-f.a[1],length=Math.hypot(dx,dz),t=[dx/length,dz/length],heading=Math.atan2(f.normal[0],f.normal[1]);
 const at=(along,y,out=.65)=>[f.a[0]+t[0]*along+f.normal[0]*out,y,f.a[1]+t[1]*along+f.normal[1]*out];
 // Dedicated directory column is separate from the large advertisements.
 const rows=f.top>15?3:1,usable=length-(f.stairs?9:1.4),start=f.stairs?8:0;
 for(let r=0;r<rows;r++)for(let c=0;c<f.columns;c++){const variant=[[0,1,2,3,4,5,6,7,10],[12],[13,14,2,6,0,7]][bi][r*f.columns+c];signs.push({building:f.id,kind:'advert',variant,position:at(start+(c+.5)*usable/f.columns,5.4+r*5.3),heading,width:Math.min(6.8,usable/f.columns*.8),height:variant===12?5.6:variant===2?4.2:3.7});}
 signs.push({building:f.id,kind:'directory',variant:9,position:at(length-.75,Math.min(11,f.top*.55),.48),heading,width:1.15,height:Math.min(12,f.top-2)});
 signs.push({building:f.id,kind:'roof',variant:bi===0?11:bi===1?14:15,position:at(length*.6,f.top+2.5,-1),heading,width:Math.min(9,length*.65),height:3.8});
 }
 const front={a:[-38.55,-23.48],b:[-66.75,-20.45]},dx=front.b[0]-front.a[0],dz=front.b[1]-front.a[1],length=Math.hypot(dx,dz),normal=[dz/length,-dx/length];
 for(let i=0;i<4;i++){const u=(i%2+.5)*length/2;signs.push({building:'way/136690966',kind:'advert',variant:12+i,position:[front.a[0]+dx/length*u+normal[0]*.9,7+Math.floor(i/2)*6,front.a[1]+dz/length*u+normal[1]*.9],heading:Math.atan2(normal[0],normal[1]),width:i===0?3.2:8.2,height:4.6});}
 const entranceRoof=signs.find(s=>s.building==='way/136690966'&&s.kind==='roof');entranceRoof.position=[-51,26.75,-23.3];entranceRoof.heading=Math.atan2(normal[0],normal[1]);
 for(let i=0;i<3;i++){const u=(i+.5)*length/3;signs.push({building:'way/136690966',kind:'advert',variant:16+i,position:[front.a[0]+dx/length*u+normal[0]*.9,19.2,front.a[1]+dz/length*u+normal[1]*.9],heading:Math.atan2(normal[0],normal[1]),width:7.5,height:3.7});}
 signs.push({building:'way/136690966',kind:'advert',variant:19,position:[-34.7,12,-25.7],heading:Math.atan2(.675,.738),width:4.8,height:6.2});
 // Reallocate two alley businesses to the crossing-facing 3 x 3 display, never duplicate them.
 const frontVariants=[12,13,0,14,15,10,16,17,18];
 for(const [i,variant]of frontVariants.entries()){const s=signs.find(s=>s.building==='way/136690966'&&s.variant===variant),u=(i%3+.5)*length/3;s.position=[front.a[0]+dx/length*u+normal[0]*.9,7+Math.floor(i/3)*6,front.a[1]+dz/length*u+normal[1]*.9];s.heading=Math.atan2(normal[0],normal[1]);s.width=variant===12?3.2:7.6;s.height=4.5;}
 const directory=signs.find(s=>s.building==='way/136690966'&&s.kind==='directory');directory.position=[-32.4,12,-27.4];directory.heading=Math.atan2(.675,.738);
 const wall={a:[5.897,-49.047],b:[-30.173,-59.968],normal:[-.28977,.95710]},wx=wall.b[0]-wall.a[0],wz=wall.b[1]-wall.a[1],wl=Math.hypot(wx,wz),wh=Math.atan2(...wall.normal),variants=[0,1,2,3,4,5,6,7,10,13,14,15];
 for(let i=0;i<14;i++){const roof=i>=12,u=roof?(i-11.5)*wl/2:(i%4+.5)*wl/4;signs.push({building:'way/55896465',kind:roof?'roof':'advert',variant:roof?[16,18][i-12]:variants[i],position:[wall.a[0]+wx*u/wl+wall.normal[0]*.8,roof?32.4:10+Math.floor(i/4)*6,wall.a[1]+wz*u/wl+wall.normal[1]*.8],heading:wh,width:roof?10:8,height:roof?3.8:4.8});}
 // East-facing walls visible beside the main QFRONT screen; leave cafe glazing untouched.
 for(const f of [
 {building:'way/55896465',a:[15.719622,-90.703121],b:[5.897120,-49.047368],normal:[.973307,.229508],columns:5,rows:3,bottom:13,pitch:5.7,height:4.95}
 ]){
 const dx=f.b[0]-f.a[0],dz=f.b[1]-f.a[1],length=Math.hypot(dx,dz),variants=[24,3,1,21,0,4,22,10,17,20,13,23,6,14,7];
 for(let row=0;row<f.rows;row++)for(let col=0;col<f.columns;col++){const u=(col+.5)/f.columns;signs.push({building:f.building,surface:'east',kind:'advert',variant:variants[row*f.columns+col],position:[f.a[0]+dx*u+f.normal[0]*.62,f.bottom+row*f.pitch,f.a[1]+dz*u+f.normal[1]*.62],heading:Math.atan2(...f.normal),width:length/f.columns-.45,height:f.height});}
 }
 // Crossing-facing blank faces requested in the September 14 annotated view.
 const wallAt=(f,u,y,out=.72)=>[f.a[0]+(f.b[0]-f.a[0])*u+f.normal[0]*out,y,f.a[1]+(f.b[1]-f.a[1])*u+f.normal[1]*out];
 const foreground={a:[-63.430214,9.373101],b:[-46.353892,9.940831],normal:[.033228,-.999448]};
 for(const s of [{variant:25,y:24.2,width:13.9,height:18.5},{variant:20,y:10.6,width:13.4,height:6.1},{variant:1,y:5.25,width:13.4,height:3.6}])signs.push({building:'way/60739635',surface:'north-feature',kind:'advert',variant:s.variant,position:wallAt(foreground,.5,s.y),heading:Math.atan2(...foreground.normal),width:s.width,height:s.height});
 const rearFaces=[
 {a:[-68.359555,-47.533423],b:[-71.045819,-19.514307],normal:[.995436,.095435],surface:'east-crossing',columns:3},
 {a:[-71.045819,-19.514307],b:[-94.797102,-21.963336],normal:[-.10257,.994725],surface:'south-crossing',columns:3}
 ];
 for(const f of rearFaces){const width=Math.hypot(f.b[0]-f.a[0],f.b[1]-f.a[1])/f.columns-.6,variants=[13,24,3,1,20,0,17,4,21,22,10,23,6,14,7];for(let row=0;row<5;row++)for(let col=0;col<f.columns;col++)signs.push({building:'way/114755219',surface:f.surface,kind:'advert',variant:variants[row*f.columns+col],position:wallAt(f,(col+.5)/f.columns,6.5+row*6.8),heading:Math.atan2(...f.normal),width,height:5.8});}
 for(const s of [{p:[-47,27.4,-34],variant:15,width:9},{p:[-53,28,-44],variant:26,width:8.4},{p:[-60.5,27.2,-35],variant:21,width:7}])signs.push({building:'way/136690966',surface:'roof-rear',kind:'roof',variant:s.variant,position:s.p,heading:.107,width:s.width,height:3.8});
 signs.push({building:'way/136691386',surface:'crown',kind:'advert',variant:27,position:[-8,40.2,-29.3],heading:.1589,width:9.5,height:2.2});
 // The rooftop drink brand is owned by the reference advertisement layer, which stands it
 // on a real roof instead of floating it at a fixed height above QFRONT.
 // First reference-brand pass reuses two existing rooftop supports. Host positions
 // are provisional and deliberately identified for the next placement audit.
 const roofSlots=signs.filter(s=>s.surface==='roof-rear'),brandSlots=[roofSlots[2],roofSlots[0]];
 for(const [i,variant] of [29,30].entries()){const s=brandSlots[i];s.variant=variant;s.width=6.4;s.height=6.4;s.position[1]+=1.3;s.referencePlacement='provisional-existing-slot';}
 return signs;}

function atlas(factory){const canvas=factory?factory():typeof document!=='undefined'?document.createElement('canvas'):null;
 if(!canvas){const t=new DataTexture(new Uint8Array([255,255,255,255]),1,1);t.needsUpdate=true;return t;}
 canvas.width=2048;canvas.height=Math.ceil(CENTER_ADS.length/4)*512;const c=canvas.getContext('2d');
 CENTER_ADS.forEach(([title,sub,bg,fg,style],i)=>{
  const x=i%4*512,y=Math.floor(i/4)*512;c.save();c.translate(x,y);c.fillStyle=bg;c.fillRect(0,0,512,512);c.fillStyle=fg;c.strokeStyle=fg;c.lineWidth=12;c.textAlign='center';c.textBaseline='middle';
  const text=(value,size,px,py,width=470)=>{c.font=`bold ${size}px "Yu Gothic","Meiryo",sans-serif`;c.fillText(value,px,py,width);};
  const circle=(cx,cy,r)=>{c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fill();};
  if(paintRealBrand(c,style)){c.restore();return;}
  // Artwork uses a different icon, composition and colour treatment for each business.
  if(style==='coca'){c.font='italic bold 210px "Brush Script MT","Segoe Script",cursive';c.fillText('Coca-Cola',230,252,410);c.strokeStyle=fg;c.lineWidth=9;c.beginPath();c.moveTo(55,333);c.bezierCurveTo(160,282,340,375,457,306);c.stroke();c.restore();return;}
  if(style==='qfront'){text(title,91,256,256,470);c.restore();return;}
  if(style==='directory'){for(let row=0;row<6;row++){c.fillStyle=['#d8f2e5','#fff1c7','#efd7e9','#dce5fc','#f5d8d1','#def2f0'][row];c.fillRect(12,12+row*82,488,75);c.fillStyle='#37414a';text(['6F 歯科','5F 英会話','4F 音楽','3F 喫茶','2F 眼鏡','1F 食堂'][row],46,256,51+row*82);}c.restore();return;}
  if(style==='gate'){c.scale(1,5.23);c.fillStyle='#262e3c';c.fillRect(260,0,252,98);c.fillStyle='#f9d164';circle(260,49,18);c.strokeStyle='#26343c';c.lineWidth=1;c.beginPath();c.moveTo(242,49);c.lineTo(278,49);c.moveTo(260,31);c.lineTo(260,67);c.stroke();c.fillStyle='#25313a';text('渋谷センター街',23,126,32,222);text('CENTER GAI',16,126,66,216);c.fillStyle='#fff4c8';text('バスケットボール',20,389,32,210);text('STREET / SHIBUYA',12,389,66,202);c.restore();return;}
  if(style==='split'){c.fillStyle='#f7bdd7';c.fillRect(0,0,512,253);c.fillStyle='#fffbed';circle(112,256,76);text('ピタッと',75,328,170,305);text('シップ',92,328,335,310);}
  else if(style==='vertical'){text('ひ',105,256,82);text('か',105,256,185);text('り',105,256,288);text('薬局',80,256,399);}
  else if(style==='live'){c.save();c.translate(256,210);c.rotate(-.09);text(title,67,0,0);c.restore();c.fillStyle='#e6a5d0';c.fillRect(45,326,420,62);c.fillStyle='#202b41';text('TICKETS ON SALE',34,256,358);text(sub,27,256,452);}
  else{
   const cx=105,cy=192;
   if(style==='star'){c.beginPath();for(let j=0;j<10;j++){const a=j*Math.PI/5-Math.PI/2,r=j%2?35:85;c.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}c.closePath();c.fill();}
   if(style==='drop'){c.beginPath();c.moveTo(cx,97);c.bezierCurveTo(235,259,120,320,60,255);c.bezierCurveTo(23,212,70,149,cx,97);c.fill();}
   if(style==='market'){c.fillRect(32,147,148,118);for(let j=0;j<5;j++)circle(47+j*29,147,18);c.fillStyle=bg;c.fillRect(87,208,39,57);c.fillStyle=fg;}
   if(style==='tea'){c.fillRect(35,166,125,92);c.strokeRect(159,179,31,54);text('茶',85,103,116);}
   if(style==='chat'){c.fillStyle='#f8ffff';c.beginPath();c.roundRect(29,131,145,143,48);c.fill();c.fillStyle=fg;circle(75,194,10);circle(125,194,10);}
   if(style==='rainbow'){c.lineWidth=17;['#ffd98c','#aef2e4','#b8bdff'].forEach((color,j)=>{c.strokeStyle=color;c.beginPath();c.arc(105,240,87-j*22,Math.PI,Math.PI*2);c.stroke();});c.fillStyle=fg;}
   if(style==='bank')text('¥',176,cx,195);
   if(style==='house'){c.beginPath();c.moveTo(16,177);c.lineTo(104,87);c.lineTo(195,177);c.closePath();c.fill();c.fillRect(42,172,126,129);c.fillStyle=bg;c.fillRect(88,217,35,84);c.fillStyle=fg;}
   if(style==='card'){c.fillStyle='#79a8ed';circle(70,196,57);c.fillStyle='#f47c89';circle(139,196,57);c.fillStyle=fg;}
   if(style==='pill'){c.save();c.translate(cx,195);c.rotate(-.45);c.beginPath();c.roundRect(-84,-42,168,84,42);c.fill();c.strokeStyle=bg;c.lineWidth=7;c.beginPath();c.moveTo(0,-33);c.lineTo(0,33);c.stroke();c.restore();}
   if(style==='mochi'){circle(cx,206,69);c.fillStyle=bg;circle(cx-15,190,10);c.fillStyle=fg;}
   if(style==='phone'){c.strokeRect(47,101,115,192);c.fillRect(77,269,55,9);}
   if(style==='speech'||style==='pay'){c.fillStyle=style==='speech'?'#ee7272':fg;c.beginPath();c.roundRect(28,126,144,137,24);c.fill();c.beginPath();c.moveTo(57,256);c.lineTo(39,298);c.lineTo(101,257);c.fill();c.fillStyle=bg;text(style==='speech'?'A':'¥',96,100,196);c.fillStyle=fg;}
   if(style==='cross'){c.fillRect(77,108,56,176);c.fillRect(25,168,160,56);}
   if(style==='flower'){for(let j=0;j<5;j++)circle(cx+Math.cos(j*Math.PI*.4)*48,cy+Math.sin(j*Math.PI*.4)*48,33);c.fillStyle=bg;circle(cx,cy,20);c.fillStyle=fg;}
   if(style==='beer'){c.fillRect(39,144,99,141);c.strokeRect(129,172,43,80);for(let j=0;j<4;j++)circle(52+j*25,143,23);}
   if(style==='book'){c.beginPath();c.moveTo(25,131);c.quadraticCurveTo(71,107,99,137);c.lineTo(99,286);c.quadraticCurveTo(62,255,25,273);c.fill();c.beginPath();c.moveTo(108,137);c.quadraticCurveTo(147,110,182,130);c.lineTo(182,273);c.quadraticCurveTo(142,256,108,286);c.fill();}
   if(style==='glasses'){for(const px of [60,151]){c.beginPath();c.ellipse(px,196,43,65,0,0,Math.PI*2);c.stroke();}c.beginPath();c.moveTo(103,185);c.lineTo(108,185);c.stroke();}
   if(style==='bowl'){c.beginPath();c.arc(cx,213,79,0,Math.PI);c.fill();for(let j=0;j<3;j++){c.beginPath();c.moveTo(62+j*40,166);c.bezierCurveTo(45+j*40,142,83+j*40,119,65+j*40,86);c.stroke();}}
   if(style==='paw'){circle(cx,221,47);for(let j=0;j<4;j++)circle(47+j*38,153-Math.sin(j/3*Math.PI)*22,20);}
   if(style==='steam'){for(let j=0;j<3;j++){c.beginPath();c.moveTo(56+j*47,273);c.bezierCurveTo(5+j*47,224,103+j*47,190,56+j*47,121);c.stroke();}c.strokeStyle='#aeeef5';c.lineWidth=5;c.strokeRect(9,9,494,494);}
   text(title,style==='speech'?55:61,344,204,303);text(sub,style==='phone'?39:34,268,376,460);
  }
  c.restore();
 });
 const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
}
export function buildCenterGai(options={}){
 const root=new Group();root.name='center-gai-polish';const texture=atlas(options.canvasFactory),materials={frame:new MeshStandardMaterial({color:0x293338,roughness:.65}),cream:new MeshStandardMaterial({color:0xdeddd2,roughness:.6}),sign:new MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:.18,roughness:.7}),light:new MeshStandardMaterial({color:0xffedc5,emissive:0xffdfa2,emissiveIntensity:.12}),rim:new MeshStandardMaterial({color:0xaff5ff,emissive:0x77eaff,emissiveIntensity:.12})};
 const batches={frame:[],cream:[],sign:[],light:[],rim:[]},wires=[];const box=(channel,p,size,h=0)=>{const g=new BoxGeometry(...size);g.rotateY(h);g.translate(...p);batches[channel].push(g);};
 const sign=(s)=>{box('frame',s.position,[s.width+.16,s.height+.16,.22],s.heading);const g=new PlaneGeometry(s.width,s.height),uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(s.variant%4+(.02+.96*uv.getX(i)))/4,1-(Math.floor(s.variant/4)+(.98-.96*uv.getY(i)))/Math.ceil(CENTER_ADS.length/4));g.rotateY(s.heading);g.translate(s.position[0]+Math.sin(s.heading)*.13,s.position[1],s.position[2]+Math.cos(s.heading)*.13);batches.sign.push(g);};
 // Centre-gai lays its own signs on hardcoded facades, outside the sign model and so
 // outside the reference layer's clearing. Anything of its own that crosses a reference
 // advertisement in the frame is filtered here, by the same rule and for the same reason.
 const layout=(options.clearFor?options.clearFor(centerGaiLayout()):centerGaiLayout());layout.forEach(sign);
 // Bright physical fixtures, not a global exposure increase: readable ads retain colour.
 for(const s of layout.filter(s=>s.kind==='roof')){const point=(x,y)=>[s.position[0]+Math.cos(s.heading)*x+Math.sin(s.heading)*.2,s.position[1]+y,s.position[2]-Math.sin(s.heading)*x+Math.cos(s.heading)*.2];for(const y of [-s.height/2,s.height/2])box('rim',point(0,y),[s.width+.14,.09,.1],s.heading);for(const x of [-s.width/2,s.width/2])box('rim',point(x,0),[.09,s.height,.1],s.heading);}
 for(const [a,b] of [[[-38.55,-23.48],[-66.75,-20.45]],[[-32.22,-29.27],[-38.55,-23.48]]]){const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=dz/len,nz=-dx/len,h=Math.atan2(nx,nz),count=Math.floor(len/2.5);for(let i=0;i<count;i++){const u=(i+.5)/count,p=[a[0]+dx*u+nx*.75,1.8,a[1]+dz*u+nz*.75];box('frame',p,[len/count-.1,3.1,.2],h);box('light',[p[0]+nx*.13,1.8,p[2]+nz*.13],[len/count-.28,2.65,.08],h);box('frame',[p[0]+nx*.2,1.8,p[2]+nz*.2],[.065,2.65,.09],h);box('cream',[p[0],3.5,p[2]],[len/count,.22,.6],h);}}
 for(const s of layout.filter(s=>s.kind==='roof'))for(const x of [-s.width*.35,s.width*.35]){box('frame',[s.position[0]+Math.cos(s.heading)*x,s.position[1]-2.3,s.position[2]-Math.sin(s.heading)*x],[.13,5,.13]);}
 // Entrance legs sit at the sides of the mapped pedestrian corridor; all overhead work clears 5 m.
 const gate=[-32,-36.4],side=[.718,-.696],front=[.696,.718],heading=Math.atan2(front[0],front[1]);
 for(const k of [-1,1]){const pts=[[side[0]*4*k,0,side[1]*4*k],[side[0]*4*k,4.5,side[1]*4*k],[side[0]*3.4*k,6.8,side[1]*3.4*k]].map(p=>new Vector3(gate[0]+p[0],p[1]+.2,gate[1]+p[2]));batches.cream.push(new TubeGeometry(new CatmullRomCurve3(pts),16,.16,8,false));}
 sign({variant:8,position:[...gate.slice(0,1),6.35,gate[1]],heading,width:6.8,height:1.3});
 // Zig-zag external escape stair and landings, following the long blank alley wall.
 const f=CENTER_FACADES[0],dx=f.b[0]-f.a[0],dz=f.b[1]-f.a[1],len=Math.hypot(dx,dz),t=[dx/len,dz/len],h=Math.atan2(f.normal[0],f.normal[1]);
 const at=(u,y,n)=>[f.a[0]+t[0]*u+f.normal[0]*n,y,f.a[1]+t[1]*u+f.normal[1]*n];
 for(let level=0;level<5;level++){
  for(let step=0;step<14;step++){const u=1+(level%2?13-step:step)*.32,y=.4+level*3.4+step*.243;box('frame',at(u,y,1.1),[.36,.09,1.15],h);box('frame',at(u,y+.52,1.66),[.04,1.1,.04],h);}
  box('frame',at(level%2?1:5.2,3.8+level*3.4,1.1),[1.3,.15,1.2],h);
 }
 // Sagging overhead utility bundles, well above the walking surface.
 for(let bundle=0;bundle<4;bundle++)for(let strand=0;strand<3;strand++){
  const u=8+bundle*7,p=at(u,8.2+strand*.22,.2),q=[p[0]+f.normal[0]*8.3,p[1]+.8,p[2]+f.normal[1]*8.3];
  let prev=p;for(let i=1;i<=16;i++){const a=i/16,next=[p[0]+(q[0]-p[0])*a,p[1]+(q[1]-p[1])*a-1.05*Math.sin(Math.PI*a),p[2]+(q[2]-p[2])*a];wires.push(...prev,...next);prev=next;}
 }
 const geometries=[];for(const [channel,list]of Object.entries(batches)){const g=merge(list);list.forEach(g=>g.dispose());geometries.push(g);const mesh=new Mesh(g,materials[channel]);mesh.name=channel==='sign'?'center-gai-advertisements':'center-gai-'+channel;root.add(mesh);}
 const wireGeometry=new BufferGeometry();wireGeometry.setAttribute('position',new Float32BufferAttribute(wires,3));const wireMaterial=new LineBasicMaterial({color:0x171d24});root.add(new LineSegments(wireGeometry,wireMaterial));
 return {root,layout,stats:{advertisements:layout.length,arches:1,stairFlights:5,cableBundles:4,batches:6},dispose(){root.removeFromParent();geometries.forEach(g=>g.dispose());wireGeometry.dispose();wireMaterial.dispose();Object.values(materials).forEach(m=>m.dispose());texture.dispose();root.clear();}};
}
