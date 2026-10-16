// Owner 2026-10-15 (VEH-19, VEH-20): the T-72B3 Qilin carries the production ZTZ-99A2 turret and the T-72B3M Kunlun
// the Type 96B turret, each emitted by its own builder (nationalDonorTurret.ts). The Kunlun keeps its special ERA and
// its Shtora eyes on the Type 96B. Release 227 (owner 2026-10-16): the Kunlun's and the Qilin's roof guns are QJC-88
// 12.7 mm machine guns on open cupola pintles (nationalRoofWeapon.ts nationalCupolaPintle); the Qilin's 99A2 is cut 10 %
// and re-wrapped in its own add-ons; the T-80U Yun carries the Type 96B with all its own add-ons wrapped round it.
// The hulls keep their Chinese packages unchanged (nationalChina.ts chinaDonorHull; the Yun gains a ring race).
//   "for the t72nn3 qilin, adopt its turret to actually use the ztz-99a2 turret and make the kunlun usee the type 96b
//    turret except with the special era, autocannon, shtora eyes"
// Everything here is turret-local (origin on the ring centre, +Z forward, +X the vehicle's left) and stands on
// permanent donor stock found by raycast: never on removable ERA, never in open air.
import * as THREE from 'three';
import {KIT,orientedSlab} from './kit.ts';
import {chinaDonorHull,equipmentFoot,lowOptic,permanentParts,seatCheekTile,serviceCable,serviceCase} from './nationalChina.ts';
import {weldedFlankHousing} from './weldedFlankHousing.ts';
import {addChineseChevronFacet} from './chineseChevronEra.ts';
import {markSmokeTube} from '../vehicleAuxiliaryGeometry.ts';
import {bustleCutZ} from '../donorBustleCut.ts';
import {QILIN_BUSTLE_CUT_M} from '../nationalDonorTurrets.ts';
import {sectionSolid,type SectionPoint} from './sectionSolid.ts';
import {beamBetween,blindTube} from './measuredPrimitives.ts';
import {markEraHitFaces} from './eraHitFaces.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {nationalEye,nationalLamp,nationalRoofSensor} from './nationalRoofSystems.ts';
import {NATIONAL_ROOF_LOADOUTS} from '../nationalRoofConfig.ts';
import type {ChineseChevronReceipt} from './chineseChevronEra.ts';
import type {NationalModernizationConfig} from '../nationalModernizationConfig.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const {box,cylY,cylZ,cylX}=KIT;
type ChinaDonorId='t72b3m_kunlun'|'t72b3_qilin'|'t80u_yun';
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
// Qilin (release 227, owner 2026-10-16: "make the qqilin turret 10% shorter ... and redesign the qilin turret around
// this principle"): the production ZTZ-99A2 turret, its bustle cut by 0.395 m (QILIN_BUSTLE_CUT_M, donorBustleCut.ts),
// wearing the Qilin's own add-ons from its cast turret, each altered slightly to wrap round the 99A2: the triangular
// flank brows (now welded onto the 99A2's forward side cassette, each carrying three chevron cassettes), the rear flank
// housings (in place of the 99A2's rear cassette and stowage box, carrying its rail) with their three flat tiles a
// side, the rear box seams, the bustle roof plate with its small rack and roll, the flat eye, the split-panel sensor,
// and the 226 field fit (round lamps, side camera, field box, tool chest, carrier, cable, basket) moved onto the cut
// bustle. The 99A2's chevrons, face ERA, smoke banks, cupola, sights and whips stay as emitted. Not re-added: the cast
// bustle box, rear box, central sight, antenna and four-tube smoke (the 99A2's armoured bustle, rear box, sights, whips
// and five-tube banks are the same equipment at full size).
const QILIN_MODEL=2;
type FlankRow=readonly [z:number,inner:number,outer:number,bottom:number,top:number];
// The brow: a triangular wedge (0.40 m tall at its front, 0.24 m at its rear) welded on the forward side cassette's
// outer face (x 1.574-1.606) and buried in the chevron's permanent outer root at its front.
const QILIN_BROW:readonly FlankRow[]=[[-.90,1.52,1.64,.30,.54],[-.52,1.52,1.67,.20,.58],[-.16,1.50,1.68,.16,.56]];
// The rear flank housing: from the forward cassette's rear face (-0.93) round the cut bustle wall to the rear armour
// box, wide enough at its rear to carry the 99A2's rail (x 1.51-1.55 there) on two short posts.
const QILIN_REAR_FLANK:readonly FlankRow[]=[[-1.83,1.06,1.47,.43,.635],[-1.72,1.14,1.60,.37,.665],[-1.34,1.34,1.62,.26,.68],
  [-.91,1.36,1.62,.22,.66]];

