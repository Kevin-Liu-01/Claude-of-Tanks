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

import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import { buildK2 } from '../modern3.js';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import type {
  ProceduralBuilderPort,
  TransformObjectPort,
  Vec3Tuple,
  VehicleAssemblyOwner,
} from '../proceduralBuilderContracts.ts';

function mount(
  P: ProceduralBuilderPort,
  owner: VehicleAssemblyOwner,
  fitting: TransformObjectPort,
  x: number,
  y: number,
  z: number,
  rotation: Vec3Tuple | null = null,
): void {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

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
  const armor = owner === 'hull' ? 'hull' : 'turret';
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

function addRoofRWS(
  P: ProceduralBuilderPort,
  x: number,
  y: number,
  z: number,
  seed: number,
  scale = 0.82,
  yaw = 0.04,
): void {
  const { box, cylY } = KIT;
  P.add('turret', box(0.48, 0.075, 0.46), x, y, z);
  P.add('turretDark', box(0.38, 0.020, 0.36), x, y + 0.048, z);
  P.add('turret', cylY(0.20, 0.22, 0.075, 16), x, y + 0.085, z);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale, elev: 0.11,
    shield: true, ammo: true, ring: { r: 0.17, stubs: 3 }, seed,
  }), x, y + 0.11, z, [0, yaw, 0]);
}

function addOpenYokeAuxRWS(P: ProceduralBuilderPort): void {
  const x = 0.70;
  const y = 0.70;
  const z = -0.68;
  const yaw = -0.025;
  const station = FITTINGS.openYokeRws({
    mats: P.mats,
    bodySlot: 'hull',
    sizeStandard: 'm1a3-full-tower',
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
      P.add('hullDark', box(0.020, 0.040, 0.56), side * 1.905,
        1.48, z);
      P.add('hullDetail', box(0.020, 0.54, 0.025), side * 1.907,
        1.13, z + 0.33);
    }
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
    mount(P, 'hull', FITTINGS.lightCluster({
      mats: P.mats, pods: 3, spacing: 0.12, r: 0.042,
      shield: true, seed: 1010 + (side > 0 ? 1 : 0),
    }), side * 1.17, 1.48, 3.30, [-0.18, 0, 0]);
  }

  // Joined station loft for the source's low diamond turret. These pieces
  // intersect the K2 crown and each other, forming one closed stealth mass.
  P.add('turret', slab(
    [-0.26, -0.03, 2.45], [0.26, -0.03, 2.45], [1.42, -0.03, 0.52], [-1.42, -0.03, 0.52],
    [-0.20, 0.60, 2.20], [0.20, 0.60, 2.20], [1.12, 0.68, 0.34], [-1.12, 0.68, 0.34]));
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
  addRoofRWS(P, -0.28, 0.77, -0.94, 1020, 0.78, 0.03);
  addOpenYokeAuxRWS(P);
  addRoofWhips(P, 0.64, -1.72, 1030, 1.00);

  // Closed 120-mm gun plant: faceted mask, oval collar, clamp and bore cue.
  P.addGunExtra(box(0.72, 0.48, 0.28), 0, -0.01, 0.38);
  P.addGunExtra(cylZ(0.20, 0.38, 18, 0.16), 0, 0, 0.68);
  P.addGunExtraDark(cylZ(0.035, 0.10, 10), 0.28, 0.08, 0.58);
  P.addGunExtraDark(cylZ(0.035, 0.10, 10), -0.28, 0.08, 0.58);
  P.add('turretDetail', cylY(0.11, 0.12, 0.08, 14), 0.56, 0.73, -0.22);
  P.decal('hull', 'number', 'K2B', 0.24, [-1.90, 1.18, -0.42], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.48);
}

function buildK2B(P: ProceduralBuilderPort): void {
  buildK2(P);
  addK2BPackage(P);
}

export const KOREA_PROFILES = {
  k2b: { build: buildK2B },
} satisfies VehicleProfileRecord;
