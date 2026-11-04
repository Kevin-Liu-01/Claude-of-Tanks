// Release 269, the second air-defence round (owner 2026-11-03: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV
// 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)"): the ROK Army's K30 Biho, two 30 mm KCB on a lengthened
// K200A1 chassis (docs/references/tanks/k30_biho.md).
//
// The combat rows (hit points, mobility, the guns' rounds and handling) are the registrar's (269 R0) final intent; the
// armour envelope, the modules, the crew and every spatial datum follow the measured build (profiles/k30Biho.ts on the
// K200 family's hull, profiles/k200Hull.ts), read from the layouts both share (profiles/k200HullLayout.ts K30_HULL,
// profiles/k30BihoLayout.ts). The record's non-spatial defaults come from the fleet's other ROK Army light hull, the
// BMP-3 (ROK). Combat numbers are game tuning on published figures, not weapon specifications. First-party: Kevin B. Liu
// (NOTICE.md).
import './afvFamily.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, frontPlate, leftSidePlate, moduleBox, plate, rearPlate, rightSidePlate, roofPlate, shell,
  type ArmorPlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';
import { K30_HULL, k200Driver, k200HullModules, k200HullPlates } from './profiles/k200HullLayout.ts';
import { K30_GUN_PIVOT, K30_GUNS, K30_TURRET, K30_TURRET_PIVOT } from './profiles/k30BihoLayout.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);

/** The record template for the non-spatial defaults (the ROK Army's other light hull in the fleet). */
const TEMPLATE_ID = 'bmp3_rok';
/** The turret's steel (7.62 mm and splinters), physical / KE / CE. */
const TURRET_ARMOUR = Object.freeze({ keMm: 15, ceMm: 20 });

/** Both sides of a plate pair (the helpers' `_R` is the +x plate, `_L` its mirror). */
function sidePair(name: string, xB: number, yB: number, xT: number, yT: number, zR: number, zF: number): ArmorPlate[] {
  return [rightSidePlate(`${name}_R`, 15, xB, yB, xT, yT, zR, zF, TURRET_ARMOUR),
    leftSidePlate(`${name}_L`, 15, xB, yB, xT, yT, zR, zF, TURRET_ARMOUR)];
}

/** The turret's plates, turret-local, on the build's bodies (profiles/k30Biho.ts k30Turret). */
function k30TurretPlates(): ArmorPlate[] {
  const { front: F, rear: R, eots: E } = K30_TURRET;
  // the rear body's front face beside the front body, each side (x from the front body's flank out to the shoulder)
  const cheek = (s: number): ArmorPlate => plate(`turret_cheek_${s > 0 ? 'R' : 'L'}`, 15,
    [s * F.halfX, R.bottomY, R.frontZ], [s * R.upHalf, R.bottomY, R.frontZ], [s * F.halfX, F.deckY, R.frontZ], TURRET_ARMOUR);
  return [
    frontPlate('turret_front', 15, F.halfX - 0.06, F.bottomY + 0.08, F.frontZ, F.faceTopY, F.frontZ, TURRET_ARMOUR),
    frontPlate('turret_front_chamfer', 15, F.halfX - 0.04, F.faceTopY, F.frontZ, F.deckY, F.deckFrontZ, TURRET_ARMOUR),
    ...sidePair('turret_front_side', F.halfX, F.bottomY, F.halfX, F.deckY, F.rearZ, F.frontZ - 0.06),
    roofPlate('turret_front_deck', 15, F.halfX, F.deckY, R.frontZ, F.deckFrontZ, TURRET_ARMOUR),
    frontPlate('turret_step', 15, R.roofHalf, F.deckY, R.frontZ, R.roofY, R.frontZ, TURRET_ARMOUR),
    cheek(1), cheek(-1),
    ...sidePair('turret_base', R.lowHalf, R.bottomY, R.lowHalf, R.waistY, R.rearZ, R.frontZ),
    ...sidePair('turret_side_lower', R.lowHalf, R.waistY, R.upHalf, R.shoulderY, R.rearZ, R.frontZ),
    ...sidePair('turret_side', R.upHalf, R.shoulderY, R.upHalf, R.eaveY, R.rearZ, R.frontZ),
    rearPlate('turret_rear', 15, R.upHalf, R.bottomY, R.rearZ, R.roofY, R.rearZ, TURRET_ARMOUR),
    roofPlate('turret_roof', 15, R.roofHalf, R.roofY, R.rearZ, R.frontZ, TURRET_ARMOUR),
    // the EOTS head's window on the deck
    plate('eots_window', 10, [-E.halfX, E.sillY, E.frontZ], [E.halfX, E.sillY, E.frontZ], [-E.halfX, E.topY, E.browZ],
      { keMm: 10, ceMm: 12, kind: 'external' }),
  ];
}

