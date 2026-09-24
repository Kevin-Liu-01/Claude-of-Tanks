// Owner-directed ancestor of the current Revolution, not a historical replica.
// The original chassis remains in leopard.ts; this owns the complete new turret.
import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import { cappedSmokeLauncherGeometry } from '../smokeLauncherGeometry.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { REVOLUTION_PROTO_FRAME as FRAME } from './leopardRevolutionPrototypeFrame.ts';

const { box, cylX, cylY, cylZ, polyMultiLoft } = KIT;
const ROOF = 0.67;

function addPrototypeArmor(P: TankBuilderPort): void {
  // A compact welded Leopard box precedes the production vehicle's broader,
  // longer AMAP envelope. Separate closed cheeks leave real mechanical air.
  P.add('turret', polyMultiLoft([
    [-1.38, 0.90], [1.38, 0.90], [1.48, 0.48], [1.48, -1.46],
    [1.17, -2.08], [-1.17, -2.08], [-1.48, -1.46], [-1.48, 0.48],
  ], [
    { height: 0.08, inset: 0.91 },
    { height: 0.25, inset: 1 },
    { height: ROOF, inset: 0.92, centerHeight: ROOF },
  ]));
  P.add('turret', cylY(1.04, 1.04, 0.12, P.q ? 40 : 24), 0, 0.04, 0);

  for (const side of [-1, 1]) {
    const inner = side > 0 ? 0.91 : 0.43;
    P.add('turret', orientedSlab(
      [side * inner, .08, .72], [side * 1.56, .08, .72],
      [side * 1.16, .17, 1.68], [side * inner, .17, 1.68],
      [side * inner, .65, .72], [side * 1.37, .65, .72],
      [side * 1.16, .52, 1.68], [side * inner, .52, 1.68],
    ));
    // Early bolt-on side armor: two discrete modules, with the underlying
    // welded wall exposed at the joints instead of an empty black seam.
    for (const z of [-.12, -.92]) {
      P.add('turret', orientedSlab(
        [side * 1.42,.23,z+.35],[side * 1.55,.23,z+.35],
        [side * 1.55,.23,z-.35],[side * 1.42,.23,z-.35],
        [side * 1.33,.61,z+.35],[side * 1.46,.61,z+.35],
        [side * 1.46,.61,z-.35],[side * 1.33,.61,z-.35],
      ));
      for (const dz of [-.23,.23]) {
        P.addEquipment('turretDark', cylX(.017,.027,8), side * 1.518,.39,z+dz);
      }
    }
  }
  // The right optical recess previews the production Revolution's larger
  // EMES opening. Its inner pier also supports the elevation trunnion.
  P.add('turret', orientedSlab(
    [.43,.08,.72],[.56,.08,.72],[.56,.17,1.68],[.43,.17,1.68],
    [.43,.65,.72],[.56,.65,.72],[.56,.52,1.68],[.43,.52,1.68],
  ));
  P.add('turret', orientedSlab(
    [.55,.09,.73],[.93,.09,.73],[.93,.17,1.68],[.55,.17,1.68],
    [.55,.21,.73],[.93,.21,.73],[.93,.23,1.68],[.55,.23,1.68],
  ));
  P.addEquipment('turretDark', box(.34,.31,.12), .735,.445,.90);
  P.addEquipment('turretGlass', box(.275,.24,.012), .735,.455,.966);
  P.addEquipment('turretDetail', box(.39,.035,.18), .735,.615,.91);
}

