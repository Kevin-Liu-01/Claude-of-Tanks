// Release 268 REGISTRAR PLACEHOLDER (R0): the PGZ-95 and PGZ-09 build on the BMP-3's hull and running gear
// (profiles/afvFamily.ts) under a box turret and one barrel a side (the PGZ-95 with its four QW-2 tubes), so both ids are
// complete playable vehicles while builder C authors the measured PLA builds in this file. Every firing datum is read
// from the spec (chineseAirDefenseSpecs.ts): the ring, the trunnion, the twin fire axes and the launcher mouths.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { AFV_FAMILY_PROFILES } from './afvFamily.ts';
import { KIT } from './kit.ts';
import { weaponAssembly } from './weaponStock.ts';

const { box, cylX, cylY, cylZ } = KIT;

interface PlaceholderBody { readonly halfWidth: number; readonly floorY: number; readonly roofY: number;
  readonly rearZ: number; readonly frontZ: number }
/** The placeholder turret bodies, as the spec's turret plates (chineseAirDefenseSpecs.ts). */
const PGZ95_BODY: PlaceholderBody = Object.freeze({ halfWidth: .90, floorY: .12, roofY: .97, rearZ: -1.30, frontZ: .90 });
const PGZ09_BODY: PlaceholderBody = Object.freeze({ halfWidth: 1.00, floorY: .12, roofY: 1.07, rearZ: -1.45, frontZ: 1.05 });

function removeDonorTurret(P: TankBuilderPort): void {
  P.clear('turret', 'turretDark', 'turretDetail', 'turretEquipment', 'turretGlass', 'turretCloth',
    'turretExternalArmor', 'turretCupola', 'turretHatch', 'turretRubber', 'turretShadow', 'turretFittingPaint',
    'gun', 'gunDark', 'gunMount', 'gunMountDark', 'gunMountCanvasSkin');
  P.clearDecals('turret');
  for (const child of [...P.turretG.children]) if (child !== P.gunG) P.turretG.remove(child);
  for (const child of [...P.gunG.children]) if (child !== P.recoilG) P.gunG.remove(child);
  for (const child of [...P.recoilG.children]) if (!child.name.startsWith('rig_barrel_')) P.recoilG.remove(child);
}

function plaStation(P: TankBuilderPort, body: PlaceholderBody, barrelR: number, tubeRadius: number, tubeLength: number): void {
  const spec = P.spec;
  const [tx, ty, tz] = spec.armor.turretPivot;
  const [gx, gy, gz] = spec.armor.gunPivot;
  P.turretG.position.set(tx, ty, tz);
  P.gunG.position.set(gx, gy, gz);
  const n = P.q ? 20 : 12;
  // the ring collar, sunk 2 cm into the deck and 2 cm into the body's floor, and the closed body on it
  P.add('turret', cylY(.98, 1.02, body.floorY + .04, P.q ? 32 : 20), 0, (body.floorY + .04) / 2 - .02, 0);
  P.add('turret', box(body.halfWidth * 2, body.roofY - body.floorY, body.frontZ - body.rearZ), 0,
    (body.roofY + body.floorY) / 2, (body.frontZ + body.rearZ) / 2);
  P.add('turretDetail', box(.38, .22, .28), .48, body.roofY + .10, body.frontZ - .25);
  P.add('turretGlass', box(.26, .11, .012), .48, body.roofY + .11, body.frontZ - .105);
  const muzzleZ = spec.armor.gunBarrel.lengthM;
  const axes = spec.gun.muzzles ?? [];
  axes.forEach((axis, index) => {
    const x = axis.x ?? 0, y = axis.y ?? 0;
    const side = Math.sign(x) || 1;
    // the trunnion from inside the body out into the receiver: a body of revolution about the pitch axis
    const inner = body.halfWidth - .09, outer = Math.abs(x) + .03;
    P.addGunExtra(cylX(.12, outer - inner, n), side * (inner + outer) / 2, y, 0);
    P.addGunExtra(box(.22, .30, .80), x, y, .15);
    P.add(`gunBarrel${index}`, cylZ(barrelR, muzzleZ - .50, n), x, y, (muzzleZ + .50) / 2);
    P.add(`gunBarrel${index}Dark`, cylZ(barrelR * 1.35, .16, n), x, y, muzzleZ - .08);
    P.add(`gunBarrel${index}Dark`, cylZ(barrelR * .5, .02, n), x, y, muzzleZ - .005);
  });
  P.muzzleZ = muzzleZ;
  const tubes = spec.gun.launcherMuzzles ?? [];
  if (tubes.length) {
    weaponAssembly(P, () => {
      // closed canisters whose front caps are the launch exits
      for (const tube of tubes) {
        const geometry = new THREE.CylinderGeometry(tubeRadius, tubeRadius, tubeLength, n).rotateX(Math.PI / 2);
        P.add('gunMount', geometry, tube.x, tube.y, tube.z - tubeLength / 2);
      }
      // a post from each receiver up under its pair
      for (const side of [-1, 1]) {
        const own = tubes.filter((tube) => Math.sign(tube.x) === side);
        if (!own.length) continue;
        const gunX = Math.abs(axes.find((axis) => Math.sign(axis.x ?? 0) === side)?.x ?? 0);
        const outer = Math.max(...own.map((tube) => Math.abs(tube.x)));
        const low = Math.min(...own.map((tube) => tube.y)) - tubeRadius + .02;
        P.add('gunMount', box(outer - gunX + .12, low - .10, .30), side * (gunX + outer) / 2, (low + .10) / 2,
          own[0].z - tubeLength + .35);
      }
    }, 'missileRack', 10);
  }
  P.turretG.userData.airDefenseLauncher = { launcherTubes: tubes.length };
  P.topY = body.roofY + .21;
}

export function buildPgz95(P: TankBuilderPort): void {
  AFV_FAMILY_PROFILES.bmp3.build(P);
  removeDonorTurret(P);
  plaStation(P, PGZ95_BODY, .035, .055, 1.35);
}

export function buildPgz09(P: TankBuilderPort): void {
  AFV_FAMILY_PROFILES.bmp3.build(P);
  removeDonorTurret(P);
  plaStation(P, PGZ09_BODY, .055, 0, 0);
}

export const CHINESE_AIR_DEFENSE_PROFILES = {
  pgz95: { build: buildPgz95 },
  pgz09: { build: buildPgz09 },
} as const;
