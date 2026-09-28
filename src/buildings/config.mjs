import {HERO_IDS} from '../data/normalize.mjs';
export const BUILDINGS=Object.freeze({limit:250,roadConflictRatio:.25,roadConflictArea:10,floorHeight:3.4,base:.15,minHeight:3.4,maxHeight:180,minArea:4,maxArea:50000,windowOffset:.035,windowPitch:2.8,roofMargin:.4,maxWindowsPerBuilding:1400});
export const ARCHETYPES=['plain','shop','band','grid','balcony','curtain','zakkyo'];
// Plots raised to carry the advertising the reference frame puts on them.
//
// The reference image's centre block is a single tall tower; the OSM data gives this plot
// 24 m, which is not enough facade for the advertisements the reference stacks on it.
// 38 m is where the stack stops being limited by the wall's height and starts being limited
// by its width, so it is the shortest this plot can be without costing the advertisements
// anything — measured with the ground floor reserved for the shopfront, which the signage
// has to clear. No footprint is changed, only the extrusion.
//
// The plot immediately left of QFRONT, where the reference actually puts these signs, was
// measured and rejected: the blocks in front leave only a 2.9 m strip of its 14 m facade
// visible at any height below 58 m, and even at 58 m the advertisements resolve about a
// third of the size they reach here.
export const HEIGHT_OVERRIDES=Object.freeze({'way/136690966':38});
// Additional Mark City West footprint, not a dedicated building builder.
export const RESERVED_IDS=new Set([...Object.values(HERO_IDS),'way/54500467']);
export function reservationReason(source,landmarks={}){
 if(RESERVED_IDS.has(source.id)||Object.values(landmarks).some(h=>h.id===source.id))return 'hero-definition';
 if(source.tags?.building==='train_station'||source.tags?.railway==='station')return 'station-structure';
 return null;
}
export const ARCHETYPE_COLORS={plain:0xb4afa4,shop:0xb9a78b,band:0xb1b8ba,grid:0xa3acb0,balcony:0xbdafa0,curtain:0x697b88,zakkyo:0x9b9690};
