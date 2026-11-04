// Release 269, the second air-defence round (owner 2026-11-03: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV
// 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)", then "also based the lvkv 9040 on the correct cv9040 mk 4
// hull"): the Swedish Luftvärnskanonvagn 9040's turret, ONE 40 mm Bofors L/70 and the PS-95 search radar's drum, on the
// CV90 Mk IV chassis (docs/references/tanks/lvkv9040.md).
//
// The gun, ammunition and HP rows are the registrar's (269 R0); the chassis rows follow the Mk IV; the turret envelope and
// every spatial datum are the measured build's (profiles/lvkv9040.ts on the fleet's CV90 Mk IV hull and running gear,
// profiles/cv90MkivSourceX.ts), read from the frame both files share (profiles/lvkv9040Frame.ts). Combat numbers are game
// tuning on published figures, not weapon specifications. First-party: Kevin B. Liu (NOTICE.md).
import './suppliedSourceFleetSpecs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';
import {
  LVKV_GUN, LVKV_MUZZLE_Z, LVKV_RADAR, LVKV_SIGHTS, LVKV_TRUNNION, LVKV_TURRET as T,
} from './profiles/lvkv9040Frame.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];
type Face = 'left' | 'right' | 'floor' | 'roof' | 'rear' | 'front';

const BASE_ID = 'cv90_mk4';

/** One convex armour polygon, its corners wound counter-clockwise seen from outside. */
function polygon(name: string, verts: Point[], keMm: number, ceMm: number): ArmorPlate {
  return { ...plate(name, keMm, verts[0], verts[1], verts[2], { keMm, ceMm, kind: 'main' }), verts, convexPolygon: true };
}

