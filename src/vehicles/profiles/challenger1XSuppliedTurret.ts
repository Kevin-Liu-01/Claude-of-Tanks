import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
// Newly authored asymmetric folded turret and fittings. Every station/plane
// is a scalar design input; there are no source vertex/index arrays or models.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { beamBetween, blindTube, type Point3 } from './measuredPrimitives.ts';
import { addChallenger1SourceHood } from './challenger1XSourceHood.ts';
import { c1Length as m, c1Point as p, CHALLENGER1_SUPPLIED_DATUMS as D } from './challenger1XSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const {box,cylX,cylY,cylZ}=KIT;
/** The three marks' fits (challenger1XSupplied.ts). */
export type Challenger1SuppliedMark = 1 | 2 | 3;
const [PX,PY,PZ]=D.turretPivot;
function local(g:THREE.BufferGeometry):THREE.BufferGeometry{
  return g.translate(-D.turretPivot[0],-D.turretPivot[1],-D.turretPivot[2]);
}
/** Vehicle-frame metres into the turret frame. */
function at(P:TankBuilderPort,g:THREE.BufferGeometry,x:number,y:number,z:number,bucket='turretDetail',rx=0,ry=0):void{
  P.addEquipment(bucket,g,x-PX,y-PY,z-PZ,rx,ry,0);
}
function lens(P:TankBuilderPort,g:THREE.BufferGeometry,x:number,y:number,z:number,ry=0):void{
  P.addModuleVisual('optics','turretGlass',g,x-PX,y-PY,z-PZ,0,ry,0);
}
function equipment(P:TankBuilderPort,g:THREE.BufferGeometry,x:number,y:number,z:number,bucket='turretDetail'):void{
  const c=p(x,y,z);P.addEquipment(bucket,g,c[0]-D.turretPivot[0],c[1]-D.turretPivot[1],c[2]-D.turretPivot[2]);
}
function caseBox(P:TankBuilderPort,x:number,y:number,z:number,w:number,h:number,d:number):void{
  equipment(P,box(m(w),m(h),m(d)),x,y,z);
}
function bearing(P:TankBuilderPort):void{
  const ring=new THREE.LatheGeometry([[28.5,57.2835],[34.74,63.5433],[34.74,65.1575],
    [26.2,65.1575],[26.2,64.4488],[28.5,57.2835]].map(([r,y])=>new THREE.Vector2(m(r),p(0,y,0)[1])),48);
  ring.translate(p(-.059,0,0)[0],0,p(0,0,-26.752)[2]);P.add('turret',local(ring));
}
type Course=readonly[z:number,l:number,r:number,lo:number,lEdge:number,lRoof:number,mid:number,rRoof:number];
function body(P:TankBuilderPort):void{
  const courses:readonly Course[]=[[-114.92,34,33.8,72.8,87.5,88,88,88.2],
    [-100,39.4,43.5,68.8,90.9,91.2,91.4,87.6],[-80,44.5,50,65.2,95.7,95.69,95.67,87.6],
    [-60,50.1,54.55,64.95,95.83,95.70,95.67,86.45],[-30,52.8,57.6,64.9,96.05,95.95,95.70,86.75],
    [-15,56.9,58.4,64.9,75.8,91.7,93.15,86.0],
    [0,56.92,58.9,64.8,75.38,88.01,90.86,83.8],[14,56.7,58.7,64.8,72.2,80.4,88.0,77.0]];
  const sections=courses.map(([z,l,r,lo,edge,left,mid,right]):SolidSection=>({z:p(0,0,z)[2],ring:[
    [p(-l,0,0)[0],p(0,lo,0)[1]],[p(r,0,0)[0],p(0,lo,0)[1]],
    [p(r,0,0)[0],p(0,right,0)[1]],[p(8,0,0)[0],p(0,mid,0)[1]],
    [p(-Math.min(l-1,46.7),0,0)[0],p(0,left,0)[1]],[p(-l,0,0)[0],p(0,edge,0)[1]],
  ]}));
  P.add('turret',local(sectionSolid(sections,{sideQuadDiagonal:'convex'})));
  for(const side of[-1,1]){
    const rows:readonly(readonly[number,number,number,number])[]=[[14,56.7,88.0,73.8],[30,53.6,83.0,65.5],
      [45,29.4,72.8,65.2],[53.543,10.2,65.3,64.9]];
    P.add('turret',local(sectionSolid(rows.map(([z,w,inner,outer])=>{
      const ring=[[8.5,64.65],[w,64.65],[w,outer],[8.5,inner]].map(([x,y])=>
        [p(side*x,0,0)[0],p(0,y,0)[1]] as [number,number]);
      if(side<0)ring.reverse();return{z:p(0,0,z)[2],ring};
    }),{sideQuadDiagonal:'convex'})));
  }
}
function rearBin(P:TankBuilderPort):void{
  const rows:readonly(readonly[number,number,number,number])[]=[[-138.307,32.7,74,85.6],[-132,33.3,72.76,87.5],
    [-115,33.0,72.9,87.795]];
  const g=sectionSolid(rows.map(([z,w,lo,hi])=>({z:p(0,0,z)[2],ring:[
    [p(-w,0,0)[0],p(0,lo,0)[1]],[p(w,0,0)[0],p(0,lo,0)[1]],
    [p(w,0,0)[0],p(0,hi,0)[1]],[p(-w,0,0)[0],p(0,hi,0)[1]],
  ]})));P.addEquipment('turretDetail',local(g));
  // each strap lies on the lid's slope, over its rear edge and down the rear face (release 265, the minors pass: flat
  // 2.5-in boxes on the 17-degree lid stood out of it at the back as dark fins)
  const slope=Math.atan2(87.5-85.6,138.307-132),run=Math.hypot(87.5-85.6,138.307-132);
  for(const x of[-24.5,-.4,24.1]){
    equipment(P,box(m(1.4),m(.3),m(run)).rotateX(-slope),x,(85.6+87.5)/2+.15*Math.cos(slope),(-138.307-132)/2-.15*Math.sin(slope));
    caseBox(P,x,87.65,-130.48,1.4,.3,3.05);
    caseBox(P,x,83.375,-138.46,1.5,4.45,.3);
  }
  // release 264 (the Mk 2's critic: "a thin black rod sticks straight back from the bustle"): the tie bar that stood
  // 15 cm behind the bin on two crossed stays is gone; the bin's straps stay on its face
}
function sideBoxes(P:TankBuilderPort):void{
  leftCase(P);rightCarrier(P);
  for(const [x,y,z,w,h,d]of [[63.425,76.083,-8.09055,6.61,19.56,15.7874],[59.783,72.402,-44.3307,10.905,11.102,21.496],
    [62.2835,78.307,-26.3976,10.236,23.071,22.323],[58.6811,77.7953,-60.1969,11.063,21.4173,12.3622],
    [-54.7,81.97,-113.7,7.1,19.3,15.4],
    [-60.7,81.38,-82.5,5.7,20.4,16.2],[-46.4,77.4,-111.8,10.2,12.4,21.5]]){
    // 2026-10-19 (owner float sweep): the filler cap stood 0.6 in (15 mm) and the two lid straps 1.4 in (35 mm) over
    // the lid, and the rear-left case (-57, -114) stood 55 mm off its neighbour; cap (centred between the straps) and
    // straps lie on the lid, and that case moves 2.3 in inboard / 0.3 in forward against the neighbouring case
    equipment(P,cylY(m(w/2),m(w/2),m(h),12).scale(1,1,d/w),x,y,z);
    caseBox(P,x,y+h/2-.15,z,w,.30,d);
    equipment(P,cylY(m(1.2),m(1.2),m(.8),12),x,y+h/2+.35,z);
    for(const dz of[-d*.27,d*.27])caseBox(P,x,y+h/2+.25,z+dz,w*.72,.6,.7);
  }
}
function leftCase(P:TankBuilderPort):void{
  const rows:readonly(readonly[number,number,number,number])[]=[[-66.8,49.15,49.8,50],
    [-60,49.97,60.40,62.37],[-38.3,52.55,62.25,62.44],[-31.2,53.36,53.8,54.0]];
  P.addEquipment('turretDetail',local(sectionSolid(rows.map(([z,inner,upper,lower]):SolidSection=>({z:p(0,0,z)[2],ring:[
    [p(-lower,0,0)[0],p(0,72,0)[1]],[p(-lower+.4,0,0)[0],p(0,67.8,0)[1]],
    [p(-inner,0,0)[0],p(0,67.8,0)[1]],[p(-inner,0,0)[0],p(0,96.4,0)[1]],
    [p(-upper,0,0)[0],p(0,95.2,0)[1]],
  ]})))));
}
function rightCarrier(P:TankBuilderPort):void{
  // Source stock is a folded open carrier with a narrow upper rim. A full
  // filled case would falsely cover the inboard air, especially at its nose.
  const rows:readonly(readonly[number,number,number,number,number])[]=[[-69.3,51.54,63.2,64.0,84.33],
    [-35,54.48,65.4,67.07,84.33],[-3.0,57.3,66.8,69.1,84.1],[1.7,57.7,66.4,67.8,82.0]];
  P.addEquipment('turretDetail',local(sectionSolid(rows.map(([z,inner,base,top,high]):SolidSection=>({z:p(0,0,z)[2],ring:[
    [p(inner,0,0)[0],p(0,65.95,0)[1]],[p(base+.45,0,0)[0],p(0,65.95,0)[1]],
    [p(top+.45,0,0)[0],p(0,high,0)[1]],[p(top,0,0)[0],p(0,high,0)[1]],
    [p(base,0,0)[0],p(0,66.4,0)[1]],[p(inner,0,0)[0],p(0,66.4,0)[1]],
  ]})))));
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i];
    P.addEquipment('turretDetail',local(beamBetween(p(a[3],a[4]+.55,a[0]),p(b[3],b[4]+.55,b[0]),m(.65),8)));
  }
  caseBox(P,58.2,85.16,15.1,.866,1.15,29.0);
  for(const z of[2,28.5])caseBox(P,58.2,76.3,z,.7,18.0,1.2);
  P.addEquipment('turretDetail',local(beamBetween(p(58.2,68.3,28.8),p(40.5,68.3,38),m(.6))));
  P.addEquipment('turretDetail',local(beamBetween(p(40.5,68.3,38),p(40.5,83.2,35.0),m(.6))));
}
/** The left cheek's stowage basket, between the carrier's forward frame (x 1.325), the hood's inner seat (x .923) and
 *  the outer return (release 264, the three marks' critics: the frame and return read as an open crate whose rails end
 *  in air; the Bovington Mk 3 and the Flying Fox Mk 2 show a mesh basket there). A closed body behind the frame: the
 *  Mk 1's is a bare painted bin, the Mk 2's and Mk 3's a basket packed with kit; mesh and a bottom rail outboard. */
