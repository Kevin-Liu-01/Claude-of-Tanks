// The T-54/T-55 family — release 262 (owner 2026-10-27): "make the type 59 be based on a type 55 which we should add to
// russia. match the geometries well", after "... type 59, turrets and hullls as well based on proper historical
// referrences so they will no longer look so chungus".
//
// One first-party construction for the Soviet T-55A (Russia) and the Chinese Type 59 (the licensed T-54A, China), its
// datums measured from the owner-supplied T-55A model (docs/references/tanks/t55a.md: a local-only comparison oracle,
// one declared uniform scale of 1.15 that lands it on the published 6.04 m hull and 3.27 m width; never loaded at
// runtime) and checked against the Type 59 museum photographs (docs/references/tanks/type59.md §262): a 6.05 m hull
// with a 34-degree upper and 37-degree lower glacis over a 0.40 m belly and a 1.42 m roof; five 0.81 m road wheels a side
// with the wide first gap on a 2.65 m gauge; a low cast dome 2.55 m across rising 0.78 m; the 100 mm gun (bore axis
// 1.74 m) with its evacuator by the muzzle behind a canvas-covered slot; three fuel tanks and the oil tank on the right
// fender, boxes and the exhaust on the left, two 200 L drums across the stern.
//
// Variants carry only their deltas: the T-55A's L-2 searchlight and OU-3 spot and no roof gun (the 1963 vehicle); the
// Type 59's T-54A ventilator dome, its smaller searchlight, its loader's DShK and its Chinese fittings. Sides follow the vehicle (this world's +Z hull
// has its LEFT at +X): the commander's cupola, the driver, the exhaust and the left-fender boxes at +X; the loader, the
// coaxial MG, the searchlight, the headlights and the external tanks at -X. Every triangle is first-party procedural
// geometry. Authorship: Kevin B. Liu (NOTICE.md).

import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { tubeGun } from './russia.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Vec3 = [number, number, number];

const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------
// Hull datums (hull frame: y 0 = ground, +Z forward, +X the vehicle's left)
// ---------------------------------------------------------------------------
/** Ground clearance 0.425 m ([CZ-T54A]); the belly runs at it. */
const BELLY_Y = 0.40;
/** Hull roof and the turret-ring plane (the oracle's 1.40-1.45; the Type 59 photo's 1.45). */
const ROOF_Y = 1.42;
/** Hull sides: the upper hull ±1.07 from the fender line up, the lower tub ±0.98 inside the track's inner edge (1.023);
 * the upper hull's underside (TUB_TOP_Y - 0.03) clears the track pads over the wheels and both wraps (262 track-clip
 * gate: at 0.95 m the pads rode 2-3 cm into it). */
const HULL_HALF_W = 1.07, TUB_HALF_W = 0.98, TUB_TOP_Y = 1.10;
/** Fender shelf over the tracks, to the 3.27 m width (the oracle's 1.15-1.24; the photo's 1.14-1.17). */
// the track guards ride 4 cm over the track's wrap on the idler (262 critic round: they stood high over a bare top run)
const FENDER_Y = 1.11, FENDER_OUT = 1.635;
/** Nose: the upper glacis (34 degrees off level, the oracle's line from the 2.10 m deck edge) meets the 37-degree
 * lower plate 0.82 m off the ground. */
const NOSE_Z = 3.00, NOSE_Y = 0.82;
const UPPER_GLACIS_TAN = (1.42 - 0.82) / (3.00 - 2.10), LOWER_GLACIS_TAN = (0.82 - 0.40) / (3.00 - 2.45);
const GLACIS_TOP_Z = NOSE_Z - (ROOF_Y - NOSE_Y) / UPPER_GLACIS_TAN;
const BELLY_FRONT_Z = NOSE_Z - (NOSE_Y - BELLY_Y) / LOWER_GLACIS_TAN;
const REAR_Z = -3.00;
/** Upper glacis height at z. */
const glacisY = (z: number): number => ROOF_Y - (z - GLACIS_TOP_Z) * UPPER_GLACIS_TAN;

/** Running gear (the oracle at 1.15): five 0.81 m wheels, 0.84 m pitch behind the 1.14 m first gap, the 0.61 m course
 * on a 2.65 m gauge, the sprocket aft and the idler forward. */
const WHEEL_R = 0.405;
const WHEEL_ZS = [1.82, 0.68, -0.16, -1.00, -1.84];
const TRACK_XC = 1.323, TRACK_W = 0.60;

// ---------------------------------------------------------------------------
// Turret datums (turret frame: origin on the ring centre at the roof)
// ---------------------------------------------------------------------------
/** The ring centre over the gap ahead of the third road wheel (the oracle's turret centre, z -0.05..-0.10). */
const TURRET_PIVOT: Vec3 = [0, ROOF_Y, -0.08];
/** The cast dome (the oracle): a near-round plan, 2.54 m wide, its crown 0.22 m behind the ring centre (1.58 m to the
 * front casting, 1.03 m to the rear), rising 0.78 m as a superellipse (exponent 2.6: a steep lower band and the
 * T-55's broad crown). */
const DOME = Object.freeze({ H: 0.78, cz: -0.22, side: 1.27, front: 1.58, rear: 1.03, nFront: 1.45, nRear: 2.3, vExp: 2.6, sink: 0.03 });
/** Bore axis 1.74 m over the ground (the oracle's muzzle; [GS-59spec] 1.738 m): the trunnion 0.32 m over the ring,
 * 0.62 m ahead of its centre. */
const TRUNNION: Vec3 = [0, 1.74 - ROOF_Y, 0.62];
/** Muzzle 4.88 m ahead of the trunnion (the oracle's 5.42 m), 2.42 m past the nose; 9.0 m over the drums. */
const MUZZLE_Z = 4.88;
const EVACUATOR_LEN = 0.74;