/** A builder port whose added parts carry the add-on's inventory role (userData.chineseModernization). */
function tagged(P:TankBuilderPort,model:number,role:string):TankBuilderPort {
  const tag=(g:THREE.BufferGeometry)=>{if(g?.userData&&!g.userData.chineseModernization)g.userData.chineseModernization={model,role};return g;};
  return new Proxy(P,{get(target,key){
    if(key==='add'||key==='addEquipment'||key==='addExternalArmor')
      return (bucket:string,g:THREE.BufferGeometry,...rest:number[])=>(target[key] as (b:string,g:THREE.BufferGeometry,...r:number[])=>void)(bucket,tag(g),...rest);
    if(key==='addModuleVisual')
      return (module:string,bucket:string,g:THREE.BufferGeometry,...rest:number[])=>target.addModuleVisual(module as never,bucket,tag(g),...rest);
    const value=Reflect.get(target,key,target);
    return typeof value==='function'?value.bind(target):value;
  }}) as TankBuilderPort;
}

/** A plate seated on a sloping permanent roof: its underside follows the roof under its four corners (4 mm in), its top
 * is flat `t` over the highest roof point under it. Returns the top. */
function seatedPlate(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],bucket:string,x:number,z:number,w:number,d:number,t:number):number {
  const at=(xx:number,zz:number)=>roofAt(parts,xx,zz);
  const rows=[z-d/2,z+d/2].map(zz=>({z:zz,left:at(x-w/2,zz),right:at(x+w/2,zz)}));
  let high=-Infinity;
  for(const dx of [-w/2,0,w/2])for(const dz of [-d/2,0,d/2])high=Math.max(high,at(x+dx,z+dz));
  const top=high+t;
  P.addExternalArmor(bucket.replace(/ExternalArmor$/,'') as 'turret',sectionSolid(rows.map(r=>({z:r.z,ring:[[x-w/2,r.left-.004],[x+w/2,r.right-.004],
    [x+w/2,top],[x-w/2,top]]}))));
  return top;
}

function roofAt(parts:readonly THREE.BufferGeometry[],x:number,z:number):number {
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),ray=new THREE.Raycaster(new THREE.Vector3(x,3,z),new THREE.Vector3(0,-1,0),0,6);
  let y=-Infinity;
  for(const g of parts){const m=new THREE.Mesh(g,mat);m.updateMatrixWorld(true);const h=ray.intersectObject(m,false)[0];if(h)y=Math.max(y,h.point.y);}
  mat.dispose();
  if(!Number.isFinite(y))throw new Error(`Chinese donor kit: no permanent roof at ${x},${z}`);
  return y;
}

/** The brow's three chevron cassettes: one on its rear facet, two on its front facet, each on its seat pad. */
function qilinBrowChevrons(P:TankBuilderPort,side:number):void {
  const bevel=(r:FlankRow)=>Math.min(.045,(r[4]-r[3])*.25,(r[2]-r[1])*.25);
  for(const [i,count] of [[1,1],[2,2]] as const){
    const a=QILIN_BROW[i-1],b=QILIN_BROW[i];
    const low=Math.max(a[3]+bevel(a),b[3]+bevel(b))+.012,top=Math.min(a[4]-bevel(a),b[4]-bevel(b))-.012;
    addChineseChevronFacet(P,{a:[b[2],low,b[0]],b:[a[2],low,a[0]],height:top-low},side,Math.min(.09,(top-low)*.43),count);
  }
}

/** A compact flat sensor eye (the cast Qilin's flat eye, a size smaller: a 0.16 m pedestal under a 0.22 m head). */
function qilinFlatEye(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[],x:number,z:number):void {
  const base=equipmentFoot(P,parts,x,z,.16,.16)-.003;
  P.addEquipment('turretDetail',box(.16,.09,.16),x,base+.045,z);
  P.addEquipment('turretDetail',box(.22,.12,.20),x,base+.15,z);
  P.addModuleVisual('optics','turretGlass',box(.17,.075,.012),x,base+.15,z+.105);
  P.addEquipment('turretDetail',box(.24,.014,.22),x,base+.217,z+.012);
}

