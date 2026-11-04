// Release 269, the second air-defence round (owner 2026-11-03: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV
// 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)"): the JGSDF Type 87 self-propelled anti-aircraft gun, two 35 mm
// Oerlikon KDA (Japan Steel Works licence) on the Type 74 chassis (docs/references/tanks/type87_aw.md).
//
// The combat rows are the registrar's (269 R0); builder J's measured build (profiles/type87.ts) sets the spatial datums,
// every one read from the frame both files share (profiles/type87Frame.ts): the ring, the elevation axis, the twin bores,
// the turret's welded shell and its fixed gun pods, the enlarged hull's stern, the turret's modules and crew.
// Combat numbers are game tuning on published figures, not weapon specifications. First-party: Kevin B. Liu (NOTICE.md).
import './japan.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { bindFleetRegistries, cloneFleetVariant, registerFleetSpecs, stripSilhouetteDimensions } from './fleetSpecRegistry.ts';
import { crewBox, moduleBox, plate, shell, type ArmorPlate, type Vec3Tuple } from './specHelpers.ts';
import type { FleetTankSpec } from './specContracts.ts';
import {
  TYPE87_GUNS as G, TYPE87_HULL as H, TYPE87_RING, TYPE87_TRUNNION, TYPE87_TURRET as T,
} from './profiles/type87Frame.ts';

const registries = bindFleetRegistries(TANK_SPECS, MODEL_SOURCE, ALL_TANK_IDS);
type Point = [number, number, number];
type Face = 'left' | 'right' | 'floor' | 'roof' | 'rear' | 'front';

const BASE_ID = 'type74';

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

