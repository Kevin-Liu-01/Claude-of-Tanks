// AW original-source cable centre sections and separate hollow terminal eyes.
// The 23 held-out source rays independently coincide with the supplied Burlak
// equipment; no other vehicle builder or external topology is used here.
import * as THREE from 'three';
import {beamBetween} from './measuredPrimitives.ts';
import type {Point3} from './measuredPrimitives.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const LEFT:readonly Point3[]=[[-.824,.720,-3.139],[-.88,.72104,-3.15422],[-.96,.73282,-3.20664],
  [-1.04,.78856,-3.27215],[-1.10,.894,-3.319],[-1.107,1.007,-3.331],[-1.04,1.15004,-3.32255],
  [-.96,1.27390,-3.29051],[-.80,1.39929,-3.23884],[-.65,1.42493,-3.22594],[-.3,1.41219,-3.23216],
  [0,1.41091,-3.24141],[.5,1.42898,-3.25189],[.8,1.43431,-3.23511],[1,1.44533,-3.21391],[1.14,1.462,-3.228],[1.334,1.45,-3.199]];
const RIGHT:readonly Point3[]=[[.779,.742,-3.163],[.88,.74947,-3.22070],[.96,.85186,-3.318],
  [1.001,1.008,-3.369],[.986,1.158,-3.289],[.96,1.22860,-3.25167],[.88,1.31915,-3.19036],
  [.8,1.33324,-3.20009],[.3,1.33889,-3.22265],[0,1.33939,-3.22132],[-.5,1.36244,-3.21170],
  [-.8,1.41056,-3.18834],[-1.04,1.47605,-3.1504],[-1.12,1.47314,-3.1504],[-1.293,1.45,-3.143]];
function cable(P:TankBuilderPort,rows:readonly Point3[]):void{
  const curve=new THREE.CatmullRomCurve3(rows.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  P.addEquipment('hullDark',new THREE.TubeGeometry(curve,144,.0157,10,false));
  for(const p of [rows[0],rows.at(-1)!])P.addEquipment('hullDark',new THREE.SphereGeometry(.0157,10,6),...p);
}
function eyeHead():THREE.BufferGeometry{
  const s=new THREE.Shape();s.moveTo(-.159,0);
  s.bezierCurveTo(-.159,-.065,-.112,-.0807,-.065,-.0807);s.bezierCurveTo(.010,-.0807,.055,-.054,.055,0);
  s.bezierCurveTo(.055,.054,.010,.0807,-.065,.0807);s.bezierCurveTo(-.112,.0807,-.159,.065,-.159,0);
  const h=new THREE.Path();h.moveTo(-.140,0);h.bezierCurveTo(-.140,.042,-.112,.052,-.10,.052);h.lineTo(-.025,.052);
  h.bezierCurveTo(0,.052,.018,.025,.018,0);h.bezierCurveTo(.018,-.025,0,-.052,-.025,-.052);h.lineTo(-.10,-.052);
  h.bezierCurveTo(-.112,-.052,-.140,-.042,-.140,0);s.holes.push(h);
  return new THREE.ExtrudeGeometry(s,{depth:.0285,bevelEnabled:false,curveSegments:28}).translate(0,0,-.01425);
}
function eye(P:TankBuilderPort,c:Point3,a:Point3,b:Point3):void{
  const u=new THREE.Vector3(...a).normalize(),v=new THREE.Vector3(...b).normalize(),w=new THREE.Vector3().crossVectors(u,v).normalize();
  const frame=new THREE.Matrix4().makeBasis(u,v,w);
  P.addEquipment('hullDetail',eyeHead().applyMatrix4(frame),...c);
  // A separate thick neck must not thicken or fill the thin open head.
  const neck=new THREE.CylinderGeometry(.0403,.0393,.136,12).rotateZ(-Math.PI/2).translate(.090,0,0);
  P.addEquipment('hullDetail',neck.applyMatrix4(frame),...c);
}
function lowerHooks(P:TankBuilderPort):void{
  const outline:readonly(readonly[number,number])[]=[[-3.06835,.7974],[-3.09375,.8184],[-3.15035,.9106],[-3.15435,.9575],
    [-3.14065,1.0342],[-3.130,1.044],[-3.117,1.0459],[-3.108,1.03],[-3.111,.990],[-3.125,.950],
    [-3.116,.916],[-3.0343,.850],[-3.02305,.8336],[-2.98650,.800],[-2.97465,.7842],[-3.00975,.7852]];
  for(const x of [-.6528,.64065]){
    const shape=new THREE.Shape(outline.map(([z,y])=>new THREE.Vector2(-z,y)));
    P.addEquipment('hullDetail',new THREE.ExtrudeGeometry(shape,{depth:.0386,bevelEnabled:false}).translate(0,0,-.0193).rotateY(Math.PI/2),x);
  }
  // Source's left eye/carrier gap is sub-mm; the simplified head's hidden
  // bearing uses one 7 mm pin to engage the hook, without covering the eye.
  P.addEquipment('hullDetail',beamBetween([-.65233,.9319,-3.1095],[-.65233,.9288,-3.122],.0035,10));
}
export function addT90AWTowCables(P:TankBuilderPort):void{
  cable(P,LEFT);cable(P,RIGHT);
  eye(P,[.68770,.83316,-3.14845],[.773196,-.614726,-.155821],[.627986,.776409,.053124]);
  eye(P,[-.70622,.832,-3.123],[-.832300,-.541548,-.118330],[-.552710,.794464,.251670]);
  lowerHooks(P);
  // Narrow inferred hidden retainers seat the original upper terminals into
  // the native fender; the visible hanging courses remain source-measured.
  for(const[a,b]of [[[1.33,1.45,-3.199],[1.33,1.30,-3.10]],[[-1.293,1.45,-3.143],[-1.293,1.30,-3.10]]] as const)
    P.addEquipment('hullDetail',beamBetween(a,b,.009,10));
}