function qilin(P:TankBuilderPort):void {
  const l=NATIONAL_ROOF_LOADOUTS.t72b3_qilin,bz=(z:number)=>bustleCutZ(z,QILIN_BUSTLE_CUT_M);
  // Permanent armour first: the brows and the rear flank housings (their two rail posts under the 99A2 rail).
  for(const side of [-1,1]){
    tagged(P,QILIN_MODEL,'brow').addExternalArmor('turret',weldedFlankHousing(QILIN_BROW,side,.035));
    tagged(P,QILIN_MODEL,'rear-flank-housing').addExternalArmor('turret',weldedFlankHousing(QILIN_REAR_FLANK,side,.045));
  }
  qilinRailPosts(tagged(P,QILIN_MODEL,'rail-post'),bz);
  // Removable faces on the frozen permanent stock: three brow chevron cassettes and three flat tiles a side.
  const armour=permanentParts(P,['turretExternalArmor']);
  for(const side of [-1,1]){
    qilinBrowChevrons(tagged(P,QILIN_MODEL,'brow-chevron'),side);
    for(const z of [-1.05,-1.30,-1.55])seatCheekTile(tagged(P,QILIN_MODEL,'flank-tile'),armour,side,z,.45,[.25,.07,.26]);
  }
  qilinRearBoxSeams(tagged(P,QILIN_MODEL,'rear-box-seam'));
  const roof=permanentParts(P,['turret','turretEquipment']);
  // The bustle roof plate (the cast bustle box's roof) on the crown, 5 cm behind the cupola disc.
  const plateTop=seatedPlate(tagged(P,QILIN_MODEL,'bustle-plate'),roof,'turretExternalArmor',0,-1.48,.95,.54,.022);
  const deck=[...roof,...permanentParts(P,['turretExternalArmor'])];
  // Round guarded lamps on the crown just behind the chevrons' upper roots, 5 cm ahead of the commander's sight.
  for(const side of [-1,1])footedLamp(tagged(P,QILIN_MODEL,'lamp'),roof,side*.82,-.14,l.lamp);
  // The side camera on the left crown edge and the flat eye mirroring it on the right.
  lowOptic(tagged(P,QILIN_MODEL,'camera'),roof,1.12,-.30,.20,.11,.19,true);
  qilinFlatEye(tagged(P,QILIN_MODEL,'flat-eye'),roof,-1.12,-.30);
  // The split-panel sensor on its cast seat behind the gun (the roof ahead of z 0.15 is the mantlet's open throat),
  // between the two roof sights; the emplacement's barrel depresses less over it (its depression table).
  const sensor=tagged(P,QILIN_MODEL,'split-sensor');
  nationalRoofSensor(sensor,-.06,-.12,equipmentFoot(sensor,roof,-.06,-.12,.35,.33),{...l,roof:'split-panels'});
  // The field box, the tool chest and the field-service carrier on the cut bustle, the cable outboard of the carrier.
  serviceCase(tagged(P,QILIN_MODEL,'field-box'),roof,-.80,-1.12,.29,.13,.33);
  serviceCase(tagged(P,QILIN_MODEL,'tool-chest'),roof,.84,-1.44,.25,.12,.29);
  const carrier=tagged(P,QILIN_MODEL,'carrier');
  const base=equipmentFoot(carrier,roof,-1.14,-.70,.18,.33);
  carrier.addEquipment('turretDetail',box(.19,.08,.34),-1.14,base+.033,-.70);
  for(const z of [-.80,-.70,-.60])carrier.addEquipment('turretDark',box(.13,.008,.017),-1.14,base+.078,z);
  serviceCable(tagged(P,QILIN_MODEL,'cable'),roof,[[-.92,-.955],[-1.02,-.90],[-1.27,-.86],[-1.27,-.60],[-1.15,-.385]]);
  // The roll on the bustle plate, framed by the small rack.
  const rollCrew=tagged(P,QILIN_MODEL,'roll');
  const y=equipmentFoot(rollCrew,deck,0,-1.40,.68,.25);
  rollCrew.addEquipment('turretCloth',cylX(.078,.66,16),0,y+.070,-1.40);
  for(const x of [-.23,.23]){
    rollCrew.addEquipment('turretDetail',box(.042,.036,.22),x,y+.007,-1.40);
    rollCrew.addEquipment('turretDark',cylX(.082,.028,16),x,y+.070,-1.40);
  }
  qilinRack(tagged(P,QILIN_MODEL,'rack'),deck,plateTop);
  qilinRearBasket(P);
}

