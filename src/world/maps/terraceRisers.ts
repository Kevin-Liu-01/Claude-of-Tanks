// src/world/maps/terraceRisers.ts — the terraces' dry-stone risers as built walls (props lane A, family #6, 2026-10-16;
// WORKLIST.md #6 ground:terrace-riser-walls: "every terrace wall on the map is therefore painted on: no stone, coping,
// batter, through-stone steps, or tumble"; the coordinator: the village hill's zone first, a coping ribbon and tumble on
// the contours at n x stepM, render-only, heights through the field, cell-batched with a far LOD).
//
// A terrace zone (terrain.ts TerraceZoneConfig) steps its ground into benches a riser `stepM` high: each tread lies level
// at n x stepM and the riser below it rises to that level over the top share of its step (terrain.ts stepTerraces). Its
// face is painted as coursed dry stone by the terrain shader. Here its top is built: the contour just under each tread
// level, traced over the zone's own ground (marching squares on the height field, 0.5 m), kept only where the ground
// below it drops away and the tread above it is level (a riser, not a lane, a ramp or the levelled settlement), is laid
// with coping stones — each segment a stone, a hand thick, set back over the tread and a little proud of the face, its own
// tone and set — and below the riser's foot, here and there, a stone it shed. On the kit's own stone (regionalStone: the
// Chouf's limestone), fine dressing: props.ts draws it in the fine-detail cells (BatchedMesh, culled by the quality's
// fine distance), and past them the painted riser is its far form. No collision, no stream draws (hash noise).
import { PartSink, type RegionalParts, type Rgb, type Vec3 } from './regional/geometry.ts';

const shade3 = (c: Rgb, k: number): Rgb => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

/** A terrace zone as terrain.ts takes it (TerraceZoneConfig): its outline, its step, its settlement share. */
export interface TerraceRiserZone {
  polygon: readonly (readonly [number, number])[];
  stepM: number;
  feather?: number;
  settlement?: number;
}

interface TerraceRiserOptions {
  /** the ground's height (the props' height field) */
  ground: (x: number, z: number) => number;
  /** where nothing stands (a building, a lane): false skips a stone there */
  clear: (x: number, z: number) => boolean;
  /** the kit stone's tint */
  tint: Rgb;
  /** which zones: the settlement's alone (the village hill) unless `all` */
  all?: boolean;
  /** the grid the contours are traced on, metres */
  cell?: number;
}

