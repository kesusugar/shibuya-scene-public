import {SpatialIndex,bounds,length,sample,distance} from '../geo/core.mjs';
import {polygons,buffer,surface} from '../ground/model.mjs';
import {STEP,RADIUS,district} from './config.mjs';
import {finishSteps,finishStepsAsync} from '../quality/runtime.mjs';
import {packContext,restoreContext} from '../quality/static-context.mjs';

const bb=(x,z,r=0)=>({minX:x-r,maxX:x+r,minZ:z-r,maxZ:z+r});
function indexed(polys){const index=new SpatialIndex(12);polys.forEach((p,i)=>index.insert(i,bounds(p.outer),p));return index;}
const ringBands=new WeakMap();
function inRingFast(p,ring){let bands=ringBands.get(ring);if(!bands){bands=new Map();for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if(a[1]===b[1])continue;for(let z=Math.floor(Math.min(a[1],b[1])/2);z<=Math.floor(Math.max(a[1],b[1])/2);z++){if(!bands.has(z))bands.set(z,[]);bands.get(z).push([a,b]);}}ringBands.set(ring,bands);}let hit=false;for(const [a,b] of bands.get(Math.floor(p[1]/2))??[])if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;return hit;}
const inside=(p,poly)=>inRingFast(p,poly.outer)&&!(poly.holes??[]).some(h=>inRingFast(p,h));
function edgeDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);}
function bindPedestrianContext(context,ground){
 const {sidewalk,walk,roads,solids,roadEdges,footwaySources}=context;
 const onRoad=(x,z)=>roads.query(bb(x,z)).some(v=>inside([x,z],v.value));
 const solid=(x,z,r=RADIUS)=>solids.query(bb(x,z,r)).some(({value:s})=>inside([x,z],s.polygon)||s.polygon.outer.some((a,i)=>edgeDistance(x,z,a,s.polygon.outer[(i+1)%s.polygon.outer.length])<r));
 const walkPoint=(x,z)=>!onRoad(x,z)&&walk.query(bb(x,z)).some(v=>inside([x,z],v.value));
 const safeCache=new Map();
 const safe=(x,z,r=RADIUS+.06)=>{const ix=Math.round(x*10),iz=Math.round(z*10),key=ix+','+iz;let result=safeCache.get(key);if(result!==undefined)return result;const a=ix/10,b=iz/10,margin=.43;result=!solid(a,b,margin)&&walkPoint(a,b);
  if(result&&roadEdges.query(bb(a,b,margin)).some(({value:[p,q]})=>edgeDistance(a,b,p,q)<margin))result=false;
  if(result)for(let i=0;i<8;i++)if(!walkPoint(a+Math.cos(i*Math.PI/4)*margin,b+Math.sin(i*Math.PI/4)*margin)){result=false;break;}
  safeCache.set(key,result);return result;};
 // The surface, sampled exactly. Road, kerb, and the ramps that take a kerb down to the road
 // at a crossing -- ground.height is continuous inside a corridor, so this is a real slope and
 // not a staircase.
 const point=[0,0];
 const exact=(x,z)=>{
  point[0]=x;point[1]=z;
  if(onRoad(x,z))return .02;
  return sidewalk.query(bb(x,z)).some(v=>inside(point,v.value))?ground.height(point):0;
 };
 // What the crowd walks on: the same surface rounded to a quarter metre and memoised, because
 // two thousand pedestrians asking per frame cannot each pay for a spatial query. The rounding
 // is invisible at crowd scale and would be a 25 cm staircase under a foot, so anything that
 // needs to place a foot asks `heightExact` instead.
 const heights=new Map();
 const height=(x,z)=>{const a=Math.round(x*4)/4,b=Math.round(z*4)/4,key=a+','+b;
  if(!heights.has(key))heights.set(key,exact(a,b));return heights.get(key);};
 return {sidewalk,walk,roads,solids,roadEdges,onRoad,solid,safe,footwaySources,height,heightExact:exact};
}
export function pedestrianContext(data,{ground,generic,street,core,detail}){
 const footways=data.footways.filter(f=>surface(f)&&f.highway!=='steps'&&f.tags.footway!=='crossing'&&!['no','private'].includes(f.tags.access));
 const footPolys=footways.flatMap(f=>f.tags.area==='yes'&&f.points.length>3?[{outer:f.points,holes:[]}]:polygons(buffer(f.points,Number(f.tags.width)|| (f.name?.includes('センター')?5: f.highway==='pedestrian'?3.2:1.8))));
 const sidewalk=indexed(polygons(ground.sidewalks)),walk=indexed([...polygons(ground.sidewalks),...footPolys]),roads=indexed(polygons(ground.roads)),solids=new SpatialIndex(12);let id=0;
 const add=(polygon,kind,bottom=0,top=5)=>{if(polygon&&bottom<2.5&&top>.2)solids.insert(id++,bounds(polygon.outer),{polygon,kind});};
 for(const b of generic.buildings)add(b.polygon,'building',b.base,b.base+b.height);
 for(const s of street.context.solids.items.values())add(s.value.polygon,s.value.kind,s.value.bottom,s.value.top);
 for(const f of [...street.fixtures,...(detail?.fixtures??[])])add(f.polygon,'fixture',f.bottom,f.top);
 for(const s of core.supports)add(s.polygon,'support',s.base,s.top);
 const roadEdges=new SpatialIndex(4);let rid=0;for(const p of polygons(ground.roads))for(const ring of [p.outer,...p.holes])for(let i=0;i<ring.length;i++)roadEdges.insert(rid++,bounds([ring[i],ring[(i+1)%ring.length]]),[ring[i],ring[(i+1)%ring.length]]);
 return bindPedestrianContext({sidewalk,walk,roads,solids,roadEdges,footwaySources:footways.map(f=>f.id)},ground);
}
export function packPedestrianNetwork(network){
 const nodes=network.nodes.map(node=>[node.x,node.z,node.edges,node.district,node.component]);
 const edges=network.edges.map(edge=>[edge.from,edge.to,edge.length,edge.crossingId??null,edge.sourcePoints??null,edge.width??null,edge.kind??null,edge.direction??null,edge.track??null,edge.points??null,edge.waitingRow??null]);
 return {compact:1,ctx:packContext(network.ctx),nodes,edges,crossings:network.crossings.map(edge=>edge.id),components:network.components,eligible:network.eligible.map(node=>node.id),landingNodes:[...network.landingNodes],rejected:network.rejected,waitingZones:network.waitingZones,choreographySlots:network.choreographySlots,stats:network.stats};
}
export function restorePedestrianNetwork(model,ground){
 const ctx=bindPedestrianContext(restoreContext(model.ctx),ground);
 const nodes=model.compact?model.nodes.map(([x,z,edges,district,component],id)=>({id,x,z,edges,district,component})):model.nodes;
 const edges=model.compact?model.edges.map(([from,to,length,crossingId,sourcePoints,width,kind,direction,track,points,waitingRow],id)=>({id,from,to,length,...(crossingId===null?{}:{crossingId,sourcePoints,width,kind,direction,track,points,...(waitingRow===null?{}:{waitingRow})})})):model.edges;
 const grid=new Map(nodes.map(node=>[Math.round(node.x/STEP)+','+Math.round(node.z/STEP),node]));
 const nearest=(x,z,r=5,accept=()=>true)=>{let best=null,dist=r;for(let ix=Math.floor((x-r)/STEP);ix<=Math.ceil((x+r)/STEP);ix++)for(let iz=Math.floor((z-r)/STEP);iz<=Math.ceil((z+r)/STEP);iz++){const n=grid.get(ix+','+iz);if(!n||!accept(n))continue;const d=Math.hypot(x-n.x,z-n.z);if(d<dist){best=n;dist=d;}}return best;};
 const segmentSafe=(a,b,crossing=false)=>{const len=Math.hypot(b.x-a.x,b.z-a.z);for(let d=0;d<=len;d+=.1){const t=d/(len||1),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;if(ctx.solid(x,z,.34)||!crossing&&!ctx.safe(x,z,.32))return false;}return !ctx.solid(b.x,b.z,.34)&&(crossing||ctx.safe(b.x,b.z,.32));};
 return {...model,ctx,nodes,edges,crossings:model.crossings.map(id=>edges[id]),eligible:model.eligible.map(id=>nodes[id]),landingNodes:new Set(model.landingNodes),nearest,segmentSafe};
}
export const buildPedestrianNetwork=(data,options)=>finishSteps(buildPedestrianNetworkSteps(data,options));
export const buildPedestrianNetworkAsync=(data,options,timing)=>finishStepsAsync(buildPedestrianNetworkSteps(data,options),undefined,timing);
export function* buildPedestrianNetworkSteps(data,options){
 const started=performance.now(),ctx=pedestrianContext(data,options),nodes=[],edges=[],grid=new Map(),crossings=[],rejected=[];
 const node=(x,z)=>{const n={id:nodes.length,x,z,edges:[],district:district(x,z),component:-1};nodes.push(n);return n;};
 const segmentSafe=(a,b,crossing=false)=>{const len=Math.hypot(b.x-a.x,b.z-a.z);for(let d=0;d<=len;d+=.1){const t=d/(len||1),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;if(ctx.solid(x,z,.34)||!crossing&&!ctx.safe(x,z,.32))return false;}return !ctx.solid(b.x,b.z,.34)&&(crossing||ctx.safe(b.x,b.z,.32));};
 const edge=(a,b,extra={})=>{const e={id:edges.length,from:a.id,to:b.id,length:Math.hypot(b.x-a.x,b.z-a.z),...extra};edges.push(e);a.edges.push(e.id);return e;};
 for(let ix=-198;ix<=198;ix++)for(let iz=-198;iz<=198;iz++){if((iz+198)%64===0)yield;const x=ix*STEP,z=iz*STEP;if(ctx.safe(x,z,.38))grid.set(ix+','+iz,node(x,z));}
 let connectionChunk=0;for(const [key,a] of grid){if(++connectionChunk%32===0)yield;const [ix,iz]=key.split(',').map(Number);for(const [dx,dz] of [[1,0],[0,1],[1,1],[1,-1]]){const b=grid.get((ix+dx)+','+(iz+dz));if(b&&segmentSafe(a,b)){edge(a,b);edge(b,a);}}}
 const nearest=(x,z,r=5,accept=()=>true)=>{let best=null,dist=r;for(let ix=Math.floor((x-r)/STEP);ix<=Math.ceil((x+r)/STEP);ix++)for(let iz=Math.floor((z-r)/STEP);iz<=Math.ceil((z+r)/STEP);iz++){const n=grid.get(ix+','+iz);if(!n||!accept(n))continue;const d=Math.hypot(x-n.x,z-n.z);if(d<dist){best=n;dist=d;}}return best;};
 // Connect each mapped zebra in both directions, with separate lateral tracks.
 // Endpoints extend to verified sidewalk cells; road space is only legal on these edges.
 const landingNodes=new Set();for(const source of options.ground.crossings){yield;const used=[];const l=length(source.points),start=sample(source.points,0),end=sample(source.points,l),tracks=source.kind==='normal'?1:3;
  for(const direction of [1,-1])for(let track=0;track<tracks;track++){
   const shift=(.45+track*.6)*direction,points=source.points.map((p,i)=>{const s=sample(source.points,Math.min(l,source.points.reduce((v,q,j)=>j>0&&j<=i?v+distance(source.points[j-1],q):v,0)));return [p[0]+s.tangent[1]*shift,p[1]-s.tangent[0]*shift];});
   const endpoint=(p,t,sign)=>{for(let d=.5;d<=14;d+=.5){const x=p[0]+t[0]*sign*d,z=p[1]+t[1]*sign*d;const n=nearest(x,z,1.8,n=>n.edges.length>1&&!used.some(p=>Math.hypot(p.x-n.x,p.z-n.z)<1.05));if(n&&segmentSafe({x:p[0],z:p[1]},n,true))return n;}return null;};
   const a=endpoint(points[0],start.tangent,-1),b=endpoint(points.at(-1),end.tangent,1);
   if(!a||!b||a===b){rejected.push({id:source.id,direction,track,reason:'curb-connection'});continue;}
   let route=[[a.x,a.z],...points,[b.x,b.z]];if(direction<0)route.reverse();let valid=true;
   for(let i=1;i<route.length;i++)if(!segmentSafe({x:route[i-1][0],z:route[i-1][1]},{x:route[i][0],z:route[i][1]},true))valid=false;
   if(!valid){rejected.push({id:source.id,direction,track,reason:'solid'});continue;}
   used.push(a,b);landingNodes.add(direction>0?b.id:a.id);const samples=[],total=length(route);for(let d=0;d<total;d+=.3)samples.push(sample(route,d).point);samples.push(route.at(-1));
   if(samples.some(p=>ctx.onRoad(...p)&&!inCrossing(p[0],p[1],{sourcePoints:source.points,width:source.width},.34))){rejected.push({id:source.id,direction,track,reason:'crosswalk-boundary'});continue;}const from=direction>0?a:b,to=direction>0?b:a;
   const e=edge(from,to,{crossingId:source.id,sourcePoints:source.points,width:source.width,kind:source.kind,direction,track,points:samples,length:total});crossings.push(e);
  }
 }
 // S16: multiple safe approach/departure cells form deep, high-density waiting strips.
 // Reuse mapped road tracks and the existing signal/route machinery; no new steering solver.
 const waitingZones=[];
 for(const original of [...crossings].filter(e=>e.kind!=='normal')){yield;
  const a=nodes[original.from],b=nodes[original.to],road=original.points.filter(p=>ctx.onRoad(...p));if(road.length<2)continue;
  const len=Math.hypot(b.x-a.x,b.z-a.z),tx=(b.x-a.x)/len,tz=(b.z-a.z)/len,entries=[a.id],exits=[b.id];
  for(let row=1;row<=3;row++){
   const lateral=(row%2?.3:-.3),from=nearest(a.x-tx*row*1.65+tz*lateral,a.z-tz*row*1.65-tx*lateral,1.35,n=>n.edges.length>1&&!entries.includes(n.id)),to=nearest(b.x+tx*row*1.65-tz*lateral,b.z+tz*row*1.65+tx*lateral,1.35,n=>n.edges.length>1&&!exits.includes(n.id));
   if(!from||!to)continue;const path=[[from.x,from.z],...road,[to.x,to.z]];
   if(path.some((p,i)=>i>0&&!segmentSafe({x:path[i-1][0],z:path[i-1][1]},{x:p[0],z:p[1]},true)))continue;
   const total=length(path),points=[];for(let d=0;d<total;d+=.3)points.push(sample(path,d).point);points.push(path.at(-1));
   if(points.some(p=>ctx.onRoad(...p)&&!inCrossing(...p,original,.34)))continue;
   const e=edge(from,to,{crossingId:original.crossingId,sourcePoints:original.sourcePoints,width:original.width,kind:original.kind,direction:original.direction,track:original.track,waitingRow:row,points,length:total});crossings.push(e);entries.push(from.id);exits.push(to.id);landingNodes.add(to.id);
  }
  waitingZones.push({crossingId:original.crossingId,direction:original.direction,track:original.track,entries,exits});
 }
 // Components determine route capacity. Disconnected slivers never receive citizens.
 let component=0;const components=[];
 for(const n of nodes){if(n.component>=0)continue;const ids=[n.id];n.component=component;for(let i=0;i<ids.length;i++)for(const eid of nodes[ids[i]].edges){const next=nodes[edges[eid].to];if(next.component<0){next.component=component;ids.push(next.id);}}components.push(ids);component++;}
 const eligible=nodes.filter(n=>components[n.component].length>=35&&n.edges.some(id=>!edges[id].crossingId));
 // Candidate curb slots are deterministic and geometry-only. Baking them avoids repeating tens of thousands of safety samples at every HIGH startup.
 const choreographySlots=[];for(const id of new Set(crossings.filter(edge=>edge.kind!=='normal').flatMap(edge=>[edge.from,edge.to]))){yield;const target=nodes[id],candidates=[];for(let i=0;i<360;i++){const angle=i*2.399963,radius=.3+(i%60)*.095,x=target.x+Math.cos(angle)*radius,z=target.z+Math.sin(angle)*radius;if(ctx.safe(x,z,.29)&&segmentSafe({x,z},target,false))candidates.push([x,z,Math.round(x/.32)+','+Math.round(z/.32)]);}choreographySlots.push([id,candidates]);}
 return {ctx,nodes,edges,crossings,components,eligible,landingNodes,nearest,segmentSafe,rejected,waitingZones,choreographySlots,stats:{waitingCells:new Set(waitingZones.flatMap(z=>z.entries)).size,nodes:nodes.length,edges:edges.length,crossingPaths:crossings.length,scramblePaths:crossings.filter(c=>c.kind!=='normal').length,components:components.length,eligible:eligible.length,footwaySources:ctx.footwaySources.length,rejectedCrossings:rejected.length,generationMs:Math.round(performance.now()-started)}};
}
// A* with a binary heap. Paths are built at destination changes, never per frame.
export function route(network,from,to){
 if(from===to)return [];const {nodes,edges}=network,open=[],cost=new Map([[from,0]]),prev=new Map();
 const heuristic=id=>Math.hypot(nodes[id].x-nodes[to].x,nodes[id].z-nodes[to].z);
 const push=(id,score)=>{let i=open.length;open.push({id,score});while(i>0){const p=(i-1)>>1;if(open[p].score<=score)break;open[i]=open[p];i=p;open[i]={id,score};}};
 const pop=()=>{const first=open[0],last=open.pop();if(open.length){open[0]=last;let i=0;for(;;){let c=i*2+1;if(c>=open.length)break;if(c+1<open.length&&open[c+1].score<open[c].score)c++;if(open[i].score<=open[c].score)break;[open[i],open[c]]=[open[c],open[i]];i=c;}}return first.id;};
 push(from,heuristic(from));let budget=30000;
 while(open.length&&budget-->0){const id=pop();if(id===to){const result=[];let at=to;while(at!==from){const eid=prev.get(at);if(eid===undefined)return [];result.push(eid);at=edges[eid].from;}return result.reverse();}
  for(const eid of nodes[id].edges){const e=edges[eid],c=cost.get(id)+e.length+(e.crossingId?8:0);if(c<(cost.get(e.to)??Infinity)){cost.set(e.to,c);prev.set(e.to,eid);push(e.to,c+heuristic(e.to));}}
 }return [];
}
export function edgePose(network,e,d,out){const t=Math.max(0,Math.min(1,d/e.length)),a=network.nodes[e.from],b=network.nodes[e.to];if(!e.points){out.x=a.x+(b.x-a.x)*t;out.z=a.z+(b.z-a.z)*t;out.heading=Math.atan2(b.x-a.x,b.z-a.z);return out;}
 const f=t*(e.points.length-1),i=Math.min(e.points.length-2,Math.floor(f)),p=e.points[i],q=e.points[i+1];out.x=p[0]+(q[0]-p[0])*(f-i);out.z=p[1]+(q[1]-p[1])*(f-i);out.heading=Math.atan2(q[0]-p[0],q[1]-p[1]);return out;}

export function inCrossing(x,z,e,r=.25){return e.sourcePoints.some((p,i)=>i>0&&edgeDistance(x,z,e.sourcePoints[i-1],p)<e.width/2-r);}
