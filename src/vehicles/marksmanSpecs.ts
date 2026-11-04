// Release 269, the second air-defence round (owner 2026-11-03: "also add the Japanese type 87 SPAAG, UK Marksman, ...",
// then the Leopard 2 Marksman, "produced in 2014 and 15 and started its service in 2016 under the designation ItPsv
// Leopard 2"): the Marconi Marksman twin 35 mm turret on two hulls, Finland's ItPsv 90 on a T-55 and the ItPsv Leopard 2 on
// a Leopard 2A4 (docs/references/tanks/marksman_t55.md, itpsv_leopard2.md). Both are filed under the UK, the turret's
// maker (the game has no Finland tree).
//
// REGISTRAR PLACEHOLDER (269 R0): the combat rows are final-intent; the turret envelope and spatial datums are the
// placeholder build's (profiles/marksman.ts: the fleet's T-55A hull and running gear, profiles/t54Family.ts, and its
// Leopard 2A4 hull and running gear, profiles/leopard2A4Family.ts, each under one box turret with a 35 mm barrel on each
// side). Builder M replaces both files and keeps the datums here equal to the geometry. Combat numbers are game tuning
// on published figures, not weapon specifications. First-party: Kevin B. Liu (NOTICE.md).
import './supplementalFleetSpecs.ts';
import './modern1Specs.generated.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];

/** The one placeholder Marksman turret body (turret-local: ring plane y 0, +z forward), as profiles/marksman.ts draws it. */
const BODY = Object.freeze({ halfWidth: 1.20, floorY: .04, roofY: 1.05, rearZ: -1.60, frontZ: 1.20 });
const GUN_PIVOT: Point = [0, .70, .60];
const GUN_X = 1.40;
const MUZZLE_Z = 4.20;

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

/** The Marksman turret's records on a hull: its plates, modules, crew and the twin 35 mm. */
function marksmanVariant(id: string, baseId: string, name: string): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, baseId, { name, nation: 'UK', era: 'modern', role: 'ifv' });
  delete spec.balancePeerOf;
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  delete spec.variantOf;
  // the base gun's traverse curve held its tube over the engine deck; the Marksman's guns ride outside the turret sides
  delete spec.gunPitchByYawDeg;
  stripSilhouetteDimensions(spec.dims);
  spec.armor.gunPivot = [...GUN_PIVOT];
  spec.armor.gunBarrel = { lengthM: MUZZLE_Z, radiusM: .05, collision: false };
  // en.wikipedia (Marksman anti-aircraft system): "ballistic immunity against 14.5 mm heavy machine guns"
  spec.armor.turretPlates = boxPlates('marksman_turret', [-BODY.halfWidth, BODY.floorY, BODY.rearZ],
    [BODY.halfWidth, BODY.roofY, BODY.frontZ], 35, 40);
  spec.armor.modules = [
    ...spec.armor.modules.filter((box) => !box.turretLocal),
    moduleBox('optics', [-.75, .72, .70], [-.30, 1.00, 1.10], true),
    { ...moduleBox('gun', [-GUN_X - .18, GUN_PIVOT[1] - .24, GUN_PIVOT[2] - .55],
      [GUN_X + .18, GUN_PIVOT[1] + .24, GUN_PIVOT[2] + .70], true), external: true },
  ];
  // crew 3: the driver in the hull, the gunner (+x, the left) and the commander side by side in the turret
  spec.armor.crew = [
    ...spec.armor.crew.filter((box) => !box.turretLocal),
    crewBox('gunner', [.15, .08, -.45], [.80, .90, .45], true),
    crewBox('commander', [-.80, .08, -.45], [-.15, .90, .45], true),
  ];
  // The Gepard 1A2's twin-KDA package (gepardSpecs.ts), the same Oerlikon gun: the APDS-T unchanged, the HE channel the
  // fragmentation round at the page's 1,175 m/s. en.wikipedia: "460 fragmentation rounds and 40 anti-tank rounds" (the
  // infobox's 440 is not used).
  spec.gun = {
    ...spec.gun, caliberMm: 35, reloadS: .35, baseAccuracy: .25, aimTimeS: 1.05, soundProfile: 'kde-35',
    muzzles: [{ x: -GUN_X, y: 0 }, { x: GUN_X, y: 0 }],
    shells: [
      shell('35 mm APDS-T', 'APFSDS', 35, 146, 131, 61, 1385, { pen2000Mm: 117, reloadS: .35, count: 40 }),
      shell('35 mm HEI-T', 'HE', 35, 8, 8, 56, 1175, { pen2000Mm: 8, reloadS: .35, count: 460 }),
    ],
  };
  for (const key of ['launcherSalvo', 'autoloader', 'fixedLaunchCanisters', 'primaryGuided', 'muzzleBoreSegments', 'launcherMuzzles'] as const) {
    delete spec.gun[key];
  }
  // Finland's three-tone (green, black and grey; photos 01, 07-08): the closest existing coat is the Swedish splinter
  // woodland of the CV90 Mk IV (authoredPaintCatalog.ts paint_cv90_mkiv), worn as the spec coat and the stock
  spec.visual = { ...spec.visual, scheme: 'splinter', base: '#3c4739', weather: '#525c49',
    patches: ['#202823', '#657251', '#303c32'], camoScale: .82, marking: 'number' };
  return spec;
}

