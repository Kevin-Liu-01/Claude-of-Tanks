// A separate owner-authorized continuation of the original welded Hetman.
// The native T-72B3M hull is retained; every turret contour is first-party new
// stock. No T-90SM turret or current national-concept profile is called.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';
import {beamBetween,blindTube} from './measuredPrimitives.ts';
import {buildT72B3MXHull} from './t72b3mX.ts';
import {eraCassette,supportedSensor,strappedPack,attachedCage} from './modernizationFittings.ts';
import {markSmokeTube} from '../vehicleAuxiliaryGeometry.ts';
import {addVehicleGhillieSuit} from '../ghillieSuit.ts';
import {addNationalUkraineProtection,NATIONAL_UKRAINE_GHILLIE,ukrainianSkirtEra} from './nationalUkraineProtection.ts';
import {HETMAN_II_DESIGN as D} from '../hetmanIIDesign.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box,cylX,cylY,cylZ,torus}=KIT;
type Point=readonly[number,number,number];
type ArmorRow=readonly[z:number,inner:number,outer:number,bottom:number,top:number];

function seatY(P:TankBuilderPort,owner:'hull'|'turret',x:number,z:number):number {
  const ray=new THREE.Raycaster(new THREE.Vector3(x,5,z),new THREE.Vector3(0,-1,0),0,10);
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});let height=-Infinity;
  P.forEachBucketPart([owner,`${owner}ExternalArmor`],geometry=>{
    if(Object.hasOwn(geometry.userData,'eraHitFaceVertexStarts'))return;
    const mesh=new THREE.Mesh(geometry,material);mesh.updateMatrixWorld(true);
    const hit=ray.intersectObject(mesh)[0];if(hit)height=Math.max(height,hit.point.y);
  });
  material.dispose();
  if(!Number.isFinite(height))throw new Error(`${D.id}: unsupported ${owner} fitting at ${x},${z}`);
  return height;
}
function mirrorContour(side:number,ring:[number,number][]):[number,number][] {
  if(side<0){for(const p of ring)p[0]*=-1;ring.reverse();}return ring;
}
function bank(side:number,rows:readonly ArmorRow[]):THREE.BufferGeometry {
  return sectionSolid(rows.map(([z,inner,outer,bottom,top])=>({z,ring:mirrorContour(side,[
    [inner,bottom],[outer-.055,bottom],[outer,bottom+.065],
    [outer,top-.075],[outer-.075,top],[inner,top],
  ])})));
}

function weldedTurret(P:TankBuilderPort):void {
  // A faceted octagonal crown, broad angular shoulders and a long rising-floor
  // command bustle preserve the original identity without copying the SM.
  const sections=([
    [-2.70,.91,.43,.68,.74],[-2.43,1.20,.31,.77,1.03],
    [-1.65,1.32,.22,.80,.88],[-.88,1.36,.13,.80,.88],
    [-.16,1.32,.12,.80,.88],[.34,1.20,.12,.80,.88],
  ] as const).map(([z,w,low,top,crown])=>({z,ring:[
    [-w+.14,low],[w-.14,low],[w,low+Math.min(.10,(top-low)*.30)],[w,top-Math.min(.16,(top-low)*.30)],
    [crown,top],[-crown,top],[-w,top-Math.min(.16,(top-low)*.30)],[-w,low+Math.min(.10,(top-low)*.30)],
  ] as [number,number][]}));
  P.add('turret',sectionSolid(sections));
  for(const side of [-1,1])P.add('turret',sectionSolid(([
    [.32,1.20,.12,.80],[.83,1.54,.12,.74],
    [1.30,1.13,.15,.65],[1.75,.54,.22,.53],
  ] as const).map(([z,w,low,top])=>({z,ring:mirrorContour(side,[
    [.38,low],[w-.045,low],[w,low+.075],[w-.035,top-.10],[w-.12,top],[.38,top],
  ])}))));
  // The circular bearing is independent of the permanently open throat.
  P.add('turret',cylY(.96,.96,.24,64),0,.005,0);

  for(const side of [-1,1]){
    // Large connected double-facet cheek carriers wrap into the side sponson.
    P.addExternalArmor('turret',bank(side,[
      [-1.30,1.17,1.49,.25,.62],[-.68,1.24,1.69,.20,.66],
      [.34,1.13,1.76,.17,.71],[.93,.93,1.60,.18,.70],
      [1.42,.56,1.09,.21,.64],[1.79,.42,.67,.25,.51],
    ]));
    // Open service channels between the aft side armor and command bustle.
    // Floor, end brackets and upper rail are solid; the visible slot is air.
    P.addExternalArmor('turret',box(.39,.105,1.08),side*1.35,.30,-1.69);
    for(const z of [-2.17,-1.21])P.addExternalArmor('turret',box(.15,.30,.075),side*1.49,.445,z);
    P.addExternalArmor('turret',box(.12,.070,1.08),side*1.50,.61,-1.69);
    P.addEquipment('turretDetail',box(.024,.025,1.10),side*1.558,.675,-1.69);
  }
}

