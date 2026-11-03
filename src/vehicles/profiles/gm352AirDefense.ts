// Release 268 REGISTRAR PLACEHOLDER (R0): the 2K22M Tunguska-M and the tracked Pantsir-S1 build on the BMP-3's hull and
// running gear (profiles/afvFamily.ts) under a box turret, one barrel a side and their SAM tubes, so both ids are
// complete playable vehicles while builder R authors the measured GM-352 build in this file. Every firing datum is read
// from the spec (gm352AirDefenseSpecs.ts): the ring, the trunnion, the twin fire axes and the launcher mouths.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { AFV_FAMILY_PROFILES } from './afvFamily.ts';
import { KIT } from './kit.ts';
import { weaponAssembly } from './weaponStock.ts';

const { box, cylX, cylY, cylZ } = KIT;

/** The placeholder turret body, as the spec's turret plates (gm352AirDefenseSpecs.ts BODY). */
const BODY = Object.freeze({ halfWidth: .95, floorY: .12, roofY: .97, rearZ: -1.40, frontZ: 1.00 });

function removeDonorTurret(P: TankBuilderPort): void {
  P.clear('turret', 'turretDark', 'turretDetail', 'turretEquipment', 'turretGlass', 'turretCloth',
    'turretExternalArmor', 'turretCupola', 'turretHatch', 'turretRubber', 'turretShadow', 'turretFittingPaint',
    'gun', 'gunDark', 'gunMount', 'gunMountDark', 'gunMountCanvasSkin');
  P.clearDecals('turret');
  for (const child of [...P.turretG.children]) if (child !== P.gunG) P.turretG.remove(child);
  for (const child of [...P.gunG.children]) if (child !== P.recoilG) P.gunG.remove(child);
  for (const child of [...P.recoilG.children]) if (!child.name.startsWith('rig_barrel_')) P.recoilG.remove(child);
}

function airDefenseStation(P: TankBuilderPort, tubeRadius: number, tubeLength: number): void {
  const spec = P.spec;
  const [tx, ty, tz] = spec.armor.turretPivot;
  const [gx, gy, gz] = spec.armor.gunPivot;
  P.turretG.position.set(tx, ty, tz);
  P.gunG.position.set(gx, gy, gz);
  const n = P.q ? 20 : 12;
  // the ring collar, sunk 2 cm into the deck and 2 cm into the body's floor, and the closed body on it
  P.add('turret', cylY(.98, 1.02, BODY.floorY + .04, P.q ? 32 : 20), 0, (BODY.floorY + .04) / 2 - .02, 0);
  P.add('turret', box(BODY.halfWidth * 2, BODY.roofY - BODY.floorY, BODY.frontZ - BODY.rearZ), 0,
    (BODY.roofY + BODY.floorY) / 2, (BODY.frontZ + BODY.rearZ) / 2);
  // the sight head on the roof, seated 1 cm into it
  P.add('turretDetail', box(.40, .24, .30), .50, BODY.roofY + .11, .78);
  P.add('turretGlass', box(.28, .12, .012), .50, BODY.roofY + .12, .935);
  const muzzleZ = spec.armor.gunBarrel.lengthM;
  const axes = spec.gun.muzzles ?? [];
  axes.forEach((axis, index) => {
    const x = axis.x ?? 0, y = axis.y ?? 0;
    const side = Math.sign(x) || 1;
    // the trunnion runs from inside the body out into the receiver: a body of revolution about the pitch axis
    const inner = BODY.halfWidth - .09, outer = Math.abs(x) + .03;
    P.addGunExtra(cylX(.12, outer - inner, n), side * (inner + outer) / 2, y, 0);
    P.addGunExtra(box(.22, .30, .80), x, y, .15);
    P.add(`gunBarrel${index}`, cylZ(.045, muzzleZ - .50, n), x, y, (muzzleZ + .50) / 2);
    P.add(`gunBarrel${index}Dark`, cylZ(.06, .16, n), x, y, muzzleZ - .08);
    P.add(`gunBarrel${index}Dark`, cylZ(.022, .02, n), x, y, muzzleZ - .005);
  });
  P.muzzleZ = muzzleZ;
  const tubes = spec.gun.launcherMuzzles ?? [];
  weaponAssembly(P, () => {
    // closed canisters whose front caps are the launch exits
    for (const tube of tubes) {
      const geometry = new THREE.CylinderGeometry(tubeRadius, tubeRadius, tubeLength, n).rotateX(Math.PI / 2);
      P.add('gunMount', geometry, tube.x, tube.y, tube.z - tubeLength / 2);
    }
    // a carrier web from each receiver out under its bank
    for (const side of [-1, 1]) {
      const own = tubes.filter((tube) => Math.sign(tube.x) === side);
      if (!own.length) continue;
      const outer = Math.max(...own.map((tube) => Math.abs(tube.x)));
      const gunX = Math.abs(axes.find((axis) => Math.sign(axis.x ?? 0) === side)?.x ?? 0);
      const span = outer - gunX;
      P.add('gunMount', box(span, .06, .36), side * (gunX + span / 2),
        Math.min(...own.map((tube) => tube.y)) - tubeRadius - .02, own[0].z - tubeLength + .30);
    }
  }, 'missileRack', 10);
  P.turretG.userData.airDefenseLauncher = { launcherTubes: tubes.length };
  P.topY = BODY.roofY + .23;
}

export function buildTunguskaM(P: TankBuilderPort): void {
  AFV_FAMILY_PROFILES.bmp3.build(P);
  removeDonorTurret(P);
  airDefenseStation(P, .08, 1.50);
}

export function buildPantsirS1(P: TankBuilderPort): void {
  AFV_FAMILY_PROFILES.bmp3.build(P);
  removeDonorTurret(P);
  airDefenseStation(P, .065, 1.60);
}

export const GM352_AIR_DEFENSE_PROFILES = {
  tunguska_m: { build: buildTunguskaM },
  pantsir_s1: { build: buildPantsirS1 },
} as const;
