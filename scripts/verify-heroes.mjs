import {readFileSync,writeFileSync} from 'node:fs';
import {buildHeroScene} from '../src/heroes/render.mjs';
import {buildBuildings} from '../src/buildings/render.mjs';
import {buildGround} from '../src/ground/render.mjs';
import {auditGround,multi} from '../src/buildings/model.mjs';
import {intersection,area} from '../src/ground/model.mjs';
const data=JSON.parse(readFileSync('public/data/shibuya-scene-data.json'));
const g=buildGround(data),b=buildBuildings(data),h=buildHeroScene(data);
const heroModel={buildings:h.heroes.map(x=>({id:x.id,polygon:x.footprint,bounds:x.bounds,area:area(multi(x.footprint))}))};
const duplicates=b.model.buildings.filter(x=>h.heroes.some(y=>x.id===y.id)).map(x=>x.id);
const s5=h.audit.filter(x=>x.phase==='S5').map(x=>data.buildings.find(y=>y.id===x.id));
const s5Overlaps=[];for(const hero of h.heroes)for(const source of s5){const overlap=area(intersection(multi(hero.footprint),multi(source.polygon)));if(overlap>1e-5)s5Overlaps.push({hero:hero.id,source:source.id,area:overlap});}
const summary={heroes:h.stats,genericDuplicateIds:duplicates,s5Overlaps,heroGroundAudit:auditGround(heroModel,g.model),genericGroundAudit:auditGround(b.model,g.model),generic:b.stats,ground:g.stats,combined:{triangles:h.stats.heroTriangles+b.stats.buildingTriangles+g.stats.totalGroundTris,approximateDrawCalls:h.stats.approximateDrawCalls+b.stats.approximateDrawCalls+g.stats.approximateDrawCalls}};
for(const [name,value] of Object.entries({'geometry':summary,'hero-metadata':h.heroes,'reservation-audit':h.audit}))writeFileSync(`evidence/s4/${name}.json`,JSON.stringify(value,null,2));
writeFileSync('/tmp/s4-ground.json',JSON.stringify(g.model));writeFileSync('/tmp/s4-generic.json',JSON.stringify(b.model));
console.log(JSON.stringify({heroes:h.stats,duplicates,s5Overlaps,combined:summary.combined},null,2));h.dispose();b.dispose();g.dispose();