/** The farthest any part reaches from the hull origin: the muzzles at 0 degrees, the radar's top corners, the hull's. */
function boundingRadius(): number {
  const [, ty, tz] = K30_TURRET_PIVOT, [, gy, gz] = K30_GUN_PIVOT, R = K30_TURRET.radar, L = K30_HULL;
  return Math.max(
    Math.hypot(K30_GUNS.gunX, ty + gy, tz + gz) + K30_GUNS.muzzleZ,
    Math.hypot(R.width / 2, ty + R.iffTopY, tz + R.mastZ - 0.25),
    Math.hypot(L.skirtOuterX, L.roofY, L.bowZ + 0.15),
  );
}

/** The K200 hull's frame on the record: its plates, its modules, the driver, the track, the ring (k200HullLayout.ts). */
function applyK200Frame(own: FleetTankSpec): void {
  const L = K30_HULL, [, , ringZ] = K30_TURRET_PIVOT;
  own.armor.hullPlates = k200HullPlates(L);
  own.armor.turretPivot = [...K30_TURRET_PIVOT];
  own.armor.modules = [...k200HullModules(L, ringZ, K30_TURRET.base.r + 0.02),
    ...own.armor.modules.filter((box) => box.turretLocal)];
  own.armor.crew = [k200Driver(L), ...own.armor.crew.filter((box) => box.turretLocal)];
  own.visual.trackWidthM = L.gear.trackW;
  own.armor.boundingRadiusM = boundingRadius();
}

