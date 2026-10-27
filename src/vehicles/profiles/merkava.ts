// Merkava family profiles (release 262, the owner 2026-10-27: "redesign and clean up the merkava mk 1b, 2b, 2d, baz,
// mk 3c, and mk 4b, completely new with all oldness removed and we will need their gun assemblies back and beautiful").
// One family builder draws the six marks from their measured records (merkavaFamilyMarks.ts): the hull, running gear
// and skirts (merkavaFamilyHull.ts), the turret, its armour modules and roof equipment (merkavaFamilyTurret.ts) and the
// gun assembly (merkavaFamilyGun.ts). The Mk 3D, Mk 4, Mk 4 Trophy and Mk 4 Barak are the merkavaX pack's.
import { KIT, FITTINGS } from './kit.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import { MERKAVA_MARKS, type MerkavaMark, type MerkavaMarkId } from './merkavaFamilyMarks.ts';
import {
  buildMerkavaGlacis, buildMerkavaHullBody, buildMerkavaHullKit, buildMerkavaRunningGear, buildMerkavaSkirts,
  buildMerkavaStern,
} from './merkavaFamilyHull.ts';
import { buildMerkavaTurretEquipment, buildMerkavaTurretShell, turretRoofAt } from './merkavaFamilyTurret.ts';
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

/** The 12.7 mm M2 over the main gun, fired from inside the turret, on a cradle bolted to the mantlet's crown. */
function overGunMachineGun(P: TankBuilderPort, mark: MerkavaMark): void {
  if (!mark.gun.overGunMachineGun) return;
  const m = mark.gun.mantlet;
  const crown = m.halfHeight + 0.01;
  const z = Math.min(m.frontZ - m.depth * 0.35, m.frontZ - 0.12);
  P.add('gunMount', KIT.box(0.16, 0.06, 0.30), 0.0, crown + 0.03, z);
  P.add('gunMountDark', KIT.box(0.10, 0.05, 0.22), 0.0, crown + 0.085, z + 0.02);
  const m2 = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', scale: 1.0, seed: 445, tone: 'two-tone', ammo: true,
    shield: false, ring: false, mount: 'external-cradle' });
  m2.name = 'merkavaOverGunM2';
  m2.position.set(0.0, crown + 0.11, z - 0.06);
  P.gunG.add(m2);
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
  buildMerkavaSkirts(P, mark.skirt);
  buildMerkavaGlacis(P, mark.hull);
  buildMerkavaStern(P, mark.hull);
  buildMerkavaHullKit(P, mark.hull);
  yield 'merkavaHullFittings';

  P.turretG.position.set(0, mark.pivot[0], mark.pivot[1]);
  buildMerkavaTurretShell(P, mark.turret);
  yield 'merkavaTurretShell';
  buildMerkavaTurretEquipment(P, mark.turret);
  yield 'merkavaTurretEquipment';

  const gunReceipt = addMerkavaGun(P, mark.gun);
  overGunMachineGun(P, mark);
  yield 'merkavaGun';

  // the tactical number on the bustle's flank
  const t = mark.turret, rear = t.shell[0]!, next = t.shell[1]!;
  const numberZ = (rear.z + next.z) / 2;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25,
    [Math.max(rear.shoulder[0], next.shoulder[0]) * 0.97, (rear.shoulder[1] + next.shoulder[1]) / 2, numberZ], Math.PI / 2);
  P.topY = Math.max(...t.shell.map((s) => s.crown), turretRoofAt(t, t.cupola[0], t.cupola[1]) + t.cupola[3]) + 0.10;
  P.hullG.userData.merkavaFamilyReceipt = Object.freeze({
    revision: 'merkava-family-262-r1', mark: mark.id, gun: gunReceipt,
    pivotM: Object.freeze([...mark.pivot]), roadWheelStations: mark.gear.wheelZs.length,
    returnRollers: mark.gear.returnRollers.length, modules: t.modules.length,
  });
}

const buildMerkavaFamily = steppedBuilder(buildMerkavaFamilySteps);

export const MERKAVA_PROFILES = Object.fromEntries(
  (Object.keys(MERKAVA_MARKS) as MerkavaMarkId[]).map((id) => [id, { build: buildMerkavaFamily }]),
) satisfies VehicleProfileRecord;
