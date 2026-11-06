// Release 269 (the owner 2026-11-04: "also add the m163 VADS", on the South Africa/Australia session's M113 "base
// models"; then "that m163 literally has a gatling gun/minigun on its turret so itll be so fun to have in game and play
// around with"): the US Army's M163 Vulcan Air Defense System, the M157 mount's open one-man turret and its 20 mm M168
// Vulcan on the M741, a modified M113A1 (docs/references/tanks/m163_vads.md).
//
// The chassis is the M113's (cloned from the US M113A3, usaM113Specs.ts, which carries the M113 hull's armour,
// m113Combat.ts); the turret envelope and every spatial datum are the measured build's (profiles/m163.ts on the M113
// builder's M741 hull, profiles/m113.ts buildM113HullSteps(P, 'm741')), read from the frame both files share
// (profiles/m163Frame.ts). Combat numbers are game tuning on published figures, not weapon specifications.
// First-party: Kevin B. Liu (NOTICE.md).
import './usaM113Specs.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';
import { m113Mobility } from './m113Combat.ts';
import { M113_BASE } from './m113Datums.ts';
import { M741_RING } from './m741Datums.ts';
import {
  M163_GUN as G, M163_GUNNER, M163_MUZZLE_Z, M163_RADAR as R, M163_TRUNNION, M163_TURRET as T,
} from './profiles/m163Frame.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];

const BASE_ID = 'm113a3';
const DEG = Math.PI / 180;

/** One convex armour polygon, its corners wound counter-clockwise seen from outside. */
function polygon(name: string, verts: Point[], keMm: number, ceMm: number): ArmorPlate {
  return { ...plate(name, keMm, verts[0], verts[1], verts[2], { keMm, ceMm, kind: 'main' }), verts, convexPolygon: true };
}
/** The polygon wound so its face looks along `outward`. */
function facing(name: string, verts: Point[], outward: Point, mm: number): ArmorPlate {
  const [a, b, c] = verts, u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return polygon(name, n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] >= 0 ? verts : [...verts].reverse(), mm, mm);
}
/** A point at a bearing (degrees from +z towards +x) and radius about (cx, cz), turret frame. */
const at = (deg: number, r: number, y: number, cx = 0, cz = 0): Point =>
  [cx + r * Math.sin(deg * DEG), y, cz + r * Math.cos(deg * DEG)];
/** An axis-aligned box's faces, less the named ones. */
function boxFaces(name: string, min: Point, max: Point, mm: number, omit: readonly string[] = []): ArmorPlate[] {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  return ([
    ['left', [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0]],
    ['right', [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]],
    ['roof', [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]],
    ['floor', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]],
    ['front', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]],
    ['rear', [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1]],
  ] as [string, Point[], Point][]).filter(([face]) => !omit.includes(face))
    .map(([face, verts, outward]) => facing(`${name}_${face}`, verts, outward, mm));
}

