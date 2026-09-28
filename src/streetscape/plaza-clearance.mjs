import {bounds} from '../geo/core.mjs';
import {contains,intersection,area} from '../ground/model.mjs';
import {multi} from '../buildings/model.mjs';
import {footprint} from '../station-detail/model.mjs';

// Explicitly owned station-front supplements, not a global exemption from S6.
export function plazaIssues(f,ctx){
 const p=f.point,bb=bounds(f.polygon.outer),shape=multi(f.polygon),hits=s=>area(intersection(shape,s))>.001;
 if(Math.hypot(...p)>100||p[1]<5||p[0]<-65||p[0]>65)return ['outside-plaza-supplement'];
 if(!f.polygon.outer.every(q=>contains(ctx.ground.sidewalks,q)))return ['off-sidewalk'];
 if(hits(ctx.ground.roads)||hits(ctx.ground.corridors)||hits(ctx.ground.ramps))return ['road-or-crossing'];
 if(ctx.flow.query(bb).some(({value:s})=>hits(s)))return ['pedestrian-flow'];
 if(ctx.solids.query(bb).some(({value:s})=>s.bottom<f.top&&s.top>f.bottom&&hits(multi(s.polygon))))return ['solid'];
 if(ctx.occupied.query({minX:bb.minX-1,maxX:bb.maxX+1,minZ:bb.minZ-1,maxZ:bb.maxZ+1}).some(({value:s})=>Math.hypot(p[0]-s.point[0],p[1]-s.point[1])<2||hits(multi(s.polygon))))return ['fixture'];
 const strip=footprint(p.map((v,i)=>v+f.normal[i]*(f.depth/2+.8)),Math.max(1.2,f.width),1.2,f.heading);
 if(!strip.outer.every(q=>contains(ctx.ground.sidewalks,q)))return ['walkway'];
 if(ctx.solids.query(bounds(strip.outer)).some(({value:s})=>s.bottom<2.2&&area(intersection(multi(strip),multi(s.polygon)))>.001))return ['walkway-solid'];
 return [];
}
