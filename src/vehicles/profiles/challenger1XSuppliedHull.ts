// Independent first-party construction from the owner-selected file's scalar
// planes, circular sections and hardware dimensions. No source topology.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { roofSheet, beamBetween } from './measuredPrimitives.ts';
import { c1Length as m, c1Point as p } from './challenger1XSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, cylZ, torus } = KIT;
type Station = readonly [z: number, half: number, low: number, high: number];
function slab(rows: readonly Station[]): THREE.BufferGeometry {
  return sectionSolid(rows.map(([z,w,lo,hi])=>({z:p(0,0,z)[2],ring:[
    [p(-w,0,0)[0],p(0,lo,0)[1]],[p(w,0,0)[0],p(0,lo,0)[1]],
    [p(w,0,0)[0],p(0,hi,0)[1]],[p(-w,0,0)[0],p(0,hi,0)[1]],
  ]})));
}
function equipment(P:TankBuilderPort,g:THREE.BufferGeometry,x:number,y:number,z:number,bucket='hullDetail'):void{
  P.addEquipment(bucket,g,...p(x,y,z));
}
function caseBox(P:TankBuilderPort,x:number,y:number,z:number,w:number,h:number,d:number):void{
  equipment(P,box(m(w),m(h),m(d)),x,y,z);
}
function tub(P:TankBuilderPort):void{
  const rows:readonly Station[]=[[-184.68,38.5,49,50],[-179,37.1,38.3,50.3],
    [-171,33.8,22.8,50.5],[-157,31.28,17.52,50.51],[-110,31.28,17.52,50.51],
    [0,31.28,18.92,50.51],[65,31.28,19.08,50.51],[75,31.28,21.2,50.51],
    [80,31.25,31.19,46.76],[84,31.25,37.59,44.56],[85.8,31.25,40.5,44.36],
    [87.2047,31.25,41.4,42.1]];
  P.add('hull',slab(rows));
  // Approved concealed-only mechanical correction: the supplied flared tip
  // continues through its track material. End the outboard return 54.7 mm
  // early, behind the unchanged guards/treads; central tub/axles stay exact.
  P.add('hull',slab([[74,45.6,21.6,24.1],[80,45.55,31.19,33.60],
    [84,45.53,37.60,39.91],[84.8,45.525,38.87,41.17]]));
}
function sponson(P:TankBuilderPort,side:number):void{
  const rows:readonly(readonly[number,number,number,number])[]=[[-194.8425,67.89,60.82,64.7638],
    [-130,67.89,60.82,64.7638],[-70,67.82,60.79,64.7638],[-10,67.78,60.4,64.56],
    [20,67.72,60.53,64.26],[50,67.70,57.9,60.78],[70,67.70,54.28,54.54],
    [79.9,67.61,50.45,50.29],[86.496,66.5,49.9,49.7]];
  P.add('hull',sectionSolid(rows.map(([z,w,outer,inner])=>{
    const coords:readonly(readonly[number,number])[]=[[31.2,49.13],[w,49.13],[w,outer-.4],
      [w-.5,outer],[50.7,Math.max(inner,outer)],[37,inner],[31.2,inner]];
    const ring=coords.map(([x,y])=>[p(side*x,0,0)[0],p(0,y,0)[1]] as [number,number]);
    if(side<0)ring.reverse();return{z:p(0,0,z)[2],ring};
  })));
}
function engineRoof(P:TankBuilderPort):void{
  P.add('hull',slab([[-194.8425,50.72,49.5,68.65],[-125,50.72,49.5,69.0],
    [-111,43.2,49.5,66.5],[-83,37.1,49.5,65.05]]));
  for(const side of [-1,1]){
    for(const z of [-179.4,-121.3]){
      equipment(P,cylY(m(5.6),m(5.6),m(1.1),24),side*58.9,66.4,z);
      caseBox(P,side*58.9,67.15,z,2.8,.55,2.4);
    }
    equipment(P,cylZ(m(.6),m(100),12),side*66.2,68.1,-147.0);
    for(const z of [-182,-166,-140,-116])caseBox(P,side*66.2,66.8,z,1.4,2.8,2.4);
    caseBox(P,side*29.2,68.85,-145.1,33.4,.25,40.8);
    for(let i=0;i<12;i++)caseBox(P,side*29.2,69.0,-162.5+i*3.1,31,.15,.6);
    for(const x of [17.5,26.5,35.5,44.5]){
      caseBox(P,side*x,70.0,-190.7,6.9,1.35,4.1);
      caseBox(P,side*x,70.0,-168.4,3.3,2.1,4.2);
    }
  }
  caseBox(P,0,70.0,-182.5,27.8,2.0,3.0);
  caseBox(P,0,67.9,-199.7,12.6,3.4,9.7);
  caseBox(P,0,65.8,-198.2,28.8,.9,11.1);
  for(const x of [-6.2,6.2])P.addEquipment('hullDetail',beamBetween(p(x,58.8,-208),p(x,69.2,-193),m(.9)));
}
function foreDeck(P:TankBuilderPort):void{
  // Lower central driver channel is preserved between the two shoulders.
  P.add('hull',slab([[8,31.4,49.4,63.55],[20,31.4,49.4,63.45],
    [50,31.4,49.3,55.1],[70,31.4,48.3,51.71],[79.8,34.8,47.25,48.3]]));
  for(const side of [-1,1]){
    const x=side*24.6;
    P.add('hull',roofSheet([[p(0,0,16)[2],p(x-9,0,0)[0],p(x+9,0,0)[0],p(0,64.9,0)[1],p(0,64.9,0)[1]],
      [p(0,0,62)[2],p(x-9,0,0)[0],p(x+9,0,0)[0],p(0,59.38,0)[1],p(0,59.38,0)[1]],
      [p(0,0,70)[2],p(x-9,0,0)[0],p(x+9,0,0)[0],p(0,54.54,0)[1],p(0,54.54,0)[1]]],m(1.4)));
  }
  const hatch=roofSheet([[p(0,0,19.8)[2],p(-14.8,0,0)[0],p(14.8,0,0)[0],p(0,60.2,0)[1],p(0,60.2,0)[1]],
    [p(0,0,70.4)[2],p(-14.8,0,0)[0],p(14.8,0,0)[0],p(0,54.9,0)[1],p(0,54.9,0)[1]]],m(1.2));
  P.addHatch('hullDetail',hatch);
  caseBox(P,0,60.8,17,14.76,3.9,2.8);
  caseBox(P,0,59.8,18.6,10.8,1.7,.7);
  for(const x of [-14,14])for(const z of [27,49,66])equipment(P,cylY(m(.6),m(.6),m(.5),10),x,60-(z-20)*.108,z);
}
function frontGuards(P:TankBuilderPort,side:number):void{
  // The actual end roof is a folded thin sheet, not a solid wheel-filling
  // ramp. Its separate lower curled return has open air behind its face.
  const a=Math.min(side*37.05,side*67.87),b=Math.max(side*37.05,side*67.87);
  P.addMudguard(`challenger1-supplied-front-roof-${side}`,'hull',roofSheet([
    [p(0,0,80.67)[2],p(a,0,0)[0],p(b,0,0)[0],p(0,49.88,0)[1],p(0,49.88,0)[1]],
    [p(0,0,95.59)[2],p(a,0,0)[0],p(b,0,0)[0],p(0,48.15,0)[1],p(0,48.15,0)[1]],
    [p(0,0,104.72)[2],p(a,0,0)[0],p(b,0,0)[0],p(0,side<0?40.51:43.98,0)[1],p(0,side<0?43.98:40.51,0)[1]],
  ],m(.59)));
  const fa=Math.min(side*36.5,side*68.5),fb=Math.max(side*36.5,side*68.5);
  P.addMudguard(`challenger1-supplied-front-return-${side}`,'hullDetail',roofSheet([
    [p(0,0,104.5)[2],p(fa,0,0)[0],p(fb,0,0)[0],p(0,42.66,0)[1],p(0,42.66,0)[1]],
    [p(0,0,106)[2],p(fa,0,0)[0],p(fb,0,0)[0],p(0,39.0,0)[1],p(0,39.0,0)[1]],
    [p(0,0,108.2)[2],p(fa,0,0)[0],p(fb,0,0)[0],p(0,33.5,0)[1],p(0,33.5,0)[1]],
  ],m(.48)));
  caseBox(P,side*47.3,54.02,82.0,17.7,7.79,11.6);
  equipment(P,cylZ(m(3.7),m(2.1),28),side*47.3,54.7,86.1);
  equipment(P,cylZ(m(3.05),m(.45),28),side*47.3,54.7,87.24,'hullGlass');
  for(const dx of [-6.4,6.4])caseBox(P,side*47.3+dx,54.8,84,1.0,7.8,7.5);
  caseBox(P,side*47.3,58.0,84,12.8,1.0,7.5);
  equipment(P,cylX(m(1.4),m(5.4),20),side*63.0,54.2,82.4);
}
function sideSkirts(P:TankBuilderPort,side:number):void{
  // The installed source skirts, not the four misplaced centerline export
  // leftovers. Native handling of those separate leftovers awaits owner input.
  installedSkirt(P,side);
  for(const z of[-171.614174,-113.976383,-103.40551,-39.665354,-30.334646,
    33.444882,40.846456,70.629921]){
    caseBox(P,side*69.212597,50.925196,z,.629921,2.559055,3.188976);
  }
  sideApplique(P,side);
}
function installedSkirt(P:TankBuilderPort,side:number):void{
  // A thin, continuous source sheet rises over both end wheels. Its face is
  // planar; the measured lower breakpoints must not become flat extra armor.
  const frontLow=(z:number)=>21.377953+(z-58.503937)*(41.220470-21.377953)/(95.590553-58.503937);
  const rows:readonly(readonly[number,number,number])[]=[[-173.346451,45.118111,49.685040],
    [-121.653542,21.338583,49.685040],[37.992126,21.338583,49.685040],
    [58.503937,21.377953,49.685040],[83.267715,frontLow(83.267715),49.685040],
    [95.629921,41.220470,48.188976]];
  P.addExternalArmor('hull',sectionSolid(rows.map(([z,lo,hi])=>{
    const ring=[[68.818901,lo],[70,lo],[70,hi],[68.818901,hi]]
      .map(([x,y])=>[p(side*x,0,0)[0],p(0,y,0)[1]] as [number,number]);
    if(side<0)ring.reverse();return{z:p(0,0,z)[2],ring};
  })));
}
function appliquePanel(P:TankBuilderPort,side:number,back:number,front:number,
  inner:number,outer:number,low:number,high:number):void{
  // A complete cover carries a shallow inset field surrounded by four real
  // raised edges. Export labels alone do not establish reactive gameplay.
  const inset=outer-.43307,midY=(high+low)/2,midZ=(front+back)/2;
  P.addExternalArmor('hull',box(m(inset-inner),m(high-low),m(front-back)),...p(side*(inner+inset)/2,midY,midZ));
  for(const y of[low+.64961,high-.64961])P.addExternalArmor('hull',
    box(m(.43307),m(1.29922),m(front-back)),...p(side*(inset+outer)/2,y,midZ));
  for(const z of[back+1.24,front-1.24])P.addExternalArmor('hull',
    box(m(.43307),m(high-low-2.59844),m(2.48)),...p(side*(inset+outer)/2,midY,z));
}
function sideApplique(P:TankBuilderPort,side:number):void{
  appliquePanel(P,side,-107.992126,-73.385826,70.748032,76.181099,24.173227,58.582676);
  for(const [back,front]of[[-73.346458,-57.125984],[-56.811024,-40.551182],
    [-40.275589,-24.055119],[-23.622047,-7.362205],[-7.125984,9.133859],
    [9.606299,25.866142],[26.141731,42.401573]])
    appliquePanel(P,side,back,front,70.905510,77.086617,24.724409,59.094486);
  // Separate forward course rises over the idler instead of concealing its
  // lower quadrant with another full-height rectangular cassette.
  P.addExternalArmor('hull',sectionSolid([[42.677166,23.464567],[62.755905,23.464567],
    [95.433067,41.181103]].map(([z,low]):import('./sectionSolid.ts').SolidSection=>{
    const ring=[[70.157478,low],[73.700790,low],[73.700790,49.685040],[70.157478,49.685040]]
      .map(([x,y])=>[p(side*x,0,0)[0],p(0,y,0)[1]] as [number,number]);
    if(side<0)ring.reverse();return{z:p(0,0,z)[2],ring};
  })));
  for(const z of[-105.315,-90.827,-76.378]){
    equipment(P,cylX(m(1.25),m(.65),12),side*76.0,26.18,z);
    caseBox(P,side*73.1,26.18,z,5.2,4.4,1.95);
  }
}
function drumsAndRear(P:TankBuilderPort):void{
  for(const side of [-1,1]){
    const x=side*32.6;
    equipment(P,cylX(m(11.96),m(37.24),40),x,55.02,-202.1);
    for(const dx of [-9.5,9.5]){
      equipment(P,torus(m(12.03),m(.42),36,6).rotateZ(Math.PI/2),x+dx,55.02,-202.1);
      P.addEquipment('hullDetail',beamBetween(p(x+dx,45,-190),p(x+dx,42.2,-208),m(1.1)));
      caseBox(P,x+dx,55.3,-214.2,2.0,10.1,3.0);
    }
    caseBox(P,side*62.5,49.8,-189,15,1.7,8.7);
    equipment(P,cylZ(m(1.8),m(1.2),16),side*62.5,52.9,-189.1,'hullGlass');
    caseBox(P,side*25.6,29.5,-173.5,4.1,4.1,3.3);
    equipment(P,torus(m(2.6),m(.8),20,8).rotateX(Math.PI/2),side*25.6,29.9,-177.1);
  }
  equipment(P,cylX(m(4.2),m(57.1),32),0,30.3,-174.5);
  caseBox(P,0,35.1,-180.2,59.3,3.7,3.1);
  for(const x of [-24,0,24])P.addEquipment('hullDetail',beamBetween(p(x,42,-184),p(x,35,-178),m(1.1)));
}
function bowArmor(P:TankBuilderPort):void{
  const a=p(-33.98,0,0)[0],b=p(33.98,0,0)[0];
  const upper:readonly(readonly[number,number])[]=[[80.63,56.57],[94.7244,47.7559],[108.6614,33.6220]];
  const lower:readonly(readonly[number,number])[]=[[88.7402,12.5197],[98,22.2],[108.6614,33.6220]];
  for(const rows of[upper,lower])P.addExternalArmor('hull',roofSheet(rows.map(([z,y])=>
    [p(0,0,z)[2],a,b,p(0,y,0)[1],p(0,y,0)[1]] as const),m(.9)));
  caseBox(P,0,49.8,80.25,68.2,1.0,1.4);
  for(const x of[-30,-20,-10,0,10,20,30]){
    P.addEquipment('hullDetail',beamBetween(p(x,55.8,82),p(x,48.0,94),m(.7),8));
    P.addEquipment('hullDetail',beamBetween(p(x,47.2,95.5),p(x,34.1,107.8),m(.7),8));
    for(const[y,z]of[[55.6,82.4],[34.6,107.2]])caseBox(P,x,y,z,2.1,1.0,1.8);
  }
}
export function addChallenger1SuppliedHull(P:TankBuilderPort):void{
  tub(P);for(const side of [-1,1])sponson(P,side);
  engineRoof(P);foreDeck(P);
  for(const side of [-1,1]){frontGuards(P,side);sideSkirts(P,side);}
  drumsAndRear(P);bowArmor(P);
}
