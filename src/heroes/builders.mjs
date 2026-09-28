import {mass,setback,bands,grid,roofMass,placeholder,anchor,edges,primaryFacade,roundFront} from './model.mjs';
const sequence=(start,end,step)=>{const a=[];for(let y=start;y<end;y+=step)a.push(y);return a;};
export function buildQFront(h){
 const base=h.footprint,upper=setback(h,.985),roof=setback(h,.76,.73);
 mass(h,'commercial-base',base,0,7.5,'concreteDark');mass(h,'media-block',base,7.5,38.5);mass(h,'upper-storeys',upper,38.5,42.5,'glassDark');mass(h,'roof-crown',roof,42.5,h.height);
 // Segmented screen follows the real curved south frontage instead of cutting through it.
 const front=edges(base).filter(e=>e.length>3&&e.normal[0]*h.primaryFacade.direction[0]+e.normal[1]*h.primaryFacade.direction[1]>.85);
 for(const e of front)placeholder(h,e,'largeScreen',e.length-.25,h.screenHeight,h.screenBottom+h.screenHeight/2,{logicalId:'qfront-main-screen'});
 const frontIndices=new Set(front.map(e=>e.index));grid(h,base,1,38.5,{pitch:2.8,width:2.3,height:2.7,skip:(e,y)=>frontIndices.has(e.index)&&y>h.screenBottom-2&&y<h.screenBottom+h.screenHeight+2});grid(h,upper,38.5,42.5,{floor:3,width:1.5,height:1.8});
 bands(h,base,[3.8,7.5,33,36.5,38.4],{thickness:.22});bands(h,upper,[42.4],{thickness:.35});
 anchor(h,h.primaryFacade,'facadeSign',Math.min(12,h.primaryFacade.length-.5),1.2,35,2);anchor(h,h.primaryFacade,'emissiveFacade',Math.min(15,h.primaryFacade.length-.5),3,39,1);
 const entrance=h.primaryFacade;
 placeholder(h,entrance,'entranceRecess',Math.min(6,entrance.length-.5),2.7,1.6);
 roofMass(h,roof,h.height,{width:4,depth:2,height:1.2});
}
export function buildShibuya109(h){
 const base=h.footprint,rear=setback(h,.84,.88,-2,0),round=roundFront(h);
 mass(h,'retail-podium',base,0,6,'concreteDark');mass(h,'rear-commercial-shoulder',rear,6,26.5);mass(h,'rounded-front-tower',round,6,30.8,'metal');
 // Crown stays within the rounded tower; the ellipse is clipped to the source footprint.
 const crown={outer:round.outer.map(p=>{const c=round.outer.reduce((s,p)=>[s[0]+p[0]/round.outer.length,s[1]+p[1]/round.outer.length],[0,0]);return p.map((v,i)=>c[i]+(v-c[i])*.92);}),holes:[]};mass(h,'cylindrical-crown',crown,30.8,h.height,'concreteLight');
 bands(h,base,[3.5,6],{thickness:.3});bands(h,rear,sequence(10,26,4),{thickness:.18});grid(h,rear,7,26,{pitch:3.8,width:1.2,height:2.1});
 grid(h,round,7,29,{pitch:1.1,floor:4,width:.65,height:3.2,material:'glassDark',mullions:true});bands(h,round,[8,28.8,30.7],{thickness:.12});
 const front=primaryFacade(round,[h.sourceCentroid[0]+100,h.sourceCentroid[1]]);placeholder(h,front,'rooftopSign',Math.min(front.length-.3,4),2.3,32);anchor(h,front,'emissiveFacade',Math.min(front.length-.3,4),15,18);
 roofMass(h,rear,26.5,{width:4,depth:3,height:1.8});
}
export function buildMagnet(h){
 const p=h.footprint,u=setback(h,.9,.94),c=setback(h,.72,.84);mass(h,'commercial-base',p,0,7,'concreteDark');mass(h,'media-block',p,7,24,'glassDark');mass(h,'upper-terrace',u,24,32,'concreteDark');mass(h,'roof-parapet-crown',c,32,h.height,'metal');
 // The building reads as one dark media wall facing the crossing: a framed vision with the
 // wordmark over it, and the return facade carrying a tall tenant panel. The vision is kept
 // at the screen atlas's own 2:1 so its artwork is not stretched onto the quad.
 // The return facade is the one turned partly toward the crossing with the front, not the
 // long rear wall, which shares no facing with it at all.
 const facing=e=>e.normal[0]*face.normal[0]+e.normal[1]*face.normal[1];
 const face=h.primaryFacade,side=edges(p).filter(e=>e.index!==face.index&&e.length>6&&facing(e)>.3&&facing(e)<.9).sort((a,b)=>b.length-a.length)[0];
 const visionWidth=Math.min(10.4,face.length-1.4),visionHeight=visionWidth/2,visionY=14.6;
 // `art` names a tile on the reference sheet, so these read as this building's own signs
 // rather than as two of the thirty-two shared designs the generic atlas hands out.
 placeholder(h,face,'largeScreen',visionWidth,visionHeight,visionY,{logicalId:'magnet-main-vision'}).art=203;
 anchor(h,face,'facadeSign',Math.min(9,face.length-1.4),2.4,visionY+visionHeight/2+2.4,2).art=201;
 if(side)anchor(h,side,'facadeSign',Math.min(3,side.length-.5),8,15,1).art=202;
 anchor(h,face,'rooftopSign',face.length*.6,1.8,31);
 // Windows stop where the media wall starts, so the vision and wordmark sit on dark glass.
 const clear=[visionY-visionHeight/2-1.5,visionY+visionHeight/2+2.4+1.2+1.5];
 grid(h,p,1,23,{pitch:3.8,width:2.3,height:1.8,material:'glassDark',skip:(e,y)=>e.index===face.index&&y>clear[0]&&y<clear[1]});grid(h,u,24,32,{pitch:2.5,width:1.6,height:2.4});bands(h,p,[7,12,18,23.9],{thickness:.3});bands(h,u,[27.5,31.8],{thickness:.35});
}
export function buildScrambleSquare(h){
 const p=h.footprint,t=setback(h,.79,.77),upper=setback(h,.73,.72),c=setback(h,.66,.64);mass(h,'retail-podium',p,0,54,'concreteLight');mass(h,'slender-curtain-tower',t,54,199,'glass');mass(h,'upper-setback',upper,199,222,'glassDark');mass(h,'skyline-crown',c,222,h.height,'metal');
 grid(h,p,3,53,{pitch:4,floor:4.2,width:3.2,height:3.3,material:'glassDark'});grid(h,t,55,198,{pitch:3.4,floor:4,width:2.8,height:3.6});grid(h,upper,200,221,{pitch:3.4,floor:4,width:2.8,height:3.6});bands(h,p,[14,30,53.8],{thickness:.6});bands(h,c,[223,h.height-.3],{thickness:.35});anchor(h,h.primaryFacade,'emissiveFacade',Math.min(25,h.primaryFacade.length*.6),30,110);roofMass(h,c,h.height,{width:5,depth:4,height:2});
}
export function buildSeibuA(h){
 const p=h.footprint,u=setback(h,.96,.94),r=setback(h,.82,.75);mass(h,'department-store-plinth',p,0,6.5,'concreteDark');mass(h,'horizontal-department-block',u,6.5,27.5);mass(h,'recessed-roofline',r,27.5,h.height,'metal');bands(h,u,sequence(9,28,3.7),{thickness:.6});grid(h,u,7,27,{pitch:5,width:3.8,height:1.25});grid(h,p,0,6.3,{floor:3,pitch:4,width:3,height:2});placeholder(h,primaryFacade(u,[0,0]),'facadeSign',12,1.6,25);roofMass(h,r,h.height,{width:6,depth:4,height:1.2});
}
export function buildSeibuB(h){
 const p=h.footprint,u=setback(h,.94,.94),r=setback(h,.77,.88);mass(h,'broad-retail-base',p,0,9);mass(h,'upper-horizontal-block',u,9,24.5,'concreteDark');mass(h,'stepped-back-top',r,24.5,h.height,'concreteLight');bands(h,p,[4.5,8.9],{thickness:.5});bands(h,u,[12,16,20,24.3],{thickness:.65,color:0xd2d0c6});grid(h,u,9.5,24,{pitch:4.8,width:3.6,height:1.15,material:'glassDark'});grid(h,r,25,h.height,{pitch:3.8,width:2.5,height:1.6});anchor(h,h.primaryFacade,'facadeSign',14,2,8);roofMass(h,r,h.height,{width:7,depth:3,height:1.4});
}
export function buildMarkCity(h){
 const p=h.footprint,east=h.variant==='east',lower=setback(h,.93,.9),tower=setback(h,east?.55:.68,east?.76:.72,east?-5:5,0),crown=setback(h,east?.5:.6,east?.7:.66,east?-5:5,0);
 mass(h,'elongated-commercial-podium',p,0,19,'concreteLight');mass(h,'connected-stepped-shoulder',lower,19,28,'concreteDark');mass(h,east?'hotel-tower':'office-tower',tower,28,h.height-5,east?'concreteLight':'glass');mass(h,'long-roofline',crown,h.height-5,h.height,'metal');
 bands(h,p,[5,10,15,18.9],{thickness:.25});bands(h,lower,[23,27.8],{thickness:.28});grid(h,tower,29,h.height-5,{pitch:east?2.9:3.5,floor:3.3,width:east?1.5:2.8,height:east?1.7:2.7});bands(h,tower,sequence(32,h.height-5,6.6),{thickness:.12});anchor(h,h.primaryFacade,'facadeSign',18,2.3,17);roofMass(h,crown,h.height,{width:5,depth:3,height:2});
}
export function buildShibuyaStream(h){
 const p=h.footprint,podium=setback(h,.97,.95),tower=setback(h,.72,.73),top=setback(h,.66,.67);mass(h,'stream-public-podium',p,0,18,'concreteDark');mass(h,'hotel-transition',podium,18,54,'concreteLight');mass(h,'offset-panel-office-tower',tower,54,171,'glass');mass(h,'asymmetric-roof-step',top,171,h.height,'metal');
 grid(h,podium,20,54,{pitch:3.4,floor:3.8,width:2.8,height:2.6});grid(h,tower,55,170,{pitch:3.1,floor:4,width:2.45,height:3.6});bands(h,podium,[18.2,36,53.8],{thickness:.5});bands(h,tower,sequence(62,170,12),{thickness:.2});anchor(h,primaryFacade(tower,[0,0]),'emissiveFacade',Math.min(20,h.primaryFacade.length*.6),35,130);roofMass(h,top,h.height,{width:4,depth:3,height:2});
}
export const BUILDERS={qfront:buildQFront,'109':buildShibuya109,magnet:buildMagnet,scrambleSquare:buildScrambleSquare,seibuA:buildSeibuA,seibuB:buildSeibuB,markCity:buildMarkCity,stream:buildShibuyaStream};