/** Two short posts a side carrying the 99A2's rail (y 0.76) on the rear flank housing's top, at the rail's mapped
 * stanchion stations. Each post's foot sits 4 mm into the housing's top; its head 4 mm into the rail. */
function qilinRailPosts(P:TankBuilderPort,bz:(z:number)=>number):void {
  const housing=permanentParts(P,['turretExternalArmor']),detail=new Stock(P,['turretDetail']);
  try {
    for(const side of [-1,1])for(const z of [bz(-1.48),bz(-2.06)]){
      // the rail's own position at this station (it yaws outboard towards the rear)
      const rail=detail.hit(new THREE.Vector3(side*3,.76,z),new THREE.Vector3(-side,0,0),2.2);
      if(!rail)throw new Error(`${P.spec.id}: no 99A2 rail over the rear flank housing at ${z}`);
      const x=rail.point.x-side*.0175,top=roofAt(housing,x,z),railBottom=.76-.0175;
      P.addEquipment('turretDetail',box(.034,railBottom-top+.008,.034),x,(railBottom+top)/2,z);
    }
  }finally{detail.dispose();}
}

/** Two dark access seams on the 99A2 rear box's lower lip, between its ribs (the cast Qilin's rear box seams). */
function qilinRearBoxSeams(P:TankBuilderPort):void {
  const box99=new Stock(P,['turretExternalArmor']);
  try {
    for(const x of [-.45,.45]){
      const hit=box99.hit(new THREE.Vector3(x,.455,-3),new THREE.Vector3(0,0,1),2);
      if(!hit)throw new Error(`${P.spec.id}: no rear box face for its seam at ${x}`);
      P.addEquipment('turretDark',box(.015,.040,.014),x,.455,hit.point.z-.005);
    }
  }finally{box99.dispose();}
}

/** The small rack framing the roll: two posts on shaped feet, their side rails and the rear cross rail. */
function qilinRack(P:TankBuilderPort,deck:readonly THREE.BufferGeometry[],plateTop:number):void {
  void plateTop;
  let railY=-Infinity;
  for(const x of [-.42,.42]){
    const foot=equipmentFoot(P,deck,x,-1.40,.070,.13);
    P.addEquipment('turretDetail',box(.025,.145,.025),x,foot+.066,-1.40);
    railY=Math.max(railY,foot+.132);
  }
  for(const x of [-.42,.42])P.addEquipment('turretDetail',beamBetween([x,railY,-1.55],[x,railY,-1.25],.013));
  P.addEquipment('turretDetail',beamBetween([-.42,railY,-1.55],[.42,railY,-1.55],.013));
}

/** Qilin's small open tool basket on the cut 99A2's rear armour box; its roots end inside that permanent box, its rear
 * 0.46 m behind it, and the drone's landing plate rides two bearers across its top rails. */
