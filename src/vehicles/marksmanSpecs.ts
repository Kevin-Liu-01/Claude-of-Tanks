// Release 269, the second air-defence round (owner 2026-11-03: "also add the Japanese type 87 SPAAG, UK Marksman, ...",
// then the Leopard 2 Marksman, "produced in 2014 and 15 and started its service in 2016 under the designation ItPsv
// Leopard 2"): the Marconi Marksman twin 35 mm turret on two hulls, Finland's ItPsv 90 on a T-55 and the ItPsv Leopard 2 on
// a Leopard 2A4 (docs/references/tanks/marksman_t55.md, itpsv_leopard2.md). Both are filed under the UK, the turret's
// maker (the game has no Finland tree).
//
// The combat rows are the registrar's (269 R0); builder M's measured build (profiles/marksman.ts, the one turret module
// profiles/marksmanTurret.ts) sets the spatial datums, every one read from the frame both files share
// (profiles/marksmanFrame.ts): each hull's ring, the elevation drum, the twin bores, the body's fifteen armoured faces,
// the turret's modules and crew, and the guns' stops over each hull's stern.
// Combat numbers are game tuning on published figures, not weapon specifications. First-party: Kevin B. Liu (NOTICE.md).
import './supplementalFleetSpecs.ts';
import './modern1Specs.generated.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';
import {
  MARKSMAN_BODY as BODY, MARKSMAN_BODY_FACES, MARKSMAN_BORE as BORE, MARKSMAN_MUZZLE_Z, MARKSMAN_POD as POD,
  MARKSMAN_RADAR as RADAR, MARKSMAN_RINGS, MARKSMAN_SIGHTS as SIGHTS, MARKSMAN_TRUNNION as TRUNNION, marksmanBodyPoint,
} from './profiles/marksmanFrame.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mean = (points: readonly Point[]): Point =>
  points.reduce<Point>((acc, p) => [acc[0] + p[0] / points.length, acc[1] + p[1] / points.length, acc[2] + p[2] / points.length], [0, 0, 0]);

/**
 * The turret's armour: the drawn body's fifteen planar faces (marksmanFrame.ts), each wound outward. en.wikipedia: the
 * turret proof against 14.5 mm and 155 mm air bursts; the roof 30 mm (valka.cz's ItPsv 90 post), the walls 35 mm.
 */
function bodyPlates(): ArmorPlate[] {
  const faces = Object.entries(MARKSMAN_BODY_FACES).map(([name, corners]) => [name, corners.map(marksmanBodyPoint)] as const);
  const centre = mean(faces.flatMap(([, points]) => points));
  return faces.map(([name, points]) => {
    const n = cross(sub(points[1], points[0]), sub(points[2], points[0]));
    const verts = dot(n, sub(mean(points), centre)) < 0 ? points.slice().reverse() : points;
    const mm = /roof|upperChamfer|frontUpper/.test(name) ? 30 : 35;
    return { ...plate(`marksman_${name}`, mm, verts[0], verts[1], verts[verts.length - 1], { keMm: mm, ceMm: mm + 5, kind: 'main' }),
      verts, convexPolygon: true };
  });
}

/** A base's hull modules under the Marksman turret: its own main-gun ammunition rack left out. */
function hullModules<T extends { turretLocal?: boolean; module: string }>(modules: readonly T[]): T[] {
  return modules.filter((box) => !box.turretLocal && box.module !== 'ammoRack');
}

/**
 * The base's power pack as two separate volumes (fix round 1, internalPlacement): the T-55A's spec carries one engine box
 * the anatomy carves its transmission from, the Leopard 2A4's a transmission box inside its engine's; their calibration
 * rows re-seat them, which these ids do not have yet. The transmission takes the rear 30 % of the pair's length behind
 * the engine (both rear-engined), a 2 cm gap between them.
 */
function separatePowerPack<T extends { module: string; min: readonly [number, number, number]; max: readonly [number, number, number] }>(
  modules: T[]): T[] {
  const engine = modules.find((box) => box.module === 'engine');
  if (!engine) return modules;
  const transmission: T = modules.find((box) => box.module === 'transmission') ?? { ...engine, module: 'transmission' };
  const z0 = Math.min(engine.min[2], transmission.min[2]), z1 = Math.max(engine.max[2], transmission.max[2]);
  const split = z0 + (z1 - z0) * 0.30;
  transmission.min = [transmission.min[0], transmission.min[1], z0];
  transmission.max = [transmission.max[0], transmission.max[1], split - 0.01];
  engine.min = [engine.min[0], engine.min[1], split + 0.01];
  engine.max = [engine.max[0], engine.max[1], z1];
  return modules.includes(transmission) ? modules : [...modules, transmission];
}

