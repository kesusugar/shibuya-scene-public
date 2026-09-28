import fs from 'node:fs';
import {buildGroundModel} from '../src/ground/model.mjs';
import {buildBuildingModel} from '../src/buildings/model.mjs';
import {buildStationModel} from '../src/station/model.mjs';
import {buildDetailModel} from '../src/station-detail/model.mjs';
import {buildStreetscapeModel} from '../src/streetscape/model.mjs';
import {buildTrafficGraph} from '../src/traffic/graph.mjs';
import {TrafficSimulation} from '../src/traffic/simulation.mjs';
import {buildPedestrianNetwork} from '../src/life/network.mjs';
import {CrowdSimulation} from '../src/life/simulation.mjs';
const data=JSON.parse(fs.readFileSync('public/data/shibuya-scene-data.json')),ground=buildGroundModel(data),generic=buildBuildingModel(data),core=buildStationModel(data,{ground,generic}),street=buildStreetscapeModel(data,{tier:'high',ground,generic,core}),detail=buildDetailModel(data,{tier:'high',ground,generic,core});
const graph=buildTrafficGraph(data,{ground,generic,street,core}),traffic=new TrafficSimulation(graph,{tier:'high',street}),network=buildPedestrianNetwork(data,{ground,generic,street,core,detail}),crowd=new CrowdSimulation(network,{tier:'high',traffic});
console.log('initial',network.stats,crowd.snapshot(),crowd.audit());
const samples=[],timings=[],trafficTimings=[];let major=0,minor={stuck:0,groupSeparation:0},trafficMajor=0;
for(let frame=0;frame<Number(process.argv[2]??5400);frame++){traffic.update(1/30);crowd.update(1/30);timings.push(crowd.stats.updateMs);trafficTimings.push(traffic.stats.updateMs);if(frame%30===0){const a=crowd.audit(),t=traffic.audit();major=Math.max(major,a.major);trafficMajor=Math.max(trafficMajor,t.major);for(const k of Object.keys(minor))minor[k]=Math.max(minor[k],a.minor[k]);if(a.major&&samples.length<10)samples.push({frame,...a,actors:a.findings.slice(0,4).map(f=>({...crowd.pool[f.id],route:undefined}))});}if(frame%900===899)console.log('tick',(frame+1)/30,{...crowd.snapshot(),entries:crowd.stats.entries,trafficEntries:traffic.stats.crossingEntries,major,trafficMajor});}
const timing=t=>{t.sort((a,b)=>a-b);return {median:t[Math.floor(t.length*.5)],p95:t[Math.floor(t.length*.95)],max:t.at(-1)};};
const output={network:network.stats,crowd:crowd.snapshot(),traffic:traffic.snapshot(),audit:{major,minor,trafficMajor,samples},crowdCPU:timing(timings),trafficCPU:timing(trafficTimings),crossers:crowd.pool.filter(p=>p.active&&p.crossing).map(p=>({...p,route:undefined}))};fs.mkdirSync('evidence/s10',{recursive:true});fs.writeFileSync(process.argv[3]??'evidence/s10/inspection.json',JSON.stringify(output,null,2));console.log('FINAL',output.audit,output.crowdCPU,output.trafficCPU);
