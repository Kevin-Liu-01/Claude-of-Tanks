// Explicit first-party C2 modernization of the enlarged supplied C1. The
// original hull/turret solids survive; these named upgrades are not a second
// tank laid over a donor. Detail dimensions are game authoring, not metrology.
import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { buildArieteXSupplied } from './arieteXSupplied.ts';
import { ARIETE_SUPPLIED_X_DATUMS as SOURCE, arieteSourceTurret as add } from './arieteXSuppliedFrame.ts';
import { ARIETE_C2_X_DATUMS as D, ARIETE_X_FAMILY_SCALE as S } from './arieteXFamilyFrame.ts';
import { ARIETE_C2_ARMOR_STOCKS } from './arieteC2XArmor.ts';
import { enlargeArieteXFamily } from './arieteXFamilyScale.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylY, cylZ } = KIT;

function optic(P: TankBuilderPort, g: THREE.BufferGeometry, x: number, y: number, z: number): void {
  P.addModuleVisual('optics', 'turretGlass', g, x - SOURCE.turretPivot[0],
    y - SOURCE.turretPivot[1], z - SOURCE.turretPivot[2]);
}

function gunnerSight(P: TankBuilderPort): void {
  const x = -.674;
  add(P, 'turretDetail', box(.596, .028, .375), x, 1.891, .735);
  add(P, 'turretDetail', box(.596, .266, .024), x, 2.014, .559);
  for (const side of [-1, 1]) add(P, 'turretDetail', box(.022, .288, .375),
    x + side * .287, 2.029, .735);
  add(P, 'turretDetail', box(.596, .026, .397), x, 2.180, .746);
  add(P, 'turretDark', box(.547, .219, .019), x, 2.022, .590);
  for (const side of [-1, 1]) optic(P, box(.222, .163, .008), x + side * .133, 2.019, .604);
  add(P, 'turretDetail', box(.028, .229, .04), x, 2.023, .612);
  // Protective side shutters fold outside the actual recessed twin windows.
  for (const side of [-1, 1]) add(P, 'turretDetail', box(.014, .202, .199),
    x + side * .313, 2.032, .780, 0, side * .16);
}

function panoramicSight(P: TankBuilderPort): void {
  // Rounded Attila-D-inspired head with a real front window and open guard.
  const x = .790, z = .430, n = P.q ? 24 : 12;
  add(P, 'turretDetail', cylY(.139, .158, .076, n), x, 2.061, z);
  add(P, 'turretDetail', cylY(.089, .100, .182, n), x, 2.172, z);
  add(P, 'turretDetail', cylY(.163, .163, .280, n), x, 2.367, z);
  add(P, 'turretDetail', cylY(.130, .180, .045, 8), x, 2.530, z);
  add(P, 'turretDetail', cylY(.180, .180, .027, n), x, 2.214, z);
  add(P, 'turretDetail', box(.280, .228, .035), x, 2.367, z + .143);
  add(P, 'turretDark', box(.250, .188, .012), x, 2.367, z + .164);
  optic(P, box(.236, .163, .009), x, 2.367, z + .174);
  for (const y of [2.220, 2.510]) add(P, 'turretDetail', box(.290, .027, .090), x, y, z + .177);
  for (const dx of [-.112, -.040, .040, .112])
    add(P, 'turretDetail', box(.009, .292, .012), x + dx, 2.365, z + .207);
}

function commanderWeapon(P: TankBuilderPort): void {
  const x = .830, z = -.340;
  // This foot embeds into the right roof and meets the fitting's real flange.
  add(P, 'turretDetail', cylY(.055, .071, .100, P.q ? 16 : 10), x, 2.051, z);
  const gun = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'dark',
    scale: .86, ammo: true, shield: 'armored', ring: false, seed: 7202 });
  gun.name = 'arieteC2CommanderM2';
  gun.position.set(x, 2.092 - SOURCE.turretPivot[1], z - SOURCE.turretPivot[2]);
  // The complete receiver/barrel/shield rotates on the same circular foot.
  // This outboard parked angle clears the panoramic head with real air.
  gun.rotation.y = .28;
  P.turretG.add(gun);
}

function coolingDeck(P: TankBuilderPort): void {
  // The manufacturer's overhead view shows one circular fan beside service
  // panels. Keep the source deck and shallow service cap beneath this unit.
  const n = P.q ? 24 : 12, z = -2.430;
  P.addEquipment('hullDetail', box(1.03, .040, 1.055), 0, 1.516, z);
  P.addEquipment('hullDark', cylY(.435, .435, .024, n), 0, 1.546, z);
  P.addEquipment('hullDetail', new THREE.LatheGeometry([
    [.435, 0], [.460, 0], [.460, .044], [.435, .044], [.435, 0]]
    .map(([r, y]) => new THREE.Vector2(r, y)), n), 0, 1.530, z);
  const ribs = P.q ? 13 : 7;
  for (let i = 0; i < ribs; i++) {
    const dx = (i / (ribs - 1) - .5) * .820;
    const length = 2 * Math.sqrt(.435 ** 2 - dx ** 2);
    P.addEquipment('hullDetail', box(.013, .017, length), dx, 1.566, z);
  }
  for (const x of [-.87, .87]) {
    P.addEquipment('hullDetail', box(.530, .030, 1.055), x, 1.506, z);
    for (const dz of [-.475, .475]) P.addEquipment('hullDetail', box(.400, .020, .031), x, 1.529, z + dz);
  }
  P.addEquipment('hullDetail', box(1.360, .025, .236), 0, 1.505, -2.996);
  for (const x of [-.47, .47]) {
    P.addEquipment('hullDark', box(.091, .023, .061), x, 1.529, -2.996);
    P.addEquipment('hullDetail', cylZ(.014, .093, 8), x, 1.542, -2.996);
  }
}

function protection(P: TankBuilderPort): void {
  for (const stock of ARIETE_C2_ARMOR_STOCKS) {
    const geometry = sectionSolid(stock.sections);
    if (stock.owner === 'turret') geometry.translate(-SOURCE.turretPivot[0],
      -SOURCE.turretPivot[1], -SOURCE.turretPivot[2]);
    P.addExternalArmor(stock.owner, geometry);
  }
  for (const side of [-1, 1]) for (const z of [-2.45, -1.72, -1.02, -.55]) {
    P.addEquipment('hullDetail', box(.160, .061, .070), side * 1.506, 1.315, z);
    P.addEquipment('hullDetail', KIT.cylX(.018, .070, 8), side * 1.590, 1.327, z);
  }
  // The new cheek packs overlap the retained C1 permanent cassette faces.
  for (const side of [-1, 1]) for (const z of [.26, .78]) {
    add(P, 'turretDetail', box(.124, .060, .055), side * 1.441, 1.956, z);
    add(P, 'turretDetail', KIT.cylX(.018, .037, 8), side * 1.615, 1.767, z);
  }
}

export function buildArieteC2X(P: TankBuilderPort): void {
  buildArieteXSupplied(P, D.boreRadiusM / S, true);
  gunnerSight(P); panoramicSight(P); commanderWeapon(P); coolingDeck(P); protection(P);
  enlargeArieteXFamily(P);
  P.hullG.userData.arieteC2Derivation = Object.freeze({ base: 'ariete_c1_x',
    originalPrimaryBodyRetained: true, widerTracks: true, returnRollersPerSide: 4,
    roofMachineGuns: ['7.62mm loader GPMG', '12.7mm commander M2'],
    sights: ['Lothar-SD-inspired recessed head', 'Attila-D-inspired panoramic head'],
    protection: 'finite WAR/PSO-style stock and belly plate', activeProtection: false });
}
