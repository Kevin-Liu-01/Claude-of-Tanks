// The ZTZ-85-III — release 263 (owner 2026-10-28, after the 262 renders: "yeah going to need a totally new ztz 85
// III"). A ground-up rebuild from the published Type 85 record (docs/references/tanks/ztz85_iii.md §263): the Type 80
// hull lengthened for the Type 85 (6.325 m, 3.372 m over the skirts), its beak nose, six dual rubber-tyred road wheels
// with the wider gaps forward, three return rollers under an open upper run (the 85-III prototype ran without skirts),
// the rear drive sprocket and the 85-III's raised engine deck; the compact welded hexagonal turret of the Type 85 series
// (the "pig snout" mantlet between two swept front faces under a long shallow front slope, railed side and rear
// baskets, smoke dischargers on the shoulders, the commander's cupola with its
// 12.7 mm gun on the right, the gunner's sight on the left); the 125 mm smoothbore with its mid-tube evacuator; and the
// 1995 package's explosive reactive armour on the upper glacis and the turret's front faces.
//
// Sides follow the vehicle (this world's +Z hull has its LEFT at +X): the driver, the gunner, the gunner's sight and the
// exhaust at +X; the commander, his cupola, the 12.7 mm gun, the searchlight, the wind sensor and the coaxial MG at -X.
// Every triangle is first-party procedural geometry. Authorship: Kevin B. Liu (NOTICE.md).

import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { KIT, FITTINGS, muzzleBore } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { tubeGun } from './russia.ts';
import { mount } from './fittingMount.ts';
import { addChineseFuelDrum } from './chineseFuelDrum.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Vec3 = [number, number, number];

const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------
// Hull datums (hull frame: y 0 = ground, +Z forward, +X the vehicle's left)
// ---------------------------------------------------------------------------
/** The Type 80 family's belly (about 0.47 m of ground clearance). */
const BELLY_Y = 0.47;
/** The fighting compartment's roof and the turret-ring plane. */
const ROOF_Y = 1.45;
/** The 85-III's raised engine deck over its 1000 hp pack, rising behind the turret's sweep (radius 1.59 m about the
 * ring centre at z 0.05) so the turret clears it at every yaw. */
const ENGINE_DECK_Y = 1.53, DECK_RAMP_Z0 = -1.72, DECK_RAMP_Z1 = -1.84;
/** The published 6.325 m hull, centred. */
const NOSE_Z = 3.165, REAR_Z = -3.165;
/** The beak: a 30-degree upper glacis meets the lower plate 0.80 m off the ground. */
const NOSE_Y = 0.80;
const UPPER_GLACIS_TAN = Math.tan(30 * D2R), LOWER_GLACIS_TAN = 0.74;
const GLACIS_TOP_Z = NOSE_Z - (ROOF_Y - NOSE_Y) / UPPER_GLACIS_TAN;
const BELLY_FRONT_Z = NOSE_Z - (NOSE_Y - BELLY_Y) / LOWER_GLACIS_TAN;
/** Upper glacis height at z. */
const glacisY = (z: number): number => ROOF_Y - (z - GLACIS_TOP_Z) * UPPER_GLACIS_TAN;
/** The sponsons reach out over the tracks to ±1.56 m from the fender line (1.07 m) up; the tub runs at ±1.04 m inside
 * the track's inner edge (1.085). */
const HULL_HALF_W = 1.56, TUB_HALF_W = 1.04, SPONSON_Y = 1.07;
/** The fender shelf over the tracks to the published 3.372 m width (±1.685), its outer edge turned down 5 cm; the 85-III
 * prototype ran without skirts, its upper track run and return rollers in the open. */
const FENDER_OUT = 1.685, FENDER_LIP = 0.05;
/** Where the upper hull ends: the glacis falls to the sponson's top there and the beak runs on at the tub's width. */
const UPPER_END_Z = GLACIS_TOP_Z + (ROOF_Y - (SPONSON_Y + 0.07)) / UPPER_GLACIS_TAN;

/** Running gear (the 85-IIM side photograph on the published hull): six dual 0.70 m road wheels, 0.89 and 0.92 m
 * apart forward and 0.73-0.78 m aft, the 0.55 m track on a 2.72 m gauge, the sprocket aft, the idler forward. */
const WHEEL_R = 0.35;
const WHEEL_ZS = [1.99, 1.10, 0.18, -0.55, -1.28, -2.06];
const TRACK_XC = 1.36, TRACK_W = 0.55;
const RETURN_ROLLER_ZS = [1.545, -0.185, -1.67];

// ---------------------------------------------------------------------------
// Turret datums (turret frame: origin on the ring centre at the roof)
// ---------------------------------------------------------------------------
/** The ring centre over the third road wheel (the photographs' turret centre, 3.1 m behind the nose). */
const TURRET_PIVOT: Vec3 = [0, ROOF_Y, 0.05];
/** The welded hexagon (the Type 85's turret plan): half outlines from the snout round the vehicle's left. The vertical
 * belt (from 0.05 m, clear of the driver's hatch at every yaw, to 0.20 m); the two front faces sweeping 40 degrees off
 * the axis from the 0.84 m snout to the shoulders, leaning back to their top edge (the brow, 0.50 m); the long shallow
 * front slope rising from the brow to the flat roof (0.68 m) over the front 40% of the turret (the photographs' falling
 * front roof); the sides leaning in 6 cm; chamfered rear corners. 2.44 m wide and 2.62 m long. */
