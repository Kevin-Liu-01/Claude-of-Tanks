// Kevin B. Liu — first-party M6 modernization alongside the retained M3A3.
import * as THREE from 'three';
import {buildBradley, bradleyFlankDressing} from '../modern3.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {KIT, FITTINGS} from './kit.ts';
import {mount} from './fittingMount.ts';
import {armorLoft, sideWall, openTube, smokeBank, antenna} from './europeSourcePrimitives.ts';
import {linebackerOptics} from './m6LinebackerOptics.ts';
import {sectionSolid} from './sectionSolid.ts';
import {mirrorX} from '../runningGearPrimitives.ts';
import {weaponAssembly} from './weaponStock.ts';
import {markVehicleNightLens} from '../vehicleNightLighting.ts';
import {LINEBACKER_TURRET_SCALE as T, LINEBACKER_RING, LINEBACKER_MUZZLE, LINEBACKER_LAUNCHER as L,
  LINEBACKER_MOUTHS, LINEBACKER_SKIRT_STATIONS, LINEBACKER_SKIRT_INNER, LINEBACKER_SKIRT_OUTER} from '../m6LinebackerLayout.ts';
const {box, cylX, cylY, cylZ} = KIT;

function removeDonorTurret(P: TankBuilderPort): void {
  P.clear('turret','turretDark','turretDetail','turretEquipment','turretGlass','turretCloth',
    'turretExternalArmor','turretCupola','turretHatch','turretRubber','turretShadow',
    'gun','gunDark','gunMount','gunMountDark','gunMountCanvasSkin');
  P.clearDecals('turret');
  for (const child of [...P.turretG.children]) if (child !== P.gunG) P.turretG.remove(child);
  for (const child of [...P.gunG.children]) if (child !== P.recoilG) P.gunG.remove(child);
  for (const child of [...P.recoilG.children]) if (!child.name.startsWith('rig_barrel_')) P.recoilG.remove(child);
  delete P.turretG.userData.bradleyA2TurretClosureReceipt;
}

function flankKit(P: TankBuilderPort): void {
  bradleyFlankDressing(P);
  for (const side of [-1,1]) {
    sideWall(P,side,LINEBACKER_SKIRT_INNER,LINEBACKER_SKIRT_OUTER,LINEBACKER_SKIRT_STATIONS);
    // Continuous folded shoulder bridges the native fender and the armor carrier.
    P.addExternalArmor('hull',box(.33,.07,4.45),side*1.785,1.755,-.49);
    for (let bay=0;bay<6;bay++) {
      const z=-2.27+bay*.73;
      P.addExternalArmor('hull',box(.075,.54,.69),side*1.968,1.365,z);
      P.addEquipment('hullDark',box(.016,.045,.59),side*2.009,1.165,z);
      for (const dz of [-.24,.24]) {
        P.addEquipment('hullDetail',cylX(.022,.028,10),side*2.015,1.57,z+dz);
        P.addEquipment('hullDetail',box(.19,.055,.055),side*1.994,1.06,z+dz);
      }
    }
    // Rear half only: genuine open slats, with finite brackets meeting the carrier.
    const cageX=2.055;
    for (const z of [-2.64,-1.84,-1.04]) {
      P.addEquipment('hullDetail',box(.20,.055,.065),side*1.98,1.59,z);
      P.addEquipment('hullDetail',box(.035,.71,.035),side*cageX,1.255,z);
    }
    for (let row=0;row<6;row++) P.addEquipment('hullDetail',box(.035,.027,1.64),side*cageX,.915+row*.135,-1.84);
    // Hinge rail and short rear return around the last armor bay.
    P.addEquipment('hullDetail',box(.29,.055,.055),side*1.92,1.68,-2.66);
    for (let row=0;row<5;row++) P.addEquipment('hullDetail',box(.32,.027,.035),side*1.91,1.04+row*.135,-2.66);
    // Clamped pioneer kit and storage cases on the rear shoulders.
    P.addEquipment('hullDetail',box(.26,.24,.78),side*1.42,1.97,-2.12);
    for (const z of [-2.39,-1.85]) P.addEquipment('hullDark',box(.28,.026,.045),side*1.42,2.10,z);
    P.addEquipment('hullDetail',cylZ(.018,1.06,8),side*1.33,2.025,-2.10);
  }
}

