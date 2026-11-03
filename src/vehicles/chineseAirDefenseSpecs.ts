// Release 268, the twin-cannon air-defence round (owner 2026-11-02, "we should add more double barrel vehicels"): the
// PLA's PGZ-95 (Type 95 SPAAA, four 25 mm and four QW-2) and PGZ-09 (Type 09 SPAAA, twin 35 mm)
// (docs/references/tanks/pgz95.md, pgz09.md).
//
// REGISTRAR PLACEHOLDER (268 R0): the combat rows are final-intent; the armour envelope and every spatial datum are the
// placeholder build's (profiles/chineseAirDefense.ts: the BMP-3 hull and running gear under a box turret and two
// barrels). Builder C replaces both files with the measured PLA builds and keeps the datums here equal to the geometry.
// Combat numbers are game tuning on published figures, not weapon specifications. First-party: Kevin B. Liu (NOTICE.md).
import './afvFamily.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];

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

interface PlaRow {
  readonly id: string;
  readonly name: string;
  /** The placeholder turret body (turret-local: ring plane y 0, +z forward), as profiles/chineseAirDefense.ts draws it. */
  readonly body: { readonly halfWidth: number; readonly floorY: number; readonly roofY: number; readonly rearZ: number;
    readonly frontZ: number };
  readonly gunPivot: Point;
  readonly gunX: number;
  readonly muzzleZ: number;
  readonly barrelR: number;
  readonly tubes: readonly { x: number; y: number; z: number }[];
}

function plaVariant(row: PlaRow): FleetTankSpec {
  // The BMP-3's hull and running gear carry the placeholder, so its hull armour and hull modules do too (both PLA hulls
  // are light: welded steel against small arms and splinters, the PGZ-09's front against 14.5 mm).
  const spec = cloneFleetVariant(registries.tankSpecs, row.id, 'bmp3', {
    name: row.name, nation: 'China', era: 'modern', role: 'ifv',
  });
  delete spec.balancePeerOf;
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  delete spec.variantOf;
  stripSilhouetteDimensions(spec.dims);
  const { gunPivot, body } = row;
  spec.armor.gunPivot = [...gunPivot];
  spec.armor.gunBarrel = { lengthM: row.muzzleZ, radiusM: row.barrelR, collision: false };
  spec.armor.turretPlates = boxPlates('pla_turret', [-body.halfWidth, body.floorY, body.rearZ], [body.halfWidth, body.roofY, body.frontZ],
    15, 20);
  spec.armor.modules = [
    ...spec.armor.modules.filter((box) => !box.turretLocal),
    moduleBox('radio', [-.75, .30, body.rearZ + .15], [-.35, .68, body.rearZ + .55], true),
    moduleBox('optics', [.30, .52, .55], [.68, .80, .90], true),
    { ...moduleBox('gun', [-row.gunX - .16, gunPivot[1] - .22, gunPivot[2] - .45],
      [row.gunX + .16, gunPivot[1] + .22, gunPivot[2] + .65], true), external: true },
    ...(row.tubes.length ? [{ ...moduleBox('missileRack', [-1.55, gunPivot[1] + .18, gunPivot[2] - .30],
      [1.55, gunPivot[1] + .52, gunPivot[2] + 1.25], true), gunFollow: true, external: true }] : []),
  ];
  spec.armor.crew = [
    ...spec.armor.crew.filter((box) => !box.turretLocal),
    crewBox('gunner', [.10, .08, -.40], [.72, .78, .40], true),
    crewBox('commander', [-.72, .08, -.40], [-.10, .78, .40], true),
  ];
  spec.gun = {
    ...spec.gun,
    muzzles: [{ x: -row.gunX, y: 0 }, { x: row.gunX, y: 0 }],
    ...(row.tubes.length ? { launcherMuzzles: row.tubes.map((tube) => ({ ...tube })) } : {}),
  };
  for (const key of ['launcherSalvo', 'autoloader', 'fixedLaunchCanisters', 'primaryGuided', 'muzzleBoreSegments'] as const) {
    delete spec.gun[key];
  }
  if (!row.tubes.length) delete spec.gun.launcherMuzzles;
  return spec;
}

