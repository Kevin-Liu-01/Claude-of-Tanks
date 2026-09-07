// Independently authored roof fittings from scalar dimensions/plane witnesses.
// The comparison OBJ is unarmed at these yokes. A separately documented
// photo-led operating weapon is attached by k1a1XMachineGun.ts.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const RING_Y=1.49566,RING_Z=.42564;
function add(P:TankBuilderPort,g:THREE.BufferGeometry,x:number,y:number,z:number,
  bucket='turretDetail'):void {
  P.addEquipment(bucket,g,x,y-RING_Y,z-RING_Z);
}

function beam(P:TankBuilderPort,a:readonly[number,number,number],
  b:readonly[number,number,number],width:number,depth:number):void {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b);
  const axis=end.clone().sub(start),middle=start.clone().add(end).multiplyScalar(.5);
  const g=KIT.box(width,axis.length(),depth);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis.normalize()));
  add(P,g,middle.x,middle.y,middle.z);
}

function sightRing(radius:number,notch:boolean):[number,number][] {
  const halfSlot=.0953,start=notch?Math.asin(halfSlot/radius):0;
  const n=32,span=notch?Math.PI*2-start*2:Math.PI*2;
  const ring:[number,number][]=[];
  for(let i=0;i<(notch?n+1:n);i++) {
    const theta=start+span*i/n;
    ring.push([radius*Math.sin(theta),-radius*.9547*Math.cos(theta)]);
  }
  if(notch)ring.push([-halfSlot,-.159],[halfSlot,-.159]);
  return ring;
}

function sightBody(rows:readonly (readonly[number,number])[],notch:boolean):THREE.BufferGeometry {
  const sections:SolidSection[]=rows.map(([y,r])=>({z:y,ring:sightRing(r,notch)}));
  return sectionSolid(sections).rotateX(-Math.PI/2);
}

function commanderSight(P:TankBuilderPort):void {
  // The opaque island alone appears hollow all the way through. Actual source
  // glass closes that opening at Z.46507 (X-.811,Y2.44), behind the narrow lip.
  add(P,sightBody([[2.22806,.1625],[2.325,.1953]],false),-.811,0,.28714);
  add(P,sightBody([[2.324,.195],[2.431,.2339],[2.56,.2339]],true),-.811,0,.28714);
  const cap=sightBody([[2.559,.2339],[2.566,.2339],[2.58446,.213]],false);
  const p=cap.attributes.position;
  for(let i=0;i<p.count;i++)p.setZ(i,Math.min(p.getZ(i),.1885));
  cap.computeVertexNormals();
  add(P,cap,-.811,0,.28714);
  const back=KIT.box(.197,.246,.014).rotateX(.057);
  add(P,back,-.811,2.437,.4497,'turretDark');
  const glass=KIT.box(.190,.231,.012).rotateX(.057);
  add(P,glass,-.811,2.440,.45907,'turretGlass');
}

function hingedMantletCover(P:TankBuilderPort):void {
  // Complete source ...k1a1_3_26 is a turret-mounted sheet, despite its hull
  // material-group prefix. Its front hinge pairs mate with the pitch boot.
  const sheet=KIT.box(.6981,.0115,.2277).rotateX(.018);
  add(P,sheet,-.01655,2.21560,1.46625);
  for(const [x,y,z] of [[-.25195,2.2200,1.5417],[.19655,2.2236,1.5461]]) {
    add(P,KIT.box(.1009,.0106,.0662),x,y,z);
    add(P,KIT.cylX(.00965,.0481,16),x,y+.00615,z+.0253);
  }
}

function leftWeaponYoke(P:TankBuilderPort):void {
  // A canted, supported arm carries an open U-tray, not a solid weapon block.
  beam(P,[-.645,2.25,.468],[-.405,2.486,.706],.068,.067);
  add(P,KIT.box(.111,.050,.117),-.635,2.253,.479);
  add(P,KIT.cylY(.052,.052,.158,20),-.3867,2.590,.6952);
  const tray=sectionSolid([[.49194,2.61276],[.596,2.64696],[.85534,2.64696]]
    .map(([z,y])=>({z,ring:[[-.4385,y],[-.3359,y],[-.3359,y+.0108],[-.4385,y+.0108]]})));
  add(P,tray,0,0,0);
  for(const x of [-.43,-.3444])add(P,KIT.box(.017,.079,.238),x,2.69826,.73634);
  for(const x of [-.4436,-.3301]) {
    add(P,KIT.box(.040,.0742,.0715),x,2.71536,.64109);
    add(P,KIT.cylX(.024,.024,16),x,2.703,.648);
  }
}

function rightWeaponYoke(P:TankBuilderPort):void {
  add(P,KIT.cylY(.122,.122,.035,28),.8611,2.218,.61304);
  beam(P,[.786,2.224,.622],[.865,2.454,.688],.041,.041);
  beam(P,[.918,2.224,.549],[.921,2.454,.680],.041,.041);
  add(P,KIT.cylY(.043,.043,.1108,16),.91405,2.41576,.68009);
  add(P,KIT.cylY(.06395,.06395,.0489,20),.91405,2.49561,.68009);
  add(P,KIT.box(.0908,.041,.1078),.9141,2.5405,.70324);
  add(P,KIT.box(.0908,.012,.0614),.9141,2.58626,.68004);
  add(P,KIT.box(.0293,.0586,.0465),.91405,2.55716,.73389);
  // Separate source slotted upright and offset outboard tray leave real air.
  const upright=sectionSolid([[.620,.795,.857,2.322,2.374],
    [.655,.808,.877,2.279,2.579],[.759,.808,.875,2.279,2.579],
    [.786,.846,.858,2.308,2.605]].map(([z,x0,x1,low,top])=>({z,
      ring:[[x0,low],[x1,low],[x1,top],[x0,top]] as [number,number][]})));
  add(P,upright,0,0,0);
  for(const x of [.815,.868])add(P,KIT.box(.014,.0455,.110),x,2.6018,.708);
  add(P,KIT.box(.0576,.012,.3372),.915,2.54556,.59904);
  for(const x of [.893,.937])add(P,KIT.box(.014,.075,.124),x,2.58396,.70564);
}

export function addK1A1XRoof(P:TankBuilderPort):void {
  commanderSight(P);leftWeaponYoke(P);rightWeaponYoke(P);hingedMantletCover(P);
}
