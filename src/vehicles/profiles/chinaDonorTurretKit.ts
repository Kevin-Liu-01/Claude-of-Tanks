// Owner 2026-10-15 (VEH-19, VEH-20): the T-72B3 Qilin carries the production ZTZ-99A2 turret and the T-72B3M Kunlun
// the Type 96B turret, each emitted by its own builder (nationalDonorTurret.ts). The Kunlun keeps its special ERA,
// its 30 mm autocannon and its Shtora eyes on the Type 96B; the Qilin keeps its compact remote station and field fit.
// The hulls keep their Chinese packages unchanged (nationalChina.ts chinaDonorHull).
//   "for the t72nn3 qilin, adopt its turret to actually use the ztz-99a2 turret and make the kunlun usee the type 96b
//    turret except with the special era, autocannon, shtora eyes"
// Everything here is turret-local (origin on the ring centre, +Z forward, +X the vehicle's left) and stands on
// permanent donor stock found by raycast: never on removable ERA, never in open air.
import * as THREE from 'three';
import {KIT,orientedSlab} from './kit.ts';
import {chinaDonorHull,equipmentFoot,lowOptic,permanentParts,serviceCable,serviceCase} from './nationalChina.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {markEraHitFaces} from './eraHitFaces.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {nationalLamp,nationalRoofSensor} from './nationalRoofSystems.ts';
import {NATIONAL_ROOF_LOADOUTS} from '../nationalRoofConfig.ts';
import type {ChineseChevronReceipt} from './chineseChevronEra.ts';
import type {NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const {box,cylY,cylZ,cylX}=KIT;
type ChinaDonorId='t72b3m_kunlun'|'t72b3_qilin';
type P3=readonly [number,number,number];

/** Frozen permanent receivers: raycasts against these never land on ERA or on parts added after the freeze. */
class Stock {
  private readonly meshes:THREE.Mesh[]=[];
  private readonly material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  constructor(P:TankBuilderPort,buckets:readonly string[],withEra=false){
    P.forEachBucketPart([...buckets],g=>{
      if(!withEra&&Array.isArray(g.userData.eraHitFaceVertexStarts))return;
      const m=new THREE.Mesh(g,this.material);m.updateMatrixWorld(true);this.meshes.push(m);
    });
  }
  hit(origin:THREE.Vector3,direction:THREE.Vector3,far=4):THREE.Intersection|undefined {
    const ray=new THREE.Raycaster(origin,direction.clone().normalize(),0,far);
    return ray.intersectObjects(this.meshes,false)[0];
  }
  dispose():void {this.material.dispose();}
}

// ---------------------------------------------------------------------------------------------------------------
// Kunlun: the special ERA. Chinese single-piece chevron cassettes (a broad module with a 40 mm blunt horizontal
// ridge, chineseChevronEra.ts) laid over the Type 96B's front wedge: the upper faces from the shoulder line to the roof
// edge, either side of the mantlet. The 96B's wedge faces are twisted (each welded panel is two triangles), so every
// tile is seated on its own measured plane: a permanent carrier fills from the actual shell up to the tile's back plane,
// a seat pad sits on it and the removable cassette rides the pad, as on the Chinese concepts' flank housings.

// The Type 96B builder's own wedge stations in this turret frame (type96bX.ts buildType96Turret, turretStation rows
// at source z .64/1.33/1.93 minus the frame's -0.15, heights minus its 1.60): the shoulder line and the roof edge.
const WEDGE_Z=[.79,1.48,2.08] as const;
const WEDGE_SHOULDER:readonly (readonly [number,number])[]=[[1.44,.24],[1.00,.23],[.40,.24]];
const WEDGE_ROOF:readonly (readonly [number,number])[]=[[.93,.65],[.50,.45],[.26,.38]];

function wedgePoint(side:number,z:number,t:number):THREE.Vector3 {
  const i=z<=WEDGE_Z[1]?0:1,f=(z-WEDGE_Z[i])/(WEDGE_Z[i+1]-WEDGE_Z[i]);
  const lerp=(a:readonly [number,number],b:readonly [number,number])=>[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f] as const;
  const s=lerp(WEDGE_SHOULDER[i],WEDGE_SHOULDER[i+1]),r=lerp(WEDGE_ROOF[i],WEDGE_ROOF[i+1]);
  return new THREE.Vector3(side*(s[0]+(r[0]-s[0])*t),s[1]+(r[1]-s[1])*t,z);
}

/** Two corresponding 6-point rings (rear and front end) lofted into the cassette: back at u=.012 off the plane, a
 * 40 mm blunt ridge at mid height (Chinese single-piece module, chineseChevronEra.ts). */
function chevronCassette(back:readonly THREE.Vector3[],normal:THREE.Vector3,depth:number):THREE.BufferGeometry {
  const [b0,b1,b2,b3]=back,hRear=b3.distanceTo(b0),hFront=b2.distanceTo(b1);
  const ring=(h:number):SectionPoint[]=>{
    const e=.02/h;
    return [[.012,0],[.035,0],[depth,.5-e],[depth,.5+e],[.035,1],[.012,1]];
  };
  const g=sectionSolid([{z:0,ring:ring(hRear)},{z:1,ring:ring(hFront)}]);
  const p=g.getAttribute('position') as THREE.BufferAttribute,q=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    const u=p.getX(i),v=p.getY(i),w=p.getZ(i);
    q.copy(b0).lerp(b3,v).lerp(b1.clone().lerp(b2,v),w).addScaledVector(normal,u);
    p.setXYZ(i,q.x,q.y,q.z);
  }
  // The bilinear map may mirror the canonical frame: keep the winding outward (positive volume).
  let volume=0;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);volume+=a.dot(b.cross(c));}
  if(volume<0)for(let i=0;i<p.count;i+=3){
    const x=p.getX(i+1),y=p.getY(i+1),z=p.getZ(i+1);
    p.setXYZ(i+1,p.getX(i+2),p.getY(i+2),p.getZ(i+2));p.setXYZ(i+2,x,y,z);
  }
  p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingBox();
  return g;
}

