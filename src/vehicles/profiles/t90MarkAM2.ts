// The T-90AM II (`t90m_proryv`): its own fittings on the T-90M source build (t90X.ts T90_X_PROFILES.t90m). 2026-10-30 (lane t90-family-266; the owner: "our new
// versiosn now just look way too identical to sources. tone down that copying a lil", then "we can also make new turrets,
// layerring onn top, hull modificaitons, track shapes, shoulders, rear stuuff like barrrles and so on, sideskirts, cages,
// shtora or otherr quipmennt, machine guns"). Laid after the source build, in the builder frame of that build.
// The T-90M Proryv-3 as it served in 2022-24: the anti-drone roof cage, an EW jammer, slat over the hull sides, the log.
// The shared fieldRoofCage.ts wings find no pad on this turret (its feet at x ±1.01, z -1.03 fall past the narrow
// rear roof), so the cage here is fitted to the T-90M roof.
// 2026-10-31 (the owner: "also make some of our reworked t90s have new or unique machine gun arrangmenet,s like 2
// machine guns"): a second, working roof gun, the frontline crews' anti-drone fit: a 7.62 mm PK-pattern gun on a crew
// pintle at the gunner's hatch (turret left), beside the commander's Kord station.
import * as THREE from 'three';
import {FITTINGS,KIT} from './kit.ts';
import {beamBetween} from './measuredPrimitives.ts';
import {sectionSolid} from './sectionSolid.ts';
import {latheY} from '../accessoryPrimitives.ts';
import {MG_CLASSES} from '../machineGunGeometry.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

type Point=readonly[number,number,number];
type XZ=readonly[number,number];
const {box,cylX,cylY,cylZ}=KIT;
// Turret frame (pivot at hull 0.018, 1.337, -0.104). The cage plane clears the commander's cupola (0.94) by 0.19 m and
// sits under the remote station's barrel (pivot 1.42; at 10 degrees' depression its muzzle stays above 1.25).
const CAGE_Y=1.13;
const OUTER:readonly XZ[]=[[-1.45,.75],[1.45,.75],[1.40,-.60],[1.15,-1.55],[.88,-2.70],[-.80,-2.70],[-1.18,-1.55],[-1.40,-.60]];
// The open bay over both hatches, the gunner's sight, the wind mast and the station's whole lower sweep (0.5 m round
// its yaw at x -0.444, z -0.927). Its left edge stands 0.18 m outboard of the gunner's pintle (x 0.84), so the pintle's
// column and yoke turn in the open and only the gun itself passes over the bars.
const BAY={x0:-1.08,x1:1.02,z0:-1.55,z1:.55};

function bar(P:TankBuilderPort,a:Point,b:Point,r:number):void{
  const g=beamBetween(a,b,r,8);g.userData.fieldRoofCage=true;P.addEquipment('turretOpenLattice',g);
}

/** The polygon's extent along one axis on the line where the other axis equals v. */
function span(poly:readonly XZ[],along:0|1,v:number):[number,number]|null{
  const other=along===0?1:0,hits:number[]=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    if((a[other]-v)*(b[other]-v)>0||a[other]===b[other])continue;
    hits.push(a[along]+(b[along]-a[along])*(v-a[other])/(b[other]-a[other]));
  }
  return hits.length<2?null:[Math.min(...hits),Math.max(...hits)];
}

function cut(range:[number,number],hole:[number,number]|null):[number,number][]{
  if(!hole||hole[1]<=range[0]||hole[0]>=range[1])return [range];
  return [[range[0],hole[0]],[hole[1],range[1]]].filter(([a,b])=>b-a>.05) as [number,number][];
}

/** The roof stock's top under (x, z), ERA left out (a spent cassette must not leave a foot in the air). */
function roofFoot(P:TankBuilderPort,stock:THREE.Mesh[],x:number,z:number):number{
  const hit=new THREE.Raycaster(new THREE.Vector3(x,3,z),new THREE.Vector3(0,-1,0)).intersectObjects(stock)[0];
  if(!hit||hit.point.y<.45)throw new Error(`${P.spec.id}: roof fitting has no roof under ${x},${z}`);
  return hit.point.y;
}

/** Low and high roof under a w x d footprint: a base spans both, so it beds into a sloping roof without a gap. */
function footprint(P:TankBuilderPort,stock:THREE.Mesh[],x:number,z:number,w:number,d:number):[number,number]{
  const ys=[-1,1].flatMap(sx=>[-1,1].map(sz=>roofFoot(P,stock,x+sx*w/2,z+sz*d/2)));
  return [Math.min(...ys),Math.max(...ys)];
}

