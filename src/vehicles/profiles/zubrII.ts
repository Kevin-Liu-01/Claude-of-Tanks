// T-72B3 Zubr II: a separate welded Polish modernization study.
// Keeps the earlier broad-turret/extended-bustle lineage, with bespoke closed
// armor stock instead of a T-90SM donor turret or the current compact casting.
import * as THREE from 'three';
import {KIT, FITTINGS} from './kit.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {sectionSolid, type SectionPoint} from './sectionSolid.ts';
import {buildT72B3XHullCore, buildT72B3XRunningGear, buildT72B3XFenders} from './t72b3X.ts';
import {eraCassette, glacisEraCassette, strappedPack, attachedCage} from './modernizationFittings.ts';
import {mount} from './fittingMount.ts';
import {addPolishProtection} from './nationalPolandProtection.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {ZUBR_II_DESIGN} from '../zubrIIDesign.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {box, cylY, cylZ, torus} = KIT;
type Point = readonly [number, number, number];
type StockRow = readonly [z:number, inside:number, outside:number, bottom:number, top:number];

function mirror(ring: SectionPoint[], side: number): SectionPoint[] {
  return side > 0 ? ring : ring.map(([x,y]) => [-x,y] as const).reverse();
}

function topOn(P:TankBuilderPort, owner:'hull'|'turret', x:number, z:number):number {
  const geometries:THREE.BufferGeometry[]=[];
  P.forEachBucketPart([owner],g=>geometries.push(g));
  return topOf(geometries,x,z);
}

function topOf(stock:readonly THREE.BufferGeometry[], x:number,z:number):number {
  const ray=new THREE.Raycaster(new THREE.Vector3(x,5,z),new THREE.Vector3(0,-1,0),0,6);
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});let y=-Infinity;
  for(const g of stock){const mesh=new THREE.Mesh(g,mat);mesh.updateMatrixWorld(true);
    const hit=ray.intersectObject(mesh)[0];if(hit)y=Math.max(y,hit.point.y);}
  mat.dispose();if(!Number.isFinite(y))throw new Error(`Zubr II has no physical seat at ${x},${z}`);return y;
}

function interpolate(rows:readonly (readonly [number,number])[],z:number):number {
  for(let i=1;i<rows.length;i++)if(z<=rows[i][0]){
    const [az,ay]=rows[i-1],[bz,by]=rows[i];return ay+(by-ay)*Math.max(0,Math.min(1,(z-az)/(bz-az)));}
  return rows[rows.length-1][1];
}

function hullEquipment(P:TankBuilderPort):void {
  for(const side of [-1,1])for(const z of [2.15,2.41,2.67,2.91])for(const x of [.23,.56,.86])
    glacisEraCassette(P,`glacis_era_${side<0?'L':'R'}`,side*x,z,[.265,.088,.23]);
  const hatchY=topOn(P,'hull',0,1.59);
  P.addHatch('hull',cylY(.29,.29,.034,24),0,hatchY+.014,1.59);
  for(const x of [-.16,0,.16]){
    P.addEquipment('hullDetail',box(.135,.050,.10),x,hatchY+.050,1.74);
    P.addModuleVisual('optics','hullGlass',box(.104,.025,.012),x,hatchY+.053,1.796);
  }
  // Slatted rear cooling covers lie on the original deck, retaining its fold.
  for(const x of [-.48,.48]){
    const y=topOn(P,'hull',x,-2.35);
    P.addEquipment('hullDetail',box(.85,.030,1.00),x,y+.012,-2.35);
    for(let i=0;i<12;i++)P.addEquipment('hullDark',box(.76,.010,.025),x,y+.033,-2.80+i*.081);
  }
  for(const side of [-1,1]){
    const x=side*.91,z=2.77,y=topOn(P,'hull',x,z);
    P.addEquipment('hullDetail',box(.20,.072,.14),x,y+.033,z);
    P.addEquipment('hullDetail',cylZ(.073,.085,16),x,y+.082,z+.054);
    P.addEquipment('hullGlass',markVehicleNightLens(cylZ(.056,.012,16),'headlight'),x,y+.082,z+.103);
    for(const dx of [-.103,.103])P.addEquipment('hullDark',beamBetween([x+dx,y,z-.10],[x+dx,y+.18,z+.095],.009));
    P.addEquipment('hullDark',beamBetween([x-.103,y+.18,z+.095],[x+.103,y+.18,z+.095],.009));
    deckCabinet(P,side*1.40,-2.56,.40,.60,.105);
    deckCabinet(P,side*1.43,-1.75,.33,.48,.075);
    P.addEquipment('hullDetail',box(.12,.082,.085),side*.67,.805,3.157);
    P.addEquipment('hullDark',torus(.055,.016,16,6),side*.67,.803,3.206);
    // Rear lamps and shackle eyes are fastened to the native rear wall.
    P.addEquipment('hullDetail',box(.19,.10,.075),side*.79,1.195,-3.175);
    P.addEquipment('hullGlass',markVehicleNightLens(box(.125,.051,.016),'marker'),side*.79,1.204,-3.219);
    P.addEquipment('hullDetail',box(.13,.18,.13),side*.74,1.18,-3.125);
    P.addEquipment('hullDark',torus(.058,.016,16,6),side*.74,1.10,-3.150);
  }
}

