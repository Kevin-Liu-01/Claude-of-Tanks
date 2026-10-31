import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
// Swedish CV9040C photo reconstruction, separate from the upgraded CV90 slot.
// The C's appliqué cheek packets, 40 mm mount and troop-cell roof are authored
// independently of the later Mk IV X. See the dated reference packet.
import * as THREE from 'three';
import { sectionSolid } from './sectionSolid.ts';
import { KIT, convexSlab } from './kit.ts';
import { chassisLoft, armorLoft, sideWall, openTube, optic, antenna, deckGrille, turretEquipment } from './europeSourcePrimitives.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
const {box,cylX,cylY,cylZ}=KIT;

// Release 240 (the owner: "make sure all tank turrets are clear of hulls"; closed hulls at real dimensions): the troop
// cell's raised roof (1.94) starts at -2.49, 1.73 m off the ring's axis, past the sweep of the turret's underside
// (1.78-1.94, out to 1.48 m) and of the rocking mask at full elevation (1.95, out to 1.65 m). It started at -1.48, 0.72 m
// behind the axis, and the turret stood 11-15 cm in it at rest and at every bearing. Its walls step with it.
function hull(P: TankBuilderPort): void {
  P.add('hull',chassisLoft([
    [-3.32,.78,1.51,1.40,.65,1.22,1.93],
    [-2.96,.93,1.52,1.43,.37,1.22,1.94],
    [-2.49,0.9332,1.52,1.43,0.37,1.2009,1.94],
    [-2.43,0.9336,1.52,1.43,0.37,1.1985,1.76],
    [-1.48,.94,1.52,1.43,.37,1.16,1.76],
    [-.95,.94,1.52,1.43,.37,1.16,1.76],
    [1.22,.94,1.52,1.43,.37,1.16,1.76],
    [2.62,.94,1.51,1.40,.58,1.25,1.40],
    [3.36,.97,1.43,1.38,.85,1.18,1.21],
  ],1.06));
  for(const side of [-1,1]) {
    // External C-standard protection follows the low front / high rear cell.
    sideWall(P,side,1.50,1.64,[[-3.28,1.15,1.90],[-2.50,1.15,1.90],[-2.44,1.15,1.73],[1.16,1.15,1.73],[2.60,1.25,1.36],[3.21,1.18,1.23]]);
    for(let i=0;i<6;i++) {
      const z=-2.65+i*.98;
      sideWall(P,side,1.61,1.685,[[z-.474,.56,1.19],[z+.474,.56,1.19]]);
      for(const dz of [-.33,.33])P.addEquipment('hullDetail',box(.045,.074,.10),side*1.69,1.19,z+dz);
    }
    P.addMudguard(`cv9040c-front-${side}`,'hullRubber',box(.54,.30,.025),side*1.32,.99,3.31,-.65);
    // Owner 2026-10-19 (flaps sweep): 10 mm wider inboard, so the rear flap's inner edge meets the hull side (it stood 5 mm off)
    P.hangMudguard(`cv9040c-rear-${side}`,'hullRubber',box(.52,.33,.025),side*1.315,.73,-3.17,.13);
    P.addEquipment('hullDetail',box(.37,.16,.26),side*1.19,1.31,3.12);
    for(const dx of [-.10,.10])P.addEquipment('hullGlass',markVehicleNightLens(cylZ(.045,.018,12), 'headlight'),side*1.19+dx,1.32,3.26);
    // 2026-10-19 (owner float sweep): rear roof hatches stood 8 mm above the deck; seated.
    // (release 240: the aft pair 14 cm aft, on the cell past the sweep of the turret's front; the forward pair on the
    // lowered roof ahead of the cell)
    P.addHatch('hull',box(.99,.033,.50),side*.77,1.9555,-2.76);
    P.addHatch('hull',box(.99,.033,.50),side*.77,1.752,-2.02);
    for(const z of [-3.12,.75,2.62])KIT.liftEye(P,'hullDetail',side*1.25,z>2?1.43:z>0?1.78:1.96,z);
  }
  // Driver at the left front, engine and cooling package to the right.
  P.addHatch('hull',box(.62,.052,.71),-.79,1.78,1.11);
  for(const x of [-.99,-.79,-.59])KIT.periscope(P,'hullDetail',x,1.835,1.41);
  P.addHatch('hull',box(1.20,.03,1.58),.66,1.588,1.94,.23);
  deckGrille(P,1.10,1.754,.80,.55,.90);
  for(let i=0;i<8;i++)P.addEquipment('hullDark',box(.014,.18,.61),1.65,1.46,-.10+i*.075);
  P.addEquipment('hullDark',box(1.30,1.20,.03),.06,1.27,-3.33);
  P.addHatch('hull',box(1.21,1.12,.065),.06,1.27,-3.367);
  for(const x of [-.49,.61])P.addEquipment('hullDetail',cylX(.047,.16,12),x,.72,-3.41);
  P.addEquipment('hullDetail',box(.16,.028,.038),.44,1.37,-3.415);
  for(const side of [-1,1]) {
    P.addEquipment('hullDetail',box(.38,.32,.20),side*1.20,1.55,-3.33);
    P.addEquipment('hullGlass',box(.22,.08,.018),side*1.20,1.65,-3.44);
  }
  KIT.towCable(P,[[-.80,1.22,3.33],[-.37,1.01,3.39],[.39,1.01,3.39],[.81,1.22,3.33]]);
}

