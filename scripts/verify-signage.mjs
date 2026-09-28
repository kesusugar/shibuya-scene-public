import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {buildGround} from '../src/ground/render.mjs';
import {buildBuildings} from '../src/buildings/render.mjs';
import {buildHeroScene} from '../src/heroes/render.mjs';
import {buildStation} from '../src/station/render.mjs';
import {buildStationDetails} from '../src/station-detail/render.mjs';
import {buildSignage} from '../src/signs/render.mjs';
import {auditPlacements} from '../src/signs/model.mjs';
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const ground=buildGround(data),generic=buildBuildings(data),hero=buildHeroScene(data),core=buildStation(data,{ground:ground.model,generic:generic.model});
const options={ground:ground.model,generic:generic.model,heroes:hero.heroes,core:core.model},tiers={};
mkdirSync('evidence/s7',{recursive:true});
for(const tier of ['high','medium','low']){
 const s6=buildStationDetails(data,{...options,tier}),signs=buildSignage(data,{...options,tier}),audit=auditPlacements(signs.model);
 tiers[tier]={signage:signs.stats,audit,sceneCPU:{triangles:ground.stats.totalGroundTris+generic.stats.buildingTriangles+hero.stats.heroTriangles+core.stats.stationTriangles+s6.stats.triangles+signs.stats.triangles,batches:ground.stats.approximateDrawCalls+generic.stats.approximateDrawCalls+hero.stats.approximateDrawCalls+core.stats.approximateDrawCalls+s6.stats.batches+signs.stats.batches,materials:5+generic.stats.materialChannels+hero.stats.materials+core.stats.materials+s6.stats.materials+signs.stats.materials,textures:2+s6.stats.atlasTextures+signs.stats.atlasCount},S6:{triangles:s6.stats.triangles,major:s6.stats.newMajor,minor:s6.stats.newMinor}};
 if(tier==='high'){writeFileSync('evidence/s7/placements.json',JSON.stringify({signs:signs.model.signs,rejected:signs.model.rejected,audit},null,2));writeFileSync('evidence/s7/cpu-map-input.json',JSON.stringify({buildings:generic.model.buildings.map(b=>({polygon:b.polygon,height:b.height})),heroes:hero.heroes.map(h=>({key:h.key,footprint:h.footprint})),roads:ground.model.roads,signs:signs.model.signs.map(s=>({position:s.position,region:s.region,hero:s.hero,category:s.category,normal:s.normal,width:s.width,height:s.height})),rejected:signs.model.rejected}));}
 console.log(JSON.stringify({tier,stats:{...signs.stats,checks:undefined},audit,scene:tiers[tier].sceneCPU}));signs.dispose();s6.dispose();
}
writeFileSync('evidence/s7/geometry.json',JSON.stringify({base:'df38109',startCommit:'da77ce5',tiers,regression:{groundTriangles:ground.stats.totalGroundTris,genericCount:generic.stats.genericBuildings,genericTriangles:generic.stats.buildingTriangles,heroCount:hero.stats.generatedFootprints,heroTriangles:hero.stats.heroTriangles,stationTriangles:core.stats.stationTriangles}},null,2));
[ground,generic,hero,core].forEach(x=>x.dispose());
