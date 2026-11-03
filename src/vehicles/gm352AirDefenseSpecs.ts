// Release 268, the twin-cannon air-defence round (owner 2026-11-02: "love your work on the terminnators. that made me
// realize we should add more double barrel vehicels"): the Russian pair on the GM-352 chassis family, the 2K22M
// Tunguska-M and the Pantsir-S1 on the tracked GM-352M1E (docs/references/tanks/tunguska_m.md, pantsir_s1.md).
//
// REGISTRAR PLACEHOLDER (268 R0): the combat rows below are final-intent (published numbers, the BMPT twin 2A42 rows'
// ammunition and cadence model); the armour envelope and every spatial datum are the placeholder build's
// (profiles/gm352AirDefense.ts: the BMP-3 hull and running gear under a box turret, two barrels and the SAM tubes).
// Builder R replaces both files with the measured GM-352 build and keeps the datums here equal to the geometry.
// Combat numbers are game tuning on published figures, not weapon specifications. First-party: Kevin B. Liu (NOTICE.md).
import './afvFamily.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];

/** The placeholder turret body (turret-local: ring plane y 0, +z forward), the same box profiles/gm352AirDefense.ts draws.
 * Its floor stands over the BMP-3 deck's raised mid strip (1.29 m behind the ring, 0.10 m over its plane) at every
 * bearing; the ring collar fills the space under it. */
const BODY = Object.freeze({ halfWidth: .95, floorY: .12, roofY: .97, rearZ: -1.40, frontZ: 1.00 });

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

interface AirDefenseRow {
  readonly id: string;
  readonly name: string;
  readonly gunPivot: Point;
  readonly gunX: number;
  readonly muzzleZ: number;
  readonly tubes: readonly { x: number; y: number; z: number }[];
}

function airDefenseVariant(row: AirDefenseRow): FleetTankSpec {
  // The BMP-3's hull and running gear carry the placeholder (profiles/gm352AirDefense.ts), so its hull armour and hull
  // modules do too: aluminium-and-steel light armour, the class of the GM-352's 7.62 mm and splinter protection.
  const spec = cloneFleetVariant(registries.tankSpecs, row.id, 'bmp3', {
    name: row.name, nation: 'Russia', era: 'modern', role: 'ifv',
  });
  delete spec.balancePeerOf;
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  delete spec.variantOf;
  stripSilhouetteDimensions(spec.dims);
  const { gunPivot } = row;
  spec.armor.gunPivot = [...gunPivot];
  spec.armor.gunBarrel = { lengthM: row.muzzleZ, radiusM: .045, collision: false };
  // The turret body: splinter and 7.62 mm protection (Tunguska: Wikipedia, "7.62 mm small arms fire and shell splinters")
  spec.armor.turretPlates = boxPlates('ad_turret', [-BODY.halfWidth, BODY.floorY, BODY.rearZ], [BODY.halfWidth, BODY.roofY, BODY.frontZ],
    15, 20);
  spec.armor.modules = [
    ...spec.armor.modules.filter((box) => !box.turretLocal),
    moduleBox('radio', [-.80, .30, -1.30], [-.40, .70, -.90], true),
    moduleBox('optics', [.30, .55, .60], [.70, .84, .95], true),
    { ...moduleBox('gun', [-row.gunX - .16, gunPivot[1] - .22, gunPivot[2] - .45],
      [row.gunX + .16, gunPivot[1] + .22, gunPivot[2] + .65], true), external: true },
    { ...moduleBox('missileRack', [-1.66, gunPivot[1] - .12, gunPivot[2] - .78], [1.66, gunPivot[1] + .40, gunPivot[2] + .88], true),
      gunFollow: true, external: true },
  ];
  spec.armor.crew = [
    ...spec.armor.crew.filter((box) => !box.turretLocal),
    crewBox('gunner', [.10, .08, -.40], [.75, .80, .40], true),
    crewBox('commander', [-.75, .08, -.40], [-.10, .80, .40], true),
  ];
  spec.gun = {
    ...spec.gun,
    muzzles: [{ x: -row.gunX, y: 0 }, { x: row.gunX, y: 0 }],
    launcherMuzzles: row.tubes.map((tube) => ({ ...tube })),
  };
  for (const key of ['launcherSalvo', 'autoloader', 'fixedLaunchCanisters', 'primaryGuided', 'muzzleBoreSegments'] as const) {
    delete spec.gun[key];
  }
  return spec;
}

