import {bounds,SpatialIndex} from '../geo/core.mjs';
import {footprint} from '../station-detail/model.mjs';
import {contains,intersection,area} from '../ground/model.mjs';
import {multi} from '../buildings/model.mjs';

export function lightboxIssues(f,ctx){const shape=multi(f.polygon),bb=bounds(f.polygon.outer),hit=s=>area(intersection(shape,s))>.001;
 if(!f.entrance&&!f.polygon.outer.every(p=>contains(ctx.ground.sidewalks,p)))return ['off-sidewalk'];
 if(hit(ctx.ground.roads)||hit(ctx.ground.corridors)||hit(ctx.ground.ramps))return ['crossing'];
 if(ctx.flow.query(bb).some(({value:s})=>hit(s)))return ['flow'];
 if(ctx.solids.query(bb).some(({value:s})=>s.bottom<f.top&&s.top>f.bottom&&hit(multi(s.polygon))))return ['solid'];
 if(ctx.occupied.query({minX:bb.minX-1,maxX:bb.maxX+1,minZ:bb.minZ-1,maxZ:bb.maxZ+1}).some(({value:s})=>hit(multi(s.polygon))||Math.hypot(f.point[0]-s.point[0],f.point[1]-s.point[1])<3))return ['fixture'];
 const strip=footprint(f.point.map((v,i)=>v+f.normal[i]*1.6),f.width,1.2,f.heading);
 if(!(f.entrance?strip.outer.some(p=>contains(ctx.ground.sidewalks,p)):strip.outer.every(p=>contains(ctx.ground.sidewalks,p))))return ['walkway'];
 if(f.entrance&&(area(intersection(multi(strip),ctx.ground.roads))>.001||area(intersection(multi(strip),ctx.ground.corridors))>.001))return ['walkway-road'];
 if(ctx.solids.query(bounds(strip.outer)).some(({value:s})=>s.bottom<2.2&&area(intersection(multi(strip),multi(s.polygon)))>.001))return ['walkway-solid'];return [];
}

// Decorative illuminated information pavilions; not a claim of mapped subway entrances.
export function addLightboxes(model,detail){
 if(model.tier!=='high'||!model.context)return model;
 const ctx={...model.context,occupied:new SpatialIndex(8)},added=[];
 for(const f of [...model.fixtures,...(detail?.fixtures??[]).filter(f=>f.bottom<6)])ctx.occupied.insert(f.id,bounds(f.polygon.outer),f);
 const anchors=[];for(let x=-55;x<=55;x+=3)for(let z=-45;z<=50;z+=3)if(Math.hypot(x,z)>25&&Math.hypot(x,z)<65)anchors.push({point:[x,z],normal:[0,1]});anchors.sort((a,b)=>Math.hypot(...a.point)-Math.hypot(...b.point));
 // Surveyed candidates from the full clearance search; still revalidated against current fixtures.
 anchors.unshift(...[[-15,-22],[-27,-18]].map(point=>({point,normal:[0,1],entrance:true})));
 for(const a of anchors){if(added.length>=4)break;if(a.entrance&&added.filter(f=>f.entrance).length>=2)continue;if(added.some(f=>Math.hypot(f.point[0]-a.point[0],f.point[1]-a.point[1])<(a.entrance?10:22)))continue;
  for(const heading of [0,Math.PI/4,Math.PI/2,-Math.PI/4]){const point=a.point,normal=[Math.sin(heading),Math.cos(heading)],width=3.2,depth=1.2,bottom=ctx.ground.height(point),f={id:'crossing-lightbox:'+added.length,category:'lightbox',point,normal,heading,width,depth,height:3.1,bottom,top:bottom+3.1,polygon:footprint(point,width,depth,heading)};
   f.entrance=!!a.entrance;if(lightboxIssues(f,ctx).length)continue;
   added.push(f);ctx.occupied.insert(f.id,bounds(f.polygon.outer),f);break;
  }
 }
 return {...model,fixtures:[...model.fixtures,...added],lightboxes:added.length};
}