// The Type 74's chassis record: its hull armour, hull modules, driver, running gear and automotive character.
const spec = cloneFleetVariant(registries.tankSpecs, 'type87_aw', BASE_ID, {
  name: 'Type 87 Self-Propelled Anti-Aircraft Gun', nation: 'Japan', era: 'cold-war', role: 'ifv',
});
delete spec.balancePeerOf;
delete spec.publicVisualFallback;
delete spec.label;
delete spec.roster;
delete spec.variantOf;
// the Type 74's 105 mm traverse curve and its hydropneumatic gun-laying do not apply to guns that elevate to +85; the
// guns clear the hull at -5 degrees at every bearing (their bores stand 2.50 m over the ground at the axis, the hull's
// deck kit under 1.80 m: profiles/type87.selftest.mjs)
delete spec.gunPitchByYawDeg;
delete spec.hydropneumaticAim;
stripSilhouetteDimensions(spec.dims);
// en.wikipedia (Type 87 self-propelled anti-aircraft gun): 38.0 t, 7.99 m, 3.18 m, 3.25 m radar retracted (4.40 m
// erected), crew 3, the Mitsubishi 10ZF22WT two-stroke V10 at 720 hp, 53 km/h, the guns -5 to +85 degrees; 52 built
// 1987-2002. ja.wikipedia: the hull is a new one enlarged from the Type 74's (photo 01: 7.35 m to the stern basket's
// back, the Type 74's 6.77 m; profiles/type87Frame.ts TYPE87_HULL).
Object.assign(spec, {
  hp: 2350, enginePowerHp: 720, weightTons: 38, topSpeedKmh: 53, reverseSpeedKmh: 20, hullTraverseDegS: 38,
  turretTraverseDegS: 70, gunPitchDegS: 50, gunElevationDeg: 85, gunDepressionDeg: 5,
});
spec.dims = { hullLengthM: +(3.37 - H.sternZ + H.basketDepth).toFixed(2), overallLengthM: 7.99, widthM: 3.18, heightM: 3.25 };
// the Type 74 hull's ring (profiles/type74Family.ts) and the drawn guns (profiles/type87Frame.ts): the elevation axis at
// the tips of the pods' wedge noses, the bores on it 0.94 m either side, the bore mouths (the muzzle brakes' face flanges) 3.24 m ahead
// of it inside the v0 cages, whose end rings reach 3.50 m: 7.95 m overall with the guns forward (the published 7.99)
spec.armor.turretPivot = [...TYPE87_RING];
spec.armor.gunPivot = [...TYPE87_TRUNNION];
spec.armor.gunBarrel = { lengthM: G.muzzleZ, radiusM: .05, collision: false };
// the welded turret (en.wikipedia: "Steel (chassis), aluminium (turret)"): splinter and small-arms protection. The long
// central body, the cheeks under the pods' fronts and the two fixed gun pods (the faces inside another box left out).
spec.armor.turretPlates = [
  ...boxPlates('type87_body', [-T.bodyHalfW, T.floorY, T.rearZ], [T.bodyHalfW, T.roofY, T.faceZ], 20, 25),
  ...boxPlates('type87_cheek_r', [-T.cheekOuterX, T.floorY, T.cheekRearZ], [-T.bodyHalfW, T.cheekTopY, T.cheekFrontZ], 20, 25,
    ['right']),
  ...boxPlates('type87_cheek_l', [T.bodyHalfW, T.floorY, T.cheekRearZ], [T.cheekOuterX, T.cheekTopY, T.cheekFrontZ], 20, 25,
    ['left']),
  ...boxPlates('type87_pod_r', [-T.podOuterX, T.podRearBottomY, T.podRearZ], [-T.bodyHalfW, T.podFrontTopY, T.noseTipZ], 20, 25,
    ['right']),
  ...boxPlates('type87_pod_l', [T.bodyHalfW, T.podRearBottomY, T.podRearZ], [T.podOuterX, T.podFrontTopY, T.noseTipZ], 20, 25,
    ['left']),
];
// the sights under the roof's front edge; both guns' receivers in their fixed pods with the cradles' trunnion blocks at
// their noses (the pods do not pitch); the ready rounds low in the central body behind the crew and the twin belt feed
// over them (internalLayoutRegistry.ts spaaType87: ammunition and feed in the turret); the hull keeps the Type 74's
// modules but its ammunition (the hook below), the transmission behind the engine in the enlarged stern
const HULL_MODULES = [moduleBox('transmission', [-.80, .95, -3.55], [.80, 1.45, -3.20])];
spec.armor.modules = [
  ...spec.armor.modules.filter((box) => !box.turretLocal && box.module !== 'ammoRack'),
  ...HULL_MODULES,
  moduleBox('optics', [-.45, .78, 1.20], [.45, 1.00, 1.62], true),
  moduleBox('gun', [-T.podOuterX + .02, T.podRearBottomY + .04, T.podRearZ + .04],
    [T.podOuterX - .02, TYPE87_TRUNNION[1] + G.hubR, TYPE87_TRUNNION[2] + G.hubR], true),
  moduleBox('ammoRack', [-.60, .08, -1.78], [.60, .58, -.95], true),
  moduleBox('feedSystem', [-.60, .62, -1.72], [.60, .95, -1.00], true),
];
// crew 3: the driver in the hull (the Type 74's seat on the Type 87's side, the hook below), the gunner (+x, the left)
// and the commander side by side in the central body under their hatches (internalLayoutRegistry.ts spaaType87)
spec.armor.crew = [
  ...spec.armor.crew.filter((box) => !box.turretLocal),
  crewBox('gunner', [.08, .10, -.80], [.62, .98, .15], true),
  crewBox('commander', [-.62, .10, -.80], [-.08, .98, .15], true),
];
// The Gepard 1A2's twin-KDA package (gepardSpecs.ts), the same Oerlikon gun: the APDS-T unchanged, the HE channel the
// Type 87's HEI-T at its published 1,175 m/s. en.wikipedia: 310 anti-aircraft and 20 anti-armour rounds a gun.
spec.gun = {
  ...spec.gun, caliberMm: 35, reloadS: .35, baseAccuracy: .25, aimTimeS: 1.05, soundProfile: 'kde-35',
  muzzles: [{ x: -G.boreX, y: 0 }, { x: G.boreX, y: 0 }],
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
  return Math.hypot(G.boreX, ty + TYPE87_TRUNNION[1], tz + TYPE87_TRUNNION[2]) + G.cageTipZ;
}
spec.armor.boundingRadiusM = Math.max(spec.armor.boundingRadiusM, reach(spec));

