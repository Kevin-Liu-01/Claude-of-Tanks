// Type 59 (WZ-120) — release 262 historical rebuild (owner 2026-10-27: "update/redesign ... type 59, turrets and hullls
// as well based on proper historical referrences so they will no longer look so chungus").
//
// The licensed T-54A as the PLA fielded it through the 1960s-70s, authored new from the reference packet
// (docs/references/tanks/type59.md §262): a 6.04 m by 3.27 m hull on a 2.64 m gauge with 580 mm track, five road wheels
// a side with the T-54 gap between the first and second, a low cast egg-shaped dome 2.16 m wide and 0.74 m over the
// roof, and the 100 mm Type 59 gun with its bore evacuator at the muzzle behind a canvas-covered mantlet slot.
//
// Sides follow the vehicle (this world's +Z hull has its LEFT at +X): the commander's cupola, the driver, the exhaust
// and the left-fender stowage sit at +X; the loader's hatch with the Type 54 12.7 mm, the coaxial MG, the later-model
// IR searchlight, the headlights and the external fuel tanks at -X. The 10%-wide obr-1975 chassis, the 0.855 rig
// scale, the skirt and turret cassettes and the oversized searchlight of the r3 refit are retired.
// Every triangle is first-party procedural geometry. Authorship: Kevin B. Liu (NOTICE.md).

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
const BELLY_Y = 0.43;
/** Hull roof and the turret-ring plane (side photo: 1.45 m, the Type 69 print 1.45-1.48). */
const ROOF_Y = 1.45;
/** Hull side plates between the tracks (the track's inner edge stands at 2.64 / 2 - 0.29 = 1.03). */
const HULL_HALF_W = 0.99;
/** Fender shelf over the tracks, to the 3.27 m width (side photo: its top 1.14-1.17 m). */
const FENDER_Y = 1.15, FENDER_OUT = 1.635;
/** Nose: the 60-degree (from vertical) upper glacis meets the 55-degree lower plate. */
const NOSE_Z = 2.90, NOSE_Y = 0.80;
const UPPER_GLACIS_TAN = Math.tan(30 * D2R), LOWER_GLACIS_TAN = Math.tan(35 * D2R);
const GLACIS_TOP_Z = NOSE_Z - (ROOF_Y - NOSE_Y) / UPPER_GLACIS_TAN;
const BELLY_FRONT_Z = NOSE_Z - (NOSE_Y - BELLY_Y) / LOWER_GLACIS_TAN;
const REAR_Z = -3.00;
/** Upper glacis height at z. */
const glacisY = (z: number): number => ROOF_Y - (z - GLACIS_TOP_Z) * UPPER_GLACIS_TAN;

/** Running gear: five 0.78 m wheels, 0.79 m pitch, the 1.05 m first gap (side photo at the 6.04 m hull scale). */
const WHEEL_R = 0.39;
const WHEEL_ZS = [1.48, 0.43, -0.36, -1.15, -1.94];
const TRACK_XC = 1.32, TRACK_W = 0.58;

// ---------------------------------------------------------------------------
// Turret datums (turret frame: origin on the ring centre at the roof)
// ---------------------------------------------------------------------------
const TURRET_PIVOT: Vec3 = [0, ROOF_Y, 0.0];
/** The cast dome: a plan egg about an apex 0.12 m behind the ring centre, 2.16 m wide, 1.44 m to its front and 1.12 m
 * to its rear, rising 0.74 m as a superellipse (exponent 2.5: a near-vertical lower band, a flattish crown). */
const DOME = Object.freeze({ H: 0.74, cz: -0.12, side: 1.08, front: 1.44, rear: 1.12, nFront: 2.0, nRear: 2.4, vExp: 2.5, sink: 0.03 });
/** The bore leaves the dome at about mid-height (side photo: axis 1.81-1.84 m, 55% of the dome; [GS-59spec] gives a
 * 1.738 m line-of-fire height): the trunnion stands 0.36 m over the ring, 0.62 m ahead of its centre. */