function addPrototypeRoof(P: TankBuilderPort): void {
  const segments = P.q ? 24 : 16;
  for (const x of [-.55,.55]) {
    P.addEquipment('turretDark', cylY(.30,.30,.032,segments), x,ROOF+.009,-.13);
    P.addHatch('turret', cylY(.275,.275,.035,segments), x,ROOF+.035,-.13);
    P.addEquipment('turretDetail', box(.12,.035,.045), x,ROOF+.066,-.13);
    for (const dx of [-.17,.17]) {
      P.addEquipment('turretDetail', cylX(.03,.075,10), x+dx,ROOF+.035,-.39);
    }
    for (const dx of [-.19,0,.19]) {
      P.addEquipment('turretDark', box(.105,.062,.075), x+dx,ROOF+.04,.13);
      P.addEquipment('turretGlass', box(.077,.027,.008), x+dx,ROOF+.047,.17);
    }
  }
  // First-generation panoramic head on a short, physically seated pedestal.
  P.addEquipment('turretDetail', cylY(.15,.19,.075,segments), -.38,ROOF+.035,-.94);
  P.addEquipment('turretDetail', box(.34,.225,.31), -.38,ROOF+.185,-.94);
  P.addEquipment('turretDark', box(.28,.17,.018), -.38,ROOF+.195,-.778);
  P.addEquipment('turretGlass', box(.215,.115,.01), -.38,ROOF+.20,-.763);
  P.addEquipment('turretDetail', box(.38,.025,.35), -.38,ROOF+.31,-.94);

  // A compact manual MG precedes the production remote weapon station.
  P.addEquipment('turretDetail', box(.22,.055,.22), .77,ROOF+.025,-.48);
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'dark',
    scale: .72, seed: 230923, elev: .03, ammo: true, shield: false, ring: false });
  mg.name = 'revolutionPrototypeMachineGun';
  mg.position.set(.77,ROOF+.05,-.48);
  P.turretG.add(mg);

  // Short, closed electronics bins and an attached rear rack retain the
  // production bustle's horizontal lines without its full equipment suite.
  for (const x of [-.52,.52]) {
    P.addEquipment('turretDetail', box(.79,.14,.49), x,ROOF+.064,-1.60);
    P.addEquipment('turretDetail', box(.83,.025,.53), x,ROOF+.145,-1.60);
    P.addEquipment('turretDark', box(.11,.046,.022), x,ROOF+.09,-1.34);
    P.addEquipment('turretDetail', box(.03,.18,.03), x*1.85,ROOF+.08,-1.82);
    // The aft leg reaches the descending bustle armor, while both leg tops
    // meet the same rail. A roof-height foot would hang above that slope.
    P.addEquipment('turretDetail', box(.03,.46,.03), x*1.85,ROOF-.06,-2.01);
    P.addEquipment('turretDetail', box(.03,.03,.26), x*1.85,ROOF+.175,-1.92);
  }
  P.addEquipment('turretDetail', box(1.96,.03,.03), 0,ROOF+.175,-2.01);
  for (const side of [-1,1]) {
    // Only one four-tube smoke bank per side on the early kit.
    P.addEquipment('turretDetail', box(.16,.09,.44), side*1.43,.59,-.05);
    for (let i=0;i<4;i++) {
      const launcher=cappedSmokeLauncherGeometry(.034,.16,.022,.011,P.q?10:8);
      P.addEquipment('turretDetail',launcher.body,side*1.48,.685,.10-i*.10,-.42,side*.65);
      P.addEquipment('turretDark',launcher.cap,side*1.48,.685,.10-i*.10,-.42,side*.65);
    }
    P.addEquipment('turretDetail',cylY(.045,.065,.09,12),side*1.03,ROOF+.037,-1.27);
    P.addEquipment('turretDark',cylY(.006,.013,1.02,P.q?8:6),side*1.03,ROOF+.59,-1.27);
  }
}

function addPrototypeGun(P: TankBuilderPort): void {
  P.gunG.position.set(...FRAME.gunPivot);
  P.addGunExtraDark(cylX(.165,.94,P.q?24:16),0,0,0);
  P.addGunExtra(orientedSlab(
    [-.36,-.19,-.16],[.36,-.19,-.16],[.245,-.14,.46],[-.245,-.14,.46],
    [-.34,.29,-.16],[.34,.29,-.16],[.24,.22,.46],[-.24,.22,.46],
  ));
  P.addGunExtraDark(box(.58,.038,.38),0,-.183,.03);
  P.addGunExtra(cylZ(.18,.28,P.q?24:16),0,0,.49);
  // Keep the original ammunition, gun datum and L/44 muzzle station.
  KIT.buildGun(P,{len:FRAME.barrelLengthM,r:FRAME.barrelRadiusM,baseR:.13,sleeve:true,evac:.51,evacR:1.70,collar:true});
  P.muzzleZ=FRAME.barrelLengthM;
}

export function buildLeopardRevolutionPrototypeTurret(P: TankBuilderPort): void {
  P.turretG.position.set(...FRAME.turretPivot);
  addPrototypeArmor(P);
  addPrototypeRoof(P);
  addPrototypeGun(P);
  P.turretG.userData.revolutionPrototypeDesign = {
    revision: 'revolution-ancestor-20260923',
    ancestorOf: 'leo2_revolution',
    intent: 'compact-welded-core-early-modular-cheeks-manual-roof-gun',
    fixedCheekInnerXM: .43, fixedRearWallZM: .90,
  };
  P.topY=1.9;
}
