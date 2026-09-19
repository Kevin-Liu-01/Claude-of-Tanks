import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

// Independent scalar study of canonical Barak Object_11. Its two flat towing
// straps and articulated chain surround exterior air; they are not hull armor.
// World X is divided by the family's existing .972 hull scale only at emission.
const HULL_X_SCALE = .972;
type Station = readonly [z: number, bottom: number, top: number];

function stock(P: TankBuilderPort, geometry: THREE.BufferGeometry, x=0, y=0, z=0, dark=false): void {
  geometry.scale(1/HULL_X_SCALE,1,1);
  P.addEquipment(dark?'hullDark':'hullDetail',geometry,x/HULL_X_SCALE,y,z);
}

function strip(P: TankBuilderPort, x: number, width: number, stations: readonly Station[]): void {
  stock(P,sectionSolid(stations.map(([z,bottom,top])=>({z,ring:[
    [x-width/2,bottom],[x+width/2,bottom],[x+width/2,top],[x-width/2,top],
  ]}))));
}

function towStrap(P: TankBuilderPort, side: number): void {
  const x=side<0?-.6011018:.6001018,width=.0577093;
  // Independent upper/lower plane sections leave the long tapered aperture.
  // In particular, neither a bounding box nor a solid cable-loop envelope
  // may replace the air between these two arms.
  strip(P,x,width,[[3.792,.7747,.9825],[3.798,.7747,.9847]]);
  strip(P,x,width,[[3.795,.8205,.9847],[3.825585,.897018,.976544],
    [3.853499,.886448,.9490845],[4.108192,.790013,.8302690]]);
  strip(P,x,width,[[3.7155,.7814,.7946],[3.798166,.76879,.8208968],
    [4.105916,.743637,.7812032],[4.108192,.743451,.790513]]);
  strip(P,x,width,[[4.106,.743630,.831292],[4.230045,.7334915,.774769]]);
  stock(P,KIT.cylX(.0387,width,16),x,.7722,4.2398);
}

function mountPlate(P: TankBuilderPort, x: number): void {
  // A 19.5 mm thick rounded plate, measured in Y/Z rather than a hull-wide
  // support box. The short caps are elliptical, with a .112 m straight axis.
  const centerZ=3.756517,centerY=.9506195,angle=Math.atan2(-.0430595,.1034415);
  const shape=new THREE.Shape(),half=.05603,cap=.02565,r=.03761;
  for(let end=0;end<2;end++)for(let i=0;i<=6;i++){
    const a=(end?Math.PI/2:-Math.PI/2)+i*Math.PI/6;
    const u=(end?-half:half)+Math.cos(a)*cap,v=Math.sin(a)*r;
    const z=centerZ+u*Math.cos(angle)-v*Math.sin(angle);
    const y=centerY+u*Math.sin(angle)+v*Math.cos(angle);
    if(!end&&!i)shape.moveTo(z,y);else shape.lineTo(z,y);
  }
  shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:.0195004,bevelEnabled:false,curveSegments:1});
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++)p.setXYZ(i,x+p.getZ(i)-.0097502,p.getY(i),p.getX(i));
  // Swapping the extrusion and longitudinal axes reverses handedness.
  if(g.index){for(let i=0;i<g.index.count;i+=3){const b=g.index.getX(i+1);g.index.setX(i+1,g.index.getX(i+2));g.index.setX(i+2,b);}}
  else {for(let i=0;i<p.count;i+=3){const b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);p.setXYZ(i+1,c.x,c.y,c.z);p.setXYZ(i+2,b.x,b.y,b.z);}}
  g.computeVertexNormals();stock(P,g);
}

function hullReceiver(P: TankBuilderPort, side: number): void {
  // Object_29's narrow lower beak receiver is distinct from Object_11's
  // suspended strap. Its rear sheet laps the hull before curling upward
  // into the two mount cheeks; it does not fill the aperture ahead of them.
  const x=side<0?-.6008048:.5998048;
  strip(P,x,.0598869,[[3.513,.80462,.82062],[3.64,.77937,.79537],
    [3.68,.77976,.79576],[3.702,.7917,1.01659],[3.72,.811916,1.0112874],
    [3.76,.9040245,.9988273],[3.78,.9586738,.9827863]]);
}

function strapMounts(P: TankBuilderPort, side: number): void {
  const offset=side<0?-.001:0;
  for(const x of[.5622889,.6385086])mountPlate(P,side*x+offset);
  // Transverse retaining pins join both mounting cheeks and the flat strap.
  for(const [y,z]of[[.969,3.72],[.935,3.80],[.90419,3.88884],[.83297,4.06494]])
    stock(P,KIT.cylX(.00595,.10324,12),side*.618117+offset,y,z);
  for(const [y,z]of[[.90419,3.88884],[.83297,4.06494]])
    stock(P,KIT.box(.003,.03415,.05325),side*.65994+offset,y,z);
  // Lower source clevis transfers the chain load into the hull's lower beak.
  stock(P,KIT.box(.172,.041,.0417),side*.6022+offset,.7811,3.6322);
  for(const x of[.535,.668])stock(P,KIT.box(.018,.135,.033),side*x+offset,.708,3.631);
  stock(P,KIT.cylX(.017,.166,12),side*.6022+offset,.645,3.6322);
}

function towingChain(P: TankBuilderPort): void {
  const path=new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.62,.654,3.64),new THREE.Vector3(-.657,.582,3.84),
    new THREE.Vector3(-.667,.694,4.09),new THREE.Vector3(-.596,.782,4.222),
    new THREE.Vector3(-.35,.625,4.232),new THREE.Vector3(0,.548,4.226),
    new THREE.Vector3(.35,.625,4.213),new THREE.Vector3(.595,.775,4.211),
    new THREE.Vector3(.663,.693,4.09),new THREE.Vector3(.632,.576,3.87),
    new THREE.Vector3(.602,.662,3.77),
  ],false,'centripetal');
  const count=38;
  for(let i=0;i<count;i++){
    const t=i/(count-1),point=path.getPointAt(t),tangent=path.getTangentAt(t).normalize();
    const g=KIT.torus(.043,.0085,P.q?12:8,P.q?6:4);
    g.scale(.78,1.20,1);g.rotateY(i%2?Math.PI/2:0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),tangent));
    stock(P,g,point.x,point.y,point.z,true);
  }
}

export function addBarakBowEquipment(P: TankBuilderPort): void {
  for(const side of[-1,1]){hullReceiver(P,side);towStrap(P,side);strapMounts(P,side);}
  towingChain(P);
}
