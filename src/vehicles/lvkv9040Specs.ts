// Release 269, the second air-defence round (owner 2026-11-03: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV
// 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)"): the Swedish Luftvärnskanonvagn 9040, ONE 40 mm Bofors L/70 and
// the search radar's drum on the CV90 chassis (docs/references/tanks/lvkv9040.md).
//
// REGISTRAR PLACEHOLDER (269 R0): the combat rows are final-intent; the turret envelope and spatial datums are the
// placeholder build's (profiles/lvkv9040.ts: the fleet's CV90 hull and running gear, profiles/cv90.ts, under a box turret
// and its one 40 mm barrel). Builder S replaces both files and keeps the datums here equal to the geometry. Combat
// numbers are game tuning on published figures, not weapon specifications. First-party: Kevin B. Liu (NOTICE.md).
import './modern3Specs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];

const BASE_ID = 'cv90';
/** The placeholder turret body (turret-local: ring plane y 0, +z forward), the same box profiles/lvkv9040.ts draws. */
const BODY = Object.freeze({ halfWidth: .95, floorY: .04, roofY: .85, rearZ: -1.30, frontZ: 1.05 });
const GUN_PIVOT: Point = [0, .50, .85];
const MUZZLE_Z = 3.40;

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

// The CV90's chassis record: its hull armour, hull modules, driver, running gear and automotive character.
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
// en.wikipedia (Combat Vehicle 90, the variant table's Lvkv 90 column): 23.2 t, 3.17 m wide, crew 4, the PS-95 search
// radar (Thomson-CSF Harfang; the brief's "PS-70/R" is not supported), "a high elevation 40 mm autocannon". hhogman.se
// (Strf 9040A): the Scania DSI 14 at 550 hp, 70 km/h, 6.55 m, 3.17 m. No elevation is published: -8 (the Strf 9040's
// published depression) to +60 degrees, the registrar's choice between the fan wiki's 50 and the towed L/70's 90. The
// table's 7.9 m length and 2.65 m height are not used (the same hull and gun make the Strf's 6.55 m; the radar drum
// stands well over 2.65 m): the height is an estimate, the turret roof's 2.7 m and the drum's ~0.9 m (photo 01).
Object.assign(spec, {
  hp: 2350, enginePowerHp: 550, weightTons: 23.2, topSpeedKmh: 70, reverseSpeedKmh: 40, hullTraverseDegS: 46,
  turretTraverseDegS: 60, gunPitchDegS: 48, gunElevationDeg: 60, gunDepressionDeg: 8,
});
spec.dims = { hullLengthM: 5.904, overallLengthM: 6.55, widthM: 3.17, heightM: 3.60 };
spec.armor.gunPivot = [...GUN_PIVOT];
spec.armor.gunBarrel = { lengthM: MUZZLE_Z, radiusM: .058 };
spec.armor.turretPlates = boxPlates('lvkv9040_turret', [-BODY.halfWidth, BODY.floorY, BODY.rearZ],
  [BODY.halfWidth, BODY.roofY, BODY.frontZ], 30, 35);
const turretModules = [
  moduleBox('optics', [.30, .55, .60], [.70, .80, .95], true),
  moduleBox('gun', [-.16, GUN_PIVOT[1] - .22, GUN_PIVOT[2] - .80], [.16, GUN_PIVOT[1] + .22, GUN_PIVOT[2] + .40], true),
];
// the CV90's radio rides in its turret: the placeholder keeps one there
if (!spec.armor.modules.some((box) => box.module === 'radio' && !box.turretLocal)) {
  turretModules.push(moduleBox('radio', [-.70, .05, -1.15], [-.25, .45, -.70], true));
}
spec.armor.modules = [...spec.armor.modules.filter((box) => !box.turretLocal), ...turretModules];
// crew 4: the driver in the CV90 hull; the gunner (+x, the left), the commander and the radar operator in the turret
spec.armor.crew = [
  ...spec.armor.crew.filter((box) => !box.turretLocal),
  crewBox('gunner', [.12, .08, -.35], [.75, .72, .45], true),
  crewBox('commander', [-.75, .08, -.35], [-.12, .72, .45], true),
  crewBox('radioOperator', [.12, .08, -1.15], [.75, .70, -.50], true),
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

function reach(record: FleetTankSpec): number {
  const [, ty, tz] = record.armor.turretPivot;
  return Math.hypot(ty + GUN_PIVOT[1], tz + GUN_PIVOT[2]) + MUZZLE_Z;
}
spec.armor.boundingRadiusM = Math.max(spec.armor.boundingRadiusM, reach(spec));

registerFleetSpecs(registries, ['lvkv9040'], { lvkv9040: spec });

let synchronized = false;
/**
 * Registration hook (fleetRegistration.ts, after every registration-time pass that rewrites a hull frame): the CV90's
 * final hull frame (hull plates, ring, hull modules, driver, track width) under this id's own turret records, so the
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
  own.armor.crew = [...structuredClone(base.armor.crew.filter((box) => !box.turretLocal)),
    ...own.armor.crew.filter((box) => box.turretLocal)];
  own.visual.trackWidthM = base.visual.trackWidthM;
  own.armor.boundingRadiusM = Math.max(base.armor.boundingRadiusM, reach(own));
}