interface WedgeTile {z0:number;z1:number;t0:number;t1:number}

/** One seated chevron tile: carrier (shell to back plane), seat pad (-4..+18 mm), removable cassette (sector). */
function wedgeTile(P:TankBuilderPort,shell:Stock,side:number,tile:WedgeTile,records:ChineseChevronReceipt[]):void {
  const {z0,z1,t0,t1}=tile;
  const corners=[wedgePoint(side,z0,t0),wedgePoint(side,z1,t0),wedgePoint(side,z1,t1),wedgePoint(side,z0,t1)];
  const approx=corners[1].clone().sub(corners[0]).cross(corners[3].clone().sub(corners[0])).normalize();
  if(approx.y<0)approx.negate();
  const probe=(p:THREE.Vector3)=>{
    const hit=shell.hit(p.clone().addScaledVector(approx,.45),approx.clone().negate(),.9);
    if(!hit)throw new Error(`${P.spec.id}: no Type 96B wedge face under the ERA tile at ${p.toArray()}`);
    return hit.point.clone();
  };
  const hits=corners.map(probe);
  // Samples inside the tile (edge midpoints, centre) find any ridge of the twisted panel under the tile.
  const inner=[[.5,0],[1,.5],[.5,1],[0,.5],[.5,.5],[.25,.25],[.75,.25],[.75,.75],[.25,.75]].map(([u,v])=>
    probe(wedgePoint(side,z0+(z1-z0)*u,t0+(t1-t0)*v)));
  const normal=hits[2].clone().sub(hits[0]).cross(hits[3].clone().sub(hits[1])).normalize();
  if(normal.dot(approx)<0)normal.negate();
  const origin=hits.reduce((s,h)=>s.add(h),new THREE.Vector3()).multiplyScalar(.25);
  const lift=Math.max(...[...hits,...inner].map(h=>h.clone().sub(origin).dot(normal)));
  const back=hits.map(h=>h.clone().addScaledVector(normal,lift-h.clone().sub(origin).dot(normal)));
  // Permanent carrier: its underside is buried 15 mm in the actual shell at every corner, its top is the back plane.
  P.addExternalArmor('turret',orientedSlab(...hits.map(h=>h.clone().addScaledVector(normal,-.015).toArray()),
    ...back.map(b=>b.toArray())));
  const centre=back.reduce((s,b)=>s.add(b),new THREE.Vector3()).multiplyScalar(.25);
  const seat=back.map(b=>b.clone().lerp(centre,.10));
  P.addExternalArmor('turret',orientedSlab(...seat.map(s=>s.clone().addScaledVector(normal,-.004).toArray()),
    ...seat.map(s=>s.clone().addScaledVector(normal,.018).toArray())));
  const height=Math.min(back[3].distanceTo(back[0]),back[2].distanceTo(back[1]));
  const g=chevronCassette(back,normal,Math.min(.115,height*.43));
  const pos=g.getAttribute('position'),vertices:P3[]=[];
  for(let v=0;v<pos.count;v++)vertices.push([pos.getX(v),pos.getY(v),pos.getZ(v)]);
  records.push({side,normal:normal.toArray(),back:back.map(b=>b.toArray()),vertices,ridgeWidthM:.04});
  P.destructibleCluster(`turret_era_${side<0?'L':'R'}`,()=>P.addExternalArmor('turret',markEraHitFaces(g,normal.toArray(),.35)));
}

