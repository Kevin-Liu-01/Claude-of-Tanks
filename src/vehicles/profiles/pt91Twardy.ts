// The PT-91 Twardy (release 262; owner 2026-10-28, verbatim: "also we should update the twardy to be beter and based
// off an actual tnak"). Bumar-Łabędy's T-72M1 modernization, as the Polish Army fields it: the T-72 hull and cast
// turret (the T-72B3 study, t72b3X.ts, without its Kontakt-5, 902A bank or Sosna-U), under the ERAWA tile layout of the
// serial tanks: 394 tiles (108 on the turret, 118 on the hull, 84 on each side screen; Wikipedia, PT-91 Twardy), laid
// edge to edge rather than in the Kontakt-1 grid with its gaps. Read off the photographs (Wikimedia Commons: PT91 MSPO15
// DSC02773, POL PT91 Twardy, Polish PT-91 Twardy tank Saber Strike 18, PT-91 Twardy NTW 5 93 6): four courses of square
// tiles shingled round the turret front from the gun to the flanks and two rows on the roof ahead of the hatches; five
// courses over the upper glacis and two either side of the driver on the plate behind it; three courses on the forward
// half of each steel side screen; two 12-tube 81 mm grenade banks on sloped brackets on the turret flanks behind the
// cheek tiles; the Drawa gunner's sight head ahead of the gunner's hatch; Drawa's crosswind sensor mast over the turret
// rear; the self-entrenching blade on the lower nose plate.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {beamBetween,blindTube,type Point3} from './measuredPrimitives.ts';
import {markEraHitFaces} from './eraHitFaces.ts';
import {markSmokeTube} from '../vehicleAuxiliaryGeometry.ts';
import {buildT72B3X,t72b3XCastingContains} from './t72b3X.ts';
import {withSeatRole} from '../spareTrackSeat.ts';
import {T72B3_X_SOURCE_DATUMS} from '../t72b3XArmor.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const {box,cylY}=KIT;
const YAW=T72B3_X_SOURCE_DATUMS.turretPivot,RING=new THREE.Vector3(...YAW);
const UP=new THREE.Vector3(0,1,0);
/** ERAWA tile pitch along a course and its plate thickness (the tiles butt with a 12 mm joint). */
const TILE=.20,JOINT=.012,TH=.05;

/** One ERAWA tile: the reactive cassette (its +Y face is the hit face), oriented by `basis`. */
function tile(P:TankBuilderPort,owner:'hull'|'turret',sector:string,basis:THREE.Matrix4,size:Point3):void {
  const [w,th,len]=size;
  // HIGH draws the cassette's rounded edges; LOW the plain block (the fleet LOW tier's cost rule)
  const body=P.q?box(w,th,len):new THREE.BoxGeometry(w,th,len);
  P.destructibleCluster(sector,()=>P.addExternalArmor(owner,markEraHitFaces(body,[0,1,0]).applyMatrix4(basis)));
}

// ---------------------------------------------------------------- hull (hull frame: ground y = 0, +Z forward)
// The B3 study's upper glacis plate runs from (z 2.20, y 1.3078) to the nose (3.17815, 0.8215); the plate behind it
// rises to the deck at (1.81, 1.4599). The headlights and their guards stand on the glacis corners (x 0.77-0.95,
// z 2.70-2.83).
const GLACIS_Z0=2.20,GLACIS_Y0=1.3078,NOSE_Z=3.17815,NOSE_Y=.8215,DECK_Z=1.81,DECK_Y=1.4599;
const GLACIS_RAKE=Math.atan((GLACIS_Y0-NOSE_Y)/(NOSE_Z-GLACIS_Z0));
const UPPER_RAKE=Math.atan((DECK_Y-GLACIS_Y0)/(GLACIS_Z0-DECK_Z));
const glacisY=(z:number)=>GLACIS_Y0-(z-GLACIS_Z0)*Math.tan(GLACIS_RAKE);
const upperY=(z:number)=>DECK_Y-(z-DECK_Z)*Math.tan(UPPER_RAKE);

function plateTile(P:TankBuilderPort,sector:string,x:number,z:number,y:number,rake:number,size:Point3):void {
  const n=new THREE.Vector3(0,Math.cos(rake),Math.sin(rake));
  const p=new THREE.Vector3(x,y,z).addScaledVector(n,size[1]/2-.003);
  tile(P,'hull',sector,new THREE.Matrix4().makeRotationX(rake).setPosition(p),size);
}

