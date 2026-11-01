// KF51 EVO (`kf51_evo`): Rheinmetall's production Panther for Hungary (development contract 2023-12-15, with N7):
// three crew and an autoloader, the revised EVO turret built for a later 130 mm retrofit, StrikeShield stand-off protection
// and a Bueffel-derived Leopard 2 chassis. Its public form is the "PANTHER EVO UPGRADE" Rheinmetall showed at Eurosatory
// 2024 (the EVO turret on a Leopard 2 hull); where that vehicle shows no clear part, the 2022 Panther demonstrator
// supplies it. The game keeps the 130 mm: the Rh-130 L/52 in the EVO turret (the turret's planned retrofit).
//
// Reference packet: ~/cot-lanes/ifv-modern-267-evidence/research/kf51_evo/ (photos, sources.md, notes.md) and
// docs/references/tanks/kf51.md. Frames (all metres, +z forward, +x the vehicle's LEFT, y from the ground):
// - hull: Leopard 2 deck at 1.615 under the turret, long shallow upper glacis to a 3.83 nose, engine deck 1.76 aft; the
//   KF51 running gear (the Leopard 2 6X stations at the Panther's 0.587 track, `leoGear`) with its forged wheel faces;
//   deep two-row StrikeShield flank modules to the 3.60 m width guard.
// - turret: the rig sits at hull (0, 1.71, 0.63) and the gun pivot at turret (0, 0.38, 0.90): the measured combat rig
//   (combatGunRigs.generated.ts) both hold. A low six-sided shell (roof 0.815, side crease 0.40) with two arrowhead
//   cheeks either side of a vertical gun-slot face at z 1.10 (x +-0.43, kf51Specs.ts's mantlet plate), a squared bustle
//   with stowage-box sides, the gunner's sight on the right cheek, the SEOSS panoramic sight behind it, twin-lens sensor
//   heads, countermeasure launchers along the roof edges, the remote weapon station and whips.
// - gun: a trunnion roll, the EVO's long six-sided shroud with its top vents, the Rh-130 tube (5.475 m from the pivot)
//   with its thermal sleeve, the stepped muzzle section and the box MRS.
// Copyright (c) 2026 Kevin B. Liu.
import { KIT, FITTINGS, convexSlab, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { lineAt, mirrorRing } from './leopard2Hull.ts';
import { LEOPARD_2_RUNNING_GEAR } from './leopardA6XWheels.ts';
import { leoGear, addLeopardOpenYokeAuxRws } from './leopard.ts';
import { antennaPart } from './antennaPart.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { drainTankBuild, withBuildSteps, type TankProfileBuild } from '../tankBuildCooperation.ts';

type P3 = readonly [number, number, number];
type Side = -1 | 1;

const GEAR = LEOPARD_2_RUNNING_GEAR;
const TRACK_XC = 1.262;
const TRACK_W = 0.587;

/** Hull deck line [z, y] (ascending z): the engine deck, the fighting compartment roof under the turret, the upper glacis. */
const DECK: ReadonlyArray<readonly [number, number]> = [
  [-3.74, 1.765], [-2.66, 1.76], [-2.34, 1.69], [-1.50, 1.62], [0.0, 1.615], [1.80, 1.615],
  [2.05, 1.585], [2.70, 1.475], [3.30, 1.36], [3.70, 1.27], [3.83, 1.235],
];
/** Belly line [z, y]: the rear plate's foot, the flat belly at the Leopard's 0.47 clearance, the lower glacis to the nose. */
const BELLY: ReadonlyArray<readonly [number, number]> = [
  [-3.74, 0.95], [-3.40, 0.62], [-2.95, 0.47], [3.05, 0.47], [3.72, 0.98], [3.83, 1.10],
];
const TUB_HW = 0.94;          // inside the track lane's 0.9685 inner face
const SPONSON_HW = 1.69;
const SPONSON_FLOOR = 1.30;   // over the 1.20 track top and both end wraps
const HULL_REAR = -3.74;
const HULL_NOSE = 3.83;
const SKIRT_HEM = GEAR.skirtHemY;
const SKIRT_OUT = 1.80;       // the 3.60 m width guard (leopard.ts WIDTH GUARD)

/** Turret-local datums. */
const T_ROOF = 0.815;
const T_CREASE = 0.40;
const T_FLOOR = -0.035;
const SLOT_HW = 0.43;         // the gun slot's half width: the cheeks' inner walls (kf51Specs.ts KF51_MANTLET)
const SLOT_FACE_Z = 1.10;     // the vertical gun-slot face (kf51EvoGunFace.selftest.mjs)
/** The cheeks' swept front ridge at the slot: the 266 cheek datum the gun-face receipt's cheek rounds were proven on. */
const CHEEK_RIDGE_Y = 0.40;
const CHEEK_TIP_Z = 2.42;

const deckY = (z: number): number => lineAt(DECK, z);
const bellyY = (z: number): number => lineAt(BELLY, z);
const glacisTilt = (z: number): number => Math.atan2(deckY(z - 0.05) - deckY(z + 0.05), 0.10);
const mirror3 = (s: Side, [x, y, z]: P3): P3 => [s * x, y, z];
/** Every deck and belly break between z0 and z1, so a loft draws both lines exactly. */
function stations(z0: number, z1: number, extra: readonly number[] = []): number[] {
  const zs = new Set<number>([z0, z1, ...extra.filter((z) => z > z0 && z < z1)]);
  for (const [z] of [...DECK, ...BELLY]) if (z > z0 && z < z1) zs.add(z);
  return [...zs].sort((a, b) => a - b);
}
const sideRing = (s: Side, ring: SectionPoint[]): SectionPoint[] => (s > 0 ? ring : mirrorRing(ring));

// ---------------------------------------------------------------------------------------------------------------- hull
/** The welded tub between the tracks (belly, lower glacis, nose) and the two sponsons over the tracks. */
function addHullShell(P: TankBuilderPort): void {
  P.add('hull', sectionSolid(stations(HULL_REAR, HULL_NOSE).map((z): SolidSection => {
    const roof = deckY(z), floor = Math.min(bellyY(z), roof - 0.10);
    const bevel = Math.min(0.06, (roof - floor) * 0.3);
    return { z, ring: [[-TUB_HW + bevel, floor], [TUB_HW - bevel, floor], [TUB_HW, floor + bevel], [TUB_HW, roof],
      [-TUB_HW, roof], [-TUB_HW, floor + bevel]] };
  })));
  for (const s of [-1, 1] as const) {
    // the sponson from the tub wall out over the track, flat-floored, its top the deck line with a rolled outer edge;
    // it ends under the front mudguard where the glacis falls to the idler
    P.add('hull', sectionSolid(stations(HULL_REAR, 3.10).map((z): SolidSection => {
      const top = deckY(z);
      return { z, ring: sideRing(s, [[TUB_HW - 0.02, SPONSON_FLOOR], [SPONSON_HW, SPONSON_FLOOR],
        [SPONSON_HW, top - 0.03], [SPONSON_HW - 0.03, top], [TUB_HW - 0.02, top]]) };
    })));
  }
}

/** Front mudguards over the idlers: a bent sheet following the glacis, a turned-down lip ahead of the track and a
 * rubber flap under it; width rods on their outer corners. */
function addFrontMudguards(P: TankBuilderPort): void {
  for (const s of [-1, 1] as const) {
    P.add('hull', sectionSolid([3.00, 3.30, 3.70, 3.845].map((z): SolidSection => {
      const top = Math.max(deckY(Math.min(z, HULL_NOSE)), 1.235) + 0.012;
      return { z, ring: sideRing(s, [[0.95, top - 0.045], [1.745, top - 0.045], [1.745, top], [0.95, top]]) };
    })));
    // the lip: 45 mm plate standing ahead of the idler wrap's front (3.77), from the sheet down to 1.02
    P.add('hull', orientedSlab(
      mirror3(s, [0.97, 1.02, 3.800]), mirror3(s, [1.745, 1.02, 3.800]), mirror3(s, [1.745, 1.02, 3.845]), mirror3(s, [0.97, 1.02, 3.845]),
      mirror3(s, [0.97, 1.252, 3.800]), mirror3(s, [1.745, 1.252, 3.800]), mirror3(s, [1.745, 1.245, 3.845]), mirror3(s, [0.97, 1.245, 3.845])));
    P.hangMudguard(`kf51evo-front-flap-${s < 0 ? 'right' : 'left'}`, 'hullRubber', KIT.box(0.62, 0.20, 0.022),
      s * 1.36, 0.93, 3.834);
    P.snapGroup(`kf51evo-width-rod-${s}`, () => {
      P.add('hullDetail', KIT.cylY(0.008, 0.008, 0.30, 6), s * 1.70, 1.42, 3.52);
      P.add('hullDetail', KIT.sph(0.017, 8), s * 1.70, 1.575, 3.52);
    }, { reachM: 0.06 });
  }
}

/** The bow: headlight pods on the nose plate, tow eyes, the driver's hatch and periscopes on the glacis. */
function addBowFittings(P: TankBuilderPort): void {
  const { box, cylY, cylZ, torus, headlight } = KIT;
  const lowerTilt = Math.atan2(0.98 - 0.47, 3.72 - 3.05);           // the lower glacis' rake
  for (const s of [-1, 1] as const) {
    // armoured headlight pod at the nose plate's top, two lamps in its face, a guard bar over them
    const px = s * 0.80, pz = 3.74, py = 1.035;
    P.add('hull', box(0.30, 0.14, 0.16), px, py, pz - 0.03);
    for (const dx of [-0.07, 0.07]) headlight(P, px + dx, py, pz + 0.045, 0, 0.042);
    P.add('hullDetail', box(0.34, 0.018, 0.05), px, py + 0.085, pz + 0.05);
    for (const dx of [-0.16, 0.16]) P.add('hullDetail', box(0.018, 0.12, 0.10), px + dx, py + 0.02, pz + 0.02);
    // bow tow eye on the lower glacis
    const ez = 3.40, ey = bellyY(ez);
    P.add('hullDetail', box(0.12, 0.05, 0.14), s * 0.62, ey - 0.005, ez, -lowerTilt, 0, 0);
    P.add('hullDark', torus(0.055, 0.018, 12), s * 0.62, ey - 0.03, ez + 0.04, -lowerTilt, 0, 0);
  }
  // the Leopard 2 bow's spare track blocks between the headlight pods, lying on the lower glacis
  for (const x of [-0.42, -0.21, 0, 0.21, 0.42]) {
    const z = 3.55, y = bellyY(z);
    P.add('hullDark', box(0.17, 0.05, 0.24), x, y + 0.015, z, -lowerTilt, 0, 0);
    P.add('hullDetail', box(0.19, 0.03, 0.05), x, y + 0.032, z - 0.06, -lowerTilt, 0, 0);
  }
  // the driver (front right, -x) under the turret's right cheek: hatch on the roof's front, three periscopes ahead
  const hz = 1.98, hy = deckY(hz), tilt = glacisTilt(hz);
  P.add('hullDetail', cylY(0.30, 0.31, 0.03, P.q ? 24 : 14), -0.55, hy + 0.008, hz, tilt, 0, 0);
  P.addHatch('hullHatch', cylY(0.25, 0.25, 0.028, P.q ? 20 : 12), -0.55, hy + 0.034, hz, tilt, 0, 0);
  P.add('hullDark', box(0.22, 0.016, 0.03), -0.55, hy + 0.052, hz - 0.10, tilt, 0, 0);
  for (const dx of [-0.16, 0, 0.16]) {
    const z = 2.30, y = deckY(z);
    P.add('hullDetail', box(0.14, 0.07, 0.10), -0.55 + dx, y + 0.03, z, glacisTilt(z), 0, 0);
    P.add('hullGlass', box(0.11, 0.028, 0.012), -0.55 + dx, y + 0.045, z + 0.051, glacisTilt(z), 0, 0);
  }
  // a bolted access plate and the horn on the glacis' left
  P.add('hullDetail', box(0.46, 0.012, 0.36), 0.62, deckY(2.55) + 0.004, 2.55, glacisTilt(2.55), 0, 0);
  P.add('hullDark', cylZ(0.035, 0.05, 10), 1.20, deckY(2.85) + 0.035, 2.85, glacisTilt(2.85), 0, 0);
}

/** The engine deck (fan covers, radiator louvres, access plates) and the stern (exhaust louvres, lights, hooks, flaps). */
function addEngineDeckAndStern(P: TankBuilderPort): void {
  const { box, cylY, torus } = KIT;
  const seg = P.q ? 32 : 18;
  for (const s of [-1, 1] as const) {
    // the two round cooling-fan covers with their rims, three spokes and hubs
    const fx = s * 0.62, fz = -3.18, fy = deckY(fz);
    P.add('hullDark', cylY(0.40, 0.40, 0.008, seg), fx, fy + 0.002, fz);
    P.add('hullDetail', torus(0.40, 0.02, seg), fx, fy + 0.010, fz);
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) P.add('hullDetail', box(0.78, 0.014, 0.02), fx, fy + 0.010, fz, 0, a, 0);
    P.add('hullDetail', cylY(0.07, 0.07, 0.025, 12), fx, fy + 0.014, fz);
    // radiator louvres outboard of the fans
    const rx = s * 1.36, rz = -3.10, ry = deckY(rz);
    P.add('hullDark', box(0.40, 0.006, 0.80), rx, ry + 0.003, rz);
    for (let k = 0; k < 8; k++) P.add('hullDetail', box(0.40, 0.012, 0.035), rx, ry + 0.012, rz - 0.35 + k * 0.10, 0.35, 0, 0);
    // a bolted access plate on the deck ahead of the engine (outside the bustle's sweep)
    P.add('hullDetail', box(0.62, 0.010, 0.44), s * 0.70, deckY(-2.86) + 0.005, -2.86);
    // the stern's corners: tail-light cluster, tow hook, the rear flap off the sponson's end
    P.add('hullDetail', box(0.20, 0.13, 0.05), s * 1.40, 1.36, HULL_REAR - 0.025);
    for (const dx of [-0.05, 0.05]) P.add('hullGlass', box(0.065, 0.05, 0.012), s * 1.40 + dx, 1.36, HULL_REAR - 0.055);
    P.add('hullDetail', box(0.13, 0.11, 0.10), s * 0.78, 1.06, HULL_REAR - 0.05);
    P.add('hullDark', torus(0.055, 0.018, 10), s * 0.78, 1.00, HULL_REAR - 0.11, Math.PI / 2, 0, 0);   // the eye stands in the hook
    P.hangMudguard(`kf51evo-rear-flap-${s < 0 ? 'right' : 'left'}`, 'hullRubber', KIT.box(0.54, 0.40, 0.025),
      s * 1.26, 1.08, HULL_REAR - 0.045);
    KIT.liftEye(P, 'hullDetail', s * 1.52, deckY(-3.55) + 0.012, -3.55);
    KIT.liftEye(P, 'hullDetail', s * 1.52, deckY(2.45) + 0.012, 2.45);
  }
  P.add('hullDetail', box(0.30, 0.012, 0.86), 0, deckY(-3.18) + 0.006, -3.18);
  // the exhaust: one louvred band across the upper rear plate under the deck's lip
  P.add('hullDark', box(3.10, 0.30, 0.006), 0, 1.58, HULL_REAR - 0.003);
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(3.10, 0.03, 0.014), 0, 1.465 + k * 0.046, HULL_REAR - 0.009, -0.5, 0, 0);
  for (const y of [1.42, 1.74]) P.add('hullDetail', box(3.14, 0.03, 0.03), 0, y, HULL_REAR - 0.015);
  P.add('hullDetail', box(0.30, 0.10, 0.05), 0, 1.30, HULL_REAR - 0.025);     // convoy light
  for (const s of [-1, 1] as const) {
    KIT.towCable(P, [[s * 0.78, 1.00, HULL_REAR - 0.06], [s * 0.30, 1.10, HULL_REAR - 0.035], [-s * 0.50, 1.20, HULL_REAR - 0.035],
      [-s * 1.10, 1.24, HULL_REAR - 0.04]], 0.017);
  }
}

