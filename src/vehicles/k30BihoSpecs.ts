// Release 269, the second air-defence round (owner 2026-11-03: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV
// 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)"): the ROK Army's K30 Biho, two 30 mm KCB on a lengthened
// K200A1 chassis (docs/references/tanks/k30_biho.md).
//
// REGISTRAR PLACEHOLDER (269 R0): the combat rows are final-intent; the hull, the turret envelope and every spatial datum
// are the placeholder build's (profiles/k30Biho.ts: the fleet has no K200, so the ROK Army's BMP-3 hull and running gear,
// profiles/afvFamily.ts, stand in under a box turret with one 30 mm barrel on each side). Builder K writes the K200-family
// hull and the turret in the group files and keeps the datums here equal to the geometry. Combat numbers are game tuning
// on published figures, not weapon specifications. First-party: Kevin B. Liu (NOTICE.md).
import './afvFamily.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];

/** The placeholder's stand-in hull (builder K replaces it with the K200 family's). */
const BASE_ID = 'bmp3_rok';
/** The placeholder turret body (turret-local: ring plane y 0, +z forward), as profiles/k30Biho.ts draws it. Its floor
 * stands over the BMP-3 deck's raised mid strip at every bearing (gm352AirDefenseSpecs.ts, the same hull). */
const BODY = Object.freeze({ halfWidth: .95, floorY: .12, roofY: .97, rearZ: -1.40, frontZ: 1.00 });
const GUN_PIVOT: Point = [0, .55, .40];
const GUN_X = 1.10;
const MUZZLE_Z = 2.60;

// A convex box of six outward-wound faces (the TOS-1A cradle's supportBox, tos1aTagilSpecs.ts).
function boxPlates(name: string, min: Point, max: Point, keMm: number, ceMm: number): ArmorPlate[] {
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
  ] as const).map(([face, corners]) => {
    const verts = corners.map(([x, y, z]) => at(x, y, z));
    return { ...plate(`${name}_${face}`, keMm, verts[0], verts[1], verts[2], { keMm, ceMm, kind: 'main' }),
      verts, convexPolygon: true };
  });
}

// The stand-in hull's record: a light aluminium-and-steel IFV hull, the class of the K200's
const spec = cloneFleetVariant(registries.tankSpecs, 'k30_biho', BASE_ID, {
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
spec.dims = { hullLengthM: 6.77, overallLengthM: 6.77, widthM: 3.00, heightM: 4.05 };
spec.armor.gunPivot = [...GUN_PIVOT];
spec.armor.gunBarrel = { lengthM: MUZZLE_Z, radiusM: .04, collision: false };
spec.armor.turretPlates = boxPlates('k30_turret', [-BODY.halfWidth, BODY.floorY, BODY.rearZ],
  [BODY.halfWidth, BODY.roofY, BODY.frontZ], 15, 20);
const turretModules = [
  moduleBox('optics', [.30, .55, .60], [.70, .84, .95], true),
  { ...moduleBox('gun', [-GUN_X - .16, GUN_PIVOT[1] - .22, GUN_PIVOT[2] - .45],
    [GUN_X + .16, GUN_PIVOT[1] + .22, GUN_PIVOT[2] + .65], true), external: true },
];
// the stand-in hull's radio rides in its turret: the placeholder keeps one there
if (!spec.armor.modules.some((box) => box.module === 'radio' && !box.turretLocal)) {
  turretModules.push(moduleBox('radio', [-.80, .30, -1.30], [-.40, .70, -.90], true));
}
spec.armor.modules = [...spec.armor.modules.filter((box) => !box.turretLocal), ...turretModules];
// crew 4: the driver in the hull; the gunner (+x, the left), the commander and the radar operator in the turret
spec.armor.crew = [
  ...spec.armor.crew.filter((box) => !box.turretLocal),
  crewBox('gunner', [.10, .16, -.40], [.75, .80, .40], true),
  crewBox('commander', [-.75, .16, -.40], [-.10, .80, .40], true),
  crewBox('radioOperator', [.10, .16, -1.25], [.70, .75, -.55], true),
];
// The 2K22M Tunguska-M's 30 mm rows (gm352AirDefenseSpecs.ts, the BMPT twin 2A42 package at tier V) for the KCB's
// 30 x 170 mm, the HEI-T at the KCB's ~1,080 m/s; the 600 rounds split evenly, as the Tunguska's.
spec.gun = {
  ...spec.gun, caliberMm: 30, reloadS: .30, baseAccuracy: .26, aimTimeS: 1.10, soundProfile: 'mk30-2',
  muzzles: [{ x: -GUN_X, y: 0 }, { x: GUN_X, y: 0 }],
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
  camoScale: .5, marking: 'number', number: '312' };

function reach(record: FleetTankSpec): number {
  const [, ty, tz] = record.armor.turretPivot;
  return Math.hypot(GUN_X, ty + GUN_PIVOT[1], tz + GUN_PIVOT[2]) + MUZZLE_Z;
}
spec.armor.boundingRadiusM = Math.max(spec.armor.boundingRadiusM, reach(spec));

registerFleetSpecs(registries, ['k30_biho'], { k30_biho: spec });

let synchronized = false;
/**
 * Registration hook (fleetRegistration.ts, after every registration-time pass that rewrites a hull frame): the stand-in
 * hull's final frame (hull plates, ring, hull modules, driver, track width) under this id's own turret records, so the
 * armour matches the hull profiles/k30Biho.ts builds. Builder K's K200 hull replaces the stand-in here. Idempotent.
 */
export function synchronizeK30BihoFrame(): void {
  if (synchronized) return;
  synchronized = true;
  const base = TANK_SPECS[BASE_ID], own = TANK_SPECS.k30_biho;
  own.armor.hullPlates = structuredClone(base.armor.hullPlates);
  own.armor.turretPivot = [...base.armor.turretPivot];
  own.armor.modules = [...structuredClone(base.armor.modules.filter((box) => !box.turretLocal)),
    ...own.armor.modules.filter((box) => box.turretLocal)];
  own.armor.crew = [...structuredClone(base.armor.crew.filter((box) => !box.turretLocal)),
    ...own.armor.crew.filter((box) => box.turretLocal)];
  own.visual.trackWidthM = base.visual.trackWidthM;
  own.armor.boundingRadiusM = Math.max(base.armor.boundingRadiusM, reach(own));
}
