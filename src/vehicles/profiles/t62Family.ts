// The T-62 family — lane t62-275 (owner 2026-11-21): "update the t62mv-1 and t62 obr 1975 to actually look like their
// historical counterparts."
//
// One first-party construction for the Soviet T-62 obr. 1975 (`t62_1975`) and the T-62MV obr. 1985 (`t62mv1`), checked
// against the published dimensions and the museum and service photographs indexed in the lane packet
// (docs/references/tanks/t62.md). It follows the T-54/T-55 family construction (t54Family.ts): the T-62 is that
// layout stretched 0.39 m for the larger fighting compartment: a 6.63 m hull, 3.30 m over the fenders, a 30-degree
// upper glacis over a 0.43 m belly; five 0.81 m road wheels a side spaced wider toward the rear and no return rollers;
// the broad, low cast dome on its 2.245 m ring; the 115 mm U-5TS smoothbore with its bore evacuator two thirds of the
// way out; three fuel tanks and the oil tank on the right fender, boxes and the exhaust on the left, two 200 L drums
// across the stern.
//
// Variants carry only their deltas. The obr. 1975 is the plain 1975 production tank: no add-on armour, no skirts, the
// KTD-1 laser rangefinder box over the gun, the loader's DShKM. The T-62MV is the 1985 M-1-2 rebuild: Kontakt-1 on the
// turret front, the glacis and along the rubber side skirts, the KTD-2 rangefinder and the gun's thermal sleeve.
// Sides follow the vehicle (this world's +Z hull has its LEFT at +X): the commander's cupola, the driver, the exhaust
// and the left-fender boxes at +X; the loader and his DShKM, the coaxial MG, the searchlight and the external tanks at
// -X. Every triangle is first-party procedural geometry. Authorship: Kevin B. Liu (NOTICE.md).

import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { KIT, FITTINGS, muzzleBore } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { markEraHitFaces, markEraFurniture } from './eraHitFaces.ts';
import { tubeGun } from './russia.ts';
import { addTurretRail, type DomeSkin } from './t54Family.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Vec3 = [number, number, number];

const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------
// Hull datums (hull frame: y 0 = ground, +Z forward, +X the vehicle's left)
// ---------------------------------------------------------------------------
/** Ground clearance 0.43 m; the belly runs at it. */
const BELLY_Y = 0.43;
/** Hull roof and the turret-ring plane. */
const ROOF_Y = 1.47;
/** Upper hull ±1.15 m from the fender line up (it carries the 2.245 m ring); the lower tub ±0.99 m inside the track's
 * inner edge (1.03); the upper hull's underside clears the track's top run. */
const HULL_HALF_W = 1.15, TUB_HALF_W = 0.99, TUB_TOP_Y = 1.12;
/** Fender shelf over the tracks to the 3.30 m width. */
const FENDER_Y = 1.13, FENDER_OUT = 1.65;
/** Nose: the 30-degree upper glacis meets the lower plate 0.84 m off the ground. */
const NOSE_Z = 3.27, NOSE_Y = 0.84;
const UPPER_GLACIS_TAN = Math.tan(30 * D2R), LOWER_GLACIS_TAN = Math.tan(36 * D2R);
const GLACIS_TOP_Z = NOSE_Z - (ROOF_Y - NOSE_Y) / UPPER_GLACIS_TAN;
const BELLY_FRONT_Z = NOSE_Z - (NOSE_Y - BELLY_Y) / LOWER_GLACIS_TAN;
const REAR_Z = -3.30;
/** Where the engine deck starts falling to the rear plate. */
const DECK_BREAK_Z = -2.80;
/** Upper glacis height at z. */
/** The headlights' station on the upper plate (addHullFront); the MV's Kontakt field leaves it clear. */
const LAMP_Z = 2.42;
const glacisY = (z: number): number => ROOF_Y - (z - GLACIS_TOP_Z) * UPPER_GLACIS_TAN;

/** Running gear: five 0.81 m wheels on a 2.64 m gauge, the gaps opening toward the rear (photos t62_1975/02: 0.92,
 * 0.93, 1.06, 1.08 m; the T-62's tell against the T-55's wide first gap), the 0.58 m course, the sprocket aft and the
 * idler forward. */
const WHEEL_R = 0.405;
const WHEEL_ZS = [2.10, 1.18, 0.25, -0.81, -1.89];
const TRACK_XC = 1.32, TRACK_W = 0.58;
const TRACK_TOP_Y = 0.92;

// ---------------------------------------------------------------------------
// Turret datums (turret frame: origin on the ring centre at the roof)
// ---------------------------------------------------------------------------
/** The ring centre over the third road wheel (photos t62_1975/02, t62mv/01). */
const TURRET_PIVOT: Vec3 = [0, ROOF_Y, 0.25];
/** The cast dome: near round in plan, 2.44 m wide and 2.58 m long, rising 0.76 m as a low superellipse (fuller toward
 * the gun, rounding softly down over the rear: blind critic, photos t62_1975/02, /05, /07), its crown 60 % of
 * the way back so the front runs long and gentle to the gun and the rear drops over the fourth road wheel (photos
 * t62_1975/02, /08; the T-55's dome is taller and egg-shaped). */
const DOME = Object.freeze({ H: 0.76, cz: -0.16, side: 1.22, front: 1.54, rear: 1.04, nFront: 2.3, nRear: 2.3, vFront: 2.4, vRear: 1.8, sink: 0.03 });
/** Bore axis 1.80 m over the ground: the trunnion 0.33 m over the ring, 0.78 m ahead of its centre. */
const TRUNNION: Vec3 = [0, 1.80 - ROOF_Y, 0.78];
/** Muzzle 5.00 m ahead of the trunnion: 6.03 m hull frame, 9.33 m overall with the gun forward. */
const MUZZLE_Z = 5.00;
/** The U-5TS bore evacuator: 0.84 m long, centred two thirds of the way out (photos t62_1975/01-03). */
const EVACUATOR_Z0 = 2.88, EVACUATOR_LEN = 0.84;

/** What each family member carries of its own. */
interface T62Variant {
  readonly id: 't62_1975' | 't62mv1';
  readonly revision: string;
  /** Kontakt-1 on the turret, glacis and skirts, the rubber skirts, KTD-2 and the thermal sleeve (the 1985 rebuild). */
  readonly mv: boolean;
}
const VARIANTS: Readonly<Record<T62Variant['id'], T62Variant>> = Object.freeze({
  t62_1975: Object.freeze({ id: 't62_1975', revision: 't62-obr1975-r275', mv: false }),
  t62mv1: Object.freeze({ id: 't62mv1', revision: 't62mv-obr1985-r275', mv: true }),
});

