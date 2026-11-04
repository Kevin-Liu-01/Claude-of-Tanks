// Release 269, the second air-defence round (owner 2026-11-03: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV
// 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)"): the Polish PZA Loara, two 35 mm Oerlikon KDA on the PT-91
// Twardy chassis (docs/references/tanks/pza_loara.md).
//
// The combat rows are the registrar's (269 R0); builder P's measured build (profiles/loara.ts) sets the spatial datums,
// every one read from the frame both files share (profiles/loaraFrame.ts): the raised deck's plates, the ring, the
// elevation axis, the twin bores, the turret's welded shell, its modules and crew. Combat numbers are game tuning on
// published figures, not weapon specifications.
// First-party: Kevin B. Liu (NOTICE.md).
import './poland.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate, type CrewBox, type ModuleBox } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';
import {
  LOARA_BORE, LOARA_DECK as DECK, LOARA_DRIVER_X, LOARA_GUN_HOUSING as HOUSING, LOARA_MUZZLE_Z, LOARA_RING,
  LOARA_SEARCH_RADAR, LOARA_TRUNNION, LOARA_TURRET as T,
} from './profiles/loaraFrame.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];
type Face = 'left' | 'right' | 'floor' | 'roof' | 'rear' | 'front';

const BASE_ID = 'pt91a_twardy';

// A convex box of six outward-wound faces (the TOS-1A cradle's supportBox, tos1aTagilSpecs.ts), less the faces another
// box of the same shell covers.
function boxPlates(name: string, min: Point, max: Point, keMm: number, ceMm: number, omit: readonly Face[] = []): ArmorPlate[] {
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
  ] as const).filter(([face]) => !omit.includes(face)).map(([face, corners]) => {
    const verts = corners.map(([x, y, z]) => at(x, y, z));
    return { ...plate(`${name}_${face}`, keMm, verts[0], verts[1], verts[2], { keMm, ceMm, kind: 'main' }),
      verts, convexPolygon: true };
  });
}

/**
 * The raised hull's welded plates over the PT-91's (hull frame): its roof (replacing the B3 frame's deck plate under it),
 * its flanks from the base frame's deck line to the roof, the middle's front plate falling to the glacis, the cheeks'
 * roofs and front faces over the front fenders, the rear face; and the steel side screens the Loara keeps without the
 * Twardy's ERAWA tiles. Game tuning: the roofs the Twardy's deck's 40 mm, the flanks, cheeks and rear its rear plate's 45,
 * the front plate 80 (the T-72 upper glacis behind it carries the rest).
 */