// The M113A3's chassis record: its hull armour, its driver and its automotive character (the M741 is the same aluminium
// M113A1 hull)
const spec = cloneFleetVariant(registries.tankSpecs, 'm163_vads', BASE_ID, {
  name: 'M163 VADS', nation: 'USA', era: 'cold-war', role: 'ifv',
});
for (const key of ['balancePeerOf', 'publicVisualFallback', 'label', 'roster', 'variantOf', 'gunPitchByYawDeg'] as const) delete spec[key];
stripSilhouetteDimensions(spec.dims);
// en.wikipedia ("M163 VADS"): 12,310 kg (the M163A1), crew 4, the 6V53 of 212 hp, 64 km/h, -5 to +80 degrees; the
// turret's 60 degrees a second in traverse and 45 in elevation (the M157 mount). The dims are the build's: the M113A1's
// 4.863 m hull, 5.35 m from its lamp guards to the M113A2's rear fuel tanks (r4: photo 07 is an M163A2; the M113A3's
// 5.38 m over the same tanks); 2.72 m over the sprockets' hubs (the published 2.85 m takes the side stowage the build
// leaves off); 3.02 m to the radar cases' caps (r5: the photographs' cases stand 15 % of the housing's diameter over it;
// the housing sits lower so the caps keep the r4 height, 4 % over the published 115 in, 2.90 m).
Object.assign(spec, {
  hp: 1750, ...m113Mobility(12.31, 212, 64),
  turretTraverseDegS: 60, gunPitchDegS: 45, gunElevationDeg: 80, gunDepressionDeg: 5,
});
spec.dims = { hullLengthM: 4.86, overallLengthM: 5.35, widthM: 2.72, heightM: 3.02 };
spec.armor.turretPivot = [M741_RING.x, M741_RING.roofY, M741_RING.z];
spec.armor.gunPivot = [...M163_TRUNNION];
// the fire axis on the cluster's centre line, its plane the barrels' muzzles; the cluster's clamp as its radius
spec.armor.gunBarrel = { lengthM: M163_MUZZLE_Z, radiusM: G.muzzleClampR };
// The open mount (r4; photos 01, 03, 04, 07, 08, 09): the raised base on the race (its flaring sides and deck), the
// gunner's open column (its wall's facets), the box shield square to the hull on its left (the outer face, the two ends
// and the inner face aft of the column), the upright slab at the ring's right front (its two faces) and the sight head on
// its post, all splinter protection; the gunner rides with his head and shoulders over the rim.
const SIDES = 8;
const drumR = T.drumR * 1.02, footR = T.footR * 1.02, C = T.column, B = T.boxShield, Rp = T.radarPlate, V = M163_GUNNER.sight;
/** The box shield's corner on its inner (x = B.innerX) or outer face, at its front (z0) or rear (z1) end, foot or top. */
const boxAt = (outer: boolean, end: 'z0' | 'z1', top: boolean): Point => {
  const station = top ? B.top : B.foot;
  return [outer ? station.outX : B.innerX, top ? B.topY : B.footY, station[end]];
};
spec.armor.turretPlates = [
  ...Array.from({ length: SIDES }, (_, k) => {
    const a = (360 / SIDES) * k, b = (360 / SIDES) * (k + 1);
    return polygon(`m163_ring_${k}`, [at(a, footR, T.footY), at(b, footR, T.footY), at(b, drumR, T.deckY), at(a, drumR, T.deckY)], 12, 12);
  }),
  polygon('m163_deck', Array.from({ length: SIDES }, (_, k) => at((360 / SIDES) * k, drumR, T.deckY)), 12, 12),
  ...Array.from({ length: SIDES }, (_, k) => {
    const a = (360 / SIDES) * k, b = (360 / SIDES) * (k + 1);
    return polygon(`m163_column_${k}`, [at(a, C.r, T.deckY, C.x, C.z), at(b, C.r, T.deckY, C.x, C.z), at(b, C.r, C.topY, C.x, C.z),
      at(a, C.r, C.topY, C.x, C.z)], 12, 12);
  }),
  facing('m163_box_outer', [boxAt(true, 'z0', false), boxAt(true, 'z1', false), boxAt(true, 'z1', true), boxAt(true, 'z0', true)],
    [1, 0, 0], 12),
  facing('m163_box_front', [boxAt(false, 'z0', false), boxAt(true, 'z0', false), boxAt(true, 'z0', true), boxAt(false, 'z0', true)],
    [0, 0, 1], 12),
  facing('m163_box_rear', [boxAt(false, 'z1', false), boxAt(true, 'z1', false), boxAt(true, 'z1', true), boxAt(false, 'z1', true)],
    [0, 0, -1], 12),
  facing('m163_box_inner', [boxAt(false, 'z0', false), boxAt(false, 'z1', false), boxAt(false, 'z1', true), boxAt(false, 'z0', true)],
    [-1, 0, 0], 12),
  ...[[Rp.x, -1], [Rp.x + Rp.t, 1]].map(([x, side]) => facing(`m163_slab_${side < 0 ? 'out' : 'in'}`, [[x, T.deckY, Rp.z0],
    [x, T.deckY, Rp.z1], [x, Rp.topY, Rp.z1], [x, Rp.topY, Rp.z0 + Rp.cutZ], [x, Rp.topY - Rp.cutY, Rp.z0]], [side, 0, 0], 12)),
  ...boxFaces('m163_sight', [V.x - V.w / 2, V.y - V.h / 2, V.z - V.d / 2], [V.x + V.w / 2, V.y + V.h / 2, V.z + V.d / 2], 6, ['floor']),
];
// Turret-local volumes (internalLayoutRegistry.ts spaaM163): the Vulcan's housing, feeder and cradle about the trunnion;
// the gunner's sight head. Hull volumes (the M741's layout: the 6V53 at the front right beside the driver and its
// transmission ahead of it, the fuel cell on the left, the linkless drum under the turret (1,100 ready rounds, the 1,000
// stowed beside it), the radio on the right rear wall by the commander's hatch, the race's ring over the roof's rear half).
const [gx, gy, gz] = M163_TRUNNION, roof = M113_BASE.roofY, rz = M741_RING.z;
const HULL_MODULES = [
  moduleBox('engine', [-0.85, 0.45, 0.55], [-0.10, 1.55, 1.45]),
  moduleBox('transmission', [-0.85, 0.45, 1.55], [-0.08, 1.05, 2.15]),
  moduleBox('fuelTank', [0.30, 0.45, -1.10], [0.85, 1.20, -0.30]),
  moduleBox('ammoRack', [-0.32, 0.50, rz - 0.32], [0.28, 1.55, rz + 0.30]),
  moduleBox('radio', [-0.90, 1.20, -1.60], [-0.45, 1.60, -1.25]),
  moduleBox('turretRing', [-0.63, roof - 0.18, rz - 0.59], [0.63, roof + 0.02, rz + 0.59]),
];
spec.armor.modules = [
  ...spec.armor.modules.filter((box) => !box.turretLocal && (box.module === 'trackL' || box.module === 'trackR')),
  ...HULL_MODULES,
  moduleBox('gun', [gx - 0.18, gy - 0.21, gz - 0.30], [gx + 0.18, gy + 0.24, gz + 0.40], true),
  moduleBox('optics', [V.x - V.w / 2, V.y - V.h / 2, V.z - V.d / 2], [V.x + V.w / 2, V.y + V.h / 2, V.z + V.d / 2], true),
];
// crew 4 (en.wikipedia: commander, gunner, loader, driver): the driver at the front left (the M113A3's), the gunner on his
// seat in his column, the commander under his round hatch at the right rear (m741Datums.ts M741_COMMANDER_HATCH), the
// loader opposite him on the left
const S = M163_GUNNER.seat;
const HULL_CREW = [
  crewBox('commander', [-0.92, 0.50, -2.25], [-0.40, 1.80, -1.66]),
  crewBox('loader', [0.40, 0.50, -2.25], [0.92, 1.70, -1.66]),
];
spec.armor.crew = [
  ...spec.armor.crew.filter((box) => !box.turretLocal && box.crew === 'driver'),
  ...HULL_CREW,
  crewBox('gunner', [S.x - 0.22, T.deckY + 0.03, S.z - 0.22], [S.x + 0.22, 0.92, S.z + 0.26], true),
];
// The gunner rides on his seat in his open column, his head and shoulders over its rim (07, 08): the column's inside to
// well over his head is his station (tools/crew-seat-fit.mjs armor.openStations), his boots just under the race through
// the ring (the column is 0.49 m deep; seated so, his pelvis lands on the seat's 0.50 m), never the hull's floor.
spec.armor.openStations = [{ crew: 'gunner', center: [C.x, C.z], radius: C.r - C.wall, floorY: -0.25, topY: C.topY + 0.9 }];
// The M168 (the M61A1 on the M157 mount). The game cannot fire faster than its 0.05 s floor, so the cycle is the real
// gun's 1,000 rounds a minute (its ground rate; the 3,000 of its air bursts is below the floor), and the gunner's
// 60-round burst setting (the burst limiter's 10, 30, 60 or 100) is one magazine: 3.5 s of fire, then 4.0 s while
// the burst limiter resets and the feed recharges. A burst puts 1,200 damage out at ~340 a second (twice the 268/269
// twin-35 mm's ~175), and the cycle sustains ~9,550 a minute (the tier-V twin-35 mm's ~10,450 a minute): a 20 mm hose
// for a tier IV light hull. The M53 API (100 g at 1,030 m/s) a step over the Marder's 20 mm at IV, losing fast with
// range; the M56 HEI (10.7 g of HE) bursts on what it strikes. 2,100 rounds (1,100 ready in the drum and 1,000 stowed),
// one in three armour-piercing.
spec.gun = {
  ...spec.gun, caliberMm: 20, reloadS: 4.0, baseAccuracy: 0.30, aimTimeS: 0.95, soundProfile: 'rh202',
  autoloader: { magazineSize: 60, intraClipS: 0.06, fullReloadS: 4.0 },
  shells: [
    shell('M53 API', 'AP', 20, 90, 72, 20, 1030, { pen2000Mm: 55, reloadS: 0.06, count: 700 }),
    shell('M56 HEI', 'HE', 20, 8, 8, 22, 1030, { pen2000Mm: 8, reloadS: 0.06, count: 1400 }),
  ],
};
for (const key of ['launcherSalvo', 'fixedLaunchCanisters', 'primaryGuided', 'muzzleBoreSegments', 'launcherMuzzles', 'muzzles'] as const) {
  delete spec.gun[key];
}
// The US desert service coat (the owner's photograph's sand; camoPolicy.ts service_usa_desert, the US Factory coat) as
// the spec coat; the trim vane's "A-21" (photo 03)
spec.visual = { ...spec.visual, scheme: 'desert', base: '#b09466', weather: '#c4ad7d', patches: ['#7a5f43', '#947c52', '#cbb489'],
  camoScale: 0.52, marking: 'number', number: 'A21' };
