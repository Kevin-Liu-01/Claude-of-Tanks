// Release 268, the twin-cannon air-defence round (owner 2026-11-02, "we should add more double barrel vehicels"): the
// Flakpanzer Gepard 1A2, twin 35 mm Oerlikon KDA on the Leopard 1 chassis (docs/references/tanks/gepard_1a2.md).
//
// The combat rows are the registrar's (268 R0); builder G's measured build (profiles/gepard.ts) sets the spatial datums,
// every one read from the frame both files share (profiles/gepardFrame.ts): the ring, the elevation bearing, the twin
// bores, the turret's armoured shell, its modules and crew.
// Combat numbers are game tuning on published figures, not weapon specifications. First-party: Kevin B. Liu (NOTICE.md).
import './modern2Specs.generated.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate } from './specHelpers.ts';
import {
  GEPARD_BORE, GEPARD_GUN_COVER as COVER, GEPARD_MUZZLE_Z, GEPARD_RING, GEPARD_TRUNNION, GEPARD_TURRET as T,
} from './profiles/gepardFrame.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];
type Face = 'left' | 'right' | 'floor' | 'roof' | 'rear' | 'front';

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

// The Leopard 1A5's chassis record: its hull armour, hull modules, running gear and the Bundeswehr coat it wears.
const spec = cloneFleetVariant(registries.tankSpecs, 'gepard_1a2', 'leo1a5', {
  name: 'Flakpanzer Gepard 1A2', nation: 'Germany', era: 'modern', role: 'ifv',
});
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
delete spec.variantOf;
// The guns' own stops over the stern (builder G): the full -10 degrees all round but over the engine deck, where the
// muzzle heads meet the outlets' and the exhaust's covers from yaw 140; measured with gunHullClearance's probe at the
// sweep's 26 mm (.qa-dev/gepard/sweepfast.mjs, 0.5-degree grid bisected to 0.05) and fitted by
// tools/gun-depression-sweep.mjs --envelope. (The Leopard 1A5's own curve, for its 105 mm, does not apply.)
spec.gunPitchByYawDeg = [[0, -10], [139, -10], [140, -9.5], [142, -9], [144, -9], [145, -9.1], [149, -9.7], [151, -9.3],
  [172, -9], [175, -9], [180, -9.4]];
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
// the Leopard 1 hull's turret station (profiles/leopard1Hull.ts) and the drawn turret (profiles/gepardFrame.ts): the
// elevation bearing on each flank of the upper body, the bores 0.17 m over its axis, the muzzle heads 4.05 m ahead of it
// (7.72 m overall with the guns forward: the published 7.68 and 7.76 m)
spec.armor.turretPivot = [...GEPARD_RING];
spec.armor.gunPivot = [...GEPARD_TRUNNION];
spec.armor.gunBarrel = { lengthM: GEPARD_MUZZLE_Z, radiusM: .05, collision: false };
// the turret's welded shell: the narrow upper body, the full-width rear section behind the gun bays, the two low cheeks
// under the bays' front (the faces inside another box left out)
spec.armor.turretPlates = [
  ...boxPlates('gepard_body', [-T.bodyHalfW, T.floorY, T.rearFrontZ], [T.bodyHalfW, T.roofY, T.frontZ], 25, 30, ['rear']),
  ...boxPlates('gepard_rear', [-T.rearHalfW, T.floorY, T.rearZ], [T.rearHalfW, T.roofY, T.rearFrontZ], 25, 30, ['front']),
  // the rear section's front face where it shows: the gun bays' rear walls either side of the body
  ...[-1, 1].map((s) => {
    const inner = s * T.bodyHalfW, outer = s * T.rearHalfW, lo = s < 0 ? outer : inner, hi = s < 0 ? inner : outer;
    const verts: Point[] = [[lo, T.floorY, T.rearFrontZ], [hi, T.floorY, T.rearFrontZ], [hi, T.roofY, T.rearFrontZ],
      [lo, T.roofY, T.rearFrontZ]];
    return { ...plate(`gepard_rear_bay_${s < 0 ? 'r' : 'l'}`, 25, verts[0], verts[1], verts[3], { keMm: 25, ceMm: 30, kind: 'main' }),
      verts, convexPolygon: true };
  }),
  ...boxPlates('gepard_cheek_r', [-T.cheekOuterX, T.floorY, T.cheekRearZ], [-T.bodyHalfW, T.cheekTopY, T.cheekFrontZ], 25, 30,
    ['right']),
  ...boxPlates('gepard_cheek_l', [T.bodyHalfW, T.floorY, T.cheekRearZ], [T.cheekOuterX, T.cheekTopY, T.cheekFrontZ], 25, 30,
    ['left']),
];
// the sights over the roof's front, both guns' covers (outside the shell) and the radios in the rear section
const coverY = GEPARD_TRUNNION[1] + COVER.bottomY, coverTopY = GEPARD_TRUNNION[1] + COVER.topY;
spec.armor.modules = [
  ...spec.armor.modules.filter((box) => !box.turretLocal),
  moduleBox('optics', [-.62, .84, .78], [.62, 1.06, 1.26], true),
  { ...moduleBox('gun', [-COVER.outerX, coverY, GEPARD_TRUNNION[2] + COVER.rearZ],
    [COVER.outerX, coverTopY, GEPARD_TRUNNION[2] + COVER.noseZ], true), external: true },
];
// the gunner on the left (+x), the commander on the right (internalLayoutRegistry.ts spaaGepard), in the upper body
spec.armor.crew = [
  ...spec.armor.crew.filter((box) => !box.turretLocal),
  crewBox('gunner', [.08, .12, -.70], [.66, .98, .45], true),
  crewBox('commander', [-.66, .12, -.70], [-.08, .98, .45], true),
];
// The Terminator 2's twin 2A42 package (afvFamily.ts) scaled by calibre to 35 mm (x 35/30): penetration and damage up,
// the cycle a sixth slower (0.35 s against 0.30). 40 armour-piercing and 640 anti-aircraft rounds (Wikipedia: 320 + 20 a
// gun); the 1A2 fires FAPDS at the 35 mm family's ~1,440 m/s, the APDS-T at 1,385 m/s.
spec.gun = {
  ...spec.gun, caliberMm: 35, reloadS: .35, baseAccuracy: .25, aimTimeS: 1.05, soundProfile: 'kde-35',
  muzzles: [{ x: -GEPARD_BORE.x, y: GEPARD_BORE.y }, { x: GEPARD_BORE.x, y: GEPARD_BORE.y }],
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