// Six tiles a side (the old Kunlun's twelve): two courses of two on the broad rear facet and two courses on the front
// facet's outer half. The narrow nose half of the cheek beside the mantlet carries the Shtora head instead. Each tile
// stops short of the shoulder edge and the roof edge so both 96B lines stay readable.
const KUNLUN_TILES:readonly WedgeTile[]=[
  // The lower course starts behind the muzzles of the 96B's lowest smoke tubes (z .86 at the shoulder).
  {z0:.93,z1:1.18,t0:.07,t1:.47},{z0:1.22,z1:1.45,t0:.07,t1:.47},
  {z0:.84,z1:1.13,t0:.53,t1:.90},{z0:1.17,z1:1.45,t0:.53,t1:.90},
  {z0:1.51,z1:1.70,t0:.08,t1:.46},{z0:1.51,z1:1.70,t0:.52,t1:.88},
];

function kunlunEra(P:TankBuilderPort):void {
  const shell=new Stock(P,['turret']),records:ChineseChevronReceipt[]=[];
  try {for(const side of [-1,1])for(const tile of KUNLUN_TILES)wedgeTile(P,shell,side,tile,records);}
  finally {shell.dispose();}
  P.turretG.userData.chineseChevronEra=records;
}

// ---------------------------------------------------------------------------------------------------------------
// Kunlun: the Shtora eyes. Two IR dazzler heads flank the mantlet on the cheek fronts, ahead of the ERA: a boxy
// armoured housing with a big round lens facing along the gun. Each housing's back is cut to the 96B's receding cheek
// wedge (25 mm off the shell and the ERA, whichever stands proud), so the head hugs the cheek; two short bracket arms
// run back beneath the shoulder line into the undercut cheek (permanent shell, no ERA). The gun pitches only in its own
// vertical plane and the heads stand 0.2 m outboard of the widest mantlet boot.
const EYE_X=.60,EYE_Y=.205,EYE_W=.30,EYE_H=.30;