/** What each family member carries of its own. */
interface T54Variant {
  readonly id: 'type59' | 't55a';
  readonly revision: string;
  /** The T-54A's mushroom ventilator ahead of the loader (the T-55 deleted it). */
  readonly ventDome: boolean;
  /** The IR searchlight's lamp radius: the T-55A's L-2, the Type 59's smaller later-model lamp. */
  readonly searchlightR: number;
  /** The loader's 12.7 mm AA gun: the Type 59's Type 54; the 1963 T-55A (the oracle) carries none. */
  readonly dshk: boolean;
  readonly dshkName: string;
  readonly dshkLabel: string;
}
const VARIANTS: Readonly<Record<T54Variant['id'], T54Variant>> = Object.freeze({
  type59: Object.freeze({ id: 'type59', revision: 'type59-t55-family-r262', ventDome: true, searchlightR: 0.15,
    dshk: true, dshkName: 'type59RoofDShK', dshkLabel: 'Type 54 DShK' }),
  t55a: Object.freeze({ id: 't55a', revision: 't55a-r262', ventDome: false, searchlightR: 0.17,
    dshk: false, dshkName: '', dshkLabel: '' }),
});

/** The dome's plan radius toward angle `t` (radians from +Z toward +X), about its apex. */
function domePlanR(t: number): number {
  const s = Math.abs(Math.sin(t)), c = Math.cos(t);
  const front = c >= 0, n = front ? DOME.nFront : DOME.nRear, b = front ? DOME.front : DOME.rear;
  return (Math.pow(s / DOME.side, n) + Math.pow(Math.abs(c) / b, n)) ** (-1 / n);
}
/** The dome's plan scale at height h (1 at the base, 0 at the apex). */
const domeScale = (h: number): number => (h <= 0 ? 1 : (1 - Math.min(1, h / DOME.H) ** DOME.vExp) ** (1 / DOME.vExp));
/** A point on the dome skin at plan angle t and height h. */
function domePoint(t: number, h: number): THREE.Vector3 {
  const r = domePlanR(t) * domeScale(h);
  return new THREE.Vector3(Math.sin(t) * r, h, DOME.cz + Math.cos(t) * r);
}
/** Dome height over the plan point (x, z); 0 outside the dome. */
function domeHeightAt(x: number, z: number): number {
  const dz = z - DOME.cz, t = Math.atan2(x, dz), rho = Math.hypot(x, dz) / domePlanR(t);
  return rho >= 1 ? 0 : DOME.H * (1 - rho ** DOME.vExp) ** (1 / DOME.vExp);
}
/** The plan angle at which the skin at height h passes through x on the front (sign +1) or rear (-1) half. */
function domeAngleForX(x: number, h: number, half: 1 | -1): number {
  let lo = half > 0 ? 0 : Math.PI, hi = half > 0 ? Math.PI / 2 : Math.PI / 2;
  const want = Math.abs(x);
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2, px = domePoint(m, h).x;
    if ((px < want) === (half > 0)) lo = m; else hi = m;
  }
  return Math.sign(x || 1) * (lo + hi) / 2;
}
/** Outward skin normal at angle t, height h (finite differences on the closed form). */
function domeNormal(t: number, h: number): THREE.Vector3 {
  const e = 1e-3, p = domePoint(t, h);
  const dt = domePoint(t + e, h).sub(p), dh = domePoint(t, Math.min(DOME.H - 1e-3, h + e)).sub(p);
  const n = new THREE.Vector3().crossVectors(dh, dt).normalize();
  const radial = new THREE.Vector3(p.x, 0, p.z - DOME.cz);
  if (n.dot(radial) < 0) n.negate();
  return n;
}

/** The cast dome: an indexed shell of rings about the apex, closed by a base disc a little under the roof. One
 * tessellation at both qualities: the drone dock stands on the dome, and its measured support must hold at each. */