const spec = cloneFleetVariant(registries.tankSpecs, 'k30_biho', TEMPLATE_ID, {
  name: 'K30 Biho', nation: 'South Korea', era: 'modern', role: 'ifv',
});
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
delete spec.variantOf;
delete spec.gunPitchByYawDeg;
stripSilhouetteDimensions(spec.dims);
// en.wikipedia (K30 Biho): 26.5 t, 6.77 m, 3.0 m wide (the brief's 3.30 m is not on the page), 4.05 m with the radar up
// (the brief's 4.07 m), crew 4, the MAN-Doosan D2840L at 520 hp, 65 km/h (the brief's 60), 500 km, 176 built, in service
// from 1999; two KCB 30 x 170 mm at 600 rpm, 300 rounds a gun; the TPS-830K X-band pulse-Doppler search radar (17 km on a
// 2 m2 target) and the EO tracking system. The gun limits are not on the page: ARMSNET's -10 to +85 degrees.
Object.assign(spec, {
  hp: 2150, enginePowerHp: 520, weightTons: 26.5, topSpeedKmh: 65, reverseSpeedKmh: 20, hullTraverseDegS: 46,
  turretTraverseDegS: 70, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 10,
});
// the measured hull (photograph 07: 6.43 m from the trim vane's face to the rear plate; the published 6.77 m is longer by
// 5 %, the packet records the conflict), the length over the tail lights' guards and the tow eyes, the published width
// (the skirts' outer faces) and height (the IFF box on the raised antenna)
spec.dims = { hullLengthM: K30_HULL.lengthM, overallLengthM: 6.58, widthM: 3.00, heightM: 4.05 };
spec.armor.gunPivot = [...K30_GUN_PIVOT];
spec.armor.gunBarrel = { lengthM: K30_GUNS.muzzleZ, radiusM: K30_GUNS.barrelR, collision: false };
spec.armor.turretPlates = k30TurretPlates();
{
  const G = K30_GUNS, T = K30_TURRET, [, gy, gz] = K30_GUN_PIVOT;
  spec.armor.modules = [
    ...spec.armor.modules.filter((box) => !box.turretLocal),
    // the EOTS head and its laser rangefinder on the front deck
    moduleBox('optics', [-(T.eots.halfX + 0.09), T.eots.baseY - 0.01, T.eots.rearZ], [T.eots.halfX, T.eots.topY, T.eots.frontZ], true),
    // the two housings, pitching with the trunnion
    { ...moduleBox('gun', [-G.housingOuter, gy + G.housingBottomY, gz - G.housingArcR], [G.housingOuter, gy + G.housingTopY,
      gz + G.collarFrontZ], true), gunFollow: true, external: true },
    // the 600 belted rounds in the central front body between the guns, under its deck, and the two belt feeds behind
    // them (internalLayoutRegistry.ts spaaK30: ifvAmmoBoxes, dualBeltFeed; the feeds' own box, so the one combat anatomy
    // derives from the housings does not land in the ammunition)
    moduleBox('ammoRack', [-(T.front.halfX - 0.06), T.front.bottomY + 0.06, T.rear.frontZ + 0.27],
      [T.front.halfX - 0.06, T.front.deckY - 0.06, T.front.deckFrontZ - 0.04], true),
    moduleBox('feedSystem', [-(T.front.halfX - 0.06), T.front.bottomY + 0.06, T.rear.frontZ + 0.01],
      [T.front.halfX - 0.06, T.front.deckY - 0.06, T.rear.frontZ + 0.23], true),
    // the radar's and the radios' electronics at the rear right
    moduleBox('radio', [-(T.rear.lowHalf - 0.04), 0.30, T.rear.rearZ + 0.08], [-0.20, 0.85, T.rear.rearZ + 0.53], true),
  ];
}
// crew 4 (internalLayoutRegistry.ts spaaK30): the driver in the hull (applyK200Frame); the gunner front left (+x) and the
// commander front right in the rear body under their roof sight and hatch, the radar operator behind the gunner; all
// three seated over the deck inside the body (0.97 m of headroom), its floor the turret's
{
  const R = K30_TURRET.rear, floor = R.bottomY + 0.01, head = R.roofY - 0.04, side = R.lowHalf - 0.04;
  spec.armor.crew = [
    crewBox('gunner', [0.06, floor, -0.45], [side, head, 0.15], true),
    crewBox('commander', [-side, floor, -0.75], [-0.06, head, -0.05], true),
    crewBox('radioOperator', [0.06, floor, R.rearZ + 0.08], [side, head, -0.60], true),
  ];
}
applyK200Frame(spec);
// The 2K22M Tunguska-M's 30 mm rows (gm352AirDefenseSpecs.ts, the BMPT twin 2A42 package at tier V) for the KCB's
// 30 x 170 mm, the HEI-T at the KCB's ~1,080 m/s; the 600 rounds split evenly, as the Tunguska's. One fire axis a
// housing (barrel groups 0 and 1, firing alternately).
spec.gun = {
  ...spec.gun, caliberMm: 30, reloadS: .30, baseAccuracy: .26, aimTimeS: 1.10, soundProfile: 'mk30-2',
  muzzles: [{ x: -K30_GUNS.gunX, y: 0 }, { x: K30_GUNS.gunX, y: 0 }],
  shells: [
    shell('30 mm APDS-T', 'APFSDS', 30, 125, 112, 52, 1120, { pen2000Mm: 100, reloadS: .30, count: 300 }),
    shell('30 mm HEI-T', 'HE', 30, 8, 8, 48, 1080, { pen2000Mm: 8, reloadS: .30, count: 300 }),
  ],
};
for (const key of ['launcherSalvo', 'autoloader', 'fixedLaunchCanisters', 'primaryGuided', 'muzzleBoreSegments', 'launcherMuzzles'] as const) {
  delete spec.gun[key];
}
// The ROK four-colour woodland of the photographs: the K2's green, black and brown woodland (camoPolicy.ts sig_k2), worn
// as the spec coat and the stock; photo 01's hull number
spec.visual = { ...spec.visual, scheme: 'nato', base: '#4c5844', weather: '#56624d', patches: ['#23261f', '#5a4a38'],
  camoScale: .5, marking: 'number', number: '312', trackWidthM: K30_HULL.gear.trackW };

registerFleetSpecs(registries, ['k30_biho'], { k30_biho: spec });

let synchronized = false;
/**
 * Registration hook (fleetRegistration.ts, after every registration-time pass that rewrites a hull frame): the K200
 * hull's frame (its plates, ring, hull modules, driver and track width, k200HullLayout.ts) under this id's own turret
 * records, so the armour stays the hull profiles/k30Biho.ts builds whatever a fleet pass did to the template's. Idempotent.
 */
export function synchronizeK30BihoFrame(): void {
  if (synchronized) return;
  synchronized = true;
  applyK200Frame(TANK_SPECS.k30_biho);
}
