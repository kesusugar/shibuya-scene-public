import {fixtureAt,fixtureIssues} from './model.mjs';
import {bounds,SpatialIndex} from '../geo/core.mjs';
import {plazaIssues} from './plaza-clearance.mjs';
import generated from './central-generated.json' with {type:'json'};

export function centralSource(model,detail){let hash=2166136261;const text=JSON.stringify([model.fixtures,model.anchors,detail?.fixtures]);for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return (hash>>>0).toString(16);}
function finish(model,fixtures,added,rejected){return {...model,fixtures,centralDetail:{added:added.length,signals:added.filter(f=>f.category==='signal').length,trees:added.filter(f=>f.category==='tree').length,lights:added.filter(f=>f.category==='light').length,rejected},stats:{...model.stats,fixtureCount:fixtures.length,categories:Object.fromEntries([...new Set(fixtures.map(f=>f.category))].map(k=>[k,fixtures.filter(f=>f.category===k).length]))}};}

// Small, bounded pass over precomputed curb anchors. Existing clearance rules apply.
export function centralDetail(model,stationDetail=null,regenerate=false){
 if(model.tier!=='high'||!model.context?.ground)return model;
 if(!regenerate&&stationDetail&&generated.source===centralSource(model,stationDetail))return finish(model,[...model.fixtures,...generated.fixtures],generated.fixtures,0);
 const fixtures=[...model.fixtures],ctx={...model.context,occupied:new SpatialIndex(8)};
 for(const f of fixtures)ctx.occupied.insert(f.id,bounds(f.polygon.outer),f);
 for(const f of stationDetail?.fixtures??[])if(f.bottom<6)ctx.occupied.insert(f.id,bounds(f.polygon.outer),f);
 const anchors=model.anchors.filter(a=>Math.hypot(...a.point)<85).sort((a,b)=>Math.hypot(...a.point)-Math.hypot(...b.point));
 const additions=[], rejected=[];
 const add=(category,anchor,extra={})=>{
   const f=fixtureAt(category,anchor,'central:'+category+':'+anchor.key,extra);let issues=fixtureIssues(f,ctx);
   if(stationDetail&&issues.length===1&&issues[0]==='S6-exclusion')issues=plazaIssues(f,ctx);
   if(issues.length){rejected.push({id:f.id,issues});return false;}
   fixtures.push(f);additions.push(f);ctx.occupied.insert(f.id,bounds(f.polygon.outer),f);return true;
 };
 // Both ends of each central crossing need visible, working heads.
 for(const crossing of ctx.ground.crossings.filter(c=>c.kind!=='normal'||c.points.some(p=>Math.hypot(...p)<50))){
   for(const p of [crossing.points[0],crossing.points.at(-1)]){
     const nearby=anchors.filter(a=>Math.hypot(a.point[0]-p[0],a.point[1]-p[1])<14).sort((a,b)=>Math.hypot(a.point[0]-p[0],a.point[1]-p[1])-Math.hypot(b.point[0]-p[0],b.point[1]-p[1]));
     if(fixtures.some(f=>f.category==='signal'&&Math.hypot(f.point[0]-p[0],f.point[1]-p[1])<7))continue;
     for(const a of nearby.slice(0,8)){
       const travel=a.normal.map(v=>-v);
       if(add('signal',a,{signal:{signalId:'central:'+crossing.id+':'+a.key,travel,class:'vehicle',directionSource:'curb-facing',stateHook:'traffic-controller'},curbNormal:a.normal}))break;
     }
   }
 }
 // Alternating foliage and lamps, not random objects on the crossing itself.
 for(const a of anchors){
   if(additions.filter(f=>f.category==='tree').length>=10)break;
   if(fixtures.some(f=>Math.hypot(f.point[0]-a.point[0],f.point[1]-a.point[1])<7))continue;
   for(const offset of [1,2,3,4,5,6])if(add('tree',{...a,point:a.point.map((v,i)=>v+a.normal[i]*offset)}))break;
 }
 let attempts=0;
 for(const a of anchors){
   if(attempts++>=240||additions.length>=44)break;
   if(fixtures.some(f=>Math.hypot(f.point[0]-a.point[0],f.point[1]-a.point[1])<6))continue;
   const category=attempts%3===0?'tree':'light';
   for(const offset of [0,0.7,1.5,2.5,3.5]){
     const point=a.point.map((v,i)=>v+a.normal[i]*offset);
     if(add(category,{...a,point}))break;
   }
 }
 return finish(model,fixtures,additions,rejected.length);
}
