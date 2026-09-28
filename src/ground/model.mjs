import pc from 'polygon-clipping';
import {cleanLine,distance,length,sample,inPolygon,inPreparedRing,signedArea,SpatialIndex,bounds} from '../geo/core.mjs';
import {metric} from '../data/normalize.mjs';
import {GROUND as C} from './config.mjs';
export const union=(...p)=>p.filter(x=>x.length).length?pc.union(...p.filter(x=>x.length)):[];
export const intersection=(a,b)=>a.length&&b.length?pc.intersection(a,b):[];
export const difference=(a,b)=>!a.length?[]:b.length?pc.difference(a,b):a;
export const polygons=m=>m.map(p=>({outer:p[0].slice(0,-1),holes:p.slice(1).map(h=>h.slice(0,-1))}));
export function contains(m,p){for(const rings of m){if(!inPreparedRing(p,rings[0]))continue;let hole=false;for(let i=1;i<rings.length;i++)if(inPreparedRing(p,rings[i])){hole=true;break;}if(!hole)return true;}return false;}
export function area(m){let total=0;for(const rings of m){let holes=0;for(let i=1;i<rings.length;i++)holes+=Math.abs(signedArea(rings[i]));total+=Math.abs(signedArea(rings[0]))-holes;}return total;}
export function rect(a,b,width){const d=distance(a,b);if(d<1e-6)return [];const n=[-(b[1]-a[1])/d*width/2,(b[0]-a[0])/d*width/2];const r=[[a[0]+n[0],a[1]+n[1]],[b[0]+n[0],b[1]+n[1]],[b[0]-n[0],b[1]-n[1]],[a[0]-n[0],a[1]-n[1]]];return [[ [...r,r[0]] ]];}
export function buffer(points,width){if(!Number.isFinite(width)||width<=0)throw Error('Invalid road width');const p=cleanLine(points);if(p.length<2)return [];const pieces=[];for(let i=1;i<p.length;i++)pieces.push(rect(p[i-1],p[i],width));for(const v of p){const r=Array.from({length:12},(_,i)=>[v[0]+Math.cos(i*Math.PI/6)*width/2,v[1]+Math.sin(i*Math.PI/6)*width/2]);pieces.push([[ [...r,r[0]] ]]);}return union(...pieces);}
export function roadWidth(r){const w=metric(r.tags?.width??r.width);if(w>0)return w;const lanes=Number(r.tags?.lanes??r.lanes);if(lanes>0&&Number.isFinite(lanes))return lanes*3+1;return C.defaults[(r.highway??r.tags?.highway)?.replace(/_link$/,'')]??6.5;}
export function surface(r){const t=r.tags??{};return ![r.bridge,t.bridge,r.tunnel,t.tunnel].some(v=>v&&v!=='no')&&Number(r.layer??t.layer??0)===0&&Number(t.level??0)===0;}
export function marked(r){const t=r.tags??{};return surface(r)&&!['unmarked','informal','no'].includes(t.crossing)&&t['crossing:markings']!=='no'&&t.informal!=='yes';}
const limit=C.limit;export const CLIP=[[[[-limit,-limit],[limit,-limit],[limit,limit],[-limit,limit],[-limit,-limit]]]];
export const clipped=m=>intersection(m,CLIP);
export function nearest(point,lines){let best={distance:Infinity};for(const line of lines)for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],v=[b[0]-a[0],b[1]-a[1]],l=v[0]**2+v[1]**2;if(l<1e-12)continue;const t=Math.max(0,Math.min(1,((point[0]-a[0])*v[0]+(point[1]-a[1])*v[1])/l)),q=[a[0]+v[0]*t,a[1]+v[1]*t],d=distance(q,point);if(d<best.distance)best={distance:d,point:q,tangent:v.map(x=>x/Math.sqrt(l))};}return best;}
export function zebra(points,width,road){const out=[];for(let d=C.pitch/2;d+C.stripe/2<length(points);d+=C.pitch){const a=sample(points,d-C.stripe/2).point,b=sample(points,d+C.stripe/2).point,p=intersection(rect(a,b,width),road);if(area(p)>.01)out.push({distance:d,polygon:p});}return out;}
// Convex junction envelope is restricted to the mapped scramble crossing anchors.
function hull(points){const p=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);const half=points=>{const h=[];for(const v of points){while(h.length>1&&cross(h.at(-2),h.at(-1),v)<=0)h.pop();h.push(v);}return h.slice(0,-1);};const h=[...half(p),...half(p.reverse())];return [...h,h[0]];}
export function restoreGroundModel(model){return {...model,height:groundHeight(model.corridors,model.boundaries)};}
function groundHeight(corridors,boundaries){
 const corridorIndex=new SpatialIndex(10),edgeIndex=new SpatialIndex(10);polygons(corridors).forEach((p,i)=>corridorIndex.insert(i,bounds(p.outer),p));let edgeId=0;for(const r of boundaries)for(let i=1;i<r.length;i++)edgeIndex.insert(edgeId++,bounds([r[i-1],r[i]]),[r[i-1],r[i]]);
 const height=p=>{const box={minX:p[0]-C.rampDepth,maxX:p[0]+C.rampDepth,minZ:p[1]-C.rampDepth,maxZ:p[1]+C.rampDepth};if(!corridorIndex.query({minX:p[0],maxX:p[0],minZ:p[1],maxZ:p[1]}).some(v=>inPolygon(p,v.value)))return C.curb;return C.curb*Math.min(1,nearest(p,edgeIndex.query(box).map(v=>v.value)).distance/C.rampDepth);};
 return height;
}
export function buildGroundModel(data){const start=performance.now();const sources=data.roads.filter(surface);const strips=sources.map(r=>clipped(buffer(r.points,roadWidth(r)))).filter(p=>p.length);let roads=union(...strips);
 // Central OSM crossing envelope closes lane-split junction islands; no coordinate translation.
 const main=data.footways.filter(r=>r.tags['crossing:scramble']==='yes'&&marked(r));const envelope=hull(main.flatMap(r=>r.points));const central=union([[envelope]],buffer(envelope,C.mainWidth+1));
 roads=clipped(union(roads,central));
 const wide=clipped(union(...sources.map(r=>buffer(r.points,roadWidth(r)+C.sidewalk*2)),central,buffer(envelope,C.mainWidth+1+C.sidewalk*2)));
 const sidewalks=difference(wide,roads);const curbOuter=clipped(union(...sources.map(r=>buffer(r.points,roadWidth(r)+C.curbWidth*2)),central,buffer(envelope,C.mainWidth+1+C.curbWidth*2)));const curbTop=intersection(difference(curbOuter,roads),sidewalks);
 const crossings=[];for(const r of data.footways){if(r.tags.footway!=='crossing'||!marked(r)||C.southParts.indexOf(r.id,1)!==-1)continue;let points=r.points;if(r.id===C.southParts[0])points=C.southParts.flatMap(id=>data.footways.find(f=>f.id===id).points).filter((p,i,a)=>i===0||distance(p,a[i-1])>1e-5);const kind=r.id===C.diagonal?'diagonal':r.tags['crossing:scramble']==='yes'?'main':'normal';if(kind==='normal'&&r.points.some(p=>distance(p,data.landmarks.scramble.point)<C.centralExclusionRadius))continue;
 if(kind!=='normal'){const original=points;const ends=[0,length(original)].map((d,index)=>{const a=sample(original,d),sign=index===0?-1:1;let last=a.point;for(let step=.25;step<=C.crossingExtension;step+=.25){const p=a.point.map((v,j)=>v+a.tangent[j]*step*sign);if(!contains(roads,p))break;last=p;}return last;});points=[ends[0],...original,ends[1]].filter((p,i,a)=>i===0||distance(p,a[i-1])>1e-5);}
 const width=kind==='diagonal'?C.diagonalWidth:kind==='main'?C.mainWidth:C.normalWidth;const stripes=zebra(points,width,roads);if(stripes.length)crossings.push({id:r.id,points,kind,width,stripes});}
 // Point crossings/signals supply perpendicular crossings only when no mapped crossing path exists.
 for(const r of [...data.crossings,...data.signals]){if(distance(r.point,data.landmarks.scramble.point)<C.centralExclusionRadius||!marked(r)||crossings.some(c=>nearest(r.point,[c.points]).distance<8))continue;const n=nearest(r.point,sources.map(r=>r.points));if(n.distance>3)continue;const road=sources.find(r=>nearest(n.point,[r.points]).distance<.01);const w=roadWidth(road)+2,t=n.tangent,p=r.point,points=[[p[0]-t[1]*w/2,p[1]+t[0]*w/2],[p[0]+t[1]*w/2,p[1]-t[0]*w/2]],stripes=zebra(points,C.normalWidth,roads);if(stripes.length)crossings.push({id:r.id,points,kind:'normal',width:C.normalWidth,stripes});}
 const corridors=union(...crossings.map(c=>{const a=sample(c.points,0),b=sample(c.points,length(c.points));return buffer([[a.point[0]-a.tangent[0]*8,a.point[1]-a.tangent[1]*8],...c.points,[b.point[0]+b.tangent[0]*8,b.point[1]+b.tangent[1]*8]],c.width);}));
 const ramps=intersection(sidewalks,corridors),flatSidewalk=difference(sidewalks,corridors);const boundaries=roads.flatMap(p=>p);
 const height=groundHeight(corridors,boundaries);
 const stopLines=[],guides=[],arrows=[],tactiles=[];
 for(const c of crossings.filter(c=>c.kind==='main')){const mid=sample(c.points,length(c.points)/2),n=[-mid.tangent[1],mid.tangent[0]];const center=data.landmarks.scramble.point;if((mid.point[0]-center[0])*n[0]+(mid.point[1]-center[1])*n[1]<0)n.forEach((v,i)=>n[i]=-v);const shift=C.mainWidth/2+2,p=mid.point.map((v,i)=>v+n[i]*shift),across=mid.tangent;
 stopLines.push(intersection(rect(p.map((v,i)=>v-across[i]*length(c.points)/2),p.map((v,i)=>v+across[i]*length(c.points)/2),.4),roads));
 const q=p.map((v,i)=>v+n[i]*6);guides.push(intersection(rect(q,q.map((v,i)=>v+n[i]*6),.13),roads));const tip=q.map((v,i)=>v-n[i]*2),tail=q.map((v,i)=>v+n[i]*1);arrows.push(intersection(union(rect(tail,tip,.25),rect(tip,tip.map((v,i)=>v+n[i]*1+across[i]*.7),.25),rect(tip,tip.map((v,i)=>v+n[i]*1-across[i]*.7),.25)),roads));}
 for(const c of crossings.filter(c=>c.kind!=='normal'))for(const end of [0,length(c.points)]){const s=sample(c.points,end),dir=end===0?-1:1;const line=[s.point,s.point.map((v,i)=>v+s.tangent[i]*dir*7)];const p=intersection(buffer(line,.55),sidewalks);if(p.length)tactiles.push(p);}
 for(const f of data.footways.filter(f=>f.tags.tactile_paving==='yes'&&surface(f)&&f.points.some(p=>distance(p,data.landmarks.hachikoExit.point)<25))){const p=intersection(buffer(f.points,.45),sidewalks);if(p.length)tactiles.push(p);}
 return {roads,sidewalks,flatSidewalk,curbTop,ramps,corridors,height,crossings,stopLines:stopLines.filter(p=>area(p)>.01),guides:guides.filter(p=>area(p)>.01),arrows:arrows.filter(p=>area(p)>.01),tactiles,boundaries,stats:{roadSourceCount:sources.length,roadPolygonCount:strips.length,unionPolygonCount:roads.length,sidewalkPolygonCount:sidewalks.length,crossingCount:crossings.length,mainCrossings:crossings.filter(c=>c.kind==='main').length,diagonalCrossings:crossings.filter(c=>c.kind==='diagonal').length,normalCrossings:crossings.filter(c=>c.kind==='normal').length,zebraStripeCount:crossings.reduce((s,c)=>s+c.stripes.length,0),tactileCount:tactiles.length,buildTimeMs:performance.now()-start}};
}
