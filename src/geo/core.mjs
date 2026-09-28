/** Local metric convention: [x,z], +X east, -Z north; y is metres up. */
export const ORIGIN=Object.freeze({lat:35.6595,lon:139.7005});
const R=6378137,DEG=Math.PI/180,EPS=1e-8;
export function project(lon,lat,origin=ORIGIN){if(![lon,lat,origin.lon,origin.lat].every(Number.isFinite)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Invalid longitude/latitude');return [(lon-origin.lon)*DEG*R*Math.cos(origin.lat*DEG),-(lat-origin.lat)*DEG*R];}
export function unproject([x,z],origin=ORIGIN){return {lon:origin.lon+x/(DEG*R*Math.cos(origin.lat*DEG)),lat:origin.lat-z/(DEG*R)};}
export const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function cleanLine(points){if(!Array.isArray(points)||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw Error('Invalid points');return points.filter((p,i)=>!i||distance(p,points[i-1])>EPS).map(p=>[...p]);}
export function length(points){const p=cleanLine(points);let total=0;for(let i=1;i<p.length;i++)total+=distance(p[i-1],p[i]);return total;}
export function sample(points,d){const p=cleanLine(points);if(p.length<2||!Number.isFinite(d))throw Error('Line needs two distinct points and finite distance');let remain=Math.max(0,Math.min(d,length(p)));for(let i=1;i<p.length;i++){const l=distance(p[i-1],p[i]);if(remain<=l||i===p.length-1){const tangent=[(p[i][0]-p[i-1][0])/l,(p[i][1]-p[i-1][1])/l];return {point:[p[i-1][0]+tangent[0]*remain,p[i-1][1]+tangent[1]*remain],tangent,heading:Math.atan2(tangent[0],tangent[1]),segment:i-1};}remain-=l;}}
export function resample(points,spacing){if(!Number.isFinite(spacing)||spacing<=0)throw Error('Positive spacing required');const total=length(points),out=[];if(total===0)throw Error('Degenerate line');for(let d=0;d<total;d+=spacing)out.push(sample(points,d).point);out.push(sample(points,total).point);return out;}
/** Positive distance is world-left (north when travelling east). Bounded miter. */
export function offset(points,amount,miterLimit=4){const p=cleanLine(points);if(p.length<2||!Number.isFinite(amount)||miterLimit<1)throw Error('Invalid offset');const normals=p.slice(1).map((b,i)=>{const a=p[i],l=distance(a,b);return [(b[1]-a[1])/l,-(b[0]-a[0])/l];});return p.map((v,i)=>{let n=normals[Math.min(i,normals.length-1)],scale=amount;if(i>0&&i<p.length-1){const a=normals[i-1],b=normals[i],sum=[a[0]+b[0],a[1]+b[1]],l=Math.hypot(...sum);if(l<EPS)n=b;else{n=sum.map(x=>x/l);const dot=n[0]*b[0]+n[1]*b[1];scale=Math.sign(amount)*Math.min(Math.abs(amount/dot),Math.abs(amount)*miterLimit);}}return [v[0]+n[0]*scale,v[1]+n[1]*scale];});}
export function extend(points,start,end=start){const p=cleanLine(points);if(p.length<2||![start,end].every(x=>Number.isFinite(x)&&x>=0))throw Error('Invalid extension');const a=sample(p,0).tangent,b=sample(p,length(p)).tangent;p[0]=p[0].map((v,i)=>v-a[i]*start);p[p.length-1]=p.at(-1).map((v,i)=>v+b[i]*end);return p;}
export function bounds(points){const p=cleanLine(points);if(!p.length)throw Error('Empty bounds');return {minX:Math.min(...p.map(v=>v[0])),maxX:Math.max(...p.map(v=>v[0])),minZ:Math.min(...p.map(v=>v[1])),maxZ:Math.max(...p.map(v=>v[1]))};}
export const overlaps=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
/** Liang–Barsky clipping returning disconnected parts separately. */
export function clipLine(points,b){const p=cleanLine(points),parts=[];let current=[];for(let i=1;i<p.length;i++){const a=p[i-1],v=p[i],dx=v[0]-a[0],dz=v[1]-a[1];let lo=0,hi=1,ok=true;const ps=[-dx,dx,-dz,dz],qs=[a[0]-b.minX,b.maxX-a[0],a[1]-b.minZ,b.maxZ-a[1]];for(let j=0;j<4;j++){if(Math.abs(ps[j])<EPS){if(qs[j]<0)ok=false;}else{const t=qs[j]/ps[j];if(ps[j]<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}}if(!ok||lo>hi){if(current.length>1)parts.push(current);current=[];continue;}const s=[a[0]+lo*dx,a[1]+lo*dz],e=[a[0]+hi*dx,a[1]+hi*dz];if(distance(s,e)<EPS)continue;if(current.length&&distance(current.at(-1),s)>EPS){parts.push(current);current=[];}if(!current.length)current.push(s);current.push(e);}if(current.length>1)parts.push(current);return parts;}
export function ring(points){const p=cleanLine(points);if(p.length>1&&distance(p[0],p.at(-1))<EPS)p.pop();if(p.length<3||Math.abs(signedArea(p))<EPS)throw Error('Degenerate polygon');return p;}
export function signedArea(p){return p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;}
function onSegment(p,a,b){const cross=(p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]);return Math.abs(cross)<EPS&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;}
export function inRing(p,points,boundary=true){return inPreparedRing(p,ring(points),boundary);}
/** Read-only winding test for already normalized clipping rings (open or closed). */
export function inPreparedRing(p,r,boundary=true){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if(onSegment(p,a,b))return boundary;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function inPolygon(p,polygon){return inRing(p,polygon.outer)&&!(polygon.holes??[]).some(h=>inRing(p,h));}
export function seededRandom(seed){let a=2166136261;for(const c of String(seed)){a^=c.charCodeAt(0);a=Math.imul(a,16777619);}return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export class SpatialIndex{
 constructor(cellSize=25){if(!Number.isFinite(cellSize)||cellSize<=0)throw Error('Invalid cell size');this.size=cellSize;this.cells=new Map();this.items=new Map();}
 keys(b){if(![b.minX,b.maxX,b.minZ,b.maxZ].every(Number.isFinite)||b.minX>b.maxX||b.minZ>b.maxZ)throw Error('Invalid bounds');const out=[];for(let x=Math.floor(b.minX/this.size);x<=Math.floor(b.maxX/this.size);x++)for(let z=Math.floor(b.minZ/this.size);z<=Math.floor(b.maxZ/this.size);z++)out.push(`${x},${z}`);return out;}
 insert(id,b,value){this.remove(id);const keys=this.keys(b);this.items.set(id,{bounds:{...b},value,keys});for(const k of keys){if(!this.cells.has(k))this.cells.set(k,new Set());this.cells.get(k).add(id);}return this;}
 remove(id){const item=this.items.get(id);if(!item)return;for(const k of item.keys){const c=this.cells.get(k);c.delete(id);if(!c.size)this.cells.delete(k);}this.items.delete(id);}
 query(b){const ids=new Set(this.keys(b).flatMap(k=>[...(this.cells.get(k)??[])]));return [...ids].filter(id=>overlaps(this.items.get(id).bounds,b)).map(id=>({id,value:this.items.get(id).value}));}
 clear(){this.cells.clear();this.items.clear();}
}
