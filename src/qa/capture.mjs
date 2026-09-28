export const QA_CAPTURES=Object.freeze([
 {camera:'overview',time:'day',file:'overview-day.png'},
 {camera:'overview',time:'night',file:'overview-night.png'},
 {camera:'street',time:'day',file:'scramble-street-day.png'},
 {camera:'street',time:'night',file:'scramble-street-night.png'},
 {camera:'qfront',time:'night',file:'qfront-night.png'},
 {camera:'scramble',time:'day',file:'scramble-high-day.png'},
 {camera:'scramble',time:'night',file:'scramble-high-night.png'},
 {camera:'center-gai',time:'day',file:'center-gai-day.png'},
 {camera:'center-gai',time:'night',file:'center-gai-night.png'}
]);

export const publicCameraName=id=>id==='street'?'scramble-street':id;

export function canvasToPng(canvas){
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Canvas PNG capture failed')),'image/png'));
}

const encoder=new TextEncoder();
const table=(()=>{const values=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;values[n]=c>>>0;}return values;})();
export function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function dosDateTime(date){const year=Math.max(1980,date.getFullYear());return {time:(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1),date:((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate()};}
function part(size,write){const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);write(view,bytes);return bytes;}
function join(chunks){const result=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;}

export async function createZip(files){
 const local=[],central=[];let offset=0;const stamp=dosDateTime(new Date());
 for(const file of files){const name=encoder.encode(file.name),data=new Uint8Array(await file.blob.arrayBuffer()),crc=crc32(data);
  const header=part(30+name.length,(v,b)=>{v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(8,0,true);v.setUint16(10,stamp.time,true);v.setUint16(12,stamp.date,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);v.setUint16(28,0,true);b.set(name,30);});
  local.push(header,data);const entry=part(46+name.length,(v,b)=>{v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x0800,true);v.setUint16(10,0,true);v.setUint16(12,stamp.time,true);v.setUint16(14,stamp.date,true);v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,name.length,true);v.setUint16(30,0,true);v.setUint16(32,0,true);v.setUint16(34,0,true);v.setUint16(36,0,true);v.setUint32(38,0,true);v.setUint32(42,offset,true);b.set(name,46);});central.push(entry);offset+=header.length+data.length;
 }
 const directory=join(central),end=part(22,v=>{v.setUint32(0,0x06054b50,true);v.setUint16(4,0,true);v.setUint16(6,0,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,directory.length,true);v.setUint32(16,offset,true);v.setUint16(20,0,true);});
 return new Blob([...local,directory,end],{type:'application/zip'});
}

export function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export async function createQAPack(captures,metrics){
 const files=captures.map(c=>({name:`shibuya-qa-pack/${c.file}`,blob:c.blob}));
 files.push({name:'shibuya-qa-pack/metrics.json',blob:new Blob([JSON.stringify(metrics,null,2)+'\n'],{type:'application/json'})});
 return {files,zip:await createZip(files)};
}