function glacisTiles(P:TankBuilderPort):void {
  // Five courses of eight across the glacis from its top edge down to the nose, the corner tiles stopping short of the
  // headlights.
  const c=Math.cos(GLACIS_RAKE);
  for(let row=0;row<5;row++){
    const z=GLACIS_Z0+(TILE/2+.01)*c+row*(TILE+JOINT)*c;
    for(let i=0;i<8;i++){
      const x=(i-3.5)*(TILE+JOINT);
      if(Math.abs(x)+TILE/2>.76&&z+.10>2.68&&z-.10<2.86)continue;
      plateTile(P,`glacis_era_${x<0?'L':'R'}`,x,z,glacisY(z),GLACIS_RAKE,[TILE,TH,TILE]);
    }
  }
  // Two courses either side of the driver's hatch on the plate behind it.
  for(const z of [1.93,2.10])for(const side of [-1,1])for(let i=0;i<3;i++){
    const x=side*(.52+i*(TILE+JOINT));
    plateTile(P,`glacis_era_${side<0?'L':'R'}`,x,z,upperY(z),UPPER_RAKE,[TILE,TH,TILE*.80]);
  }
}

function sideScreen(P:TankBuilderPort,side:number):void {
  // The steel anti-HEAT screen closes the B3 study's open course between its fender edge (y 1.444) and its lower skirt
  // (top 1.128, outer face x -1.779 / 1.791), hung on four hinges; three courses of tiles cover its forward half from
  // the bow panel back over the third road wheel, the rear half left bare steel. The screen is external armour, not
  // hull: the hull mesh stays the T-72B3 donor's (fleetRenewal.selftest).
  const face=side<0?1.779:1.791;
  P.addExternalArmor('hull',box(.020,.316,6.10),side*(face-.010),1.286,.20);
  for(const z of [-2.30,-.70,.90,2.50])P.addEquipment('hullDetail',box(.030,.05,.12),side*(face+.005),1.42,z);
  const x=side*(face+TH/2-.003),h=(1.425-.725-2*JOINT)/3;
  const rotation=new THREE.Matrix4().makeRotationZ(-side*Math.PI/2);
  for(let row=0;row<3;row++){
    const y=.725+h/2+row*(h+JOINT);
    for(let i=0;i<16;i++){
      const z=3.26-TILE/2-i*(TILE+JOINT);
      tile(P,'hull',`skirt_era_${side<0?'L':'R'}`,rotation.clone().setPosition(new THREE.Vector3(x,y,z)),[h,TH,TILE]);
    }
  }
}

function blade(P:TankBuilderPort):void {
  // Self-entrenching blade across the lower nose plate (z 2.80, y 0.611 to the nose), 22 mm proud of it, with the
  // three seams of its welded sections.
  const z0=2.80,y0=.611,rise=Math.atan2(NOSE_Y-.0025-y0,NOSE_Z-z0),t=new THREE.Vector3(0,Math.sin(rise),Math.cos(rise));
  const n=new THREE.Vector3(1,0,0).cross(t);
  const basis=(dx:number,out:number)=>new THREE.Matrix4().makeBasis(new THREE.Vector3(1,0,0),t,n)
    .setPosition(new THREE.Vector3(dx,(y0+NOSE_Y)/2,(z0+NOSE_Z)/2).addScaledVector(n,out));
  P.addEquipment('hullDetail',box(2.06,.30,.05).applyMatrix4(basis(0,.022)));
  for(const dx of [-.515,0,.515])P.addEquipment('hullDark',new THREE.BoxGeometry(.012,.27,.012).applyMatrix4(basis(dx,.050)));
}

// ---------------------------------------------------------------- turret (measured in the hull frame, placed in the turret's)
const inCasting=(q:THREE.Vector3)=>t72b3XCastingContains(q.x,q.y,q.z);
/** The casting's surface at height y on the plan ray from the turret axis at angle t (0 straight ahead, + toward +X). */
function castAt(t:number,y:number):THREE.Vector3 {
  const dx=Math.sin(t),dz=Math.cos(t);let lo=0,hi=2.4;
  for(let i=0;i<32;i++){const r=(lo+hi)/2;if(t72b3XCastingContains(dx*r,y,YAW[2]+dz*r))lo=r;else hi=r;}
  return new THREE.Vector3(dx*lo,y,YAW[2]+dz*lo);
}
/** The casting's roof height over (x, z). */
function roofAt(x:number,z:number):number {
  let lo=1.45,hi=2.6;
  for(let i=0;i<32;i++){const y=(lo+hi)/2;if(t72b3XCastingContains(x,y,z))lo=y;else hi=y;}
  return lo;
}
/** The casting's outer wall on one side at (y, z). */
function wallX(side:number,y:number,z:number):number {
  let lo=0,hi=2;
  for(let i=0;i<32;i++){const m=(lo+hi)/2;if(t72b3XCastingContains(side*m,y,z))lo=m;else hi=m;}
  return side*lo;
}