/** The dome's plan radius toward angle `t` (radians from +Z toward +X), about its apex. */
function domePlanR(t: number): number {
  const s = Math.abs(Math.sin(t)), c = Math.cos(t);
  const front = c >= 0, n = front ? DOME.nFront : DOME.nRear, b = front ? DOME.front : DOME.rear;
  return (Math.pow(s / DOME.side, n) + Math.pow(Math.abs(c) / b, n)) ** (-1 / n);
}
/** The dome's plan scale at height h (1 at the base, 0 at the apex). */
/** The profile exponent toward plan angle t: the full front band, the softer rounded rear. */
const vExpAt = (t: number): number => DOME.vRear + (DOME.vFront - DOME.vRear) * (Math.cos(t) + 1) / 2;
const domeScale = (h: number, t = 0): number => {
  const v = vExpAt(t);
  return h <= 0 ? 1 : (1 - Math.min(1, h / DOME.H) ** v) ** (1 / v);
};
/** A point on the dome skin at plan angle t and height h. */
function domePoint(t: number, h: number): THREE.Vector3 {
  const r = domePlanR(t) * domeScale(h, t);
  return new THREE.Vector3(Math.sin(t) * r, h, DOME.cz + Math.cos(t) * r);
}
/** Dome height over the plan point (x, z); 0 outside the dome. */
function domeHeightAt(x: number, z: number): number {
  const dz = z - DOME.cz, t = Math.atan2(x, dz), rho = Math.hypot(x, dz) / domePlanR(t);
  const v = vExpAt(t);
  return rho >= 1 ? 0 : DOME.H * (1 - rho ** v) ** (1 / v);
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
/** Euler angles turning +Z (or +Y) onto the skin normal. */
function eulerOnto(axis: 'y' | 'z', n: THREE.Vector3): THREE.Euler {
  const from = axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  return new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(from, n));
}

/** The cast dome: an indexed shell of rings about the apex, closed by a base disc a little under the roof. */
function castDome(): THREE.BufferGeometry {
  const M = 56, K = 14;
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
      index.push(a, b, c, a, c, d);
    }
  }
  const top = heights.length - 1;
  for (let j = 0; j < M; j++) index.push(at(top, j), at(top, j + 1), apex);
  for (let j = 0; j < M; j++) index.push(at(0, j), base, at(0, j + 1));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
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
    const ea = i > 0 ? 0.004 : 0, eb = i < pts.length - 2 ? 0.004 : 0;
    const az = za - tz * ea, ay = ya - ty * ea, bz = zb + tz * eb, by = yb + ty * eb;
    const nza = ty * at(i), nya = -tz * at(i), nzb = ty * at(i + 1), nyb = -tz * at(i + 1);
    parts.push(KIT.slab(
      [x0, by + nyb, bz + nzb], [x1, by + nyb, bz + nzb], [x1, ay + nya, az + nza], [x0, ay + nya, az + nza],
      [x0, by, bz], [x1, by, bz], [x1, ay, az], [x0, ay, az]));
  }
  return KIT.mergeAll(parts);
}

// ---------------------------------------------------------------------------
// Hull
// ---------------------------------------------------------------------------

/** Hull roof height at z (the glacis forward, the engine deck falling to the rear plate). */
function hullTopY(z: number): number {
  if (z >= GLACIS_TOP_Z) return glacisY(z);
  if (z <= DECK_BREAK_Z) return ROOF_Y - (DECK_BREAK_Z - z) / (DECK_BREAK_Z - REAR_Z) * 0.09;
  return ROOF_Y;
}

/** The welded hull: the upper hull over the track runs, the lower tub inside them, both glacis plates and the slightly
 * raked rear plate; stations every 0.35 m or less so every gate slice holds real section faces. */
function addHullBody(P: TankBuilderPort): void {
  const bottom = (z: number): number => {
    if (z >= BELLY_FRONT_Z) return BELLY_Y + (z - BELLY_FRONT_Z) * LOWER_GLACIS_TAN;
    if (z <= -3.02) return BELLY_Y + (-3.02 - z) / (-3.02 - REAR_Z) * (0.66 - BELLY_Y);
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
  const upperEnd = GLACIS_TOP_Z + (ROOF_Y - (TUB_TOP_Y + 0.04)) / UPPER_GLACIS_TAN;
  P.add('hull', sectionSolid(through([REAR_Z, -3.02, DECK_BREAK_Z, GLACIS_TOP_Z, upperEnd]).map((z) => ({
    z, ring: ring(HULL_HALF_W, TUB_TOP_Y - 0.03, hullTopY(z)),
  }))));
  P.add('hull', sectionSolid(through([REAR_Z, -3.02, DECK_BREAK_Z, GLACIS_TOP_Z,
    ...[upperEnd, BELLY_FRONT_Z].sort((a, b) => a - b), NOSE_Z - 0.002]).map((z) => ({
    z, ring: ring(TUB_HALF_W, bottom(z), Math.min(hullTopY(z), TUB_TOP_Y + 0.04)),
  }))));
}

/** Fenders: flat shelves over both tracks, the curved front mudguards over the idlers and short rear flaps. Painted
 * sheet metal, not the hull's armour. */
function addFenders(P: TankBuilderPort): void {
  const { box } = KIT;
  const shelfZ0 = -3.22, shelfZ1 = 2.84;
  for (const side of [-1, 1]) {
    const x0 = HULL_HALF_W - 0.01, x1 = FENDER_OUT;
    P.add('hullFixedPaintedBodywork', box(x1 - x0, 0.03, shelfZ1 - shelfZ0), side * (x0 + x1) / 2, FENDER_Y, (shelfZ0 + shelfZ1) / 2);
  }
  // the deep rounded mudguard hoods over the idlers, crowned over the fender line (photos t62_1975/01, t62mv/01)
  const scoop: [number, number][] = [[shelfZ1 - 0.02, FENDER_Y + 0.015], [2.95, FENDER_Y + 0.06], [3.08, FENDER_Y + 0.07],
    [3.20, FENDER_Y + 0.03], [3.29, FENDER_Y - 0.06], [3.35, FENDER_Y - 0.18], [3.37, FENDER_Y - 0.28]];
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? HULL_HALF_W - 0.01 : -FENDER_OUT, x1 = side > 0 ? FENDER_OUT : -(HULL_HALF_W - 0.01);
    const s0 = side > 0 ? TUB_HALF_W - 0.01 : -FENDER_OUT, s1 = side > 0 ? FENDER_OUT : -(TUB_HALF_W - 0.01);
    P.addMudguard('t62-front-scoop', 'hullFixedPaintedBodywork', bentPlateX(scoop, s0, s1, 0.028));
    const upperEnd = GLACIS_TOP_Z + (ROOF_Y - (TUB_TOP_Y + 0.04)) / UPPER_GLACIS_TAN, cornerZ0 = upperEnd - 0.005;
    P.add('hull', box(HULL_HALF_W - TUB_HALF_W, 0.028, scoop[0][0] - cornerZ0), side * (TUB_HALF_W + HULL_HALF_W - 0.02) / 2,
      FENDER_Y + 0.001, (cornerZ0 + scoop[0][0]) / 2);
    P.add('hullFixedPaintedBodywork', bentPlateX(scoop.slice(1), side * FENDER_OUT - 0.014, side * FENDER_OUT + 0.014, [0.08, 0.12, 0.15, 0.15, 0.13, 0.10]));
    P.addMudguard('t62-rear-flap', 'hullFixedPaintedBodywork', bentPlateX([[-3.31, FENDER_Y - 0.13], [-3.28, FENDER_Y - 0.02], [shelfZ0 + 0.02, FENDER_Y + 0.015]],
      x0 + side * 0.02, x1, 0.026));
    P.add('hullFixedPaintedBodywork', box(0.012, 0.06, shelfZ1 - shelfZ0), side * (FENDER_OUT - 0.006), FENDER_Y - 0.035, (shelfZ0 + shelfZ1) / 2);
  }
}