const BELT_BASE_Y = 0.05, BELT_Y = 0.20, BROW_Y = 0.50, ROOF_H = 0.68;
const BELT_PLAN: readonly (readonly [number, number])[] = [[0.42, 1.24], [1.19, 0.36], [1.22, 0.12], [1.22, -1.00], [1.02, -1.38]];
const BROW_PLAN: readonly (readonly [number, number])[] = [[0.39, 1.09], [1.15, 0.24]];
const ROOF_PLAN: readonly (readonly [number, number])[] = [[0.36, 0.18], [1.16, -0.04], [1.16, -0.98], [0.98, -1.34]];
/** The turret's top surface height at (x, z) over the roof and the front slope (fittings seat on it). */
function roofAt(x: number, z: number): number {
  const ax = Math.abs(x);
  const zBrow = BROW_PLAN[0][1] - Math.max(0, ax - BROW_PLAN[0][0]) * (BROW_PLAN[0][1] - BROW_PLAN[1][1]) / (BROW_PLAN[1][0] - BROW_PLAN[0][0]);
  const zRoof = ROOF_PLAN[0][1] - Math.max(0, ax - ROOF_PLAN[0][0]) * (ROOF_PLAN[0][1] - ROOF_PLAN[1][1]) / (ROOF_PLAN[1][0] - ROOF_PLAN[0][0]);
  if (z <= zRoof) return ROOF_H;
  if (z >= zBrow) return BROW_Y;
  return ROOF_H - (z - zRoof) / (zBrow - zRoof) * (ROOF_H - BROW_Y);
}
/** Bore axis 1.77 m over the ground: the trunnion 0.32 m over the ring, 0.96 m ahead of its centre. */
const TRUNNION: Vec3 = [0, 0.32, 0.96];
/** Muzzle 6.195 m ahead of the trunnion: 10.37 m from the stern (the 85-III's published gun-forward length). */
const MUZZLE_Z = 6.195;
const EVACUATOR = Object.freeze({ z0: 3.62, z1: 4.26, r: 0.128 });

/** First-generation explosive reactive armour (the 1995 package). */
const ERA_BRICK = Object.freeze({ w: 0.40, l: 0.38, t: 0.07 });

// ---------------------------------------------------------------------------
// Hull
// ---------------------------------------------------------------------------

/** Section knots every 0.35 m or less, so every gate slice holds real section faces. */
function through(knots: number[]): number[] {
  const zs: number[] = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const n = Math.max(1, Math.ceil((knots[i + 1] - knots[i]) / 0.35));
    for (let k = 0; k < n; k++) zs.push(knots[i] + (knots[i + 1] - knots[i]) * k / n);
  }
  zs.push(knots.at(-1)!);
  return zs;
}

/** A hull section: a rectangle from `b` to `t`, ±`w`, its top corners chamfered. */
function ring(w: number, b: number, t: number): SectionPoint[] {
  if (t - b < 0.04) { const m = (t + b) / 2; b = m - 0.02; t = m + 0.02; }
  const c = Math.min(0.03, (t - b) / 4);
  return [[-w, b], [w, b], [w, t - c], [w - c, t], [-w + c, t], [-w, t - c]];
}

/** The deck line: the glacis forward, the roof over the fighting compartment, the raised engine deck and the inclined
 * upper rear plate. */
function hullTop(z: number): number {
  if (z >= GLACIS_TOP_Z) return glacisY(z);
  if (z >= DECK_RAMP_Z0) return ROOF_Y;
  if (z >= DECK_RAMP_Z1) return ROOF_Y + (DECK_RAMP_Z0 - z) / (DECK_RAMP_Z0 - DECK_RAMP_Z1) * (ENGINE_DECK_Y - ROOF_Y);
  if (z >= -2.92) return ENGINE_DECK_Y;
  return ENGINE_DECK_Y - (-2.92 - z) / (-2.92 - REAR_Z) * 0.16;
}

/** The belly line: the lower glacis forward, the flat belly, the lower rear plate. */
function hullBottom(z: number): number {
  if (z >= BELLY_FRONT_Z) return BELLY_Y + (z - BELLY_FRONT_Z) * LOWER_GLACIS_TAN;
  if (z <= -2.80) return BELLY_Y + (-2.80 - z) / (-2.80 - REAR_Z) * (0.68 - BELLY_Y);
  return BELLY_Y;
}

function addHullBody(P: TankBuilderPort): void {
  const knots = [REAR_Z, -2.92, -2.80, DECK_RAMP_Z1, DECK_RAMP_Z0, GLACIS_TOP_Z];
  P.add('hull', sectionSolid(through([...knots, UPPER_END_Z]).map((z) => ({
    z, ring: ring(HULL_HALF_W, SPONSON_Y, hullTop(z)),
  }))));
  P.add('hull', sectionSolid(through([...knots, ...[UPPER_END_Z, BELLY_FRONT_Z].sort((a, b) => a - b), NOSE_Z - 0.002]).map((z) => ({
    z, ring: ring(TUB_HALF_W, hullBottom(z), Math.min(hullTop(z), SPONSON_Y + 0.07)),
  }))));
}

