import {pose} from './path.mjs';
import {VEHICLES} from './config.mjs';
// Reverse shortest paths to an outlet beyond the full crossing, computed once.
export function buildEgress(graph,area){
 const result=new Map();
 for(const type of Object.keys(VEHICLES)){
  const distance=new Map(),next=new Map();
  for(const lane of graph.lanes){const a=pose(lane.path,0),b=pose(lane.path,lane.path.length);
   if(lane.allowed.includes(type)&&!area.contains(a.x,a.z,20)&&!area.contains(b.x,b.z,20))distance.set(lane.id,0);
  }
  for(let pass=0;pass<32;pass++){let changed=false;
   for(const lane of graph.lanes){if(distance.get(lane.id)===0)continue;
    for(const id of lane.next){const t=graph.transitions[id],cost=distance.get(t.to);if(cost===undefined||!t.allowed.includes(type))continue;
     const value=t.path.length+graph.lanes[t.to].path.length+cost;
     if(value<(distance.get(lane.id)??Infinity)){distance.set(lane.id,value);next.set(lane.id,id);changed=true;}
    }
   }if(!changed)break;
  }result.set(type,next);
 }return result;
}
