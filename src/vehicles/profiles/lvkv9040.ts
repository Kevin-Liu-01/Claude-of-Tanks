// Release 269 REGISTRAR PLACEHOLDER (R0): the Lvkv 9040 on the fleet's CV90 hull and running gear (profiles/cv90.ts, its
// real chassis) under a box turret and its one 40 mm Bofors barrel, so the id is a complete playable vehicle while
// builder S authors the measured Lvkv turret and its radar drum in this file. Every firing datum is read from the spec
// (lvkv9040Specs.ts): the ring, the trunnion and the bore.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { CV90_PROFILES } from './cv90.ts';

const { box, cylX, cylY, cylZ } = KIT;
/** The CV90's own build, typed on its narrower port in profiles/cv90.ts; the factory hands every profile the full
 * TankBuilderPort, as it does the CV90's. */
const buildCv90 = CV90_PROFILES.cv90.build as unknown as (P: TankBuilderPort) => void;

/** The placeholder turret body, as the spec's turret plates (lvkv9040Specs.ts BODY). */
const BODY = Object.freeze({ halfWidth: .95, floorY: .04, roofY: .85, rearZ: -1.30, frontZ: 1.05 });

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
  // the donor's own bore declarations belong to its gun
  P.physicalMuzzleBore = undefined;
  P.muzzleMouth = undefined;
  P.muzzleAxisY = undefined;
}

function singleStation(P: TankBuilderPort): void {
  const spec = P.spec;
  const [tx, ty, tz] = spec.armor.turretPivot;
  const [gx, gy, gz] = spec.armor.gunPivot;
  P.turretG.position.set(tx, ty, tz);
  P.gunG.position.set(gx, gy, gz);
  const n = P.q ? 20 : 12;
  // the ring collar, sunk 2 cm into the deck and 2 cm into the body's floor, and the closed body on it
  P.add('turret', cylY(.86, .90, BODY.floorY + .04, P.q ? 32 : 20), 0, (BODY.floorY + .04) / 2 - .02, 0);
  P.add('turret', box(BODY.halfWidth * 2, BODY.roofY - BODY.floorY, BODY.frontZ - BODY.rearZ), 0,
    (BODY.roofY + BODY.floorY) / 2, (BODY.frontZ + BODY.rearZ) / 2);
  // the sight head on the roof, seated 1 cm into it
  P.add('turretDetail', box(.40, .24, .30), .50, BODY.roofY + .11, BODY.frontZ - .35);
  P.add('turretGlass', box(.28, .12, .012), .50, BODY.roofY + .12, BODY.frontZ - .195);
  // the trunnion across the gun port and the cradle, from inside the body out through its front face
  P.addGunExtra(cylX(.12, .50, n), 0, 0, 0);
  P.addGunExtra(box(.34, .34, .70), 0, 0, .25);
  const muzzleZ = spec.armor.gunBarrel.lengthM;
  const r = spec.armor.gunBarrel.radiusM;
  P.add('gun', cylZ(r, muzzleZ - .55, n), 0, 0, (muzzleZ + .55) / 2);
  // the Bofors' perforated flash eliminator, a darker sleeve over the last 0.30 m, and the bore's dark face
  P.add('gunDark', cylZ(r * 1.30, .30, n), 0, 0, muzzleZ - .15);
  P.add('gunDark', cylZ(r * .55, .02, n), 0, 0, muzzleZ - .005);
  P.muzzleZ = muzzleZ;
  P.topY = BODY.roofY + .23;
}

export function buildLvkv9040(P: TankBuilderPort): void {
  buildCv90(P);
  removeDonorTurret(P);
  singleStation(P);
}

export const LVKV9040_PROFILES = {
  lvkv9040: { build: buildLvkv9040 },
} as const;
