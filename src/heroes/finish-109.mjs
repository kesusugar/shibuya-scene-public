import {Group,Mesh,PlaneGeometry,MeshStandardMaterial,CanvasTexture,DataTexture,SRGBColorSpace} from 'three';
import {edges,facadePoint,roundFront} from './model.mjs';
import {merge} from '../geo/geometry.mjs';
export function finish109(hero){
 const root=new Group();root.name='109-finish';if(!hero)return {root,dispose(){}};
 const canvas=typeof document==='undefined'?null:document.createElement('canvas');let texture;
 if(canvas){canvas.width=1024;canvas.height=2048;const c=canvas.getContext('2d');c.fillStyle='#cbd3da';c.fillRect(0,0,1024,2048);c.strokeStyle='#697988';c.lineWidth=2;for(let x=0;x<=1024;x+=32){c.beginPath();c.moveTo(x,0);c.lineTo(x,2048);c.stroke();}for(let y=0;y<=2048;y+=48){c.beginPath();c.moveTo(0,y);c.lineTo(1024,y);c.stroke();}c.fillStyle='#f4f3ef';c.fillRect(0,0,1024,345);c.textAlign='center';c.fillStyle='#dc303f';c.font='48px Georgia';c.fillText('S H I B U Y A',512,92);c.font='italic 220px Georgia';c.fillText('109',512,294);c.fillStyle='#202330';c.fillRect(0,355,1024,100);c.fillRect(180,1810,664,90);c.fillStyle='#fff9ed';c.font='bold 42px sans-serif';c.fillText('SHIBUYA 109',512,1870);c.font='24px sans-serif';c.fillText('FASHION   /   SHIBUYA TOKYO',512,414);for(let y=550;y<1760;y+=180)c.fillRect(430,y,164,37);texture=new CanvasTexture(canvas);}else texture=new DataTexture(new Uint8Array([210,218,225,255]),1,1);
 texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;
 const material=new MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:0xffffff,emissiveIntensity:.08,roughness:.65}),parts=[],round=roundFront(hero),n=hero.primaryFacade.direction,t=[-n[1],n[0]],values=round.outer.map(p=>p[0]*t[0]+p[1]*t[1]),lo=Math.min(...values),hi=Math.max(...values);
 for(const e of edges(round)){if(e.normal[0]*n[0]+e.normal[1]*n[1]<-.1)continue;const g=new PlaneGeometry(e.length+.015,27.8),uv=g.attributes.uv;for(let i=0;i<uv.count;i++){const q=uv.getX(i)?e.a:e.b;uv.setX(i,1-(q[0]*t[0]+q[1]*t[1]-lo)/(hi-lo));}g.rotateY(e.heading);g.translate(...facadePoint(e,e.length/2,19.5,.18));parts.push(g);}
 const geometry=merge(parts);parts.forEach(g=>g.dispose());const mesh=new Mesh(geometry,material);mesh.name='hero-109-finish';root.add(mesh);return {root,dispose(){root.removeFromParent();geometry.dispose();material.dispose();texture.dispose();}};
}