// ------------------------------------------------------------------------------------------------------- PGZ-95 --
// Wikipedia (Type 95 SPAAA) and Army Technology: 22.5 t, 6.71 m, 3.20 m, 3.40 m radar down (4.82 m up), crew 3, four
// Type 87 25 mm (two a side), about 1,000 rounds, four QW-2 (two a side), 53 km/h, in service from 1999. The engine's
// power is not published: 600 hp is the estimate. The guns' -5 to +85 degrees is the only listing (a game wiki).
const pgz95 = plaVariant({
  id: 'pgz95', name: 'PGZ-95',
  // (the floor over the BMP-3 deck's raised mid strip at every bearing, as on gm352AirDefenseSpecs.ts)
  body: { halfWidth: .90, floorY: .12, roofY: .97, rearZ: -1.30, frontZ: .90 },
  gunPivot: [0, .55, .40], gunX: 1.10, muzzleZ: 2.40, barrelR: .035,
  // the QW-2s above the guns, two a side
  tubes: [-1, 1].flatMap((side) => [1.30, 1.46].map((x) => ({ x: side * x, y: .30, z: 1.20 }))),
});
Object.assign(pgz95, {
  hp: 2000, enginePowerHp: 600, weightTons: 22.5, topSpeedKmh: 53, reverseSpeedKmh: 16, hullTraverseDegS: 44,
  turretTraverseDegS: 65, gunPitchDegS: 45, gunElevationDeg: 85, gunDepressionDeg: 5,
});
pgz95.dims = { hullLengthM: 6.71, overallLengthM: 6.71, widthM: 3.20, heightM: 3.40 };
// The Terminator 2's twin 2A42 package (afvFamily.ts) scaled by calibre to 25 mm (x 25/30): damage and the cycle down
// (43 and 0.25 s). The calibre-scaled penetration (104 mm) would sit at 0.56 of the tier-V IFV median (balanceAudit.ts,
// floor 0.65), so the round takes the shown-tier floor fleetBalancePass applyShownTierFloors lifted the Terminator to.
pgz95.gun = {
  ...pgz95.gun, caliberMm: 25, reloadS: .25, baseAccuracy: .28, aimTimeS: 1.15, soundProfile: 'm242-bushmaster',
  shells: [
    shell('25 mm APDS-T', 'APFSDS', 25, 125, 112, 43, 1150, { pen2000Mm: 100, reloadS: .25, count: 500 }),
    // the M6 Linebacker's Stinger handling (m6LinebackerSpecs.ts) for the QW-2's smaller warhead and ~650 m/s
    shell('QW-2', 'HE', 72, 15, 15, 300, 650,
      { pen2000Mm: 15, reloadS: 3.0, count: 4, guided: true, launcherTubes: 4, soundProfile: 'tow-launch' }),
    shell('25 mm HEI-T', 'HE', 25, 8, 8, 40, 1050, { pen2000Mm: 8, reloadS: .25, count: 500 }),
  ],
};
// The PLA green-and-sand organic coat of the museum PGZ-95: the Type 59's Signature recipe (camoPolicy.ts sig_type59),
// worn as stock
pgz95.visual = { ...pgz95.visual, scheme: 'nato', base: '#374836', weather: '#49573f',
  patches: ['#2a3629', '#5c6349', '#6f684e'], camoScale: .52, marking: 'number', number: '951' };

// ------------------------------------------------------------------------------------------------------- PGZ-09 --
// Wikipedia (PGZ-09): 35 t, 6.7 m, 3.2 m, 3.4 m radar down (4.82 m up), crew 3, two PG99 35 mm (1,100 rpm combined),
// the 8V150 diesel at 800 hp, 55 km/h, in service from 2009 (the page's dimensions repeat the PGZ-95's; the conflict is
// recorded in the packet). No ammunition load or elevation is published: the Gepard's 40 + 640 for the same
// Oerlikon-pattern twin 35 mm, and -5 to +85 degrees.
const pgz09 = plaVariant({
  id: 'pgz09', name: 'PGZ-09',
  body: { halfWidth: 1.00, floorY: .12, roofY: 1.07, rearZ: -1.45, frontZ: 1.05 },
  gunPivot: [0, .60, .35], gunX: 1.30, muzzleZ: 3.40, barrelR: .055,
  tubes: [],
});
Object.assign(pgz09, {
  hp: 2400, enginePowerHp: 800, weightTons: 35, topSpeedKmh: 55, reverseSpeedKmh: 18, hullTraverseDegS: 40,
  turretTraverseDegS: 70, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 5,
});
pgz09.dims = { hullLengthM: 6.70, overallLengthM: 6.70, widthM: 3.20, heightM: 3.40 };
// The BMPT T-90's twin 2A42 package (afvFamily.ts, tier VI) scaled by calibre to 35 mm (x 35/30)
pgz09.gun = {
  ...pgz09.gun, caliberMm: 35, reloadS: .33, baseAccuracy: .25, aimTimeS: 1.05, soundProfile: 'kde-35',
  shells: [
    shell('35 mm APDS-T', 'APFSDS', 35, 142, 128, 58, 1385, { pen2000Mm: 114, reloadS: .33, count: 40 }),
    shell('35 mm HEI-T', 'HE', 35, 8, 8, 54, 1175, { pen2000Mm: 8, reloadS: .33, count: 640 }),
  ],
};
// The PLA digital woodland of the 2017 parade photographs: the ZTZ-100's Signature recipe (camoPolicy.ts sig_ztz100_x,
// the ZTZ-20's stock), worn as stock
pgz09.visual = { ...pgz09.visual, scheme: 'digital', base: '#49593f', weather: '#5c684c',
  patches: ['#707d58', '#695f48', '#29372d'], camoScale: .36, digitalCellK: 2.4, marking: 'number', number: '091' };

registerFleetSpecs(registries, ['pgz95', 'pgz09'], { pgz95, pgz09 });