function qilinRearBasket(P:TankBuilderPort):void {
  const shell=new Stock(P,['turret','turretExternalArmor']);
  try {
    const wall=(x:number,y:number)=>{
      const hit=shell.hit(new THREE.Vector3(x,y,-3.5),new THREE.Vector3(0,0,1),3);
      if(!hit)throw new Error(`${P.spec.id}: no 99A2 rear box for the tool basket at ${x},${y}`);
      return hit.point.z;
    };
    // Struts pass under the 99A2's dark rear plate and between its vertical ribs (x = -0.9 + 0.3 i).
    const half=.52,bottom=.45,top=.70,rear=wall(0,bottom)-.46;
    const put=(g:THREE.BufferGeometry,role:string)=>{g.userData.chineseModernization={model:QILIN_MODEL,role};P.addEquipment('turretOpenLattice',g);};
    for(const side of [-1,1]){
      const x=side*half;
      put(beamBetween([x,bottom,wall(x,bottom)+.03],[x,bottom,rear],.019),'cage-root');
      put(beamBetween([x,top,wall(x,top)+.03],[x,top,rear],.016),'cage-side-rail');
      put(beamBetween([x,bottom,rear],[x,top,rear],.017),'cage-post');
    }
    for(const y of [bottom,(bottom+top)/2,top])put(beamBetween([-half,y,rear],[half,y,rear],y===bottom||y===top?.019:.012),'cage-rear-rail');
    for(const x of [-.45,-.15,.15,.45])put(beamBetween([x,bottom,wall(x,bottom)+.03],[x,bottom,rear],.013),'cage-floor');
    // The drone's landing (the cut bustle's roof is the emplacement's sweep and the field fit): a flat steel plate on two
    // bearers across the basket's top rails (tools/mission-attachment-geometry.mjs registers it as the dock's support).
    const [lx,ly,lz,lw,ld]=QILIN_DOCK_LANDING,bearer=.016;
    for(const z of [lz-ld/2+.04,lz+ld/2-.04])put(beamBetween([-half,top,z],[half,top,z],bearer),'dock-bearer');
    const plate=box(lw,ly-(top+bearer)+.002,ld);plate.userData.chineseModernization={model:QILIN_MODEL,role:'dock-landing'};
    P.addExternalArmor('turret',plate,lx,(ly+top+bearer-.002)/2,lz);
  }finally{shell.dispose();}
}

/** The Qilin's drone landing plate on its basket: [x, top, z, width, depth] (turret frame). */
export const QILIN_DOCK_LANDING=[0,.732,-2.125,.40,.34] as const;

// ---------------------------------------------------------------------------------------------------------------
// Yun (release 227, owner 2026-10-16: "make the yun keep all its extra add ons and modifications but altered slightly to
// be wrapped around the type 96b turret base"): the Type 96B turret on the T-80U hull (its bins and cheek launchers
// left out, its boot heeled), wearing every add-on of the cast Yun, each altered to wrap round the 96B: one welded armour
// housing a side round the 96B wall carrying the chevron bank and three flat tiles, the bustle module with its roof
// plate and marks, the rear band and its seams, the slat cage, eight roof smoke tubes, the three service cases, the spine
// frame, the low flat optic, the service cable and its antenna, the sight hood round the 96B gunner's sight, the spine
// sensor, the slit lamps, the monocle eye, the two side electronics, the faceted station on its own left-roof seat, and
// the gun's thermal-sleeve bands and muzzle-reference strip on the 96B barrel. The 96B's shell, ring collar, cupola,
// secondary hatch, roof fittings, sights, mast and whip are the Yun's own now. Every part is turret-local and tagged.
const YUN_MODEL=0;
// [z, inner, outer, bottom, top]: inner edges buried >= 20 mm in the 96B wall, top shelves 20-40 mm under its roof edge,
// the front rows >= 80 mm outboard of the boot.
const YUN_WRAP:readonly FlankRow[]=[[-1.86,.98,1.24,.34,.58],[-1.42,1.15,1.58,.32,.64],[-.25,1.14,1.64,.30,.66],
  [.55,.97,1.62,.22,.64],[.95,.78,1.50,.22,.58],[1.45,.48,1.16,.18,.44],[1.90,.34,.66,.18,.38]];
// The Type 96B barrel's outer stations in its gun frame (type96bX.ts buildType96Turret): [z, radius].
const TYPE96_BARREL:readonly (readonly [number,number])[]=[[.25,.154],[.65,.154],[.68,.1375],[2.04,.1205],[2.90,.1105],
  [4.67,.1105],[4.92211,.099]];
function type96BarrelRadius(z:number):number {
  for(let i=1;i<TYPE96_BARREL.length;i++)if(z<=TYPE96_BARREL[i][0]){
    const [z0,r0]=TYPE96_BARREL[i-1],[z1,r1]=TYPE96_BARREL[i];return r0+(r1-r0)*(z-z0)/(z1-z0);
  }
  return TYPE96_BARREL[TYPE96_BARREL.length-1][1];
}

