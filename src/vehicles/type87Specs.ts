// Release 269, the second air-defence round (owner 2026-11-03: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV
// 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)"): the JGSDF Type 87 self-propelled anti-aircraft gun, two 35 mm
// Oerlikon KDA (Japan Steel Works licence) on the Type 74 chassis (docs/references/tanks/type87_aw.md).
//
// REGISTRAR PLACEHOLDER (269 R0): the combat rows are final-intent; the turret envelope and spatial datums are the
// placeholder build's (profiles/type87.ts: the fleet's Type 74 hull and running gear, profiles/type74Family.ts, under a
// box turret with one 35 mm barrel on each side). Builder J replaces both files and keeps the datums here equal to the
// geometry. Combat numbers are game tuning on published figures, not weapon specifications.
// First-party: Kevin B. Liu (NOTICE.md).
import './japan.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];

const BASE_ID = 'type74';
/** The placeholder turret body (turret-local: ring plane y 0, +z forward), the same box profiles/type87.ts draws. */
const BODY = Object.freeze({ halfWidth: 1.15, floorY: .04, roofY: 1.05, rearZ: -1.70, frontZ: 1.20 });
const GUN_PIVOT: Point = [0, .60, .20];
const GUN_X = 1.40;
const MUZZLE_Z = 3.90;

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

// The Type 74's chassis record: its hull armour, hull modules, driver, running gear and automotive character.
const spec = cloneFleetVariant(registries.tankSpecs, 'type87_aw', BASE_ID, {
  name: 'Type 87 Self-Propelled Anti-Aircraft Gun', nation: 'Japan', era: 'cold-war', role: 'ifv',
});
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
delete spec.variantOf;
// the Type 74's 105 mm traverse curve and its hydropneumatic gun-laying do not apply to guns that elevate to +85
delete spec.gunPitchByYawDeg;
delete spec.hydropneumaticAim;
stripSilhouetteDimensions(spec.dims);
// en.wikipedia (Type 87 self-propelled anti-aircraft gun): 38.0 t, 7.99 m, 3.18 m, 3.25 m radar retracted (4.40 m
// erected), crew 3, the Mitsubishi 10ZF22WT two-stroke V10 at 720 hp, 53 km/h, the guns -5 to +85 degrees; 52 built
// 1987-2002. The hull is the fleet's Type 74 (6.70 m).
Object.assign(spec, {
  hp: 2350, enginePowerHp: 720, weightTons: 38, topSpeedKmh: 53, reverseSpeedKmh: 20, hullTraverseDegS: 38,
  turretTraverseDegS: 70, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 5,
});
spec.dims = { hullLengthM: 6.70, overallLengthM: 7.99, widthM: 3.18, heightM: 3.25 };
spec.armor.gunPivot = [...GUN_PIVOT];
spec.armor.gunBarrel = { lengthM: MUZZLE_Z, radiusM: .05, collision: false };
// the aluminium turret (en.wikipedia: "Steel (chassis), aluminium (turret)"): splinter and small-arms protection
spec.armor.turretPlates = boxPlates('type87_turret', [-BODY.halfWidth, BODY.floorY, BODY.rearZ],
  [BODY.halfWidth, BODY.roofY, BODY.frontZ], 20, 25);
spec.armor.modules = [
  ...spec.armor.modules.filter((box) => !box.turretLocal),
  moduleBox('optics', [.30, .72, .70], [.75, 1.00, 1.10], true),
  { ...moduleBox('gun', [-GUN_X - .18, GUN_PIVOT[1] - .24, GUN_PIVOT[2] - .55],
    [GUN_X + .18, GUN_PIVOT[1] + .24, GUN_PIVOT[2] + .70], true), external: true },
];
// crew 3: the driver in the Type 74 hull, the gunner (+x, the left) and the commander side by side in the turret
spec.armor.crew = [
  ...spec.armor.crew.filter((box) => !box.turretLocal),
  crewBox('gunner', [.15, .08, -.45], [.80, .90, .45], true),
  crewBox('commander', [-.80, .08, -.45], [-.15, .90, .45], true),
];
// The Gepard 1A2's twin-KDA package (gepardSpecs.ts), the same Oerlikon gun: the APDS-T unchanged, the HE channel the
// Type 87's HEI-T at its published 1,175 m/s. en.wikipedia: 310 anti-aircraft and 20 anti-armour rounds a gun.
spec.gun = {
  ...spec.gun, caliberMm: 35, reloadS: .35, baseAccuracy: .25, aimTimeS: 1.05, soundProfile: 'kde-35',
  muzzles: [{ x: -GUN_X, y: 0 }, { x: GUN_X, y: 0 }],
  shells: [
    shell('35 mm APDS-T', 'APFSDS', 35, 146, 131, 61, 1385, { pen2000Mm: 117, reloadS: .35, count: 40 }),
    shell('35 mm HEI-T', 'HE', 35, 8, 8, 56, 1175, { pen2000Mm: 8, reloadS: .35, count: 620 }),
  ],
};
for (const key of ['launcherSalvo', 'autoloader', 'fixedLaunchCanisters', 'primaryGuided', 'muzzleBoreSegments', 'launcherMuzzles'] as const) {
  delete spec.gun[key];
}
// The JGSDF two-tone of the Type 74 and Type 90 (Japan's Factory coat, camoPolicy.ts service_type10), worn as the spec coat
spec.visual = { ...spec.visual, scheme: 'stripes', base: '#39463a', weather: '#445144', patches: ['#63523c', '#2e392f'],
  camoScale: .5, marking: 'number', number: '87' };

function reach(record: FleetTankSpec): number {
  const [, ty, tz] = record.armor.turretPivot;
  return Math.hypot(GUN_X, ty + GUN_PIVOT[1], tz + GUN_PIVOT[2]) + MUZZLE_Z;
}
spec.armor.boundingRadiusM = Math.max(spec.armor.boundingRadiusM, reach(spec));

registerFleetSpecs(registries, ['type87_aw'], { type87_aw: spec });

let synchronized = false;
/**
 * Registration hook (fleetRegistration.ts, after every registration-time pass that rewrites a hull frame): the Type 74's
 * final hull frame (hull plates, ring, hull modules, driver, track width) under this id's own turret records, so the
 * armour matches the hull profiles/type87.ts builds. Idempotent.
 */
export function synchronizeType87Frame(): void {
  if (synchronized) return;
  synchronized = true;
  const base = TANK_SPECS[BASE_ID], own = TANK_SPECS.type87_aw;
  own.armor.hullPlates = structuredClone(base.armor.hullPlates);
  own.armor.turretPivot = [...base.armor.turretPivot];
  own.armor.modules = [...structuredClone(base.armor.modules.filter((box) => !box.turretLocal)),
    ...own.armor.modules.filter((box) => box.turretLocal)];
  own.armor.crew = [...structuredClone(base.armor.crew.filter((box) => !box.turretLocal)),
    ...own.armor.crew.filter((box) => box.turretLocal)];
  own.visual.trackWidthM = base.visual.trackWidthM;
  own.armor.boundingRadiusM = Math.max(base.armor.boundingRadiusM, reach(own));
}