const TRUNNION: Vec3 = [0, 0.36, 0.62];
/** Muzzle 5.15 m ahead of the trunnion: 5.77 m ahead of the ring, 2.87 m past the nose. */
const MUZZLE_Z = 5.15;
const EVACUATOR_LEN = 0.87;

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

/** The cast dome: an indexed shell of rings about the apex, closed by a base disc a little under the roof. */
function castDome(q: boolean): THREE.BufferGeometry {
  const M = q ? 48 : 28, K = q ? 14 : 8;
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
      // outward winding: angles run from +Z toward +X (clockwise seen from above)
      index.push(a, c, b, a, d, c);
    }
  }
  const top = heights.length - 1;
  for (let j = 0; j < M; j++) index.push(at(top, j), apex, at(top, j + 1));
  for (let j = 0; j < M; j++) index.push(at(0, j), at(0, j + 1), base);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // the bucket merge re-projects camouflage; the attribute set must match the other parts'
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** A bent plate: a polyline in (z, y), z increasing, swept across x0..x1 (x0 < x1), `t` thick on its underside. */
function bentPlateX(pts: readonly (readonly [number, number])[], x0: number, x1: number, t: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [za, ya] = pts[i], [zb, yb] = pts[i + 1];
    const len = Math.hypot(zb - za, yb - ya), tz = (zb - za) / len, ty = (yb - ya) / len;
    // inner joints overlap 4 mm so the bends close
    const ea = i > 0 ? 0.004 : 0, eb = i < pts.length - 2 ? 0.004 : 0;
    const az = za - tz * ea, ay = ya - ty * ea, bz = zb + tz * eb, by = yb + ty * eb;
    const nz = ty * t, ny = -tz * t;   // the downward normal, times the thickness
    // slab corner order: (-x,+z), (+x,+z), (+x,-z), (-x,-z); b is the forward end
    parts.push(KIT.slab(
      [x0, by + ny, bz + nz], [x1, by + ny, bz + nz], [x1, ay + ny, az + nz], [x0, ay + ny, az + nz],
      [x0, by, bz], [x1, by, bz], [x1, ay, az], [x0, ay, az]));
  }
  return KIT.mergeAll(parts);
}

// ---------------------------------------------------------------------------
// Hull
// ---------------------------------------------------------------------------

/** The welded hull body: a flat-sided tub from the inclined rear plates to the nose, roof at 1.45 m, both glacis
 * plates at their published angles; stations every 0.35 m or less so every gate slice holds real section faces. */
function addHullBody(P: TankBuilderPort): void {
  const top = (z: number): number => {
    if (z >= GLACIS_TOP_Z) return glacisY(z);
    if (z <= -2.55) return ROOF_Y - (-2.55 - z) / (-2.55 - REAR_Z) * 0.09;
    return ROOF_Y;
  };
  const bottom = (z: number): number => {
    if (z >= BELLY_FRONT_Z) return BELLY_Y + (z - BELLY_FRONT_Z) * LOWER_GLACIS_TAN;
    if (z <= -2.78) return BELLY_Y + (-2.78 - z) / (-2.78 - REAR_Z) * (0.62 - BELLY_Y);
    return BELLY_Y;
  };
  const knots = [REAR_Z, -2.78, -2.55, GLACIS_TOP_Z, BELLY_FRONT_Z, NOSE_Z - 0.002];
  const zs: number[] = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const n = Math.max(1, Math.ceil((knots[i + 1] - knots[i]) / 0.35));
    for (let k = 0; k < n; k++) zs.push(knots[i] + (knots[i + 1] - knots[i]) * k / n);
  }
  zs.push(knots.at(-1)!);
  const sections = zs.map((z) => {
    let b = bottom(z), t = top(z);
    if (t - b < 0.04) { const m = (t + b) / 2; b = m - 0.02; t = m + 0.02; }
    const c = Math.min(0.03, (t - b) / 4), w = HULL_HALF_W;
    const ring: SectionPoint[] = [[-w, b], [w, b], [w, t - c], [w - c, t], [-w + c, t], [-w, t - c]];
    return { z, ring };
  });
  P.add('hull', sectionSolid(sections));
}