function gear(P: TankBuilderPort): void {
  P.gear=KIT.buildRunningGear(P,{
    trackShoeBuilder:buildFleetTrackShoe,style:'rubber',trackPattern:'compact-ifv',
    wheelR:.325,wheelW:.35,wheelY:.403,wheelZs:[-2.24,-1.41,-.58,.25,1.08,1.91],
    xc:1.32,trackW:.50,trackTh:.025,
    sprocket:{z:2.74,y:.81,r:.29,trackR:.31,toothTipRadiusM:.332},
    idler:{z:-2.83,y:.77,r:.272,trackR:.283},
    rollers:[{z:-1.86,y:.96,r:.09},{z:-.14,y:.96,r:.09},{z:1.60,y:.96,r:.09}],
    topY:1.105,botY:.044,coveredTop:true,paintedEnds:true,arms:true,fitLoadedRun:true,dedupeLoopPoints:true,
  });
}

function turret(P: TankBuilderPort): void {
  const [,py,pz]=P.spec.armor.turretPivot;
  P.add('turret',cylY(.83,.87,.065,P.q?40:20),0,.015,0);
  // Two-man Bofors turret: tall flat crew roof, clipped bustle and nearly
  // vertical upper flanks. The lower front returns remain steeply raked.
  P.add('turret',armorLoft([
    [-2.03,.75,.84,.77,1.94,2.42,2.55],
    [-1.57,.93,1.05,.96,1.78,2.39,2.56],
    [-.02,.95,1.10,.97,1.78,2.40,2.56],
    [.32,.75,.91,.73,1.83,2.34,2.54],
  ],py,pz));
  // Fixed trunnion ears bridge the crew shell to the rocking shield's axis.
  // Keep the throat between them open so the shield can elevate freely.
  for(const side of [-1,1]) {
    P.add('turret',box(.09,.42,.66),side*.285,.405,1.30);
    P.add('turret',cylX(.09,.105,16),side*.285,.405,1.56);
  }
  for(const side of [-1,1]) {
    // Broad separate appliqué packets frame an actual open gun throat.
    P.addExternalArmor('turret',convexSlab(
      [side*.29,.02,1.26],[side*1.18,.02,.56],[side*1.11,.73,.25],[side*.29,.73,.85],
      [side*.29,.03,.93],[side*1.02,.03,.34],[side*.99,.73,.12],[side*.29,.73,.64],
    ));
    turretEquipment(P,'turretDetail',box(.17,.51,1.21),side*1.10,2.18,-.87);
    // 2026-10-19 (owner float sweep): the front lug sat 75 mm past the stowage box's nose; moved onto the box.
    for(const z of [-1.30,-.72,-.30])turretEquipment(P,'turretDetail',box(.019,.035,.08),side*1.195,2.37,z);
    // Three Galix tubes per side, canted outwards; never offensive launchers.
    for(let i=0;i<3;i++) {
      turretEquipment(P,'turretDetail',markSmokeTube(cylZ(.050,.20,12)),side*(.81+i*.11),2.56,-.25-i*.12,-.63,side*.40);
      turretEquipment(P,'turretDark',cylZ(.039,.012,12),side*(.85+i*.11),2.62,-.17-i*.12,-.63,side*.40);
    }
  }
  P.addCupola('turret',cylY(.29,.32,.09,20),.45,.81,-.18);
  P.addHatch('turret',cylY(.255,.27,.033,20),.45,.865,-.18);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;KIT.periscope(P,'turretDetail',.45+Math.cos(a)*.29,.875,-.18+Math.sin(a)*.29,a);}
  P.addHatch('turret',box(.59,.033,.62),-.45,.80,-.32);
  optic(P,-.46,2.77,.02,.39,.35,.34);
  optic(P,.46,2.668,-.36,.31,.22,.24); // 2026-10-19 (owner float sweep): stood 80 mm above the roof; seated
  turretEquipment(P,'turretDetail',box(1.45,.42,.31),0,2.26,-2.00);
  for(const x of [-.59,.59])antenna(P,x,2.55,4.17,-1.74);
  for(const x of [-.75,.75])KIT.liftEye(P,'turretDetail',x,.82,-.84);
}