// The 2K22M's SAMs ride outboard of the 2A38M guns, four a side in two rows (Wikipedia 2K22: "eight ready-to-fire 9M311M
// missiles, four per side"); the placeholder's gun-frame mouths, 0.17 m apart.
const tunguskaTubes = [-1, 1].flatMap((side) => [1.33, 1.50].flatMap((x) => [.10, .28].map((y) => ({ x: side * x, y, z: 1.30 }))));
const tunguska = airDefenseVariant({
  id: 'tunguska_m', name: '2K22M Tunguska-M', gunPivot: [0, .55, .45], gunX: 1.10, muzzleZ: 2.60, tubes: tunguskaTubes,
});
// Wikipedia 2K22 (the M1 data for the M): ~35 t (34 t for the M), 7.90-7.93 m, 3.25 m, 3.35 m radar stowed and 4.0 m
// raised, the V-46 at 780 hp (710 hp governed), 65 km/h, crew 4; 1,904 30 mm rounds; the guns -10 to +87 degrees.
Object.assign(tunguska, {
  hp: 2300, enginePowerHp: 780, weightTons: 34, topSpeedKmh: 65, reverseSpeedKmh: 18, hullTraverseDegS: 40,
  turretTraverseDegS: 70, gunPitchDegS: 50, gunElevationDeg: 87, gunDepressionDeg: 10,
});
tunguska.dims = { hullLengthM: 7.93, overallLengthM: 7.93, widthM: 3.24, heightM: 3.36 };
// The BMPT Terminator 2's twin 2A42 package (afvFamily.ts, at the shown-tier floor fleetBalancePass applyShownTierFloors
// gave it): the 2A38M fires the same 30 x 165 mm ammunition. The 1,904 rounds split evenly, as the BMPT's 850.
tunguska.gun = {
  ...tunguska.gun, caliberMm: 30, reloadS: .30, baseAccuracy: .26, aimTimeS: 1.10, soundProfile: 'twin-2a42',
  shells: [
    shell('3UBR8 APDS', 'APFSDS', 30, 125, 112, 52, 1120, { pen2000Mm: 100, reloadS: .30, count: 952 }),
    // Game balance on the M6 Linebacker's Stinger handling (m6LinebackerSpecs.ts): a blast-fragmentation SAM, its 9 kg
    // rod warhead over the Stinger's, at the 9M311's 900 m/s peak; one round per tube.
    shell('9M311M', 'HE', 76, 25, 25, 360, 900,
      { pen2000Mm: 25, reloadS: 3.0, count: 8, guided: true, launcherTubes: 8, soundProfile: 'tow-launch' }),
    shell('3UOF8 HE-I', 'HE', 30, 8, 8, 48, 960, { pen2000Mm: 8, reloadS: .30, count: 952 }),
  ],
};
tunguska.armor.crew.push(crewBox('radioOperator', [-.60, .08, -1.25], [0, .75, -.55], true));
// Russia's plain service green: the photographs' solid coat is the national_ru preset's (camoPolicy.ts), worn as stock
tunguska.visual = { ...tunguska.visual, scheme: 'solid', base: '#44553a', weather: '#4f6144', patches: [],
  marking: 'number', number: '211' };

// The Pantsir-S1 combat module: twelve 57E6 in two six-tube banks (Wikipedia Pantsir: "up to twelve 57E6"), three
// columns of two a side, outboard of the 2A38M guns.
const pantsirTubes = [-1, 1].flatMap((side) => [1.28, 1.42, 1.56].flatMap((x) => [.12, .27].map((y) => ({ x: side * x, y, z: 1.40 }))));
const pantsir = airDefenseVariant({
  id: 'pantsir_s1', name: 'Pantsir-S1 (tracked)', gunPivot: [0, .55, .40], gunX: 1.08, muzzleZ: 2.60, tubes: pantsirTubes,
});
// The tracked option on the GM-352M1E (Engineering Technologies 2012; Wikipedia lists it under prototypes): no weight is
// published; the GM-352 family's 34-35 t and the Tunguska's 780 hp V-46 are the estimate. ~7.8 m long; crew 3; 700
// rounds a gun (1,400); the system's -5 to +85 degree envelope.
Object.assign(pantsir, {
  hp: 2450, enginePowerHp: 780, weightTons: 35, topSpeedKmh: 65, reverseSpeedKmh: 18, hullTraverseDegS: 39,
  turretTraverseDegS: 72, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 5,
});
pantsir.dims = { hullLengthM: 7.80, overallLengthM: 7.80, widthM: 3.25, heightM: 4.10 };
// The BMPT T-90's twin 2A42 package (afvFamily.ts) at the Pantsir's tier VI
pantsir.gun = {
  ...pantsir.gun, caliberMm: 30, reloadS: .28, baseAccuracy: .25, aimTimeS: 1.05, soundProfile: 'twin-2a42',
  shells: [
    shell('3UBR8 APDS', 'APFSDS', 30, 122, 110, 50, 1120, { pen2000Mm: 98, reloadS: .28, count: 700 }),
    // the 57E6's 20 kg warhead and its 1,300 m/s peak; one round per tube
    shell('57E6', 'HE', 90, 25, 25, 380, 1300,
      { pen2000Mm: 25, reloadS: 3.0, count: 12, guided: true, launcherTubes: 12, soundProfile: 'tow-launch' }),
    shell('3UOF8 HE-I', 'HE', 30, 8, 8, 46, 960, { pen2000Mm: 8, reloadS: .28, count: 700 }),
  ],
};
pantsir.visual = { ...pantsir.visual, scheme: 'solid', base: '#44553a', weather: '#4f6144', patches: [],
  marking: 'number', number: '421' };

registerFleetSpecs(registries, ['tunguska_m', 'pantsir_s1'], { tunguska_m: tunguska, pantsir_s1: pantsir });
