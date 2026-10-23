import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

// Independent scalar study of canonical Barak Object_11. Its two flat towing
// straps and articulated chain surround exterior air; they are not hull armor.
// World X is divided by the family's existing .972 hull scale only at emission.
const HULL_X_SCALE = .972;
type Station = readonly [z: number, bottom: number, top: number];
// Chain stock (2026-10-22, owner float calls): oval links, a torus .043/.0085 drawn .90 wide and 1.20 long. A link's
// inner end bears on its neighbour's, so the pitch is the inner length. The eye at each strap's nose is a ring whose
// bridge carries a junction link; the two runs hang from that link's lower end.
const LINK_R=.043,LINK_TUBE=.0085,LINK_W=.90,LINK_L=1.20;
const HALF_IN_L=LINK_L*(LINK_R-LINK_TUBE),HALF_IN_W=LINK_W*(LINK_R-LINK_TUBE),PITCH=2*HALF_IN_L;
const EYE={outer:.0387,hole:.025,width:.0577,y:.7722,z:4.2398};
interface ChainLink { center: THREE.Vector3; long: THREE.Vector3; width: THREE.Vector3 }

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
  // The nose stops at the eye's hole (it ran on to 4.230 inside the old solid boss).
  strip(P,x,width,[[4.106,.743630,.831292],[4.2148,.734737,.781717]]);
  const shape=new THREE.Shape().absarc(0,0,EYE.outer,0,Math.PI*2,false);
  shape.holes.push(new THREE.Path().absarc(0,0,EYE.hole,0,Math.PI*2,true));
  stock(P,new THREE.ExtrudeGeometry(shape,{depth:EYE.width,bevelEnabled:false,curveSegments:P.q?24:12})
    .translate(0,0,-EYE.width/2).rotateY(Math.PI/2),x,EYE.y,EYE.z);
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

/** n+1 bearing points of an n-link chain hanging from a to b: a catenary in their vertical plane. */
function catenary(a: THREE.Vector3, b: THREE.Vector3, n: number): THREE.Vector3[] {
  const dx=b.x-a.x,dz=b.z-a.z,h=Math.hypot(dx,dz),v=b.y-a.y,length=n*PITCH,span=Math.sqrt(length*length-v*v);
  let lo=1e-4,hi=100;
  for(let i=0;i<100;i++){const k=(lo+hi)/2;if(2*k*Math.sinh(h/(2*k))>span)lo=k;else hi=k;}
  const k=(lo+hi)/2;
  lo=-50;hi=50;
  for(let i=0;i<100;i++){const m=(lo+hi)/2;if(k*(Math.cosh((h-m)/k)-Math.cosh(-m/k))>v)lo=m;else hi=m;}
  const m=(lo+hi)/2,s0=k*Math.sinh(-m/k);
  return Array.from({length:n+1},(_,i)=>{
    const t=m+k*Math.asinh((i*length/n+s0)/k);
    return new THREE.Vector3(a.x+dx*t/h,a.y+k*(Math.cosh((t-m)/k)-Math.cosh(-m/k)),a.z+dz*t/h);
  });
}

/** Links between consecutive bearing points; each link's width runs along the previous link's normal (it hooks
 * through that link's opening). */
function hang(points: THREE.Vector3[], width: THREE.Vector3): ChainLink[] {
  const out: ChainLink[]=[];
  let w=width.clone();
  for(let i=0;i+1<points.length;i++){
    const long=points[i+1].clone().sub(points[i]).normalize();
    w=w.addScaledVector(long,-w.dot(long)).normalize();
    out.push({center:points[i].clone().add(points[i+1]).multiplyScalar(.5),long,width:w});
    w=long.clone().cross(w).normalize();
  }
  return out;
}

function emitLink(P: TankBuilderPort, link: ChainLink): void {
  const g=new THREE.TorusGeometry(LINK_R,LINK_TUBE,P.q?6:4,16);
  g.scale(LINK_W,LINK_L,1);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(link.width,link.long,link.width.clone().cross(link.long)));
  stock(P,g,link.center.x,link.center.y,link.center.z,true);
}

function towingChain(P: TankBuilderPort): void {
  // 2026-10-22 (owner float calls): the 38 rings stood on a spline, apart from each other and from every hook; the
  // right run ended 14 cm short of its clevis. Each side now runs from the clevis pin (the end link around it, bearing
  // on its far side) to the junction link in the strap's eye, which rests on the eye bridge's two upper corners; the
  // front run hangs between the two junction links. Odd counts keep each run's end links square to their hooks.
  const SIDE_LINKS=9,FRONT_LINKS=15,offset=.014,pinR=.017;
  const fronts: THREE.Vector3[]=[];
  for(const side of[-1,1]){
    const x=side<0?-.6011018:.6001018,inward=-side;
    // (+.6 mm: the 16-facet link's inner arc runs that far under the true ellipse at the bridge's edges)
    const junctionY=EYE.y-EYE.hole-HALF_IN_L*Math.sqrt(1-(EYE.width/2/HALF_IN_W)**2)+.0006;
    emitLink(P,{center:new THREE.Vector3(x,junctionY,EYE.z),long:new THREE.Vector3(0,1,0),width:new THREE.Vector3(1,0,0)});
    // the two runs bear on the junction's lower inner arc either side of its tip, clear of each other
    const arcY=junctionY-HALF_IN_L*Math.sqrt(1-(offset/HALF_IN_W)**2);
    fronts.push(new THREE.Vector3(x+inward*offset,arcY+.001,EYE.z));
    const top=new THREE.Vector3(x-inward*offset,arcY+.0055,EYE.z);
    const pin=new THREE.Vector3(side*.6022+(side<0?-.001:0),.645,3.6322);
    let start=pin.clone().add(new THREE.Vector3(0,pinR,0)),points=catenary(start,top,SIDE_LINKS);
    for(let i=0;i<8;i++){
      start=pin.clone().addScaledVector(points[1].clone().sub(pin).normalize(),-pinR);
      points=catenary(start,top,SIDE_LINKS);
    }
    const first=points[1].clone().sub(points[0]).normalize();
    for(const link of hang(points,new THREE.Vector3(1,0,0).cross(first)))emitLink(P,link);
  }
  for(const link of hang(catenary(fronts[0],fronts[1],FRONT_LINKS),new THREE.Vector3(0,0,1)))emitLink(P,link);
}

export function addBarakBowEquipment(P: TankBuilderPort): void {
  for(const side of[-1,1]){hullReceiver(P,side);towStrap(P,side);strapMounts(P,side);}
  towingChain(P);
}
