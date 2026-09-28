// Shared artwork/geometry coordinates; image v=0 is the top of the facade.
export const RETAIL_LAYOUT=Object.freeze({bays:12,doors:Object.freeze([2,7,10]),height:7.25,centerY:3.78,inset:.14});
export function retailPoint(edgeLength,bay,u,v){
 const width=edgeLength-2*RETAIL_LAYOUT.inset;
 return {along:RETAIL_LAYOUT.inset+width*(bay+u)/RETAIL_LAYOUT.bays,y:RETAIL_LAYOUT.centerY+RETAIL_LAYOUT.height*(.5-v),bayWidth:width/RETAIL_LAYOUT.bays};
}