function deckCabinet(P:TankBuilderPort,x:number,z:number,w:number,d:number,h:number):void {
  const seats=[z-d*.34,z+d*.34].map(fz=>[fz,topOn(P,'hull',x,fz)] as const);
  const floor=Math.max(...seats.map(p=>p[1]))+.014;
  for(const [fz,y]of seats)P.addEquipment('hullDetail',box(w*.77,floor-y+.017,.07),x,(floor+y)/2,fz);
  P.addEquipment('hullDetail',box(w,h,d),x,floor+h/2,z);
  P.addEquipment('hullDetail',box(w+.016,.020,d+.012),x,floor+h+.002,z);
  for(const dz of [-d*.31,d*.31])P.addEquipment('hullDark',box(.075,.021,.038),x,floor+h+.023,z+dz);
}

/** Distinct deep Polish side modules: real .24m stock, upper attachment rail,
 * four ERAWA courses and chamfered returns outside the native track sweep. */
function skirts(P:TankBuilderPort):void {
  const inside=1.86,outside=2.10,low=.67,count=7,length=5.40,rear=-2.58,front=2.82,pitch=length/count;
  const bevel=(a:number,b:number,lo:number,hi:number):SectionPoint[]=>[
    [a,lo+.055],[a+.026,lo],[b-.035,lo],[b,lo+.065],[b,hi-.065],[b-.035,hi],[a,hi]];
  for(const side of [-1,1]){
    const heights:number[]=[];
    for(let i=0;i<count;i++){
      const z=rear+pitch*(i+.5),deck=topOn(P,'hull',side*1.53,z),high=Math.max(1.44,deck+.015);
      heights.push(high);const half=pitch/2-.017;
      P.addExternalArmor('hull',sectionSolid([
        {z:z-half,ring:mirror(bevel(inside+.018,outside-.021,low+.025,high-.016),side)},
        {z:z-half+.07,ring:mirror(bevel(inside,outside,low,high),side)},
        {z:z+half-.07,ring:mirror(bevel(inside,outside,low,high),side)},
        {z:z+half,ring:mirror(bevel(inside+.018,outside-.021,low+.025,high-.016),side)}]));
      P.addEquipment('hullDetail',box(.065,.15,pitch+.024),side*(inside+.038),high-.061,z);
      for(let row=0;row<4;row++)for(const dz of [-.236,0,.236])
        eraCassette(P,'hull',`skirt_era_${side<0?'L':'R'}`,[side*(outside+.043),low+.105+row*.162,z+dz],[.095,.139,.211]);
      for(const dz of [-pitch*.32,pitch*.32])P.addEquipment('hullDark',cylZ(.025,.030,8).rotateY(Math.PI/2),side*(outside+.01),high-.035,z+dz);
    }
    const rearClear=-2.98,rearEnd=-3.31,frontClear=3.35,frontEnd=3.58;
    P.addExternalArmor('hull',sectionSolid([
      {z:rearEnd,ring:mirror(bevel(1.53,1.77,.80,1.075),side)},
      {z:rearClear,ring:mirror(bevel(inside,outside,.67,1.25),side)},
      {z:rear+.04,ring:mirror(bevel(inside+.018,outside-.018,low+.025,heights[0]-.016),side)}]));
    P.addExternalArmor('hull',sectionSolid([
      {z:front-.04,ring:mirror(bevel(inside+.018,outside-.018,low+.025,heights[count-1]-.016),side)},
      {z:frontClear,ring:mirror(bevel(inside,outside,.63,1.06),side)},
      {z:frontEnd,ring:mirror(bevel(1.53,1.77,.63,.87),side)}]));
    const carriers:readonly (readonly [number,number])[]=[[rearEnd,1.075],[rearClear,1.25],
      ...heights.map((h,i)=>[rear+pitch*(i+.5),h] as const),[frontClear,1.06],[frontEnd,.87]];
    const nativeKnots=[-3.31,-3.18,-2.96,-2.76,-1.89,.395,1.70,2.50,3.08,3.22,3.34,3.43,3.50];
    const stations=[...new Set([...nativeKnots,rear,front,...heights.map((_,i)=>rear+pitch*(i+.5))])].sort((a,b)=>a-b);
    P.addEquipment('hullDetail',sectionSolid(stations.map(z=>{
      const deck=topOn(P,'hull',side*1.53,z),carrier=interpolate(carriers,z);
      const turn=z<rearClear?interpolate([[rearEnd,1.53],[rearClear,inside]],z)
        :z>frontClear?interpolate([[frontClear,inside],[frontEnd,1.53]],z):inside;
      const out=turn+.10;
      return {z,ring:mirror([[1.50,deck-.01],[out,carrier-.028],[out,Math.max(carrier+.017,deck+.025)],[1.50,deck+.025]],side)};
    })));
  }
}

