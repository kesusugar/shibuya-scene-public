// The exclusion is the entire crossing plaza, not just its painted stripes.
export function crossingArea(crossings){
 const points=crossings.filter(c=>c.kind!=='normal').flatMap(c=>c.points).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const half=list=>{const h=[];for(const p of list){while(h.length>1&&cross(h.at(-2),h.at(-1),p)<=0)h.pop();h.push(p);}h.pop();return h;};
 const polygon=[...half(points),...half([...points].reverse())];
 return {polygon,contains(x,z,margin=0){
   if(polygon.length<3)return false;
   // Convex half-plane expansion also covers the complete vehicle footprint.
   return polygon.every((a,i)=>{const b=polygon[(i+1)%polygon.length];return cross(a,b,[x,z])>=-(margin+2.5)*Math.hypot(b[0]-a[0],b[1]-a[1]);});
 }};
}