/** Fenders: the flat shelves over both tracks, the curved front mudguards over the idlers (the T-54's deep scoops,
 * with a down-turned outer lip and three pressed ribs) and short rear flaps behind the sprockets. */
function addFenders(P: TankBuilderPort): void {
  const { box } = KIT;
  const shelfZ0 = -2.94, shelfZ1 = 2.56;
  KIT.fenders(P, HULL_HALF_W - 0.01, FENDER_OUT, FENDER_Y, shelfZ0, shelfZ1, 0.03);
  const scoop: [number, number][] = [[shelfZ1 - 0.02, FENDER_Y + 0.015], [2.70, FENDER_Y + 0.005], [2.82, FENDER_Y - 0.035],
    [2.91, FENDER_Y - 0.10], [2.965, FENDER_Y - 0.19], [2.98, FENDER_Y - 0.26]];
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? HULL_HALF_W - 0.01 : -FENDER_OUT, x1 = side > 0 ? FENDER_OUT : -(HULL_HALF_W - 0.01);
    P.addMudguard('type59-front-scoop', 'hull', bentPlateX(scoop, x0, x1, 0.028));
    // the scoop's outer lip turns down 0.12 m along its curve
    P.add('hull', bentPlateX(scoop.slice(1), side * FENDER_OUT - 0.014, side * FENDER_OUT + 0.014, 0.12));
    // pressed stiffening ribs along the scoop
    for (const rx of [0.25, 0.45, 0.65]) {
      const x = side * (HULL_HALF_W + rx);
      P.add('hullDetail', bentPlateX(scoop.slice(0, 5).map(([z, y]) => [z, y + 0.012] as [number, number]), x - 0.012, x + 0.012, 0.012));
    }
    // the rear flap behind the sprocket, turned down
    P.addMudguard('type59-rear-flap', 'hull', bentPlateX([[-3.03, FENDER_Y - 0.13], [-3.00, FENDER_Y - 0.02], [shelfZ0 + 0.02, FENDER_Y + 0.015]],
      x0 + side * 0.02, x1 - side * 0.0, 0.026));
    // the shelf's welded outer edge strip
    P.add('hullDark', box(0.012, 0.03, shelfZ1 - shelfZ0), side * (FENDER_OUT - 0.006), FENDER_Y - 0.02, (shelfZ0 + shelfZ1) / 2);
  }
}

/** Running gear: five road wheels a side at the T-54 stations, rear drive sprocket, front idler, no return rollers
 * (the upper run rides on the wheels). */
function addRunningGear(P: TankBuilderPort): void {
  KIT.buildRunningGear(P, {
    style: 'holes', wheelR: WHEEL_R, wheelW: 0.30, wheelY: 0.44, xc: TRACK_XC, dishR: 0.86,
    wheelZs: [...WHEEL_ZS],
    sprocket: { z: -2.68, y: 0.69, r: 0.29 }, idler: { z: 2.20, y: 0.65, r: 0.27 },
    rollers: [], trackW: TRACK_W, topY: 0.86, botY: 0.02,
    contactZF: WHEEL_ZS[0] + 0.21, contactZR: WHEEL_ZS[4] - 0.21,
    paintedEnds: true, coveredTop: false, arms: true,
  });
}

/** Glacis, nose and driver's station: the transverse splash board, the headlight pair at the right front, two tow
 * hooks low on the plate, the bow MG port right of centre and the driver's hatch with its periscopes at the left. */
