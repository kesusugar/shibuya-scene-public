/**
 * Patterns on clothes (docs/PLAN-LOOKS-AND-FLEET.md, Step A).
 *
 * A pattern is a function of the BIND-POSE position -- the vertex before skinning -- so a
 * stripe is painted on the cloth and moves with the body; it never slides across a walking
 * person. Both CC0 rigs are authored at about 1.8 m in model units, y up, facing +z, so the
 * bind-pose coordinates are already body-relative metres; the per-person height scale is
 * applied to the whole mesh afterwards, which scales the stripes with the person.
 *
 * One GLSL function, `garmentPattern`, is shared by the HQ crowd shader and the RUN 6.8 near
 * characters' garment material, so a person handed between the two keeps the same stripes.
 * A test pins that both shaders embed this exact string.
 *
 * THE CROWD HAS NO SPARE ATTRIBUTE (§16a: the crowd shader is at WebGL's 16). The pattern id
 * rides in the top three bits of the packed top and bottom colours, which drop to 7 bits a
 * channel: 3 + 21 = 24 bits, which a float still holds exactly.
 */

/** Pattern ids. 3 bits; 7 is unused. The order is the packed value -- do not reorder. */
export const PATTERN=Object.freeze({solid:0,border:1,pinstripe:2,check:3,openJacket:4,denim:5,print:6});
export const PATTERN_NAMES=Object.freeze(Object.keys(PATTERN));

const P21=2097152,P14=16384,P7=128;
const q7=c=>Math.round(c*127/255);
const e7=q=>Math.round(q*255/127);

/**
 * Pack an sRGB hex and a pattern id into one float-exact integer (< 2^24).
 * The colour keeps 7 bits a channel; the error is at most 1/255 per channel.
 */
export function packGarment(hex,pattern=0){
 const r=q7((hex>>16)&255),g=q7((hex>>8)&255),b=q7(hex&255);
 return (pattern&7)*P21+r*P14+g*P7+b;
}
/** The inverse, for tests and for the CPU side. */
export function unpackGarment(v){
 const pattern=Math.floor(v/P21),c=v-pattern*P21;
 const r=Math.floor(c/P14),g=Math.floor((c%P14)/P7),b=c%P7;
 return {pattern,hex:(e7(r)<<16)|(e7(g)<<8)|e7(b)};
}

/**
 * The shared pattern function. `base` is the garment's linear colour, `id` the pattern id,
 * `p` the bind-pose position in metres. Every pattern fades to its flat colour once a pixel
 * covers a good part of its period (`fwidth`), so nothing shimmers or moirés at distance.
 * Must end in a newline (§16a).
 */
export const GARMENT_PATTERN_GLSL=`
vec3 garmentAlt(vec3 base,float k){
 float l=dot(base,vec3(0.2126,0.7152,0.0722));
 return l>0.18?base*(1.0-0.55*k):min(vec3(1.0),base+vec3(0.10,0.10,0.11)*k+base*1.2*k);
}
float garmentBand(float x,float period,float width,float px){
 float f=abs(fract(x/period)-0.5)*2.0;
 float aa=max(px/period,1e-4)*2.0;
 return 1.0-smoothstep(width-aa,width+aa,f);
}
vec3 garmentPattern(vec3 base,float id,vec3 p){
 if(id<0.5)return base;
 float px=length(fwidth(p));
 vec3 c=base;float period=0.06;
 if(id<1.5){                         // border: horizontal stripes
  period=0.055;c=mix(base,garmentAlt(base,1.0),garmentBand(p.y,period,0.45,px));
 }else if(id<2.5){                   // pinstripe: fine, faint vertical lines
  period=0.022;c=mix(base,garmentAlt(base,0.55),garmentBand(p.x,period,0.12,px));
 }else if(id<3.5){                   // gingham / check
  period=0.05;
  float a=garmentBand(p.x,period,0.5,px),b=garmentBand(p.y,period,0.5,px);
  c=mix(base,garmentAlt(base,0.9),0.5*(a+b));
 }else if(id<4.5){                   // two-tone open jacket: a lighter inner panel on the front
  period=0.02;
  float front=smoothstep(0.0,0.03,p.z);
  float panel=1.0-smoothstep(0.045,0.06,abs(p.x));
  vec3 inner=mix(vec3(0.80,0.79,0.76),vec3(0.05,0.05,0.06),step(0.35,dot(base,vec3(0.2126,0.7152,0.0722))));
  return mix(base,inner,front*panel);
 }else if(id<5.5){                   // denim: twill and a lighter outer seam
  period=0.012;
  float tw=sin((p.x*0.7+p.y)*520.0)*0.5+0.5;
  float seam=1.0-smoothstep(0.004,0.009,abs(abs(p.x)-0.16));
  c=base*(0.88+0.24*tw)+base*0.6*seam;
 }else{                              // small print: a hashed dot grid
  period=0.032;
  vec2 cell=floor(p.xy/period);
  vec2 f=fract(p.xy/period)-0.5;
  float h=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);
  float dot1=1.0-smoothstep(0.13,0.13+max(px/period,1e-3)*2.0,length(f-(h-0.5)*0.3));
  c=mix(base,garmentAlt(base,1.0),dot1);
 }
 float fade=1.0-smoothstep(0.25,0.6,px/period);
 return mix(base,c,fade);
}
`;

/** Unpacks a 7-bit garment value in the HQ crowd shader; sRGB -> linear as unpackRGB does. */
export const GARMENT_UNPACK_GLSL=`
float garmentId(float v){return floor(floor(v+0.5)/2097152.0);}
vec3 unpackGarment(float v){
 v=floor(v+0.5);
 float c=v-garmentId(v)*2097152.0;
 float r=floor(c/16384.0);
 float g=floor(mod(c,16384.0)/128.0);
 float b=mod(c,128.0);
 vec3 s=vec3(r,g,b)/127.0;
 return mix(pow(s*0.9478672986+0.0521327014,vec3(2.4)),s*0.0773993808,step(s,vec3(0.04045)));
}
`;