function turretShell(P:TankBuilderPort):void {
  // The rear core is one clipped eight-sided welded chamber. Its crown is a
  // genuinely level mounting surface, not overlapping separate roof plates.
  const rows:readonly (readonly [number,number,number,number])[]=[
    [-2.28,.90,.32,.69],[-2.02,1.42,.27,.78],[-1.18,1.57,.19,.84],[-.34,1.58,.10,.84],[.34,1.48,.10,.84]];
  P.add('turret',sectionSolid(rows.map(([z,w,floor,top])=>({z,ring:[
    [-w+.09,floor],[w-.09,floor],[w,floor+.09],[w,top-.15],
    [w-.18,top],[-w+.18,top],[-w,top-.15],[-w,floor+.09]]}))));
  // Broad flat cheek shoulders turn into narrow chamfered gun-adjacent tips.
  // Only these split cheeks continue forward of z=.34; the ±.38 throat is air.
  const cheeks:readonly StockRow[]=[
    [.32,.38,1.48,.10,.84],[.83,.38,1.42,.13,.77],[1.31,.38,.94,.14,.61],[1.65,.38,.59,.17,.46]];
  for(const side of [-1,1])P.add('turret',sectionSolid(cheeks.map(([z,a,b,lo,hi])=>({z,ring:mirror([
    [a,lo],[b-.075,lo],[b,lo+.07],[b,hi-.09],[b-.055,hi],[a,hi]],side)}))));
}

/** Permanent squared panniers intersect the welded shell and connect through
 * a clipped rear bridge. ERA is mounted only against this frozen stock set. */
function armorShell(P:TankBuilderPort):THREE.BufferGeometry[] {
  const stock:THREE.BufferGeometry[]=[];
  const add=(g:THREE.BufferGeometry)=>{stock.push(g.clone());P.addExternalArmor('turret',g);};
  const rows:readonly StockRow[]=[
    [-2.21,.78,1.29,.36,.69],[-1.82,1.13,1.74,.30,.76],[-.69,1.39,1.84,.23,.78],
    [.30,1.35,1.81,.20,.76],[.92,1.22,1.65,.19,.70],[1.40,.53,1.06,.19,.56],[1.72,.40,.61,.18,.46]];
  for(const side of [-1,1])add(sectionSolid(rows.map(([z,a,b,lo,hi])=>({z,ring:mirror([
    [a,lo+.04],[a+.025,lo],[b-.055,lo],[b,lo+.065],[b,hi-.055],[b-.045,hi],[a,hi-.012]],side)}))));
  add(box(1.83,.32,.20).translate(0,.51,-2.18));
  // Dense vertical ERAWA courses distinguish the long, almost rectangular
  // flanks from the fan-shaped ERA of the compact national Zubr.
  for(const side of [-1,1]){
    for(const z of [-1.56,-1.24,-.92,-.60,-.28,.04,.36])for(const y of [.36,.54,.70])
      armorEra(P,stock,[side*1.90,y,z],.17,.23,side);
    for(const [x,z]of [[.55,1.66],[.80,1.52],[1.08,1.34],[1.34,1.13],[1.57,.84]])
      for(const y of z>1.5?[.29]:z>1.2?[.30,.465]:[.30,.49,.64])armorEra(P,stock,[side*x,y,z],.16,.19,side);
  }
  return stock;
}