/** The KF51 running gear: the Leopard 2 stations at the Panther's own track, and its forged road-wheel faces (the
 * kf51-forged-face construction nationWheelSets.ts names), every layer bound to the suspension. */
function addRunningGear(P: TankBuilderPort): void {
  leoGear(P, {
    xc: TRACK_XC, trackW: TRACK_W, wheelR: GEAR.wheelR, wheelY: GEAR.wheelY,
    span: [GEAR.wheelZs[6], GEAR.wheelZs[0]], wheelZs: GEAR.wheelZs,
    sprocket: GEAR.sprocket, idler: GEAR.idler,
    rollers: GEAR.rollerZs.map((z) => ({ z, y: GEAR.rollerY, r: GEAR.rollerR })),
    topY: GEAR.topY, botY: GEAR.botY, dishR: 0.78,
  });
  const gear = P.gear;
  if (!gear) throw new Error('kf51_evo: running gear must exist before its wheel faces');
  const { box, cylX, torus, xform } = KIT;
  const outset = 0.088;
  gear.addRoadWheelLayer(torus(0.292, 0.018, P.q ? 30 : 20).rotateZ(Math.PI / 2), P.mats.wheels,
    { outset, name: 'gearRoadWheelForgedOuterRims', appearanceRole: 'wheelDish' });
  gear.addRoadWheelLayer(torus(0.226, 0.014, P.q ? 26 : 18).rotateZ(Math.PI / 2), P.mats.dark,
    { outset: outset + 0.004, name: 'gearRoadWheelRecessRings', appearanceRole: 'wheelInset' });
  gear.addRoadWheelLayer(KIT.mergeAll(Array.from({ length: 8 }, (_, i) => {
    const a = i * Math.PI / 4;
    return xform(box(0.022, 0.052, 0.138), 0, Math.sin(a) * 0.205, Math.cos(a) * 0.205, -a);
  })), P.mats.wheels, { outset: outset + 0.008, name: 'gearRoadWheelForgedRibs', appearanceRole: 'wheelDish' });
  gear.addRoadWheelLayer(cylX(0.122, 0.040, P.q ? 22 : 16), P.mats.wheels,
    { outset: outset + 0.012, name: 'gearRoadWheelServiceHubs', appearanceRole: 'wheelDish' });
  gear.addRoadWheelLayer(cylX(0.068, 0.046, P.q ? 16 : 12), P.mats.dark,
    { outset: outset + 0.016, name: 'gearRoadWheelHubCaps', appearanceRole: 'wheelInset' });
  gear.addRoadWheelLayer(KIT.mergeAll(Array.from({ length: 10 }, (_, i) => {
    const a = i * Math.PI / 5 + 0.16;
    return xform(cylX(0.012, 0.034, P.q ? 8 : 6), 0, Math.sin(a) * 0.143, Math.cos(a) * 0.143);
  })), P.mats.dark, { outset: outset + 0.021, name: 'gearRoadWheelServiceBolts', appearanceRole: 'wheelInset' });
  // sprocket and idler drum faces: rim ring, hub, bolt collar (inside the wraps' moving chain)
  for (const s of [-1, 1] as const) {
    const { sprocket: sk, idler: id } = GEAR;
    P.add('hullRunningGearDark', torus(0.193, 0.019, 20), s * 1.492, sk.y, sk.z, 0, 0, Math.PI / 2);
    P.add('hullRunningGearDetail', torus(0.157, 0.015, 18), s * 1.497, sk.y, sk.z, 0, 0, Math.PI / 2);
    P.add('hullRunningGearDark', cylX(0.075, 0.034, 12), s * 1.503, sk.y, sk.z);
    P.add('hullRunningGearDark', torus(0.167, 0.018, 20), s * 1.472, id.y, id.z, 0, 0, Math.PI / 2);
    P.add('hullRunningGearDark', cylX(0.065, 0.032, 12), s * 1.483, id.y, id.z);
  }
  P.hullG.userData.kf51EvoRunningGearReceipt = Object.freeze({
    runningGear: 'leopard-2a6-x-stations', trackCentreXM: TRACK_XC, trackWidthM: TRACK_W,
    roadWheelsPerSide: GEAR.wheelZs.length, wheelConstruction: 'kf51-forged-face', forgedFaceLayers: 6,
    sprocket: 'rear', idler: 'front-raised',
  });
}

