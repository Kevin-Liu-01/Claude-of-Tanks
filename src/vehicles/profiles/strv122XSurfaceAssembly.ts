// Original Strv122 photo-led construction. Plate courses and fittings follow
// Army VIRIN180608-A-XV631-0047; all dimensions here are assembly estimates,
// not metrology from a photograph or the owner's AI-generated reference.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {beamBetween} from './measuredPrimitives.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Pivot=readonly[number,number,number];
const {box,cylX,cylY,cylZ}=KIT;
// The photographed outer leading corner is broad and forward, not an
// uninterrupted needle taper from the mid-turret to the mantlet.
export const STRV122_CHEEK_SECTIONS:readonly(readonly[number,number,number,number])[]=[
  [.11,1.735,2.01,2.51],[1.13,1.71,1.96,2.49],
  [1.92,1.65,1.90,2.42],[2.47,1.44,1.95,2.285],[2.68,.32,2.00,2.10],
];
function cheek(z:number):readonly[number,number] {
  const rows=STRV122_CHEEK_SECTIONS;
  const i=Math.max(0,rows.findIndex((row,n)=>n<rows.length-1&&z<=rows[n+1][0]));
  const a=rows[i],b=rows[i+1],t=(z-a[0])/(b[0]-a[0]);
  return [a[1]+(b[1]-a[1])*t,a[3]+(b[3]-a[3])*t];
}
function turretAdd(P:TankBuilderPort,pivot:Pivot,g:THREE.BufferGeometry,bucket='turretDetail'):void {
  P.addEquipment(bucket,g,-pivot[0],-pivot[1],-pivot[2]);
}
function roofFastener(P:TankBuilderPort,pivot:Pivot,x:number,z:number):void {
  const [,y]=cheek(z),slope=(cheek(z+.0001)[1]-cheek(z-.0001)[1])/.0002;
  const normal=new THREE.Vector3(0,1,-slope).normalize();
  const head=cylY(.011,.014,.011,6).applyQuaternion(new THREE.Quaternion()
    .setFromUnitVectors(new THREE.Vector3(0,1,0),normal)).translate(x,y+.010,z);
  turretAdd(P,pivot,head);
}
function cheekPanels(P:TankBuilderPort,pivot:Pivot,side:number):void {
  // Separate removable service skins on continuous permanent armor. The
  // narrow service seams do not punch holes through the structural wedge.
  for(const [start,end]of [[.14,1.112],[1.148,1.903],[1.937,2.454],[2.485,2.62]]) {
    const sections=[start,end].map(z=>{
      const [w,y]=cheek(z),inner=.277,outer=w*.958;
      const ring:SectionPoint[]=[[side*inner,y-.002],[side*outer,y-.002],
        [side*outer,y+.007],[side*inner,y+.007]];
      if(side<0)ring.reverse();return{z,ring};
    });
    turretAdd(P,pivot,sectionSolid(sections));
    for(const z of [start+.055,end-.055]) {
      const [w]=cheek(z);
      for(const x of [.335,w*.958-.055])roofFastener(P,pivot,side*x,z);
    }
  }
  // The broad photographed outer cheek has actual narrow lid joints and
  // supported vertical receiving tabs, rather than isolated floating bolts.
  for(const z of [.28,.69,1.04]) {
    const [w,y]=cheek(z),x=side*(w*.985);
    turretAdd(P,pivot,box(.023,.158,.033).rotateZ(side*.075).translate(x,y-.175,z));
    turretAdd(P,pivot,cylZ(.017,.064,12).translate(x,y-.089,z));
    turretAdd(P,pivot,cylX(.013,.020,8).translate(x+side*.014,y-.205,z));
  }
}
function roofCowl(P:TankBuilderPort,pivot:Pivot,x:number):void {
  const z=1.60,y=cheek(z)[1]-.002,r=.077,stock=.012;
  const shape=new THREE.Shape();shape.moveTo(-r,0);shape.lineTo(-r,.042);
  shape.absarc(0,.042,r,Math.PI,0,true);shape.lineTo(r,0);
  shape.lineTo(r-stock,0);shape.lineTo(r-stock,.042);
  shape.absarc(0,.042,r-stock,0,Math.PI,false);shape.lineTo(-r+stock,0);shape.closePath();
  const hood=new THREE.ExtrudeGeometry(shape,{depth:.182,steps:1,bevelEnabled:false,curveSegments:20})
    .translate(x,y,z-.091);
  turretAdd(P,pivot,hood);
  // Backing and side feet seat the open hood on the actual sloping plate.
  turretAdd(P,pivot,box(.145,.102,.014).translate(x,y+.042,z-.084));
  turretAdd(P,pivot,box(.112,.057,.005).translate(x,y+.034,z-.074),'turretDark');
  for(const dx of [-.071,.071])turretAdd(P,pivot,box(.022,.022,.190).translate(x+dx,y-.008,z));
}
function opticalFurniture(P:TankBuilderPort,pivot:Pivot):void {
  // Open shutter leaves and their edge hinges flank the existing genuine
  // gunner-sight recess; nothing fills the original glass approach volume.
  for(const side of [-1,1]) {
    const x=.87+side*.25;
    turretAdd(P,pivot,box(.050,.292,.21).rotateY(side*.28).translate(x,2.636,1.185));
    turretAdd(P,pivot,cylY(.012,.012,.302,12).translate(.87+side*.218,2.636,1.185));
  }
  for(const x of [.355,.565])roofCowl(P,pivot,x);
  // Positive hatch hinges and folded grasp handles make the roof interfaces
  // readable. Open handle middles are real air, not dark painted rectangles.
  for(const [x,z,r]of [[.63,-.36,.31],[-.58,-.19,.35]]) {
    turretAdd(P,pivot,cylX(.026,.19,16).translate(x,2.62,z-r+.028));
    for(const dx of [-.075,.075])turretAdd(P,pivot,box(.027,.034,.060).translate(x+dx,2.626,z+.10));
    turretAdd(P,pivot,cylX(.011,.175,12).translate(x,2.650,z+.10));
    for(const dx of [-.10,.10])turretAdd(P,pivot,beamBetween(
      [x+dx,2.584,z-r+.055],[x+dx,2.624,z-r+.035],.014));
  }
}
export function addStrv122XSurfaceAssembly(P:TankBuilderPort,pivot:Pivot):void {
  for(const side of [-1,1])cheekPanels(P,pivot,side);
  opticalFurniture(P,pivot);
}
export function addStrv122XGlacisShoulders(P:TankBuilderPort):void {
  // The broad applique turns into a bevel over each track. These closed
  // shoulders share the glacis top slope and intersect the guard/side rail.
  // There is no vertical step, floating slab or plugged track bay.
  for(const side of [-1,1]) {
    const sections=[[2.23,1.526,1.702,1.442],[2.82,1.322,1.534,1.331],
      [3.46,1.102,1.352,1.294],[3.64,1.037,1.300,1.250]].map(([z,inner,top,bottom])=>{
      const ring:SectionPoint[]=[[side*(inner-.024),bottom],[side*1.875,bottom],
        [side*1.875,Math.max(bottom+.010,top-.050)],[side*1.78,top-.010],
        [side*(inner-.024),top]];
      if(side<0)ring.reverse();return{z,ring};
    });
    P.add('hull',sectionSolid(sections));
  }
}
export function addStrv122XBowInterfaces(P:TankBuilderPort):void {
  const height=(z:number)=>1.705-(z-2.22)*(.405/1.42);
  for(const side of [-1,0,1]) {
    const stations=[2.255,3.565].map(z=>{
      const edge=1.53-(z-2.22)*(.49/1.42)-.028;
      const a=side===0?-.415:side>0?.445:-edge;
      const b=side===0?.415:side>0?edge:-.445;
      const y=height(z);
      return {z,ring:[[a,y-.002],[b,y-.002],[b,y+.006],[a,y+.006]] as SectionPoint[]};
    });
    P.addEquipment('hullDetail',sectionSolid(stations));
    for(const z of [2.31,3.49])for(const x of side===0?[-.35,.35]:[side*.50,side*(1.50-(z-2.22)*(.49/1.42)-.045)]) {
      P.addEquipment('hullDetail',cylY(.012,.014,.011,6),x,height(z)+.010,z,-.278);
    }
  }
  for(const side of [-1,1]) {
    // Small outer marker housing follows the shoulder; it is not perched
    // on the lamp or floating outside the front guard.
    P.addEquipment('hullDetail',box(.139,.071,.075),side*1.672,1.341,3.47,.15);
    P.addEquipment('hullGlass',box(.112,.033,.005),side*1.672,1.345,3.509,.15);
    for(const dx of [-.24,0,.24]) {
      P.addEquipment('hullDetail',cylX(.018,.092,12),side*1.49+dx,1.278,3.796);
      P.addEquipment('hullDetail',box(.034,.054,.061),side*1.49+dx,1.25,3.807);
    }
  }
}