/** A plate bent along a polyline in the y-z plane, from x0 to x1, its thickness along each segment's downward normal. */
function bentPlateX(pts: readonly (readonly [number, number])[], x0: number, x1: number, t: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [za, ya] = pts[i], [zb, yb] = pts[i + 1];
    const len = Math.hypot(zb - za, yb - ya), tz = (zb - za) / len, ty = (yb - ya) / len;
    const ea = i > 0 ? 0.004 : 0, eb = i < pts.length - 2 ? 0.004 : 0;
    const az = za - tz * ea, ay = ya - ty * ea, bz = zb + tz * eb, by = yb + ty * eb;
    const nz = ty * t, ny = -tz * t;
    parts.push(KIT.slab(
      [x0, by + ny, bz + nz], [x1, by + ny, bz + nz], [x1, ay + ny, az + nz], [x0, ay + ny, az + nz],
      [x0, by, bz], [x1, by, bz], [x1, ay, az], [x0, ay, az]));
  }
  return KIT.mergeAll(parts);
}

/** Fender shelves over both tracks with their outer edge turned down, the boxed front mudguards over the idlers (top
 * plate falling to the nose, an outer cheek in the fender edge's plane) and short flaps behind the sprockets. */
function addFenders(P: TankBuilderPort): void {
  const { box } = KIT;
  const lipZ0 = -3.10, lipZ1 = 2.62;
  // the guard's top falls to the beak and its front slopes down and forward over the idler (no vertical box face)
  const guard: [number, number][] = [[lipZ1 - 0.04, SPONSON_Y + 0.012], [2.82, SPONSON_Y + 0.005], [2.98, 1.02], [3.10, 0.92], [3.16, 0.82]];
  for (const side of [-1, 1]) {
    // the shelf under the sponson's edge and its turned-down outer edge (2.4 cm outside the track's outer face)
    P.add('hull', box(FENDER_OUT - HULL_HALF_W + 0.01, 0.028, lipZ1 - lipZ0), side * (HULL_HALF_W - 0.01 + FENDER_OUT) / 2,
      SPONSON_Y - 0.004, (lipZ0 + lipZ1) / 2);
    P.add('hull', box(0.014, FENDER_LIP, lipZ1 - lipZ0), side * (FENDER_OUT - 0.007), SPONSON_Y - 0.004 - FENDER_LIP / 2, (lipZ0 + lipZ1) / 2);
    const x0 = side > 0 ? TUB_HALF_W - 0.01 : -FENDER_OUT, x1 = side > 0 ? FENDER_OUT : -(TUB_HALF_W - 0.01);
    P.addMudguard('ztz85iii-front-guard', 'hull', bentPlateX(guard, x0, x1, 0.03));
    // the guard's outer cheek, in the fender edge's plane, from its top plate down to 0.80 m
    const cheek: THREE.BufferGeometry[] = [];
    for (let i = 0; i < guard.length - 1; i++) {
      const [za, ya] = guard[i], [zb, yb] = guard[i + 1];
      // slab order: the lower face first, then the upper, each from -x to +x (forward end first), so both sides wind out
      const xa = Math.min(side * FENDER_OUT, side * (FENDER_OUT - 0.026)), xb = Math.max(side * FENDER_OUT, side * (FENDER_OUT - 0.026));
      cheek.push(KIT.slab([xa, 0.80, zb], [xb, 0.80, zb], [xb, 0.80, za], [xa, 0.80, za],
        [xa, yb, zb], [xb, yb, zb], [xb, ya, za], [xa, ya, za]));
    }
    P.addMudguard('ztz85iii-front-guard-cheek', 'hull', KIT.mergeAll(cheek));
    // the sponson's front corner over the guard, closing the deck between the upper hull's end and the guard
    P.add('hull', box(HULL_HALF_W - TUB_HALF_W, 0.028, guard[0][0] - (UPPER_END_Z - 0.005)),
      side * (TUB_HALF_W + HULL_HALF_W) / 2, SPONSON_Y + 0.014, (guard[0][0] + UPPER_END_Z - 0.005) / 2);
    // the rear flap behind the sprocket
    P.addMudguard('ztz85iii-rear-flap', 'hull', bentPlateX([[-3.21, SPONSON_Y - 0.15], [-3.17, SPONSON_Y - 0.02],
      [lipZ0 + 0.03, SPONSON_Y + 0.006]], side > 0 ? TUB_HALF_W + 0.04 : -FENDER_OUT, side > 0 ? FENDER_OUT : -(TUB_HALF_W + 0.04), 0.026));
  }
}

/** Running gear: six dual road wheels, three return rollers over the wheel pairs under the open upper run, rear
 * sprocket, front idler. */
function addRunningGear(P: TankBuilderPort): void {
  KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: WHEEL_R, wheelW: 0.30, wheelY: 0.40, xc: TRACK_XC, dishR: 0.80,
    wheelZs: [...WHEEL_ZS],
    sprocket: { z: -2.87, y: 0.66, r: 0.29 }, idler: { z: 2.68, y: 0.66, r: 0.27 },
    rollers: RETURN_ROLLER_ZS.map((z) => ({ z, y: 0.86, r: 0.10 })),
    trackW: TRACK_W, topY: 0.87, botY: 0.02,
    contactZF: WHEEL_ZS[0] + 0.18, contactZR: WHEEL_ZS.at(-1)! - 0.18,
    paintedEnds: true, coveredTop: false, arms: true, sprocketTeeth: true,
  });
}