/** The StrikeShield flank: a continuous dark carrier on the sponson's side and six modules a side, each two bevelled
 * protection rows (the gameplay's two-row reactive jacket, kf51Specs.ts kf51_skirt_era_L/R), the leader raked up over the
 * idler; mounting bolts on each module's head. */
const SKIRT_STATIONS: ReadonlyArray<readonly [number, number]> = [
  [-3.12, -2.12], [-2.09, -1.09], [-1.06, -0.06], [-0.03, 0.97], [1.00, 2.00], [2.03, 2.98],
];
function addStrikeShieldFlank(P: TankBuilderPort): void {
  const inner = 1.705, chamfer = 0.028;
  const topAt = (z: number): number => deckY(z) - 0.025;
  for (const s of [-1, 1] as const) {
    P.add('hullDark', sectionSolid([-3.12, -2.34, -1.50, 1.80, 2.05, 2.98].map((z): SolidSection => ({
      z, ring: sideRing(s, [[SPONSON_HW - 0.01, SKIRT_HEM + 0.03], [inner + 0.004, SKIRT_HEM + 0.03],
        [inner + 0.004, Math.min(topAt(z), 1.58)], [SPONSON_HW - 0.01, Math.min(topAt(z), 1.58)]]),
    }))));
    P.visualEraCluster('kf51-evo-strikeshield-flank', 'hull', () => {
      SKIRT_STATIONS.forEach(([z0, z1], index) => {
        const leader = index === SKIRT_STATIONS.length - 1;
        const tTop0 = topAt(z0), tTop1 = topAt(z1);
        // the leader's foot rises toward the idler and its nose rakes back at the foot
        const hem0 = SKIRT_HEM, hem1 = leader ? 1.08 : SKIRT_HEM;
        const mid0 = (hem0 + tTop0) / 2, mid1 = (hem1 + tTop1) / 2;
        const footZ1 = leader ? z1 - 0.20 : z1;
        const row = (b0: number, b1: number, t0: number, t1: number, zf1: number): void => {
          P.add('hull', convexSlab(
            mirror3(s, [inner, b0, z0]), mirror3(s, [inner, b1, zf1]), mirror3(s, [inner, t1, z1]), mirror3(s, [inner, t0, z0]),
            mirror3(s, [SKIRT_OUT, b0 + chamfer, z0 + chamfer]), mirror3(s, [SKIRT_OUT, b1 + chamfer, zf1 - chamfer]),
            mirror3(s, [SKIRT_OUT, t1 - chamfer * 1.4, z1 - chamfer]), mirror3(s, [SKIRT_OUT, t0 - chamfer * 1.4, z0 + chamfer])));
        };
        row(hem0, hem1, mid0 - 0.016, mid1 - 0.016, footZ1);                    // lower row
        row(mid0 + 0.016, mid1 + 0.016, tTop0, tTop1, leader ? z1 - 0.10 : z1);   // upper row
      });
    });
    // two mounting-bolt heads on each module's upper row
    for (const [z0, z1] of SKIRT_STATIONS) {
      for (const z of [z0 + 0.12, z1 - 0.16]) {
        P.add('hullDetail', KIT.cylX(0.022, 0.014, 8), s * (SKIRT_OUT + 0.001), topAt(z) - 0.09, z);   // heads to 1.808 (the 1.809 guard)
      }
    }
  }
  P.hullG.userData.kf51EvoFlankReceipt = Object.freeze({
    profile: 'kf51-evo-strikeshield-flank-r1', modulesPerSide: SKIRT_STATIONS.length, protectionRows: 2,
    carrierInnerFaceX: SPONSON_HW - 0.01, moduleInnerFaceX: inner, moduleOuterFaceX: SKIRT_OUT, hemY: SKIRT_HEM,
    zSpan: Object.freeze([SKIRT_STATIONS[0][0], SKIRT_STATIONS[SKIRT_STATIONS.length - 1][1]]),
    visualEraSector: 'kf51-evo-strikeshield-flank',
  });
}