function armorEra(P:TankBuilderPort,stock:readonly THREE.BufferGeometry[],seed:Point,h:number,d:number,side:number):void {
  // Frontward rays for the wedge, X rays for the squared panniers. This hits
  // permanent armor even after previously emitted ERA courses are present.
  const direction=seed[2]>.50?new THREE.Vector3(seed[0],0,seed[2]).normalize().negate():new THREE.Vector3(-side,0,0);
  const origin=new THREE.Vector3(...seed).addScaledVector(direction,-3),ray=new THREE.Raycaster(origin,direction,0,6);
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});let best:THREE.Intersection|undefined;
  for(const g of stock){const mesh=new THREE.Mesh(g,mat);mesh.updateMatrixWorld(true);
    const hit=ray.intersectObject(mesh)[0];if(hit&&(!best||hit.distance<best.distance))best=hit;}
  mat.dispose();if(!best?.face)throw new Error(`Zubr II ERA has no backing at ${seed}`);
  const normal=best.face.normal.clone();if(normal.dot(direction)>0)normal.negate();
  const rotation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(side,0,0),normal));
  const center=best.point.clone().addScaledVector(normal,.039);
  eraCassette(P,'turret',`turret_era_${side<0?'L':'R'}`,center.toArray(),[.092,h,d],[rotation.x,rotation.y,rotation.z]);
}

function seatedCase(P:TankBuilderPort,stock:readonly THREE.BufferGeometry[],x:number,z:number,w:number,d:number,h:number):void {
  const feet=[-1,1].flatMap(sx=>[-1,1].map(sz=>{
    const fx=x+sx*w*.32,fz=z+sz*d*.32;return [fx,topOf(stock,fx,fz),fz] as const;}));
  const floor=Math.max(...feet.map(p=>p[1]))+.014;
  for(const [fx,y,fz]of feet)P.addEquipment('turretDetail',box(.065,floor-y+.018,.065),fx,(floor+y)/2,fz);
  P.addEquipment('turretDetail',box(w,h,d),x,floor+h/2,z);
  P.addEquipment('turretDetail',box(w+.018,.020,d+.018),x,floor+h+.002,z);
  for(const dx of [-w*.31,w*.31]){
    P.addEquipment('turretDark',box(.030,.047,.021),x+dx,floor+h*.75,z+d/2+.006);
    P.addEquipment('turretDark',box(.052,.022,.08),x+dx,floor+h+.024,z-d*.23);
  }
}