function raisedHullPlates(baseDeckY: number): ArmorPlate[] {
  const W = DECK.halfW, top = DECK.topY, rear = DECK.rearZ, edge = DECK.edgeZ, c = DECK.coreHalfW, x0 = DECK.cheekInnerX;
  const footY = top - (DECK.frontFootZ - edge) * Math.tan(DECK.frontSlopeDeg * Math.PI / 180);
  const cheekEdge = DECK.cheekEdgeZ, cheekFoot = DECK.cheekFootZ;
  const cheekFootY = top - (cheekFoot - cheekEdge) * Math.tan(DECK.cheekSlopeDeg * Math.PI / 180);
  return [
    plate('hull_roof', 40, [-W, top, edge], [W, top, edge], [-W, top, rear], { kind: 'main' }),
    plate('loara_deck_side_l', 45, [W, baseDeckY, cheekEdge], [W, baseDeckY, rear], [W, top, cheekEdge], { kind: 'main' }),
    plate('loara_deck_side_r', 45, [-W, baseDeckY, rear], [-W, baseDeckY, cheekEdge], [-W, top, rear], { kind: 'main' }),
    plate('loara_deck_front', 80, [-c, footY, DECK.frontFootZ], [c, footY, DECK.frontFootZ], [-c, top, edge], { kind: 'main' }),
    plate('loara_cheek_roof_l', 40, [x0, top, cheekEdge], [W, top, cheekEdge], [x0, top, edge], { kind: 'main' }),
    plate('loara_cheek_roof_r', 40, [-W, top, cheekEdge], [-x0, top, cheekEdge], [-W, top, edge], { kind: 'main' }),
    plate('loara_cheek_front_l', 45, [x0, cheekFootY, cheekFoot], [W, cheekFootY, cheekFoot], [x0, top, cheekEdge], { kind: 'main' }),
    plate('loara_cheek_front_r', 45, [-W, cheekFootY, cheekFoot], [-x0, cheekFootY, cheekFoot], [-W, top, cheekEdge], { kind: 'main' }),
    plate('loara_deck_rear', 45, [W, baseDeckY, rear], [-W, baseDeckY, rear], [W, top, rear], { kind: 'main' }),
    // the PT-91's steel screens (profiles/pt91Twardy.ts sideScreen: 20 mm, its outer faces 1.779 and 1.791 m out)
    plate('loara_side_screen_l', 20, [1.791, 1.128, 3.25], [1.791, 1.128, -2.85], [1.791, 1.444, 3.25], { kind: 'spaced' }),
    plate('loara_side_screen_r', 20, [-1.779, 1.128, -2.85], [-1.779, 1.128, 3.25], [-1.779, 1.444, -2.85], { kind: 'spaced' }),
  ];
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
// (the T-72's main-gun depression table does not apply: the KDA keep the full -10 degrees all round, loara.selftest.mjs)
delete spec.gunPitchByYawDeg;
stripSilhouetteDimensions(spec.dims);
// Army Recognition (Loara): 45,300 kg, the S-12U at 850 hp, 60 km/h, 500 km, two Oerlikon KDA at 550 rpm each, a 26 km
// 3D search radar tracking 64 targets. en.wikipedia (PZA Loara): 45 t, 6.67 m, 3.4 m, crew 3, 60 km/h, 650 km (its
// S-1000 at 1,000 hp is the Loara-A listing; its 2.19 m height is marked dubious); one production vehicle and a few
// prototypes. armedconflicts.com (Cichy): 6.67 x 3.47 m, the KDA's 3.15 m barrels, -10 to +85 degrees. No load is
// published for the game's two belts: the Gepard's 40 + 640 rounds for the same Oerlikon-pattern twin 35 mm.
Object.assign(spec, {
  hp: 2550, enginePowerHp: 850, weightTons: 45.3, topSpeedKmh: 60, reverseSpeedKmh: 20, hullTraverseDegS: 34,
  turretTraverseDegS: 72, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 10,
});
// the build's envelope (loara.selftest.mjs holds it, 3 %): the PT-91 hull's fenders end to end with the guns forward
// inside them (the published 6.67 m is the hull), the side screens and the exhaust's width, the search radar's array
// raised to 5.47 m (the radio whips left out)
spec.dims = { hullLengthM: 6.67, overallLengthM: 6.88, widthM: 3.65, heightM: 5.47 };
// the raised deck's turret station and the drawn turret (profiles/loaraFrame.ts): the elevation bearing on each flank, the
// bores 0.16 m over its axis, the bore mouths (the brakes' faces) 3.05 m ahead of it
spec.armor.turretPivot = [...LOARA_RING];
spec.armor.gunPivot = [...LOARA_TRUNNION];
spec.armor.gunBarrel = { lengthM: LOARA_MUZZLE_Z, radiusM: .05, collision: false };
// the turret's welded shell: the long body, the lower skirt flaring out under the break ahead of the bearing discs, and
// the chin under the tracking radar (its back inside the body)
const skirtX = T.halfW + T.skirtFlare;
spec.armor.turretPlates = [
  ...boxPlates('loara_turret', [-T.halfW, T.floorY, T.rearZ], [T.halfW, T.roofY, T.frontZ], 25, 30),
  plate('loara_turret_skirt_l', 25, [skirtX, T.floorY, T.frontZ], [skirtX, T.floorY, T.skirtFullZ], [T.halfW, T.breakY, T.frontZ],
    { keMm: 25, ceMm: 30, kind: 'main' }),
  plate('loara_turret_skirt_r', 25, [-skirtX, T.floorY, T.skirtFullZ], [-skirtX, T.floorY, T.frontZ], [-T.halfW, T.breakY, T.skirtFullZ],
    { keMm: 25, ceMm: 30, kind: 'main' }),
  ...boxPlates('loara_chin', [-T.chinHalfW, T.floorY, T.frontZ], [T.chinHalfW, T.chinTopY, T.chinFrontZ], 20, 25, ['rear']),
];
// the optics under the commander's panoramic sight, both guns' housings (outside the shell) and the radio in the rear
// under the search radar's mast
const [, ty, tz] = LOARA_TRUNNION;
// (the pods' box: from the rear corner to the pointed nose, the deep lower body to the top)
spec.armor.modules = [
  ...spec.armor.modules.filter((box) => !box.turretLocal),
  moduleBox('optics', [-.72, .92, .95], [-.24, 1.24, 1.40], true),
  { ...moduleBox('gun', [-HOUSING.outerX, ty + HOUSING.bottomY, tz + HOUSING.rearZ],
    [HOUSING.outerX, ty + HOUSING.topY, tz + HOUSING.noseZ], true), external: true },
  moduleBox('radio', [-.30, .40, -.84], [.30, .80, -.50], true),
  // the ammunition in the turret (pl.wikipedia: the fragmentation rounds in a magazine in the turret's basket, the
  // armour-piercing belts beside the guns): the magazine low across the turret's rear, the belt feeds over it along the
  // guns' axis out through the bearings, clear of the radio between them and the crew ahead
  moduleBox('ammoRack', [-.95, .06, -.84], [.95, .36, -.18], true),
  moduleBox('feedSystem', [-1.05, .46, -.44], [1.05, .70, -.10], true),
];
// crew 3: the driver in the PT-91 hull, the gunner on the left (+x) and the commander on the right (pl.wikipedia) side by
// side in the turret body ahead of the guns' bearings, under their sights
spec.armor.crew = [
  ...spec.armor.crew.filter((box) => !box.turretLocal),
  crewBox('gunner', [.20, .06, .40], [.85, 1.15, 1.40], true),
  crewBox('commander', [-.85, .06, .40], [-.20, 1.15, 1.40], true),
];
// The Gepard 1A2's twin-KDA package (gepardSpecs.ts), the same Oerlikon gun: the APDS-T unchanged, the HE channel the
// HEI-T at the KDA's 1,175 m/s. Index 0 the right (-x) gun.
spec.gun = {
  ...spec.gun, caliberMm: 35, reloadS: .35, baseAccuracy: .25, aimTimeS: 1.05, soundProfile: 'kde-35',
  muzzles: [{ x: -LOARA_BORE.x, y: LOARA_BORE.y }, { x: LOARA_BORE.x, y: LOARA_BORE.y }],
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

/** Every drawn part's reach from the hull origin at any turret yaw: the muzzles at any pitch, the search radar's array. */
function reach(record: FleetTankSpec): number {
  const [, ry, rz] = record.armor.turretPivot;
  const muzzle = Math.hypot(LOARA_BORE.x, ry + ty + LOARA_BORE.y, Math.abs(rz) + Math.abs(tz)) + LOARA_MUZZLE_Z;
  const R = LOARA_SEARCH_RADAR;
  const radar = Math.hypot(R.arrayW / 2, ry + R.arrayCentreY + R.arrayH / 2, Math.abs(rz) + Math.abs(R.arrayZ) + R.arrayH / 2);
  return Math.max(muzzle, radar);
}
spec.armor.boundingRadiusM = Math.max(spec.armor.boundingRadiusM, reach(spec));

registerFleetSpecs(registries, ['pza_loara'], { pza_loara: spec });

let synchronized = false;
/**
 * Registration hook (fleetRegistration.ts, after every registration-time pass that rewrites a hull frame): the PT-91
 * Twardy's final hull frame (the T-72B3 frame fleetRenewalSpecs.ts gives it: hull plates, hull modules, driver, track
 * width) under the Loara's raised deck and its own turret records, so the armour matches the hull profiles/loara.ts
 * builds: the Twardy's ERAWA plates and its deck plate give way to the raised hull's plates, and the turret ring's module
 * rises with the ring onto the raised deck. Idempotent.
 */
export function synchronizeLoaraFrame(): void {
  if (synchronized) return;
  synchronized = true;
  const base = TANK_SPECS[BASE_ID], own = TANK_SPECS.pza_loara;
  const baseRoof = base.armor.hullPlates.find((p) => p.name === 'hull_roof');
  const baseDeckY = baseRoof ? Math.max(...baseRoof.verts.map((v) => v[1])) : 1.407;
  own.armor.hullPlates = [
    ...structuredClone(base.armor.hullPlates.filter((p) => p.kind !== 'era' && p.name !== 'hull_roof')),
    ...raisedHullPlates(baseDeckY),
  ];
  own.armor.turretPivot = [...LOARA_RING];
  const lift = LOARA_RING[1] - base.armor.turretPivot[1];
  // the hull's modules: the ring's rises with the ring; the power pack authored as the PT-91's anatomy row fits it, the
  // engine ahead of the transmission across the stern (the frame's engine box alone reaches the stern plate, where the
  // anatomy pass would otherwise put a transmission inside it); the T-72's carousel gives way to the turret's magazine
  own.armor.modules = [
    ...structuredClone(base.armor.modules.filter((box) => !box.turretLocal && box.module !== 'transmission'
      && box.module !== 'ammoRack')).map((box): ModuleBox =>
      (box.module === 'turretRing'
        ? { ...box, min: [box.min[0], box.min[1] + lift, box.min[2]], max: [box.max[0], box.max[1] + lift, box.max[2]] }
        : box.module === 'engine' ? { ...box, min: [-.98, .46, -2.52], max: [.96, 1.40, -1.66] } : box)),
    moduleBox('transmission', [-.84, .77, -3.06], [.82, 1.28, -2.58]),
    ...own.armor.modules.filter((box) => box.turretLocal),
  ];
  // the driver moved to the left of the T-72's middle (pl.wikipedia; armedconflicts.com: as on the T-55)
  own.armor.crew = [...structuredClone(base.armor.crew.filter((box) => !box.turretLocal)).map((box): CrewBox => (box.crew === 'driver'
    ? { ...box, min: [box.min[0] + LOARA_DRIVER_X, box.min[1], box.min[2]], max: [box.max[0] + LOARA_DRIVER_X, box.max[1], box.max[2]] }
    : box)),
    ...own.armor.crew.filter((box) => box.turretLocal)];
  own.visual.trackWidthM = base.visual.trackWidthM;
  own.armor.boundingRadiusM = Math.max(base.armor.boundingRadiusM, reach(own));
}