function turretEra(P:TankBuilderPort):void {
  // Snapshot permanent receiving stock before creating any destructible ERA.
  const stock:THREE.BufferGeometry[]=[];
  P.forEachBucketPart(['turret','turretExternalArmor'],g=>stock.push(g.clone()));
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  for(const side of [-1,1])for(const [x,baseY,z,w]of [
    [1.50,.43,.31,.32],[1.29,.43,.79,.34],[1.03,.42,1.16,.31],[.77,.40,1.46,.24],
    [1.49,.44,-.34,.29],[1.38,.44,-.82,.29],
  ])for(const dy of [-.08,.08]){
    const y=baseY+dy;
    const dir=new THREE.Vector3(side*x,0,z).normalize(),origin=dir.clone().multiplyScalar(4);origin.y=y;
    dir.negate();const ray=new THREE.Raycaster(origin,dir,0,8);let hit:THREE.Intersection|undefined;
    for(const g of stock){const mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld(true);const h=ray.intersectObject(mesh)[0];if(h&&(!hit||h.distance<hit.distance))hit=h;}
    if(!hit?.face)throw new Error(`${D.id}: cheek ERA has no receiving stock`);
    const n=hit.face.normal.clone();if(n.dot(dir)>0)n.negate();
    const rotation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),n));
    const p=hit.point.clone().addScaledVector(n,.039);
    eraCassette(P,'turret',`turret_era_${side<0?'L':'R'}`,p.toArray(),[Math.min(.15,w*.55),.092,.25],[rotation.x,rotation.y,rotation.z]);
  }
  material.dispose();for(const g of stock)g.dispose();
}