/** The Yun's gun modifications on the recoiling 96B barrel: five thermal-sleeve clamp bands and the muzzle strip. */
function yunGun(P:TankBuilderPort):void {
  const bands=tagged(P,YUN_MODEL,'gun-band');
  for(const z of [1.80,2.40,2.90,3.78,4.62])bands.add('gunDark',cylZ(type96BarrelRadius(z)+.018,.027,P.q?28:16),0,0,z);
  // the muzzle-reference strip on the barrel's top line, 2 mm into the tube
  tagged(P,YUN_MODEL,'muzzle-strip').add('gun',box(.035,.039,.74),0,type96BarrelRadius(4.21)+.0195-.002,4.21);
}

/** The bustle module behind the 96B rear cap (its front 5 cm inside the cap), its roof plate and marks, the rear band
 * (the cast Yun's rear box) and its seams. */
function yunBustle(P:TankBuilderPort):void {
  const ring=(w:number,low:number,top:number):SectionPoint[]=>{
    const b=.06;
    return [[-w+b,low],[w-b,low],[w,low+b],[w,top-b],[w-b,top],[-w+b,top],[-w,top-b],[-w,low+b]];
  };
  const module=tagged(P,YUN_MODEL,'bustle-module');
  module.addExternalArmor('turret',sectionSolid([{z:-2.06,ring:ring(.94,.22,.58)},{z:-1.84,ring:ring(1.00,.22,.58)}]));
  module.addEquipment('turretDetail',box(1.40,.022,.16),0,.590,-1.97);
  for(const side of [-1,1])module.addEquipment('turretDark',box(.08,.07,.02),side*.63,.545,-2.068);
  const band=tagged(P,YUN_MODEL,'rear-band');
  band.addExternalArmor('turret',box(1.30,.14,.17),0,.33,-2.135);
  for(const x of [-.39,.39])band.addEquipment('turretDark',box(.015,.095,.014),x,.33,-2.225);
}

/** The slat cage behind the bustle module: roots 30 mm into the module's rear face, two front posts on its top, four
 * rear rails (three slat rows) and three floor bars 4 cm over the rear band. */
function yunCage(P:TankBuilderPort):void {
  const shell=new Stock(P,['turret','turretExternalArmor']);
  try {
    const wall=(x:number,y:number)=>{
      const hit=shell.hit(new THREE.Vector3(x,y,-3.5),new THREE.Vector3(0,0,1),3);
      if(!hit)throw new Error(`${P.spec.id}: no bustle module for the rear cage at ${x},${y}`);
      return hit.point.z;
    };
    const half=.72,bottom=.44,top=.74,rear=-2.45,postZ=-1.985,deck=.58;
    const put=(g:THREE.BufferGeometry,role:string)=>{g.userData.chineseModernization={model:YUN_MODEL,role};P.addEquipment('turretOpenLattice',g);};
    for(const side of [-1,1]){
      const x=side*half;
      put(beamBetween([x,bottom,wall(x,bottom)+.03],[x,bottom,rear],.021),'cage-root');
      put(beamBetween([x,deck-.004,postZ],[x,top,postZ],.018),'cage-front-post');
      put(beamBetween([x,top,postZ],[x,top,rear],.017),'cage-side-rail');
      put(beamBetween([x,bottom,rear],[x,top,rear],.018),'cage-post');
    }
    for(let row=0;row<=3;row++){
      const y=bottom+(top-bottom)*row/3;
      put(beamBetween([-half,y,rear],[half,y,rear],row===0||row===3?.020:.012),'cage-rear-rail');
    }
    for(const x of [-.36,0,.36])put(beamBetween([x,bottom,wall(x,bottom)+.03],[x,bottom,rear],.014),'cage-floor');
    // The drone's landing on the cage roof (the Yun's roof is the station's sweep): two bearers across the top rails
    // carry a flat steel plate (tools/mission-attachment-geometry.mjs registers it as the dock's support).
    const [lx,ly,lz,lw,ld]=YUN_DOCK_LANDING,bearer=.016;
    for(const z of [lz-ld/2+.04,lz+ld/2-.04])put(beamBetween([-half,top,z],[half,top,z],bearer),'dock-bearer');
    const plate=box(lw,ly-(top+bearer)+.002,ld);plate.userData.chineseModernization={model:YUN_MODEL,role:'dock-landing'};
    P.addExternalArmor('turret',plate,lx,(ly+top+bearer-.002)/2,lz);
  }finally{shell.dispose();}
}

/** A bolted marking board on each housing's bare rear wall, behind the flat tiles (the turret's national markings sit
 * on it: vehicleMarkingSeating.ts reads 'turretPermanentMarkingSurface'), its back 4 mm into the wall. */