function castDome(): THREE.BufferGeometry {
  const M = 48, K = 14;
  const heights: number[] = [-DOME.sink, 0];
  for (let k = 1; k < K; k++) heights.push(DOME.H * Math.sin((k / K) * Math.PI / 2));
  const positions: number[] = [];
  for (const h of heights) {
    for (let j = 0; j < M; j++) {
      const p = domePoint((j / M) * Math.PI * 2, Math.max(0, h));
      positions.push(p.x, h, p.z);
    }
  }
  const apex = positions.length / 3;
  positions.push(0, DOME.H, DOME.cz);
  const base = positions.length / 3;
  positions.push(0, -DOME.sink, DOME.cz);
  const index: number[] = [];
  const at = (ring: number, j: number): number => ring * M + ((j % M) + M) % M;
  for (let r = 0; r < heights.length - 1; r++) {
    for (let j = 0; j < M; j++) {
      const a = at(r, j), b = at(r, j + 1), c = at(r + 1, j + 1), d = at(r + 1, j);
      // outward winding (angles run from +Z toward +X, clockwise seen from above): a -> b -> c faces out
      index.push(a, b, c, a, c, d);
    }
  }
  const top = heights.length - 1;
  for (let j = 0; j < M; j++) index.push(at(top, j), at(top, j + 1), apex);
  for (let j = 0; j < M; j++) index.push(at(0, j), base, at(0, j + 1));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // the bucket merge re-projects camouflage; the attribute set must match the other parts'
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** A bent plate: a polyline in (z, y), z increasing, swept across x0..x1 (x0 < x1), `t` thick on its underside. */
function bentPlateX(pts: readonly (readonly [number, number])[], x0: number, x1: number,
  t: number | readonly number[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const at = (i: number): number => typeof t === 'number' ? t : t[i];
  for (let i = 0; i < pts.length - 1; i++) {
    const [za, ya] = pts[i], [zb, yb] = pts[i + 1];
    const len = Math.hypot(zb - za, yb - ya), tz = (zb - za) / len, ty = (yb - ya) / len;
    // inner joints overlap 4 mm so the bends close
    const ea = i > 0 ? 0.004 : 0, eb = i < pts.length - 2 ? 0.004 : 0;
    const az = za - tz * ea, ay = ya - ty * ea, bz = zb + tz * eb, by = yb + ty * eb;
    // the downward normal, times the thickness at each end (a per-point list tapers the plate)
    const nza = ty * at(i), nya = -tz * at(i), nzb = ty * at(i + 1), nyb = -tz * at(i + 1);
    // slab corner order: (-x,+z), (+x,+z), (+x,-z), (-x,-z); b is the forward end
    parts.push(KIT.slab(
      [x0, by + nyb, bz + nzb], [x1, by + nyb, bz + nzb], [x1, ay + nya, az + nza], [x0, ay + nya, az + nza],
      [x0, by, bz], [x1, by, bz], [x1, ay, az], [x0, ay, az]));
  }
  return KIT.mergeAll(parts);
}

// ---------------------------------------------------------------------------
// Hull
// ---------------------------------------------------------------------------

/** The welded hull: the upper hull (±1.07 m) over the track runs from the inclined rear plates to where the upper glacis
 * meets it, the lower tub (±0.98 m, inside the track's inner edge) from the belly to the nose; both glacis plates at the
 * oracle's angles; stations every 0.35 m or less so every gate slice holds real section faces. */
function addHullBody(P: TankBuilderPort): void {
  const top = (z: number): number => {
    if (z >= GLACIS_TOP_Z) return glacisY(z);
    if (z <= -2.55) return ROOF_Y - (-2.55 - z) / (-2.55 - REAR_Z) * 0.07;
    return ROOF_Y;
  };
  const bottom = (z: number): number => {
    if (z >= BELLY_FRONT_Z) return BELLY_Y + (z - BELLY_FRONT_Z) * LOWER_GLACIS_TAN;
    if (z <= -2.78) return BELLY_Y + (-2.78 - z) / (-2.78 - REAR_Z) * (0.62 - BELLY_Y);
    return BELLY_Y;
  };
  const through = (knots: number[]): number[] => {
    const zs: number[] = [];
    for (let i = 0; i < knots.length - 1; i++) {
      const n = Math.max(1, Math.ceil((knots[i + 1] - knots[i]) / 0.35));
      for (let k = 0; k < n; k++) zs.push(knots[i] + (knots[i + 1] - knots[i]) * k / n);
    }
    zs.push(knots.at(-1)!);
    return zs;
  };
  const ring = (w: number, b: number, t: number): SectionPoint[] => {
    if (t - b < 0.04) { const m = (t + b) / 2; b = m - 0.02; t = m + 0.02; }
    const c = Math.min(0.03, (t - b) / 4);
    return [[-w, b], [w, b], [w, t - c], [w - c, t], [-w + c, t], [-w, t - c]];
  };
  // the upper hull ends where the glacis falls to its floor (the tub carries the nose on alone)
  const upperEnd = GLACIS_TOP_Z + (ROOF_Y - (TUB_TOP_Y + 0.04)) / UPPER_GLACIS_TAN;
  P.add('hull', sectionSolid(through([REAR_Z, -2.78, -2.55, GLACIS_TOP_Z, upperEnd]).map((z) => ({
    z, ring: ring(HULL_HALF_W, TUB_TOP_Y - 0.03, top(z)),
  }))));
  // the tub's top meets the glacis where the upper hull ends, so the plate runs on unbroken
  P.add('hull', sectionSolid(through([REAR_Z, -2.78, -2.55, GLACIS_TOP_Z, ...[upperEnd, BELLY_FRONT_Z].sort((a, b) => a - b), NOSE_Z - 0.002]).map((z) => ({
    z, ring: ring(TUB_HALF_W, bottom(z), Math.min(top(z), TUB_TOP_Y + 0.04)),
  }))));
}

/** Fenders: the flat shelves over both tracks, the curved front mudguards over the idlers (the T-54's deep scoops,
 * with a down-turned outer lip and three pressed ribs) and short rear flaps behind the sprockets. Release 264 (envelope
 * honesty): sheet metal, not the hull's armour (in `hull` the shelves set the anatomy's armour envelope 0.585 m out from
 * the hull sides a side); painted bodywork, its silhouette and paint kept. */
function addFenders(P: TankBuilderPort): void {
  const { box } = KIT;
  const shelfZ0 = -2.94, shelfZ1 = 2.58;
  for (const side of [-1, 1]) {
    const x0 = HULL_HALF_W - 0.01, x1 = FENDER_OUT;
    P.add('hullFixedPaintedBodywork', box(x1 - x0, 0.03, shelfZ1 - shelfZ0), side * (x0 + x1) / 2, FENDER_Y, (shelfZ0 + shelfZ1) / 2);
  }
  const scoop: [number, number][] = [[shelfZ1 - 0.02, FENDER_Y + 0.015], [2.74, FENDER_Y + 0.005], [2.87, FENDER_Y - 0.035],
    [2.97, FENDER_Y - 0.10], [3.035, FENDER_Y - 0.19], [3.05, FENDER_Y - 0.27]];
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? HULL_HALF_W - 0.01 : -FENDER_OUT, x1 = side > 0 ? FENDER_OUT : -(HULL_HALF_W - 0.01);
    // the scoop runs in to the glacis edge (the tub's ±0.98: the upper hull ends at the fender line), and a short
    // plate closes the deck corner between the upper hull's end and the scoop
    const s0 = side > 0 ? TUB_HALF_W - 0.01 : -FENDER_OUT, s1 = side > 0 ? FENDER_OUT : -(TUB_HALF_W - 0.01);
    P.addMudguard('type59-front-scoop', 'hullFixedPaintedBodywork', bentPlateX(scoop, s0, s1, 0.028));
    const upperEnd = GLACIS_TOP_Z + (ROOF_Y - (TUB_TOP_Y + 0.04)) / UPPER_GLACIS_TAN, cornerZ0 = upperEnd - 0.005;
    P.add('hull', box(HULL_HALF_W - TUB_HALF_W, 0.028, scoop[0][0] - cornerZ0), side * (TUB_HALF_W + HULL_HALF_W - 0.02) / 2,
      FENDER_Y + 0.001, (cornerZ0 + scoop[0][0]) / 2);
    // the scoop's outer lip turns down along its curve, shallow over the idler's wrap and 0.10 m at the nose (262
    // track-clip gate: a uniform 0.12 m lip dropped into the track's outer edge over the idler)
    P.add('hullFixedPaintedBodywork', bentPlateX(scoop.slice(1), side * FENDER_OUT - 0.014, side * FENDER_OUT + 0.014, [0.045, 0.06, 0.10, 0.10, 0.10]));
    // pressed stiffening ribs along the scoop
    for (const f of [0.25, 0.5, 0.75]) {
      const x = side * (HULL_HALF_W + (FENDER_OUT - HULL_HALF_W) * f);
      P.add('hullDetail', bentPlateX(scoop.slice(0, 5).map(([z, y]) => [z, y + 0.012] as [number, number]), x - 0.012, x + 0.012, 0.012));
    }
    // the rear flap behind the sprocket, turned down
    P.addMudguard('type59-rear-flap', 'hullFixedPaintedBodywork', bentPlateX([[-3.03, FENDER_Y - 0.13], [-3.00, FENDER_Y - 0.02], [shelfZ0 + 0.02, FENDER_Y + 0.015]],
      x0 + side * 0.02, x1 - side * 0.0, 0.026));
    // the shelf's turned-down outer lip, 7 cm deep, closing most of the view onto the track's upper run
    P.add('hullFixedPaintedBodywork', box(0.012, 0.07, shelfZ1 - shelfZ0), side * (FENDER_OUT - 0.006), FENDER_Y - 0.04, (shelfZ0 + shelfZ1) / 2);
  }
}

/** Running gear: five road wheels a side at the T-54 stations, rear drive sprocket, front idler, no return rollers
 * (the upper run rides on the wheels). */
function addRunningGear(P: TankBuilderPort): void {
  KIT.buildRunningGear(P, {
    style: 'holes', wheelR: WHEEL_R, wheelW: 0.32, wheelY: 0.45, xc: TRACK_XC, dishR: 0.86,
    wheelZs: [...WHEEL_ZS],
    sprocket: { z: -2.54, y: 0.66, r: 0.27 }, idler: { z: 2.64, y: 0.77, r: 0.25 },
    rollers: [], trackW: TRACK_W, topY: 0.90, botY: 0.02,
    contactZF: WHEEL_ZS[0] + 0.21, contactZR: WHEEL_ZS[4] - 0.21,
    paintedEnds: true, coveredTop: false, arms: true, sprocketTeeth: true,
  });
}

/** Glacis, nose and driver's station: the transverse splash board, the headlight pair at the right front, two tow
 * hooks low on the plate, the bow MG port right of centre and the driver's hatch with its periscopes at the left. */
function addHullFront(P: TankBuilderPort): void {
  const { box, cylY, cylZ, torus } = KIT;
  const tilt = -Math.atan(UPPER_GLACIS_TAN);
  // splash board: a 0.10 m vertical strip across the plate a third of the way up
  {
    const z = 2.30, y = glacisY(z);
    P.add('hull', box(1.86, 0.11, 0.025), 0, y + 0.045, z - 0.01, -0.12, 0, 0);
    for (const x of [-0.90, 0.90]) P.add('hullDetail', box(0.03, 0.08, 0.10), x, y + 0.03, z - 0.04, tilt, 0, 0);
  }
  // headlights on a bracket at the right front (white lamp and the IR driving lamp)
  for (const [x, ir] of [[-0.18, false], [-0.32, true]] as const) {
    const z = 2.30, y = glacisY(z) + 0.09;
    P.add('hullDetail', box(0.10, 0.10, 0.06), x, y - 0.065, z - 0.03, tilt, 0, 0);
    KIT.headlight(P, x, y, z, 0, ir ? 0.062 : 0.055, !ir);
    if (ir) P.add('hullDark', cylZ(0.052, 0.012, 14), x, y, z + 0.085);
  }
  // tow hooks low on the upper plate
  for (const x of [-0.62, 0.62]) {
    const z = 2.74, y = glacisY(z);
    P.add('hullDetail', box(0.16, 0.06, 0.12), x, y + 0.02, z, tilt, 0, 0);
    P.add('hullDark', torus(0.06, 0.017, 12), x, y + 0.075, z + 0.02, Math.PI / 2 + tilt, 0, 0);
  }
  // bow MG port (SGMT-class 7.62 mm): a small boss on the plate right of centre
  {
    const z = 2.26, y = glacisY(z);
    P.add('hullDetail', cylY(0.05, 0.06, 0.05, 12), -0.42, y + 0.012, z, tilt, 0, 0);
    P.add('hullDark', cylY(0.016, 0.016, 0.03, 8), -0.42, y + 0.04, z + 0.012, tilt, 0, 0);
  }
  // driver's hatch at the front left of the roof, opening to the left, two periscopes ahead of it
  {
    const x = 0.50, z = 1.48;
    P.add('hullDetail', cylY(0.27, 0.28, 0.03, P.q ? 24 : 14), x, ROOF_Y + 0.01, z);
    P.addHatch('hull', cylY(0.235, 0.24, 0.045, P.q ? 24 : 14), x, ROOF_Y + 0.045, z);
    P.add('hullDark', box(0.10, 0.04, 0.12), x + 0.25, ROOF_Y + 0.04, z);
    KIT.periscope(P, 'hullDetail', x - 0.08, ROOF_Y + 0.04, z + 0.28);
    KIT.periscope(P, 'hullDetail', x + 0.10, ROOF_Y + 0.04, z + 0.28);
  }
  // lift eyes at the roof's front corners
  for (const x of [-0.88, 0.88]) KIT.liftEye(P, 'hullDetail', x, ROOF_Y + 0.015, 1.62);
}

/** Fender stowage: three flat external fuel tanks and the oil tank on the right fender, joined by a pipe; on the left,
 * stowage boxes, the tool box, a run of spare links on the front shelf, and the exhaust outlet over the fourth and
 * fifth wheels. */
function addFenderStowage(P: TankBuilderPort): void {
  const { box, cylZ, cylY } = KIT;
  const yb = FENDER_Y + 0.015, xc = (HULL_HALF_W + FENDER_OUT) / 2 + 0.01, w = 0.50;
  // right fender (-X): fuel and oil tanks
  const tanks: [number, number][] = [[1.30, 0.50], [0.38, -0.42], [-0.54, -1.34], [-1.48, -2.06]];
  for (const [z1, z0] of tanks) {
    const h = 0.24;
    // a rounded flat tank: a quarter-round crown along both long edges
    const ring: SectionPoint[] = [];
    for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; ring.push([-xc + w / 2 - 0.07 + Math.cos(a) * 0.07, yb + h - 0.07 + Math.sin(a) * 0.07]); }
    for (let i = 0; i <= 4; i++) { const a = Math.PI / 2 + (i / 4) * Math.PI / 2; ring.push([-xc - w / 2 + 0.07 + Math.cos(a) * 0.07, yb + h - 0.07 + Math.sin(a) * 0.07]); }
    ring.push([-xc - w / 2, yb], [-xc + w / 2, yb]);
    P.addEquipment('hullDetail', sectionSolid([{ z: z0, ring }, { z: z0 + 0.03, ring }, { z: z1 - 0.03, ring }, { z: z1, ring }].map((st, k) => (
      k === 0 || k === 3 ? { z: st.z, ring: ring.map(([x, y]) => [-xc + (x + xc) * 0.94, yb + (y - yb) * 0.94] as const) } : st))));
    P.addEquipment('hullDark', box(w - 0.04, 0.012, 0.03), -xc, yb + h + 0.002, z0 + 0.10);
    P.addEquipment('hullDark', cylY(0.035, 0.035, 0.03, 10), -xc - 0.12, yb + h + 0.012, z1 - 0.12);   // filler cap
    for (const z of [z0 + 0.12, z1 - 0.12]) P.addEquipment('hullDark', box(w + 0.02, 0.02, 0.035), -xc, yb + h * 0.55, z);  // straps
  }
  P.addEquipment('hullDark', cylZ(0.016, 3.30, 8), -(HULL_HALF_W + 0.05), yb + 0.20, -0.40);           // fuel pipe
  // left fender (+X): stowage boxes, tool box and the exhaust
  const boxes: [number, number, number][] = [[1.30, 0.62, 0.22], [0.50, -0.30, 0.24], [-0.40, -1.30, 0.20], [-2.30, -2.88, 0.22]];
  for (const [z1, z0, h] of boxes) {
    P.addEquipment('hullDetail', box(w, h, z1 - z0), xc, yb + h / 2, (z0 + z1) / 2);
    P.addEquipment('hullDetail', box(w + 0.012, 0.016, z1 - z0 + 0.012), xc, yb + h + 0.004, (z0 + z1) / 2);   // lid
    P.addEquipment('hullDark', box(0.016, 0.012, z1 - z0 - 0.06), xc - w / 2 + 0.02, yb + h + 0.014, (z0 + z1) / 2);   // hinge
    for (const dz of [-0.18, 0.18]) P.addEquipment('hullDark', box(0.05, 0.05, 0.016), xc + w / 2 - 0.002, yb + h - 0.05, (z0 + z1) / 2 + dz);
  }
  // exhaust outlet over the fourth/fifth wheels: a louvred box with its opening facing outboard
  {
    const z = -1.80, len = 0.70, h = 0.26;
    P.add('hullDetail', box(0.42, h, len), xc + 0.02, yb + h / 2, z);
    P.add('hullDark', box(0.02, h - 0.08, len - 0.12), xc + 0.232, yb + h / 2, z);
    for (const k of KIT.grilleIndices(P.q, 5, 3)) P.add('hullDetail', box(0.03, 0.022, len - 0.14), xc + 0.24, yb + 0.06 + k * 0.035, z);
  }
  // spare links on the left front shelf
  KIT.spareTrackStrip(P, 'hull', xc, yb + 0.03, 2.05, 3, 0, 0);
}

