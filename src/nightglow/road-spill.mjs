// Art-directed billboard spill, not screen-space or ray-traced reflection.
// Shared asphalt shader only: no extra draw calls, textures or lights.
export const ROAD_WET_RESPONSE=Object.freeze({dryFloor:.25,wetPeak:.9,distantRipple:.72,rippleFloor:.38,rippleRange:.72});
export const ROAD_SPILL_GLSL = `
float roadHash(vec2 p) {
 return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
}
float roadNoise(vec2 p) {
 vec2 cell=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(roadHash(cell),roadHash(cell+vec2(1.,0.)),f.x),
 mix(roadHash(cell+vec2(0.,1.)),roadHash(cell+vec2(1.,1.)),f.x),f.y);
}
float roadStreak(vec2 q, vec2 origin, vec2 axis, float width, float reach) {
 vec2 delta=q-origin;
 float along=dot(delta,axis), across=dot(delta,vec2(-axis.y,axis.x));
 float endFade=smoothstep(0.0,2.0,along)*(1.0-smoothstep(reach*.55,reach,along));
 float sideFade=exp(-across*across/(width*width));
 return endFade*sideFade;
}
vec3 billboardRoadSpill(vec2 q) {
 // World-anchored wet patches and stretched ripples, shared across all sources.
 // Fade subpixel detail with derivatives to avoid distant shimmer.
 float wetNoise=roadNoise(q*.42);
 float ripple=roadNoise(vec2(q.x*1.8,q.y*5.5));
 float detail=1.0-smoothstep(.15,.65,length(fwidth(q*5.5)));
 float wet=smoothstep(.23,.76,wetNoise);
 float breakup=mix(${ROAD_WET_RESPONSE.distantRipple},${ROAD_WET_RESPONSE.rippleFloor}+${ROAD_WET_RESPONSE.rippleRange}*ripple,detail);
 vec3 light=vec3(0.0);
 light+=vec3(.12,.26,.68)*roadStreak(q,vec2(-9.,-23.),vec2(0.,1.),3.8,33.);
 light+=vec3(.62,.055,.025)*roadStreak(q,vec2(-21.,-20.),normalize(vec2(.35,1.)),2.8,28.);
 light+=vec3(.48,.28,.09)*roadStreak(q,vec2(22.,-14.),normalize(vec2(-1.,.3)),3.4,24.);
 light+=vec3(.44,.23,.065)*roadStreak(q,vec2(-23.,11.),normalize(vec2(1.,-.25)),2.5,18.);
 return light*mix(${ROAD_WET_RESPONSE.dryFloor},${ROAD_WET_RESPONSE.wetPeak},wet)*breakup;
}`;
