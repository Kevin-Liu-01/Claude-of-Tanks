// Release 268, the twin-cannon air-defence round (owner 2026-11-02, "we should add more double barrel vehicels"): the
// Flakpanzer Gepard 1A2, twin 35 mm Oerlikon KDA on the Leopard 1 chassis (docs/references/tanks/gepard_1a2.md).
//
// REGISTRAR PLACEHOLDER (268 R0): the combat rows are final-intent; the turret envelope and spatial datums are the
// placeholder build's (profiles/gepard.ts: the shared Leopard 1 hull, profiles/leopard1Hull.ts, under a box turret and
// two side-mounted barrels). Builder G replaces both files and keeps the datums here equal to the geometry.
// Combat numbers are game tuning on published figures, not weapon specifications. First-party: Kevin B. Liu (NOTICE.md).
import './modern2Specs.generated.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate } from './specHelpers.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];

/** The placeholder turret body (turret-local: ring plane y 0, +z forward), the same box profiles/gepard.ts draws. */
const BODY = Object.freeze({ halfWidth: 1.10, floorY: .04, roofY: 1.04, rearZ: -1.65, frontZ: 1.15 });
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

// The Leopard 1A5's chassis record: its hull armour, hull modules, running gear and the Bundeswehr coat it wears.
const spec = cloneFleetVariant(registries.tankSpecs, 'gepard_1a2', 'leo1a5', {
  name: 'Flakpanzer Gepard 1A2', nation: 'Germany', era: 'modern', role: 'ifv',
});
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
delete spec.variantOf;
// the Leopard 1A5's traverse curve holds its 105 mm over the engine deck; the Gepard's guns ride outside the deck edge
delete spec.gunPitchByYawDeg;
stripSilhouetteDimensions(spec.dims);
// de.wikipedia (Flugabwehrkanonenpanzer Gepard, the 1A2 data): ~47.5 t (15.5 t turret), 7.68 m overall, 3.27 m wide,
// 3.29 m with the search radar folded (4.22 m raised), the MTU MB 838 CaM-500 at 610 kW (830 PS), ~65 km/h, crew 3,
// the guns -10 to +85 degrees; the 1A2 is the 1996-2000 service-life extension (147 Bundeswehr vehicles). The hull is
// the shared Leopard 1 build's (7.09 m).
Object.assign(spec, {
  hp: 2500, enginePowerHp: 830, weightTons: 47.5, topSpeedKmh: 65, reverseSpeedKmh: 25, hullTraverseDegS: 38,
  turretTraverseDegS: 72, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 10,
});
spec.dims = { hullLengthM: 7.09, overallLengthM: 7.68, widthM: 3.27, heightM: 3.29 };
// the Leopard 1 hull's turret station: 0.50 m ahead of the hull origin on the 1.58 m deck (profiles/leopard1Hull.ts)
spec.armor.turretPivot = [0, 1.60, .50];
spec.armor.gunPivot = [...GUN_PIVOT];
spec.armor.gunBarrel = { lengthM: MUZZLE_Z, radiusM: .065, collision: false };
spec.armor.turretPlates = boxPlates('gepard_turret', [-BODY.halfWidth, BODY.floorY, BODY.rearZ], [BODY.halfWidth, BODY.roofY, BODY.frontZ],
  25, 30);
spec.armor.modules = [
  ...spec.armor.modules.filter((box) => !box.turretLocal),
  moduleBox('optics', [.30, .70, .65], [.75, .98, 1.05], true),
  { ...moduleBox('gun', [-GUN_X - .18, GUN_PIVOT[1] - .24, GUN_PIVOT[2] - .55], [GUN_X + .18, GUN_PIVOT[1] + .24, GUN_PIVOT[2] + .70], true),
    external: true },
];
spec.armor.crew = [
  ...spec.armor.crew.filter((box) => !box.turretLocal),
  crewBox('gunner', [-.80, .08, -.45], [-.15, .90, .45], true),
  crewBox('commander', [.15, .08, -.45], [.80, .90, .45], true),
];
// The Terminator 2's twin 2A42 package (afvFamily.ts) scaled by calibre to 35 mm (x 35/30): penetration and damage up,
// the cycle a sixth slower (0.35 s against 0.30). 40 armour-piercing and 640 anti-aircraft rounds (Wikipedia: 320 + 20 a
// gun); the 1A2 fires FAPDS at the 35 mm family's ~1,440 m/s, the APDS-T at 1,385 m/s.
spec.gun = {
  ...spec.gun, caliberMm: 35, reloadS: .35, baseAccuracy: .25, aimTimeS: 1.05, soundProfile: 'kde-35',
  muzzles: [{ x: -GUN_X, y: 0 }, { x: GUN_X, y: 0 }],
  shells: [
    shell('35 mm APDS-T', 'APFSDS', 35, 146, 131, 61, 1385, { pen2000Mm: 117, reloadS: .35, count: 40 }),
    shell('35 mm FAPDS-T', 'HE', 35, 8, 8, 56, 1440, { pen2000Mm: 8, reloadS: .35, count: 640 }),
  ],
};
for (const key of ['launcherSalvo', 'autoloader', 'fixedLaunchCanisters', 'primaryGuided', 'muzzleBoreSegments', 'launcherMuzzles'] as const) {
  delete spec.gun[key];
}
// The Leopard 1A5's Bundeswehr NATO three-tone (its spec coat; its stock is the national Factory, service_leo2a6m)
spec.visual = { ...spec.visual, marking: 'cross', number: '422' };

registerFleetSpecs(registries, ['gepard_1a2'], { gepard_1a2: spec });
