// Independently measured Burlak rear furniture, authored as analytic solids.
import * as THREE from 'three';
import {sectionSolid} from './sectionSolid.ts';
import {roofSheet,beamBetween} from './measuredPrimitives.ts';
import type {Point3} from './measuredPrimitives.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
type Height=readonly[z:number,y:number];
const FLANGE:readonly Height[]=[[-3.79105,1.2813],[-3.72075,1.2383],[-3.66995,1.2197],[-3.60355,1.2119],
  [-3.53515,1.2148],[-3.47855,1.2275],[-3.43555,1.248],[-3.37505,1.293],[-3.31445,1.3457]];
const WEB:readonly Height[]=[[-3.80275,1.2305],[-3.79885,1.2148],[-3.73635,1.1699],[-3.68165,1.1494],
  [-3.60745,1.1367],[-3.52535,1.1396],[-3.45705,1.1553],[-3.38285,1.1836],[-3.32225,1.2168],[-3.31055,1.2109],[-3.24215,1.2617]];
function height(rows:readonly Height[],z:number):number{
  if(z<=rows[0][0])return rows[0][1];for(let i=1;i<rows.length;i++)if(z<=rows[i][0]){
    const[a,y]=rows[i-1],[b,next]=rows[i];return y+(next-y)*(z-a)/(b-a);
  }return rows[rows.length-1][1];
}
function cradle(P:TankBuilderPort,x:number,dy:number,dz:number):void{
  const zs=[...new Set([...WEB.map(r=>r[0]),...FLANGE.map(r=>r[0])])].sort((a,b)=>a-b);
  const upper=(z:number)=>z<FLANGE[0][0]?1.2305+(z+3.80275)*3.2:z>FLANGE.at(-1)![0]?1.343:height(FLANGE,z)-.006;
  P.addEquipment('hullDetail',sectionSolid(zs.map(z=>({z:z+dz,ring:[[x-.0049,height(WEB,z)+dy],
    [x+.0049,height(WEB,z)+dy],[x+.0049,Math.max(upper(z),height(WEB,z)+.0004)+dy],[x-.0049,Math.max(upper(z),height(WEB,z)+.0004)+dy]]}))));
  P.addEquipment('hullDetail',roofSheet(FLANGE.map(([z,y])=>[z+dz,x-.0244,x+.0264,y+dy,y+dy] as const),.0098));
  const roots:readonly(readonly[number,number,number])[]=[[-3.295,1.198,1.190],[-3.252,1.237,1.1582],
    [-3.23245,1.2422,1.153],[-3.18355,1.2275,1.139],[-3.15235,1.2334,1.139],[-3.10935,1.150,1.1494]];
  P.addEquipment('hullDetail',sectionSolid(roots.map(([z,t,b])=>({z:z+dz,ring:[[x-.0121,b+dy],[x+.0121,b+dy],[x+.0121,t+dy],[x-.0121,t+dy]]}))));
  P.addEquipment('hullDetail',roofSheet([[-3.32815+dz,x-.05935,x+.05935,1.205+dy,1.205+dy],
    [-3.21485+dz,x-.05935,x+.05935,1.2734+dy,1.2734+dy]],.027));
}
// Authored centreline stations from cross-section centres, not source vertices.
const LEFT_LINE:readonly Point3[]=[[-.824,.720,-3.139],[-.88,.72104,-3.15422],[-.96,.73282,-3.20664],
  [-1.04,.78856,-3.27215],[-1.10,.894,-3.319],[-1.107,1.007,-3.331],[-1.04,1.15004,-3.32255],
  [-.96,1.27390,-3.29051],[-.80,1.39929,-3.23884],[-.65,1.42493,-3.22594],[-.3,1.41219,-3.23216],
  [0,1.41091,-3.24141],[.5,1.42898,-3.25189],[.8,1.43431,-3.23511],[1,1.44533,-3.21391],[1.14,1.462,-3.228],[1.334,1.45,-3.199]];
const RIGHT_LINE:readonly Point3[]=[[.779,.742,-3.163],[.88,.74947,-3.22070],[.96,.85186,-3.318],
  [1.001,1.008,-3.369],[.986,1.158,-3.289],[.96,1.22860,-3.25167],[.88,1.31915,-3.19036],
  [.8,1.33324,-3.20009],[.3,1.33889,-3.22265],[0,1.33939,-3.22132],[-.5,1.36244,-3.21170],
  [-.8,1.41056,-3.18834],[-1.04,1.47605,-3.1504],[-1.12,1.47314,-3.1504],[-1.293,1.45,-3.143]];
