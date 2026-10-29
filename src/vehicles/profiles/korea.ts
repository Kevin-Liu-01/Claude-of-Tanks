// Korean armored family — first-party procedural expansion.
//
// K2B (§5.299, owner order verbatim: "make our old pl-01 from before our
// changes into a new K2B tank in korea"): the pre-§5.248-wave PL-01 build is
// resurrected here as a NEW Korean fleet id. The geometry is the K2-donor
// variant exactly as it shipped before the poland ground-up wave landed
// (source of truth: `git show d7ba844f^:src/vehicles/profiles/poland.js`,
// buildPL01 = buildK2 + addPL01Package). The current pl01 (ratified §5.267
// ground-up stealth build) is untouched and remains Poland's.
//
// Fidelity map vs the resurrected source: addK2BPackage is the verbatim old
// addPL01Package; mount/cassette are the verbatim old module helpers;
// addRoofWhips/addRoofRWS are the verbatim old addPolishWhips/addPolishRWS
// (renamed — the hardware is generic roof furniture, and this module is
// Korean). The ONLY functional delta is the baked hull number decal text:
// 'PL-01' -> 'K2B'.

import { KIT, FITTINGS, convexSlab, orientedSlab } from './kit.ts';
import { addK2GunFront } from './k2X.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { buildK2 } from '../modern3.ts';
import type { Modern3BuilderPort } from '../modern3.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import type {
  ProceduralBuilderPort,
  Vec3Tuple,
  VehicleAssemblyOwner,
} from '../proceduralBuilderContracts.ts';
import { mount } from './fittingMount.ts';

function cassette(
  P: ProceduralBuilderPort,
  owner: VehicleAssemblyOwner,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  rotation: Vec3Tuple | null = null,
  cap = true,
): void {
  const r = rotation || [0, 0, 0];
  // bolt-on armour modules (the K2B's modular stealth sides): external armour, never the base hull/turret envelope
  const armor = owner === 'hull' ? 'hullExternalArmor' : 'turretExternalArmor';
  const detail = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.add(armor, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (cap) P.add(detail, KIT.box(w * 0.70, 0.016, Math.max(0.024, d * 0.07)),
    x, y + h * 0.5 + 0.010, z + d * 0.27, r[0], r[1], r[2]);
}

function addRoofWhips(
  P: ProceduralBuilderPort,
  y: number,
  z: number,
  seed: number,
  spread = 1.02,
): void {
  for (const side of [-1, 1]) {
    P.add('turretDetail', KIT.cylY(0.034, 0.045, 0.060, 10), side * spread, y, z);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: side < 0 ? 0.80 : 0.68, r: 0.012,
      rake: -side * 0.045, seed: seed + (side > 0 ? 1 : 0),
    }), side * spread, y + 0.03, z);
  }
}

function addOpenYokeAuxRWS(P: ProceduralBuilderPort): void {
  const x = 0.70;
  const y = 0.70;
  const z = -0.68;
  const yaw = -0.025;
  const station = FITTINGS.openYokeRws({
    mats: P.mats,
    bodySlot: 'hull',
    // K2B carries the same complete open-yoke mechanism as the M1A3 family,
    // but its low stealth roof needs a slightly tighter installation. Keep
    // every receiver/feed/optic/shield detail while trimming the whole tower
    // by roughly ten percent and shortening its powered riser.
    sizeStandard: 'k2b-compact-tower',
    scale: 1.14,
    towerRise: 0.12,
    variant: 'korean-twin',
    ammoSide: 1,
    sensorSide: -1,
    elev: 0.055,
    weaponName: 'K6 remote machine gun',
    seed: 1040,
  });
  station.name = 'k2bAuxOpenYokeRws';
  station.userData.hostVariant = 'k2b';
  station.userData.weaponRole = 'auxiliary';
  mount(P, 'turret', station, x, y, z, [0, yaw, 0]);
  P.turretG.userData.auxiliaryOpenYokeRwsReceipt = Object.freeze({
    host: 'k2b',
    designFamily: station.userData.designFamily,
    variant: station.userData.stationVariant,
    mountLocal: Object.freeze([x, y, z]),
    scale: station.userData.scale,
    sizeStandard: station.userData.sizeStandard,
    towerRiseM: station.userData.towerRise,
    yaw,
    caliberMm: station.userData.caliberMm,
    ammoSide: station.userData.ammoSide,
    sensorSide: station.userData.sensorSide,
    weaponRole: 'auxiliary',
    visibleFeedBelt: station.userData.hasVisibleFeedBelt,
    firingAxis: station.userData.firingAxis,
    equipmentOwned: true,
    turretOwned: true,
  });
}