function shtoraHead(P:TankBuilderPort,shell:Stock,proud:Stock,side:number):number[] {
  const x=side*EYE_X,y=EYE_Y,r=.125,glass=.10;
  // Where the upper bracket meets the permanent cheek, straight behind the lens centre.
  const anchor=shell.hit(new THREE.Vector3(x,y,3.5),new THREE.Vector3(0,0,-1),3);
  if(!anchor)throw new Error(`${P.spec.id}: no cheek receiver behind the Shtora head`);
  // The cheek (or ERA) line behind the housing: five columns across its width, each its highest hit over the height.
  const inner=x-side*EYE_W/2,outer=x+side*EYE_W/2,cols:[number,number][]=[];
  for(let k=0;k<=4;k++){
    const cx=inner+(outer-inner)*k/4;let m=-Infinity;
    for(const dy of [-.15,-.10,-.05,0,.05,.10,.15]){
      const hit=proud.hit(new THREE.Vector3(cx,y+dy,3.5),new THREE.Vector3(0,0,-1),3);
      if(hit)m=Math.max(m,hit.point.z);
    }
    if(!Number.isFinite(m))throw new Error(`${P.spec.id}: no cheek behind the Shtora housing at ${cx}`);
    cols.push([cx,m]);
  }
  const line=(cx:number)=>cols[0][1]+(cols[4][1]-cols[0][1])*(cx-inner)/(outer-inner);
  const lift=Math.max(...cols.map(([cx,m])=>m-line(cx)))+.025;
  const backIn=cols[0][1]+lift,backOut=cols[4][1]+lift,front=Math.max(backIn+.13,anchor.point.z+.33);
  const lo=y-EYE_H/2,hi=y+EYE_H/2;
  const bottom:number[][]=[[inner,lo,backIn],[outer,lo,backOut],[outer,lo,front],[inner,lo,front]];
  P.addEquipment('turretDetail',orientedSlab(...bottom,...bottom.map(([px,,pz])=>[px,hi,pz])));
  // Front armour frame, bezel, lens and the three-bar guard of the OTShU-style emitter.
  P.addEquipment('turretDetail',box(EYE_W+.02,EYE_H+.02,.025),x,y,front+.010);
  P.addEquipment('turretDark',cylZ(r,.030,32),x,y,front+.030);
  P.addEquipment('turretGlass',markVehicleNightLens(cylZ(glass,.014,32),'shtora'),x,y,front+.047);
  for(const dy of [-.06,0,.06])P.addEquipment('turretDark',box(glass*1.8,.014,.014),x,y+dy,front+.060);
  // Rain hood over the aperture, its sides running back along the housing.
  P.addEquipment('turretDetail',box(EYE_W+.04,.020,.12),x,hi+.010,front-.030);
  // Two bracket arms: each is buried 30 mm in the cheek and runs 30 mm into the housing's back.
  for(const dy of [0,-.095]){
    const a=dy?shell.hit(new THREE.Vector3(x,y+dy,3.5),new THREE.Vector3(0,0,-1),3)?.point:anchor.point;
    if(!a)throw new Error(`${P.spec.id}: no cheek receiver for the Shtora lower arm`);
    const back=line(x)+lift,from=a.z-.03,to=back+.03;
    P.addEquipment('turretDark',box(.085,.060,to-from),x,a.y,(from+to)/2);
  }
  return anchor.point.toArray();
}

function kunlunEyes(P:TankBuilderPort):void {
  // Heads stand clear of the shell and of the front-facet ERA, both frozen here.
  const shell=new Stock(P,['turret']),proud=new Stock(P,['turret','turretExternalArmor'],true);
  const anchors:number[][]=[];
  try {for(const side of [-1,1])anchors.push(shtoraHead(P,shell,proud,side));}
  finally{shell.dispose();proud.dispose();}
  P.turretG.userData.cheekOptics={anchors,axisY:EYE_Y};
}