// -------------------------------------------------------------------------------------------------------------- turret
const bodyRing = (hb: number, hc: number, hr: number, yb: number): SectionPoint[] => [
  [-hb, yb], [hb, yb], [hc, T_CREASE], [hr, T_ROOF], [-hr, T_ROOF], [-hc, T_CREASE],
];
const bustleRing = (hb: number, yb: number, hs: number, ylo: number, yhi: number, hr: number, yr: number): SectionPoint[] => [
  [-hb, yb], [hb, yb], [hs, ylo], [hs, yhi], [hr, yr], [-hr, yr], [-hs, yhi], [-hs, ylo],
];

/** One arrowhead cheek (x >= SLOT_HW for s = 1): the turret's six-sided section at the slot face carried forward to a
 * swept ridge. Its upper face is one plane from the roof edge to the ridge (the ridge rises outward as it sweeps back),
 * its inner wall the gun slot's side. */
function cheekPoints(s: Side): P3[] {
  const upperSlope = (CHEEK_RIDGE_Y - T_ROOF) / (CHEEK_TIP_Z - SLOT_FACE_Z);
  const rOut: P3 = [1.50, T_ROOF + upperSlope * (2.00 - SLOT_FACE_Z), 2.00];
  const pts: P3[] = [
    [SLOT_HW, T_ROOF, SLOT_FACE_Z], [1.24, T_ROOF, SLOT_FACE_Z], [1.50, T_CREASE, SLOT_FACE_Z], [1.30, T_FLOOR, SLOT_FACE_Z],
    [SLOT_HW, T_FLOOR, SLOT_FACE_Z], [SLOT_HW, CHEEK_RIDGE_Y, CHEEK_TIP_Z], rOut,
  ];
  // an interior point completes convexSlab's eight corners without changing the hull
  const c = [0, 1, 2].map((k) => pts.reduce((sum, p) => sum + p[k], 0) / pts.length) as unknown as P3;
  return [...pts, c].map((p) => mirror3(s, p));
}