/** A box seated on the upper glacis: `s` along the slope from the glacis top, `x` across, `t` thick. */
function onGlacis(P: TankBuilderPort, bucket: string, w: number, l: number, t: number, x: number, s: number): void {
  const tilt = Math.atan(UPPER_GLACIS_TAN), c = Math.cos(tilt), sn = Math.sin(tilt);
  const z = GLACIS_TOP_Z + s * c, y = glacisY(z);
  // the normal (0, cos, sin) carries the box off the plate by half its thickness
  P.add(bucket, KIT.box(w, t, l), x, y + (t / 2 + 0.004) * c, z + (t / 2 + 0.004) * sn, tilt, 0, 0);
}

/** Glacis and nose: the 1995 package's reactive bricks in two rows over the upper part of the plate (six across the
 * full-width row, four across the beak, the photograph's pattern), the guarded headlight pairs at the plate's upper
 * corners, tow hooks on the beak, the driver's hatch at the front left of the roof. */
function addHullFront(P: TankBuilderPort): void {
  const { box, cylY, cylZ, torus } = KIT;
  P.visualEraCluster('ztz85iii-glacis-era', 'hull', () => {
    const rows: [number, number[]][] = [[0.30, [0.22, 0.65, 1.08]], [0.72, [0.22, 0.65]]];
    for (const [s, xs] of rows) {
      for (const x of xs) for (const side of [-1, 1]) onGlacis(P, 'hullExternalArmor', ERA_BRICK.w, ERA_BRICK.l, ERA_BRICK.t, side * x, s);
    }
  });
  // headlight pairs in guards at the plate's upper corners
  for (const side of [-1, 1]) {
    const z = 2.22, y = glacisY(z), tilt = -Math.atan(UPPER_GLACIS_TAN);
    P.add('hullDetail', box(0.30, 0.05, 0.18), side * 1.34, y + 0.02, z, tilt, 0, 0);
    for (const dx of [-0.07, 0.07]) {
      KIT.headlight(P, side * 1.34 + dx, y + 0.11, z - 0.02, 0, 0.05, true);
    }
    // the guard: two hoops over the lamps
    for (const dx of [-0.15, 0.15]) P.add('hullDetail', box(0.02, 0.17, 0.02), side * 1.34 + dx, y + 0.10, z + 0.06);
    P.add('hullDetail', box(0.32, 0.02, 0.02), side * 1.34, y + 0.185, z + 0.06);
  }
  // tow hooks on the beak
  for (const x of [-0.62, 0.62]) {
    const z = 3.02, y = glacisY(z);
    P.add('hullDetail', box(0.16, 0.06, 0.12), x, y + 0.02, z, -Math.atan(UPPER_GLACIS_TAN), 0, 0);
    P.add('hullDark', torus(0.06, 0.017, 12), x, y + 0.075, z + 0.02, Math.PI / 2 - Math.atan(UPPER_GLACIS_TAN), 0, 0);
  }
  // driver's hatch at the front left of the roof with its three periscopes
  {
    const x = 0.50, z = 1.74, seg = P.q ? 24 : 14;
    P.add('hullDetail', cylY(0.28, 0.29, 0.03, seg), x, ROOF_Y + 0.01, z);
    P.addHatch('hull', cylY(0.245, 0.25, 0.045, seg), x, ROOF_Y + 0.045, z);
    P.add('hullDark', box(0.10, 0.04, 0.12), x - 0.27, ROOF_Y + 0.04, z);
    for (const dx of [-0.16, 0, 0.16]) KIT.periscope(P, 'hullDetail', x + dx, ROOF_Y + 0.04, z + 0.28);
  }
  // lift eyes at the roof's front corners
  for (const x of [-1.30, 1.30]) KIT.liftEye(P, 'hullDetail', x, ROOF_Y + 0.015, 1.86);
  // the bow MG-port blank and the beak's weld seam
  P.add('hullDark', box(TUB_HALF_W * 2 - 0.06, 0.022, 0.022), 0, NOSE_Y + 0.004, NOSE_Z - 0.004);
  P.add('hullDetail', cylZ(0.05, 0.03, 12), -0.40, glacisY(2.62) + 0.13, 2.62 + 0.07);
}

/** The sponson walls' stowage compartments (the Type 85 blended the old fender boxes into the hull): four doors a side
 * with hinges and catches, and the exhaust outlet on the left wall behind the turret. */
function addSponsonStowage(P: TankBuilderPort): void {
  const { box } = KIT;
  const doors = [[1.70, 0.86], [0.70, 0.94], [-0.40, 0.98], [-1.42, 0.86]] as const;
  for (const side of [-1, 1]) {
    const x = side * (HULL_HALF_W + 0.006);
    for (const [zc, len] of doors) {
      P.add('hullDetail', box(0.012, 0.26, len), x, 1.24, zc);
      P.add('hullDark', box(0.016, 0.022, 0.07), x + side * 0.004, 1.24, zc - len / 2 + 0.10);   // catch
      P.add('hullDark', box(0.016, 0.022, 0.07), x + side * 0.004, 1.24, zc + len / 2 - 0.10);
      P.add('hullDark', box(0.016, 0.03, len - 0.10), x + side * 0.002, 1.385, zc);              // hinge line
    }
  }
  // exhaust outlet: a louvred box on the left wall over the fifth and sixth wheels
  const x = HULL_HALF_W + 0.04, zc = -2.20;
  P.add('hullDark', box(0.08, 0.26, 0.62), x, 1.25, zc);
  for (let i = 0; i < 5; i++) P.add('hullDetail', box(0.10, 0.025, 0.58), x + 0.01, 1.15 + i * 0.05, zc);
}