function reach(record: FleetTankSpec): number {
  const [, ty, tz] = record.armor.turretPivot;
  return Math.hypot(GUN_X, ty + GUN_PIVOT[1], tz + GUN_PIVOT[2]) + MUZZLE_Z;
}

// ------------------------------------------------------------------------------------------------- ItPsv 90 (T-55) --
// en.wikipedia (Marksman anti-aircraft system): the T-55AM conversion, 41 t (36 t for the T-55AM), crew 3, the V-55 V12 at
// 620 hp; seven ordered by Finland in 1990, in service 1990, to war-time storage in 2010; the guns -10 to +85 degrees. The
// page gives no length, width or height for it: the hull is the fleet's T-55A (6.04 m, 3.27 m); the overall length is
// the hull with the guns ahead (7.8 m, an estimate from the placeholder's muzzles 4.76 m ahead of the hull centre), and the
// height the Leopard version's 4.82 m less the T-55's 0.47 m lower ring (1.17 m against 1.64 m), an estimate.
const marksmanT55 = marksmanVariant('marksman_t55', 't55a', 'Marksman (T-55)');
Object.assign(marksmanT55, {
  hp: 2400, enginePowerHp: 620, weightTons: 41, topSpeedKmh: 50, reverseSpeedKmh: 12, hullTraverseDegS: 36,
  turretTraverseDegS: 70, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 10,
});
marksmanT55.dims = { hullLengthM: 6.04, overallLengthM: 7.80, widthM: 3.27, heightM: 4.35 };
// photo 01 (Helsinki): "Ps465-22" on the hull side
marksmanT55.visual.number = '465-22';
marksmanT55.armor.boundingRadiusM = Math.max(marksmanT55.armor.boundingRadiusM, reach(marksmanT55));

// -------------------------------------------------------------------------------------------- ItPsv Leopard 2 --------
// en.wikipedia (Marksman anti-aircraft system): the Leopard 2A4 conversion, 49 t, 9.30 m with the guns forward, 3.70 m,
// 4.82 m, the Leopard 2's twin-turbo V12 at 1,479 hp (1,103 kW; the fleet's Leopard 2A4 carries 1,500 PS), 72 km/h, 550 km;
// seven produced in 2014-15, in service from 2016; the same turret, guns and crew of three.
const itpsvLeopard2 = marksmanVariant('itpsv_leopard2', 'leo2a4', 'ItPsv Leopard 2');
Object.assign(itpsvLeopard2, {
  hp: 2600, enginePowerHp: 1500, weightTons: 49, topSpeedKmh: 72, reverseSpeedKmh: 25, hullTraverseDegS: 40,
  turretTraverseDegS: 70, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 10,
});
itpsvLeopard2.dims = { hullLengthM: 7.72, overallLengthM: 9.30, widthM: 3.70, heightM: 4.82 };
// no number shows in the 2015 photographs (07-08): the designation's short form
itpsvLeopard2.visual.number = 'ItPsv';
itpsvLeopard2.armor.boundingRadiusM = Math.max(itpsvLeopard2.armor.boundingRadiusM, reach(itpsvLeopard2));

registerFleetSpecs(registries, ['marksman_t55', 'itpsv_leopard2'], { marksman_t55: marksmanT55, itpsv_leopard2: itpsvLeopard2 });

const BASES = Object.freeze({ marksman_t55: 't55a', itpsv_leopard2: 'leo2a4' });
let synchronized = false;
/**
 * Registration hook (fleetRegistration.ts, after every registration-time pass that rewrites a hull frame, here the
 * Leopard 2A4 envelopes): each base's final hull frame (hull plates, ring, hull modules, driver, track width) under the
 * Marksman turret's own records, so the armour matches the hull profiles/marksman.ts builds. Idempotent.
 */
export function synchronizeMarksmanFrames(): void {
  if (synchronized) return;
  synchronized = true;
  for (const [id, baseId] of Object.entries(BASES)) {
    const base = TANK_SPECS[baseId], own = TANK_SPECS[id];
    own.armor.hullPlates = structuredClone(base.armor.hullPlates);
    own.armor.turretPivot = [...base.armor.turretPivot];
    own.armor.modules = [...structuredClone(base.armor.modules.filter((box) => !box.turretLocal)),
      ...own.armor.modules.filter((box) => box.turretLocal)];
    own.armor.crew = [...structuredClone(base.armor.crew.filter((box) => !box.turretLocal)),
      ...own.armor.crew.filter((box) => box.turretLocal)];
    own.visual.trackWidthM = base.visual.trackWidthM;
    own.armor.boundingRadiusM = Math.max(base.armor.boundingRadiusM, reach(own));
  }
}