/** Engine deck louvres, the rear plate's drums on their brackets, smoke canisters, tail lamps and tow hooks. */
function addHullRear(P: TankBuilderPort): void {
  const { box, cylX, cylZ, torus } = KIT;
  // engine deck: two louvred grilles and the transverse rear grille on the sloped deck
  for (const x of [-0.46, 0.46]) {
    P.add('hullDark', box(0.82, 0.014, 0.90), x, ROOF_Y + 0.004, -2.32);
    for (const k of KIT.grilleIndices(P.q, 7, 4)) P.add('hullDetail', box(0.78, 0.018, 0.05), x, ROOF_Y + 0.012, -1.92 - k * 0.135);
  }
  P.add('hullDark', box(1.70, 0.012, 0.36), 0, ROOF_Y - 0.035, -2.75, -0.20, 0, 0);
  for (const k of KIT.grilleIndices(P.q, 3, 2)) P.add('hullDetail', box(1.64, 0.016, 0.04), 0, ROOF_Y - 0.02 - k * 0.022, -2.63 - k * 0.11, -0.20, 0, 0);
  // two 200 L drums across the stern on raked brackets
  const drumY = 1.52, drumZ = -3.23, drumR = 0.28, drumX = 0.57, drumL = 0.88;
  // the drums are external fuel, not armour: equipment buckets keep them out of the combat hull
  for (const s of [-1, 1]) {
    P.addEquipment('hull', cylX(drumR, drumL, P.q ? 20 : 12), s * drumX, drumY, drumZ);
    for (const e of [-drumL / 2 + 0.01, drumL / 2 - 0.01]) P.addEquipment('hullDark', cylX(drumR + 0.006, 0.018, P.q ? 20 : 12), s * drumX + e, drumY, drumZ);
    P.addEquipment('hullDark', cylX(drumR + 0.004, 0.014, P.q ? 20 : 12), s * drumX, drumY, drumZ);
    P.addEquipment('hullDark', box(0.04, 0.03, 0.62), s * drumX, drumY + drumR + 0.01, drumZ);           // strap
    for (const dx of [-0.26, 0.26]) {
      P.addEquipment('hullDetail', box(0.07, 0.30, 0.07), s * drumX + dx, drumY - 0.30, REAR_Z - 0.06, 0.42, 0, 0); // raked bracket
      P.addEquipment('hullDetail', box(0.07, 0.06, 0.46), s * drumX + dx, drumY - drumR - 0.02, drumZ + 0.10);      // cradle
    }
  }
  // BDSh smoke canisters on the rear plate
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylX(0.075, 0.34, 12), s * 0.62, 1.08, REAR_Z - 0.09);
    P.add('hullDark', box(0.05, 0.08, 0.10), s * 0.62, 1.08, REAR_Z - 0.03);
  }
  // tail lamps and tow hooks
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.10, 0.08, 0.06), s * 0.86, 1.30, REAR_Z - 0.02);
    P.add('hullDark', torus(0.07, 0.018, 12), s * 0.70, 0.62, -2.92, Math.PI / 2 - 0.4, 0, 0);
    P.add('hullDetail', box(0.12, 0.10, 0.08), s * 0.70, 0.70, -2.86);
  }
  // transmission access plate on the rear plate
  P.add('hullDetail', box(0.90, 0.40, 0.02), 0, 0.92, REAR_Z - 0.003);
  // lift eyes at the rear deck corners
  for (const x of [-0.88, 0.88]) KIT.liftEye(P, 'hullDetail', x, ROOF_Y - 0.03, -2.50);
  // the welded seam between roof and the sloped rear deck
  P.add('hullDark', box(1.96, 0.010, 0.02), 0, ROOF_Y + 0.002, -2.55);
  // the cylinder of the air-cleaner intake under the deck's front-right louvre
  P.add('hullDetail', cylZ(0.11, 0.02, 14), -0.45, ROOF_Y + 0.004, -1.00, Math.PI / 2, 0, 0);
}