function hash(a: number, b: number, seed: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
function inside(poly: TerraceRiserZone['polygon'], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function edgeDistance(poly: TerraceRiserZone['polygon'], x: number, z: number): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return d;
}

/** What the risers built: the parts (regionalStone, fine dressing) and a count of their stones. */
interface TerraceRiserResult { parts: RegionalParts; coping: number; tumble: number; metres: number }

/** A checkpoint of the trace (props.ts PropsBuildSlice's shape: the loading slices it, no progress claimed). */
interface RiserSlice { fine: true; progress: false; stage: string }

/** The zones' riser tops traced and laid with coping, their feet with the odd fallen stone (null if there are none): the
 *  props build's slices, a checkpoint every few rows of the field's trace. */
export function* traceTerraceRisers(zones: readonly TerraceRiserZone[], o: TerraceRiserOptions): Generator<RiserSlice, TerraceRiserResult | null, void> {
  const sink = new PartSink(), cell = o.cell ?? 0.7;
  let coping = 0, tumble = 0, metres = 0;
  const tone = (k: number, j: number, s: number, dark = 1): Rgb => {
    const v = (0.86 + hash(k, j, s) * 0.22) * dark, w = 1 + (hash(j, k, s ^ 0x55) - 0.5) * 0.06;
    return [o.tint[0] * v * w, o.tint[1] * v, o.tint[2] * v / w];
  };
  for (const zone of zones) {
    if (!o.all && !((zone.settlement ?? 0) > 0)) continue;
    const xs = zone.polygon.map((p) => p[0]), zs = zone.polygon.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
    const H = new Float32Array(nx * nz);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const h = o.ground(x0 + i * cell, z0 + j * cell);
        H[j * nx + i] = h; lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      if (j % 3 === 2) yield { fine: true, progress: false, stage: 'terrace-risers' };
    }
    const step = zone.stepM, feather = zone.feather ?? 8;
    // the traced grid read back bilinearly (the riser tests and the gradient: no more field queries than the trace's)
    const at = (x: number, z: number) => {
      const fi = Math.max(0, Math.min(nx - 1.001, (x - x0) / cell)), fj = Math.max(0, Math.min(nz - 1.001, (z - z0) / cell));
      const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
      const a = H[j * nx + i], b = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1];
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    };
    for (let n = Math.ceil(lo / step); n * step <= hi; n++) {
      const tread = n * step, iso = tread - 0.05;
      for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
        // marching squares: the cell's crossings of the iso line (a saddle's two segments read as one pair, either way)
        const c = [H[j * nx + i], H[j * nx + i + 1], H[(j + 1) * nx + i + 1], H[(j + 1) * nx + i]];
        const corners: Array<[number, number]> = [[x0 + i * cell, z0 + j * cell], [x0 + (i + 1) * cell, z0 + j * cell],
          [x0 + (i + 1) * cell, z0 + (j + 1) * cell], [x0 + i * cell, z0 + (j + 1) * cell]];
        const cross: Array<[number, number]> = [];
        for (let e = 0; e < 4; e++) {
          const a = c[e], b = c[(e + 1) % 4];
          if ((a < iso) === (b < iso)) continue;
          const t = (iso - a) / (b - a);
          cross.push([corners[e][0] + (corners[(e + 1) % 4][0] - corners[e][0]) * t, corners[e][1] + (corners[(e + 1) % 4][1] - corners[e][1]) * t]);
        }
        for (let s = 0; s + 1 < cross.length; s += 2) {
          const [ax, az] = cross[s], [bx, bz] = cross[s + 1];
          const len = Math.hypot(bx - ax, bz - az);
          if (len < 0.08) continue;
          const mx = (ax + bx) / 2, mz = (az + bz) / 2;
          if (!inside(zone.polygon, mx, mz) || edgeDistance(zone.polygon, mx, mz) < feather) continue;
          // uphill across the contour, from the field
          const gx = at(mx + 0.3, mz) - at(mx - 0.3, mz), gz = at(mx, mz + 0.3) - at(mx, mz - 0.3), gl = Math.hypot(gx, gz);
          if (gl < 1e-4) continue;
          const ux = gx / gl, uz = gz / gl;
          // a riser: the tread above level at its height, the ground below dropping away
          const above = at(mx + ux * 0.45, mz + uz * 0.45), below = at(mx - ux * 0.45, mz - uz * 0.45);
          // (the village's risers stand as steep as the ground lets them, terrain.ts riserGrade: a drop of a tenth in 0.45 m
          // is a riser; a lane, a ramp or the settlement's levelled pads are not)
          if (Math.abs(above - tread) > 0.08 || below > tread - 0.1) continue;
          if (!o.clear(mx, mz) || !o.clear(mx + ux * 0.4, mz + uz * 0.4)) continue;
          metres += len;
          // the coping stone over this segment: its top over the tread, a little proud of the face, a hand thick
          const k = Math.round(mx * 4) * 7919 + Math.round(mz * 4), set = (hash(k, n, 0x7e1) - 0.5) * 0.03;
          const yTop = tread + 0.055 + set, yFoot = tread - 0.17, back = 0.34, proud = 0.07;
          const a: Vec3 = [ax - ux * proud, yTop, az - uz * proud], b: Vec3 = [bx - ux * proud, yTop, bz - uz * proud];
          const a2: Vec3 = [ax + ux * back, yTop - 0.012, az + uz * back], b2: Vec3 = [bx + ux * back, yTop - 0.012, bz + uz * back];
          // (the 227 sweep: a face's foot stood 3 cm over the ground where the riser drops steeper) each end of the face down
          // to the ground under it, a few centimetres into it
          const af: Vec3 = [a[0], Math.min(yFoot, at(a[0], a[2]) - 0.04), a[2]], bf: Vec3 = [b[0], Math.min(yFoot, at(b[0], b[2]) - 0.04), b[2]];
          const colour = tone(k, n, 0x7e2);
          // (the 227 sweep: each stone a flat top and a flat face, 85 % plain primitives) each coping stone dressed as one:
          // its top swelling a centimetre along its middle, its front arris knocked off, the face under it
          const lift = (p: Vec3, dy: number): Vec3 => [p[0], p[1] + dy, p[2]];
          const back2 = (p: Vec3, d: number): Vec3 => [p[0] + ux * d, p[1], p[2] + uz * d];
          const ac = back2(a, 0.025), bc = back2(b, 0.025), ad = lift(a, -0.025), bd = lift(b, -0.025);
          const ma = lift([(ac[0] + a2[0]) / 2, (ac[1] + a2[1]) / 2, (ac[2] + a2[2]) / 2], 0.01);
          const mb = lift([(bc[0] + b2[0]) / 2, (bc[1] + b2[1]) / 2, (bc[2] + b2[2]) / 2], 0.01);
          // each quad wound to face `dir` (its normal checked against it)
          const toward = (p: Vec3, q: Vec3, r: Vec3, s2: Vec3, dir: Vec3, c: Rgb) => {
            const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
            const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
            if (nx * dir[0] + ny * dir[1] + nz * dir[2] > 0) sink.quad('regionalStone', p, q, r, s2, { colour: c, decor: true, fine: true });
            else sink.quad('regionalStone', p, s2, r, q, { colour: c, decor: true, fine: true });
          };
          const faceOut: Vec3 = [-ux, 0, -uz], arrisOut: Vec3 = [-ux, 1, -uz];
          toward(ac, bc, mb, ma, [0, 1, 0], colour);
          toward(ma, mb, b2, a2, [0, 1, 0], colour);
          toward(ad, bd, bc, ac, arrisOut, tone(k, n, 0x7e2, 0.96));
          // the face down the riser (seen from downhill)
          toward(ad, bd, bf, af, faceOut, tone(k, n, 0x7e2, 0.92));
          coping++;
          // now and then a stone the riser shed, at its foot: down the slope until the tread below
          if (hash(k, n, 0x7e3) < 0.16) {
            let fxp = mx, fzp = mz;
            for (let t = 0; t < 12 && at(fxp, fzp) > tread - step + 0.1; t++) { fxp -= ux * 0.25; fzp -= uz * 0.25; }
            const out = 0.15 + hash(k, n, 0x7e4) * 0.35;
            fxp -= ux * out; fzp -= uz * out;
            if (!o.clear(fxp, fzp) || !inside(zone.polygon, fxp, fzp)) continue;
            const y = at(fxp, fzp), r = 0.12 + hash(k, n, 0x7e5) * 0.12, h = r * (0.55 + hash(k, n, 0x7e6) * 0.3), turn = hash(k, n, 0x7e7) * Math.PI;
            const pt = (ang: number, rr: number, yy: number): Vec3 => [fxp + Math.cos(turn + ang) * rr, yy, fzp + Math.sin(turn + ang) * rr];
            // (the 227 sweep: a shed stone's downhill side 3 cm over the slope) its bed each corner down into the ground there
            const ring = [0, 1, 2, 3, 4].map((q) => { const p = pt((q / 5) * Math.PI * 2, r * (0.8 + hash(q, k, 0x7e8) * 0.35), y - h * 0.3); return [p[0], Math.min(p[1], at(p[0], p[2]) - 0.03), p[2]] as Vec3; });
            // (227) the shed stone rounded: a shoulder ring between its bed and its crown, turned a half step
            const shoulder = [0, 1, 2, 3, 4].map((q) => pt(((q + 0.5) / 5) * Math.PI * 2, r * (0.62 + hash(q, k, 0x7ea) * 0.2), y + h * 0.42));
            const apex: Vec3 = [fxp, y + h, fzp], col = tone(k, n, 0x7e9, 0.85);
            const outward = (tri: Vec3[]): Vec3[] => {
              const [p1, p2, p3] = tri, cx = (p1[0] + p2[0] + p3[0]) / 3 - fxp, cz = (p1[2] + p2[2] + p3[2]) / 3 - fzp, cy = (p1[1] + p2[1] + p3[1]) / 3 - y;
              const e1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]], e2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
              const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
              return nx * cx + ny * cy + nz * cz > 0 ? tri : [p1, p3, p2];
            };
            for (let q = 0; q < 5; q++) {
              const p1 = ring[q], p2 = ring[(q + 1) % 5], s1 = shoulder[q], s0 = shoulder[(q + 4) % 5];
              sink.polygon('regionalStone', outward([p1, p2, s1]), { colour: col, decor: true, fine: true });
              sink.polygon('regionalStone', outward([p1, s1, s0]), { colour: col, decor: true, fine: true });
              sink.polygon('regionalStone', outward([s1, shoulder[(q + 1) % 5], apex]), { colour: shade3(col, 1.06), decor: true, fine: true });
            }
            tumble++;
          }
        }
      }
    }
  }
  if (!coping) return null;
  return { parts: sink.finish(), coping, tumble, metres };
}

/** The trace run through (the receipts, the stills). */
export function buildTerraceRisers(zones: readonly TerraceRiserZone[], o: TerraceRiserOptions): TerraceRiserResult | null {
  const it = traceTerraceRisers(zones, o);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
