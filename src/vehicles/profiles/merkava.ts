// Merkava family profiles (release 262, the owner 2026-10-27: "redesign and clean up the merkava mk 1b, 2b, 2d, baz,
// mk 3c, and mk 4b, completely new with all oldness removed and we will need their gun assemblies back and beautiful";
// then, with the supplied source models: "need much more detail and geometry and need to match the geometry of these").
// One family builder draws the six marks from their measured records (merkavaFamilyMarks.ts over the source fit,
// merkavaFamilySource.ts): the hull and running gear (merkavaFamilyHull.ts), the turret shell, basket and roof weapons
// (merkavaFamilyTurret.ts), every measured detail part (merkavaFamilyDetails.ts) and the gun (merkavaFamilyGun.ts). The
// Mk 3D, Mk 4, Mk 4 Trophy and Mk 4 Barak are the merkavaX pack's.
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import { MERKAVA_MARKS, type MerkavaMark, type MerkavaMarkId } from './merkavaFamilyMarks.ts';
import { buildMerkavaHullBody, buildMerkavaRunningGear, buildMerkavaStern } from './merkavaFamilyHull.ts';
import { buildMerkavaBasket, buildMerkavaRingShell, buildMerkavaRoofWeapons } from './merkavaFamilyTurret.ts';
import { buildMerkavaSourceDetails } from './merkavaFamilyDetails.ts';
import { addMerkavaGun } from './merkavaFamilyGun.ts';

function isTankBuilderPort(value: object): value is TankBuilderPort {
  return 'spec' in value && 'hullG' in value && 'turretG' in value && 'gunG' in value && 'mats' in value
    && 'add' in value && typeof value.add === 'function'
    && 'addEquipment' in value && typeof value.addEquipment === 'function'
    && 'decal' in value && typeof value.decal === 'function';
}

function markOf(P: TankBuilderPort): MerkavaMark {
  const mark = (MERKAVA_MARKS as Readonly<Record<string, MerkavaMark>>)[P.spec.id];
  if (!mark) throw new Error(`Merkava family: no measured record for ${P.spec.id}`);
  return mark;
}

function* buildMerkavaFamilySteps(builder: object): TankProfileBuild {
  if (!isTankBuilderPort(builder)) throw new TypeError('Merkava family requires a complete procedural tank builder');
  const P = builder;
  const mark = markOf(P);
  // 2026-10-09 (owner): the field net and garnish of the marks that carry one (ghillieFleetSuits.ts), laid on the
  // assembled build
  addVehicleGhillieSuit(P);

  buildMerkavaHullBody(P, mark.hull, mark.gear);
  yield 'merkavaHull';
  buildMerkavaRunningGear(P, mark.gear);
  yield 'merkavaRunningGear';
  buildMerkavaStern(P, mark.hull);
  yield 'merkavaHullFittings';

  const [py, pz] = mark.pivot;
  P.turretG.position.set(0, py, pz);
  buildMerkavaRingShell(P, mark.rings, mark.pivot, mark.slot);
  buildMerkavaBasket(P, mark.basket, mark.pivot);
  yield 'merkavaTurretShell';
  buildMerkavaSourceDetails(P, mark.parts, [0, py, pz]);
  buildMerkavaRoofWeapons(P, mark.rings, mark.roofGuns, mark.antennas, mark.pivot);
  yield 'merkavaDetails';

  const gunReceipt = addMerkavaGun(P, mark.gun);
  yield 'merkavaGun';

  // the tactical number on the bustle's flank
  const rear = mark.rings[Math.min(4, mark.rings.length - 1)]!, mid = rear.side[Math.floor(rear.side.length / 2)]!;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [mid[0] * 0.98, mid[1] - py, rear.z - pz], Math.PI / 2);
  P.topY = Math.max(...mark.rings.map((r) => r.crown)) - py + 0.10;
  P.hullG.userData.merkavaFamilyReceipt = Object.freeze({
    revision: 'merkava-family-262-r3', mark: mark.id, gun: gunReceipt,
    pivotM: Object.freeze([...mark.pivot]), roadWheelStations: mark.gear.wheelZs.length,
    returnRollers: mark.gear.rollers.length, sourceParts: mark.parts.length, turretStations: mark.rings.length,
  });
}

const buildMerkavaFamily = steppedBuilder(buildMerkavaFamilySteps);

export const MERKAVA_PROFILES = Object.fromEntries(
  (Object.keys(MERKAVA_MARKS) as MerkavaMarkId[]).map((id) => [id, { build: buildMerkavaFamily }]),
) satisfies VehicleProfileRecord;