delete spec.visual.patchK;

/** The farthest the build reaches from the hull origin (its whips aside): the muzzle with the gun forward, or the radar's
 * outboard case. */
function reach(record: FleetTankSpec): number {
  const [, ty, tz] = record.armor.turretPivot;
  const muzzle = Math.hypot(gx, ty + gy, tz + gz + M163_MUZZLE_Z);
  const radar = Math.hypot(Math.hypot(R.x - R.caseDx, tz + R.z - R.caseDz) + R.caseR, ty + R.caseTopY);
  return Math.max(muzzle, radar);
}
spec.armor.boundingRadiusM = Math.max(spec.armor.boundingRadiusM, reach(spec));

registerFleetSpecs(registries, ['m163_vads'], { m163_vads: spec });

let synchronized = false;
/**
 * Registration hook (fleetRegistration.ts, after every registration-time pass that rewrites a hull frame): the M113A3's
 * final hull frame (its hull plates, track modules, driver and track width) under this id's own turret, ring and hull
 * records, so the armour matches the hull profiles/m113.ts builds. Idempotent.
 */
export function synchronizeM163Frame(): void {
  if (synchronized) return;
  synchronized = true;
  const base = TANK_SPECS[BASE_ID], own = TANK_SPECS.m163_vads;
  own.armor.hullPlates = structuredClone(base.armor.hullPlates);
  own.armor.modules = [
    ...structuredClone(base.armor.modules.filter((box) => !box.turretLocal && (box.module === 'trackL' || box.module === 'trackR'))),
    ...structuredClone(HULL_MODULES), ...own.armor.modules.filter((box) => box.turretLocal)];
  own.armor.crew = [...structuredClone(base.armor.crew.filter((box) => !box.turretLocal && box.crew === 'driver')),
    ...structuredClone(HULL_CREW), ...own.armor.crew.filter((box) => box.turretLocal)];
  own.visual.trackWidthM = base.visual.trackWidthM;
  own.armor.boundingRadiusM = Math.max(base.armor.boundingRadiusM, reach(own));
}