/** Running gear: five road wheels a side, rear drive sprocket, front idler, no return rollers. */
function addRunningGear(P: TankBuilderPort): void {
  KIT.buildRunningGear(P, {
    style: 'holes', wheelR: WHEEL_R, wheelW: 0.32, wheelY: 0.45, xc: TRACK_XC, dishR: 0.86,
    wheelZs: [...WHEEL_ZS],
    sprocket: { z: -2.86, y: 0.68, r: 0.28 }, idler: { z: 2.93, y: 0.76, r: 0.26 },
    rollers: [], trackW: TRACK_W, topY: TRACK_TOP_Y, botY: 0.02,
    contactZF: WHEEL_ZS[0] + 0.21, contactZR: WHEEL_ZS[4] - 0.21,
    paintedEnds: true, coveredTop: false, arms: true, sprocketTeeth: true,
  });
}

/** Glacis, nose and driver's station: the splash board, the headlight pair, tow hooks, the driver's hatch at the left. */
function addHullFront(P: TankBuilderPort, v: T62Variant): void {
  const { box, cylY, cylZ, torus } = KIT;
  const tilt = -Math.atan(UPPER_GLACIS_TAN);
  // splash board across the plate (on the MV the Kontakt-1 field covers the plate above it)
  {
    const z = v.mv ? 2.92 : 2.62, y = glacisY(z);
    P.add('hull', box(1.96, 0.12, 0.025), 0, y + 0.05, z - 0.01, -0.10, 0, 0);
    for (const x of [-0.96, 0.96]) P.add('hullDetail', box(0.03, 0.09, 0.11), x, y + 0.035, z - 0.045, tilt, 0, 0);
  }
  // headlights on brackets at both front corners of the upper plate (white lamp right, the IR lamp beside it)
  for (const [x, ir] of [[-0.86, false], [-0.70, true], [0.86, false]] as const) {
    const z = LAMP_Z, y = glacisY(z) + 0.09;
    P.add('hullDetail', box(0.10, 0.10, 0.06), x, y - 0.065, z - 0.03, tilt, 0, 0);
    KIT.headlight(P, x, y, z, 0, ir ? 0.062 : 0.055, !ir);
    if (ir) P.add('hullDark', cylZ(0.052, 0.012, 14), x, y, z + 0.085);
  }
  // tow hooks low on the upper plate and the lower plate's recovery eyes
  for (const x of [-0.66, 0.66]) {
    const z = 3.06, y = glacisY(z);
    // on the MV the Kontakt-1 field covers the upper plate's hooks
    if (!v.mv) {
      P.add('hullDetail', box(0.16, 0.06, 0.12), x, y + 0.02, z, tilt, 0, 0);
      P.add('hullDark', torus(0.06, 0.017, 12), x, y + 0.075, z + 0.02, Math.PI / 2 + tilt, 0, 0);
    }
    P.add('hullDetail', box(0.14, 0.12, 0.08), x * 1.25, 0.66, BELLY_FRONT_Z + (0.66 - BELLY_Y) / LOWER_GLACIS_TAN + 0.02);
  }
  // driver's hatch at the front left of the roof, opening to the left, two periscopes ahead of it
  {
    const x = 0.55, z = 1.86;
    // a low dished plate on a thin ring, near flush: the dome's front edge passes over it (the turret seat reads the
    // deck under its sweep, and a proud lid lifted the whole turret off the roof)
    P.add('hullDetail', cylY(0.27, 0.28, 0.012, P.q ? 24 : 14), x, ROOF_Y + 0.004, z);
    P.addHatch('hull', cylY(0.235, 0.24, 0.016, P.q ? 24 : 14), x, ROOF_Y + 0.010, z);
    P.add('hullDark', box(0.10, 0.04, 0.12), x + 0.25, ROOF_Y + 0.04, z);
    // the periscope heads stand low in the roof: the gun passes 3 cm over them at its 6-degree front depression
    KIT.periscope(P, 'hullDetail', x - 0.08, ROOF_Y + 0.015, z + 0.27);
    KIT.periscope(P, 'hullDetail', x + 0.10, ROOF_Y + 0.015, z + 0.27);
  }
  // the front lift eyes sunk to a low loop under the gun's sweep (as the rear pair, t54Family.ts)
  for (const x of [-0.95, 0.95]) KIT.liftEye(P, 'hullDetail', x, ROOF_Y - 0.045, 1.98);
}

/** Fender stowage: three flat external fuel tanks and the oil tank on the right fender joined by a pipe; on the left,
 * stowage boxes, the tool box, the exhaust outlet over the rear wheels and a run of spare links on the front shelf. */