// A convex box of six outward-wound faces (the TOS-1A cradle's supportBox, tos1aTagilSpecs.ts), less the faces another
// part of the same shell covers.
function boxPlates(name: string, min: Point, max: Point, keMm: number, ceMm: number, omit: readonly Face[] = []): ArmorPlate[] {
  const c: Point = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const h: Point = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
  const at = (x: number, y: number, z: number): Point => [c[0] + x * h[0], c[1] + y * h[1], c[2] + z * h[2]];
  return ([
    ['left', [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
    ['right', [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
    ['floor', [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
    ['roof', [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
    ['rear', [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
    ['front', [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
  ] as const).filter(([face]) => !omit.includes(face)).map(([face, corners]) =>
    polygon(`${name}_${face}`, corners.map(([x, y, z]) => at(x, y, z)), keMm, ceMm));
}

// The CV90 Mk IV's chassis record: its hull armour, hull modules, driver, running gear and automotive character.
const spec = cloneFleetVariant(registries.tankSpecs, 'lvkv9040', BASE_ID, {
  name: 'Lvkv 9040', nation: 'Sweden', era: 'modern', role: 'ifv',
});
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
delete spec.variantOf;
delete spec.gunPitchByYawDeg;
stripSilhouetteDimensions(spec.dims);
// The turret's figures: en.wikipedia (Combat Vehicle 90, the variant table's Lvkv 90 column): crew 4, the PS-95 search
// radar (Thomson-CSF Harfang), "a high elevation 40 mm autocannon"; weaponsystems.net (CV 90 TriAD): -8 to +50 degrees (the
// War Thunder forum's Artilleri Tidskrift 4/2004 digest the same); the registrar's +60 stands (a combat row; the build
// clears it). The chassis is the Mk IV's at the owner's ruling (2026-11-03): BAE Systems' Mk IV figures, the Scania DC16 at
// 1,000 hp and a weight grown from 35 to 37 t (Army Recognition; the CV9035 DK's 37 t on the same hull, denmarkSpecs.ts),
// ~70 km/h. The dims are the build's: the Mk IV hull's 6.622 m (its own record's), the length with the L/70 forward, the
// width over the Mk IV hull's skirts (3.33 m; the Mk IV is published at 3.2 m), the height over the radar drum.
Object.assign(spec, {
  hp: 2350, enginePowerHp: 1000, weightTons: 37, topSpeedKmh: 70, reverseSpeedKmh: 40, hullTraverseDegS: 46,
  turretTraverseDegS: 60, gunPitchDegS: 48, gunElevationDeg: 60, gunDepressionDeg: 8,
});
spec.dims = { hullLengthM: 6.622, overallLengthM: 6.87, widthM: 3.33, heightM: 3.40 };
// The gun's measured stops on the Mk IV hull (builder S: gunHullClearance's probe at 2.6 cm, every degree of yaw, bisected
// to 0.05 degrees and fitted by tools/gun-depression-sweep.mjs --envelope): the full 8 degrees but over the bow's corner
// lamp receivers (to -6.6 at 12-16 degrees) and over the Mk IV's raised troop roof and rear ramp astern (to -3.1 at 166-169
// degrees, -4.5 straight back).
spec.gunPitchByYawDeg = Object.freeze([[0, -8], [8, -8], [9, -7.9], [10, -7.2], [11, -6.8], [12, -6.6], [16, -6.6], [23, -7.5],
  [24, -8], [139, -8], [141, -6.9], [144, -6], [145, -5.1], [146, -4.9], [157, -4.5], [159, -4.1], [166, -3.1], [169, -3.1],
  [170, -3.3], [171, -3.7], [172, -4.5], [180, -4.5]] as const);
spec.armor.gunPivot = [...LVKV_TRUNNION];
spec.armor.gunBarrel = { lengthM: LVKV_MUZZLE_Z, radiusM: LVKV_GUN.barrelR };
// the welded turret (profiles/lvkv9040Frame.ts): the rear section to the seam, the front section to its front roof edge
// and the sloped front plate down to its foot (the plan-chamfered corners as the front plate's sides)
const { floorY: F, bustleRoofY: RB, frontRoofY: RF, halfWBottom: W, rearZ, stepZ0, stepZ1, roofFrontZ, footZ, footY } = T;
const footW = T.footHalfW, edgeW = T.roofFrontHalfW;
spec.armor.turretPlates = [
  ...boxPlates('lvkv9040_rear', [-W, F, rearZ], [W, RB, stepZ0], 30, 35, ['front']),
  // the roof's rise at the seam: its two walls, its floor and the ramp
  ...[-1, 1].map((s) => {
    const wall: Point[] = [[s * W, F, stepZ0], [s * W, F, stepZ1], [s * W, RF, stepZ1], [s * W, RB, stepZ0]];
    return polygon(`lvkv9040_step_${s < 0 ? 'r' : 'l'}`, s < 0 ? wall : wall.reverse(), 30, 35);
  }),
  polygon('lvkv9040_step_floor', [[-W, F, stepZ0], [W, F, stepZ0], [W, F, stepZ1], [-W, F, stepZ1]], 30, 35),
  polygon('lvkv9040_step_roof', [[-W, RF, stepZ1], [W, RF, stepZ1], [W, RB, stepZ0], [-W, RB, stepZ0]], 30, 35),
  ...boxPlates('lvkv9040_front', [-W, F, stepZ1], [W, RF, roofFrontZ], 30, 35, ['rear', 'front']),
  // the sloped front plate, the floor under it and its plan-chamfered corners
  polygon('lvkv9040_front_plate', [[-footW, footY, footZ], [footW, footY, footZ], [edgeW, RF, roofFrontZ], [-edgeW, RF, roofFrontZ]], 30, 35),
  polygon('lvkv9040_front_floor', [[-W, F, roofFrontZ], [W, F, roofFrontZ], [footW, F, footZ], [-footW, F, footZ]], 30, 35),
  ...[-1, 1].map((s) => {
    const corner: Point[] = [[s * W, F, roofFrontZ], [s * footW, F, footZ], [s * edgeW, RF, roofFrontZ]];
    return polygon(`lvkv9040_front_corner_${s < 0 ? 'r' : 'l'}`, s < 0 ? corner : corner.reverse(), 30, 35);
  }),
];
// Turret-local volumes (internalLayoutRegistry.ts spaaLvkv9040: the gunner front left, the commander front right, the
// radar operator rear left; the 24-round ready clips over the breech, the rest of the 240 in the Mk IV hull's rack): the
// sight heads over the front roof, the gun's cradle and breech about the trunnion, the radio and the ready rounds under the
// rear section's roof.
const [, gy, gz] = LVKV_TRUNNION, gunner = LVKV_SIGHTS.gunner;
spec.armor.modules = [
  ...spec.armor.modules.filter((box) => !box.turretLocal),
  moduleBox('optics', [gunner.x - gunner.w / 2, RF - 0.18, gunner.z - gunner.d / 2],
    [gunner.x + gunner.w / 2, RF + 0.10, gunner.z + gunner.d / 2], true),
  moduleBox('gun', [-.18, gy - .24, gz - .95], [.18, gy + .24, gz + .55], true),
  moduleBox('ammoRack', [-.17, .20, -.80], [.17, .60, gz - .99], true),
  moduleBox('radio', [-.78, .12, -1.12], [-.30, .50, -.66], true),
];
// crew 4: the driver in the Mk IV hull (the Mk IV's own gunner and commander sit in its hull, under its unmanned turret:
// they stay behind); the gunner (+x, the left) and the commander in the front section beside the gun, the radar operator
// behind the gunner under the drum
spec.armor.crew = [
  ...spec.armor.crew.filter((box) => !box.turretLocal && box.crew === 'driver'),
  crewBox('gunner', [.20, .10, -.04], [.76, .76, .50], true),
  crewBox('commander', [-.76, .10, -.30], [-.20, .76, .46], true),
  crewBox('radioOperator', [.20, .10, -1.10], [.76, .62, -.08], true),
];
// One gun, so the 268 rows' twin-35 mm package (gepardSpecs.ts) scaled by calibre (x 40/35): penetration and damage up,
// the cycle a seventh slower (0.40 s against 0.35). The Bofors 40 mm APFSDS-T at ~1,500 m/s and the 3P programmable
// round at ~1,025 m/s; 240 rounds in ten 24-round magazines (the Strf 9040's 234 rounded to whole magazines), two of
// them armour-piercing.
spec.gun = {
  ...spec.gun, caliberMm: 40, reloadS: .40, baseAccuracy: .25, aimTimeS: 1.05, soundProfile: 'bofors-40',
  shells: [
    shell('40 mm APFSDS-T', 'APFSDS', 40, 167, 150, 70, 1500, { pen2000Mm: 134, reloadS: .40, count: 48 }),
    shell('40 mm 3P HE-T', 'HE', 40, 9, 9, 64, 1025, { pen2000Mm: 9, reloadS: .40, count: 192 }),
  ],
};
for (const key of ['launcherSalvo', 'autoloader', 'fixedLaunchCanisters', 'primaryGuided', 'muzzleBoreSegments', 'launcherMuzzles', 'muzzles'] as const) {
  delete spec.gun[key];
}
// The Swedish M90 splinter of the Strv 122 and the CV90 (Sweden's Factory coat, camoPolicy.ts service_strv122), worn as
// the spec coat; the CV90's roundel (photo 01 carries the unit's white lozenge)
spec.visual = { ...spec.visual, scheme: 'splinter', base: '#34493c', weather: '#4b5b4c',
  patches: ['#202b26', '#5c644c', '#81745a'], camoScale: .42, marking: 'roundel', number: '9040' };

/** The farthest the build reaches from the hull origin: the muzzle with the gun forward, or the radar drum's top rim. */
function reach(record: FleetTankSpec): number {
  const [, ty, tz] = record.armor.turretPivot;
  const muzzle = Math.hypot(ty + gy, tz + gz) + LVKV_MUZZLE_Z;
  const drum = Math.hypot(Math.hypot(LVKV_RADAR.x, LVKV_RADAR.z) + LVKV_RADAR.r + 0.02, ty + LVKV_RADAR.topY, Math.abs(tz) + 0.02);
  return Math.max(muzzle, drum);
}
spec.armor.boundingRadiusM = Math.max(spec.armor.boundingRadiusM, reach(spec));

registerFleetSpecs(registries, ['lvkv9040'], { lvkv9040: spec });

let synchronized = false;
/**
 * Registration hook (fleetRegistration.ts, after every registration-time pass that rewrites a hull frame): the CV90 Mk
 * IV's final hull frame (hull plates, ring, hull modules, driver, track width) under this id's own turret records, so the
 * armour matches the hull profiles/lvkv9040.ts builds. Idempotent.
 */
export function synchronizeLvkv9040Frame(): void {
  if (synchronized) return;
  synchronized = true;
  const base = TANK_SPECS[BASE_ID], own = TANK_SPECS.lvkv9040;
  own.armor.hullPlates = structuredClone(base.armor.hullPlates);
  own.armor.turretPivot = [...base.armor.turretPivot];
  own.armor.modules = [...structuredClone(base.armor.modules.filter((box) => !box.turretLocal)),
    ...own.armor.modules.filter((box) => box.turretLocal)];
  // (the Mk IV seats its gunner and commander in the hull under its unmanned turret: only its driver comes across)
  own.armor.crew = [...structuredClone(base.armor.crew.filter((box) => !box.turretLocal && box.crew === 'driver')),
    ...own.armor.crew.filter((box) => box.turretLocal)];
  own.visual.trackWidthM = base.visual.trackWidthM;
  own.armor.boundingRadiusM = Math.max(base.armor.boundingRadiusM, reach(own));
}
