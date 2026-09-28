// Walk short, reversible chains of existing sidewalk edges; no runtime A*.
export function patrolRoute(network,p){
 if(p.patrol?.end===p.node){
   const route=p.patrol.reverse;p.patrol={end:p.patrol.start,start:p.node,reverse:p.patrol.forward,forward:route};
   p.route=route;p.routeIndex=0;p.edge=route[0];p.progress=0;p.destination=p.patrol.end;return true;
 }
 const forward=[],reverse=[],visited=new Set([p.node]);let node=network.nodes[p.node],distance=0,heading=p.heading;
 while(distance<10+p.id%13&&forward.length<16){
   const choices=node.edges.map(id=>network.edges[id]).filter(e=>!e.crossingId&&!visited.has(e.to))
     .map(e=>({e,back:network.nodes[e.to].edges.map(id=>network.edges[id]).find(r=>r.to===node.id&&!r.crossingId)})).filter(c=>c.back);
   choices.sort((a,b)=>{
     const turn=c=>{const n=network.nodes[c.e.to];return Math.cos(Math.atan2(n.x-node.x,n.z-node.z)-heading);};
     return turn(b)-turn(a);
   });
   if(!choices.length)break;
   const {e,back}=choices[0],next=network.nodes[e.to];heading=Math.atan2(next.x-node.x,next.z-node.z);
   forward.push(e.id);reverse.unshift(back.id);distance+=e.length;visited.add(next.id);node=next;
 }
 if(!forward.length)return false;
 p.patrol={start:p.node,end:node.id,forward,reverse};p.route=forward;p.routeIndex=0;p.edge=forward[0];p.progress=0;p.destination=node.id;return true;
}
