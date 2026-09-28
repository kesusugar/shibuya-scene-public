import {buildBuildingModel,roofFits} from '../buildings/model.mjs';
export const CONSTRUCTION_PROFILES={high:{cranes:4,zones:4,detail:2},medium:{cranes:3,zones:3,detail:1},low:{cranes:1,zones:2,detail:0}};
// Rooftop refurbishment only: no ground closures or navigation changes.
const HOSTS=['way/116710255:0:0','way/120105804:0:0','way/129061813:0:0','way/136587834:0:0'];
export function buildConstructionModel(data,{generic=buildBuildingModel(data)}={}){
 const zones=[];
 for(const key of HOSTS){const host=generic.buildings.find(b=>b.key===key);if(!host)throw Error('Missing construction host '+key);let point=null;
  for(let z=host.bounds.minZ+5;z<host.bounds.maxZ-5&&!point;z+=1)for(let x=host.bounds.minX+12;x<host.bounds.maxX-12;x+=1){if(!roofFits(host.polygon,[x,z],24,10))continue;if(host.rooftop.some(r=>Math.abs(r.center[0]-x)<4+r.width/2&&Math.abs(r.center[1]-z)<4+r.depth/2))continue;point=[x,z];break;}
  if(!point)throw Error('No clear rooftop work area '+key);zones.push({id:'refurbishment-'+zones.length,hostKey:key,point,base:host.height+.15,height:24+zones.length*2,roof:host.polygon});
 }
 return {zones};
}