// Anti-drone roof cage ("mangal"): the welded tube-and-bar screen the Proryv-3 crews fitted over the turret from 2022,
// a ring over the cheeks, the wings and the bustle on short posts, open over the hatches and the remote station.
function roofCage(P:TankBuilderPort,stock:THREE.Mesh[]):void{
  const y=CAGE_Y;
  for(let i=0;i<OUTER.length;i++){
    const a=OUTER[i],b=OUTER[(i+1)%OUTER.length];
    bar(P,[a[0],y,a[1]],[b[0],y,b[1]],.02);
  }
  const bay:XZ[]=[[BAY.x0,BAY.z0],[BAY.x1,BAY.z0],[BAY.x1,BAY.z1],[BAY.x0,BAY.z1]];
  for(let i=0;i<4;i++){const a=bay[i],b=bay[(i+1)%4];bar(P,[a[0],y,a[1]],[b[0],y,b[1]],.02);}
  for(let z=-2.58;z<.7;z+=.15){
    const s=span(OUTER,0,z);if(!s)continue;
    for(const [a,b]of cut(s,z>BAY.z0&&z<BAY.z1?[BAY.x0,BAY.x1]:null))bar(P,[a,y,z],[b,y,z],.010);
  }
  for(let x=-1.32;x<1.33;x+=.22){
    const s=span(OUTER,1,x);if(!s)continue;
    for(const [a,b]of cut(s,x>BAY.x0&&x<BAY.x1?[BAY.z0,BAY.z1]:null))bar(P,[x,y,a],[x,y,b],.010);
  }
  // posts on the roof round the bay, two on the bustle basket's rear rail; braces carry the overhanging wings
  const posts:XZ[]=[[BAY.x0,-.90],[BAY.x0,.45],[BAY.x1,-1.0],[BAY.x1,.40],[-.90,BAY.z0],[.55,BAY.z0],[0,.65],[-.58,-2.69],[.70,-2.69]];
  for(const [x,z]of posts){
    const foot=roofFoot(P,stock,x,z);
    P.addEquipment('turretDetail',box(.10,.025,.10),x,foot+.0125,z);
    bar(P,[x,foot+.02,z],[x,y,z],.021);
    if(x===BAY.x0||x===BAY.x1){
      const out=span(OUTER,0,z)!;
      bar(P,[x,foot+.30,z],[x<0?out[0]:out[1],y,z],.014);
    }
  }
}

// Volnorez-type anti-drone EW jammer: the boxed emitter with its four stub antennas on the turret's rear roof, a 2023
// fit on the Proryv-3, set in the cage's open bay under the station's barrel sweep.
function jammer(P:TankBuilderPort,stock:THREE.Mesh[]):void{
  // a 0.10 m pedestal lifts it clear of the roof clutter; its stub antennas (to 1.17) stay under the barrel's 1.25
  const x=.30,z=-1.32,[low,roof]=footprint(P,stock,x,z,.40,.30),base=roof+.12;
  P.addEquipment('turretDetail',box(.40,roof-low+.02,.30),x,(low+roof+.02)/2,z);
  for(const dx of[-.14,.14])P.addEquipment('turretDetail',box(.05,.10,.22),x+dx,roof+.07,z);
  P.addEquipment('turretFittingPaint',box(.36,.20,.26),x,base+.10,z);
  P.addEquipment('turretDark',box(.38,.025,.28),x,base+.2125,z);
  for(const dx of[-.14,.14])for(const dz of[-.09,.09])P.addEquipment('turretDark',cylY(.012,.016,.15,10),x+dx,base+.30,z+dz);
  P.addEquipment('turretDark',cylX(.022,.06,10),x+.21,base+.08,z);
}

// Second radio mast: the added R-168 set's whip on a stepped base at the bay's rear right, clear of the station's sweep.
function secondMast(P:TankBuilderPort,stock:THREE.Mesh[]):void{
  const x=.62,z=-1.30,[low,base]=footprint(P,stock,x,z,.09,.12);
  P.addEquipment('turretDetail',box(.09,base-low+.09,.12),x,(low+base+.09)/2,z);
  P.addEquipment('turretDetail',cylY(.06,.06,.22,14),x,base+.20,z);
  P.addEquipment('turretDetail',cylY(.02,.02,.16,12),x,base+.39,z);
  P.addEquipment('turretDark',cylY(.012,.016,1.10,10),x,base+1.02,z);
}