function turretEquipment(P:TankBuilderPort,stock:readonly THREE.BufferGeometry[]):void {
  const primary:THREE.BufferGeometry[]=[];P.forEachBucketPart(['turret'],g=>primary.push(g));
  const all=[...primary,...stock];
  // Service cabinets and masts stay behind the complete RWS swept radius.
  for(const side of [-1,1]){
    seatedCase(P,all,side*.91,-1.90,.39,.41,.15);
    const ax=side*.53,az=-2.11,seat=topOf(all,ax,az);
    P.addEquipment('turretDetail',cylY(.060,.075,.06,12),ax,seat+.024,az);
    P.addEquipment('turretDark',cylY(.008,.014,.64,8),ax,seat+.369,az);
    // Bolted pannier lids and clamped tools remain low under the roof gun.
    for(const z of [-1.24,-.72,-.20]){
      const x=side*1.53,y=topOf(stock,x,z);
      P.addEquipment('turretDetail',box(.27,.024,.41),x,y+.008,z);
      P.addEquipment('turretDark',box(.069,.018,.15),x,y+.029,z);
    }
    const x=side*1.60,a=-1.31,b=-.46,ya=topOf(stock,x,a)+.035,yb=topOf(stock,x,b)+.035;
    P.addEquipment('turretDark',beamBetween([x,ya,a],[x,yb,b],.016));
    for(const z of [-1.19,-.58]){
      const deck=topOf(stock,x,z),y=ya+(yb-ya)*(z-a)/(b-a);
      P.addEquipment('turretDetail',box(.09,y-deck+.022,.034),x,(deck+y)/2,z);
    }
    // Smoke assemblies mount on the fore outer armor, forward/outboard of
    // the gun station; a solid plinth bridges the sloping receiving surface.
    const sx=side*1.39,sz=.65,sy=topOf(stock,sx,sz);
    P.addEquipment('turretDetail',box(.35,.065,.21),sx,sy+.023,sz);
    const bank=FITTINGS.smokeBank({mats:P.mats,count:4,r:.034,len:.20,pitch:-.56,splay:side*.70,arc:.28,spacing:.077,shadows:P.q});
    mount(P,'turret',bank,sx,sy+.112,sz+.014);
  }
  const opticX=-.99,opticZ=.16,opticY=topOn(P,'turret',opticX,opticZ);
  P.addEquipment('turretDetail',box(.26,.13,.25),opticX,opticY+.057,opticZ);
  P.addModuleVisual('optics','turretGlass',box(.18,.070,.014),opticX,opticY+.075,opticZ+.132);
  P.addEquipment('turretDetail',box(.29,.025,.28),opticX,opticY+.134,opticZ);
  for(const dx of [-.156,.156])P.addEquipment('turretDetail',beamBetween([opticX+dx,opticY-.01,opticZ-.10],[opticX+dx,opticY+.19,opticZ+.14],.010));
  P.addEquipment('turretDetail',beamBetween([opticX-.156,opticY+.19,opticZ+.14],[opticX+.156,opticY+.19,opticZ+.14],.010));
  // A long, visibly open bustle basket carries a strapped field load. Four
  // rails penetrate the permanent rear bridge and support every floor bar.
  const rear=-2.70,front=-2.14,mid=(rear+front)/2,floor=.385;
  for(const x of [-.80,-.34,.34,.80])P.addEquipment('turretDetail',box(.035,.034,front-rear+.10),x,floor,mid+.04);
  attachedCage(P,'turret',[0,.56,rear],2.28,.35,front-rear);
  for(const z of [-2.61,-2.40,-2.20])P.addEquipment('turretDetail',box(2.27,.025,.023),0,floor+.008,z);
  for(const side of [-1,1]){
    P.addEquipment('turretDetail',box(.51,.024,.40),side*.72,floor+.022,-2.43);
    strappedPack(P,'turret',[side*.72,floor+.125,-2.43],[.47,.18,.36]);
  }
  P.addEquipment('turretDetail',box(.71,.024,.36),0,floor+.022,-2.43);
  P.addEquipment('turretCloth',cylZ(.12,.66,18).rotateY(Math.PI/2),0,floor+.158,-2.43);
  for(const x of [-.22,.22])P.addEquipment('turretDark',torus(.123,.012,18,6).rotateY(Math.PI/2),x,floor+.158,-2.43);
  // Protected rear lights sit on the welded bridge rather than float in air.
  for(const side of [-1,1]){
    P.addEquipment('turretDetail',box(.15,.11,.08),side*.59,.62,-2.295);
    P.addEquipment('turretGlass',markVehicleNightLens(box(.10,.045,.012),'marker'),side*.59,.63,-2.34);
  }
}

/** Shared gun, cupola and independent RWS are added by the integrator. */
export function buildZubrII(P:TankBuilderPort):void {
  P.hullG.position.set(0,0,0);
  P.turretG.position.set(.008,ZUBR_II_DESIGN.y,.065591);
  buildT72B3XHullCore(P);buildT72B3XRunningGear(P);buildT72B3XFenders(P);
  hullEquipment(P);skirts(P);turretShell(P);
  const armor=armorShell(P);turretEquipment(P,armor);
  addPolishProtection(P,3,armor);
  for(const g of armor)g.dispose();
  P.topY=ZUBR_II_DESIGN.roofY;
}