function leftBasket(P:TankBuilderPort,mark:Challenger1SuppliedMark):void{
  // vehicle-frame metres; each station stays 6 mm behind the return's top course (z = 2.0283 - .5472 (x - .919))
  const inner=.935,outer=1.31,lo=1.557,hi=1.885,c=.03;
  const reach=(z:number):number=>Math.min(outer,.919+(2.0223-z)/.5472);
  P.addEquipment(mark===1?'turretDetail':'turretCloth',local(sectionSolid([1.29,1.80,1.86,1.92,1.98].map((z):SolidSection=>{
    const x=reach(z);
    return{z,ring:[[inner,lo],[x,lo],[x,hi-c],[x-c,hi],[inner,hi]]};
  }))));
  const X=1.322,bar=(a:Point3,b:Point3,r=.006):void=>P.addEquipment('turretOpenLattice',local(beamBetween(a,b,r,6)));
  bar([X,lo,1.271],[X,lo,1.881],.01);
  for(const y of[1.685,1.813])bar([X,y,1.271],[X,y,1.874]);
  for(const z of[1.60,1.70,1.80])bar([X,lo,z],[X,1.941,z]);
}
function cupola(P:TankBuilderPort):void{
  const c=p(-20.807,99.626,-53.898);
  P.addCupola('turret',cylY(m(20.57),m(20.57),m(8.386),40),c[0]-D.turretPivot[0],c[1]-D.turretPivot[1],c[2]-D.turretPivot[2]);
  // the hatch is a low dome on a rim, not a flat disc (release 265, the minors pass: the cupola read as one flat drum)
  equipment(P,new THREE.LatheGeometry(([[0,0],[9.92,0],[9.92,1.75],[9.3,2.55],[7.3,3.6],[4.2,4.35],[0,4.6]] as const)
    .map(([r,y])=>new THREE.Vector2(m(r),m(y))),32),-20.04,103.66,-57.01);
  // its seal ring lies flat round the hatch (KIT.torus lies flat; turned upright it stood over the dome as a hoop)
  equipment(P,KIT.torus(m(10.15),m(.55),32,8),-20.04,104.0,-57.01,'turretDark');
  caseBox(P,-20.32,105.1,-68.0,11.81,3.9,2.68);
  for(const [x,z,yaw]of [[-8,-49,-.64],[-12,-43,-.64],[-30,-44,.60],[-25,-35,0]]){
    equipment(P,box(m(6.4),m(1.3),m(9.2)).rotateY(yaw),x,103.5,z);
    equipment(P,box(m(4.7),m(1.0),m(.5)).rotateY(yaw),x,104.25,z+3.5,'turretDark');
  }
  // The source's cupola mount was empty (rails, hinge and brackets); the commander's gun now rides its own cradle there
  // (below), and the one bracket left carries the MG sight head.
  caseBox(P,-14.0,106.3,-41.3,1.4,6.0,2.1);
  caseBox(P,-14.0,109.4,-40.0,1.4,1.0,2.0);
  caseBox(P,-15.12,110.43,-38.56,4.02,5.35,3.27);
  caseBox(P,-15.0,105.4,-50,1.8,4.6,12.1);
  // Release 262 (owner 2026-10-28: "optics and machine guns"): the No. 32 cupola's nine episcopes round its wall and the
  // glass of the MG sight head (FR wiki: "tourelleau No 32", nine episcopes and a No 37 Mk 6 periscope to aim the MG).
  const r=m(20.57),[cx,cy,cz]=p(-20.807,101.6,-53.898);
  for(let i=0;i<9;i++){
    const a=i*Math.PI*2/9;
    at(P,box(.10,.06,.04),cx+Math.sin(a)*(r+.008),cy,cz+Math.cos(a)*(r+.008),'turretDark',0,a);
    lens(P,box(.075,.04,.006),cx+Math.sin(a)*(r+.030),cy,cz+Math.cos(a)*(r+.030),a);
  }
  lens(P,box(m(3.0),m(2.2),.006),...p(-15.12,110.9,-36.85));
  // The commander's L37A2 7.62 mm GPMG rides the cupola's cradle (the source's mount: rails, hinge and brackets), aimed
  // through that sight; it is every mark's one roof gun.
  const mg=FITTINGS.pintleMG({mats:P.mats,cls:'mag',tone:'dark',scale:1,seed:8,riser:.02,working:true,ridingCradle:true});
  mg.name='challenger1SuppliedCommanderL37';
  const g=p(-21.1,103.6,-41.5);mg.position.set(g[0]-PX,g[1]-PY,g[2]-PZ);
  P.turretG.add(mg);
}
/** TOGS: the armoured thermal-sight barbette standing on the right cheek's outer corner (FR wiki: "dans une boîte blindée
 *  sur le flanc droit de la tourelle"), its top 0.2 m over the roof, its foot buried in the cheek's fall and its front's
 *  top edge chamfered; the right smoke bank stands inboard of and below it. The Mk 1s were
 *  delivered with it mostly empty, its port blanked (en Wikipedia, Haynes 2015 p. 110); the Mk 2 and Mk 3 carry the
 *  sight behind an armoured door hinged on the port's top edge, closed as every reference photo shows it.
 *  The box is turret equipment, not the turret shell (release 264c): in the shell bucket each of its slices' convex
 *  hit cell bridged from its top to the far cheek, so the turret front over both cheeks read as sloped 50 mm roof and
 *  the barbette as main armour (the Mk 1's tier-8 strength with C2 0.349, against 0.509 without the box in the shell).
 *  It is a major silhouette piece, so it opts in to rangeSilhouette: past LOD1 like the shell, and its own hull in the
 *  turret's shadow proxy. */