// ---------------------------------------------------------------------------
// Turret
// ---------------------------------------------------------------------------

/** Handrails standing 6 cm off the casting at h, between plan angles a0..a1 (radians), with stanchions. */
function addTurretRail(P: TankBuilderPort, h: number, a0: number, a1: number): void {
  const pts: THREE.Vector3[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = a0 + (a1 - a0) * i / n, p = domePoint(t, h), nrm = domeNormal(t, h);
    pts.push(p.addScaledVector(nrm, 0.06));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  P.add('turretDetail', new THREE.TubeGeometry(curve, P.q ? 24 : 10, 0.014, 6, false));
  for (const f of [0.08, 0.5, 0.92]) {
    const t = a0 + (a1 - a0) * f, p = domePoint(t, h), nrm = domeNormal(t, h);
    const mid = p.clone().addScaledVector(nrm, 0.03);
    const geo = KIT.cylY(0.011, 0.011, 0.075, 6);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm));
    P.add('turretDetail', geo, mid.x, mid.y, mid.z);
  }
}

/** A fitting's seat on the skin: the skin point under (x, z) and its height. */
function skinAt(x: number, z: number): number {
  return domeHeightAt(x, z);
}

function addCommanderCupola(P: TankBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  const x = 0.40, z = -0.24, base = skinAt(x, z) - 0.03, seg = P.q ? 28 : 14;
  // armoured ring standing 0.15 m over the skin, its bolt flange and four periscope heads round the forward arc
  P.addCupola('turret', cylY(0.285, 0.30, 0.18, seg), x, base + 0.09, z);
  P.add('turretDetail', cylY(0.325, 0.325, 0.022, seg), x, base + 0.04, z);
  for (let k = 0; k < (P.q ? 16 : 8); k++) {
    const a = (k / (P.q ? 16 : 8)) * Math.PI * 2;
    P.add('turretDark', cylY(0.009, 0.009, 0.012, 6), x + Math.sin(a) * 0.31, base + 0.057, z + Math.cos(a) * 0.31);
  }
  for (const a of [-0.75, -0.25, 0.25, 0.75]) {
    const px = x + Math.sin(a) * 0.275, pz = z + Math.cos(a) * 0.275;
    P.addModuleVisual('optics', 'turretDetail', box(0.12, 0.06, 0.07), px, base + 0.15, pz, 0, a, 0);
    P.addModuleVisual('optics', 'turretGlass', box(0.09, 0.022, 0.072), px, base + 0.152, pz + 0.002, 0, a, 0);
  }
  // rotating hatch lid with the TPK-1 sight housing at its front
  const lidY = base + 0.18;
  P.addHatch('turret', cylY(0.25, 0.26, 0.04, seg), x, lidY + 0.02, z);
  P.add('turretDark', box(0.06, 0.03, 0.10), x - 0.24, lidY + 0.02, z - 0.08);
  P.addModuleVisual('optics', 'turretDetail', box(0.18, 0.13, 0.22), x, lidY + 0.10, z + 0.14);
  P.addModuleVisual('optics', 'turretGlass', box(0.13, 0.05, 0.012), x, lidY + 0.11, z + 0.252);
  // OU-3 IR spot on the ring's front-left
  P.add('turretDetail', box(0.05, 0.08, 0.05), x + 0.20, base + 0.20, z + 0.20);
  P.add('turretDetail', cylZ(0.07, 0.11, 14), x + 0.20, base + 0.27, z + 0.22);
  P.add('turretDark', cylZ(0.058, 0.008, 14), x + 0.20, base + 0.27, z + 0.28);
}