function gun(P: TankBuilderPort): void {
  // A clipped rocking armor mask fills the throat between the fixed ears.
  // The inclined upper/lower returns and narrow side bevels form real stock,
  // with a transverse bearing at the rotation axis rather than a bare cube.
  const mask = sectionSolid([
    {z:-.30,ring:[[-.195,-.245],[.195,-.245],[.265,-.175],[.265,.175],[.195,.245],[-.195,.245],[-.265,.175],[-.265,-.175]]},
    {z:.405,ring:[[-.17,-.205],[.17,-.205],[.225,-.15],[.225,.15],[.17,.205],[-.17,.205],[-.225,.15],[-.225,-.15]]},
  ]);
  mask.userData.cv9040GunRole = 'beveled-rocking-mantlet';
  P.addGunExtra(mask);
  P.addGunExtra(cylX(.14,.65,P.q?24:16),0,0,0);
  P.addGunExtra(cylZ(.12,.29,20),0,0,.52);
  for (const side of [-1,1]) for (const y of [-.125,.125])
    P.addGunExtraDark(cylZ(.014,.012,8),side*.177,y,.412);
  P.add('gun',cylZ(.070,1.22,P.q?24:12),0,0,1.23);
  P.add('gun',cylZ(.052,.64,P.q?24:12),0,0,2.15);
  openTube(P,.067,2.43,2.75,.020);
  P.addGunExtraDark(cylZ(.022,.62,12),-.325,-.06,.39);
  P.addGunExtraDark(new THREE.CircleGeometry(.010,12),-.325,-.06,.701); // 2026-10-19 (owner float sweep): 8 mm off the tube end
}

/** The Ukrainian CV9040C's service kit (release 265, the owner's photograph of a 21st Mechanized Brigade CV90, 2024): the
 *  white tactical triangle on each flank under the turret's rear, and a dusty maroon tarpaulin draped over the load on the
 *  troop roof, from its rear edge over the step down to the turret, its edges hanging over the sides and the rear,
 *  strapped down; the net over its turret is its ghillie suit.
 *  (ua2, the ua1 critics, both, on the photograph: the tarp read as an orange crate with posts through it, short of the
 *  turret; the triangle sat forward, small and hairline.) */
function addUkrainianKit(P: TankBuilderPort): void {
  for(const side of [-1,1])P.decal('hull','flag','ua-triangle',.72,[side*1.648,1.38,-.70],side*Math.PI/2);
  // the troop roof is raised to 1.94 from its rear edge (z -3.32) to -2.45, then steps down to the turret deck at 1.76
  // (ua3, the ua2 critics, both: a stiff faceted cushion; lumps, its edges down over the rear plate and the rear corners,
  // crossing cords, a duller grey-brown; its front tucked in, where a corner stood out as a beak)
  const RING: readonly [number, number, number][] = [ // x, height over the base, the lump's weight
    [1.50, -.05, 0], [1.46, .10, .04], [1.20, .27, .06], [.78, .33, -.05], [.30, .38, .06], [-.18, .30, -.06],
    [-.62, .39, .05], [-1.10, .26, -.05], [-1.46, .11, .04], [-1.50, -.05, 0], [0, -.03, 0],
  ];
  const drape=(z: number, base: number, k: number, s=1, w=1): {z: number; ring: [number, number][]}=>({z,
    ring:RING.map(([x,h,wt])=>[x*w,base+(h>0?(h+wt*k)*s:h)] as [number, number])});
  const stations=[drape(-3.34,1.94,0),drape(-3.22,1.94,1),drape(-3.07,1.94,-1),drape(-2.92,1.94,.8),
    drape(-2.77,1.94,-.7),drape(-2.62,1.94,1),drape(-2.47,1.94,-.6),drape(-2.30,1.77,.4,1.05,.94),drape(-2.12,1.77,0,.54,.88)];
  P.addEquipment('hullCanvasPale',sectionSolid(stations));
  // its edge sloping down over the roof's rear edge and clear of the rear door below it
  P.addEquipment('hullCanvasPale',box(2.90,.17,.02),0,1.86,-3.37,.52,0,0);
  // crossing cords, laid over it station to station
  const RIDGE=[1,2,3,4,5,6,7,8];
  for(const dir of [1,-1]) for(let i=1;i+1<stations.length-1;i++) {
    const j=dir>0?RIDGE[i-1]:RIDGE[RIDGE.length-i];
    const k=dir>0?RIDGE[i]:RIDGE[RIDGE.length-i-1];
    if(j===undefined||k===undefined)continue;
    const [x0,y0]=stations[i].ring[j],[x1,y1]=stations[i+1].ring[k],z0=stations[i].z,z1=stations[i+1].z;
    const len=Math.hypot(x1-x0,y1-y0,z1-z0);
    const cord=box(.02,.012,len);
    cord.lookAt(new THREE.Vector3(x1-x0,y1-y0,z1-z0));
    P.addEquipment('hullCloth',cord,(x0+x1)/2,(y0+y1)/2+.014,(z0+z1)/2);
  }
  P.mats.canvasPale.color.setHex(0x4c3f3a);
}

/** The CV9040C (release 265: `ukrainian` builds the Ukrainian one, ukraineCv90Specs.ts). */
export function buildCv9040CX(P: TankBuilderPort, kit: { readonly ukrainian?: boolean } = {}): void {
  hull(P);gear(P);turret(P);gun(P);P.topY=1.03;
  if(kit.ukrainian)addUkrainianKit(P);
  P.additionalShadowSources={hull:['hullExternalArmor','hullHatch'],turret:['turretExternalArmor','turretHatch']};
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts)
  addVehicleGhillieSuit(P);
}