const TOGS={inner:.88,outer:1.24,rear:1.02,front:1.84,top:2.20} as const;
function togsBarbette(P:TankBuilderPort,mark:Challenger1SuppliedMark):void{
  const {inner,outer,rear,front,top}=TOGS,c=.04,lo=1.42;
  const ring=(hi:number):[number,number][]=>([[inner,lo],[outer-c,lo],[outer,lo+c],[outer,hi-c],[outer-c,hi],[inner,hi]] as
    const).map(([x,y]):[number,number]=>[-x,y]).reverse();
  const shell=local(sectionSolid(([[rear,top],[1.55,top],[front-.07,top],[front,top-.07]] as const)
    .map(([z,hi]):SolidSection=>({z,ring:ring(hi)}))));
  shell.userData.rangeSilhouette=true;
  P.addEquipment('turret',shell);
  const dx=-1.06,dy=1.95;
  if(mark===1){
    at(P,box(.26,.19,.02),dx,dy,front+.01);
    for(const ox of[-.10,0,.10])for(const oy of[-.075,.075])at(P,cylZ(.011,.012,8),dx+ox,dy+oy,front+.026,'turretDark');
  }else{
    // the door is 50 mm armour plate, closed over the port and hung from two knuckles on its top edge (release 265, the
    // minors pass: propped open on stays, both blind critics read a see-through frame on struts; the Bovington and
    // drawing references show it shut and flush)
    const h=.24,hy=dy+.10,t=.05;
    at(P,box(.27,h,t),dx,hy-h/2,front+t/2,'turretDetail');
    for(const ox of[-.115,.115])at(P,cylX(.022,.05,10),dx+ox,hy+.004,front+t,'turretDark');
  }
}
function roof(P:TankBuilderPort):void{
  // 2026-10-19 (owner float sweep): the disc stood 30 mm over its seat; lowered onto it
  equipment(P,cylY(m(5.8),m(6.4),m(1.0),24),17,93.7,-11.0);
  equipment(P,box(m(22.8),m(2.8),m(25.1)).rotateY(.18),18.07,94.4,-52.0);
  for(const x of[8.5,28.5])caseBox(P,x,96.1,-52,1.1,.7,19.0);
  caseBox(P,23.8,92.1,-21.5,10.3,2.4,10.2);
  // 2026-10-19 (owner float sweep): the left aerial base stood 55 mm over the falling roof edge; each base, collar and
  // whip is seated on the nearest stock
  for(const[x,y,z]of[[-53.27,97.3,-90.81],[36.85,93.15,-102.09]])P.snapGroup('c1-turret-aerial',()=>{
    equipment(P,cylY(m(3.0),m(3.3),m(7.9),24),x,y,z);
    equipment(P,cylY(m(1.4),m(2.1),m(4.0),20),x,y+5.3,z);
    const top=x<0?162.519684:158.5,bottom=x<0?103.307083:99.055115;
    equipment(P,cylY(m(.40),m(.51),m(top-bottom),12),x,(top+bottom)/2,z);
  },{reachM:.07});
  for(const[x,y,z]of[[-44,97,-35],[-39,97,-74],[38,90,-91],[41,90,-67],[41,90,-41]])
    caseBox(P,x,y,z,1.3,2.5,5.2);
  // the loader's periscope ahead of his hatch (release 262: the roof's optics glazed)
  at(P,box(.15,.08,.12),.41,2.175,.417);
  lens(P,box(.12,.045,.006),.41,2.18,.48);
}
function optics(P:TankBuilderPort):void{
  // The gunner's sight housing (release 265, the minors pass: a roof, a shelf and two thin cheeks over the roof read as a
  // table): one closed body from its foot, buried in the roof (91.6 at its front, 94.4 at its back), to a chamfered top,
  // the window in its front face under a short brow.
  const x=-26.1,w=12.4;
  P.addEquipment('turretDetail',local(sectionSolid(([[-24.2,99.5],[-13.6,99.5],[-12.0,98.2]] as const)
    .map(([z,top]):SolidSection=>({z:p(0,0,z)[2],ring:([[x-w,90.8],[x+w,90.8],[x+w,top],[x-w,top]] as const)
      .map(([sx,sy]):[number,number]=>[p(sx,0,0)[0],p(0,sy,0)[1]])})))));
  caseBox(P,x,99.0,-11.2,25.6,1.0,3.0);
  equipment(P,box(m(19),m(4.6),m(.6)),x,95.4,-11.85,'turretDark');
  equipment(P,box(m(17.2),m(3.1),m(.3)),x,95.4,-11.45,'turretGlass');
  // seated on the roof (release 262: it stood 16 mm over it, the hull-contact census)
  caseBox(P,-.6,90.05,15.5,2.55,4.72,5.3);
}
function smoke(P:TankBuilderPort):void{
  // The right bank stands on the cheek inboard of and below the TOGS barbette, the left on its cheek under the hood.
  for(const side of[-1,1]){
    // the left bank stands 7 cm further forward, its muzzles clear of the hood's front edge as in the Bovington Mk 3
    // (release 264, the Mk 3's critic: "the L8 cluster sits buried in that pocket")
    const fore=side>0?3.0:0;
    for(const [dx,dy]of[[-4.3,1.6],[0,1.6],[4.3,1.6],[-2.15,-2.3],[2.15,-2.3]]){
      const x=side*33.1+dx,z=39.0+fore-side*.36*dx;
      // the L8 bank fans out and fires upward (release 262, the three marks' critics against the Bovington photos: the
      // tubes lay level in a tight bundle): the upper row at 36 degrees, the lower at 26, the outer tubes splayed 12
      equipment(P,markSmokeTube(blindTube(m(1.8),m(1.24),m(10.2),m(5.8),20),[0,0,1],true)
        .rotateX(dy>0?-.62:-.45).rotateY(side*.35+dx*.05),x,70.3+dy,z);
    }
    equipment(P,box(m(15.8),m(6.2),m(2.0)).rotateY(side*.35),side*31.4,69.4,33.4+fore);
  }
}
export function addChallenger1SuppliedTurret(P:TankBuilderPort,mark:Challenger1SuppliedMark=3):void{
  bearing(P);body(P);togsBarbette(P,mark);rearBin(P);sideBoxes(P);leftBasket(P,mark);cupola(P);roof(P);optics(P);smoke(P);
  addChallenger1SourceHood(P);
}