function yunMarkingBoards(P:TankBuilderPort,armour:readonly THREE.BufferGeometry[]):void {
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  try {
    for(const side of [-1,1]){
      const z=-1.29,y=.48,ray=new THREE.Raycaster(new THREE.Vector3(side*3,y,z),new THREE.Vector3(-side,0,0),0,3);
      let hit:THREE.Intersection|undefined;
      for(const g of armour){const m=new THREE.Mesh(g,mat);m.updateMatrixWorld(true);const h=ray.intersectObject(m,false)[0];if(h&&(!hit||h.distance<hit.distance))hit=h;}
      if(!hit?.face)throw new Error(`${P.spec.id}: no housing wall for the marking board`);
      const n=hit.face.normal.clone();if(n.x*side<0)n.negate();
      const yaw=Math.atan2(n.z,n.x*side)*-side,centre=hit.point.clone().addScaledVector(n,.003);
      P.addEquipment('turretPermanentMarkingSurface',box(.014,.26,.30),centre.x,centre.y,centre.z,0,yaw,0);
    }
  } finally {mat.dispose();}
}

/** The Yun's drone landing plate on its cage roof: [x, top, z, width, depth] (turret frame). */
export const YUN_DOCK_LANDING=[0,.772,-2.26,.40,.34] as const;

/** The Yun's chevron bank: two broad single-piece cassettes on each of the housing's three front facets. */
function yunChevrons(P:TankBuilderPort,side:number):void {
  const rows=YUN_WRAP.slice(3),bevel=(r:FlankRow)=>Math.min(.035,(r[4]-r[3])*.25,(r[2]-r[1])*.25);
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i];
    const low=Math.max(a[3]+bevel(a),b[3]+bevel(b))+.012,top=Math.min(a[4]-bevel(a),b[4]-bevel(b))-.012;
    addChineseChevronFacet(P,{a:[b[2],low,b[0]],b:[a[2],low,a[0]],height:top-low},side,Math.min(.10,(top-low)*.43),2);
  }
}

/** Four roof smoke tubes a side behind the cheeks on shaped feet, firing out over the housing shelf. */
function yunSmoke(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[]):void {
  for(const side of [-1,1])for(const z of [-1.25,-1.13,-1.01,-.89]){
    const x=side*1.08;
    const seats=[z-.047,z+.047].map(zz=>({z:zz,left:roofAt(parts,x-.060,zz),right:roofAt(parts,x+.060,zz)}));
    const top=Math.max(...seats.flatMap(s=>[s.left,s.right]))+.035;
    P.addEquipment('turretDetail',sectionSolid(seats.map(s=>({z:s.z,
      ring:[[x-.060,s.left-.006],[x+.060,s.right-.006],[x+.060,top],[x-.060,top]] as SectionPoint[]}))));
    P.addEquipment('turretDark',markSmokeTube(blindTube(.038,.027,.21,.13,P.q?12:8),[0,0,1],true),
      x,top+.072,z+.025,-.66,side*.57);
  }
}

/** The armoured hood round the 96B gunner's sight (box x .394-.904, y .729-.943, z .37-.65): a top plate on the sight's
 * top and two side guards standing on the roof 23 mm clear of its sides, their feet following the roof's fall. */
function yunSightHood(P:TankBuilderPort,parts:readonly THREE.BufferGeometry[]):void {
  const cx=.649,cz=.51,plateY=.955;
  P.addEquipment('turretDetail',box(.59,.025,.34),cx,plateY,cz);
  for(const side of [-1,1]){
    const x=cx+side*.29,rows=[cz-.15,cz+.15].map(z=>({z,y:roofAt(parts,x,z)}));
    P.addEquipment('turretDetail',sectionSolid(rows.map(r=>({z:r.z,ring:[[x-.0125,r.y-.004],[x+.0125,r.y-.004],
      [x+.0125,plateY+.004],[x-.0125,plateY+.004]] as SectionPoint[]}))));
  }
}