function addTurretShell(P: TankBuilderPort): void {
  // the main body from the slot face back over the ring, its floor rising behind the ring toward the bustle
  P.add('turret', sectionSolid([
    { z: -2.12, ring: bodyRing(1.24, 1.46, 1.20, 0.05) },
    { z: -1.30, ring: bodyRing(1.30, 1.50, 1.24, T_FLOOR) },
    { z: SLOT_FACE_Z, ring: bodyRing(1.30, 1.50, 1.24, T_FLOOR) },
  ]));
  // the squared bustle: vertical sides between chamfers, its floor clear of the engine deck, a chamfered rear
  P.add('turret', sectionSolid([
    { z: -3.32, ring: bustleRing(1.08, 0.18, 1.30, 0.30, 0.64, 1.10, 0.785) },
    { z: -3.20, ring: bustleRing(1.14, 0.14, 1.40, 0.28, 0.62, 1.18, T_ROOF) },
    { z: -2.05, ring: bustleRing(1.24, 0.05, 1.44, 0.26, 0.60, 1.21, T_ROOF) },
  ]));
  for (const s of [-1, 1] as const) {
    const [a, b, c, d, e, f, g, h] = cheekPoints(s);
    P.add('turret', convexSlab(a, b, c, d, e, f, g, h));
    // the slot's side walls in shadow: a dark liner 4 mm off each cheek's inner wall
    const lx0 = s * (SLOT_HW - 0.008), lx1 = s * (SLOT_HW - 0.004);
    P.add('turretDark', orientedSlab(
      [lx0, 0.0, SLOT_FACE_Z + 0.004], [lx1, 0.0, SLOT_FACE_Z + 0.004], [lx1, 0.27, 1.88], [lx0, 0.27, 1.88],
      [lx0, 0.78, SLOT_FACE_Z + 0.004], [lx1, 0.78, SLOT_FACE_Z + 0.004], [lx1, 0.56, 1.88], [lx0, 0.56, 1.88]));
    // the bustle's hinged stowage boxes: a vertical lid proud of the side crease, bevelled top and foot; the foot runs
    // into the turret's lower faces so no crevice opens under the box
    // (its rear foot sits on the bustle's lower chamfer: it turns over the engine deck)
    P.add('turret', convexSlab(
      [s * 1.25, 0.05, -1.50], [s * 1.20, 0.172, -3.16], [s * 1.27, 0.74, -3.16], [s * 1.27, 0.74, -1.50],
      [s * 1.53, 0.18, -1.57], [s * 1.53, 0.20, -3.10], [s * 1.53, 0.68, -3.10], [s * 1.53, 0.68, -1.57]));
    // the lid: a bevelled panel 15 mm proud, its hinge rail forward, handle and two latches aft
    P.add('turret', convexSlab(
      [s * 1.52, 0.23, -1.66], [s * 1.52, 0.24, -3.00], [s * 1.52, 0.63, -3.00], [s * 1.52, 0.63, -1.66],
      [s * 1.545, 0.25, -1.68], [s * 1.545, 0.26, -2.98], [s * 1.545, 0.61, -2.98], [s * 1.545, 0.61, -1.68]));
    P.add('turretDetail', KIT.box(0.035, 0.38, 0.045), s * 1.55, 0.43, -1.62);                   // hinge rail
    for (const y of [0.30, 0.56]) P.add('turretDetail', KIT.box(0.045, 0.06, 0.03), s * 1.553, y, -1.62);
    P.add('turretDetail', KIT.box(0.03, 0.03, 0.24), s * 1.565, 0.54, -2.50);                    // lid handle
    for (const z of [-2.40, -2.60]) P.add('turretDetail', KIT.box(0.03, 0.05, 0.03), s * 1.555, 0.525, z);
    for (const y of [0.32, 0.54]) P.add('turretDetail', KIT.box(0.025, 0.06, 0.06), s * 1.555, y, -2.94); // latches
  }
  // the overhanging rear box on the bustle's back
  P.add('turret', convexSlab(
    [-0.90, 0.24, -3.24], [0.90, 0.24, -3.24], [0.82, 0.30, -3.54], [-0.82, 0.30, -3.54],
    [-0.90, 0.70, -3.24], [0.90, 0.70, -3.24], [0.82, 0.63, -3.54], [-0.82, 0.63, -3.54]));
  for (const x of [-0.45, 0.45]) P.add('turretDetail', KIT.box(0.24, 0.03, 0.03), x, 0.47, -3.555);
  // the gun slot's vertical face in shadow (the mantlet plate's face: x +-0.43, z 1.10)
  P.add('turretDark', orientedSlab(
    [-0.424, -0.02, SLOT_FACE_Z + 0.004], [0.424, -0.02, SLOT_FACE_Z + 0.004], [0.424, -0.02, SLOT_FACE_Z + 0.001], [-0.424, -0.02, SLOT_FACE_Z + 0.001],
    [-0.424, 0.80, SLOT_FACE_Z + 0.004], [0.424, 0.80, SLOT_FACE_Z + 0.004], [0.424, 0.80, SLOT_FACE_Z + 0.001], [-0.424, 0.80, SLOT_FACE_Z + 0.001]));
  // the roof's panel seams and the cheeks' roots (12 mm proud strips)
  for (const [z, w] of [[0.62, 1.70], [-0.95, 2.10], [-2.20, 2.30]] as const) {
    P.add('turretDark', KIT.box(w, 0.006, 0.022), 0, T_ROOF + 0.002, z);
  }
  P.turretG.userData.kf51EvoTurretReceipt = Object.freeze({
    profile: 'kf51-evo-faceted-turret-r1',
    rigLocal: Object.freeze([0, 1.71, 0.63]),
    roofY: T_ROOF, creaseY: T_CREASE, floorY: T_FLOOR,
    slotHalfWidthM: SLOT_HW, slotFaceZ: SLOT_FACE_Z, cheekRidgeInner: Object.freeze([SLOT_HW, CHEEK_RIDGE_Y, CHEEK_TIP_Z]),
    cheekRidgeOuterZ: 2.00, bustleRearZ: -3.54, bustleFloorY: 0.14,
  });
}