function addFenderStowage(P: TankBuilderPort): void {
  const { box, cylZ, cylY } = KIT;
  const yb = FENDER_Y + 0.015, xc = (HULL_HALF_W + FENDER_OUT) / 2 + 0.005, w = 0.46;
  const tanks: [number, number][] = [[1.62, 0.80], [0.66, -0.20], [-0.34, -1.20], [-1.36, -2.00]];
  for (const [z1, z0] of tanks) {
    const h = 0.25;
    const ring: SectionPoint[] = [];
    for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; ring.push([-xc + w / 2 - 0.07 + Math.cos(a) * 0.07, yb + h - 0.07 + Math.sin(a) * 0.07]); }
    for (let i = 0; i <= 4; i++) { const a = Math.PI / 2 + (i / 4) * Math.PI / 2; ring.push([-xc - w / 2 + 0.07 + Math.cos(a) * 0.07, yb + h - 0.07 + Math.sin(a) * 0.07]); }
    ring.push([-xc - w / 2, yb], [-xc + w / 2, yb]);
    P.addEquipment('hullDetail', sectionSolid([{ z: z0, ring }, { z: z0 + 0.03, ring }, { z: z1 - 0.03, ring }, { z: z1, ring }].map((st, k) => (
      k === 0 || k === 3 ? { z: st.z, ring: ring.map(([x, y]) => [-xc + (x + xc) * 0.94, yb + (y - yb) * 0.94] as const) } : st))));
    P.addEquipment('hullDark', cylY(0.035, 0.035, 0.03, 10), -xc - 0.11, yb + h + 0.012, z1 - 0.12);
    for (const z of [z0 + 0.12, z1 - 0.12]) P.addEquipment('hullDark', box(w + 0.02, 0.02, 0.035), -xc, yb + h * 0.55, z);
  }
  P.addEquipment('hullDark', cylZ(0.016, 3.55, 8), -(HULL_HALF_W + 0.04), yb + 0.20, -0.20);
  const boxes: [number, number, number][] = [[1.66, 0.96, 0.22], [0.82, -0.10, 0.25], [-0.24, -1.16, 0.21], [-2.62, -3.16, 0.22]];
  for (const [z1, z0, h] of boxes) {
    P.addEquipment('hullDetail', box(w, h, z1 - z0), xc, yb + h / 2, (z0 + z1) / 2);
    P.addEquipment('hullDetail', box(w + 0.012, 0.016, z1 - z0 + 0.012), xc, yb + h + 0.004, (z0 + z1) / 2);
    P.addEquipment('hullDark', box(0.016, 0.012, z1 - z0 - 0.06), xc - w / 2 + 0.02, yb + h + 0.014, (z0 + z1) / 2);
    for (const dz of [-0.18, 0.18]) P.addEquipment('hullDark', box(0.05, 0.05, 0.016), xc + w / 2 - 0.002, yb + h - 0.05, (z0 + z1) / 2 + dz);
  }
  // exhaust outlet over the fourth/fifth wheels: a louvred box opening outboard
  {
    const z = -1.88, len = 0.78, h = 0.27;
    P.add('hullDetail', box(0.42, h, len), xc + 0.02, yb + h / 2, z);
    P.add('hullDark', box(0.02, h - 0.08, len - 0.12), xc + 0.232, yb + h / 2, z);
    for (const k of KIT.grilleIndices(P.q, 5, 3)) P.add('hullDetail', box(0.03, 0.022, len - 0.14), xc + 0.24, yb + 0.06 + k * 0.035, z);
  }
  KIT.spareTrackStrip(P, 'hull', xc, yb + 0.03, 2.30, 3, 0, 0);
}

/** Engine deck louvres, the rear drums on their brackets, the unditching log, tail lamps and tow hooks. */
function addHullRear(P: TankBuilderPort): void {
  const { box, cylX, cylZ, torus } = KIT;
  // engine deck: the transverse air-intake louvres behind the turret, the two radiator grilles and the rear grille
  P.add('hullDark', box(1.80, 0.012, 0.36), 0, ROOF_Y + 0.004, -1.32);
  for (const k of KIT.grilleIndices(P.q, 5, 3)) P.add('hullDetail', box(1.74, 0.016, 0.04), 0, ROOF_Y + 0.012, -1.18 - k * 0.07);
  for (const x of [-0.47, 0.47]) {
    P.add('hullDark', box(0.84, 0.014, 0.98), x, ROOF_Y + 0.004, -2.18);
    for (const k of KIT.grilleIndices(P.q, 7, 4)) P.add('hullDetail', box(0.80, 0.018, 0.05), x, ROOF_Y + 0.012, -1.76 - k * 0.14);
  }
  const slope = Math.atan(0.09 / (DECK_BREAK_Z - REAR_Z));
  P.add('hullDark', box(1.76, 0.012, 0.40), 0, hullTopY(-3.04) + 0.004, -3.04, slope, 0, 0);
  for (const k of KIT.grilleIndices(P.q, 3, 2)) P.add('hullDetail', box(1.70, 0.016, 0.04), 0, hullTopY(-2.92 - k * 0.12) + 0.012, -2.92 - k * 0.12, slope, 0, 0);
  // two 200 L drums across the stern on raked brackets
  const drumY = 1.38, drumZ = -3.56, drumR = 0.29, drumX = 0.58, drumL = 0.88;
  for (const s of [-1, 1]) {
    P.addEquipment('hull', cylX(drumR, drumL, P.q ? 20 : 12), s * drumX, drumY, drumZ);
    for (const e of [-drumL / 2 + 0.01, drumL / 2 - 0.01]) P.addEquipment('hullDark', cylX(drumR + 0.006, 0.018, P.q ? 20 : 12), s * drumX + e, drumY, drumZ);
    P.addEquipment('hullDark', cylX(drumR + 0.004, 0.014, P.q ? 20 : 12), s * drumX, drumY, drumZ);
    P.addEquipment('hullDark', box(0.04, 0.03, 0.64), s * drumX, drumY + drumR + 0.01, drumZ);
    for (const dx of [-0.26, 0.26]) {
      P.addEquipment('hullDetail', box(0.07, 0.34, 0.07), s * drumX + dx, drumY - 0.32, REAR_Z - 0.08, 0.42, 0, 0);
      P.addEquipment('hullDetail', box(0.07, 0.06, 0.48), s * drumX + dx, drumY - drumR - 0.02, drumZ + 0.11);
    }
  }
  // the unditching log under the drums, strapped across the rear plate
  {
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 1.90, r: 0.10, straps: 2, seed: 5 });
    log.position.set(0, 1.05, REAR_Z - 0.14);
    P.hullG.add(log);
    for (const s of [-1, 1]) P.add('hullDetail', box(0.08, 0.20, 0.14), s * 0.72, 1.05, REAR_Z - 0.06);
  }
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.10, 0.08, 0.06), s * 0.92, 1.30, REAR_Z - 0.02);
    P.add('hullDark', torus(0.07, 0.018, 12), s * 0.70, 0.66, -3.22, Math.PI / 2 - 0.4, 0, 0);
    P.add('hullDetail', box(0.12, 0.10, 0.08), s * 0.70, 0.74, -3.16);
  }
  P.add('hullDetail', box(0.90, 0.36, 0.02), 0, 0.86, REAR_Z - 0.003);
  for (const x of [-0.95, 0.95]) KIT.liftEye(P, 'hullDetail', x, ROOF_Y - 0.03, -2.70);
  P.add('hullDark', box(2.26, 0.010, 0.02), 0, ROOF_Y + 0.002, DECK_BREAK_Z);
  P.add('hullDetail', cylZ(0.11, 0.02, 14), -0.50, ROOF_Y + 0.004, -0.88, Math.PI / 2, 0, 0);
}