function addLoaderHatch(P: TankBuilderPort): { x: number; z: number; top: number } {
  const { box, cylY } = KIT;
  const x = -0.45, z = -0.67, base = skinAt(x, z) - 0.02, seg = P.q ? 28 : 14;
  P.add('turretDetail', cylY(0.30, 0.31, 0.05, seg), x, base + 0.025, z);
  P.addHatch('turret', cylY(0.255, 0.26, 0.035, seg), x, base + 0.065, z);
  P.add('turretDark', box(0.08, 0.035, 0.12), x - 0.26, base + 0.06, z);
  // the AA ring mount round the hatch
  P.add('turretDetail', KIT.torus(0.33, 0.016, P.q ? 32 : 16), x, base + 0.07, z);
  return { x, z, top: base + 0.085 };
}

function addTurretRoof(P: TankBuilderPort, v: T54Variant): void {
  const { box, cylY, sph } = KIT;
  addCommanderCupola(P);
  const loader = addLoaderHatch(P);
  // the 12.7 mm DShK on the loader's ring, barrel forward
  if (v.dshk) {
    const dshk = FITTINGS.pintleMG({
      mats: P.mats, cls: 'dshk', scale: 1.0, tone: 'two-tone', elev: 0.06,
      ammo: true, shield: false, working: true, ridingCradle: true, seed: 6,
    });
    dshk.name = v.dshkName;
    dshk.userData.cupolaSeat = 'loader';
    dshk.position.set(loader.x, loader.top - 0.01, loader.z + 0.30);
    P.turretG.add(dshk);
    P.add('turretDetail', box(0.10, 0.03, 0.10), loader.x, loader.top - 0.02, loader.z + 0.30);
  }
  // the T-54A's mushroom ventilator ahead of the loader's hatch
  if (v.ventDome) {
    const x = -0.40, z = 0.34, base = skinAt(x, z) - 0.02;
    P.add('turret', cylY(0.12, 0.13, 0.06, P.q ? 20 : 12), x, base + 0.03, z);
    P.add('turret', KIT.xform(sph(0.14, P.q ? 20 : 12, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.45, 1]), x, base + 0.055, z);
  }
  // gunner's sight aperture left of the gun: a small round hooded port low in the casting (262 critic round: the raised
  // box set high read as a tile stuck on)
  {
    const h = 0.30, t = domeAngleForX(0.34, h, 1), p = domePoint(t, h), n = domeNormal(t, h);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const e = new THREE.Euler().setFromQuaternion(q);
    const hood = p.clone().addScaledVector(n, 0.004);
    P.add('turretDetail', KIT.cylZ(0.075, 0.03, 14), hood.x, hood.y, hood.z, e.x, e.y, e.z);
    const slit = p.clone().addScaledVector(n, 0.020);
    P.addModuleVisual('optics', 'turretGlass', KIT.cylZ(0.045, 0.006, 14), slit.x, slit.y, slit.z, e.x, e.y, e.z);
  }
  // the gunner's periscope ahead of the commander and the loader's on the right
  for (const [x, z, a] of [[0.61, 0.44, 0.25], [-0.70, -0.20, -0.3]] as const) {
    KIT.periscope(P, 'turretDetail', x, skinAt(x, z) + 0.01, z, a);
  }
  // radio antenna base at the left rear of the roof (the rear centre stays clear for the mission stand)
  {
    const x = 0.68, z = -0.80;
    P.add('turretDetail', cylY(0.055, 0.07, 0.06, 10), x, skinAt(x, z) + 0.01, z);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.72, r: 0.016, rake: -0.10, seed: 3 });
    whip.name = 'type59RadioWhip';
    whip.position.set(x, skinAt(x, z) + 0.04, z);
    P.turretG.add(whip);
  }
  // lifting eyes on the casting
  for (const [x, z] of [[0.80, 0.30], [-0.82, -0.62], [0.30, -0.98]] as const) {
    KIT.liftEye(P, 'turretDetail', x, skinAt(x, z) - 0.005, z, Math.atan2(x, z - DOME.cz));
  }
}

