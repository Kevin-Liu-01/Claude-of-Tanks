// Original curved cable and hollow recovery eyes from independent source
// sections. Only scalar dimensions are used; the mesh oracle stays local.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number,number,number];
const CABLE_POINTS: readonly Point[] = [
  [-.792,.755,-3.415],[-.837,.743,-3.449],[-.92226,.800,-3.52195],
  [-.95959,.850,-3.56966],[-.98041,.900,-3.60244],[-.99907,.950,-3.62910],
  [-1.002,1.009,-3.634],[-1.0003,1.050,-3.6202],
  [-.9983,1.120,-3.586],[-.982,1.190,-3.542],
  [-.933,1.305,-3.471],[-.816,1.355,-3.452],[-.45,1.364,-3.477],
  [0,1.362,-3.475],[.53,1.391,-3.463],[.83,1.446,-3.435],
  [1.043,1.497,-3.400],[1.296,1.477,-3.391],
];

function recoveryCable(): THREE.BufferGeometry {
  const curve=new THREE.CatmullRomCurve3(CABLE_POINTS.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  const geometry=new THREE.TubeGeometry(curve,112,.0125,8,false);
  geometry.userData.sourceRecoveryPart='cable';
  return geometry;
}

function leftEyeShape(): THREE.Shape {
  const shape=new THREE.Shape();
  shape.moveTo(-.802,.718);
  shape.quadraticCurveTo(-.840,.745,-.831,.780);
  shape.quadraticCurveTo(-.793,.820,-.756,.849);
  shape.quadraticCurveTo(-.772,.875,-.728,.907);
  shape.quadraticCurveTo(-.674,.983,-.618,.974);
  shape.quadraticCurveTo(-.570,.966,-.549,.915);
  shape.quadraticCurveTo(-.535,.882,-.565,.846);
  shape.quadraticCurveTo(-.594,.806,-.654,.773);
  shape.quadraticCurveTo(-.710,.763,-.757,.731);
  shape.quadraticCurveTo(-.781,.711,-.802,.718);
  const hole=new THREE.Path();
  hole.moveTo(-.683,.812);
  hole.quadraticCurveTo(-.713,.834,-.721,.860);
  hole.quadraticCurveTo(-.713,.883,-.690,.904);
  hole.lineTo(-.657,.939);
  hole.quadraticCurveTo(-.630,.961,-.606,.944);
  hole.quadraticCurveTo(-.577,.927,-.572,.894);
  hole.quadraticCurveTo(-.567,.877,-.589,.854);
  hole.quadraticCurveTo(-.629,.805,-.668,.801);
  hole.quadraticCurveTo(-.677,.801,-.683,.812);
  shape.holes.push(hole);
  return shape;
}

function rightEyeShape(): THREE.Shape {
  const shape=new THREE.Shape();
  shape.moveTo(1.300,1.490);
  shape.quadraticCurveTo(1.282,1.462,1.298,1.434);
  shape.quadraticCurveTo(1.371,1.399,1.410,1.374);
  shape.quadraticCurveTo(1.471,1.339,1.532,1.333);
  shape.quadraticCurveTo(1.582,1.331,1.600,1.379);
  shape.quadraticCurveTo(1.618,1.418,1.595,1.445);
  shape.quadraticCurveTo(1.552,1.484,1.471,1.489);
  shape.quadraticCurveTo(1.433,1.485,1.412,1.479);
  shape.lineTo(1.357,1.490);
  shape.quadraticCurveTo(1.325,1.498,1.300,1.490);
  const hole=new THREE.Path();
  hole.moveTo(1.445,1.436);
  hole.quadraticCurveTo(1.484,1.451,1.522,1.445);
  hole.quadraticCurveTo(1.558,1.440,1.577,1.418);
  hole.quadraticCurveTo(1.583,1.397,1.553,1.381);
  hole.quadraticCurveTo(1.519,1.379,1.477,1.407);
  hole.quadraticCurveTo(1.446,1.418,1.445,1.436);
  shape.holes.push(hole);
  return shape;
}

function eyeFront(x:number,y:number,left:boolean):number {
  if(left)return -3.397+.09*(x+.69)+.153*(y-.93)-Math.max(0,.82-y)*.26;
  const ring=-3.43034-.189*(x-1.59)-.839*(y-1.42);
  const neck=-3.420964+.0051*(x-1.33)+.29334*(y-1.47);
  return Math.max(ring,neck-.005);
}

function recoveryEye(left:boolean):THREE.BufferGeometry {
  const geometry=new THREE.ExtrudeGeometry(left?leftEyeShape():rightEyeShape(),
    {depth:1,bevelEnabled:false,curveSegments:8});
  const positions=geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++) {
    const x=positions.getX(i),y=positions.getY(i),t=positions.getZ(i);
    const depth=left?.0305+Math.max(0,.82-y)*.57:.032;
    positions.setZ(i,eyeFront(x,y,left)+t*depth);
  }
  geometry.computeVertexNormals();
  geometry.userData.sourceRecoveryPart=left?'left-eye':'right-eye';
  return geometry;
}