// ---------------------------------------------------------------------------
// T-62MV hull kit: rubber skirts and Kontakt-1
// ---------------------------------------------------------------------------

/** One Kontakt-1 (4S20) container: a flat steel box with its bolted lid (owner-local transform). */
function kontaktBlock(P: TankBuilderPort, owner: 'hull' | 'turret', zone: string, at: Vec3, rot: Vec3,
  size: Vec3 = [0.26, 0.075, 0.16], outward: Vec3 = [0, 1, 0]): void {
  const [w, h, d] = size;
  P.destructibleCluster(zone, () => {
    P.addExternalArmor(owner, markEraHitFaces(KIT.box(w, h, d), outward), ...at, ...rot);
    const lid = markEraFurniture(KIT.box(w * 0.90, 0.010, d * 0.86));
    lid.translate(0, h / 2 + 0.004, 0);
    lid.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)));
    P.addExternalArmor(owner, lid, ...at);
    for (const bx of [-w * 0.38, w * 0.38]) {
      const bolt = markEraFurniture(KIT.cylY(0.012, 0.012, 0.012, 6));
      bolt.translate(bx, h / 2 + 0.012, 0);
      bolt.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)));
      P.addExternalArmor(owner, bolt, ...at);
    }
  });
}

/** The glacis Kontakt-1 field (photos t62mv/01, /06): six straight rows across the upper plate, four blocks a side of
 * the centreline in aligned columns, each block lying on the plate with its front edge tipped up so the rows overlap as
 * shingles; the top rows leave the headlights clear. Below the nose edge a rail carries a row of twelve blocks hanging
 * down in front of the lower plate. Each side is one removable field. */
function addGlacisKontakt(P: TankBuilderPort): void {
  const tilt = -Math.atan(UPPER_GLACIS_TAN), tip = 0.22;
  const [w, h, d] = [0.23, 0.075, 0.18];
  // the rear edge rests on the plate, the front edge stands d * sin(tip) proud of it
  const lift = (h / 2) / Math.cos(tip) + (d / 2) * Math.sin(tip);
  // six rows from the headlights down to the nose rail
  const rows = [2.32, 2.49, 2.66, 2.83, 3.00, 3.17];
  // the outer column ends 0.985 m out, inside the tracks' inner edge (1.03) where they climb the idlers under the nose
  const cols = [0.13, 0.38, 0.63, 0.87];
  for (const side of [-1, 1]) {
    const zone = `glacis_era_${side < 0 ? 'L' : 'R'}`;
    // the headlights at the plate's top corners (addHullFront): the right side carries two lamps, the left one
    const lampXs = side < 0 ? [0.86, 0.70] : [0.86];
    for (const z of rows) {
      for (const c of cols) {
        if (Math.abs(z - LAMP_Z) < d / 2 + 0.05 && lampXs.some((lx) => Math.abs(lx - c) < w / 2 + 0.06)) continue;
        // lifted along the plate's normal; an x rotation of +30 degrees lays a block on the plate (its front edge down),
        // less the tip lifts that edge
        kontaktBlock(P, 'hull', zone, [side * c, glacisY(z) + lift * Math.cos(-tilt), z + lift * Math.sin(-tilt)],
          [-tilt - tip, 0, 0], [w, h, d]);
      }
    }
    // the nose row: six a side hanging from the rail below the nose edge, their feet tucked back toward the lower plate
    for (let k = 0; k < 6; k++) {
      const x = side * (0.09 + k * 0.17);
      kontaktBlock(P, 'hull', zone, [x, NOSE_Y - 0.115, NOSE_Z + 0.03], [0.26, 0, 0], [0.155, 0.25, 0.075], [0, 0, 1]);
    }
    P.add('hullDark', KIT.box(1.04, 0.04, 0.06), side * 0.52, NOSE_Y - 0.005, NOSE_Z + 0.035);
  }
}

