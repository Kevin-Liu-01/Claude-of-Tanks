// The Ukrainian Army's T-64BV mod. 2017 (t64bv_donbas; "Donbas" was the kitbash source's label). Owner 2026-10-22,
// verbatim: "the ukranian t64bv1 should just be its previous model with an updated name", then "make our donbas version
// take cues from a lot of aesthetic ennnhancemennts and the era layout from our newer one tho".
// The previous model stays: the T-72B3 study's hull, turret, running gear, drums, roof NSVT and antennas, with the rear
// cage, the service bins and whips and the Donbas field cover. From the T-64BV1's own build (t64bvX.ts) it takes the
// Kontakt-1 layout in place of the B3's Kontakt-5: four staggered courses on the glacis below a V splash board,
// containers on the leading skirt sections, the two-tier horseshoe round the turret front and a roof row ahead of the
// hatches; and the L-2G searchlight left of the gun and the self-entrenching blade on the lower nose plate.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween,type Point3} from './measuredPrimitives.ts';
import {buildT72B3X,t72b3XCastingContains} from './t72b3X.ts';
import {k1Brick} from './t64bvX.ts';
import {T72B3_X_SOURCE_DATUMS} from '../t72b3XArmor.ts';
import {addDonbasFieldCover} from './donbasFieldCover.ts';
import {attachedCage,supportedSensor,strappedPack} from './modernizationFittings.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const {box,cylZ,torus}=KIT;
const YAW=T72B3_X_SOURCE_DATUMS.turretPivot,RING=new THREE.Vector3(...YAW);
const UP=new THREE.Vector3(0,1,0);

// ---------------------------------------------------------------- hull (hull frame: ground y = 0, +Z forward)
// The B3's upper glacis plate (t72b3X.ts hull sections) runs from (z 2.20, y 1.3078) to the nose (3.17815, 0.8215);
// the plate behind it, up to the deck at z 1.81, lies at 21 degrees like the T-64's glacis.
const GLACIS_Z0=2.20,GLACIS_Y0=1.3078,NOSE_Z=3.17815,NOSE_Y=.8215;
const GLACIS_SLOPE=(GLACIS_Y0-NOSE_Y)/(NOSE_Z-GLACIS_Z0),GLACIS_RAKE=Math.atan(GLACIS_SLOPE);
const glacisY=(z:number)=>GLACIS_Y0-(z-GLACIS_Z0)*GLACIS_SLOPE;
const upperPlateY=(z:number)=>1.4599-(z-1.81)*(1.4599-GLACIS_Y0)/(GLACIS_Z0-1.81);

function glacisEra(P:TankBuilderPort):void {
  // Four staggered courses of K-1 containers seated on the plate (3 mm into it). The headlights and their guard bars
  // stand on the plate's outer corners (x 0.77-0.95, z 2.70-2.83): the courses beside them stop short.
  const n=new THREE.Vector3(0,Math.cos(GLACIS_RAKE),Math.sin(GLACIS_RAKE)),th=.075;
  const rotation=new THREE.Matrix4().makeRotationX(GLACIS_RAKE);
  [2.33,2.57,2.81,3.05].forEach((z,row)=>{
    const count=row%2?5:6;
    for(let i=0;i<count;i++){
      const x=(i-(count-1)/2)*.27;
      if(Math.abs(x)+.12>.74&&z+.12>2.66&&z-.12<2.86)continue;
      const p=new THREE.Vector3(x,glacisY(z),z).addScaledVector(n,th/2-.003);
      k1Brick(P,'hull',`glacis_era_${x<0?'L':'R'}`,rotation.clone().setPosition(p),[.24,th,.26]);
    }
  });
  // The V splash board ahead of the driver's hatch, its foot let into the plate along its whole length.
  for(const side of [-1,1])P.addEquipment('hullDetail',box(.50,.14,.025),side*.22,upperPlateY(2.08)+.02,2.08,0,side*.42,0);
}

function skirtEra(P:TankBuilderPort,side:number):void {
  // A K-1 container on each leading skirt panel's face (the B3's lower skirt, its outer face at x -1.779 / 1.791),
  // clear of the panel joint strips at z 0.805 and 2.222.
  const th=.075,x=side*((side<0?1.779:1.791)+th/2-.003);
  const rotation=new THREE.Matrix4().makeRotationZ(-side*Math.PI/2);
  for(const z of [1.14,1.51,1.88,2.43,2.80])
    k1Brick(P,'hull',`skirt_era_${side<0?'L':'R'}`,rotation.clone().setPosition(new THREE.Vector3(x,.93,z)),[.28,th,.34]);
}