function addK2BPackage(P: ProceduralBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  const slab = orientedSlab;

  // Full-height modular stealth sides: the panels overlap the intact K2
  // skirt/fender structure but remain outside the animated shoe envelope.
  // Their upper bevel follows the source's single long shoulder fold.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = 2.58 - i * 0.78;
      const h = i === 0 || i === 7 ? 0.82 : 0.94;
      cassette(P, 'hull', side * 1.86, 1.12 + (i % 2) * 0.008, z,
        0.075, h, 0.70, [0, 0, side * (i < 2 ? 0.035 : -0.012)], false);
      // the two bow cassettes lean in 0.035 rad: their top strip follows the leaning face (it stood 10 mm off it)
      P.add('hullDark', box(0.020, 0.040, 0.56), side * (i < 2 ? 1.8925 : 1.905),
        1.48, z);
      P.add('hullDetail', box(0.020, 0.54, 0.025), side * 1.907,
        1.13, z + 0.33);
    }
    // The cassettes stand 10 cm outboard of the K2 skirt (outer face 1.72): a mounting rail along the skirt top carries
    // them (owner 2026-10-19 sweep: they floated beside it with nothing joining them to the hull).
    P.add('hull', box(0.12, 0.05, 6.10), side * 1.77, 1.46, -0.15);
    // Folded bow shoulder closes into the frontal armor instead of ending
    // as a flat applique plate.
    P.add('hull', slab(
      [side * 0.20, 1.22, 3.52], [side * 1.82, 1.08, 3.24],
      [side * 1.76, 1.16, 2.70], [side * 0.18, 1.16, 2.88],
      [side * 0.18, 1.58, 3.42], [side * 1.72, 1.48, 3.12],
      [side * 1.68, 1.26, 2.70], [side * 0.18, 1.22, 2.91]));
  }
  P.add('hullDark', box(2.72, 0.055, 0.12), 0, 1.22, 3.48, -0.26, 0, 0);
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight',
      mats: P.mats, pods: 3, spacing: 0.12, r: 0.042,
      shield: true, seed: 1010 + (side > 0 ? 1 : 0),
    }), side * 1.17, 1.48, 3.30, [-0.18, 0, 0]);
  }

  // Joined station loft for the source's low diamond turret. These pieces
  // intersect the K2 crown and each other, forming one closed stealth mass.
  // 2026-10-25 (the owner: "give the k2b a proper mantlet and turret front that aligns with what a prototype of a k2
  // would look like"): the diamond's front no longer buries the gun. It parts into the K2's two raked cheek wedges
  // (the diamond's own outer faces, cut at x 0.45) round a gun well, a gun housing at its back, and the K2's measured
  // mantlet, sight hood and collar (k2X.ts addK2GunFront) standing proud in it.
  const CHEEK_X = 0.45;
  const onDiagonal = (a: readonly number[], b: readonly number[], x: number): number[] => {
    const t = (x - a[0]) / (b[0] - a[0]);
    return a.map((value, axis) => value + (b[axis] - value) * t);
  };
  for (const side of [-1, 1]) {
    const tipBottom = [side * 0.26, -0.03, 2.45], rearBottom = [side * 1.42, -0.03, 0.52];
    const tipTop = [side * 0.20, 0.60, 2.20], rearTop = [side * 1.12, 0.68, 0.34];
    const innerBottom = onDiagonal(tipBottom, rearBottom, side * CHEEK_X), innerTop = onDiagonal(tipTop, rearTop, side * CHEEK_X);
    P.add('turret', convexSlab(
      innerBottom, rearBottom, [side * CHEEK_X, -0.03, 0.52], onDiagonal(tipBottom, rearBottom, side * 0.9),
      innerTop, rearTop, [side * CHEEK_X, 0.68, 0.34], onDiagonal(tipTop, rearTop, side * 0.9)));
  }
  // The gun housing between the cheeks, its face at the mantlet's back wall (gun-relative z 0.277, turret z 2.0)
  P.add('turret', slab(
    [-CHEEK_X, -0.03, 2.0], [CHEEK_X, -0.03, 2.0], [CHEEK_X, -0.03, 0.52], [-CHEEK_X, -0.03, 0.52],
    [-CHEEK_X, 0.60, 2.0], [CHEEK_X, 0.60, 2.0], [CHEEK_X, 0.68, 0.34], [-CHEEK_X, 0.68, 0.34]));
  P.add('turret', slab(
    [-1.42, -0.03, 0.52], [1.42, -0.03, 0.52], [1.31, 0.02, -2.05], [-1.31, 0.02, -2.05],
    [-1.12, 0.68, 0.34], [1.12, 0.68, 0.34], [1.10, 0.62, -1.91], [-1.10, 0.62, -1.91]));
  P.add('turretDark', box(2.10, 0.025, 1.08), 0, 0.70, -0.78);
  for (const side of [-1, 1]) {
    // Paired EO/thermal heads sit in recessed, backed housings.
    P.add('turret', box(0.42, 0.27, 0.42), side * 0.72, 0.75, 0.22,
      -0.10, side * 0.08, 0);
    P.add('turretDark', box(0.31, 0.16, 0.032), side * 0.72, 0.77, 0.445,
      -0.10, side * 0.08, 0);
    for (const dx of [-0.09, 0.09]) {
      P.add('turretGlass', cylZ(0.055, 0.030, 14), side * 0.72 + dx,
        0.77, 0.468, Math.PI / 2, 0, 0);
    }
    P.add('turretDetail', box(0.035, 0.22, 0.30), side * 0.96, 0.75, 0.18);
  }
  // VH.14 (coordinator ruling 2026-10-14): the K2's one roof gun is the loader's K6 on its working open-yoke station;
  // the second roof RWS gun is gone
  addOpenYokeAuxRWS(P);
  addRoofWhips(P, 0.64, -1.72, 1030, 1.00);

  // The K2's gun front (the K2 X measured mantlet, sight hood and collar) on the K2B's trunnion. The K2B carries its
  // trunnion 1.72 m ahead of its ring (the K2 1.15 m), so turned aft the mantlet hangs over the engine deck: its lower
  // rear corner, 0.354 m under the bore, stood under the deck's top (the gun held -0.9 deg over the stern), and is
  // trimmed to the old gun plant's 0.24 m.
  const gunFrontPort = P as ProceduralBuilderPort & Partial<Pick<TankBuilderPort, 'addEquipment'>>;
  if (!gunFrontPort.addEquipment) throw new Error('K2B gun front requires the builder equipment slots');
  addK2GunFront(gunFrontPort as Pick<TankBuilderPort, 'add' | 'addEquipment'>, 0.24);
  P.add('turretDetail', cylY(0.11, 0.12, 0.08, 14), 0.56, 0.73, -0.22);
  P.decal('hull', 'number', 'K2B', 0.24, [-1.90, 1.18, -0.42], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.48);
}

function buildK2B(P: ProceduralBuilderPort & Modern3BuilderPort): void {
  buildK2(P);
  addK2BPackage(P);
  // Release 240 (the owner: "make sure all tank turrets are clear of hulls"): the ring receipt reads the deck at its
  // well's floor (1.56), so its seat (turretSeatRace.ts) stopped at 1.63, 3 cm into the 1.66 roof round the ring, and the
  // loft's underside swept the roof and its kit (to 1.679) at every bearing. The seat takes that roof's plane with its
  // 3 cm seam as a floor.
  P.turretG.userData.turretSeatMinY = 1.69;
}

export const KOREA_PROFILES = {
  k2b: { build: buildK2B },
} satisfies VehicleProfileRecord;