/** The right cheek's gunner sight, the SEOSS panoramic sight behind it, twin-lens sensor heads, hatches, lifting eyes. */
function addTurretSights(P: TankBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  const upperSlope = (CHEEK_RIDGE_Y - T_ROOF) / (CHEEK_TIP_Z - SLOT_FACE_Z);
  const cheekTop = (z: number): number => T_ROOF + upperSlope * Math.max(0, z - SLOT_FACE_Z);
  // gunner's primary sight on the right cheek (-x): an armoured box, its base on the cheek face, a large forward window
  const gx0 = -0.56, gx1 = -1.16, gz0 = 1.00, gz1 = 1.52;
  P.add('turret', convexSlab(
    [gx0, T_ROOF - 0.01, gz0], [gx1, T_ROOF - 0.01, gz0], [gx1, cheekTop(gz1) - 0.01, gz1], [gx0, cheekTop(gz1) - 0.01, gz1],
    [gx0, 1.00, gz0], [gx1, 1.00, gz0], [gx1, 0.955, gz1], [gx0, 0.955, gz1]));
  P.add('turretDark', box(0.42, 0.20, 0.02), (gx0 + gx1) / 2, 0.835, gz1 + 0.004);
  P.add('turretGlass', box(0.34, 0.14, 0.02), (gx0 + gx1) / 2, 0.835, gz1 + 0.012);
  P.add('turretDetail', box(0.50, 0.022, 0.07), (gx0 + gx1) / 2, 0.948, gz1 + 0.02);           // window visor
  // the SEOSS: tall armoured head with a chamfered brow, its window band, a small sensor mast on top
  const sx = -0.58, sz = 0.42;
  P.add('turret', convexSlab(
    [sx - 0.17, T_ROOF - 0.01, sz + 0.17], [sx + 0.17, T_ROOF - 0.01, sz + 0.17], [sx + 0.17, T_ROOF - 0.01, sz - 0.17], [sx - 0.17, T_ROOF - 0.01, sz - 0.17],
    [sx - 0.15, 1.24, sz + 0.12], [sx + 0.15, 1.24, sz + 0.12], [sx + 0.15, 1.30, sz - 0.15], [sx - 0.15, 1.30, sz - 0.15]));
  P.add('turretDark', box(0.26, 0.09, 0.02), sx, 1.10, sz + 0.163);
  P.add('turretGlass', box(0.20, 0.06, 0.02), sx, 1.10, sz + 0.171);
  for (const s of [-1, 1] as const) P.add('turretDark', box(0.02, 0.07, 0.20), sx + s * 0.162, 1.10, sz);
  P.add('turretDark', antennaPart(cylY(0.016, 0.02, 0.12, 8)), sx, 1.35, sz - 0.02);
  P.add('turretDark', cylY(0.045, 0.06, 0.035, 14), sx, 1.425, sz - 0.02);
  // twin-lens situational-awareness heads on the roof edges: forward-left, both sides, both rear corners
  const head = (x: number, z: number, yaw: number): void => {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const at = (u: number, v: number, w: number): P3 => [x + u * c + w * sn, v, z - u * sn + w * c];
    P.add('turret', convexSlab(at(-0.12, T_ROOF - 0.01, 0.06), at(0.12, T_ROOF - 0.01, 0.06), at(0.12, T_ROOF - 0.01, -0.08), at(-0.12, T_ROOF - 0.01, -0.08),
      at(-0.10, T_ROOF + 0.11, 0.03), at(0.10, T_ROOF + 0.11, 0.03), at(0.10, T_ROOF + 0.11, -0.07), at(-0.10, T_ROOF + 0.11, -0.07)));
    for (const u of [-0.045, 0.045]) {
      const [lx, , lz] = at(u, 0, 0.055);
      P.add('turretDark', cylZ(0.030, 0.012, 14), lx, T_ROOF + 0.06, lz, 0, yaw, 0);
      P.add('turretGlass', cylZ(0.021, 0.012, 14), lx + 0.004 * sn, T_ROOF + 0.06, lz + 0.004 * c, 0, yaw, 0);
    }
  };
  head(0.70, 1.00, 0);
  head(1.13, -0.55, Math.PI / 2);
  head(-1.13, -0.70, -Math.PI / 2);
  head(1.02, -3.12, Math.PI * 0.82);
  head(-1.02, -3.12, -Math.PI * 0.82);
  // the crew hatches (commander right behind the SEOSS, the fourth station left) and a periscope ahead of the left one
  for (const [x, z] of [[-0.60, -0.32], [0.60, -0.42]] as const) {
    P.add('turretDetail', cylY(0.33, 0.33, 0.026, P.q ? 24 : 14), x, T_ROOF + 0.010, z);
    P.addHatch('turretHatch', cylY(0.28, 0.28, 0.03, P.q ? 22 : 12), x, T_ROOF + 0.034, z);
    P.add('turretDark', box(0.30, 0.018, 0.04), x, T_ROOF + 0.055, z + 0.05);
  }
  KIT.periscope(P, 'turretDetail', 0.60, T_ROOF + 0.03, 0.05);
  for (const s of [-1, 1] as const) {
    KIT.liftEye(P, 'turretDetail', s * 1.02, T_ROOF + 0.012, 0.70, s * 0.3);
    KIT.liftEye(P, 'turretDetail', s * 0.96, T_ROOF + 0.012, -2.78, s * 0.3);
  }
}