// ---------------------------------------------------------------------------------------------------------------
// Kunlun: the open rear maintenance cage behind the 96B bustle and its three-cell armoured console.
function kunlunRearCage(P:TankBuilderPort):void {
  const shell=new Stock(P,['turret']);
  try {
    // The 96B's rear cap (its -1.89 station): every root strut ends 30 mm inside it.
    const wall=(x:number,y:number)=>{
      const hit=shell.hit(new THREE.Vector3(x,y,-3.5),new THREE.Vector3(0,0,1),3);
      if(!hit)throw new Error(`${P.spec.id}: no bustle wall for the rear cage at ${x},${y}`);
      return hit.point.z;
    };
    const half=.88,bottom=.24,top=.55,rear=-2.26;
    const put=(g:THREE.BufferGeometry,role:string)=>{g.userData.chineseModernization={model:1,role};P.addEquipment('turretOpenLattice',g);};
    for(const side of [-1,1]){
      const x=side*half,joinLow=wall(x,bottom),joinTop=wall(x,top);
      put(beamBetween([x,bottom,joinLow+.03],[x,bottom,rear],.021),'cage-root');
      put(beamBetween([x,top,joinTop+.03],[x,top,rear],.018),'cage-side-rail');
      put(beamBetween([x,bottom,rear],[x,top,rear],.018),'cage-post');
      put(beamBetween([x,(bottom+top)/2,wall(x,(bottom+top)/2)+.03],[x,(bottom+top)/2,rear],.014),'cage-mid-rail');
    }
    for(let row=0;row<=2;row++){
      const y=bottom+(top-bottom)*row/2;
      put(beamBetween([-half,y,rear],[half,y,rear],row===1?.012:.020),'cage-rear-rail');
    }
    for(const ratio of [-.5,0,.5]){
      const x=half*ratio;
      put(beamBetween([x,bottom,wall(x,bottom)+.03],[x,bottom,rear],.014),'cage-floor');
      put(beamBetween([x,bottom,rear],[x,top,rear],.012),'cage-rear-post');
    }
    // Three-cell maintenance console bolted to the bustle wall under the roof line, inside the cage.
    for(const x of [-.57,0,.57]){
      const z=wall(x,.47);
      P.addEquipment('turretDetail',box(.43,.13,.12),x,.47,z-.055);
      P.addEquipment('turretDark',box(.34,.064,.012),x,.47,z-.121);
      for(const dx of [-.14,.14])P.addEquipment('turretDetail',box(.032,.022,.030),x+dx,.545,z-.055);
    }
  }finally{shell.dispose();}
}

/** A whip antenna on its own base, seated on a shaped foot on the permanent roof under it. */
function whip(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],x:number,z:number,length:number):void {
  const y=equipmentFoot(P,parts,x,z,.13,.13);
  P.addEquipment('turretDetail',cylY(.050,.064,.09,12),x,y+.040,z);
  P.addEquipment('turretDark',cylY(.007,.011,length,8),x,y+.08+length/2,z);
}

/** A guarded lamp (nationalRoofSystems.ts) on a shaped foot: the 96B's front roof falls 16 degrees under it. */
function footedLamp(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],x:number,z:number,shape:Parameters<typeof nationalLamp>[4]):void {
  nationalLamp(P,x,z,equipmentFoot(P,parts,x,z+.01,.27,.22),shape);
}

function kunlun(P:TankBuilderPort):void {
  const l=NATIONAL_ROOF_LOADOUTS.t72b3m_kunlun;
  kunlunEra(P);
  kunlunEyes(P);
  const roof=permanentParts(P,['turret','turretDetail']);
  // Square guarded lamps on the front roof between the gunner's sight and the central sight, ahead of both.
  for(const side of [-1,1])footedLamp(P,roof,side*.55,.86,l.lamp);
  // The scanner head between the cupola and the loader's hatch.
  nationalRoofSensor(P,-.05,-.18,equipmentFoot(P,roof,-.05,-.18,.35,.33),l);
  // Removable service cases on the bustle roof (the 96B's mast and whip stand on its left rear).
  const cases=permanentParts(P,['turret']);
  serviceCase(P,cases,-.02,-1.56,.80,.15,.34);
  serviceCase(P,cases,-1.03,-1.30,.28,.14,.32);
  serviceCable(P,cases,[[-1.03,-1.12],[-1.05,-.98],[-1.07,-.80],[-1.08,-.62]]);
  whip(P,cases,-.82,-1.80,.58);
  kunlunRearCage(P);
}