/** The raised engine deck: two louvred grille panels, the fan intake between them, the transverse louvre at the rear;
 * the inclined rear plate with its lights and tow hooks; two 200 L drums across the stern on brackets. */
function addEngineDeckAndRear(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  const y = ENGINE_DECK_Y;
  for (const x of [-0.82, 0.82]) {
    P.add('hullDark', box(0.86, 0.02, 0.92), x, y + 0.008, -2.20);
    for (let i = 0; i < 9; i++) P.add('hullDetail', box(0.82, 0.026, 0.04), x, y + 0.03, -1.84 - i * 0.09);
  }
  P.add('hullDetail', cylY(0.30, 0.31, 0.04, P.q ? 24 : 14), 0, y + 0.02, -2.20);
  P.add('hullDark', cylY(0.25, 0.25, 0.012, P.q ? 24 : 14), 0, y + 0.045, -2.20);
  P.add('hullDark', box(2.4, 0.02, 0.18), 0, y + 0.008, -2.82);
  for (let i = 0; i < 3; i++) P.add('hullDetail', box(2.36, 0.026, 0.035), 0, y + 0.03, -2.76 - i * 0.05);
  // the rear plate's lights and tow hooks
  const rearY = (yy: number): number => -2.92 - (ENGINE_DECK_Y - yy) / 0.16 * (-2.92 - REAR_Z);
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.14, 0.10, 0.06), side * 1.30, 1.42, rearY(1.42) - 0.02);
    P.add('hullDetail', box(0.18, 0.08, 0.14), side * 0.70, 0.78, REAR_Z - 0.02);
  }
  // fuel drums across the stern on two brackets each
  for (const side of [-1, 1]) {
    const x = side * 0.44, dz = REAR_Z - 0.27, dy = 1.30;
    addChineseFuelDrum(P, x, dy, dz, 0.26, 0.66);
    for (const bx of [-0.20, 0.20]) {
      P.add('hullDark', box(0.05, 0.05, 0.30), x + bx, dy - 0.25, (REAR_Z + dz) / 2 - 0.02);
    }
  }
}

// ---------------------------------------------------------------------------
// Turret
// ---------------------------------------------------------------------------

/** Mirror a half outline (vehicle-left side, snout first) round to a full ring of points at height y. */
function planPoints(half: readonly (readonly [number, number])[], y: number): THREE.Vector3[] {
  const left = half.map(([x, z]) => new THREE.Vector3(x, y, z));
  const right = [...half].reverse().map(([x, z]) => new THREE.Vector3(-x, y, z));
  return [...left, ...right];
}

/** The welded shell: the vertical belt (y 0.05-0.20), the leaning front faces to the brow, the long front slope and the
 * flat roof at 0.68 m. */