function hullPackage(P:TankBuilderPort):void {
  const span=5.04,count=6,step=span/count;
  for(const side of [-1,1]){
    // Fitted closed shoulder follows the actual native front curve and deck.
    // Across changing deck-seat heights, outward roof/floor facets keep the
    // 37–56 mm courses finite instead of crossing opposite quad diagonals.
    const zs=[-3.10,-2.80,-2.40,-.50,1.65,2.40,2.70,3.06,3.23,3.40];
    P.addExternalArmor('hull',sectionSolid(zs.map(z=>{
      const y=seatY(P,'hull',side*1.729,z),t=Math.max(0,(Math.abs(z)-2.50)/.90),outer=2.095-.07*t,oy=1.442-.095*t;
      return {z,ring:mirrorContour(side,[[1.729,y-.007],[outer,oy-.028],[outer,oy+.028],[1.729,y+.030]])};
    }),{sideQuadDiagonal:'convex'}));
    P.addExternalArmor('hull',box(.12,.105,5.31),side*1.98,1.405,0);
    // Recessed joint stock bridges the service seams between the separate
    // outer panels. The 50 mm face gaps remain readable, but expose 180 mm
    // permanent backing rather than an unprotected slit into the wheel bay.
    for(let i=1;i<count;i++){
      const joint=-span/2+i*step;
      P.addExternalArmor('hull',box(.18,.58,.14),side*2.03,1.10,joint);
      // Fitted lap cap rests on the backer and neighboring segment shoulders.
      // It closes the exposed upper seam through the full ERA-carrier depth,
      // while the recessed vertical joint remains visible below the cap.
      P.addExternalArmor('hull',sectionSolid(([
        [-.115,1.425],[-.065,1.465],[.065,1.465],[.115,1.425],
      ] as const).map(([dz,top])=>({z:joint+dz,ring:mirrorContour(side,[
        [1.99,1.38],[2.22,1.38],[2.22,top],[1.99,top],
      ])}))));
    }
    for(let i=0;i<count;i++){
      const z=-span/2+(i+.5)*step;
      P.addExternalArmor('hull',bank(side,[
        [z-step/2+.025,1.94,2.125,.87,1.405],[z-step/2+.09,1.94,2.15,.78,1.45],
        [z+step/2-.09,1.94,2.15,.78,1.45],[z+step/2-.025,1.94,2.125,.87,1.405],
      ]));
      ukrainianSkirtEra(P,side,z,step,2.15);
      P.addEquipment('hullDetail',box(.050,.050,.26),side*2.12,1.449,z);
    }
    P.addExternalArmor('hull',bank(side,[[-3.10,1.91,2.05,1.02,1.32],[-2.77,1.93,2.15,.89,1.405],[-2.45,1.94,2.15,.80,1.45]]));
    P.addExternalArmor('hull',bank(side,[[2.45,1.94,2.15,.80,1.45],[3.10,1.93,2.15,.96,1.405],[3.40,1.91,2.05,1.06,1.32]]));
    for(const z of [-2.37,-.77,.83,2.35]){
      const y=seatY(P,'hull',side*1.72,z);
      P.addEquipment('hullDetail',beamBetween([side*1.72,y+.02,z],[side*2.10,1.48,z],.012,8));
    }
    // Continuous camouflage carrier is seated directly on the permanent roof.
    P.addEquipment('hullDetail',box(.03,.03,4.64),side*2.23,1.39,0);
    for(const z of [-2.15,-.71,.73,2.15])P.addEquipment('hullDetail',box(.16,.035,.045),side*2.16,1.39,z);
  }
}