/** The canvas-covered mantlet slot: the gun leaves a narrow vertical slot through the casting's front; a pleated
 * canvas cover strapped round it hides the slot at every elevation (gun frame). Its root runs 0.40 m back inside the
 * casting, so no elevation in the gun's range opens a gap at the face. */
function addMantletCover(P: TankBuilderPort): void {
  const { cylZ } = KIT;
  // [z, width, height]: a rounded canvas bag 0.46 m wide at the slot, gathered to a clamp on the tube
  // the oracle's trumpet (262 critic rounds): a round pleated cone from the slot flowing onto the tube at 1.15 m, the
  // narrow neck the egg-shaped casting runs into
  const stations: [number, number, number][] = [[0.10, 0.50, 0.52], [0.58, 0.48, 0.48], [0.76, 0.37, 0.37],
    [0.96, 0.27, 0.27], [1.15, 0.212, 0.212]];
  const n = P.q ? 20 : 12, e = 1;   // round sections
  const ring = (w: number, h: number): SectionPoint[] => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    return [Math.sign(c) * Math.abs(c) ** e * w / 2, Math.sign(s) * Math.abs(s) ** e * h / 2] as const;
  });
  P.add('gunMountCanvasSkin', sectionSolid(stations.map(([z, w, h]) => ({ z, ring: ring(w, h) })),
    { smoothSideEdges: Array.from({ length: n }, (_, i) => i) }));
  // pleats: soft rolls where the canvas folds, and the clamp band on the tube
  for (const [z, w, h] of stations.slice(2, -1)) {
    P.add('gunMountCloth', KIT.xform(cylZ(0.5, 0.03, n), 0, 0, 0, 0, 0, 0, [w + 0.014, h + 0.014, 1]), 0, 0, z);
  }
  P.addGunExtraDark(cylZ(0.110, 0.035, n), 0, 0, 1.135);
  // 263 (fleetPassLow gunArticulation: the pitching gunMount bucket carries the mantlet's steel): the gun cradle's
  // sleeve round the tube's root, inside the canvas bag (z 0.12-0.32, r 0.12 inside the bag's 0.24), past the tube's
  // rear cap at 0.30 so no two caps share a plane
  P.add('gunMount', cylZ(0.12, 0.20, n), 0, 0, 0.22);
  // the coaxial 7.62 mm's port in the cover, right of the gun
  P.addGunExtraDark(cylZ(0.022, 0.08, 10), -0.17, -0.03, 0.66);
}

/** 100 mm Type 59 rifled gun (licensed D-10T): the tube tapers from the cover to the bore evacuator, which runs flush
 * to the muzzle (0.74 m long, 0.188 m over a 0.148 m barrel). */