function turretBody(P: TankBuilderPort): void {
  P.add('turret',cylY(.82,.90,.11,40),0,.015,0);
  // Welded rear compartment and clipped bustle; its roof is a continuous plane.
  P.add('turret',armorLoft([
    [-1.64,.90,1.14,1.02,.17,.52,.84],[-1.08,1.08,1.34,1.16,.06,.51,.91],
    [-.03,1.08,1.34,1.15,.06,.50,.91],
  ]));
  for (const side of [-1,1]) {
    const cheek=sectionSolid([
      {z:-.05,ring:[[.37,.06],[1.08,.06],[1.34,.50],[1.15,.91],[.37,.91]]},
      {z:.58,ring:[[.37,.07],[1.02,.07],[1.24,.46],[1.01,.83],[.37,.83]]},
      {z:1.08,ring:[[.37,.10],[.74,.10],[.90,.38],[.75,.70],[.37,.70]]},
    ]);
    P.add('turret',side<0?mirrorX(cheek):cheek);
    P.add('turret',cylX(.19,.13,24),side*.38,.48,.90);
    // Faceted applique follows the broader shoulders, with a cut back nose
    // outside the moving mask and the launcher's elevation envelope.
    const applique=sectionSolid([
      {z:.16,ring:[[1.12,.22],[1.365,.31],[1.39,.49],[1.28,.77],[1.12,.77]]},
      {z:.82,ring:[[.85,.21],[1.09,.27],[1.135,.42],[1.00,.65],[.87,.65]]},
    ]);
    P.addExternalArmor('turret',side<0?mirrorX(applique):applique);
    for (const z of [-1.05,-.68,-.31]) P.addEquipment('turretDetail',cylX(.022,.035,10),side*1.343,.49,z);
  }
  P.add('turret',box(.76,.08,1.12),0,.10,.51);
  // Armored mask fills the split cheek bay. The barrel alone recoils.
  P.addGunExtra(armorLoft([
    [-.31,.28,.355,.30,-.26,-.015,.27], [.20,.24,.31,.26,-.22,-.01,.23],
  ]));
  P.add('gunMountCanvasSkin',box(.62,.43,.14),0,-.01,-.25);
  P.addGunExtra(cylZ(.145,.39,24),0,0,.30);
  P.add('gun',cylZ(.092,.35,24),0,0,.44);
  openTube(P,.039,.49,LINEBACKER_MUZZLE,.0125 / T);
  P.add('gun',cylZ(.051,.13,24),0,0,2.05);
  P.addGunExtraDark(cylZ(.017,.31,12),.255,-.09,.34);
}

function launcher(P: TankBuilderPort): void {
  weaponAssembly(P,()=>{
    // Two connected trunnion arms hold the pitching pod off the left cheek.
    P.addGunExtra(box(1.12,.13,.23),-.77,.04,.03);
    P.addGunExtra(box(.13,.59,.24),-1.29,.28,.03);
    P.addGunExtra(cylX(.14,.20,24),-1.32,L.y,.03);
    const depth=L.front-L.rear,s=L.scale;
    for (const dx of [-.32,.32]) P.addGunExtra(box(.05*s,.69*s,depth),L.x+dx*s,L.y,(L.front+L.rear)/2);
    for (const dy of [-.32,.32]) P.addGunExtra(box(.69*s,.05*s,depth),L.x,L.y+dy*s,(L.front+L.rear)/2);
    P.addGunExtra(box(.69*s,.69*s,.055*s),L.x,L.y,L.rear);
    for (const z of [L.rear+.23*s,L.front-.31*s]) {
      P.addGunExtra(box(.72*s,.055*s,.09*s),L.x,L.y+.36*s,z);
      P.addGunExtra(box(.72*s,.055*s,.09*s),L.x,L.y-.36*s,z);
    }
    for (const mouth of LINEBACKER_MOUTHS) {
      const tube=new THREE.CylinderGeometry(L.radius,L.radius,depth,24,1,true);
      tube.rotateX(Math.PI/2);
      P.addGunExtra(tube,mouth.x,mouth.y,(L.front+L.rear)/2);
      const lip=new THREE.RingGeometry(.093*s,.129*s,24);
      P.addGunExtra(lip,mouth.x,mouth.y,L.front);
      const bore=new THREE.CylinderGeometry(.093*s,.093*s,.20,24,1,true);
      bore.rotateX(Math.PI/2);
      const indices=bore.index!;
      for(let i=0;i<indices.count;i+=3){const b=indices.getX(i+1);indices.setX(i+1,indices.getX(i+2));indices.setX(i+2,b);}
      bore.computeVertexNormals();
      P.addGunExtraDark(bore,mouth.x,mouth.y,L.front-.10);
      P.addGunExtraDark(new THREE.CircleGeometry(.093*s,24),mouth.x,mouth.y,L.front-.20);
    }
  },'missileRack',16);
}

