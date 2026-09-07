// Original rounded plates and bent receiving rails, built from source scalar
// sizes/planes. The reference mesh, its contours and connectivity never ship.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Origin = readonly [number, number, number];
const RAKE = .0100435;

function sloped(g: THREE.BufferGeometry, intercept = 0): THREE.BufferGeometry {
  return g.applyMatrix4(new THREE.Matrix4().set(1,0,0,0, 0,1,RAKE,intercept,
    0,0,1,0, 0,0,0,1));
}

function roundedPlate(x: number, z: number, width: number, length: number,
  radius: number, thickness: number, crown: number): THREE.BufferGeometry {
  const a=-width/2,b=width/2,c=-length/2,d=length/2,r=radius,s=new THREE.Shape();
  s.moveTo(a+r,c);s.lineTo(b-r,c);s.quadraticCurveTo(b,c,b,c+r);
  s.lineTo(b,d-r);s.quadraticCurveTo(b,d,b-r,d);s.lineTo(a+r,d);
  s.quadraticCurveTo(a,d,a,d-r);s.lineTo(a,c+r);s.quadraticCurveTo(a,c,a+r,c);
  const g=new THREE.ExtrudeGeometry(s,{depth:thickness,steps:1,bevelEnabled:false,curveSegments:5});
  g.rotateX(-Math.PI/2).translate(x,0,z);
  return sloped(g,crown-thickness);
}

function add(P: TankBuilderPort, pivot: Origin, g: THREE.BufferGeometry): void {
  P.addEquipment('turretDetail',g,-pivot[0],-pivot[1],-pivot[2]);
}

function latch(P: TankBuilderPort, pivot: Origin, x: number, z: number,
  base: number, crown: number): void {
  // Object6's small folded catch is an L, not a solid bounding box. Its
  // underside exposes air between the thin top tongue and the receiving lid.
  add(P,pivot,sloped(KIT.box(.10515,crown-base,.00430)
    .translate(x,(base+crown)/2,z-.01145)));
  add(P,pivot,sloped(KIT.box(.10515,.004285,.02721)
    .translate(x,crown-.004285/2,z)));
}

function serviceCovers(P: TankBuilderPort, pivot: Origin): void {
  for(const x of[-.467430,-.095443,.276545,.648533]) {
    add(P,pivot,roundedPlate(x,-.841187,.303447,.847173,.06003,.0091,2.213789));
    latch(P,pivot,x-.006221,-1.177818,2.21215,2.231223);
  }
  for(const z of[-1.115803,-.587381]) {
    add(P,pivot,roundedPlate(1.052956,z,.217325,.481150,.05820,.0087,2.213370));
    latch(P,pivot,1.059418,z-.166861,2.21125,2.230770);
    add(P,pivot,sloped(pullHandle().translate(1.051983,2.21333,z+.185865)));
  }
  add(P,pivot,roundedPlate(-.937527,-1.441645,.475836,.995568,.05005,.0074,2.211984));
  for(const z of[-1.841095,-1.072782])latch(P,pivot,-.935627,z,2.2103,2.229544);
  add(P,pivot,roundedPlate(-.356829,-1.667449,.615209,.384296,0,.009,2.213597));
  for(const x of[-.538506,-.166518])latch(P,pivot,x,-1.787776,2.2112,2.231080);
  add(P,pivot,roundedPlate(.752589,-1.638115,.673842,.457376,.045,.0072,2.211982));
  // Forward crew-cover plate sits beneath its existing separate rear hinge
  // carriage, not a second generic raised box over the whole footprint.
  add(P,pivot,roundedPlate(.674262,.143628,.500884,.5905,.05418,.0264,2.231590));
}

function pullHandle(): THREE.BufferGeometry {
  const s=new THREE.Shape(),outer=.041295,inner=.034425,crown=.03510,bend=.012;
  s.moveTo(-outer,-.001);s.lineTo(-outer,crown-bend);
  s.quadraticCurveTo(-outer,crown,-outer+bend,crown);
  s.lineTo(outer-bend,crown);s.quadraticCurveTo(outer,crown,outer,crown-bend);
  s.lineTo(outer,-.001);s.lineTo(inner,-.001);s.lineTo(inner,crown-bend);
  s.quadraticCurveTo(inner,crown-.00687,outer-bend,crown-.00687);
  s.lineTo(-outer+bend,crown-.00687);
  s.quadraticCurveTo(-inner,crown-.00687,-inner,crown-bend);
  s.lineTo(-inner,-.001);s.closePath();
  return new THREE.ExtrudeGeometry(s,{depth:.00687,steps:1,bevelEnabled:false,curveSegments:6})
    .translate(0,0,-.003435);
}

function liftingRail(x: number): THREE.BufferGeometry {
  const rear=-1.905233,front=-1.350435,bend=.0675,top=2.409335,r=.01924;
  const y=top-r,foot=2.2030,path=new THREE.CurvePath<THREE.Vector3>();
  const p=(height: number,z: number)=>new THREE.Vector3(x,height,z);
  path.add(new THREE.LineCurve3(p(foot,rear),p(y-bend,rear)));
  const k=.55228474983;
  path.add(new THREE.CubicBezierCurve3(p(y-bend,rear),p(y-bend+k*bend,rear),
    p(y,rear+bend-k*bend),p(y,rear+bend)));
  path.add(new THREE.LineCurve3(p(y,rear+bend),p(y,front-bend)));
  path.add(new THREE.CubicBezierCurve3(p(y,front-bend),p(y,front-bend+k*bend),
    p(y-bend+k*bend,front),p(y-bend,front)));
  path.add(new THREE.LineCurve3(p(y-bend,front),p(foot,front)));
  // Inferred concealed foot extension overlaps the original armor by 2.4mm;
  // source exposed rail crowns and the two longitudinal air slots stay exact.
  return sloped(new THREE.TubeGeometry(path,48,r,8,false));
}

export function addType10XRoofPanels(P: TankBuilderPort, pivot: Origin): void {
  serviceCovers(P,pivot);
  for(const x of[.0018409,.1690486]) {
    add(P,pivot,liftingRail(x));
    for(const z of[-1.905233,-1.350435])
      add(P,pivot,sloped(KIT.cylY(.01924,.01924,.001,8).translate(x,2.203,z)));
  }
}
