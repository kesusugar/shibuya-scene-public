import {Float32BufferAttribute,InstancedBufferAttribute,DynamicDrawUsage} from 'three';
export function tagLimb(geometry,pivot=0,side=0){
 const values=new Float32Array(geometry.attributes.position.count*2);
 for(let i=0;i<values.length;i+=2){values[i]=pivot;values[i+1]=side;}
 geometry.setAttribute('limbJoint',new Float32BufferAttribute(values,2));return geometry;
}
export function addGait(geometry,capacity){
 if(!geometry.attributes.limbJoint)tagLimb(geometry);
 geometry.setAttribute('gait',new InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(DynamicDrawUsage));
 geometry.setAttribute('action',new InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(DynamicDrawUsage));
}
export function installGait(material){
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
attribute vec2 limbJoint;
attribute float gait;
attribute float action;
mat2 gaitRotation(float angle){float s=sin(angle),c=cos(angle);return mat2(c,s,-s,c);}`);
  shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
float armMask=step(.5,abs(limbJoint.y))*(1.0-step(.8,abs(limbJoint.y)));
float actionSide=mix(.22,-1.15,step(0.0,limbJoint.y));
float limbAngle=gait*limbJoint.y+action*armMask*actionSide;
objectNormal.yz=gaitRotation(limbAngle)*objectNormal.yz;`);
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
transformed.yz=gaitRotation(limbAngle)*(transformed.yz-vec2(limbJoint.x,0.0))+vec2(limbJoint.x,0.0);`);
 };
 material.customProgramCacheKey=()=> 'player-near-crowd-gait-v2';
}