function blade(P:TankBuilderPort):void {
  // Self-entrenching blade across the lower nose plate (z 2.80, y 0.611 to the nose), 22 mm proud of it.
  const z0=2.80,y0=.611,rise=Math.atan2(NOSE_Y-.0025-y0,NOSE_Z-z0),t=new THREE.Vector3(0,Math.sin(rise),Math.cos(rise));
  const n=new THREE.Vector3(1,0,0).cross(t);
  const mid=new THREE.Vector3(0,(y0+NOSE_Y)/2,(z0+NOSE_Z)/2).addScaledVector(n,.022);
  P.addEquipment('hullDetail',box(2.06,.30,.05).applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(1,0,0),t,n).setPosition(mid)));
}

// ---------------------------------------------------------------- turret (measured in the hull frame, placed in the turret's)
const inCasting=(q:THREE.Vector3)=>t72b3XCastingContains(q.x,q.y,q.z);
/** The casting's surface at height y on the plan ray from the turret axis at angle t (0 straight ahead, + toward +X). */
function castAt(t:number,y:number):THREE.Vector3 {
  const dx=Math.sin(t),dz=Math.cos(t);let lo=0,hi=2.4;
  for(let i=0;i<32;i++){const r=(lo+hi)/2;if(t72b3XCastingContains(dx*r,y,YAW[2]+dz*r))lo=r;else hi=r;}
  return new THREE.Vector3(dx*lo,y,YAW[2]+dz*lo);
}
/** Surface point and outward normal at (t, y); the plan tangent spans 0.04 rad, smoothing the cheek blocks' corners. */
function castFrame(t:number,y:number):{p:THREE.Vector3;n:THREE.Vector3} {
  const p=castAt(t,y),h=castAt(t+.02,y).sub(castAt(t-.02,y)).normalize();
  const v=castAt(t,y+.006).sub(castAt(t,y-.006)).normalize();
  const n=new THREE.Vector3().crossVectors(h,v).normalize();
  if(n.x*p.x+n.z*(p.z-YAW[2])<0)n.negate();
  return {p,n};
}

/** One container on the casting: one tilt per tier (pitch up from the horizontal outward normal), let 4 mm into the
 * shell at its nearest corner, on stand-off struts where it stands clear of it (t64bvX.ts turretEra). */
function seat(P:TankBuilderPort,p:THREE.Vector3,outward:THREE.Vector3,size:Point3,pitch:number):void {
  const [w,th,len]=size;
  const out=new THREE.Vector3(outward.x,0,outward.z).normalize(),tangent=new THREE.Vector3().crossVectors(UP,out).normalize();
  const normal=out.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(UP,Math.sin(pitch));
  const along=new THREE.Vector3().crossVectors(tangent,normal);
  const back=[-1,0,1].flatMap(a=>[-1,0,1].map(b=>tangent.clone().multiplyScalar(a*w/2).addScaledVector(along,b*len/2)));
  let offset=0;
  while(offset<.25&&back.some(v=>inCasting(p.clone().addScaledVector(normal,offset).add(v))))offset+=.004;
  const centre=p.clone().addScaledVector(normal,offset-.004+th/2).sub(RING);
  k1Brick(P,'turret',`turret_era_${p.x<0?'L':'R'}`,new THREE.Matrix4().makeBasis(tangent,normal,along).setPosition(centre),size);
  if(offset<.02)return;
  for(const k of [-1,1]){
    const foot=p.clone().addScaledVector(tangent,k*w*.30).addScaledVector(normal,-.02).sub(RING);
    P.addEquipment('turretDetail',beamBetween(foot.toArray(),foot.clone().addScaledVector(normal,offset+.024).toArray(),.012,6));
  }
}