function yun(P:TankBuilderPort):void {
  const l=NATIONAL_ROOF_LOADOUTS.t80u_yun;
  yunGun(P);
  // Permanent armour first: one welded housing a side round the 96B wall, then the bustle module and the rear band.
  for(const side of [-1,1])tagged(P,YUN_MODEL,'wrap-housing').addExternalArmor('turret',weldedFlankHousing(YUN_WRAP,side,.035));
  yunBustle(P);
  // The chevron bank on the housing's three front walls, two cassettes each on their pads (the cast Yun's nose cassette
  // has no wall here: the 96B wedge runs on 0.18 m past the housing's front row), then three flat tiles a side on the
  // frozen housing's outer wall.
  for(const side of [-1,1])yunChevrons(tagged(P,YUN_MODEL,'chevron'),side);
  const armour=permanentParts(P,['turretExternalArmor']);
  for(const side of [-1,1])for(const z of [-1.00,-.62,-.24])seatCheekTile(tagged(P,YUN_MODEL,'flank-tile'),armour,side,z,.48,[.24,.075,.30]);
  yunMarkingBoards(tagged(P,YUN_MODEL,'marking-board'),armour);
  yunCage(P);
  const roof=permanentParts(P,['turret','turretExternalArmor']);
  yunSmoke(tagged(P,YUN_MODEL,'smoke-tube'),roof);
  serviceCase(tagged(P,YUN_MODEL,'service-case'),roof,-.68,-1.62,.26,.14,.28);
  serviceCase(tagged(P,YUN_MODEL,'service-case'),roof,.68,-1.62,.26,.14,.28);
  serviceCase(tagged(P,YUN_MODEL,'service-case'),roof,0,-1.43,.77,.16,.23);
  // The spine frame over the centre case: two posts on shaped feet, their rails and the rear cross rail.
  const frame=tagged(P,YUN_MODEL,'spine-frame'),y=roofAt(roof,0,-1.43)+.026;
  for(const x of [-.48,.48]){
    const foot=equipmentFoot(frame,roof,x,-1.36,.070,.070);
    frame.addEquipment('turretDetail',beamBetween([x,foot-.006,-1.36],[x,y+.17,-1.36],.016));
    frame.addEquipment('turretDetail',beamBetween([x,y+.17,-1.36],[x,y+.17,-1.58],.016));
  }
  frame.addEquipment('turretDetail',beamBetween([-.48,y+.17,-1.58],[.48,y+.17,-1.58],.016));
  lowOptic(tagged(P,YUN_MODEL,'low-optic'),roof,-.97,-.45,.27,.115,.22,false);
  // The service cable from the right case to the antenna base, and the antenna on the right rear.
  serviceCable(tagged(P,YUN_MODEL,'cable'),roof,[[-.82,-1.66],[-.90,-1.62],[-.94,-1.59]]);
  const antenna=tagged(P,YUN_MODEL,'antenna'),ay=roofAt(roof,-1.00,-1.55);
  antenna.addEquipment('turretDetail',cylY(.057,.07,.08,12),-1.00,ay+.025,-1.55);
  antenna.addEquipment('turretDark',cylY(.007,.010,.54,8),-1.00,ay+.33,-1.55);
  yunSightHood(tagged(P,YUN_MODEL,'sight-hood'),roof);
  const sensor=tagged(P,YUN_MODEL,'spine-sensor');
  nationalRoofSensor(sensor,-.04,-.20,equipmentFoot(sensor,roof,-.04,-.20,.35,.33),l);
  for(const side of [-1,1])footedLamp(tagged(P,YUN_MODEL,'slit-lamp'),roof,side*.50,.92,l.lamp);
  // The monocle eye on the left housing shelf, outboard of the sight hood; the side electronics on both shelves.
  const eye=tagged(P,YUN_MODEL,'monocle-eye');
  nationalEye(eye,1.20,.45,equipmentFoot(eye,roof,1.20,.45,.20,.20),l);
  for(const side of [-1,1])lowOptic(tagged(P,YUN_MODEL,'side-electronics'),roof,side*1.36,.05,.22,.085,.20,false);
}

/** The national fit on the donor turret (P.turretG already carries it and the remote station). */
function turretFit(P:TankBuilderPort,id:ChinaDonorId):void {
  if(id==='t72b3m_kunlun')kunlun(P);else if(id==='t80u_yun')yun(P);else qilin(P);
}

export function buildChinaDonorKit(P:TankBuilderPort,c:NationalModernizationConfig):void {
  chinaDonorHull(P,c);
  turretFit(P,c.id as ChinaDonorId);
}
