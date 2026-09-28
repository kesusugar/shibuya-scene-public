import {finishSteps} from '../quality/runtime.mjs';
import {length,sample,offset,bounds,clipLine,distance,SpatialIndex,inPolygon} from '../geo/core.mjs';
import {buffer,rect,union,intersection,difference,area,polygons,clipped,buildGroundModel,nearest} from '../ground/model.mjs';
import {multi,buildBuildingModel} from '../buildings/model.mjs';
import {auditRails,atAxis} from './alignment.mjs';
import {STATION as C,RESERVATIONS,PEDESTRIAN_IDS,PEDESTRIAN_TERMINALS} from './config.mjs';
const rectangle=(x,z,w,d)=>({outer:[[x-w/2,z-d/2],[x+w/2,z-d/2],[x+w/2,z+d/2],[x-w/2,z+d/2]],holes:[]});
export function* buildStationModelSteps(data,{ground=buildGroundModel(data),generic=buildBuildingModel(data),timingTrace=null}={}){
 let chunk=0;const started=performance.now(),audit=auditRails(data),m={audit,masses:[],instances:[],decks:[],platforms:[],supports:[],supportRejected:[],pedestrians:[],connections:[],reservations:RESERVATIONS.map(r=>({...r,present:data.buildings.some(b=>b.id===r.id)})),anchors:[],railPairs:[],penetrations:[],skipped:[]};
 timingTrace?.markStationModelStart?.(started);
 const obstacles=[...generic.buildings.map(b=>({id:b.id,polygon:b.polygon,height:b.height+.15})),...data.buildings.filter(b=>!RESERVATIONS.some(r=>r.id===b.id)&&generic.reserved.some(r=>r.id===b.id)).map(b=>({id:b.id,polygon:b.polygon,height:250}))];
 const obstacleIndex=new SpatialIndex(30);obstacles.forEach((o,i)=>obstacleIndex.insert(i,bounds(o.polygon.outer),o));
 const crossing=union(...ground.crossings.flatMap(c=>c.stripes.map(s=>s.polygon)));
 const intersections=(p)=>obstacleIndex.query(bounds(p.outer)).map(x=>x.value).filter(o=>area(intersection(multi(p),multi(o.polygon)))>1e-4);
 function mass(role,geometry,bottom,top,material,{trim=true,owner=null}={}){if(top<=bottom)throw Error('Station height range');let shape=clipped(geometry);if(!shape.length)return [];
 if(trim){const cutters=obstacleIndex.query(bounds(polygons(shape).flatMap(p=>p.outer))).map(x=>x.value).filter(o=>o.height>bottom);const cut=union(...cutters.map(o=>multi(o.polygon))),removed=area(intersection(shape,cut));if(removed>.001)m.penetrations.push({role,classification:'expected',kind:'source-building-interface-clipped',removedArea:removed});shape=difference(shape,cut);}
 const added=[];for(const p of polygons(shape)){if(area(multi(p))<.002)continue;const item={role,polygon:p,bottom,top,material,owner,bounds:bounds(p.outer)};m.masses.push(item);added.push(item);}return added;
 }
 function box(role,point,y,w,h,d,heading=0,material='steel',extra={}){const item={role,position:[point[0],y,point[1]],scale:[w,h,d],heading,material,...extra};m.instances.push(item);return item;}
 function lineMass(role,line,width,bottom,top,material,opts){return mass(role,buffer(line,width),bottom,top,material,opts);}
 function support(point,top,owner,kind='pier',heading=0,width=1.05,depth=1.05){const p=rectangle(...point,width,depth);p.outer=p.outer.map(([x,z])=>{const u=x-point[0],v=z-point[1];return [point[0]+u*Math.cos(heading)+v*Math.sin(heading),point[1]-u*Math.sin(heading)+v*Math.cos(heading)];});const road=area(intersection(multi(p),ground.roads)),cross=area(intersection(multi(p),crossing)),sidewalk=area(intersection(multi(p),ground.sidewalks)),buildings=intersections(p).map(b=>b.id);const elevatedConflict=owner.startsWith('Ginza:')&&(m.decks.filter(d=>d.family==='JR').some(d=>d.masses.some(s=>area(intersection(multi(p),multi(s.polygon)))>.001))||PEDESTRIAN_IDS.some(id=>{const f=data.footways.find(f=>f.id===id);return f&&nearest(point,[f.points]).distance<Number(f.tags.width??C.pedestrianWidth)/2+1;}));if(road>.001||cross>.001||buildings.length||elevatedConflict){m.supportRejected.push({point,owner,kind,road,cross,buildings,elevatedConflict});return false;}
 // Piers sit on the actual S2 sidewalk ramp height; bare plaza uses ground y=0.
 const base=sidewalk>.001?(ground.height?.(point)??.15):0;
 box(kind,point,(top+base)/2,width,top-base,depth,heading,'stationConcrete',{owner});m.supports.push({point,polygon:p,base,top,owner,kind,sidewalkArea:sidewalk,classification:sidewalk>.001?'minor':'clear',roadArea:road,crossingArea:cross,buildingIds:buildings});return true;}
 m.alignments=audit.alignments;
 const jr=audit.alignments.filter(a=>a.family==='JR');
 // Continuous deck across all mapped tracks, with track-count-dependent cross section.
 const sections=[];for(let z=-250;z<=250;z+=5){const ps=jr.map(a=>atAxis(a.points,z)).filter(Boolean).sort((a,b)=>a[0]-b[0]);if(ps.length)sections.push({z,left:[ps[0][0]-2.5,z],right:[ps.at(-1)[0]+2.5,z],tracks:ps.length});}
 const jrPoly={outer:[...sections.map(s=>s.left),...sections.map(s=>s.right).reverse()],holes:[]};
 const jrDeck=mass('jr-deck',multi(jrPoly),C.jrDeck-.85,C.jrDeck,'stationConcrete');m.decks.push({family:'JR',sections,masses:jrDeck,top:C.jrDeck});
 for(const side of ['left','right']){const line=sections.map(s=>s[side]);lineMass('jr-parapet',line,.23,C.jrDeck,C.jrDeck+.8,'concreteDark');lineMass('jr-girder',line,.55,C.jrDeck-1.4,C.jrDeck-.7,'darkSteel');}
 for(const a of audit.alignments){yield;
 const y=a.deckY;
 if(a.family==='Ginza'){const deck=lineMass('ginza-deck',a.points,4.5,y-.9,y,'stationConcrete');m.decks.push({family:'Ginza',alignment:a.id,masses:deck,top:y});for(const sign of [-1,1]){lineMass('ginza-girder',offset(a.points,sign*1.6),.4,y-1.5,y-.8,'darkSteel');lineMass('ginza-parapet',offset(a.points,sign*2.1),.16,y,y+.65,'concreteDark');}}
 lineMass('track-slab',a.points,2.6,y,y+.22,'ballast',{owner:a.id});
 const pair={alignment:a.id,gauge:a.gauge,left:offset(a.points,a.gauge/2),right:offset(a.points,-a.gauge/2),railTop:y+C.railTop};m.railPairs.push(pair);
 for(const line of [pair.left,pair.right])lineMass('rail',line,.065,y+.36,y+C.railTop,'railMetal',{owner:a.id});
 for(let d=C.sleeperSpacing/2;d<a.length;d+=C.sleeperSpacing){if(++chunk%50===0)yield;const s=sample(a.points,d);const p=rectangle(...s.point,2.1,2.1);if(intersections(p).some(b=>b.height>y))continue;box('sleeper',s.point,y+.29,a.gauge+.65,.14,.22,s.heading,'concreteDark',{owner:a.id,distance:d,tangent:s.tangent});}
 const accepted=[];for(let d=8;d<a.length;d+=C.pierSpacing){const s=sample(a.points,d);if(support(s.point,y-1.4,a.id,'pier',s.heading))accepted.push(d);}
 m.connections.push({type:'support-span',alignment:a.id,acceptedDistances:accepted,maxUnsupportedSpan:Math.max(...[0,...accepted,a.length].slice(1).map((v,i)=>v-[0,...accepted][i]))});
 }
 // Two mapped JR track pairs form two islands; do not displace rail centerlines.
 for(const name of ['山手線','山手貨物線']){const pair=jr.filter(a=>a.group.includes(':'+name+':'));if(pair.length!==2){m.skipped.push({role:'platform',name,reason:'requires-two-tracks'});continue;}buildPlatform(pair,1,30,195,'JR',name,C.jrDeck);}
 const ginzaMain=audit.alignments.filter(a=>a.family==='Ginza'&&a.group.endsWith(':main'));if(ginzaMain.length===2)buildPlatform(ginzaMain,0,145,230,'Ginza','Ginza',C.ginzaDeck);
 function buildPlatform(pair,axis,start,end,family,name,y){const edgeA=[],edgeB=[],centers=[];for(let v=start;v<=end;v+=2.5){const samples=pair.map(a=>atAxis(a.points,v,axis));if(samples.some(p=>!p))continue;const across=1-axis;samples.sort((a,b)=>a[across]-b[across]);const [a,b]=samples,span=b[across]-a[across];if(span<2*C.platformClearance+1)continue;const e1=[...a],e2=[...b];const pad1=C.platformClearance/Math.abs(nearest(a,pair.map(p=>p.points)).tangent[axis]),pad2=C.platformClearance/Math.abs(nearest(b,pair.map(p=>p.points)).tangent[axis]);if(span<pad1+pad2+1)continue;e1[across]+=pad1;e2[across]-=pad2;edgeA.push(e1);edgeB.push(e2);centers.push(e1.map((n,i)=>(n+e2[i])/2));}
 if(edgeA.length<2)return;const polygon={outer:[...edgeA,...edgeB.slice().reverse()],holes:[]},id=family+':'+name,top=y+C.platformTop;
 const platformShape=family==='Ginza'?intersection(multi(polygon),multi(data.buildings.find(b=>b.id==='way/810356690').polygon)):multi(polygon);const slabs=mass('platform-slab',platformShape,y-.15,top,'platform',{owner:id});
 const roofBase=family==='JR'?top+3.1:top+3.7;
 const roof=mass('platform-roof',platformShape,roofBase,roofBase+.18,'canopy',{owner:id});
 for(const edge of [edgeA,edgeB]){lineMass('platform-edge',edge,.15,top,top+.045,'canopy',{owner:id});const towards=edge.map((p,i)=>p.map((v,j)=>v+(centers[i][j]-v)*.2));lineMass('platform-tactile',towards,.35,top+.01,top+.03,'tactile',{owner:id});}
 const platform={id,family,polygon,edgeA,edgeB,centers,trackIds:pair.map(a=>a.id),top,roofBottom:roofBase,slabs,roof,posts:[]};m.platforms.push(platform);
 for(let d=5;d<length(centers)-2;d+=C.postSpacing){const s=sample(centers,d);if(!slabs.some(p=>inPolygon(s.point,p.polygon)))continue;box('platform-post',s.point,(top+roofBase)/2,.18,roofBase-top,.18,s.heading,'steel',{owner:id});platform.posts.push({point:s.point,bottom:top,top:roofBase});const width=nearest(s.point,[edgeA]).distance+nearest(s.point,[edgeB]).distance;box('platform-rib',s.point,roofBase-.08,width,.16,.15,s.heading,'steel',{owner:id});}
 // Pedestal core supports island slabs from grade; accepted supports are audited.
 for(let d=8;d<length(centers);d+=C.pierSpacing){const s=sample(centers,d);support(s.point,y-.15,id,'platform-support');}
 if(family==='Ginza')buildGinzaCanopy(platform,pair);
 }
 function buildGinzaCanopy(platform,pair){
 // Longitudinal canopy facets: open M-shaped portal instead of a plain flat slab.
 const mid=platform.centers,center=sample(mid,length(mid)/2),width=14.5;
 m.ginzaCanopy={centerline:mid,width,base:platform.roofBottom,profile:[[-width/2,0],[-width*.25,2],[0,.7],[width*.25,2],[width/2,0]],portalEnds:[]};
 // Faceted panels are emitted separately by the renderer from this exact profile.
 for(let d=0;d<length(mid);d+=8){const s=sample(mid,d);m.ginzaCanopy.portalEnds.push({point:s.point,heading:s.heading,distance:d});}
 for(const d of [0,length(mid)]){const s=sample(mid,d);box('ginza-end-glass',s.point,platform.roofBottom-1.15,5,.95,.07,s.heading,'glass');for(const u of [-2.4,0,2.4])box('ginza-end-mullion',[s.point[0]+Math.cos(s.heading)*u,s.point[1]-Math.sin(s.heading)*u],platform.roofBottom-1.15,.08,.95,.12,s.heading,'steel');}
 const first=sample(mid,0);box('ginza-entrance-portal',first.point,platform.roofBottom-.35,5.6,.3,.5,first.heading,'steel');
 }
 // Hachiko landmark is on the west facade of the reserved station footprint.
 const hSource=data.buildings.find(b=>b.id==='way/904652357'),entry=data.landmarks.hachikoExit.point;
 const hShape=intersection(multi(hSource.polygon),multi(rectangle(entry[0]+5,entry[1]+3,12,23)));
 const hBase=mass('hachiko-base',hShape,0,C.base+.12,'platform',{trim:false});
 const hp=polygons(hShape)[0],hb=bounds(hp.outer);m.hachiko={id:hSource.id,entranceSource:data.landmarks.hachikoExit.id,point:entry,polygon:hp,bounds:hb,base:0,floor:C.base+.12,roofTop:4.75,heading:-Math.PI/2,lightingAnchors:[]};
 mass('hachiko-canopy',hShape,4.45,4.65,'canopy',{trim:false});mass('hachiko-roof-membrane',hShape,4.65,4.75,'concreteDark',{trim:false});
 // Rear entrance wall plus narrow side walls leave an actual open west entry.
 mass('hachiko-rear-wall',intersection(hShape,multi(rectangle(hb.maxX-.35,(hb.minZ+hb.maxZ)/2,.7,hb.maxZ-hb.minZ))),C.base+.12,4.45,'stationConcrete',{trim:false});
 for(const z of [hb.minZ+1.1,hb.maxZ-1.1]){const xs=hp.outer.map((a,i)=>atAxis([a,hp.outer[(i+1)%hp.outer.length]],z)).filter(Boolean).map(p=>p[0]);const p=[Math.min(...xs)+.6,z];if(inPolygon(p,hp))box('hachiko-column',p,2.3,.35,4.06,.35,0,'stationConcrete');}
 // West-facing slanted band follows the mapped facade rather than an invented billboard.
 const edge=hSource.polygon.outer.filter(p=>p[0]<52&&p[1]>20&&p[1]<52).sort((a,b)=>a[1]-b[1]);if(edge.length>1){lineMass('hachiko-green-band',edge,.13,3.85,4.3,'greenBand',{trim:false});lineMass('hachiko-trim',edge,.18,4.3,4.42,'steel',{trim:false});}
 const stepShape=intersection(hShape,multi(rectangle(entry[0]+1,entry[1],3,8)));mass('hachiko-level-transition',stepShape,0,.15,'platform',{trim:false});m.hachiko.lightingAnchors.push({position:[entry[0]+3,4.3,entry[1]],normal:[0,-1,0],active:false});m.anchors.push(...m.hachiko.lightingAnchors);
 buildPedestrians();
 function buildPedestrians(){const sources=PEDESTRIAN_IDS.map(id=>data.footways.find(f=>f.id===id));for(const f of sources){if(!f){m.skipped.push({role:'pedestrian',reason:'missing-source'});continue;}const stair=f.tags.highway==='steps',line=f.points,width=stair?2.6:f.id==='way/1354871463'?3.2:Number(f.tags.width??C.pedestrianWidth),total=length(line);const deck={id:f.id,line,width,length:total,stair,top:C.pedestrianTop,sourceTags:f.tags,supports:[],masses:[]};m.pedestrians.push(deck);
 if(!stair){deck.masses=lineMass('pedestrian-deck',line,width,C.pedestrianTop-.45,C.pedestrianTop,'stationConcrete',{owner:f.id});
 for(let d=2;d<total;d+=16){const s=sample(line,d);for(const side of [-1,1]){const p=[s.point[0]+s.tangent[1]*side*(width/2-.7),s.point[1]-s.tangent[0]*side*(width/2-.7)];if(support(p,C.pedestrianTop-.45,f.id,'pedestrian-support'))deck.supports.push(p);}}
 }else{const n=Math.ceil((C.pedestrianTop-C.base)/.17),pitch=total/n;for(let i=0;i<n;i++){const a=sample(line,i*pitch),b=sample(line,(i+1)*pitch),top=C.pedestrianTop-(C.pedestrianTop-C.base)*i/n;deck.masses.push(...mass('pedestrian-step',rect(a.point,b.point,width),Math.max(C.base,top-.4),top,'platform',{owner:f.id}));}deck.stairBottom=C.base;deck.stairPitch=pitch;
 for(const side of [-1,1]){const edge=offset(line,side*(width/2-.1));let walked=0;for(let j=1;j<edge.length;j++){const d=distance(line[j-1],line[j]);const y1=C.pedestrianTop-(C.pedestrianTop-C.base)*walked/total+1;walked+=d;const y2=C.pedestrianTop-(C.pedestrianTop-C.base)*walked/total+1;m.instances.push({role:'stair-handrail',from:[edge[j-1][0],y1,edge[j-1][1]],to:[edge[j][0],y2,edge[j][1]],thickness:.08,material:'steel'});}}
}
 for(const [label,p] of [['start',line[0]],['end',line.at(-1)]]){const joined=sources.filter(o=>o&&o.id!==f.id).find(o=>nearest(p,[o.points]).distance<.01);const terminal=PEDESTRIAN_TERMINALS[f.id+':'+label];const state=joined?{type:'mapped-junction',source:joined.id}:terminal??{type:'closed-continuation',reason:'No S5 mapped continuation'};m.connections.push({type:'pedestrian-end',id:f.id,end:label,point:p,...state,status:state.type});if(state.type==='closed-continuation'){const s=sample(line,label==='start'?0:total);box('deck-end-barrier',p,C.pedestrianTop+.55,width,.9,.12,s.heading,'steel');}}
 }
 // Shared perimeter avoids railings across mapped deck junctions. Stair and
 // building/indoor interfaces are explicit openings, never invented connections.
 const walkShape=union(...m.pedestrians.filter(d=>!d.stair).flatMap(d=>d.masses.map(x=>multi(x.polygon))));
 const openings=union(...m.pedestrians.filter(d=>d.stair).map(d=>buffer(d.line,d.width+.8)),...m.connections.filter(c=>['building-interface','indoor-interface'].includes(c.status)).map(c=>{const d=m.pedestrians.find(d=>d.id===c.id);return buffer([c.point,[c.point[0]+.01,c.point[1]]],d.width+1);}));
 for(const p of walkShape)for(const ring of p){for(const [role,w,b,t,material] of [['pedestrian-sidewall',.18,0,.25,'stationConcrete'],['pedestrian-glass-rail',.05,.25,1.05,'glass'],['pedestrian-handrail',.08,1.05,1.12,'steel']])mass(role,difference(buffer(ring,w),openings),C.pedestrianTop+b,C.pedestrianTop+t,material);}
 }
 // Audit actual emitted masses, including grade structures and station/Hero intersections.
 for(const a of m.masses){if(++chunk%25===0)yield;const road=area(intersection(multi(a.polygon),ground.roads)),cross=area(intersection(multi(a.polygon),crossing));if(a.bottom<4.5&&(road>.001||cross>.001))m.penetrations.push({role:a.role,kind:'grade-surface',classification:'major',roadArea:road,crossingArea:cross});for(const b of intersections(a.polygon))if(a.bottom<b.height)m.penetrations.push({role:a.role,kind:'building',id:b.id,classification:'major'});}
 m.penetrations.push(...m.supports.filter(s=>s.sidewalkArea>.001).map(s=>({kind:'sidewalk-support',classification:'minor',owner:s.owner,point:s.point,area:s.sidewalkArea})));
 m.buildTimeMs=performance.now()-started;return m;
}

export function buildStationModel(...args){return finishSteps(buildStationModelSteps(...args));}