function addHullFront(P: TankBuilderPort): void {
  const { box, cylY, cylZ, torus } = KIT;
  const tilt = -30 * D2R;
  // splash board: a 0.10 m vertical strip across the plate a third of the way up
  {
    const z = 2.30, y = glacisY(z);
    P.add('hull', box(1.86, 0.11, 0.025), 0, y + 0.045, z - 0.01, -0.12, 0, 0);
    for (const x of [-0.90, 0.90]) P.add('hullDetail', box(0.03, 0.08, 0.10), x, y + 0.03, z - 0.04, tilt, 0, 0);
  }
  // headlights on a bracket at the right front (white lamp and the IR driving lamp)
  for (const [x, ir] of [[-0.72, false], [-0.86, true]] as const) {
    const z = 2.56, y = glacisY(z) + 0.10;
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
    const z = 2.10, y = glacisY(z);
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
    const h = 0.24, len = z1 - z0;
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
  for (const x of [-0.45, 0.45]) {
    P.add('hullDark', box(0.80, 0.014, 1.00), x, ROOF_Y + 0.004, -2.02);
    for (const k of KIT.grilleIndices(P.q, 7, 4)) P.add('hullDetail', box(0.76, 0.018, 0.05), x, ROOF_Y + 0.012, -1.60 - k * 0.135);
  }
  P.add('hullDark', box(1.70, 0.012, 0.36), 0, ROOF_Y - 0.035, -2.75, -0.20, 0, 0);
  for (const k of KIT.grilleIndices(P.q, 3, 2)) P.add('hullDetail', box(1.64, 0.016, 0.04), 0, ROOF_Y - 0.02 - k * 0.022, -2.63 - k * 0.11, -0.20, 0, 0);
  // two 200 L drums across the stern on raked brackets
  const drumY = 1.72, drumZ = -3.20, drumR = 0.29, drumX = 0.60, drumL = 0.86;
  for (const s of [-1, 1]) {
    P.add('hull', cylX(drumR, drumL, P.q ? 20 : 12), s * drumX, drumY, drumZ);
    for (const e of [-drumL / 2 + 0.01, drumL / 2 - 0.01]) P.add('hullDark', cylX(drumR + 0.006, 0.018, P.q ? 20 : 12), s * drumX + e, drumY, drumZ);
    P.add('hullDark', cylX(drumR + 0.004, 0.014, P.q ? 20 : 12), s * drumX, drumY, drumZ);
    P.add('hullDark', box(0.04, 0.03, 0.62), s * drumX, drumY + drumR + 0.01, drumZ);                    // strap
    for (const dx of [-0.26, 0.26]) {
      P.add('hullDetail', box(0.07, 0.42, 0.07), s * drumX + dx, drumY - 0.36, REAR_Z - 0.05, 0.42, 0, 0); // raked bracket
      P.add('hullDetail', box(0.07, 0.06, 0.46), s * drumX + dx, drumY - drumR - 0.02, drumZ + 0.10);      // cradle
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
  const x = 0.48, z = -0.42, base = skinAt(x, z) - 0.03, seg = P.q ? 28 : 14;
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
  P.addModuleVisual('optics', 'turretDetail', box(0.15, 0.10, 0.17), x, lidY + 0.09, z + 0.12);
  P.addModuleVisual('optics', 'turretGlass', box(0.11, 0.04, 0.012), x, lidY + 0.10, z + 0.207);
  // OU-3 IR spot on the ring's front-left
  P.add('turretDetail', box(0.05, 0.08, 0.05), x + 0.20, base + 0.20, z + 0.20);
  P.add('turretDetail', cylZ(0.07, 0.11, 14), x + 0.20, base + 0.27, z + 0.22);
  P.add('turretDark', cylZ(0.058, 0.008, 14), x + 0.20, base + 0.27, z + 0.28);
}

function addLoaderHatch(P: TankBuilderPort): { x: number; z: number; top: number } {
  const { box, cylY } = KIT;
  const x = -0.48, z = -0.18, base = skinAt(x, z) - 0.02, seg = P.q ? 28 : 14;
  P.add('turretDetail', cylY(0.30, 0.31, 0.05, seg), x, base + 0.025, z);
  P.addHatch('turret', cylY(0.255, 0.26, 0.035, seg), x, base + 0.065, z);
  P.add('turretDark', box(0.08, 0.035, 0.12), x - 0.26, base + 0.06, z);
  // the AA ring mount round the hatch
  P.add('turretDetail', KIT.torus(0.33, 0.016, P.q ? 32 : 16), x, base + 0.07, z);
  return { x, z, top: base + 0.085 };
}

function addTurretRoof(P: TankBuilderPort): void {
  const { box, cylY, sph } = KIT;
  addCommanderCupola(P);
  const loader = addLoaderHatch(P);
  // Type 54 12.7 mm (DShK) on the loader's ring, barrel forward
  {
    const dshk = FITTINGS.pintleMG({
      mats: P.mats, cls: 'dshk', scale: 1.0, tone: 'two-tone', elev: 0.06,
      ammo: true, shield: false, working: true, ridingCradle: true, seed: 6,
    });
    dshk.name = 'type59RoofDShK';
    dshk.userData.cupolaSeat = 'loader';
    dshk.position.set(loader.x, loader.top - 0.01, loader.z + 0.30);
    P.turretG.add(dshk);
    P.add('turretDetail', box(0.10, 0.03, 0.10), loader.x, loader.top - 0.02, loader.z + 0.30);
  }
  // mushroom ventilator ahead of the loader's hatch
  {
    const x = -0.40, z = 0.34, base = skinAt(x, z) - 0.02;
    P.add('turret', cylY(0.12, 0.13, 0.06, P.q ? 20 : 12), x, base + 0.03, z);
    P.add('turret', KIT.xform(sph(0.14, P.q ? 20 : 12, Math.PI / 2), 0, 0, 0, 0, 0, 0, [1, 0.45, 1]), x, base + 0.055, z);
  }
  // gunner's sight aperture left of the gun: a hooded slit in the casting
  {
    const h = 0.50, t = domeAngleForX(0.36, h, 1), p = domePoint(t, h), n = domeNormal(t, h);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const e = new THREE.Euler().setFromQuaternion(q);
    const hood = p.clone().addScaledVector(n, 0.015);
    P.add('turretDetail', box(0.16, 0.26, 0.05), hood.x, hood.y, hood.z, e.x, e.y, e.z);
    const slit = p.clone().addScaledVector(n, 0.042);
    P.addModuleVisual('optics', 'turretGlass', box(0.07, 0.17, 0.008), slit.x, slit.y, slit.z, e.x, e.y, e.z);
  }
  // periscope for the loader on the right front of the roof
  {
    const x = -0.70, z = 0.10;
    KIT.periscope(P, 'turretDetail', x, skinAt(x, z) + 0.01, z, -0.3);
  }
  // radio antenna base at the rear of the roof
  {
    const x = 0.12, z = -0.92;
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
  const stations: [number, number, number][] = [[0.10, 0.46, 0.52], [0.48, 0.46, 0.50], [0.58, 0.42, 0.45],
    [0.68, 0.36, 0.38], [0.76, 0.29, 0.30], [0.83, 0.235, 0.235]];
  const n = P.q ? 20 : 12, e = 2 / 3.2;   // superellipse exponent 3.2: a soft-cornered bag
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
  P.addGunExtraDark(cylZ(0.122, 0.04, n), 0, 0, 0.82);
  // the coaxial 7.62 mm's port in the cover, right of the gun
  P.addGunExtraDark(cylZ(0.022, 0.08, 10), -0.17, -0.03, 0.52);
}

/** 100 mm Type 59 rifled gun (licensed D-10T): the tube tapers from the cover to the bore evacuator, which runs flush
 * to the muzzle (0.87 m long, 0.184 m over a 0.156 m barrel). */
function addMainGun(P: TankBuilderPort): void {
  const evStart = MUZZLE_Z - EVACUATOR_LEN;
  tubeGun(P, [
    // [z0, z1, front radius, rear radius] (cylZ puts its first radius at +Z)
    [0.30, 1.10, 0.100, 0.110], [1.10, 2.40, 0.088, 0.100], [2.40, evStart - 0.06, 0.078, 0.088],
    [evStart - 0.06, evStart + 0.02, 0.092, 0.078], [evStart + 0.02, MUZZLE_Z - 0.04, 0.092, 0.092],
    [MUZZLE_Z - 0.04, MUZZLE_Z, 0.084, 0.092],
  ], { rings: [[evStart + 0.03, 0.095], [MUZZLE_Z - 0.06, 0.095]], muzzle: MUZZLE_Z });
  muzzleBore(P, { r: 0.05 });
}

/** The later-model IR searchlight right of the gun on a short cradle arm, slaved in elevation (gun frame). */
function addSearchlight(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const x = -0.40, y = 0.30, z = 0.74, r = 0.150;
  P.add('gunMountLamp', box(0.26, 0.05, 0.10), -0.24, 0.12, 0.66);              // arm off the cradle
  P.add('gunMountLamp', box(0.05, 0.16, 0.08), -0.36, 0.18, 0.68);              // riser to the stirrup
  P.add('gunMountLamp', box(0.06, 0.12, 0.10), x, y - r - 0.03, z - 0.02);       // stirrup
  P.add('gunMountLamp', cylZ(r, 0.26, P.q ? 20 : 12), x, y, z);
  P.add('gunMountDark', cylZ(r + 0.008, 0.025, P.q ? 20 : 12), x, y, z + 0.135);   // bezel
  P.add('gunMountGlass', cylZ(r - 0.02, 0.008, P.q ? 20 : 12), x, y, z + 0.15);
  P.add('gunMountDark', cylZ(r * 0.72, 0.03, 12), x, y, z - 0.145);              // rear cap
}

function buildType59Turret(P: TankBuilderPort): void {
  P.turretG.position.set(...TURRET_PIVOT);
  P.gunG.position.set(...TRUNNION);
  P.add('turret', castDome(P.q));
  addTurretRail(P, 0.30, 40 * D2R, 140 * D2R);
  addTurretRail(P, 0.30, -40 * D2R, -140 * D2R);
  addTurretRail(P, 0.34, 158 * D2R, 202 * D2R);
  addTurretRoof(P);
  addMantletCover(P);
  addMainGun(P);
  addSearchlight(P);
  // turret numbers on the flanks
  const num = P.spec.visual.number || '';
  for (const side of [-1, 1]) {
    const t = side * 92 * D2R, h = 0.36, p = domePoint(t, h).addScaledVector(domeNormal(t, h), 0.008);
    P.decal('turret', 'number', num, 0.24, [p.x, p.y, p.z], side * Math.PI / 2);
  }
  P.topY = 0.96;
}

export function buildType59(P: TankBuilderPort): void {
  addHullBody(P);
  addFenders(P);
  addRunningGear(P);
  addHullFront(P);
  addFenderStowage(P);
  addHullRear(P);
  buildType59Turret(P);
  P.hullG.userData.type59HistoricalReceipt = Object.freeze({
    revision: 'type59-historical-r262',
    hullBodyM: Object.freeze({ rearZ: REAR_Z, noseZ: NOSE_Z, fenderTipZ: 3.02, halfWidth: HULL_HALF_W, roofY: ROOF_Y, bellyY: BELLY_Y }),
    widthM: FENDER_OUT * 2,
    upperGlacisDegFromVertical: 60, lowerGlacisDegFromVertical: 55,
    roadWheelStations: WHEEL_ZS.length, roadWheelDiameterM: WHEEL_R * 2,
    roadWheelPitchM: WHEEL_ZS[2] - WHEEL_ZS[3], firstGapM: WHEEL_ZS[0] - WHEEL_ZS[1],
    trackWidthM: TRACK_W, trackGaugeM: TRACK_XC * 2, returnRollers: 0,
    rearFuelDrums: 2, externalFuelTanksRight: 4, exhaustSide: 'left', driverSide: 'left',
    legacyRefitRetired: true,
  });
  P.turretG.userData.type59HistoricalReceipt = Object.freeze({
    revision: 'type59-historical-r262',
    dome: Object.freeze({ widthM: DOME.side * 2, lengthM: DOME.front + DOME.rear, heightM: DOME.H, apexZ: DOME.cz }),
    pivotLocalM: Object.freeze([...TURRET_PIVOT]), trunnionLocalM: Object.freeze([...TRUNNION]),
    muzzleLocalZ: MUZZLE_Z, evacuatorLengthM: EVACUATOR_LEN, evacuatorAtMuzzle: true, muzzleCounterweight: false,
    commanderCupolaSide: 'left', loaderHatchSide: 'right', searchlightSide: 'right', coaxSide: 'right',
    searchlightDiameterM: 0.31, roofMachineGuns: Object.freeze(['Type 54 DShK']),
  });
}
