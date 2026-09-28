// Render-time layout: retain the audited facade planes, replace sticker grids.
export function commercialLayout(signs, count=32) {
  const groups=new Map(), result=[];
  for(const s of signs){
    if(s.screenUV||['blade','directory','rooftop'].includes(s.category)){result.push({...s});continue;}
    const key=`${s.hostKey}:${s.edge?.index}:${s.heading.toFixed(4)}`;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);
  }
  for(const list of groups.values()){
    if(list.length<4){result.push(...list.map(s=>({...s})));continue;}
    const base=list[0], left=Math.min(...list.map(s=>s.along-s.width/2)),right=Math.max(...list.map(s=>s.along+s.width/2));
    const bottom=Math.min(...list.map(s=>s.position[1]-s.height/2)),top=Math.max(...list.map(s=>s.position[1]+s.height/2));
    const cols=Math.max(1,Math.min(3,Math.floor((right-left)/7)));
    // A cell tuned for a wide facade is the wrong unit on a narrow one. Where only a single
    // column fits, 5.5 m rows turn a tenant tower's stack of small signs into four slabs
    // the height of a storey and a half; the narrow zakkyo fronts around the crossing read
    // as a column of tenant panels instead, so those rows follow the panels rather than the
    // cell. Wide faces keep the grid they were tuned for.
    const narrow=cols===1;
    const rows=Math.max(1,Math.min(narrow?10:5,Math.floor((top-bottom)/(narrow?2.6:5.5))));
    const cellW=(right-left)/cols,cellH=(top-bottom)/rows;
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const along=left+cellW*(col+.5), y=bottom+cellH*(row+.5), shift=along-base.along;
      result.push({...base,id:`${base.id}:commercial:${row}:${col}`,category:'billboard',along,
        width:cellW*.82,height:Math.min(cellH*.78,cellW*.55),
        position:[base.position[0]+base.edge.tangent[0]*shift,y,base.position[2]+base.edge.tangent[1]*shift]});
    }
  }
  const used=new Map();
  return result.filter(s=>{
    if(s.screenUV)return true;
    const building=s.buildingId??s.hostKey;if(!used.has(building))used.set(building,new Set());const ids=used.get(building);
    const vertical=['blade','directory'].includes(s.category);
    const candidates=Array.from({length:count},(_,i)=>i).filter(i=>[2,5].includes(i%8)===vertical);
    const seed=[...building].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
    for(let n=0;n<candidates.length;n++){const id=candidates[(n+seed)%candidates.length];if(!ids.has(id)){s.variant=id;ids.add(id);return true;}}
    return false; // No repeated advertiser on any face of the same building.
  });
}
