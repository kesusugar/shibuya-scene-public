// What puts a car on the road.
//
// No vehicle in this scene casts anything: look.mjs gates shadow casting on a name whitelist
// that no vehicle mesh matches, and the traffic renderer draws every car at a fixed height
// regardless of the ground under it. The result is a city of cars hovering over their own
// street, which the vehicle audit found and which no amount of bodywork fixes.
//
// A shadow map is the wrong tool at this scale -- the key light's map covers 170 metres, so a
// car occupies a handful of texels and comes out as a grey smear. What the eye wants is a
// darkening where the tyres meet the road. So: one plane, one material, one draw call for
// every vehicle on screen, no texture and no lighting term. Same shape as the crowd's
// contact shadows in src/life/shadows.mjs, and for the same reasons.
import {InstancedMesh,PlaneGeometry,ShaderMaterial,Object3D,Color,DynamicDrawUsage} from 'three';

export const VEHICLE_SHADOW=Object.freeze({
 lift:.012,        // off the road, or it fights the surface for the same pixels
 bodyOpacity:.30,  // the mass under the floorpan
 tyreOpacity:.46,  // ...and the four places it actually touches
 tyreSpread:1.5,   // multiples of tyre width
 bodyInset:.86,    // a shadow the full size of the car reads as a painted rectangle
 // Falloff exponents. Two is an ellipse, which is what a tyre patch wants; four is a rounded
 // rectangle, which is what a car floorpan wants. One draw call serves both because the
 // exponent rides in the instance colour.
 tyrePower:2, bodyPower:4.5
});

export function createVehicleShadows(capacity){
 const geometry=new PlaneGeometry(1,1).rotateX(-Math.PI/2);
 const material=new ShaderMaterial({
  transparent:true,depthWrite:false,
  vertexShader:`
   varying vec2 vUv;varying vec3 vShape;
   // instanceColor is NOT declared here. A ShaderMaterial gets three.js's own vertex
   // prefix, which already declares it under this same #ifdef, and declaring it again is a
   // redefinition: the program fails to compile, the renderer raises the shader-error
   // banner, and every vehicle loses its shadow to useProgram: program not valid. The
   // guard stays because the attribute only exists once a colour has been written.
   void main(){
    vUv=uv;
    vShape=vec3(2.0,0.3,0.0);
    #ifdef USE_INSTANCING_COLOR
     vShape=instanceColor;
    #endif
    vec4 p=vec4(position,1.0);
    #ifdef USE_INSTANCING
     p=instanceMatrix*p;
    #endif
    gl_Position=projectionMatrix*modelViewMatrix*p;
   }`,
  // vShape.x is the falloff exponent, vShape.y the strength. Discarding the tail costs less
  // than blending a pixel that is very nearly transparent.
  fragmentShader:`
   varying vec2 vUv;varying vec3 vShape;
   void main(){
    vec2 p=(vUv-.5)*2.0;
    float d=pow(abs(p.x),vShape.x)+pow(abs(p.y),vShape.x);
    float a=pow(max(0.0,1.0-d),1.45)*vShape.y;
    if(a<.004)discard;
    gl_FragColor=vec4(.015,.02,.026,a);
   }`
 });

 const size=Math.max(1,capacity);
 const mesh=new InstancedMesh(geometry,material,size);
 mesh.instanceMatrix.setUsage(DynamicDrawUsage);
 mesh.frustumCulled=false;mesh.renderOrder=1;
 mesh.name='vehicle-contact-shadows';mesh.count=0;
 // Forces the instance colour attribute into existence before the first frame writes to it.
 mesh.setColorAt(0,new Color(VEHICLE_SHADOW.tyrePower,VEHICLE_SHADOW.tyreOpacity,0));

 const obj=new Object3D(),colour=new Color();
 let cursor=0,disposed=false;
 const place=(x,ground,z,heading,width,length,power,strength)=>{
  if(disposed||cursor>=size)return false;
  obj.position.set(x,ground+VEHICLE_SHADOW.lift,z);
  obj.rotation.set(0,heading,0);
  obj.scale.set(width,1,length);
  obj.updateMatrix();
  mesh.setMatrixAt(cursor,obj.matrix);
  mesh.setColorAt(cursor,colour.setRGB(power,strength,0));
  cursor++;return true;
 };

 return {
  mesh,
  begin(){cursor=0;},
  /**
   * One vehicle: a soft rectangle under the floorpan, and a patch at each tyre.
   *
   * `contacts` are wheel positions in the vehicle's own frame, so a car that is leaning or
   * riding a crown still has its shadows where its tyres are. Without them the whole car
   * darkens uniformly and reads as a black blob sliding along under the body, which is the
   * failure this is meant to avoid.
   */
  add(state,dimensions,contacts=null){
   const ground=state.y??0;
   const sin=Math.sin(state.heading),cos=Math.cos(state.heading);
   place(state.x,ground,state.z,state.heading,
    dimensions.width*VEHICLE_SHADOW.bodyInset,dimensions.length*VEHICLE_SHADOW.bodyInset,
    VEHICLE_SHADOW.bodyPower,VEHICLE_SHADOW.bodyOpacity);
   if(!contacts)return;
   const patch=dimensions.radius*.62*VEHICLE_SHADOW.tyreSpread;
   for(const [x,,z] of contacts){
    place(state.x+x*cos+z*sin,ground,state.z-x*sin+z*cos,state.heading,
     patch,patch*1.7,VEHICLE_SHADOW.tyrePower,VEHICLE_SHADOW.tyreOpacity);
   }
  },
  end(){mesh.count=cursor;mesh.instanceMatrix.needsUpdate=true;
   if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;},
  get drawn(){return cursor;},
  dispose(){if(disposed)return;disposed=true;
   geometry.dispose();material.dispose();mesh.removeFromParent();mesh.dispose?.();}
 };
}
