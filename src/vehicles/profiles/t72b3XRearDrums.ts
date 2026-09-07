// Independent scalar reconstruction of the two gear533 drum bodies and their
// distinct wide retaining strips. No supplied topology is used or loaded.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {roofSheet,beamBetween,type Point3} from './measuredPrimitives.ts';
import {sectionSolid} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

function retainingBand(radius:number,width:number):THREE.BufferGeometry {
  // Closed sheet, not a solid protection disk. Its inner face overlaps the
  // drum shell; the source's filled end caps are concealed by the drum itself.
  const inner=.3085,half=width/2;
  return new THREE.LatheGeometry([[inner,-half],[radius,-half],[radius,half],
    [inner,half],[inner,-half]].map(([r,y])=>new THREE.Vector2(r,y)),12).rotateZ(Math.PI/2);
}

function bentPipe(P:TankBuilderPort,centres:readonly Point3[]):void {
  // Independent bend-axis/radius measurements define the source's low-poly
  // triangular hose. The low middle course is not a straight elevated arch.
  const r=.02465;
  const g=sectionSolid(centres.map(([x,y,z])=>({z:x,ring:Array.from({length:3},(_,i)=>{
    const a=Math.PI/3+i*Math.PI*2/3;return[-z+r*Math.cos(a),y+r*Math.sin(a)] as const;
  })}))).rotateY(Math.PI/2);
  P.addEquipment('hullDark',g);
}

function pipework(P:TankBuilderPort):void {
  bentPipe(P,[[-.5907,1.70255,-3.321525],[-.2908,1.56815,-3.199325],
    [.0091,1.49060,-3.17785],[.309,1.56815,-3.199325],[.6033,1.72390,-3.358425]]);
  bentPipe(P,[[-.7864,1.32795,-3.0528],[-.6500,1.6020,-3.1780],[-.2908,1.53245,-3.1740],
    [.0091,1.45445,-3.15195],[.309,1.55345,-3.1740],[.6033,1.68765,-3.3325]]);
  for(const x of [-.5756,.6012]){
    const cap=new THREE.Vector3(x,1.76308,-3.3308),axis=new THREE.Vector3(0,.620115,.78451).normalize();
    const back=cap.clone().addScaledVector(axis,-.056);
    P.addEquipment('hullDetail',beamBetween(back.toArray(),cap.toArray(),.0435,6));
    P.addEquipment('hullDetail',beamBetween([x,1.664,-3.397],[x,1.723,-3.351],.0435,6));
  }
}

function cradle(P:TankBuilderPort,x:number):void {
  // Source is an open 3.6 mm axial folded channel: lower edge, upper bearing
  // stations and the wider 34.5 mm top flange are independently measured.
  const stations=[[-3.68815,1.1023,1.1768],[-3.556,1.0770,1.1522],[-3.53,1.0771,1.1522],
    [-3.40,1.1193,1.1936],[-3.35,1.1193,1.2183],[-3.26495,1.10305,1.3096],[-3.11865,1.1384,1.1385]];
  P.addEquipment('hullDetail',sectionSolid(stations.map(([z,low,high])=>({z,
    ring:[[x-.0018,low],[x+.0018,low],[x+.0018,high],[x-.0018,high]]}))));
  P.addEquipment('hullDetail',roofSheet(stations.slice(0,-1).map(([z,_low,high])=>
    [z,x-.01725,x+.01725,high,high]),.0025));
  // A small concealed attachment tongue joins the uncapped source channel to
  // the simplified native transom underside. Its hidden weld is inferred;
  // visible channel contours and the broad drum-to-hull air remain unchanged.
  P.addEquipment('hullDetail',KIT.box(.0036,.061,.026),x,1.157,-3.124);
}

export function addT72B3RearDrums(P:TankBuilderPort):void {
  for(const[x,width]of [[-.59719975,.944600073],[.61315023,.944500086]]){
    // Source body is a twelve-sided cylinder, not the whole plumbing envelope.
    P.addEquipment('hullDetail',KIT.cylX(.311325,width,12),x,1.44280026,-3.534);
  }
  for(const x of [-.87699977,-.28689976,.30280023,.89290025]){
    P.addEquipment('hullDark',retainingBand(.3208,.0636),x,1.44280026,-3.534);
  }
  for(const x of [-.74089974,-.42614976,.44135024,.75615025]){
    P.addEquipment('hullDetail',retainingBand(.33925,.01945),x,1.44465025,-3.5328);
  }
  for(const x of [-.8955,-.2951,.3132,.9136]){
    cradle(P,x);
  }
  pipework(P);
}