registerFleetSpecs(registries, ['type87_aw'], { type87_aw: spec });

/** The enlarged hull's stern at height y (profiles/type74Family.ts overhungSternZ, TYPE74_HULL_STATIONS): the vertical
 * upper face at the deck's end, the overhang's underside to the knee, the lower plate raked forward to the belly. */
const FOOT_Y = 1.13, KNEE_Z = 0.26, KNEE_Y = 0.98, TOE_Z = 0.72, BELLY_Y = 0.43;
const sternZAt = (y: number): number => H.sternZ + (y >= FOOT_Y ? 0 : y >= KNEE_Y
  ? KNEE_Z * (FOOT_Y - y) / (FOOT_Y - KNEE_Y)
  : KNEE_Z + (TOE_Z - KNEE_Z) * Math.min(1, (KNEE_Y - y) / (KNEE_Y - BELLY_Y)));
/** A hull box mirrored across the centreline (the Type 74's driver and radio on the Type 87's sides). */
const mirrored = <B extends { min: Vec3Tuple; max: Vec3Tuple }>(box: B): B =>
  ({ ...box, min: [-box.max[0], box.min[1], box.min[2]], max: [-box.min[0], box.max[1], box.max[2]] }) as B;
/** Whether a hull box of the Type 74's sits on the other side from the Type 87's driver (the driver and the radio beside
 * him change sides together: the Type 87's APU takes the Type 74 driver's side, photo 06). */
const otherSide = (box: { min: Vec3Tuple; max: Vec3Tuple }): boolean =>
  Math.sign(box.min[0] + box.max[0]) === -H.driverSide;

let synchronized = false;
/**
 * Registration hook (fleetRegistration.ts, after every registration-time pass that rewrites a hull frame): the Type 74's
 * final hull frame (hull plates, ring, hull modules, driver, track width) under this id's own turret records, so the
 * armour matches the hull profiles/type87.ts builds; the hull's stern plates and the rear ends of its sides and roof are
 * carried aft to the enlarged hull's stern (the tracks keep theirs), and the driver's seat and the radio beside it go to
 * the Type 87's sides (the driver on the left, photos 03, 05). Idempotent.
 */
export function synchronizeType87Frame(): void {
  if (synchronized) return;
  synchronized = true;
  const base = TANK_SPECS[BASE_ID], own = TANK_SPECS.type87_aw;
  own.armor.hullPlates = structuredClone(base.armor.hullPlates).map((p) => (/^track/.test(p.name) ? p : {
    ...p, verts: p.verts?.map(([x, y, z]): Point => (z < -3.0 ? [x, y, sternZAt(y)] : [x, y, z])),
  }));
  own.armor.turretPivot = [...base.armor.turretPivot];
  const driver = base.armor.crew.find((box) => box.crew === 'driver' && !box.turretLocal);
  const swap = !!driver && otherSide(driver);
  own.armor.modules = [...structuredClone(base.armor.modules.filter((box) => !box.turretLocal && box.module !== 'ammoRack'))
    .map((box) => (swap && (box.module === 'radio') ? mirrored(box) : box)),
  ...structuredClone(HULL_MODULES), ...own.armor.modules.filter((box) => box.turretLocal)];
  own.armor.crew = [...structuredClone(base.armor.crew.filter((box) => !box.turretLocal))
    .map((box) => (swap && box.crew === 'driver' ? mirrored(box) : box)),
  ...own.armor.crew.filter((box) => box.turretLocal)];
  own.visual.trackWidthM = base.visual.trackWidthM;
  own.armor.boundingRadiusM = Math.max(base.armor.boundingRadiusM, reach(own));
}
