// Release 269, the second air-defence round (owner 2026-11-03: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV
// 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)"): the Polish PZA Loara, two 35 mm Oerlikon KDA on the PT-91
// Twardy chassis (docs/references/tanks/pza_loara.md).
//
// REGISTRAR PLACEHOLDER (269 R0): the combat rows are final-intent; the turret envelope and spatial datums are the
// placeholder build's (profiles/loara.ts: the fleet's PT-91 Twardy hull and running gear, profiles/pt91Twardy.ts, under a
// box turret with one 35 mm barrel on each side). Builder P replaces both files and keeps the datums here equal to the
// geometry. Combat numbers are game tuning on published figures, not weapon specifications.
// First-party: Kevin B. Liu (NOTICE.md).
import './poland.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];

const BASE_ID = 'pt91a_twardy';
/** The placeholder turret body (turret-local: ring plane y 0, +z forward), the same box profiles/loara.ts draws. */
const BODY = Object.freeze({ halfWidth: 1.10, floorY: .04, roofY: 1.05, rearZ: -1.65, frontZ: 1.15 });
const GUN_PIVOT: Point = [0, .62, .35];
const GUN_X = 1.40;
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

// The PT-91 Twardy's chassis record: its hull armour, hull modules, driver, running gear and automotive character (its
// final T-72B3 frame arrives through synchronizeLoaraFrame below)
const spec = cloneFleetVariant(registries.tankSpecs, 'pza_loara', BASE_ID, {
  name: 'PZA Loara', nation: 'Poland', era: 'modern', role: 'ifv',
});
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
delete spec.variantOf;
delete spec.gunPitchByYawDeg;
stripSilhouetteDimensions(spec.dims);
// Army Recognition (Loara): 45,300 kg, the S-12U at 850 hp, 60 km/h, 500 km, two Oerlikon KDA at 550 rpm each, a 26 km
// 3D search radar tracking 64 targets. en.wikipedia (PZA Loara): 45 t, 6.67 m, 3.4 m, crew 3, 60 km/h, 650 km (its
// S-1000 at 1,000 hp is the Loara-A listing; its 2.19 m height is marked dubious); one production vehicle and a few
// prototypes. No gun arc or load is published: the Gepard's -10 to +85 degrees and 40 + 640 rounds for the same
// Oerlikon-pattern twin 35 mm. The overall length (7.0 m) and the height with the radar folded (3.4 m) are estimates.
Object.assign(spec, {
  hp: 2550, enginePowerHp: 850, weightTons: 45.3, topSpeedKmh: 60, reverseSpeedKmh: 20, hullTraverseDegS: 34,
  turretTraverseDegS: 72, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 10,
});
spec.dims = { hullLengthM: 6.67, overallLengthM: 7.00, widthM: 3.40, heightM: 3.40 };
spec.armor.gunPivot = [...GUN_PIVOT];
spec.armor.gunBarrel = { lengthM: MUZZLE_Z, radiusM: .05, collision: false };
spec.armor.turretPlates = boxPlates('loara_turret', [-BODY.halfWidth, BODY.floorY, BODY.rearZ],
  [BODY.halfWidth, BODY.roofY, BODY.frontZ], 25, 30);
const turretModules = [
  moduleBox('optics', [.30, .70, .65], [.75, .98, 1.05], true),
  { ...moduleBox('gun', [-GUN_X - .18, GUN_PIVOT[1] - .24, GUN_PIVOT[2] - .55],
    [GUN_X + .18, GUN_PIVOT[1] + .24, GUN_PIVOT[2] + .70], true), external: true },
];
// the T-72 pattern's radio rides in its turret: the placeholder keeps one there
if (!spec.armor.modules.some((box) => box.module === 'radio' && !box.turretLocal)) {
  turretModules.push(moduleBox('radio', [-.80, .30, -1.45], [-.40, .70, -1.05], true));
}
spec.armor.modules = [...spec.armor.modules.filter((box) => !box.turretLocal), ...turretModules];
// crew 3: the driver in the PT-91 hull, the gunner (+x, the left) and the commander side by side in the turret
spec.armor.crew = [
  ...spec.armor.crew.filter((box) => !box.turretLocal),
  crewBox('gunner', [.15, .08, -.45], [.80, .90, .45], true),
  crewBox('commander', [-.80, .08, -.45], [-.15, .90, .45], true),
];
// The Gepard 1A2's twin-KDA package (gepardSpecs.ts), the same Oerlikon gun: the APDS-T unchanged, the HE channel the
// HEI-T at the KDA's 1,175 m/s.
spec.gun = {
  ...spec.gun, caliberMm: 35, reloadS: .35, baseAccuracy: .25, aimTimeS: 1.05, soundProfile: 'kde-35',
  muzzles: [{ x: -GUN_X, y: 0 }, { x: GUN_X, y: 0 }],
  shells: [
    shell('35 mm APDS-T', 'APFSDS', 35, 146, 131, 61, 1385, { pen2000Mm: 117, reloadS: .35, count: 40 }),
    shell('35 mm HEI-T', 'HE', 35, 8, 8, 56, 1175, { pen2000Mm: 8, reloadS: .35, count: 640 }),
  ],
};
for (const key of ['launcherSalvo', 'autoloader', 'fixedLaunchCanisters', 'primaryGuided', 'muzzleBoreSegments', 'launcherMuzzles'] as const) {
  delete spec.gun[key];
}
// The Polish Army's green, sand and black of the PT-91 Twardy (camoPolicy.ts sig_pt91_twardy), worn as the spec coat and
// the stock; the hull number of the vehicle in photo 02 (Kielce, 2007)
spec.visual = { ...spec.visual, scheme: 'nato', base: '#4b5a3c', weather: '#66694f', patches: ['#8a7653', '#202420'],
  camoScale: .46, marking: 'number', number: '370' };

function reach(record: FleetTankSpec): number {
  const [, ty, tz] = record.armor.turretPivot;
  return Math.hypot(GUN_X, ty + GUN_PIVOT[1], tz + GUN_PIVOT[2]) + MUZZLE_Z;
}
spec.armor.boundingRadiusM = Math.max(spec.armor.boundingRadiusM, reach(spec));

registerFleetSpecs(registries, ['pza_loara'], { pza_loara: spec });

let synchronized = false;
/**
 * Registration hook (fleetRegistration.ts, after every registration-time pass that rewrites a hull frame): the PT-91
 * Twardy's final hull frame (the T-72B3 frame fleetRenewalSpecs.ts gives it: hull plates, ring, hull modules, driver, track
 * width) under this id's own turret records, so the armour matches the hull profiles/loara.ts builds. Idempotent.
 */
export function synchronizeLoaraFrame(): void {
  if (synchronized) return;
  synchronized = true;
  const base = TANK_SPECS[BASE_ID], own = TANK_SPECS.pza_loara;
  own.armor.hullPlates = structuredClone(base.armor.hullPlates);
  own.armor.turretPivot = [...base.armor.turretPivot];
  own.armor.modules = [...structuredClone(base.armor.modules.filter((box) => !box.turretLocal)),
    ...own.armor.modules.filter((box) => box.turretLocal)];
  own.armor.crew = [...structuredClone(base.armor.crew.filter((box) => !box.turretLocal)),
    ...own.armor.crew.filter((box) => box.turretLocal)];
  own.visual.trackWidthM = base.visual.trackWidthM;
  own.armor.boundingRadiusM = Math.max(base.armor.boundingRadiusM, reach(own));
}