function weldedShell(): THREE.BufferGeometry {
  const pts = [...planPoints(BELT_PLAN, BELT_BASE_Y), ...planPoints(BELT_PLAN, BELT_Y), ...planPoints(BROW_PLAN, BROW_Y),
    ...planPoints(ROOF_PLAN, ROOF_H)];
  const g = new ConvexGeometry(pts);
  // box-projected UVs, one face per triangle (the hull is non-indexed), so it merges with the kit's solids
  const pos = g.getAttribute('position'), nrm = g.getAttribute('normal'), uv: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
    if (ay >= ax && ay >= az) uv.push(pos.getX(i), pos.getZ(i));
    else if (ax >= az) uv.push(pos.getZ(i), pos.getY(i));
    else uv.push(pos.getX(i), pos.getY(i));
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** A plane patch between two edges on one side (side = 1: the vehicle's left), `a` along the edges from their first
 * point, `b` from the lower edge toward the upper; its basis is right-handed (u along, v up the patch, n outward), so a
 * box laid on it keeps its outward winding. */
function patch(side: 1 | -1, lo: readonly (readonly [number, number])[], loY: number, hi: readonly (readonly [number, number])[],
  hiY: number): { at: (a: number, b: number) => THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3; n: THREE.Vector3 } {
  const l0 = new THREE.Vector3(side * lo[0][0], loY, lo[0][1]), l1 = new THREE.Vector3(side * lo[1][0], loY, lo[1][1]);
  const h0 = new THREE.Vector3(side * hi[0][0], hiY, hi[0][1]), h1 = new THREE.Vector3(side * hi[1][0], hiY, hi[1][1]);
  let u = l1.clone().sub(l0).normalize();
  const up = h0.clone().add(h1).sub(l0).sub(l1).normalize();
  let n = new THREE.Vector3().crossVectors(u, up).normalize();
  // outward is forward (the faces) or up (the slope): flipping n flips u with it, so the basis stays right-handed
  if (n.z + n.y < 0) { n = n.negate(); u = u.negate(); }
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const at = (a: number, b: number): THREE.Vector3 => l0.clone().lerp(l1, a).lerp(h0.clone().lerp(h1, a), b);
  return { at, u, v, n };
}

/** A box laid on a patch basis, its back on the patch. */
function faceBox(w: number, h: number, t: number, origin: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, n: THREE.Vector3): THREE.BufferGeometry {
  const g = KIT.box(w, h, t);
  const m = new THREE.Matrix4().makeBasis(u, v, n).setPosition(origin.clone().addScaledVector(n, t / 2 + 0.004));
  return g.applyMatrix4(m);
}

/** The 1995 package on the turret: a row of three bricks on each front face and a row of two on the front slope above
 * it, standing proud of the plate. The face rows bind to turret_era_L/R by side; the slope pairs are tagged with their
 * own zones (the nearest-plate binding put every off-centre brick on the face zones, leaving the slope's unregistered). */
function addTurretEra(P: TankBuilderPort): void {
  P.visualEraCluster('ztz85iii-turret-era', 'turret', () => {
    for (const side of [-1, 1] as const) {
      const face = patch(side, BELT_PLAN, BELT_Y, BROW_PLAN, BROW_Y);
      for (const a of [0.20, 0.50, 0.80]) {
        P.add('turretExternalArmor', faceBox(0.28, 0.22, ERA_BRICK.t, face.at(a, 0.50), face.u, face.v, face.n));
      }
      const slope = patch(side, BROW_PLAN, BROW_Y, ROOF_PLAN, ROOF_H);
      P.destructibleCluster(`turret_slope_era_${side < 0 ? 'L' : 'R'}`, () => {
        for (const a of [0.50, 0.78]) {
          P.add('turretExternalArmor', faceBox(0.24, 0.26, ERA_BRICK.t - 0.01, slope.at(a, 0.26), slope.u, slope.v, slope.n));
        }
      });
    }
  });
}

/** A railed stowage basket: floor, end plates, five horizontal rails on the outer face carried by vertical posts. The
 * outer face is xOut on a side basket, z0 on the rear basket. */
function railedBasket(P: TankBuilderPort, xIn: number, xOut: number, y0: number, y1: number, z0: number, z1: number,
  axis: 'x' | 'z'): void {
  const { box } = KIT;
  const cx = (xIn + xOut) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const dx = Math.abs(xOut - xIn), dy = y1 - y0, dz = Math.abs(z1 - z0);
  const rails = [0, 1, 2, 3, 4].map((i) => y0 + 0.04 + (dy - 0.06) * i / 4);
  P.add('turretDetail', box(dx, 0.025, dz), cx, y0 + 0.0125, cz);                       // floor
  if (axis === 'x') {
    for (const z of [z0, z1]) P.add('turretDetail', box(dx, dy, 0.025), cx, cy, z);       // end plates
    for (const y of rails) P.add('turretDark', box(0.026, 0.026, dz), xOut, y, cz);
    const n = Math.max(2, Math.round(dz / 0.34));
    for (let i = 1; i < n; i++) P.add('turretDetail', box(0.03, dy - 0.03, 0.03), xOut, cy, z0 + (z1 - z0) * i / n);
  } else {
    for (const x of [xIn, xOut]) P.add('turretDetail', box(0.025, dy, dz), x, cy, cz);       // end plates
    for (const y of rails) P.add('turretDark', box(dx, 0.026, 0.026), cx, y, z0);
    const n = Math.max(2, Math.round(dx / 0.34));
    for (let i = 1; i < n; i++) P.add('turretDetail', box(0.03, dy - 0.03, 0.03), xIn + (xOut - xIn) * i / n, cy, z0);
  }
}

/** Side baskets on the rear half of both walls and the rear basket across the back, with stowed rolls and the
 * snorkel tube. */
function addStowage(P: TankBuilderPort): void {
  const { cylX, cylZ } = KIT;
  // the baskets stand nearly the turret's height (0.12-0.60 m)
  const wallX = 1.22, outX = 1.46, y0 = 0.12, y1 = 0.60;
  for (const side of [-1, 1]) {
    railedBasket(P, side * wallX, side * outX, y0, y1, -1.10, 0.00, 'x');
    P.add('turretCloth', cylZ(0.11, 0.86, P.q ? 16 : 10), side * 1.34, y1 - 0.08, -0.55);
  }
  railedBasket(P, -1.00, 1.00, 0.12, 0.60, -1.80, -1.36, 'z');
  // the stowed snorkel tube along the rear basket, and a tarpaulin roll
  P.add('turretDetail', cylX(0.11, 1.50, P.q ? 20 : 12), 0, 0.46, -1.66);
  P.add('turretCloth', cylX(0.13, 1.10, P.q ? 16 : 10), 0, 0.34, -1.56);
}

/** Roof stations: the commander's cupola on the right with his day/night sight ahead of it, the IR searchlight on its
 * outer side and the 12.7 mm gun; the gunner's armoured sight box and hatch on the left; the ventilator, the wind
 * sensor mast, two antennas and the lift eyes. */
function addTurretRoof(P: TankBuilderPort): void {
  const { box, cylY, cylZ, torus } = KIT;
  const seg = P.q ? 24 : 14, y = ROOF_H;
  // commander's broad cupola (right) on its raised ring
  const cx = -0.52, cz = -0.32, cr = 0.42;
  P.add('turret', cylY(cr, cr + 0.015, 0.10, seg), cx, y + 0.045, cz);
  P.add('turretDark', torus(cr - 0.005, 0.015, seg), cx, y + 0.098, cz);
  P.addHatch('turret', cylY(0.34, 0.35, 0.05, seg), cx, y + 0.125, cz);
  P.add('turretDetail', cylY(0.13, 0.19, 0.06, 12), cx, y + 0.175, cz - 0.05);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    KIT.periscope(P, 'turretDetail', cx + Math.sin(a) * (cr - 0.05), y + 0.11, cz + Math.cos(a) * (cr - 0.05));
  }
  // commander's day/night sight ahead of the cupola, its front over the start of the slope
  P.add('turret', box(0.26, 0.26, 0.24), cx, y + 0.07, cz + 0.56);
  P.add('turretDark', box(0.20, 0.08, 0.02), cx, y + 0.13, cz + 0.685);
  P.add('turretGlass', box(0.16, 0.055, 0.008), cx, y + 0.13, cz + 0.697);
  // IR searchlight on the cupola's outer side
  {
    const lx = cx - cr - 0.12, ly = y + 0.24, lz = cz + 0.05, r = 0.15;
    P.add('turretDetail', box(0.12, 0.14, 0.14), cx - cr + 0.01, y + 0.12, lz);
    P.add('turretDetail', box(0.06, 0.10, 0.10), lx, ly - r - 0.02, lz);
    P.add('turretDetail', cylZ(r, 0.24, P.q ? 20 : 12), lx, ly, lz);
    P.add('turretDark', cylZ(r + 0.008, 0.024, P.q ? 20 : 12), lx, ly, lz + 0.125);
    P.add('turretGlass', cylZ(r - 0.02, 0.008, P.q ? 20 : 12), lx, ly, lz + 0.14);
  }
  // the 12.7 mm gun on its post on the cupola's rear ring (the photographs' tall cradle)
  const post = 0.24, ringTop = y + 0.095;
  P.add('turretDetail', cylY(0.035, 0.045, post, 12), cx, ringTop + post / 2, cz - 0.28);
  mount(P, 'turret', FITTINGS.pintleMG({
    mats: P.mats, cls: 'qjc88', scale: 1.0, tone: 'two-tone', elev: 0.06,
    ammo: true, rotation: [0, 0, 0], seed: 8560, working: true, ridingCradle: true,
  }), cx, ringTop + post, cz - 0.28);
  // gunner's low armoured sight box (left, ahead of his hatch), its hood falling to the rear, on the front slope
  {
    const gx = 0.42, gz = 0.32, base = roofAt(gx, gz + 0.18) - 0.01, h = 0.20;
    P.add('turret', box(0.32, h, 0.36), gx, base + h / 2, gz);
    P.add('turret', box(0.36, 0.03, 0.28), gx, base + h + 0.004, gz + 0.02, -0.12, 0, 0);
    P.add('turretDark', box(0.22, 0.08, 0.02), gx, base + h - 0.07, gz + 0.185);
    P.add('turretGlass', box(0.18, 0.055, 0.008), gx, base + h - 0.07, gz + 0.197);
  }
  // gunner's hatch (left)
  P.add('turretDetail', cylY(0.28, 0.29, 0.03, seg), 0.52, y + 0.012, -0.34);
  P.addHatch('turret', cylY(0.25, 0.26, 0.045, seg), 0.52, y + 0.045, -0.34);
  KIT.periscope(P, 'turretDetail', 0.52, y + 0.04, -0.04);
  // ventilator dome, centre rear
  P.add('turret', cylY(0.13, 0.15, 0.06, 14), 0.05, y + 0.03, -0.92);
  P.add('turretDark', cylY(0.10, 0.13, 0.03, 14), 0.05, y + 0.075, -0.92);
  // wind sensor mast (right rear)
  P.add('turretDetail', cylY(0.05, 0.06, 0.05, 12), -0.80, y + 0.025, -1.08);
  P.add('turretDetail', cylY(0.022, 0.026, 0.42, 10), -0.80, y + 0.26, -1.08);
  P.add('turretDark', cylY(0.05, 0.05, 0.08, 12), -0.80, y + 0.50, -1.08);
  // the radio antenna at the rear left corner
  P.add('turretDetail', cylY(0.04, 0.05, 0.06, 10), 0.86, y + 0.03, -1.16);
  mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 0.95, r: 0.013, rake: -0.04, seed: 8543 }), 0.86, y + 0.06, -1.16);
  // lift eyes on the flat roof
  for (const [x, z] of [[0.92, -0.12], [-1.04, -0.20], [0.88, -1.06], [-0.64, -1.18]] as const) {
    KIT.liftEye(P, 'turretDetail', x, y + 0.005, z);
  }
}