/** StrikeShield countermeasure launchers along both roof edges (the game's eight smoke tubes): a low rail, four canted
 * tubes a side firing out, up and forward. */
function addCountermeasureLaunchers(P: TankBuilderPort): void {
  for (const s of [-1, 1] as const) {
    P.add('turretDark', KIT.box(0.12, 0.045, 0.80), s * 1.14, T_ROOF + 0.018, -1.25);
    for (let k = 0; k < 4; k++) {
      const z = -0.97 - k * 0.185;
      P.add('turretDetail', markSmokeTube(KIT.cylZ(0.036, 0.16, 10)), s * 1.15, T_ROOF + 0.075, z, -0.55, s * 0.95, 0);
    }
  }
}

/** The remote weapon station (the spec's roof gun), whips and the thick mast at the bustle. */
function addRoofEquipment(P: TankBuilderPort): void {
  const rws = addLeopardOpenYokeAuxRws(P, {
    x: 0.42, y: T_ROOF, z: -1.72,
    variant: 'kf51-panther', ammoSide: 1, sensorSide: -1, yaw: 0.025,
    weaponRole: 'roof-primary',
  });
  P.turretG.userData.openYokeRwsReceipt = rws;
  for (const s of [-1, 1] as const) {
    P.add('turretDetail', KIT.cylY(0.032, 0.042, 0.06, 10), s * 0.98, T_ROOF + 0.025, -3.00);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: s < 0 ? 0.92 : 0.86, r: 0.011, rake: s * 0.03, seed: 5101 + (s > 0 ? 1 : 0) });
    whip.position.set(s * 0.98, T_ROOF + 0.055, -3.00);
    P.turretG.add(whip);
  }
  P.add('turretDetail', KIT.cylY(0.04, 0.05, 0.05, 10), -0.30, T_ROOF + 0.02, -2.40);
  P.add('turretDetail', antennaPart(KIT.cylY(0.014, 0.024, 0.58, 8)), -0.30, T_ROOF + 0.33, -2.40);
  P.decal('turret', 'crossgrey', null, 0.28, [1.546, 0.43, -2.05], Math.PI / 2);
  P.decal('turret', 'crossgrey', null, 0.28, [-1.546, 0.43, -2.05], -Math.PI / 2);
}

// ----------------------------------------------------------------------------------------------------------------- gun
/** The EVO shroud's section (gun-local x, y): six-sided, pointed top and foot truncated to narrow flats. */
const shroudRing = (k: number): SectionPoint[] => [
  [-0.07 * k, -0.335 * k], [0.07 * k, -0.335 * k], [0.31 * k, -0.155 * k], [0.31 * k, 0.225 * k],
  [0.07 * k, 0.405 * k], [-0.07 * k, 0.405 * k], [-0.31 * k, 0.225 * k], [-0.31 * k, -0.155 * k],
];
/** The shroud starts clear of the slot face at full elevation; its shallow foot keeps the full 9 degrees over the sides. */
const SHROUD_Z0 = 0.40;
const SHROUD_Z1 = 2.10;
const SHROUD_TAPER = 0.88;
const GUN_LEN = 5.475;
/** The Rh-130's thermal sleeve and stepped muzzle section radii. */
const RH130_SLEEVE_R = 0.120;
const RH130_MUZZLE_R = 0.136;