function rightEyeNeck():THREE.BufferGeometry {
  // A separate closed swaged neck occupies the measured inboard portion.
  // This retains its genuine deeper face without warping a single cap over
  // incompatible neck and ring planes or filling the adjacent eye opening.
  const points=rightEyeShape().getPoints(8),clipped:THREE.Vector2[]=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    if(a.x<=1.441)clipped.push(a);
    if((a.x<=1.441)!==(b.x<=1.441))clipped.push(a.clone().lerp(b,(1.441-a.x)/(b.x-a.x)));
  }
  const geometry=new THREE.ExtrudeGeometry(new THREE.Shape(clipped),{depth:.075,bevelEnabled:false});
  const p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)-3.420964+.0051*(p.getX(i)-1.33)+.29334*(p.getY(i)-1.47));
  geometry.computeVertexNormals();
  geometry.userData.sourceRecoveryPart='right-neck';
  return geometry;
}

function leftHanger():THREE.BufferGeometry {
  const shape=new THREE.Shape();
  shape.moveTo(-3.4005,.973);
  for(const [z,y]of [[-3.376,1.057],[-3.320,1.012],[-3.295,1.057],
    [-3.240,.948],[-3.205,.888],[-3.240,.797],[-3.320,.820],
    [-3.360,.87515],[-3.398,.944],[-3.4005,.973]])shape.lineTo(z,y);
  const hole=new THREE.Path();
  hole.moveTo(-3.361,.935);hole.lineTo(-3.356,1.000);
  hole.lineTo(-3.319,.976);hole.lineTo(-3.330,.944);hole.closePath();
  shape.holes.push(hole);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.040,bevelEnabled:false});
  // Rotate the source-measured side profile into a narrow transverse strap.
  geometry.rotateY(-Math.PI/2);geometry.translate(-.622,0,0);
  geometry.userData.sourceRecoveryPart='left-hanger';
  return geometry;
}

function eyeSupports(P:TankBuilderPort):void {
  // The narrow hanger retains its own open middle, as well as leaving the
  // recovery eye's center open to the actual rear hull surface.
  P.addEquipment('hullDetail',leftHanger());
  // An 8 mm hidden forward seating allowance closes the source's separate
  // hanger/tub join with positive native contact; exterior rays stay fixed.
  P.addEquipment('hullDetail',KIT.box(.040,.038,.030),-.642,1.036,-3.287);
  // The raised right retainer is separate from the inclined eye and meets
  // the existing shoulder; neither side needs a solid backing disk.
  P.addEquipment('hullDetail',KIT.box(.1126,.0578,.0842),1.3254,1.4771,-3.2848);
  rightEyeBacking(P);
}

function rightEyeBacking(P:TankBuilderPort):void {
  // Separate 3 mm panel behind the right opening, not the old raised shelf.
  P.addEquipment('hullDetail',KIT.box(.22719,.058816,.0032),1.50612,1.39286,-3.3019);
  // Its narrow outboard folded cover reaches the existing raised engine
  // deck. The inboard service slot is not covered by a full-width box.
  const rows:readonly (readonly[number,number,number,number])[]=[
    [-3.300,1.4342,1.4205,.003],[-3.270,1.4719,1.4582,.013],
    [-3.220,1.527,1.521,.015],[-3.170,1.57974,1.57974,.012],
  ];
  P.addEquipment('hullDetail',sectionSolid(rows.map(([z,inner,outer,thickness])=>({z,
    ring:[[1.425,inner-thickness],[1.625,outer-thickness],[1.625,outer],[1.425,inner]],
  }))));
}

export function addT90SMTowCable(P:TankBuilderPort):void {
  P.addEquipment('hullDark',recoveryCable());
  P.addEquipment('hullDetail',recoveryEye(true));
  P.addEquipment('hullDetail',recoveryEye(false));
  P.addEquipment('hullDetail',rightEyeNeck());
  eyeSupports(P);
}
