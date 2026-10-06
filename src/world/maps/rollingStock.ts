// src/world/maps/rollingStock.ts — the map-vehicles lane's rolling stock (P5, 2026-10-06).
//
// Wagons and a shunter standing on a map's sidings, built in the vehicle toolkit (vehicleMesh.ts) at their real
// dimensions: the Deutsche Bundesbahn's goods stock of the 1960s Ruhr (Cinder Junction) — the Omm open coal wagon
// with its stakes and its load, the G 10 covered van in planks on a braced frame under its arched roof, a two-axle
// tank wagon on its cradle, and a V 60 shunting locomotive with its jackshaft and coupling rods. Every vehicle stands on
// two or three wheelsets (flanged wheels on axles, axle boxes hung from leaf springs under the solebars), a riveted
// underframe with headstocks, buffers and screw couplings, the DB's colours weathered by the coalfield.
//
// Local frame: +Z along the vehicle (the shunter's long hood ahead), +Y up from the rail head (y = 0), centred on x = 0
// and on its length over buffers. One indexed geometry in the props' painted bucket's streams (position, normal, uv,
// colour). Deterministic and renderer-free.

import * as THREE from 'three';
import { VehicleMesh, linearHex, material, vehicleWeathering, type Vec3, type VehicleMaterial } from './vehicleMesh.ts';

type Mat = VehicleMaterial;

export type RollingStockKind = 'omm' | 'g10' | 'tank' | 'v60';

/** Length over buffers (m): consecutive vehicles in a cut stand buffer to buffer. */
export const ROLLING_STOCK_LENGTH: Readonly<Record<RollingStockKind, number>> = { omm: 10.0, g10: 9.1, tank: 9.0, v60: 10.45 };
/** Width of the body (m) and its height over the rail head (m): the collision record's box. */
export const ROLLING_STOCK_BODY: Readonly<Record<RollingStockKind, { w: number; h: number }>> = {
  omm: { w: 2.92, h: 2.86 }, g10: { w: 2.82, h: 3.9 }, tank: { w: 2.6, h: 3.6 }, v60: { w: 3.1, h: 4.2 },
};

// ---------------------------------------------------------------------------------------------------- materials

const DB_BROWN = material('paint', linearHex(0x5a3a28), 0.72, 0.05, 0, 1);
const DB_BROWN_WOOD = material('wood', linearHex(0x5e3e2a), 0.86, 0, 0, 1);
const FRAME_BLACK = material('steel', [0.03, 0.029, 0.028], 0.62, 0.35, 0, 1);
const WHEEL_STEEL = material('steel', [0.05, 0.047, 0.044], 0.5, 0.55, 0, 1);
const TYRE_BRIGHT = material('chrome', [0.3, 0.3, 0.29], 0.35, 0.85, 0, 0.6);
const ROOF_GREY = material('paint', linearHex(0x5c5a56), 0.82, 0, 0, 1);
const TANK_BLACK = material('paint', [0.03, 0.03, 0.03], 0.5, 0.2, 0, 1);
const V60_RED = material('paint', linearHex(0x7a1c22), 0.5, 0.05, 0, 1);
const V60_ROD = material('steel', [0.07, 0.065, 0.06], 0.45, 0.6, 0, 1);
const GLASS = material('glass', [0.02, 0.024, 0.028], 0.06, 0, 0, 0.2);
const WARN_YELLOW = material('paint', linearHex(0xd0a020), 0.6, 0, 0, 1);
const COAL = material('cargo', [0.022, 0.021, 0.02], 0.62, 0, 0, 0.3);

// ---------------------------------------------------------------------------------------------------- helpers

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossV = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dotV = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function face4(mesh: VehicleMesh, p: Vec3[], n: Vec3, m: Mat): void {
  if (dotV(crossV(sub(p[1], p[0]), sub(p[2], p[0])), n) < 0) p = [p[0], p[3], p[2], p[1]];
  const v = p.map((q) => mesh.vert(q[0], q[1], q[2], n[0], n[1], n[2], m));
  mesh.tri(v[0], v[1], v[2]);
  mesh.tri(v[0], v[2], v[3]);
}

