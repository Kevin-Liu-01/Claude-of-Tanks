// Release 269 REGISTRAR PLACEHOLDER (R0): the two Marksmen, Finland's ItPsv 90 on the fleet's T-55A hull and running gear
// (profiles/t54Family.ts) and the ItPsv Leopard 2 on its Leopard 2A4 hull and running gear (profiles/leopard2A4Family.ts),
// their real chassis, each under the one box turret with a 35 mm barrel on each side, so both ids are complete playable
// vehicles while builder M authors the measured Marksman turret (one module, both hulls) in this group. Every firing datum
// is read from the spec (marksmanSpecs.ts): the ring, the trunnion and the twin fire axes.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { buildT55A } from './t54Family.ts';
import { LEOPARD2A4_FAMILY_PROFILES } from './leopard2A4Family.ts';

const { box, cylX, cylY, cylZ } = KIT;

/** The placeholder Marksman turret body, as the spec's turret plates (marksmanSpecs.ts BODY). */
const BODY = Object.freeze({ halfWidth: 1.20, floorY: .04, roofY: 1.05, rearZ: -1.60, frontZ: 1.20 });

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

export function buildMarksmanT55(P: TankBuilderPort): void {
  buildT55A(P);
  removeDonorTurret(P);
  twinStation(P, P.spec.armor.gunBarrel.radiusM);
}

export function buildItpsvLeopard2(P: TankBuilderPort): void {
  LEOPARD2A4_FAMILY_PROFILES.leo2a4.build(P);
  removeDonorTurret(P);
  twinStation(P, P.spec.armor.gunBarrel.radiusM);
}

export const MARKSMAN_PROFILES = {
  marksman_t55: { build: buildMarksmanT55 },
  itpsv_leopard2: { build: buildItpsvLeopard2 },
} as const;