function cable(P:TankBuilderPort,rows:readonly Point3[]):void{
  const curve=new THREE.CatmullRomCurve3(rows.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  P.addEquipment('hullDark',new THREE.TubeGeometry(curve,144,.0157,10,false));
  for(const p of [rows[0],rows.at(-1)!])P.addEquipment('hullDark',new THREE.SphereGeometry(.0157,10,6),...p);
}
function eye(P:TankBuilderPort,center:Point3,a:Point3,b:Point3):void{
  // The source head is a thin oval loop; only its separate terminal neck is
  // 80 mm thick. A uniformly extruded oval falsely fills the mounting air.
  const shape=new THREE.Shape();shape.moveTo(-.159,0);
  shape.bezierCurveTo(-.159,-.065,-.112,-.0807,-.065,-.0807);
  shape.bezierCurveTo(.010,-.0807,.055,-.054,.055,0);
  shape.bezierCurveTo(.055,.054,.010,.0807,-.065,.0807);
  shape.bezierCurveTo(-.112,.0807,-.159,.065,-.159,0);
  const hole=new THREE.Path();hole.moveTo(-.140,0);
  hole.bezierCurveTo(-.140,.042,-.112,.052,-.10,.052);hole.lineTo(-.025,.052);
  hole.bezierCurveTo(0,.052,.018,.025,.018,0);
  hole.bezierCurveTo(.018,-.025,0,-.052,-.025,-.052);hole.lineTo(-.10,-.052);
  hole.bezierCurveTo(-.112,-.052,-.140,-.042,-.140,0);shape.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(shape,{depth:.0285,bevelEnabled:false,curveSegments:28}).translate(0,0,-.01425);
  const av=new THREE.Vector3(...a).normalize(),bv=new THREE.Vector3(...b).normalize(),c=new THREE.Vector3().crossVectors(av,bv).normalize();
  const basis=new THREE.Matrix4().makeBasis(av,bv,c);
  g.applyMatrix4(basis);P.addEquipment('hullDetail',g,...center);
  const neck=new THREE.CylinderGeometry(.0403,.0393,.136,12).rotateZ(-Math.PI/2).translate(.090,0,0);
  neck.applyMatrix4(basis);P.addEquipment('hullDetail',neck,...center);
}
function lowerAnchors(P:TankBuilderPort):void{
  eye(P,[.68770,.83316,-3.14845],[.773196,-.614726,-.155821],[.627986,.776409,.053124]);
  eye(P,[-.70622,.83200,-3.123],[-.832300,-.541548,-.118330],[-.552710,.794464,.251670]);
  // Two distinct original narrow lower hook carriers, not broad rear plates.
  for(const x of [-.6528,.64065]){
    // Bent J-section: the lower foot reaches the transom, while the upright
    // wraps behind the eye. Its measured rear planes are not a filled ramp.
    const outline:readonly Height[]=[[-3.06835,.7974],[-3.09375,.8184],[-3.15035,.9106],[-3.15435,.9575],
      [-3.14065,1.0342],[-3.130,1.044],[-3.117,1.0459],[-3.108,1.03],[-3.111,.990],[-3.125,.950],
      [-3.116,.916],[-3.0343,.850],[-3.02305,.8336],[-2.98650,.800],[-2.97465,.7842],[-3.00975,.7852]];
    const shape=new THREE.Shape(outline.map(([z,y])=>new THREE.Vector2(-z,y)));
    const g=new THREE.ExtrudeGeometry(shape,{depth:.0386,bevelEnabled:false}).translate(0,0,-.0193).rotateY(Math.PI/2);
    P.addEquipment('hullDetail',g,x);
  }
  // The source left eye/carrier clearance is 0.55 mm. The simplified flat
  // eye head leaves an 8 mm gap at its hidden bearing: close only that seat,
  // with a 7 mm pin, without thickening the open head or filling its aperture.
  P.addEquipment('hullDetail',beamBetween([-.65233,.9319,-3.1095],[-.65233,.9288,-3.122],.0035,10));
}
function upperRetainers(P:TankBuilderPort):void{
  // Narrow hidden closures meet the existing authored fender, leaving the
  // actual suspended cable free along the transom rather than adding a plate.
  for(const[a,b]of [[[1.33,1.45,-3.199],[1.33,1.30,-3.10]],[[-1.293,1.45,-3.143],[-1.293,1.30,-3.10]]] as const)
    P.addEquipment('hullDetail',beamBetween(a,b,.009,10));
}
export function addT90BurlakRearFurniture(P:TankBuilderPort):void{
  for(const x of [-.7988,-.3735,.36355,.80275])cradle(P,x,x<-.7?.0029:0,x<-.7?.0078:0);
  cable(P,LEFT_LINE);cable(P,RIGHT_LINE);lowerAnchors(P);upperRetainers(P);
}
