import {SpatialIndex} from '../geo/core.mjs';

// Store each index item once; reconstruct bucket membership without geometry work.
export function packContext(context){
 return Object.fromEntries(Object.entries(context).filter(([key])=>!['ground','generic'].includes(key)).map(([key,value])=>[key,value instanceof SpatialIndex?{staticIndex:true,size:value.size,items:[...value.items].map(([id,item])=>[id,item.bounds,item.value])}:value]));
}
export function restoreContext(context,ground,generic){
 return {...Object.fromEntries(Object.entries(context).map(([key,value])=>{
  if(!value?.staticIndex)return [key,value];
  const index=new SpatialIndex(value.size);
  for(const [id,box,item] of value.items)index.insert(id,box,item);
  return [key,index];
 })),ground,generic};
}