function addMainGun(P: TankBuilderPort): void {
  const evStart = MUZZLE_Z - EVACUATOR_LEN;
  tubeGun(P, [
    // [z0, z1, front radius, rear radius] (cylZ puts its first radius at +Z)
    // the oracle's tube: 0.074 m radius forward, swelling to 0.118 at its root in the cover; the evacuator 0.094
    [0.30, 1.25, 0.090, 0.118], [1.25, 2.30, 0.077, 0.090], [2.30, evStart - 0.06, 0.074, 0.077],
    [evStart - 0.06, evStart + 0.02, 0.094, 0.074], [evStart + 0.02, MUZZLE_Z - 0.06, 0.094, 0.094],
    [MUZZLE_Z - 0.06, MUZZLE_Z, 0.080, 0.094],
  ], { rings: [[evStart + 0.03, 0.097], [MUZZLE_Z - 0.08, 0.097]], muzzle: MUZZLE_Z });
  muzzleBore(P, { r: 0.05 });
}

/** The later-model IR searchlight right of the gun on a short cradle arm, slaved in elevation (gun frame). */
function addSearchlight(P: TankBuilderPort, v: T54Variant): void {
  const { box, cylZ } = KIT;
  const r = v.searchlightR, x = -0.39 - r, y = 0.46, z = 0.58;
  // the oracle's lamp rides high on the turret's right front, linked to the gun: a riser off the cradle's right cheek
  // arm off the cradle out to the riser (262 geometry gate: the shorter arm left the lamp floating 16 cm clear of it)
  const armEnd = x + 0.06, armLen = -0.09 - armEnd + 0.03;
  P.add('gunMountLamp', box(armLen, 0.06, 0.10), -0.09 - armLen / 2, 0.16, 0.66);
  P.add('gunMountLamp', box(0.06, y - r - 0.16, 0.08), x + 0.06, (y - r + 0.16) / 2, z + 0.06);  // riser to the stirrup
  P.add('gunMountLamp', box(0.06, 0.12, 0.10), x, y - r - 0.03, z - 0.02);       // stirrup
  P.add('gunMountLamp', cylZ(r, 0.26, P.q ? 20 : 12), x, y, z);
  P.add('gunMountDark', cylZ(r + 0.008, 0.025, P.q ? 20 : 12), x, y, z + 0.135);   // bezel
  P.add('gunMountGlass', cylZ(r - 0.02, 0.008, P.q ? 20 : 12), x, y, z + 0.15);
  P.add('gunMountDark', cylZ(r * 0.72, 0.03, 12), x, y, z - 0.145);              // rear cap
}

function buildFamilyTurret(P: TankBuilderPort, v: T54Variant): void {
  P.turretG.position.set(...TURRET_PIVOT);
  P.gunG.position.set(...TRUNNION);
  P.add('turret', castDome());
  addTurretRail(P, 0.30, 40 * D2R, 140 * D2R);
  addTurretRail(P, 0.30, -40 * D2R, -140 * D2R);
  addTurretRail(P, 0.34, 158 * D2R, 202 * D2R);
  addTurretRoof(P, v);
  addMantletCover(P);
  addMainGun(P);
  addSearchlight(P, v);
  // turret numbers on the flanks
  const num = P.spec.visual.number || '';
  for (const side of [-1, 1]) {
    const t = side * 92 * D2R, h = 0.36, p = domePoint(t, h).addScaledVector(domeNormal(t, h), 0.008);
    P.decal('turret', 'number', num, 0.24, [p.x, p.y, p.z], side * Math.PI / 2);
  }
  P.topY = 1.00;
}

function buildT54Family(P: TankBuilderPort, v: T54Variant): void {
  addHullBody(P);
  addFenders(P);
  addRunningGear(P);
  addHullFront(P);
  addFenderStowage(P);
  addHullRear(P);
  buildFamilyTurret(P, v);
  P.hullG.userData.t54FamilyReceipt = Object.freeze({
    variant: v.id, revision: v.revision, oracleScale: 1.15,
    hullBodyM: Object.freeze({ rearZ: REAR_Z, noseZ: NOSE_Z, fenderTipZ: 3.05, halfWidth: HULL_HALF_W, tubHalfWidth: TUB_HALF_W,
      roofY: ROOF_Y, bellyY: BELLY_Y }),
    widthM: FENDER_OUT * 2,
    upperGlacisDegFromLevel: Math.atan(UPPER_GLACIS_TAN) / D2R, lowerGlacisDegFromLevel: Math.atan(LOWER_GLACIS_TAN) / D2R,
    roadWheelStations: WHEEL_ZS.length, roadWheelDiameterM: WHEEL_R * 2,
    roadWheelPitchM: WHEEL_ZS[2] - WHEEL_ZS[3], firstGapM: WHEEL_ZS[0] - WHEEL_ZS[1],
    trackWidthM: TRACK_W, trackGaugeM: TRACK_XC * 2, returnRollers: 0,
    rearFuelDrums: 2, externalFuelTanksRight: 4, exhaustSide: 'left', driverSide: 'left',
  });
  P.turretG.userData.t54FamilyReceipt = Object.freeze({
    variant: v.id, revision: v.revision,
    dome: Object.freeze({ widthM: DOME.side * 2, lengthM: DOME.front + DOME.rear, heightM: DOME.H, apexZ: DOME.cz }),
    pivotLocalM: Object.freeze([...TURRET_PIVOT]), trunnionLocalM: Object.freeze([...TRUNNION]),
    muzzleLocalZ: MUZZLE_Z, evacuatorLengthM: EVACUATOR_LEN, evacuatorAtMuzzle: true, muzzleCounterweight: false,
    commanderCupolaSide: 'left', loaderHatchSide: 'right', searchlightSide: 'right', coaxSide: 'right',
    searchlightDiameterM: v.searchlightR * 2, ventilatorDome: v.ventDome, roofMachineGuns: Object.freeze(v.dshk ? [v.dshkLabel] : []),
  });
}

/** The Type 59 (WZ-120): the licensed T-54A, the T-55 construction with the T-54A's ventilator dome. */
export function buildType59(P: TankBuilderPort): void {
  buildT54Family(P, VARIANTS.type59);
}

/** The T-55A (1963): the family construction as the owner-supplied model draws it. */
export function buildT55A(P: TankBuilderPort): void {
  buildT54Family(P, VARIANTS.t55a);
}