/** One tile on the casting at p in the frame (tangent, normal, along), let 4 mm into the shell at its nearest corner
 * (it rides out along its normal until no corner is inside the casting). */
function place(P:TankBuilderPort,p:THREE.Vector3,tangent:THREE.Vector3,normal:THREE.Vector3,size:Point3):void {
  const [w,th,len]=size,along=new THREE.Vector3().crossVectors(tangent,normal);
  const back=[-1,0,1].flatMap(a=>[-1,0,1].map(b=>tangent.clone().multiplyScalar(a*w/2).addScaledVector(along,b*len/2)));
  let offset=0;
  while(offset<.25&&back.some(v=>inCasting(p.clone().addScaledVector(normal,offset).add(v))))offset+=.004;
  const centre=p.clone().addScaledVector(normal,offset-.004+th/2).sub(RING);
  tile(P,'turret',`turret_era_${p.x<0?'L':'R'}`,new THREE.Matrix4().makeBasis(tangent,normal,along).setPosition(centre),size);
}
/** A wall tile: pitched up from the horizontal outward normal. */
function seat(P:TankBuilderPort,p:THREE.Vector3,outward:THREE.Vector3,size:Point3,pitch:number):void {
  const out=new THREE.Vector3(outward.x,0,outward.z).normalize(),tangent=new THREE.Vector3().crossVectors(UP,out).normalize();
  place(P,p,tangent,out.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(UP,Math.sin(pitch)),size);
}
/** A roof tile: square to the roof's own normal, its edges kept along the hull's axes. */
function seatRoof(P:TankBuilderPort,p:THREE.Vector3,normal:THREE.Vector3,size:Point3):void {
  const x=new THREE.Vector3(1,0,0),tangent=x.addScaledVector(normal,-normal.x).normalize();
  place(P,p,tangent,normal,size);
}

/** Plan angles along one course, every tile pitch of arc from the gun's clearance (|x| 0.40) out to `limit`. */
function courseAngles(side:number,y:number,limit:number,size:number):number[] {
  const out:number[]=[];let arc=0,prev=castAt(0,y),next=-1;
  for(let t=0;t<=limit;t+=.004){
    const q=castAt(side*t,y);arc+=q.distanceTo(prev);prev=q;
    if(next<0){if(Math.abs(q.x)>=.40+size/2){out.push(t);next=arc+size+JOINT;}continue;}
    if(arc>=next){out.push(t);next+=size+JOINT;}
  }
  return out;
}
/** The casting's outward normal at (x, z) on the roof, from the roof's slope. */
function roofNormal(x:number,z:number):THREE.Vector3 {
  const d=.03,gx=(roofAt(x+d,z)-roofAt(x-d,z))/(2*d),gz=(roofAt(x,z+d)-roofAt(x,z-d))/(2*d);
  return new THREE.Vector3(-gx,1,-gz).normalize();
}

// The wall courses round the cheeks and flanks: height on the casting, pitch from the horizontal outward normal, and
// the plan angle each stops at, ahead of the grenade bank's bracket. Above them the roof field.
const TURRET_TILE=.18;
const COURSES:readonly(readonly[y:number,pitch:number,limit:number])[]=[[1.64,0,1.18],[1.80,.36,1.14],[1.94,.78,1.06]];
function turretTiles(P:TankBuilderPort):void {
  for(const [y,pitch,limit] of COURSES)for(const side of [-1,1]){
    for(const t of courseAngles(side,y,limit,TURRET_TILE)){
      // the tile lies along the chord of its own footprint: the casting is faceted, and a short tangent taken across a
      // facet edge turned the tile up to 40 degrees off the wall
      const p=castAt(side*t,y),d=TURRET_TILE/2/Math.hypot(p.x,p.z-YAW[2]);
      const tangent=castAt(side*(t+d),y).sub(castAt(side*(t-d),y)).normalize();
      const n=new THREE.Vector3().crossVectors(tangent,UP).multiplyScalar(side);
      if(n.x*p.x+n.z*(p.z-YAW[2])<0)n.negate();
      seat(P,p,n,[TURRET_TILE,TH,TURRET_TILE],pitch);
    }
  }
  // The roof field over the front half of the dome, where it lies within 40 degrees of level and above the wall
  // courses: rows across from the gun's line to the flanks, clear of the gunner's sight (x 0.50-0.90, z -0.15-0.40),
  // the cupola's ring and the hatches behind them.
  const step=TURRET_TILE+JOINT;
  for(let j=0;j<4;j++)for(let i=-5;i<=5;i++){
    const x=i*step,z=.32+j*step,y=roofAt(x,z),n=roofNormal(x,z);
    if(y<2.01||n.y<Math.cos(.70))continue;
    if(x>.40&&x<1.0&&z<.52)continue;
    if(Math.hypot(x+.604,z+.265)<.56)continue;
    if(Math.abs(x)<.12&&z>.80)continue;
    seatRoof(P,new THREE.Vector3(x,y,z),n,[TURRET_TILE,TH*.8,TURRET_TILE]);
  }
}