function tray(P:TankBuilderPort,x:number,z:number,w:number,d:number):number {
  const feet:Point[]=[];
  for(const dx of [-w*.34,w*.34])for(const dz of [-d*.34,d*.34])feet.push([x+dx,seatY(P,'turret',x+dx,z+dz),z+dz]);
  const y=Math.max(...feet.map(f=>f[1]))+.025;
  for(const [fx,fy,fz]of feet)P.addEquipment('turretDetail',box(.045,y-fy+.012,.055),fx,(y+fy)/2-.006,fz);
  P.addEquipment('turretDetail',box(w,.028,d),x,y+.006,z);return y+.020;
}
function caseOnTray(P:TankBuilderPort,x:number,z:number,w:number,h:number,d:number):void {
  const y=tray(P,x,z,w+.032,d+.032);
  P.addEquipment('turretDetail',box(w,h,d),x,y+h/2-.005,z);
  P.addEquipment('turretDetail',box(w+.014,.018,d+.014),x,y+h,z);
  for(const dx of [-w*.28,w*.28]){
    P.addEquipment('turretDark',box(.027,.055,.015),x+dx,y+h-.026,z+d/2+.006);
    P.addEquipment('turretDetail',beamBetween([x+dx-.03,y+h+.012,z],[x+dx+.03,y+h+.012,z],.011,8));
  }
}
function equipment(P:TankBuilderPort):void {
  // Front-left optic and rear command panorama lie outside the RWS's full
  // yaw cylinder. The exposed middle roof is reserved for its working station.
  supportedSensor(P,[-.84,.94,.08],seatY(P,'turret',-.84,.08)-.008);
  supportedSensor(P,[-1.07,1.00,-1.86],seatY(P,'turret',-1.07,-1.86)-.008);
  for(const side of [-1,1]){
    const x=side*.96,z=-2.29,y=seatY(P,'turret',x,z);
    P.addEquipment('turretDetail',cylY(.065,.078,.068,14),x,y+.024,z);
    P.addEquipment('turretDark',cylY(.008,.015,.64,10),x,y+.37,z);
    // Protected forward lamps and two articulated smoke banks.
    const sx=side*1.69,sz=-.18,sy=seatY(P,'turret',sx,sz);
    P.addEquipment('turretDetail',box(.17,.075,.44),sx,sy+.028,sz);
    for(let i=0;i<4;i++)P.addEquipment('turretDark',markSmokeTube(blindTube(.042,.030,.25,.095,12),[0,0,1],true),sx+side*.055,sy+.110,sz-.17+i*.114,-.62,side*.62);
    const lx=side*1.29,lz=.55,ly=seatY(P,'turret',lx,lz);
    P.addEquipment('turretDetail',box(.18,.06,.17),lx,ly+.025,lz);
    P.addEquipment('turretDetail',cylZ(.063,.11,18),lx,ly+.095,lz+.02);
    P.addEquipment('turretGlass',cylZ(.053,.010,18),lx,ly+.095,lz+.081);
    for(const dx of [-.09,.09])P.addEquipment('turretDetail',beamBetween([lx+dx,ly+.01,lz-.07],[lx+dx,ly+.18,lz+.06],.011,8));
    P.addEquipment('turretDetail',beamBetween([lx-.09,ly+.18,lz+.06],[lx+.09,ly+.18,lz+.06],.011,8));
    // Low cases and strapped provisions sit on solid aft roof stock.
    caseOnTray(P,side*.72,-1.49,.32,.095,.36);
    const py=tray(P,side*.78,-2.35,.32,.34);
    strappedPack(P,'turret',[side*.78,py+.075,-2.35],[.28,.15,.30]);
    const ey=seatY(P,'turret',side*1.12,.40);
    P.addEquipment('turretDetail',box(.15,.025,.12),side*1.12,ey+.009,.40);
    P.addEquipment('turretDetail',torus(.050,.015,12,6),side*1.12,ey+.062,.40);
  }
  caseOnTray(P,0,-2.28,.51,.15,.34);
  // The open side screens are supported from the service-channel floor and
  // rear frame, retaining a visible air slot along both command-bustle flanks.
  for(const side of [-1,1]){
    const x=side*1.65;
    for(const z of [-2.34,-1.44]){
      P.addEquipment('turretDetail',beamBetween([side*1.16,.36,z],[x,.36,z],.023,10));
      P.addEquipment('turretDetail',box(.032,.40,.034),x,.53,z);
    }
    for(const y of [.34,.72])P.addEquipment('turretDetail',box(.035,.035,.95),x,y,-1.89);
    for(let i=1;i<8;i++)P.addEquipment('turretDetail',box(.015,.37,.016),x,.53,-2.34+i*.1125);
  }
  attachedCage(P,'turret',[0,.56,-2.94],2.10,.42,.39);
  // Rear cable drum is attached to a pair of arms emerging from the end plate.
  for(const x of [-.19,.19])P.addEquipment('turretDetail',beamBetween([x,.57,-2.60],[x,.57,-2.86],.02,10));
  P.addEquipment('turretDark',cylX(.088,.31,20),0,.57,-2.855);
  for(const x of [-.17,.17])P.addEquipment('turretDetail',cylX(.115,.024,18),x,.57,-2.855);
}

function fieldCamouflage(P:TankBuilderPort):void {
  for(const side of [-1,1]){
    for(const z of [-2.51,-1.91]){
      const y=seatY(P,'turret',side*.38,z);
      P.addEquipment('turretDetail',box(.035,.052,.035),side*.38,y+.017,z);
    }
    const a=seatY(P,'turret',side*.38,-2.51),b=seatY(P,'turret',side*.38,-1.91);
    P.addEquipment('turretDetail',beamBetween([side*.38,a+.043,-2.51],[side*.38,b+.043,-1.91],.014,8));
  }
}

export function buildHetmanII(P:TankBuilderPort):void {
  buildT72B3MXHull(P);
  P.turretG.position.set(.008,D.y,D.z);
  weldedTurret(P);turretEra(P);hullPackage(P);equipment(P);fieldCamouflage(P);
  addNationalUkraineProtection(P,D.id);addVehicleGhillieSuit(P,NATIONAL_UKRAINE_GHILLIE[D.id]);
  P.topY=D.roofY;
  P.hullG.userData.familyRebuild={donor:'t72b3m_x',turret:'hetman-ii-custom-welded',revision:1,concept:true,
    lineage:'original-hetman-t90sm-era-command-modernization'};
}
