// Newly authored asymmetric folded turret and fittings. Every station/plane
// is a scalar design input; there are no source vertex/index arrays or models.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { beamBetween, blindTube } from './measuredPrimitives.ts';
import { addChallenger1SourceHood } from './challenger1XSourceHood.ts';
import { c1Length as m, c1Point as p, CHALLENGER1_SUPPLIED_DATUMS as D } from './challenger1XSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const {box,cylX,cylY}=KIT;
function local(g:THREE.BufferGeometry):THREE.BufferGeometry{
  return g.translate(-D.turretPivot[0],-D.turretPivot[1],-D.turretPivot[2]);
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
  P.add('turret',local(sectionSolid(sections)));
  for(const side of[-1,1]){
    const rows:readonly(readonly[number,number,number,number])[]=[[14,56.7,88.0,73.8],[30,53.6,83.0,65.5],
      [45,29.4,72.8,65.2],[53.543,10.2,65.3,64.9]];
    P.add('turret',local(sectionSolid(rows.map(([z,w,inner,outer])=>{
      const ring=[[8.5,64.65],[w,64.65],[w,outer],[8.5,inner]].map(([x,y])=>
        [p(side*x,0,0)[0],p(0,y,0)[1]] as [number,number]);
      if(side<0)ring.reverse();return{z:p(0,0,z)[2],ring};
    }))));
  }
}
function rearBin(P:TankBuilderPort):void{
  const rows:readonly(readonly[number,number,number,number])[]=[[-138.307,32.7,74,85.6],[-132,33.3,72.76,87.5],
    [-115,33.0,72.9,87.795]];
  const g=sectionSolid(rows.map(([z,w,lo,hi])=>({z:p(0,0,z)[2],ring:[
    [p(-w,0,0)[0],p(0,lo,0)[1]],[p(w,0,0)[0],p(0,lo,0)[1]],
    [p(w,0,0)[0],p(0,hi,0)[1]],[p(-w,0,0)[0],p(0,hi,0)[1]],
  ]})));P.addEquipment('turretDetail',local(g));
  for(const x of[-24.5,-.4,24.1]){
    caseBox(P,x,86.0,-133.8,1.4,2.5,9.7);
    caseBox(P,x,83.3,-138.0,1.5,4.3,1.0);
  }
  for(const x of[-9,9])P.addEquipment('turretDetail',local(beamBetween(p(x,79.5,-144.8),p(-x,79.5,-138.5),m(.7))));
  caseBox(P,0,79.5,-144.4,32.3,.8,1.0);
}
function sideBoxes(P:TankBuilderPort):void{
  leftCase(P);rightCarrier(P);
  for(const [x,y,z,w,h,d]of [[63.425,76.083,-8.09055,6.61,19.56,15.7874],[59.783,72.402,-44.3307,10.905,11.102,21.496],
    [62.2835,78.307,-26.3976,10.236,23.071,22.323],[58.6811,77.7953,-60.1969,11.063,21.4173,12.3622],
    [-57,81.97,-114.0,7.1,19.3,15.4],
    [-60.7,81.38,-82.5,5.7,20.4,16.2],[-46.4,77.4,-111.8,10.2,12.4,21.5]]){
    equipment(P,cylY(m(w/2),m(w/2),m(h),12).scale(1,1,d/w),x,y,z);
    caseBox(P,x,y+h/2-.15,z,w,.30,d);
    equipment(P,cylY(m(1.2),m(1.2),m(.8),12),x,y+h/2+1,z+d*.25);
    for(const dz of[-d*.27,d*.27])caseBox(P,x,y+h/2+1.7,z+dz,w*.72,.6,.7);
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
function cupola(P:TankBuilderPort):void{
  const c=p(-20.807,99.626,-53.898);
  P.addCupola('turret',cylY(m(20.57),m(20.57),m(8.386),40),c[0]-D.turretPivot[0],c[1]-D.turretPivot[1],c[2]-D.turretPivot[2]);
  equipment(P,cylY(m(9.9213),m(9.9213),m(3.5039),32),-20.04,105.4134,-57.01);
  caseBox(P,-20.32,105.1,-68.0,11.81,3.9,2.68);
  for(const [x,z,yaw]of [[-8,-49,-.64],[-12,-43,-.64],[-30,-44,.60],[-25,-35,0]]){
    equipment(P,box(m(6.4),m(1.3),m(9.2)).rotateY(yaw),x,103.5,z);
    equipment(P,box(m(4.7),m(1.0),m(.5)).rotateY(yaw),x,104.25,z+3.5,'turretDark');
  }
  // Complete source census shows an empty cupola mount: rails, hinge and
  // brackets only. Deliberately no sourceMachineGun/markExact registration.
  for(const x of[-29.4,-14.0]){
    caseBox(P,x,105.7,-41.3,1.4,4.8,2.1);
    caseBox(P,x,109.4,-40.0,1.4,1.0,2.0);
  }
  caseBox(P,-23.9,107.0,-42.5,8.74,7.64,1.05);
  equipment(P,cylX(m(1.6),m(13.4),20),-21.1,108.3,-40.2);
  caseBox(P,-15.12,110.43,-38.56,4.02,5.35,3.27);
  caseBox(P,-15.0,105.4,-50,1.8,4.6,12.1);
}
function roof(P:TankBuilderPort):void{
  equipment(P,cylY(m(5.8),m(6.4),m(1.0),24),17,95,-11.0);
  equipment(P,box(m(22.8),m(2.8),m(25.1)).rotateY(.18),18.07,94.4,-52.0);
  for(const x of[8.5,28.5])caseBox(P,x,96.1,-52,1.1,.7,19.0);
  caseBox(P,23.8,92.1,-21.5,10.3,2.4,10.2);
  for(const[x,y,z]of[[-53.27,97.3,-90.81],[36.85,93.15,-102.09]]){
    equipment(P,cylY(m(3.0),m(3.3),m(7.9),24),x,y,z);
    equipment(P,cylY(m(1.4),m(2.1),m(4.0),20),x,y+5.3,z);
    const top=x<0?162.519684:158.5,bottom=x<0?103.307083:99.055115;
    equipment(P,cylY(m(.40),m(.51),m(top-bottom),12),x,(top+bottom)/2,z);
  }
  for(const[x,y,z]of[[-44,97,-35],[-39,97,-74],[38,90,-91],[41,90,-67],[41,90,-41]])
    caseBox(P,x,y,z,1.3,2.5,5.2);
}
function optics(P:TankBuilderPort):void{
  const x=-26.1;
  caseBox(P,x,95.8,-17.4,24,1.1,13.1);
  for(const dx of[-11.4,11.4])caseBox(P,x+dx,95.4,-16,1.1,7.7,12.0);
  caseBox(P,x,99.0,-16.5,24.8,1.0,13.0);
  equipment(P,box(m(19),m(4.6),m(.6)),x,96,-21.4,'turretDark');
  equipment(P,box(m(17.2),m(3.1),m(.3)),x,96,-21.0,'turretGlass');
  caseBox(P,-.6,90.7,15.5,2.55,4.72,5.3);
}
function smoke(P:TankBuilderPort):void{
  for(const side of[-1,1]){
    for(const [dx,dy]of[[-4.3,1.6],[0,1.6],[4.3,1.6],[-2.15,-2.3],[2.15,-2.3]]){
      const x=side*33.1+dx,z=39.0-side*.36*dx;
      equipment(P,blindTube(m(1.8),m(1.24),m(10.2),m(5.8),20).rotateX(-.17).rotateY(side*.35),x,70.3+dy,z);
    }
    equipment(P,box(m(15.8),m(6.2),m(2.0)).rotateY(side*.35),side*31.4,69.4,33.4);
  }
}
export function addChallenger1SuppliedTurret(P:TankBuilderPort):void{
  bearing(P);body(P);rearBin(P);sideBoxes(P);cupola(P);roof(P);optics(P);smoke(P);
  addChallenger1SourceHood(P);
}