function roofKit(P: TankBuilderPort): void {
  const [px,py,pz]=LINEBACKER_RING;
  P.addCupola('turret',cylY(.30,.34,.15,32),-.40,.96,-.63);
  P.addHatch('turret',cylY(.285,.30,.045,32),-.40,1.057,-.63);
  for (const dx of [-.22,0,.22]) KIT.periscope(P,'turretDetail',-.40+dx,1.05,-.31);
  linebackerOptics(P);
  // Remote M2: the stock fitting supplies articulated yaw/pitch and a real muzzle.
  P.addEquipment('turretDetail',box(.46,.08,.44),.36,.95,-1.03);
  P.addEquipment('turretDetail',cylY(.13,.19,.15,24),.36,1.06,-1.03);
  mount(P,'turret',FITTINGS.pintleMG({mats:P.mats,cls:'m2',tone:'two-tone',scale:.80,
    elev:.10,shield:true,ammo:true,ring:{r:.16,stubs:3},seed:601,remoteControlled:true}),.36,1.125,-1.03);
  for (const side of [-1,1]) {
    // Paired gun-adjacent lights, guards and positive mounts on the cheek roof.
    P.addEquipment('turretDetail',box(.23,.14,.27),side*.81,.75,.71);
    P.addEquipment('turretDetail',cylZ(.075,.16,20),side*.81,.83,.81);
    P.addEquipment('turretGlass',markVehicleNightLens(cylZ(.06,.014,20),'headlight'),side*.81,.83,.897);
    for (const dx of [-.10,.10]) P.addEquipment('turretDetail',box(.022,.17,.28),side*.81+dx,.83,.76);
    P.addEquipment('turretDetail',box(.22,.025,.28),side*.81,.915,.76);
    smokeBank(P,side,1.49,py+.54,pz-.60,4);
    antenna(P,px+side*1.06,py+.86,3.75,pz-1.23);
    KIT.liftEye(P,'turretDetail',side*1.01,.93,-.90);
  }
  // Rear equipment cabinet, open supported basket, strapped roll and service vents.
  P.addEquipment('turretDetail',box(2.02,.34,.30),0,.52,-1.66);
  P.addEquipment('turretDetail',box(2.42,.05,.58),0,.38,-1.80);
  for (const x of [-1.18,-.59,0,.59,1.18]) P.addEquipment('turretDetail',box(.035,.43,.035),x,.60,-2.06);
  for (const y of [.43,.61,.79]) P.addEquipment('turretDetail',box(2.40,.026,.035),0,y,-2.06);
  for (const x of [-1.18,1.18]) {
    P.addEquipment('turretDetail',box(.035,.035,.58),x,.79,-1.80);
    P.addEquipment('turretDetail',box(.035,.42,.035),x,.60,-1.51);
  }
  P.addEquipment('turretCloth',cylX(.15,1.08,16),0,.56,-1.84);
  for (const x of [-.35,.35]) P.addEquipment('turretDark',box(.045,.30,.32),x,.56,-1.84);
  for (let i=0;i<8;i++) P.addEquipment('turretDark',box(.042,.14,.016),-.27+i*.077,.57,-1.818);
}