/** The Marksman turret's records on a hull: its ring, drum, bores, plates, modules, crew and the twin 35 mm. */
function marksmanVariant(id: string, baseId: string, name: string, ring: keyof typeof MARKSMAN_RINGS): FleetTankSpec {
  const spec = cloneFleetVariant(registries.tankSpecs, id, baseId, { name, nation: 'UK', era: 'modern', role: 'ifv' });
  delete spec.balancePeerOf;
  delete spec.publicVisualFallback;
  delete spec.label;
  delete spec.roster;
  delete spec.variantOf;
  stripSilhouetteDimensions(spec.dims);
  spec.armor.turretPivot = [...MARKSMAN_RINGS[ring]];
  spec.armor.gunPivot = [...TRUNNION];
  spec.armor.gunBarrel = { lengthM: MARKSMAN_MUZZLE_Z, radiusM: .05, collision: false };
  spec.armor.turretPlates = bodyPlates();
  // the sights' optics under the roof, both guns' pods (outside the body) as the gun; the guns' 500 rounds in the turret
  // (internalLayoutRegistry.ts spaaMarksman*: ammoRack and dualBeltFeed in the turret): the magazines low in the rear of
  // the body under the radar, the belt feeds across the body ahead of the crew to the drums (fix round 1: the hull's own
  // main-gun rack left out, as the Type 87's)
  const [, ty, tz] = TRUNNION;
  spec.armor.modules = [
    ...hullModules(spec.armor.modules),
    moduleBox('ammoRack', [-.70, .20, -1.50], [.70, .62, -.70], true),
    moduleBox('feedSystem', [-.74, .30, .80], [.74, .86, 1.45], true),
    moduleBox('optics', [-(SIGHTS.x + .14), BODY.roofY - .26, SIGHTS.z - .18], [SIGHTS.x + .14, BODY.roofY - .02, SIGHTS.z + .18], true),
    { ...moduleBox('gun', [-POD.outerX, ty + POD.bottomY, tz + POD.tailZ], [POD.outerX, ty + POD.topY, tz + POD.noseZ], true),
      external: true },
  ];
  // crew 3: the driver in the hull, the gunner (+x, the left) and the commander side by side under their sights
  // (internalLayoutRegistry.ts spaaMarksman*)
  spec.armor.crew = [
    ...spec.armor.crew.filter((box) => !box.turretLocal),
    crewBox('gunner', [.08, .02, -.30], [.60, 1.04, .72], true),
    crewBox('commander', [-.60, .02, -.30], [-.08, 1.04, .72], true),
  ];
  // The Gepard 1A2's twin-KDA package (gepardSpecs.ts), the same Oerlikon gun: the APDS-T unchanged, the HE channel the
  // fragmentation round at the page's 1,175 m/s. en.wikipedia: "460 fragmentation rounds and 40 anti-tank rounds" (the
  // infobox's 440 is not used).
  spec.gun = {
    ...spec.gun, caliberMm: 35, reloadS: .35, baseAccuracy: .25, aimTimeS: 1.05, soundProfile: 'kde-35',
    muzzles: [{ x: -BORE.x, y: BORE.y }, { x: BORE.x, y: BORE.y }],
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

/** The farthest drawn reach from the hull's origin: the muzzles with the guns forward, the radar's top. */
function reach(record: FleetTankSpec): number {
  const [, ty, tz] = record.armor.turretPivot;
  return Math.max(Math.hypot(BORE.x, ty + TRUNNION[1] + BORE.y, tz + TRUNNION[2] + MARKSMAN_MUZZLE_Z),
    Math.hypot(ty + RADAR.topY, tz + RADAR.z));
}

// ------------------------------------------------------------------------------------------------- ItPsv 90 (T-55) --
// en.wikipedia (Marksman anti-aircraft system): the T-55AM conversion, 41 t (36 t for the T-55AM), crew 3, the V-55 V12 at
// 620 hp; seven ordered by Finland in 1990, in service 1990, to war-time storage in 2010; the guns -10 to +85 degrees.
// valka.cz's ItPsv 90 post: the turret 11 t, 1,910 mm high marching and 2,705 mm with the radar in its firing position.
// The hull is the fleet's T-55A (6.04 m, 3.27 m across the fenders; 3.34 m over photo 01's flexible skirts). As built:
// 8.24 m with the guns forward (the muzzles 4.70 m ahead of the hull's centre over the 3.54 m of the drums behind it) and
// 3.71 m tall (the radar's 2.29 m over the T-55's 1.42 m ring plane; fix round 1 lowered it 0.39 m to photo 02's
// proportions; valka.cz's 2,705 mm is not the drawn radar's).
const marksmanT55 = marksmanVariant('marksman_t55', 't55a', 'Marksman (T-55)', 't55');
Object.assign(marksmanT55, {
  hp: 2400, enginePowerHp: 620, weightTons: 41, topSpeedKmh: 50, reverseSpeedKmh: 12, hullTraverseDegS: 36,
  turretTraverseDegS: 70, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 10,
});
marksmanT55.dims = { hullLengthM: 6.04, overallLengthM: 8.24, widthM: 3.34, heightM: 3.71 };
// The guns' own stops over the stern (builder M, fix round 1): the full -10 degrees all round but where the barrels pass
// over the deck's rear fittings and the drums (yaw 127-172, at most 0.7 degrees up); per-degree floors at the sweep's
// 26 mm with gunHullClearance's probe, fitted by tools/gun-depression-sweep.mjs --envelope (the T-55A's own curve, for its
// 100 mm, does not apply).
marksmanT55.gunPitchByYawDeg = [[0, -10], [126, -10], [127, -9.6], [130, -9.6], [131, -10], [148, -10], [150, -9.3], [153, -9.4],
  [154, -10], [166, -10], [167, -9.5], [170, -9.3], [171, -9.3], [172, -9.5], [173, -10], [180, -10]];
// photo 01 (Helsinki): "Ps465-22" on the hull side
marksmanT55.visual.number = '465-22';
marksmanT55.armor.boundingRadiusM = Math.max(marksmanT55.armor.boundingRadiusM, reach(marksmanT55));

// -------------------------------------------------------------------------------------------- ItPsv Leopard 2 --------
// en.wikipedia (Marksman anti-aircraft system): the Leopard 2A4 conversion, 49 t, 9.30 m with the guns forward, 3.70 m,
// 4.82 m, the Leopard 2's twin-turbo V12 at 1,479 hp (1,103 kW; the fleet's Leopard 2A4 carries 1,500 PS), 72 km/h, 550 km;
// seven produced in 2014-15, in service from 2016; the same turret, guns and crew of three. As built: 9.30 m with the
// guns forward (the frame's muzzles over the 2A4 hull's stern rack) and 3.93 m tall (the radar's 2.29 m over the 1.64 m
// ring plane: the published 4.82 m is photo 08's, an antenna raised on a tripod mast over the roof that photos 02, 03 and
// 07 of the same vehicle do not carry, not built).
const itpsvLeopard2 = marksmanVariant('itpsv_leopard2', 'leo2a4', 'ItPsv Leopard 2', 'leopard2');
Object.assign(itpsvLeopard2, {
  hp: 2600, enginePowerHp: 1500, weightTons: 49, topSpeedKmh: 72, reverseSpeedKmh: 25, hullTraverseDegS: 40,
  turretTraverseDegS: 70, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 10,
});
itpsvLeopard2.dims = { hullLengthM: 7.72, overallLengthM: 9.30, widthM: 3.70, heightM: 3.93 };
// The guns' own stops over the engine deck (builder M, fix round 1): the full -10 degrees but where the barrels pass over
// the deck's rear fittings (yaw 124-179, at most 0.7 degrees up); measured and fitted as the ItPsv 90's (the Leopard 2A4's
// own curve, for its 120 mm, does not apply).
itpsvLeopard2.gunPitchByYawDeg = [[0, -10], [123, -10], [125, -9.6], [139, -9.3], [161, -9.3], [177, -9.8], [180, -10]];
// no number shows in the 2015 photographs (07-08): the designation's short form
itpsvLeopard2.visual.number = 'ItPsv';
itpsvLeopard2.armor.boundingRadiusM = Math.max(itpsvLeopard2.armor.boundingRadiusM, reach(itpsvLeopard2));

registerFleetSpecs(registries, ['marksman_t55', 'itpsv_leopard2'], { marksman_t55: marksmanT55, itpsv_leopard2: itpsvLeopard2 });

const BASES = Object.freeze({ marksman_t55: 't55a', itpsv_leopard2: 'leo2a4' });
let synchronized = false;
/**
 * Registration hook (fleetRegistration.ts, after every registration-time pass that rewrites a hull frame, here the
 * Leopard 2A4 envelopes): each base's final hull frame (hull plates, hull modules, driver, track width) under the
 * Marksman turret's own records, so the armour matches the hull profiles/marksman.ts builds. The ring stays the frame's
 * (MARKSMAN_RINGS: the T-55A's spec pivot is its T-62 donor's until its anatomy is finalized). Idempotent.
 */
export function synchronizeMarksmanFrames(): void {
  if (synchronized) return;
  synchronized = true;
  for (const [id, baseId] of Object.entries(BASES)) {
    const base = TANK_SPECS[baseId], own = TANK_SPECS[id];
    own.armor.hullPlates = structuredClone(base.armor.hullPlates);
    own.armor.modules = [...separatePowerPack(structuredClone(hullModules(base.armor.modules))),
      ...own.armor.modules.filter((box) => box.turretLocal)];
    own.armor.crew = [...structuredClone(base.armor.crew.filter((box) => !box.turretLocal)),
      ...own.armor.crew.filter((box) => box.turretLocal)];
    own.visual.trackWidthM = base.visual.trackWidthM;
    own.armor.boundingRadiusM = Math.max(base.armor.boundingRadiusM, reach(own));
  }
}
