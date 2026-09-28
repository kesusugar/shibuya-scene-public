import {cleanLine,distance,length,clipLine,sample} from '../geo/core.mjs';
import {STATION as C} from './config.mjs';
export function classifyRail(r){const t=r.tags??{};if(t.tunnel==='yes'||Number(t.layer??0)<0)return 'other';if(t.operator==='東日本旅客鉄道'&&['山手線','山手貨物線'].includes(t.name))return 'JR';if(t.name==='東京メトロ銀座線'&&t.operator==='東京地下鉄')return 'Ginza';return 'other';}
export function safeLine(points){try{const p=cleanLine(points);return p.length>1&&length(p)>.01?p:null;}catch{return null;}}
const box={minX:-C.limit,maxX:C.limit,minZ:-C.limit,maxZ:C.limit};
export function auditRails(data){const sources=[],invalid=[],duplicateSegments=[],seen=new Map(),pieces=[];
 for(const r of data.rails){const family=classifyRail(r),points=safeLine(r.points),record={id:r.id,part:r.part??0,family,tags:r.tags,sourcePoints:r.points,status:'other'};sources.push(record);if(!points){record.status='invalid';invalid.push(r.id);continue;}record.sourceLength=length(points);if(family==='other')continue;
 const group=family+':'+r.tags.name+':'+(r.tags.service??'main');const parts=clipLine(points,box);record.clippedLength=parts.reduce((s,p)=>s+length(p),0);record.status=parts.length?'selected':'outside-target';
 for(const [part,p] of parts.entries()){
  const edges=[];for(let i=1;i<p.length;i++){const pair=[p[i-1],p[i]].map(q=>q.map(v=>v.toFixed(5)).join(',')).sort().join('|'),key=family+':'+pair;if(seen.has(key)){duplicateSegments.push({id:r.id,duplicateOf:seen.get(key)});continue;}seen.set(key,r.id);edges.push([p[i-1],p[i]]);}
  // Rejoin exact adjacent edges only, never bridge a removed/invalid segment.
  for(const e of edges){const last=pieces.at(-1);if(last?.sourceIds[0]===r.id&&last.part===part&&distance(last.points.at(-1),e[0])<1e-5)last.points.push(e[1]);else pieces.push({family,group,part,sourceIds:[r.id],points:e});}
 }
 }
 const alignments=pieces.map(p=>({...p,points:p.points.map(q=>[...q])}));let changed=true;
 while(changed){changed=false;outer:for(let i=0;i<alignments.length;i++)for(let j=i+1;j<alignments.length;j++){const a=alignments[i],b=alignments[j];if(a.group!==b.group)continue;let ap=a.points,bp=b.points,joined=null;
 if(distance(ap.at(-1),bp[0])<.001)joined=[...ap,...bp.slice(1)];else if(distance(ap.at(-1),bp.at(-1))<.001)joined=[...ap,...bp.slice(0,-1).reverse()];else if(distance(ap[0],bp.at(-1))<.001)joined=[...bp,...ap.slice(1)];else if(distance(ap[0],bp[0])<.001)joined=[...ap.slice().reverse(),...bp.slice(1)];
 if(joined){a.points=joined;a.sourceIds=[...new Set([...a.sourceIds,...b.sourceIds])].sort();alignments.splice(j,1);changed=true;break outer;}}
 }
 for(const a of alignments){const p=a.points;if(a.family==='JR'?p[0][1]>p.at(-1)[1]:p[0][0]>p.at(-1)[0])p.reverse();a.length=length(p);a.id=a.family+':'+a.sourceIds.join('+');a.gauge=a.family==='JR'?C.jrGauge:C.ginzaGauge;a.deckY=a.family==='JR'?C.jrDeck:C.ginzaDeck;a.sharpTurns=[];for(let i=1;i<p.length-1;i++){const u=sample([p[i-1],p[i]],0).tangent,v=sample([p[i],p[i+1]],0).tangent;if(u[0]*v[0]+u[1]*v[1]<.5)a.sharpTurns.push(i);}}
 alignments.sort((a,b)=>a.id.localeCompare(b.id));
 const endpointAudit=alignments.flatMap(a=>[0,a.points.length-1].map(i=>{const p=a.points[i];const connected=alignments.some(b=>b!==a&&b.family===a.family&&[b.points[0],b.points.at(-1)].some(q=>distance(p,q)<.001));return {alignment:a.id,point:p,status:Math.max(...p.map(Math.abs))>=C.limit-.001?'target-clip':connected?'source-connection':'source-terminal',nearestOtherEndpoint:Math.min(...alignments.filter(b=>b!==a&&b.family===a.family).flatMap(b=>[distance(p,b.points[0]),distance(p,b.points.at(-1))]))};}));
 return {sources,alignments,invalid,duplicateSegments,endpointAudit,counts:{source:data.rails.length,JR:sources.filter(r=>r.family==='JR').length,Ginza:sources.filter(r=>r.family==='Ginza').length,other:sources.filter(r=>r.family==='other').length}};
}
/** Interpolate existing alignment at a world axis; no new geographic transform. */
export function atAxis(points,value,axis=1){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];if(value>=Math.min(a[axis],b[axis])-1e-7&&value<=Math.max(a[axis],b[axis])+1e-7&&Math.abs(b[axis]-a[axis])>1e-8){const t=(value-a[axis])/(b[axis]-a[axis]);return a.map((v,j)=>v+(b[j]-v)*t);}}return null;}