// The horseshoe as plan angles from straight ahead toward each flank: the lower tier upright round the cheek faces at
// 1.70 m (5 cm over the driver's hatch through the traverse), the upper tier lying at 60 degrees on the dome over them
// at 1.96 m. Every container stands clear of the trunnion, the mantlet and the coaxial gun (|x| > 0.36). On +X the
// searchlight takes the lower places beside the gun, the Sosna-U's front supports the upper ones, and both tiers stop
// ahead of the B3's 902G bank; on -X they stop ahead of the stowage case (its front at z -0.17).
const LOWER_Y=1.70,UPPER_Y=1.96,UPPER_PITCH=1.05,ROOF_FLOOR=1.5;
const LOWER_T:Readonly<Record<number,readonly number[]>>={[-1]:[.41,.62,.83,1.04,1.25,1.46],1:[.80,1.02,1.24]};
const UPPER_T:Readonly<Record<number,readonly number[]>>={[-1]:[.50,.80,1.10,1.40],1:[1.00,1.30]};
function turretEra(P:TankBuilderPort):void {
  for(const side of [-1,1]){
    for(const t of LOWER_T[side]){const {p,n}=castFrame(side*t,LOWER_Y);seat(P,p,n,[.24,.075,.30],0);}
    for(const t of UPPER_T[side]){const {p,n}=castFrame(side*t,UPPER_Y);seat(P,p,n,[.24,.075,.28],UPPER_PITCH);}
  }
  // The roof row ahead of the hatches, clear of the Sosna-U covers (x > 0.35) on the left.
  for(const x of [-.50,-.26,-.02,.22]){
    const z=.42;let lo=ROOF_FLOOR,hi=2.6;
    for(let i=0;i<32;i++){const y=(lo+hi)/2;if(t72b3XCastingContains(x,y,z))lo=y;else hi=y;}
    seat(P,new THREE.Vector3(x,lo,z),new THREE.Vector3(0,0,1),[.22,.06,.24],1.26);
  }
}

function searchlight(P:TankBuilderPort):void {
  // L-2G infrared searchlight on the left of the gun (+X), ahead of the cheek block at barrel height: an arm out of the
  // block's face into the drum's back cap and a strut under it from the casting.
  const x=.50,y=1.70,z=1.37;
  const face=(h:number)=>{let lo=.9,hi=1.6;for(let i=0;i<28;i++){const m=(lo+hi)/2;if(t72b3XCastingContains(x,h,m))lo=m;else hi=m;}return lo;};
  const at=(dx:number,dy:number,dz:number)=>[x+dx-YAW[0],y+dy-YAW[1],z+dz-YAW[2]] as const;
  P.addEquipment('turretDetail',cylZ(.165,.20,28),...at(0,0,0));
  P.addEquipment('turretDetail',cylZ(.12,.05,20),...at(0,0,-.125));
  P.addEquipment('turretDark',torus(.160,.016,24,6),...at(0,0,.10));
  P.addModuleVisual('optics','turretGlass',cylZ(.148,.012,28),...at(0,0,.102));
  const from=face(y)-.02,to=z-.14;
  P.addEquipment('turretDetail',box(.10,.10,to-from),...at(0,0,(from+to)/2-z));
  const low=1.56;
  P.addEquipment('turretDetail',beamBetween([x-YAW[0],low-YAW[1],face(low)-.01-YAW[2]],[...at(0,-.14,-.06)],.02,8));
}

// ---------------------------------------------------------------- the previous model's own fittings (turret frame)
function fieldFittings(P:TankBuilderPort):void {
  supportedSensor(P,[.40,.88,-.49],.66);
  // 2026-10-19 (owner float sweep): the T-64 turret's rear wall stands 0.35 m forward of the T-72's, so the cage hung in
  // the air behind it; it moves 0.25 m forward and its brackets reach the wall
  attachedCage(P,'turret',[0,.31,-1.64],1.82,.46,.53);
  strappedPack(P,'turret',[-.38,.39,-1.39],[.55,.24,.32]);   // inside the cage, 0.25 m forward with it
  // Two independent service bins and paired whips; no national markings
  // are borrowed from the donor's decal geometry.
  for(const side of [-1,1]){
    P.addEquipment('turretDetail',box(.28,.18,.30),side*.74,.41,-1.39);
    P.addEquipment('turretDark',KIT.cylY(.009,.013,.62,10),side*.74,.80,-1.39);
  }
}

export function buildT64BV2017(P:TankBuilderPort):void {
  buildT72B3X(P,{kontakt5:false});
  glacisEra(P);for(const side of [-1,1])skirtEra(P,side);blade(P);
  turretEra(P);searchlight(P);
  fieldFittings(P);
  addDonbasFieldCover(P);
  P.hullG.userData.familyRebuild={donor:'t72b3',revision:3,variant:'donbas',
    features:['k1-glacis','k1-skirt','k1-horseshoe','k1-roof-row','l2g-searchlight','dozer-blade','field-cover']};
}