/** Side screens over the front of each track run carrying a Kontakt-1 grid five rows deep (photo t62mv/01). */
function addRubberSkirts(P: TankBuilderPort): void {
  // the side screen covers the front of the run only, to wheel 2, hanging to hub height; the rear wheels stand bare
  // (photo t62mv/01)
  const z0 = 1.02, z1 = 2.74, sections = 3, seam = 0.012, top = FENDER_Y - 0.01, foot = 0.50, t = 0.016;
  for (const side of [-1, 1]) {
    const x = side * (FENDER_OUT + t / 2 + 0.002);
    const step = (z1 - z0 + seam) / sections;
    for (let k = 0; k < sections; k++) {
      const a = z0 + k * step, b = a + step - seam;
      // painted rubber, as the exhibit's: the hull's camouflage, not black rubber
      P.addMudguard('t62mv-skirt', 'hullFixedPaintedBodywork', KIT.box(t, top - foot, b - a), x, (top + foot) / 2, (a + b) / 2);
      P.addEquipment('hullDark', KIT.box(t + 0.008, 0.035, b - a - 0.02), x, top - 0.03, (a + b) / 2);
    }
    const zone = `skirt_era_${side < 0 ? 'L' : 'R'}`;
    const outX = side * (FENDER_OUT + t + 0.040);
    // five rows deep, six blocks a row
    for (const y of [1.04, 0.915, 0.79, 0.665, 0.54]) {
      for (let k = 0; k < 6; k++) {
        const z = 2.58 - k * 0.29;
        kontaktBlock(P, 'hull', zone, [outX, y, z], [0, 0, side * 0.06], [0.075, 0.12, 0.27], [side, 0, 0]);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Turret
// ---------------------------------------------------------------------------

const T62_SKIN: DomeSkin = { point: domePoint, normal: domeNormal };

const skinAt = (x: number, z: number): number => domeHeightAt(x, z);

/** The commander's cupola on the left with its OU-3GK IR spotlight at the front of the ring. */
function addCommanderCupola(P: TankBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  const x = 0.52, z = -0.22, base = skinAt(x, z) - 0.03, seg = P.q ? 28 : 14;
  P.addCupola('turret', cylY(0.30, 0.32, 0.17, seg), x, base + 0.085, z);
  P.add('turretDetail', cylY(0.345, 0.345, 0.022, seg), x, base + 0.04, z);
  for (const a of [-0.8, -0.27, 0.27, 0.8]) {
    const px = x + Math.sin(a) * 0.29, pz = z + Math.cos(a) * 0.29;
    P.addModuleVisual('optics', 'turretDetail', box(0.12, 0.06, 0.07), px, base + 0.14, pz, 0, a, 0);
    P.addModuleVisual('optics', 'turretGlass', box(0.09, 0.022, 0.072), px, base + 0.142, pz + 0.002, 0, a, 0);
  }
  const lidY = base + 0.17;
  P.addHatch('turret', cylY(0.26, 0.27, 0.04, seg), x, lidY + 0.02, z);
  P.add('turretDark', box(0.06, 0.03, 0.10), x + 0.25, lidY + 0.02, z - 0.08);
  // TKN-3 day/night sight housing at the front of the lid
  P.addModuleVisual('optics', 'turretDetail', box(0.20, 0.14, 0.24), x, lidY + 0.10, z + 0.14);
  P.addModuleVisual('optics', 'turretGlass', box(0.14, 0.05, 0.012), x, lidY + 0.11, z + 0.262);
  // OU-3GK IR spot on a short post at the ring's front
  P.add('turretDetail', box(0.05, 0.10, 0.05), x - 0.10, base + 0.21, z + 0.30);
  P.add('turretDetail', cylZ(0.085, 0.14, 16), x - 0.10, base + 0.30, z + 0.32);
  P.add('turretDark', cylZ(0.090, 0.012, 16), x - 0.10, base + 0.30, z + 0.395);
  P.add('turretGlass', markVehicleNightLens(cylZ(0.070, 0.006, 16), 'headlight', { searchlight: true }), x - 0.10, base + 0.30, z + 0.402);
}

/** The loader's hatch on the right with the DShKM ring mount. */
function addLoaderHatch(P: TankBuilderPort): { x: number; z: number; top: number } {
  const { box, cylY } = KIT;
  const x = -0.56, z = -0.30, base = skinAt(x, z) - 0.02, seg = P.q ? 28 : 14;
  P.add('turretDetail', cylY(0.33, 0.34, 0.05, seg), x, base + 0.025, z);
  P.addHatch('turret', cylY(0.28, 0.285, 0.035, seg), x, base + 0.065, z);
  P.add('turretDark', box(0.08, 0.035, 0.12), x - 0.29, base + 0.06, z);
  P.add('turretDetail', KIT.torus(0.36, 0.018, P.q ? 32 : 16), x, base + 0.075, z);
  return { x, z, top: base + 0.09 };
}

function addTurretRoof(P: TankBuilderPort, v: T62Variant): void {
  const { box, cylY, cylZ, sph } = KIT;
  addCommanderCupola(P);
  const loader = addLoaderHatch(P);
  // the loader's 12.7 mm DShKM on its ring, barrel forward
  {
    const dshk = FITTINGS.pintleMG({
      mats: P.mats, cls: 'dshk', scale: 1.05, tone: 'two-tone', elev: 0.04,
      ammo: true, shield: false, working: true, ridingCradle: true, seed: 6,
    });
    dshk.name = 't62RoofDShKM';
    dshk.userData.cupolaSeat = 'loader';
    dshk.position.set(loader.x, loader.top - 0.01, loader.z + 0.32);
    P.turretG.add(dshk);
    P.add('turretDetail', box(0.10, 0.03, 0.10), loader.x, loader.top - 0.02, loader.z + 0.32);
  }
  // the ventilator dome between the hatches
  {
    const x = -0.08, z = -0.62, base = skinAt(x, z) - 0.02;
    P.add('turret', cylY(0.13, 0.14, 0.05, P.q ? 20 : 12), x, base + 0.025, z);
    P.add('turret', KIT.xform(sph(0.15, P.q ? 20 : 12, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.42, 1]), x, base + 0.05, z);
  }
  // gunner's sight aperture left of the gun: the hooded TSh2B-41 port low in the casting's front
  {
    const t = 18 * D2R, h = 0.36, p = domePoint(t, h), n = domeNormal(t, h), e = eulerOnto('z', n);
    const hood = p.clone().addScaledVector(n, 0.004);
    P.add('turretDetail', box(0.20, 0.13, 0.06), hood.x, hood.y + 0.02, hood.z, e.x, e.y, e.z);
    const slit = p.clone().addScaledVector(n, 0.034);
    P.addModuleVisual('optics', 'turretGlass', box(0.12, 0.05, 0.008), slit.x, slit.y + 0.02, slit.z, e.x, e.y, e.z);
  }
  // gunner's and loader's periscopes
  for (const [x, z, a] of [[0.34, 0.30, 0.15], [-0.86, -0.02, -0.35]] as const) {
    KIT.periscope(P, 'turretDetail', x, skinAt(x, z) + 0.01, z, a);
  }
  // radio antenna base at the left rear
  {
    const x = 0.74, z = -0.92;
    P.add('turretDetail', cylY(0.055, 0.07, 0.06, 10), x, skinAt(x, z) + 0.01, z);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 0.80, r: 0.016, rake: -0.10, seed: 3 });
    whip.name = 't62RadioWhip';
    whip.position.set(x, skinAt(x, z) + 0.04, z);
    P.turretG.add(whip);
  }
  // the spent-case ejection hatch low in the turret rear, and the OPVT snorkel tube stowed across the rear
  {
    const t = Math.PI + 12 * D2R, h = 0.22, p = domePoint(t, h), n = domeNormal(t, h), e = eulerOnto('z', n);
    const at = p.clone().addScaledVector(n, 0.012);
    P.add('turretDetail', box(0.40, 0.26, 0.03), at.x, at.y, at.z, e.x, e.y, e.z);
    P.add('turretDark', box(0.36, 0.012, 0.035), at.x, at.y + 0.135, at.z, e.x, e.y, e.z);
  }
  {
    const z = DOME.cz - DOME.rear - 0.08, y = 0.30, len = v.mv ? 1.70 : 1.90;
    P.addEquipment('turretDetail', KIT.cylX(0.105, len, P.q ? 18 : 10), 0, y, z);
    for (const s of [-1, 1]) {
      const bx = s * len * 0.34, bz = DOME.cz - DOME.rear * domeScale(y, Math.PI) * 0.98;
      P.addEquipment('turretDark', box(0.06, 0.05, z - bz - 0.02 + 0.13), bx, y - 0.05, (z + bz) / 2 - 0.02);
      P.addEquipment('turretDark', KIT.torus(0.11, 0.012, P.q ? 18 : 10).rotateY(Math.PI / 2), bx, y, z);
    }
    P.addEquipment('turretDark', cylZ(0.10, 0.02, P.q ? 18 : 10).rotateY(Math.PI / 2), -len / 2 - 0.005, y, z);
  }
  for (const [x, z] of [[0.92, 0.36], [-0.95, -0.62], [0.36, -1.16]] as const) {
    KIT.liftEye(P, 'turretDetail', x, skinAt(x, z) - 0.005, z, Math.atan2(x, z - DOME.cz));
  }
}

/** The canvas-covered mantlet slot: a pleated canvas bag over the gun's slot through the casting (gun frame). */
function addMantletCover(P: TankBuilderPort): void {
  const { cylZ } = KIT;
  // a short bulbous boot (photo t62_1975/08; blind critic: the long cone read sharp)
  const stations: [number, number, number][] = [[0.04, 0.56, 0.56], [0.44, 0.58, 0.56], [0.60, 0.48, 0.46],
    [0.74, 0.32, 0.31], [0.84, 0.235, 0.235]];
  const n = P.q ? 20 : 12;
  const ring = (w: number, h: number): SectionPoint[] => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * w / 2, Math.sin(a) * h / 2] as const;
  });
  P.add('gunMountCanvasSkin', sectionSolid(stations.map(([z, w, h]) => ({ z, ring: ring(w, h) })),
    { smoothSideEdges: Array.from({ length: n }, (_, i) => i) }));
  for (const [z, w, h] of stations.slice(2, -1)) {
    P.add('gunMountCloth', KIT.xform(cylZ(0.5, 0.03, n), 0, 0, 0, 0, 0, 0, [w + 0.014, h + 0.014, 1]), 0, 0, z);
  }
  P.addGunExtraDark(cylZ(0.122, 0.035, n), 0, 0, 0.825);
  P.add('gunMount', cylZ(0.13, 0.20, n), 0, 0, 0.18);
  // the coaxial PKT's port in the cover, right of the gun
  P.addGunExtraDark(cylZ(0.022, 0.08, 10), -0.19, -0.03, 0.56);
}