function addGun(P: TankBuilderPort): void {
  const { box, cylX, cylZ } = KIT;
  const seg = P.q ? 28 : 14;
  P.gunG.position.set(0, 0.38, 0.90);
  // the trunnion roll: rotation-invariant about the pivot, it fills the slot behind the shroud at every elevation
  P.addGunExtraDark(cylX(0.27, 0.80, P.q ? 20 : 12), 0, 0, 0);
  P.addGunExtra(sectionSolid([
    { z: SHROUD_Z0, ring: shroudRing(1) },
    { z: SHROUD_Z1, ring: shroudRing(SHROUD_TAPER) },
  ]));
  // the open front frame: a dark inset hexagon 5 mm proud of the shroud's front cap
  P.addGunExtraDark(sectionSolid([
    { z: SHROUD_Z1 - 0.01, ring: shroudRing(SHROUD_TAPER * 0.80) },
    { z: SHROUD_Z1 + 0.005, ring: shroudRing(SHROUD_TAPER * 0.80) },
  ]));
  // three vent slots on each upper facet, laid in the facet's plane 3 mm proud
  const facetAngle = Math.atan2(0.18, 0.24);
  for (const s of [-1, 1] as const) {
    for (const z of [0.92, 1.32, 1.72]) {
      const k = 1 - (1 - SHROUD_TAPER) * (z - SHROUD_Z0) / (SHROUD_Z1 - SHROUD_Z0);
      const nx = 0.6 * s, ny = 0.8;
      P.addGunExtraDark(KIT.xform(box(0.045, 0.006, 0.26), 0, 0, 0, 0, 0, -s * facetAngle),
        s * 0.19 * k + nx * 0.003, 0.315 * k + ny * 0.003, z);
    }
  }
  // coaxial machine gun to the right of the gun, rooted in the trunnion roll
  P.addGunExtraDark(cylZ(0.022, 0.30, 8), -0.36, 0.05, 0.40);
  // Rh-130 L/52 (the EVO turret's planned 130 mm retrofit; the game keeps the 130 mm): the tube to its muzzle 5.475 m
  // past the pivot, its thermal sleeve with clamp bands, the stepped muzzle section and the box MRS on top of it
  KIT.buildGun(P, { len: GUN_LEN, r: 0.092, sleeve: false, collar: false, baseR: 0.15 });
  P.add('gun', cylZ(RH130_SLEEVE_R, 2.45, seg), 0, 0, 3.275);
  for (const z of [2.13, 3.05, 3.95]) P.add('gunDark', cylZ(RH130_SLEEVE_R + 0.006, 0.045, seg), 0, 0, z);
  P.add('gun', cylZ(RH130_MUZZLE_R, 0.08, seg, RH130_SLEEVE_R), 0, 0, 4.54);
  P.add('gun', cylZ(RH130_MUZZLE_R, GUN_LEN - 4.58, seg), 0, 0, (4.58 + GUN_LEN) / 2);
  P.add('gunDark', cylZ(RH130_MUZZLE_R + 0.004, 0.035, seg), 0, 0, 4.62);
  P.add('gun', convexSlab(
    [-0.10, 0.118, 5.36], [0.10, 0.118, 5.36], [0.10, 0.118, 5.02], [-0.10, 0.118, 5.02],
    [-0.09, 0.28, 5.30], [0.09, 0.28, 5.30], [0.09, 0.30, 5.06], [-0.09, 0.30, 5.06]));
  P.add('gunDark', box(0.12, 0.07, 0.012), 0, 0.22, 5.335);                                  // MRS mirror window
  P.gunG.userData.kf51EvoGunReceipt = Object.freeze({
    profile: 'kf51-evo-rh130-shroud-r1',
    gun: 'Rh-130 L/52 (the EVO turret\'s planned 130 mm retrofit)',
    gunPivotLocal: Object.freeze([0, 0.38, 0.90]),
    barrelLengthM: GUN_LEN,
    shroud: Object.freeze({ sides: 6, z0: SHROUD_Z0, z1: SHROUD_Z1, rearWidthM: 0.62, rearHeightM: 0.74, footBelowBoreM: 0.335,
      ventSlotsPerSide: 3, openFrontFrame: true, gunOwned: true }),
    trunnionRollRadiusM: 0.27,
    sleeveRadiusM: RH130_SLEEVE_R,
    muzzleSectionRadiusM: RH130_MUZZLE_R,
    mrs: 'box-on-muzzle-section',
  });
}

// ------------------------------------------------------------------------------------------------------------- builder
function* buildKF51EvoSteps(P: TankBuilderPort): TankProfileBuild {
  addHullShell(P);
  addFrontMudguards(P);
  yield 'kf51EvoHull';
  addBowFittings(P);
  addEngineDeckAndStern(P);
  yield 'kf51EvoHullFittings';
  addRunningGear(P);
  yield 'kf51EvoRunningGear';
  addStrikeShieldFlank(P);
  yield 'kf51EvoFlank';
  P.turretG.position.set(0, 1.71, 0.63);
  addTurretShell(P);
  yield 'kf51EvoTurretShell';
  addTurretSights(P);
  addCountermeasureLaunchers(P);
  addRoofEquipment(P);
  yield 'kf51EvoTurretEquipment';
  addGun(P);
  P.topY = 1.40;
}

export function buildKF51Evo(...args: Parameters<typeof buildKF51EvoSteps>): void {
  drainTankBuild(buildKF51EvoSteps(...args));
}
withBuildSteps(buildKF51Evo, buildKF51EvoSteps);