// Gunner's pintle: the 7.62 mm PK-pattern gun frontline T-90M crews mounted at the gunner's hatch from 2023 against
// drones, beside the commander's Kord station. A welded socket post stands on the roof ahead and outboard of the hatch
// ring (0.10 m off the ring's rim, clear of the lid's swing and of the sight hood's back), braced by four gussets and
// strapped to the ring; the gun's pintle turns in its collar. It is the fleet's crew pintle (FITTINGS.pintleMG: the
// GPMG section, the feed on the right as on the PK, its box on the cradle, the riding cradle a working station rides),
// and a working station the roof-gun control drives (calibre 7.62: the rifle profile). Its trunnion stands at 1.40,
// 0.72 m over the roof, where the whole circle turns clear: 0.25 m over the cage plane (at the weapon's full depression
// the muzzle still clears the bars by over 50 mm, at full elevation the butt clears the bay's edge bar by 45 mm), and
// its 0.72 m reach and the Kord's 0.95 m keep 40 mm apart across their axes' 1.71 m, so neither turns into the other at
// any bearing. It rests 25 degrees to the left, the Kord 45 to the right.
const PINTLE={x:.84,z:.20,bore:1.40,bearingDeg:25};
function gunnerPintle(P:TankBuilderPort,stock:THREE.Mesh[]):void{
  const {x,z}=PINTLE,[low,high]=footprint(P,stock,x,z,.20,.18);
  // the base plate, buried 8 mm under the roof's lowest corner, and the socket post on it: a turned tube with a welded
  // foot ring and its clamp collar at the top
  const plateTop=high+.014,top=high+.30;
  P.addEquipment('turretDetail',box(.20,plateTop-low+.008,.18),x,(plateTop+low-.008)/2,z);
  const h=top-plateTop;
  P.addEquipment('turretDetail',latheY([[0,0],[.058,0],[.058,.012],[.044,.024],[.040,.04],[.040,h-.05],[.050,h-.045],
    [.050,h-.004],[.046,h],[0,h]],20),x,plateTop-.002,z);
  // four gussets from the plate to the tube, on the post's diagonals
  const g=sectionSolid([-1,1].map(side=>({z:side*.004,ring:[[.038,0],[.098,0],[.038,.11]] as [number,number][]})));
  for(let k=0;k<4;k++){
    const a=Math.PI/4+k*Math.PI/2;
    P.addEquipment('turretDetail',KIT.xform(g.clone(),0,0,0,0,a-Math.PI/2,0),x,plateTop-.002,z);
  }
  g.dispose();
  // the collar's lock: a T-handled clamp bolt on the outboard side
  P.addEquipment('turretDark',cylX(.009,.07,10),x+.08,top-.024,z);
  P.addEquipment('turretDark',cylZ(.007,.06,8),x+.115,top-.024,z);
  // the strap welded from the post to the hatch ring's outer face, buried 10 mm into the ring
  const hx=.517,hz=-.246,dx=hx-x,dz=hz-z,d=Math.hypot(dx,dz),ux=dx/d,uz=dz/d,a0=.036,a1=d-.35+.010;
  P.addEquipment('turretDetail',KIT.xform(box(.012,.05,a1-a0),0,0,0,0,Math.atan2(ux,uz),0),x+ux*(a0+a1)/2,high+.04,z+uz*(a0+a1)/2);
  // the gun on its pintle: the crew pintle's trunnion stands 0.225 m over its foot before the riser (machineGunGeometry.ts
  // createPintleLayout at the GPMG's true scale)
  const cls=MG_CLASSES.mag,s=cls.s,trunnion=.014+.16*s+.08*s+cls.rec[1]*s/2+.004;
  const gun=FITTINGS.pintleMG({mats:P.mats,cls:'mag',tone:'two-tone',working:true,ridingCradle:true,feed:'right',
    riser:PINTLE.bore-top-trunnion,seed:290});
  gun.name='t90mProryvGunnerPkt';
  gun.position.set(x,top,z);
  gun.rotation.y=THREE.MathUtils.degToRad(PINTLE.bearingDeg);
  gun.userData.t90OwnBearing=true;
  P.turretG.add(gun);
}

// Side slat screens: flat-bar grilles over the Relikt skirts from the source rear cage forward to mid-hull, the 2023-24
// add-on the T-90Ms took against drone-dropped and RPG hits, bracketed to the inner side plates on the source cage's pitch.
function sideSlat(P:TankBuilderPort):void{
  // the bars continue the source cage's fourteen rows (0.6018 + 0.055017 j) from its front upright (z -1.108)
  const z0=-1.108,z1=.55,low=.6018,top=low+13*.055017;
  for(const side of[-1,1]){
    const x=side*(side<0?1.87472:1.87455);
    for(let j=0;j<14;j++)P.addEquipment('hullOpenLattice',box(.03057,.012,z1-z0),x,low+j*.055017,(z0+z1)/2);
    for(const z of[z0+.007,-.27,z1-.007]){
      P.addEquipment('hullOpenLattice',box(.02784,top-low+.012,.014),x,(top+low)/2,z);
      // the source cage's bracket through to the inner side plate, and a stand-off foot onto the skirt
      P.addEquipment('hullOpenLatticeDark',box(.15,.031,.038),side*(1.8828-.075),1.236,z);
      P.addEquipment('hullOpenLatticeDark',box(.028,.04,.03),side*1.856,.78,z);
    }
  }
}

// Unditching log: the T-72/T-90 self-recovery beam strapped to the outer drum arms under the drums, as the service
// fleet carries it.
function sternLog(P:TankBuilderPort):void{
  const r=.10,y=1.02,z=-3.62;
  P.addEquipment('hullWood',cylX(r,2.40,16),0,y,z);
  for(const x of[-.86346,.86346])P.addEquipment('hullDark',cylX(r+.008,.045,16),x,y,z);
}

export function addT90MarkAM2Kit(P:TankBuilderPort):void{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),stock:THREE.Mesh[]=[];
  P.forEachBucketPart(['turret','turretExternalArmor','turretDetail','turretPermanentMarkingSurface'],g=>{
    if(g.userData.eraHitFaceVertexStarts)return;
    const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();stock.push(m);
  });
  try{roofCage(P,stock);jammer(P,stock);secondMast(P,stock);gunnerPintle(P,stock);}finally{mat.dispose();}
  sideSlat(P);sternLog(P);
}