/** 115 mm U-5TS smoothbore: the tube tapers from the cover to the bore evacuator two thirds of the way out, then on to a
 * plain muzzle. The MV's thermal sleeve wraps the tube either side of the evacuator in banded sections. */
function addMainGun(P: TankBuilderPort, v: T62Variant): void {
  const e0 = EVACUATOR_Z0, e1 = EVACUATOR_Z0 + EVACUATOR_LEN;
  if (v.mv) {
    const r = 0.112;
    tubeGun(P, [
      [0.30, 1.04, 0.125, 0.130], [1.04, e0 - 0.04, r, r], [e0 - 0.04, e0 + 0.03, 0.132, r],
      [e0 + 0.03, e1 - 0.03, 0.132, 0.132], [e1 - 0.03, e1 + 0.04, 0.108, 0.132],
      [e1 + 0.04, MUZZLE_Z - 0.10, 0.104, 0.104], [MUZZLE_Z - 0.10, MUZZLE_Z, 0.086, 0.086],
    ], { rings: [[1.65, r + 0.005], [2.30, r + 0.005], [e1 + 0.55, 0.109], [MUZZLE_Z - 0.12, 0.109]], muzzle: MUZZLE_Z });
  } else {
    tubeGun(P, [
      [0.30, 1.04, 0.115, 0.128], [1.04, 2.00, 0.098, 0.115], [2.00, e0 - 0.05, 0.090, 0.098],
      [e0 - 0.05, e0 + 0.03, 0.132, 0.090], [e0 + 0.03, e1 - 0.03, 0.132, 0.132], [e1 - 0.03, e1 + 0.05, 0.088, 0.132],
      [e1 + 0.05, MUZZLE_Z - 0.06, 0.084, 0.088], [MUZZLE_Z - 0.06, MUZZLE_Z, 0.090, 0.090],
    ], { rings: [[e0 + 0.06, 0.135], [e1 - 0.06, 0.135]], muzzle: MUZZLE_Z });
  }
  muzzleBore(P, { r: 0.058 });
}

/** The laser rangefinder box over the gun on the mantlet (gun frame): the KTD-1 (obr. 1975), the larger KTD-2 (MV). */
function addRangefinder(P: TankBuilderPort, v: T62Variant): void {
  const { box, cylZ } = KIT;
  const [w, h, d] = v.mv ? [0.44, 0.27, 0.48] : [0.36, 0.22, 0.40];
  const y = 0.29 + h / 2 - 0.11, z = 0.66;
  P.add('gunMount', box(0.18, y - h / 2 - 0.10, 0.20), 0, (y - h / 2 + 0.10) / 2, z - 0.06);   // the post on the cradle
  P.add('gunMount', box(w, h, d), 0, y, z);
  P.add('gunMountDark', box(w + 0.012, 0.016, d + 0.012), 0, y + h / 2 + 0.004, z);
  for (const dx of [-w * 0.24, w * 0.24]) {
    P.add('gunMountDark', cylZ(0.055, 0.03, 14), dx, y + 0.01, z + d / 2 + 0.012);
    P.add('gunMountGlass', cylZ(0.043, 0.006, 14), dx, y + 0.01, z + d / 2 + 0.028);
  }
  if (v.mv) {
    // KTD-2's armoured visor over the apertures and its side cable boss
    P.add('gunMount', box(w + 0.02, 0.025, 0.10), 0, y + h / 2 - 0.01, z + d / 2 + 0.04, -0.25, 0, 0);
    P.add('gunMountDark', cylZ(0.04, 0.12, 10), -w / 2 - 0.03, y - 0.04, z - 0.08);
  }
}

/** The L-2G "Luna" IR searchlight right of the gun on a bracket from the cradle, slaved in elevation (gun frame); the MV
 * raises it level with the KTD-2 box beside it (photos t62mv/02-03). */
function addSearchlight(P: TankBuilderPort, v: T62Variant): void {
  const { box, cylZ } = KIT;
  const r = 0.175, x = -0.58, y = v.mv ? 0.44 : 0.32, z = 0.56;
  const armEnd = x + 0.06, armLen = -0.12 - armEnd + 0.03;
  P.add('gunMountLamp', box(armLen, 0.06, 0.10), -0.12 - armLen / 2, 0.12, 0.62);
  P.add('gunMountLamp', box(0.06, y - r - 0.12, 0.08), x + 0.06, (y - r + 0.12) / 2, z + 0.06);
  P.add('gunMountLamp', box(0.06, 0.12, 0.10), x, y - r - 0.03, z - 0.02);
  P.add('gunMountLamp', cylZ(r, 0.28, P.q ? 20 : 12), x, y, z);
  P.add('gunMountDark', cylZ(r + 0.008, 0.025, P.q ? 20 : 12), x, y, z + 0.145);
  P.add('gunMountGlass', markVehicleNightLens(cylZ(r - 0.02, 0.008, P.q ? 20 : 12), 'headlight', { searchlight: true }), x, y, z + 0.16);
  P.add('gunMountDark', cylZ(r * 0.72, 0.03, 12), x, y, z - 0.155);
}