// ---------------------------------------------------------------------------------------------------------------
// Qilin on the production ZTZ-99A2 turret: the 99A2's chevrons, side cassettes, smoke banks, cupola and sights stay as
// emitted; the Qilin's own inexpensive field fit goes on top.
function qilin(P:TankBuilderPort):void {
  const l=NATIONAL_ROOF_LOADOUTS.t72b3_qilin;
  const roof=permanentParts(P,['turret','turretEquipment']);
  // Round guarded lamps on the crown just behind the chevrons' upper roots, outboard of both roof sights.
  for(const side of [-1,1])footedLamp(P,roof,side*.82,-.18,l.lamp);
  // The side camera: twin round lenses on a guarded low housing, on the left crown edge.
  lowOptic(P,roof,1.12,-.30,.20,.11,.19,true);
  // Low field-service box and tool chest, the roll and a field-service carrier on the right flank crown.
  serviceCase(P,roof,-.74,-1.06,.29,.13,.33);
  serviceCase(P,roof,.84,-1.56,.25,.12,.29);
  const y=equipmentFoot(P,roof,0,-1.40,.72,.25);
  P.addEquipment('turretCloth',cylX(.078,.66,16),0,y+.070,-1.40);
  for(const x of [-.23,.23]){
    P.addEquipment('turretDetail',box(.042,.036,.22),x,y+.007,-1.40);
    P.addEquipment('turretDark',cylX(.082,.028,16),x,y+.070,-1.40);
  }
  const base=equipmentFoot(P,roof,-1.14,-.62,.18,.33);
  P.addEquipment('turretDetail',box(.19,.08,.34),-1.14,base+.033,-.62);
  for(const z of [-.72,-.62,-.52])P.addEquipment('turretDark',box(.13,.008,.017),-1.14,base+.078,z);
  serviceCable(P,roof,[[-.74,-.86],[-.78,-.70],[-.84,-.52],[-.90,-.34]]);
  qilinRearBasket(P);
}

/** Qilin's small open tool basket on the 99A2's rear armour box; its roots end inside that permanent box. */
function qilinRearBasket(P:TankBuilderPort):void {
  const shell=new Stock(P,['turret','turretExternalArmor']);
  try {
    const wall=(x:number,y:number)=>{
      const hit=shell.hit(new THREE.Vector3(x,y,-3.5),new THREE.Vector3(0,0,1),3);
      if(!hit)throw new Error(`${P.spec.id}: no 99A2 rear box for the tool basket at ${x},${y}`);
      return hit.point.z;
    };
    // Struts pass under the 99A2's dark rear plate and between its vertical ribs (x = -0.9 + 0.3 i).
    const half=.52,bottom=.45,top=.70,rear=-2.52;
    const put=(g:THREE.BufferGeometry,role:string)=>{g.userData.chineseModernization={model:2,role};P.addEquipment('turretOpenLattice',g);};
    for(const side of [-1,1]){
      const x=side*half;
      put(beamBetween([x,bottom,wall(x,bottom)+.03],[x,bottom,rear],.019),'cage-root');
      put(beamBetween([x,top,wall(x,top)+.03],[x,top,rear],.016),'cage-side-rail');
      put(beamBetween([x,bottom,rear],[x,top,rear],.017),'cage-post');
    }
    for(const y of [bottom,(bottom+top)/2,top])put(beamBetween([-half,y,rear],[half,y,rear],y===bottom||y===top?.019:.012),'cage-rear-rail');
    for(const x of [-.45,-.15,.15,.45])put(beamBetween([x,bottom,wall(x,bottom)+.03],[x,bottom,rear],.013),'cage-floor');
  }finally{shell.dispose();}
}

/** The national fit on the donor turret (P.turretG already carries it and the remote station). */
function turretFit(P:TankBuilderPort,id:ChinaDonorId):void {
  if(id==='t72b3m_kunlun')kunlun(P);else qilin(P);
}

export function buildChinaDonorKit(P:TankBuilderPort,c:NationalModernizationConfig):void {
  chinaDonorHull(P,c);
  turretFit(P,c.id as ChinaDonorId);
}