function turretFieldKit(P: TankBuilderPort): void {
  for(const side of [-1,1]){
    // Bradley-style layered flank cassettes. Their inner polygon intersects
    // the actual sloped shell; the outer knee carries bolts and smoke banks.
    for(const z of [-.96,-.57,-.18]){
      const ring: [number,number][]=[[1.20,.28],[1.40,.28],[1.48,.50],[1.35,.77],[1.17,.77]];
      const cassette=sectionSolid([{z:z-.175,ring},{z:z+.175,ring}]);
      P.addExternalArmor('turret',side<0?mirrorX(cassette):cassette);
      for(const dz of [-.115,.115])P.addEquipment('turretDetail',cylX(.024,.028,10),side*1.483,.50,z+dz);
      P.addEquipment('turretDetail',box(.025,.035,.24),side*1.366,.744,z);
    }
    // Broad rear shoulder bins, lid lips, latches and clamped tools.
    P.addEquipment('turretDetail',box(.42,.36,.46),side*1.13,.79,-1.20);
    P.addEquipment('turretDetail',box(.45,.028,.49),side*1.13,.978,-1.20);
    for(const dz of [-.14,.14])P.addEquipment('turretDark',box(.03,.085,.047),side*1.347,.835,-1.20+dz);
    P.addEquipment('turretDark',cylZ(.018,.74,10),side*.99,1.013,-1.15);
    for(const z of [-1.43,-.87])P.addEquipment('turretDetail',box(.10,.045,.045),side*.99,1.01,z);
    // Open cages wrap the rear shoulders, on brackets rooted in the shell.
    for(const z of [-1.36,-.91]){
      P.addEquipment('turretDetail',box(.39,.05,.06),side*1.37,.51,z);
      P.addEquipment('turretDetail',box(.032,.39,.032),side*1.56,.69,z);
    }
    for(const y of [.51,.68,.87])P.addEquipment('turretDetail',box(.032,.026,.72),side*1.56,y,-1.16);
  }
  // Separate left hatch surround and its armored vision blocks fill the
  // widened roof without crossing the elevating gun or launcher.
  for(const x of [-.84,-.12]){
    P.addEquipment('turretDetail',box(.075,.23,.64),x,1.02,-.64);
    KIT.periscope(P,'turretDetail',x,1.168,-.40);
  }
  P.addEquipment('turretDetail',box(.76,.23,.075),-.48,1.02,-.96);
  P.addEquipment('turretDetail',box(.46,.035,.37),.15,.934,-.38);
  P.addEquipment('turretDark',box(.26,.012,.032),.15,.957,-.24);
  // Filled bustle rack: canvas packs, fuel/water can and a spare equipment case.
  for(const x of [-.91,1.00]){
    P.addEquipment('turretCloth',box(.30,.34,.34),x,.575,-1.84);
    P.addEquipment('turretDark',box(.045,.35,.35),x,.575,-1.84);
  }
  P.addEquipment('turretFittingPaint',box(.21,.45,.22),.70,.63,-1.85);
  P.addEquipment('turretDetail',box(.13,.035,.14),.70,.87,-1.85);
  P.addEquipment('turretDetail',box(.40,.20,.42),-.57,.965,-1.30);
  for(const x of [-.71,-.43])P.addEquipment('turretDark',box(.028,.205,.43),x,.965,-1.30);
}

export function buildM6Linebacker(P: TankBuilderPort): void {
  buildBradley(P);
  removeDonorTurret(P);
  flankKit(P);
  turretBody(P);
  launcher(P);
  roofKit(P);
  turretFieldKit(P);
  P.turretG.userData.linebackerLauncher = {launcherTubes:4};
  // Bake all turret-owned stock about the unchanged ring. The spec already
  // places the gun pivot at 90%; fittings are separate scene objects and must
  // scale with their seats. Hull skirts, tracks and fenders are untouched.
  P.scaleBuckets(['turret','turretDark','turretDetail','turretEquipment',
    'turretGlass','turretCloth','turretExternalArmor','turretCupola',
    'turretHatch','turretRubber','turretFittingPaint','turretShadow',
    'gun','gunDark','gunMount','gunMountDark','gunMountCanvasSkin'],T,T,T);
  for (const child of P.turretG.children) if (child !== P.gunG) {
    child.position.multiplyScalar(T);
    child.scale.multiplyScalar(T);
  }
  P.muzzleZ *= T;
  P.physicalMuzzleBore = {outerRadiusM:.039*T,innerRadiusM:.0125,depthM:.20*T};
  P.topY = .95 * T;
  P.additionalShadowSources = {hull:['hullExternalArmor'],turret:['turretExternalArmor','turretCupola','turretHatch']};
}