function grenadeBank(P:TankBuilderPort,side:number):void {
  // Twelve 81 mm tubes in four rows of three on a bracket sloping up toward the rear, on the flank behind the cheek
  // tiles and ahead of the stowage case: each row steps 9 cm back and 7.5 cm up, the tubes fan 22 degrees out and
  // 40 up from straight ahead.
  const at=(x:number,y:number,z:number)=>[x-YAW[0],y-YAW[1],z-YAW[2]] as const;
  const rows=[0,1,2,3].map(i=>({y:1.80+i*.075,z:.42-i*.09}));
  const yaw=side*.38,pitch=-.70;
  for(const {y,z} of rows){
    const wall=Math.abs(wallX(side,y,z));
    // the row's bracket rail, from 2 cm inside the cast wall out under its third tube
    const inner=wall-.02,outer=wall+.32;
    P.addEquipment('turretDetail',box(outer-inner,.022,.11),...at(side*(inner+outer)/2,y-.062,z));
    for(let k=0;k<3;k++){
      const x=side*(wall+.075+k*.092);
      P.addEquipment('turretDetail',markSmokeTube(blindTube(.0455,.036,.26,.16,P.q?18:10),[0,0,1],true),...at(x,y,z),pitch,yaw,0);
    }
  }
  // the bracket's sloped side plates, tying the rails to each other and to the wall
  const a=rows[0],b=rows[3];
  for(const off of [-.01,.30]){
    const w0=Math.abs(wallX(side,a.y,a.z))+off,w1=Math.abs(wallX(side,b.y,b.z))+off;
    P.addEquipment('turretDetail',beamBetween([...at(side*w0,a.y-.075,a.z+.05)],[...at(side*w1,b.y-.075,b.z-.05)],.018,6));
  }
}

function drawaSight(P:TankBuilderPort):void {
  // The Drawa gunner's sight head ahead of the gunner's hatch (+X): an armoured box on a base plate let into the roof,
  // its window facing ahead under a hood.
  const x=.70,z=.12,base=roofAt(x,z+.18);
  const at=(dy:number,dz:number,dx=0)=>[x+dx-YAW[0],base+dy-YAW[1],z+dz-YAW[2]] as const;
  P.addEquipment('turretDetail',box(.34,.10,.46),...at(.03,0));
  P.addModuleVisual('optics','turretDetail',box(.28,.22,.36),...at(.19,-.01));
  P.addModuleVisual('optics','turretGlass',box(.20,.09,.012),...at(.21,.175));
  P.addEquipment('turretDetail',box(.30,.016,.14),...at(.305,.20));
  for(const dx of [-.14,.14])P.addEquipment('turretDetail',box(.016,.10,.14),...at(.255,.20,dx));
}

function crosswindMast(P0:TankBuilderPort):void {
  // Drawa's crosswind sensor on its mast over the turret rear, between the roof whips. The mast, its pot and its head
  // carry the antenna seat role, as the whips do: the geometry gate's body leaves them out (tools/body-height-parts.mjs,
  // Main's ruling 2026-10-30).
  const x=.08,z=-1.02,base=roofAt(x,z);
  const at=(dy:number)=>[x-YAW[0],base+dy-YAW[1],z-YAW[2]] as const;
  withSeatRole(P0,'antenna',(P)=>{
    P.addEquipment('turretDetail',cylY(.06,.07,.05,12),...at(.01));
    P.addEquipment('turretDetail',cylY(.018,.022,.52,8),...at(.29));
    P.addEquipment('turretDetail',box(.10,.09,.13),...at(.59));
    P.addEquipment('turretDark',cylY(.012,.012,.10,6),...at(.685));
  });
}

export function buildPT91Twardy(P:TankBuilderPort):void {
  buildT72B3X(P,{kontakt5:false,smoke:false,sosna:false});
  glacisTiles(P);for(const side of [-1,1])sideScreen(P,side);blade(P);
  turretTiles(P);for(const side of [-1,1])grenadeBank(P,side);drawaSight(P);crosswindMast(P);
  P.hullG.userData.familyRebuild={donor:'t72b3',revision:1,variant:'pt91',
    features:['erawa-glacis','erawa-side-screens','erawa-turret','grenade-banks-2x12','drawa-sight','crosswind-mast','dozer-blade']};
}