/** A bar from a to b, `w` across and `d` deep (its depth toward `up`), open-ended when its ends are buried. */
function beam(mesh: VehicleMesh, a: Vec3, b: Vec3, w: number, d: number, m: Mat, open = false, up: Vec3 = [0, 1, 0]): void {
  const t = unit(sub(b, a));
  let u = up;
  if (Math.abs(dotV(t, u)) > 0.97) u = Math.abs(t[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const s = unit(crossV(u, t)), v = crossV(t, s);
  const at = (p: Vec3, cs: number, cv: number): Vec3 => [
    p[0] + s[0] * cs * w / 2 + v[0] * cv * d / 2, p[1] + s[1] * cs * w / 2 + v[1] * cv * d / 2, p[2] + s[2] * cs * w / 2 + v[2] * cv * d / 2,
  ];
  const ring: [number, number][] = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
  for (let k = 0; k < 4; k++) {
    const [s0, v0] = ring[k], [s1, v1] = ring[(k + 1) % 4];
    const n = unit([s[0] * (s0 + s1) + v[0] * (v0 + v1), s[1] * (s0 + s1) + v[1] * (v0 + v1), s[2] * (s0 + s1) + v[2] * (v0 + v1)]);
    face4(mesh, [at(a, s0, v0), at(a, s1, v1), at(b, s1, v1), at(b, s0, v0)], n, m);
  }
  if (!open) {
    face4(mesh, ring.map(([cs, cv]) => at(a, cs, cv)), [-t[0], -t[1], -t[2]], m);
    face4(mesh, ring.map(([cs, cv]) => at(b, cs, cv)), t, m);
  }
}

// ---------------------------------------------------------------------------------------------------- running gear

/** A wheelset at z: two flanged wheels on their axle, the rail head at y = 0 under the treads. */
function wheelset(mesh: VehicleMesh, z: number, r: number, spoked: boolean): void {
  const gaugeHalf = 0.7175, tread = 0.135;
  for (const side of [1, -1]) {
    mesh.push().translate(side * gaugeHalf, r, z).scale(side, 1, 1);
    // the tyre: its tread over the rail, the flange inside
    mesh.lathe([[r - 0.05, tread * 0.62], [r - 0.004, tread * 0.62], [r, tread * 0.2], [r, -tread * 0.3], [r + 0.028, -tread * 0.36],
      [r + 0.028, -tread * 0.42], [r - 0.06, -tread * 0.42]], 14, (k) => (k >= 1 && k <= 3 ? TYRE_BRIGHT : WHEEL_STEEL), { creases: [1, 3, 4, 5] });
    // the centre: a dished disc or six spokes, and the boss
    if (spoked) {
      for (let k = 0; k < 6; k++) {
        mesh.push().rotateX((k / 6) * Math.PI * 2);
        beam(mesh, [0.02, r * 0.22, 0], [0.04, r - 0.05, 0], 0.05, 0.06, WHEEL_STEEL, true, [1, 0, 0]);
        mesh.pop();
      }
    } else {
      mesh.lathe([[r - 0.05, 0.06], [r * 0.55, 0.03], [r * 0.25, 0.08], [r * 0.25, -0.06], [r * 0.55, -0.02], [r - 0.05, -0.04]], 12,
        () => WHEEL_STEEL, { creases: [2, 3] });
    }
    mesh.lathe([[0.0001, 0.15], [0.1, 0.15], [0.12, 0.05], [0.12, -0.08], [0.0001, -0.08]], 8, () => WHEEL_STEEL);
    mesh.pop();
  }
  // the axle
  mesh.push().translate(0, r, z);
  mesh.lathe([[0.075, -0.82], [0.075, 0.82]], 8, () => WHEEL_STEEL, { flip: true });
  mesh.pop();
}

/** An axle box outside each wheel under its leaf spring, hung from the solebar. */
function axleBox(mesh: VehicleMesh, z: number, r: number, solebarY: number, springLen: number): void {
  for (const side of [1, -1]) {
    const x = side * 1.0;
    mesh.box(x, r, z, 0.24, 0.36, 0.32, FRAME_BLACK, 0.02);
    // the leaf spring: a stack of leaves, its eyes up to the hangers on the solebar
    for (let k = 0; k < 4; k++) mesh.box(x, r + 0.22 + k * 0.04, z, 0.12, 0.035, springLen - k * 0.18, FRAME_BLACK, 0);
    for (const s of [-1, 1]) beam(mesh, [x, r + 0.34, z + s * springLen / 2], [x, solebarY - 0.12, z + s * (springLen / 2 + 0.06)], 0.06, 0.06, FRAME_BLACK);
    // the horn guides either side of the box
    for (const s of [-1, 1]) mesh.box(x, (r + solebarY) / 2, z + s * 0.22, 0.18, solebarY - r, 0.05, FRAME_BLACK, 0);
  }
}

/** The underframe: two solebars, the headstocks, buffers and screw couplings at both ends, a brake hand wheel. */
function underframe(mesh: VehicleMesh, frameHalf: number, width: number, y: number, depth: number, overBuffers: number): void {
  const sx = width / 2 - 0.08;
  for (const side of [1, -1]) {
    // the solebar: a channel, its web outward
    mesh.box(side * sx, y - depth / 2, 0, 0.03, depth, frameHalf * 2, FRAME_BLACK, 0);
    mesh.box(side * (sx - 0.05), y - 0.015, 0, 0.1, 0.03, frameHalf * 2, FRAME_BLACK, 0);
    mesh.box(side * (sx - 0.05), y - depth + 0.015, 0, 0.1, 0.03, frameHalf * 2, FRAME_BLACK, 0);
  }
  for (const end of [1, -1]) {
    const z = end * frameHalf;
    mesh.box(0, y - depth / 2, z, width - 0.1, depth, 0.12, FRAME_BLACK, 0.01);
    // buffers: the casing, the plunger and the head, 1.75 m apart at 1.06 m over the rail
    const reach = overBuffers / 2 - frameHalf;
    for (const side of [1, -1]) {
      mesh.push().translate(side * 0.875, 1.06, z).rotateY(end > 0 ? -Math.PI / 2 : Math.PI / 2);
      mesh.lathe([[0.12, 0.0], [0.11, reach * 0.55], [0.08, reach * 0.55], [0.08, reach - 0.04]], 8, () => FRAME_BLACK, { flip: true });
      mesh.lathe([[0.0001, reach - 0.05], [0.2, reach - 0.05], [0.21, reach - 0.02], [0.19, reach], [0.0001, reach + 0.005]], 10, () => WHEEL_STEEL);
      mesh.pop();
    }
    // the coupling hook and its screw link hanging
    mesh.box(0, 1.06, z + end * (reach * 0.6), 0.1, 0.16, reach * 1.2, FRAME_BLACK, 0.01);
    beam(mesh, [0, 1.0, z + end * reach * 1.05], [0, 0.72, z + end * (reach + 0.12)], 0.05, 0.05, FRAME_BLACK);
  }
  // cross bearers between the solebars
  for (const z of [-frameHalf * 0.55, 0, frameHalf * 0.55]) mesh.box(0, y - depth * 0.6, z, width - 0.3, depth * 0.5, 0.1, FRAME_BLACK, 0);
}

// ---------------------------------------------------------------------------------------------------- the vehicles

function omm(mesh: VehicleMesh, coarse: boolean): void {
  const L = ROLLING_STOCK_LENGTH.omm, W = ROLLING_STOCK_BODY.omm.w, frameHalf = 4.35, floorY = 1.28, top = 2.83;
  const r = 0.5;
  for (const z of [-3.0, 3.0]) { wheelset(mesh, z, r, true); axleBox(mesh, z, r, floorY - 0.02, 1.6); }
  underframe(mesh, frameHalf, W, floorY, 0.32, L);
  // the body: steel side and end walls, the floor, the top rails
  const hw = W / 2, h = top - floorY;
  for (const side of [1, -1]) {
    mesh.box(side * (hw - 0.02), floorY + h / 2, 0, 0.03, h, frameHalf * 2 - 0.04, DB_BROWN, 0);
    mesh.box(side * (hw - 0.07), floorY + h / 2, 0, 0.01, h, frameHalf * 2 - 0.12, DB_BROWN, 0);
    // the stakes: U-profiles outside every metre or so, the side doors' frame between the middle two
    const n = coarse ? 5 : 9;
    for (let k = 0; k < n; k++) {
      const z = -frameHalf + 0.15 + (k / (n - 1)) * (frameHalf * 2 - 0.3);
      mesh.box(side * (hw + 0.035), floorY + h / 2, z, 0.07, h, 0.09, DB_BROWN, coarse ? 0 : 0.01);
    }
    mesh.box(side * (hw + 0.02), top - 0.04, 0, 0.1, 0.08, frameHalf * 2, DB_BROWN, 0.01);
    if (!coarse) {
      mesh.dressing(() => {
        // the side door's hinges and the door seams
        for (const z of [-0.8, 0.8]) mesh.box(side * (hw + 0.005), floorY + h / 2, z, 0.01, h - 0.1, 0.02, FRAME_BLACK, 0);
        mesh.box(side * (hw + 0.005), floorY + h * 0.75, 0, 0.012, 0.05, 1.5, FRAME_BLACK, 0);
      });
    }
  }
  for (const end of [1, -1]) {
    mesh.box(0, floorY + h / 2, end * (frameHalf - 0.02), W - 0.04, h, 0.03, DB_BROWN, 0);
    mesh.box(0, floorY + h / 2, end * (frameHalf - 0.08), W - 0.14, h, 0.01, DB_BROWN, 0);
    for (const x of [-0.9, 0, 0.9]) mesh.box(x, floorY + h / 2, end * (frameHalf + 0.03), 0.09, h, 0.06, DB_BROWN, coarse ? 0 : 0.01);
  }
  mesh.box(0, floorY + 0.03, 0, W - 0.06, 0.06, frameHalf * 2 - 0.06, FRAME_BLACK, 0);
  // the load: coal heaped over the top rails, a ridge along the middle
  const nu = coarse ? 6 : 12, nv = coarse ? 6 : 10;
  mesh.grid(nu, nv, (i, j, out) => {
    const u = i / nu, v = j / nv;
    const z = (u - 0.5) * (frameHalf * 2 - 0.25), x = (v - 0.5) * (W - 0.2);
    const ridge = Math.sin(v * Math.PI) * Math.pow(Math.sin(u * Math.PI), 0.4);
    const lump = Math.sin(z * 2.3 + x * 3.1) * 0.04 + Math.sin(z * 5.7 - x * 4.3) * 0.025;
    out[0] = x; out[1] = top - 0.25 + ridge * 0.55 + lump * ridge; out[2] = z;
  }, () => COAL, { flip: true });
}

function g10(mesh: VehicleMesh, coarse: boolean): void {
  const L = ROLLING_STOCK_LENGTH.g10, W = ROLLING_STOCK_BODY.g10.w, frameHalf = 3.85, floorY = 1.25, eave = 3.3, ridge = 3.9;
  const r = 0.5;
  for (const z of [-2.0, 2.0]) { wheelset(mesh, z, r, true); axleBox(mesh, z, r, floorY - 0.02, 1.6); }
  underframe(mesh, frameHalf, W, floorY, 0.3, L);
  const hw = W / 2, h = eave - floorY, bodyL = frameHalf * 2 + 0.1;
  // the planked sides and ends: vertical boards on a steel frame, the frame's diagonals outside
  for (const side of [1, -1]) {
    mesh.box(side * (hw - 0.03), floorY + h / 2, 0, 0.05, h, bodyL, DB_BROWN_WOOD, 0);
    if (!coarse) {
      mesh.dressing(() => {
        const boards = 24;
        for (let k = 1; k < boards; k++) {
          const z = -bodyL / 2 + (k / boards) * bodyL;
          if (Math.abs(z) < 1.05) continue;
          mesh.box(side * (hw + 0.0), floorY + h / 2, z, 0.008, h - 0.06, 0.012, FRAME_BLACK, 0);
        }
      });
    }
    // the frame: corner and door posts, the eaves rail, the diagonals (a G 10's braced panels)
    for (const z of [-bodyL / 2 + 0.06, -1.05, 1.05, bodyL / 2 - 0.06]) mesh.box(side * (hw + 0.02), floorY + h / 2, z, 0.05, h, 0.1, FRAME_BLACK, 0);
    mesh.box(side * (hw + 0.02), eave - 0.04, 0, 0.06, 0.08, bodyL, FRAME_BLACK, 0);
    mesh.box(side * (hw + 0.02), floorY + 0.06, 0, 0.06, 0.12, bodyL, FRAME_BLACK, 0);
    for (const end of [1, -1]) {
      beam(mesh, [side * (hw + 0.03), floorY + 0.1, end * (bodyL / 2 - 0.1)], [side * (hw + 0.03), eave - 0.1, end * 1.15], 0.04, 0.08, FRAME_BLACK, false, [side, 0, 0]);
      beam(mesh, [side * (hw + 0.03), floorY + 0.1, end * 1.15], [side * (hw + 0.03), eave - 0.1, end * (bodyL / 2 - 0.1)], 0.04, 0.08, FRAME_BLACK, false, [side, 0, 0]);
    }
    // the sliding door and its rails
    mesh.box(side * (hw + 0.06), floorY + h / 2 - 0.05, 0, 0.05, h - 0.2, 2.0, DB_BROWN_WOOD, coarse ? 0 : 0.01);
    mesh.box(side * (hw + 0.1), eave - 0.12, 0, 0.05, 0.06, 4.2, FRAME_BLACK, 0);
    mesh.box(side * (hw + 0.1), floorY + 0.12, 0, 0.05, 0.05, 4.2, FRAME_BLACK, 0);
  }
  for (const end of [1, -1]) {
    mesh.box(0, floorY + h / 2, end * (bodyL / 2 - 0.03), W - 0.06, h, 0.05, DB_BROWN_WOOD, 0);
    // the gable under the roof's arch
    const pts: Vec3[] = [];
    const n = coarse ? 4 : 8;
    for (let k = 0; k <= n; k++) {
      const a = Math.PI * (k / n);
      pts.push([Math.cos(a) * hw, eave + (ridge - eave) * Math.sin(a), end * (bodyL / 2 - 0.03)]);
    }
    const c = mesh.vert(0, eave, end * (bodyL / 2 - 0.03), 0, 0, end, DB_BROWN_WOOD);
    const ring = pts.map((q) => mesh.vert(q[0], q[1], q[2], 0, 0, end, DB_BROWN_WOOD));
    for (let k = 0; k < n; k++) end > 0 ? mesh.tri(c, ring[k], ring[k + 1]) : mesh.tri(c, ring[k + 1], ring[k]);
  }
  // the arched roof, overhanging the sides and ends a little
  const ar = coarse ? 8 : 14;
  mesh.grid(4, ar, (i, j, out) => {
    const a = Math.PI * (j / ar);
    out[0] = Math.cos(a) * (hw + 0.07);
    out[1] = eave - 0.02 + (ridge - eave + 0.04) * Math.sin(a);
    out[2] = (i / 4 - 0.5) * (bodyL + 0.16);
  }, () => ROOF_GREY, {});
  mesh.grid(4, ar, (i, j, out) => {
    const a = Math.PI * (j / ar);
    out[0] = Math.cos(a) * (hw + 0.065);
    out[1] = eave - 0.04 + (ridge - eave + 0.04) * Math.sin(a);
    out[2] = (i / 4 - 0.5) * (bodyL + 0.16);
  }, () => ROOF_GREY, { flip: true });
}

function tank(mesh: VehicleMesh, coarse: boolean): void {
  const L = ROLLING_STOCK_LENGTH.tank, W = 2.6, frameHalf = 3.8, floorY = 1.25, R = 1.05, axisY = floorY + 0.2 + R;
  const r = 0.5;
  for (const z of [-2.25, 2.25]) { wheelset(mesh, z, r, false); axleBox(mesh, z, r, floorY - 0.02, 1.5); }
  underframe(mesh, frameHalf, W, floorY, 0.3, L);
  // the barrel with its dished ends, on two cradles, held down by straps
  const half = 3.7;
  mesh.push().translate(0, axisY, 0).rotateY(Math.PI / 2);
  const segs = coarse ? 12 : 18;
  mesh.lathe([[0.0001, -half - 0.3], [R * 0.55, -half - 0.24], [R * 0.88, -half - 0.12], [R, -half], [R, half], [R * 0.88, half + 0.12],
    [R * 0.55, half + 0.24], [0.0001, half + 0.3]], segs, () => TANK_BLACK);
  mesh.pop();
  for (const z of [-2.4, 2.4]) {
    mesh.box(0, floorY + 0.12, z, W - 0.3, 0.24, 0.3, FRAME_BLACK, 0.01);
    if (!coarse) mesh.dressing(() => {
      const strap: Vec3[] = [];
      for (let k = 0; k <= 10; k++) { const a = Math.PI * (k / 10); strap.push([Math.cos(a) * (R + 0.012), axisY + Math.sin(a) * (R + 0.012), z]); }
      mesh.tube(strap, 0.012, 4, FRAME_BLACK, { caps: true });
    });
  }
  // the dome and its manhole, the walkway along the top, a ladder up one side
  mesh.push().translate(0, axisY + R - 0.05, 0);
  mesh.lathe([[0.36, 0], [0.36, 0.38], [0.3, 0.44], [0.0001, 0.46]], coarse ? 10 : 16, () => TANK_BLACK, { flip: true });
  mesh.pop();
  mesh.box(0, axisY + R + 0.02, 1.4, 0.5, 0.04, 2.0, FRAME_BLACK, 0);
  for (const side of [1, -1]) beam(mesh, [side * 0.2, axisY + R + 0.04, 0.6], [side * 0.2, axisY + R + 0.4, 0.6], 0.03, 0.03, FRAME_BLACK);
  for (const side of [1, -1]) beam(mesh, [side * 0.22, floorY + 0.25, half + 0.15], [side * 0.22, axisY + R, half - 0.25], 0.04, 0.03, FRAME_BLACK);
  for (let k = 1; k <= 5; k++) {
    const t = k / 6;
    mesh.box(0, floorY + 0.25 + t * (axisY + R - floorY - 0.25), half + 0.15 - t * 0.4, 0.44, 0.025, 0.03, FRAME_BLACK, 0);
  }
}

function v60(mesh: VehicleMesh, coarse: boolean): void {
  const L = ROLLING_STOCK_LENGTH.v60, W = ROLLING_STOCK_BODY.v60.w, frameHalf = 4.6, frameTop = 1.42;
  const r = 0.625;
  // three coupled axles on plain disc wheels, the jackshaft behind the last, the coupling rods outside
  for (const z of [-2.2, 0, 2.2]) wheelset(mesh, z, r, false);
  underframe(mesh, frameHalf, W, frameTop, 0.62, L);
  for (const side of [1, -1]) {
    const x = side * 1.12;
    // the plate frame's side over the wheels (the axle boxes inside it), the crank pins and the rod
    mesh.box(side * 1.0, frameTop - 0.4, 0, 0.05, 0.8, frameHalf * 2 - 0.3, FRAME_BLACK, 0);
    for (const z of [-2.2, 0, 2.2, -3.5]) {
      mesh.push().translate(x, r, z);
      mesh.lathe([[0.0001, -0.06], [0.11, -0.06], [0.11, 0.06], [0.0001, 0.06]], 10, () => V60_ROD);
      mesh.pop();
    }
    beam(mesh, [x + side * 0.05, r + 0.22, -3.5], [x + side * 0.05, r + 0.22, 2.2], 0.05, 0.12, V60_ROD);
    // steps and handrails at the ends of the walkway
    for (const end of [1, -1]) mesh.box(side * (W / 2 - 0.15), 0.55, end * (frameHalf - 0.35), 0.3, 0.04, 0.4, FRAME_BLACK, 0);
  }
  // the walkway plate over the frame, the long hood ahead, the cab, the short hood astern
  mesh.box(0, frameTop + 0.02, 0, W, 0.05, frameHalf * 2, FRAME_BLACK, 0.01);
  const hood = (z0: number, z1: number, h: number, w: number) => {
    mesh.box(0, frameTop + h / 2, (z0 + z1) / 2, w, h, z1 - z0, V60_RED, coarse ? 0 : 0.06);
    // its louvres and doors
    if (!coarse) mesh.dressing(() => {
      for (const side of [1, -1]) for (let k = 0; k < Math.floor((z1 - z0) / 0.7); k++) {
        mesh.box(side * (w / 2 + 0.004), frameTop + h * 0.55, z0 + 0.35 + k * 0.7, 0.008, h * 0.5, 0.5, linearMat(0x5a1418), 0);
      }
    });
  };
  hood(0.55, 4.45, 2.0, 1.85);
  hood(-4.4, -2.0, 1.65, 1.85);
  // the radiator grille at the long hood's nose, the exhaust stack and the headlamps
  mesh.box(0, frameTop + 1.0, 4.46, 1.5, 1.4, 0.03, FRAME_BLACK, 0);
  mesh.push().translate(0, frameTop + 2.0, 2.4);
  mesh.lathe([[0.0001, 0], [0.09, 0], [0.09, 0.32], [0.0001, 0.32]], 8, () => FRAME_BLACK, { flip: true });
  mesh.pop();
  // the cab: sides with windows, the roof's crown, the end windows over the hoods
  const cz0 = -2.0, cz1 = 0.55, cabTop = 4.0;
  mesh.box(0, frameTop + (cabTop - frameTop) / 2, (cz0 + cz1) / 2, W - 0.1, cabTop - frameTop, cz1 - cz0, V60_RED, coarse ? 0 : 0.05);
  mesh.box(0, cabTop + 0.08, (cz0 + cz1) / 2, W - 0.02, 0.16, cz1 - cz0 + 0.2, FRAME_BLACK, coarse ? 0 : 0.06);
  for (const side of [1, -1]) {
    for (const z of [-1.35, -0.3]) mesh.box(side * ((W - 0.1) / 2 + 0.006), cabTop - 0.75, z, 0.012, 0.75, 0.75, GLASS, 0);
  }
  for (const end of [1, -1]) {
    for (const x of [-0.85, 0.85]) mesh.box(x, cabTop - 0.7, end > 0 ? cz1 + 0.006 : cz0 - 0.006, 0.6, 0.65, 0.012, GLASS, 0);
  }
  // the buffer beams' warning stripes
  if (!coarse) mesh.dressing(() => {
    for (const end of [1, -1]) for (let k = 0; k < 6; k++) {
      mesh.box(-1.25 + k * 0.5, frameTop - 0.3, end * (frameHalf + 0.065), 0.24, 0.5, 0.01, WARN_YELLOW, 0);
    }
  });
  for (const end of [1, -1]) for (const x of [-0.75, 0.75]) {
    mesh.push().translate(x, frameTop + (end > 0 ? 1.7 : 1.45), end > 0 ? 4.46 : -4.41).rotateY(end > 0 ? -Math.PI / 2 : Math.PI / 2);
    mesh.lathe([[0.12, 0], [0.12, 0.08], [0.0001, 0.1]], 10, () => linearMat(0xd8d2b8), { flip: true });
    mesh.pop();
  }
}

const MATS = new Map<number, Mat>();
function linearMat(hex: number): Mat {
  let m = MATS.get(hex);
  if (!m) { m = material('paint', linearHex(hex), 0.6, 0, 0, 1); MATS.set(hex, m); }
  return m;
}

/**
 * One vehicle of rolling stock: its geometry in the painted bucket's streams, the rail head at y = 0, centred on its
 * length over buffers. The colours carry the coalfield's weathering (soot and coal dust low, rust on the steel).
 */
export function buildRollingStock(kind: RollingStockKind, opts: { coarse?: boolean; seed?: number } = {}): THREE.BufferGeometry {
  const mesh = new VehicleMesh();
  const coarse = !!opts.coarse;
  mesh.coarse = coarse;
  if (kind === 'omm') omm(mesh, coarse);
  else if (kind === 'g10') g10(mesh, coarse);
  else if (kind === 'tank') tank(mesh, coarse);
  else v60(mesh, coarse);
  const r = kind === 'v60' ? 0.625 : 0.5;
  const axles = kind === 'v60' ? [-2.2, 0, 2.2] : kind === 'omm' ? [-3, 3] : kind === 'g10' ? [-2, 2] : [-2.25, 2.25];
  const g = mesh.build(vehicleWeathering({
    dirtRgb: linearHex(0x2a2622), dirt: 0.75, dirtTop: 1.4, dustRgb: linearHex(0x3a3632), dust: 0.25,
    rust: kind === 'v60' ? 0.25 : 0.6, wheels: axles.map((z) => ({ z, y: r, r })), seed: (opts.seed ?? 7) + kind.length * 31, voxelAo: !coarse,
  }));
  // the painted bucket's streams (no surface stream: the props' baked material reads colours alone)
  g.deleteAttribute('surf');
  delete g.userData.bodyBox;
  delete g.userData.noCollisionVertices;
  return g;
}