/** The MV's turret Kontakt-1 (photos t62mv/01-03): two tiers of upright blocks round the front half of the casting, ten
 * columns on the left cheek, six on the right beside the searchlight, the lower tier standing near vertical on brackets
 * and the upper tier leaning back on the dome, and a flat row along the front edge of the roof. */
function addTurretKontakt(P: TankBuilderPort): void {
  const W = 0.15, GAP = 0.012;
  /** A block's width along the ring's horizontal tangent, its thickness along the given outward normal. */
  const seat = (t: number, h: number, lean: number, off: number): { at: THREE.Vector3; rot: Vec3 } => {
    const p = domePoint(t, h), skin = domeNormal(t, h);
    const radial = new THREE.Vector3(skin.x, 0, skin.z).normalize();
    const n = radial.clone().lerp(skin, lean).normalize();
    const u = domePoint(t + 1e-3, h).sub(p).normalize();
    const w = new THREE.Vector3().crossVectors(u, n).normalize();
    const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, n, w));
    return { at: p.addScaledVector(skin, off), rot: [e.x, e.y, e.z] };
  };
  // tiers: skin height, lean from upright toward the skin (0 upright, 1 on the skin), block height, stand-off
  const tiers = [[0.20, 0.15, 0.27, 0.10], [0.45, 0.55, 0.25, 0.085]] as const;
  for (const side of [-1, 1]) {
    const zone = `turret_era_${side < 0 ? 'L' : 'R'}`;
    // the left cheek (+X, the commander's side) is clear from the gun slot; the right starts outboard of the searchlight
    const [a0, cols] = side > 0 ? [25, 10] : [40, 6];
    for (const [h, lean, bh, off] of tiers) {
      let t = a0 * D2R;
      for (let k = 0; k < cols; k++) {
        const { at, rot } = seat(side * t, h, lean, off);
        kontaktBlock(P, 'turret', zone, [at.x, at.y, at.z], rot, [W, 0.11, bh], [0, 1, 0]);
        const step = domePoint(t, h).distanceTo(domePoint(t + 0.01, h)) / 0.01;
        t += (W + GAP) / step;
      }
    }
    // the roof's front-edge row: blocks lying on the dome ahead of the hatches
    let t = (side > 0 ? 22 : 34) * D2R;
    for (let k = 0; k < (side > 0 ? 6 : 3); k++) {
      const { at, rot } = seat(side * t, 0.61, 1, 0.04);
      kontaktBlock(P, 'turret', zone, [at.x, at.y, at.z], rot, [0.17, 0.075, 0.22], [0, 1, 0]);
      const step = domePoint(t, 0.61).distanceTo(domePoint(t + 0.01, 0.61)) / 0.01;
      t += 0.185 / step;
    }
  }
}

function buildFamilyTurret(P: TankBuilderPort, v: T62Variant): void {
  P.turretG.position.set(...TURRET_PIVOT);
  P.gunG.position.set(...TRUNNION);
  P.add('turret', castDome());
  addTurretRail(P, T62_SKIN, 0.30, 50 * D2R, 140 * D2R);
  addTurretRail(P, T62_SKIN, 0.30, -50 * D2R, -140 * D2R);
  addTurretRoof(P, v);
  addMantletCover(P);
  addMainGun(P, v);
  addRangefinder(P, v);
  addSearchlight(P, v);
  if (v.mv) addTurretKontakt(P);
  const num = P.spec.visual.number || '';
  for (const side of [-1, 1]) {
    const t = side * 112 * D2R, h = 0.34, p = domePoint(t, h).addScaledVector(domeNormal(t, h), 0.008);
    P.decal('turret', 'number', num, 0.24, [p.x, p.y, p.z], side * Math.PI / 2);
  }
  P.topY = 0.94;
}

function buildT62Family(P: TankBuilderPort, v: T62Variant): void {
  addHullBody(P);
  addFenders(P);
  addRunningGear(P);
  addHullFront(P, v);
  addFenderStowage(P);
  addHullRear(P);
  if (v.mv) {
    addGlacisKontakt(P);
    addRubberSkirts(P);
  }
  buildFamilyTurret(P, v);
  P.hullG.userData.t62FamilyReceipt = Object.freeze({
    variant: v.id, revision: v.revision,
    hullBodyM: Object.freeze({ rearZ: REAR_Z, noseZ: NOSE_Z, halfWidth: HULL_HALF_W, tubHalfWidth: TUB_HALF_W, roofY: ROOF_Y, bellyY: BELLY_Y }),
    widthM: FENDER_OUT * 2, upperGlacisDegFromLevel: 30,
    roadWheelStations: WHEEL_ZS.length, roadWheelDiameterM: WHEEL_R * 2,
    roadWheelGapsM: Object.freeze(WHEEL_ZS.slice(1).map((z, i) => +(WHEEL_ZS[i] - z).toFixed(3))),
    trackWidthM: TRACK_W, trackGaugeM: TRACK_XC * 2, returnRollers: 0, rearFuelDrums: 2,
    sideSkirts: v.mv ? 'rubber' : 'none', glacisEra: v.mv ? 'kontakt-1' : 'none',
  });
  P.turretG.userData.t62FamilyReceipt = Object.freeze({
    variant: v.id, revision: v.revision,
    dome: Object.freeze({ widthM: DOME.side * 2, lengthM: DOME.front + DOME.rear, heightM: DOME.H, apexZ: DOME.cz }),
    pivotLocalM: Object.freeze([...TURRET_PIVOT]), trunnionLocalM: Object.freeze([...TRUNNION]),
    muzzleLocalZ: MUZZLE_Z, evacuatorM: Object.freeze([EVACUATOR_Z0, EVACUATOR_Z0 + EVACUATOR_LEN]),
    commanderCupolaSide: 'left', loaderHatchSide: 'right', searchlightSide: 'right', coaxSide: 'right',
    rangefinder: v.mv ? 'KTD-2' : 'KTD-1', thermalSleeve: v.mv, turretEra: v.mv ? 'kontakt-1' : 'none',
    roofMachineGuns: Object.freeze(['DShKM']),
  });
}

/** T-62 obr. 1975: the 1975 production standard. */
export function buildT62Obr1975(P: TankBuilderPort): void {
  buildT62Family(P, VARIANTS.t62_1975);
}

/** T-62MV obr. 1985: the M-1-2 rebuild with Kontakt-1. */
export function buildT62MV(P: TankBuilderPort): void {
  buildT62Family(P, VARIANTS.t62mv1);
}
