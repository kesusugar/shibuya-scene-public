import {edges,facadePoint} from './model.mjs';
// Render-only finish: do not change surveyed masses or the cached placement model.
export function refineQfrontGlass(h){
 if(h.key!=='qfront')return;
 for(const m of h.masses)if(m.bottom>=7.5)m.material='qfrontGlass';
 h.panels=h.panels.filter(p=>p.position[1]<8);
 h.details=h.details.filter(p=>p.position[1]<8);
 for(const e of edges(h.footprint)){
  const count=Math.max(1,Math.round(e.length/1.15));
  const monitorFace=e.normal[0]*h.primaryFacade.direction[0]+e.normal[1]*h.primaryFacade.direction[1]>.85;
  const spans=monitorFace?[[7.65,17.1],[27.9,42.65]]:[[7.65,42.65]];
  for(let i=0;i<=count;i++)for(const [lo,hi]of spans)h.details.push({position:facadePoint(e,e.length*i/count,(lo+hi)/2,.55),heading:e.heading,scale:[.065,hi-lo,.12],color:0x81929f,role:'curtain-mullion'});
  for(const y of [8.2,13.6,19,24.4,29.8,35.2,40.6,42.5]){if(monitorFace&&y>17.1&&y<27.9)continue;h.details.push({position:facadePoint(e,e.length/2,y,.28),heading:e.heading,scale:[e.length,.085,.12],color:0x71818c,role:'curtain-transom'});}
 }
}
