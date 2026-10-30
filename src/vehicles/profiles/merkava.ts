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
import { buildMerkavaBelly, buildMerkavaHullBody, buildMerkavaNose, buildMerkavaRunningGear, buildMerkavaStern } from './merkavaFamilyHull.ts';
import { buildMerkavaRoofWeapons, buildMerkavaTurretShell, turretFlankAt, turretShellTop } from './merkavaFamilyTurret.ts';
import { buildMerkavaAddenda, buildMerkavaBasket, buildMerkavaSourceDetails, buildMerkavaStuds, modulePlateFront, moduleRunFront } from './merkavaFamilyDetails.ts';
import { addMerkavaGun } from './merkavaFamilyGun.ts';
import { buildMerkavaBasketLoad } from './merkavaFamilyBasket.ts';

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

  buildMerkavaHullBody(P, mark.hull, mark.gear, mark.fender);
  yield 'merkavaHull';
  buildMerkavaRunningGear(P, mark.gear);
  yield 'merkavaRunningGear';
  buildMerkavaStern(P, mark.hull);
  buildMerkavaNose(P, mark.hull);
  if (mark.belly) buildMerkavaBelly(P, mark.belly);
  yield 'merkavaHullFittings';

  const [py, pz] = mark.pivot;
  P.turretG.position.set(0, py, pz);
  // the gun's channel: the slot from its back wall to the nose, else (the Mk 4) from the shell's front to its modules' tips
  const shellFront = Math.max(...mark.shell.map((solid) => solid.z[solid.z.length - 1]!));
  const moduleFront = Math.max(shellFront, ...mark.modules.flatMap((m) => m.plates ? m.plates.map((plate) => modulePlateFront(plate))
    : m.runs ? m.runs.map((run) => moduleRunFront(run)) : m.axis === 2 ? m.solids.map((solid) => solid.z[solid.z.length - 1]!) : []));
  const channel = mark.slot ? { z0: mark.slot.z0, z1: shellFront, halfWidth: mark.slot.halfWidth }
    : moduleFront > shellFront + 0.2 ? { z0: shellFront - 0.05, z1: moduleFront, halfWidth: 0.25 } : null;
  buildMerkavaTurretShell(P, mark.shell, mark.pivot, channel);
  if (mark.basket) {
    buildMerkavaBasket(P, mark.basket, mark.pivot);
    buildMerkavaBasketLoad(P, mark.load, mark.basket, mark.pivot);
  }
  yield 'merkavaTurretShell';
  buildMerkavaSourceDetails(P, mark.parts, [0, py, pz], mark.modules, mark.solidParts, mark.glacisHatchZ);
  buildMerkavaAddenda(P, mark.addenda, mark.pivot);
  buildMerkavaStuds(P, mark.studs);
  buildMerkavaRoofWeapons(P, mark.shell, mark.roofGuns, mark.antennas, mark.pivot);
  yield 'merkavaDetails';

  const gunReceipt = addMerkavaGun(P, mark.gun);
  yield 'merkavaGun';

  // the tactical number on the bustle's flank
  const flankZ = Math.min(...mark.shell.map((solid) => solid.z[0]!)) + 0.45, flank = turretFlankAt(mark.shell, flankZ);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [flank[0] * 0.98, flank[1] - py, flankZ - pz], Math.PI / 2);
  P.topY = turretShellTop(mark.shell) - py + 0.10;
  P.hullG.userData.merkavaFamilyReceipt = Object.freeze({
    revision: 'merkava-family-262-r5', mark: mark.id, gun: gunReceipt,
    pivotM: Object.freeze([...mark.pivot]), roadWheelStations: mark.gear.wheelZs.length,
    returnRollers: mark.gear.rollers.length, sourceParts: mark.parts.length,
    turretStations: mark.shell.reduce((n, solid) => n + solid.z.length, 0),
  });
}

const buildMerkavaFamily = steppedBuilder(buildMerkavaFamilySteps);

export const MERKAVA_PROFILES = Object.fromEntries(
  (Object.keys(MERKAVA_MARKS) as MerkavaMarkId[]).map((id) => [id, { build: buildMerkavaFamily }]),
) satisfies VehicleProfileRecord;