/** Smoke dischargers: a 2x2 cluster at each cheek-and-side corner (two banks of two, one over the other), aimed forward,
 * out and up about 30 degrees. */
function addSmokeDischargers(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    for (const [y, row] of [[0.31, 0], [0.44, 1]] as const) {
      mount(P, 'turret', FITTINGS.smokeBank({
        mats: P.mats, count: 2, r: 0.05, len: 0.28, splay: side * 0.62,
        pitch: -0.52, arc: 0.14, spacing: 0.115, slot: 'detail',
        rotation: [0, 0, 0], seed: 8530 + (side > 0 ? 1 : 0) + row * 2,
      }), side * 1.21, y, 0.30);
    }
  }
}

/** The 125 mm gun in its mantlet (gun frame): the cast mount in the snout under a short canvas cover, the coaxial MG's
 * port on the right, the tube in its thermal sleeve with the evacuator a little forward of mid-tube. */
function addGun(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const n = P.q ? 20 : 12;
  // the cast mount, its face 7 cm proud of the snout
  P.addGunExtra(box(0.50, 0.34, 0.38), 0, -0.01, 0.11);
  // the short canvas cover from the mount's face onto the tube, about 0.4 m proud of the snout; its rear rim stays inside
  // the mount's face (y -0.18..0.16) so no ring rises through the mount's top
  const stations: [number, number, number][] = [[0.26, 0.46, 0.30], [0.38, 0.42, 0.31], [0.50, 0.34, 0.27], [0.62, 0.25, 0.25]];
  const round = (w: number, h: number): SectionPoint[] => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * w / 2, Math.sin(a) * h / 2] as const;
  });
  P.add('gunMountCanvasSkin', sectionSolid(stations.map(([z, w, h]) => ({ z, ring: round(w, h) })),
    { smoothSideEdges: Array.from({ length: n }, (_, i) => i) }));
  for (const [z, w, h] of stations.slice(1, -1)) {
    P.add('gunMountCloth', KIT.xform(cylZ(0.5, 0.03, n), 0, 0, 0, 0, 0, 0, [w + 0.014, h + 0.014, 1]), 0, 0, z);
  }
  // the clamp band over the cover's mouth (wider than the cloth under it, its face closing the mouth round the tube)
  P.addGunExtraDark(cylZ(0.137, 0.035, n), 0, 0, 0.612);
  P.addGunExtraDark(cylZ(0.024, 0.08, 10), -0.20, -0.06, 0.32);
  const ev = EVACUATOR;
  tubeGun(P, [
    // [z0, z1, front radius, rear radius] (cylZ puts its first radius at +Z)
    // the tube runs back into the cast mount (its face at 0.30) under the canvas, so the pitching housing holds it
    [0.24, 1.70, 0.104, 0.112], [1.70, ev.z0 - 0.08, 0.099, 0.104],
    [ev.z0 - 0.08, ev.z0, ev.r, 0.099], [ev.z0, ev.z1, ev.r, ev.r], [ev.z1, ev.z1 + 0.08, 0.098, ev.r],
    [ev.z1 + 0.08, MUZZLE_Z - 0.085, 0.094, 0.098], [MUZZLE_Z - 0.085, MUZZLE_Z, 0.090, 0.094],
  ], { rings: [[1.70, 0.110], [2.62, 0.106], [3.40, 0.105], [5.00, 0.100], [5.66, 0.098]], muzzle: MUZZLE_Z });
  muzzleBore(P, { r: 0.0625 });
}

