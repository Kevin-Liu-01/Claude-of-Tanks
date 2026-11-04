// Release 269 REGISTRAR PLACEHOLDER (R0): the PZA Loara on the fleet's PT-91 Twardy hull and running gear
// (profiles/pt91Twardy.ts, its real chassis) under a box turret with one 35 mm barrel on each side, so the id is a complete
// playable vehicle while builder P authors the measured Loara turret in this file. Every firing datum is read from the
// spec (loaraSpecs.ts): the ring, the trunnion and the twin fire axes.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { buildPT91Twardy } from './pt91Twardy.ts';

const { box, cylX, cylY, cylZ } = KIT;

/** The placeholder turret body, as the spec's turret plates (loaraSpecs.ts BODY). */
const BODY = Object.freeze({ halfWidth: 1.10, floorY: .04, roofY: 1.05, rearZ: -1.65, frontZ: 1.15 });

/** Every bucket the donor's turret, mantlet and gun draw into (tankFactoryCore.ts BUCKET_DEF: turretG, gunG, recoilG). */
const DONOR_TURRET_BUCKETS = Object.freeze([
  'turret', 'turretCupola', 'turretHatch', 'turretExternalArmor', 'turretEquipment', 'turretDetail', 'turretDark',
  'turretWeaponSteel', 'turretPaintedDetail', 'turretPermanentMarkingSurface', 'turretOpenLattice',
  'turretOpenLatticeDark', 'turretCloth', 'turretGlass', 'turretCanvasPale', 'turretFittingPaint', 'turretBark',
  'turretTrack', 'turretTrackLinks', 'turretRubber', 'turretShadow',
  'gun', 'gunDark', 'gunCanvasPale', 'gunMount', 'gunMountLamp', 'gunMountDark', 'gunMountCloth', 'gunMountCanvasPale',
  'gunMountCanvasSkin', 'gunMountGlass',
]);

function removeDonorTurret(P: TankBuilderPort): void {
  P.clear(...DONOR_TURRET_BUCKETS);
  P.clearDecals('turret');
  for (const child of [...P.turretG.children]) if (child !== P.gunG) P.turretG.remove(child);
  for (const child of [...P.gunG.children]) if (child !== P.recoilG) P.gunG.remove(child);
  for (const child of [...P.recoilG.children]) if (!child.name.startsWith('rig_barrel_')) P.recoilG.remove(child);
  // the donor's main-gun bore declarations belong to its single centred tube
  P.physicalMuzzleBore = undefined;
  P.muzzleMouth = undefined;
  P.muzzleAxisY = undefined;
}

function twinStation(P: TankBuilderPort, barrelR: number): void {
  const spec = P.spec;
  const [tx, ty, tz] = spec.armor.turretPivot;
  const [gx, gy, gz] = spec.armor.gunPivot;
  P.turretG.position.set(tx, ty, tz);
  P.gunG.position.set(gx, gy, gz);
  const n = P.q ? 20 : 12;
  // the ring collar, sunk 2 cm into the deck and 2 cm into the body's floor, and the closed body on it
  P.add('turret', cylY(1.00, 1.04, BODY.floorY + .04, P.q ? 32 : 20), 0, (BODY.floorY + .04) / 2 - .02, 0);
  P.add('turret', box(BODY.halfWidth * 2, BODY.roofY - BODY.floorY, BODY.frontZ - BODY.rearZ), 0,
    (BODY.roofY + BODY.floorY) / 2, (BODY.frontZ + BODY.rearZ) / 2);
  // the sight head on the roof, seated 1 cm into it
  P.add('turretDetail', box(.44, .26, .36), .52, BODY.roofY + .12, BODY.frontZ - .40);
  P.add('turretGlass', box(.30, .12, .012), .52, BODY.roofY + .13, BODY.frontZ - .215);
  const muzzleZ = spec.armor.gunBarrel.lengthM;
  (spec.gun.muzzles ?? []).forEach((axis, index) => {
    const x = axis.x ?? 0, y = axis.y ?? 0;
    const side = Math.sign(x) || 1;
    // the trunnion from inside the body out into the gun's cradle: a body of revolution about the pitch axis
    const inner = BODY.halfWidth - .10, outer = Math.abs(x) + .04;
    P.addGunExtra(cylX(.14, outer - inner, n), side * (inner + outer) / 2, y, 0);
    P.addGunExtra(box(.30, .36, .95), x, y, .05);
    P.add(`gunBarrel${index}`, cylZ(barrelR, muzzleZ - .48, n), x, y, (muzzleZ + .48) / 2);
    P.add(`gunBarrel${index}Dark`, cylZ(barrelR * 1.35, .22, n), x, y, muzzleZ - .11);
    P.add(`gunBarrel${index}Dark`, cylZ(barrelR * .5, .02, n), x, y, muzzleZ - .005);
  });
  P.muzzleZ = muzzleZ;
  P.topY = BODY.roofY + .25;
}

export function buildLoara(P: TankBuilderPort): void {
  buildPT91Twardy(P);
  removeDonorTurret(P);
  twinStation(P, P.spec.armor.gunBarrel.radiusM);
}

export const LOARA_PROFILES = {
  pza_loara: { build: buildLoara },
} as const;