function addTurret(P: TankBuilderPort): void {
  const { cylY } = KIT;
  P.turretG.position.set(...TURRET_PIVOT);
  P.gunG.position.set(...TRUNNION);
  P.add('turret', weldedShell());
  // the ring collar seats the shell on the roof at every yaw
  P.add('turret', cylY(1.00, 1.04, 0.10, P.q ? 32 : 18), 0, 0.015, 0);
  // weld beads along the belt's top
  for (const side of [-1, 1]) {
    P.add('turretDark', KIT.box(0.02, 0.02, 1.08), side * 1.225, BELT_Y, -0.45);
  }
  addTurretEra(P);
  addStowage(P);
  addTurretRoof(P);
  addSmokeDischargers(P);
  addGun(P);
  // star and number on each wall's open forward panel, ahead of the side basket
  const num = P.spec.visual.number || '85-III';
  P.decal('turret', 'star', null, 0.20, [1.205, 0.36, 0.16], Math.PI / 2);
  P.decal('turret', 'number', num, 0.20, [-1.205, 0.36, 0.16], -Math.PI / 2);
  P.topY = ROOF_H + 0.24;
}

/** The ZTZ-85-III (1995): the Type 85-II hull and welded turret with the 125 mm, the 1000 hp pack and the ERA package. */
export function buildZTZ85III(P: TankBuilderPort): void {
  addHullBody(P);
  addFenders(P);
  addRunningGear(P);
  addHullFront(P);
  addSponsonStowage(P);
  addEngineDeckAndRear(P);
  addTurret(P);
  P.hullG.userData.ztz85iiiReceipt = Object.freeze({
    revision: 'ztz85iii-r263',
    hullBodyM: Object.freeze({ rearZ: REAR_Z, noseZ: NOSE_Z, halfWidth: HULL_HALF_W, tubHalfWidth: TUB_HALF_W,
      roofY: ROOF_Y, engineDeckY: ENGINE_DECK_Y, bellyY: BELLY_Y }),
    widthOverFendersM: FENDER_OUT * 2,
    upperGlacisDegFromLevel: Math.atan(UPPER_GLACIS_TAN) / D2R,
    roadWheelStations: WHEEL_ZS.length, roadWheelDiameterM: WHEEL_R * 2, returnRollers: RETURN_ROLLER_ZS.length,
    trackWidthM: TRACK_W, trackGaugeM: TRACK_XC * 2, skirtPanels: 0, glacisEraBricks: 10, rearFuelDrums: 2,
    driverSide: 'left', exhaustSide: 'left',
  });
  P.turretG.userData.ztz85iiiReceipt = Object.freeze({
    revision: 'ztz85iii-r263',
    pivotLocalM: Object.freeze([...TURRET_PIVOT]), trunnionLocalM: Object.freeze([...TRUNNION]),
    beltPlan: BELT_PLAN, browPlan: BROW_PLAN, roofPlan: ROOF_PLAN, browHeightM: BROW_Y, roofHeightM: ROOF_H,
    muzzleLocalZ: MUZZLE_Z, evacuator: EVACUATOR, frontEraBricks: 10, smokeDischargers: 8,
    commanderSide: 'right', gunnerSide: 'left', roofMachineGuns: Object.freeze(['W-85 12.7 mm']),
  });
}
