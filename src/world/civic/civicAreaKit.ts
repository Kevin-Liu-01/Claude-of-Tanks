// src/world/civic/civicAreaKit.ts — a town square's civic area from its plan (the maps lane, 228; the owner, 2026-10-18:
// "completely fill in this steinburg center", the pick "a civic square with a tree-lined green, memorial column and
// parked period cars"; 2026-10-19: one shared kit every map with a square adopts through its plan).
//
// What it lays (one geometry on the props' vertex-coloured baked material, no draw of its own, no record):
//   - the roundel at the crossing: the granite ring band flush in the setts, the basalt rose at its heart;
//   - each bed of the green: its granite kerb in units, the dwarf wall inside it in dressed units under a chamfered
//     coping, the gate piers at its mouths with their caps, its gravel paths edged with a row of setts, worn patches at
//     the mouths, and its feature (a flower roundel on its sandstone edge in its gravel ring; a clipped box arc);
//   - the flush paving the plan names (granite bands, a forecourt's setts, a church path's flags), the frontage walks
//     along every facade that fronts the room (flags in courses and the Rinne at their foot), the fountain's ring;
//   - the church's landing steps, the parking bays' pale sett rows, the tree grates in their granite frames, the
//     monument's gravel octagon with its chain posts.
// What it returns for the props to place after every seeded pass (stream-neutral): its furniture, its parked vehicles,
// its lamps and its railing modules as props destructibles; its room as a veto (the scatter passes after the landmarks
// keep their draws and leave out what they would stand there); its lawns' rectangles (the terrain's mask).
//
// The plan carries every seat; this file names no map.
import type * as THREE from 'three';
import { CivicMesh, hexRgb, mixRgb, scaleRgb, toned, civicHash, type Rgb } from './civicMesh.ts';
import type { RegionalCivicStyle } from './styles.ts';
import type { CivicAreaPlan, CivicBed, CivicRect } from './types.ts';

/** A placed building's plot (props buildingFeatures): centre, full width (local x) and depth (local z), heading. */
export interface CivicPlot { readonly x: number; readonly z: number; readonly w: number; readonly d: number; readonly rot: number }

export interface CivicAreaContext {
  ground(x: number, z: number): number;
  tier: 'desktop' | 'mobile';
  /** the plots standing when the area is composed: the frontage walks run along the ones that front its room */
  plots: readonly CivicPlot[];
}

/** One props destructible the area adds: its kind, world seat, heading (radians) and scale. */
export interface CivicPiece { kind: string; x: number; z: number; yaw: number; scale: number }

export interface CivicAreaBuild {
  geometry: THREE.BufferGeometry | null;
  pieces: CivicPiece[];
  veto: CivicRect;
  census: Record<string, number>;
  /** plan outlines for the probes' plots (flat [x, z, ...] lists) */
  debug: Array<{ pts: number[]; col: [number, number, number]; fill?: [number, number, number] }>;
}

const SKIN = 0.014;
const deg = (d: number): number => (d * Math.PI) / 180;

/** The distance from (x, z) to a rectangle (0 inside). */
function rectDistance(r: CivicRect, x: number, z: number): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}
const inRect = (r: CivicRect, x: number, z: number, m = 0): boolean => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

/** Flags in courses over a rectangle: courses `course` m across the long axis, flags of lengths in `len` along it, each
 *  its own tone, laid on a joint bed. */
function flagRect(m: CivicMesh, r: CivicRect, style: RegionalCivicStyle, lift = SKIN, salt = 1): void {
  const base = hexRgb(style.pavement.hex), joint = hexRgb(style.pavement.joint);
  const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
  const L = alongX ? r.x1 - r.x0 : r.z1 - r.z0, W = alongX ? r.z1 - r.z0 : r.x1 - r.x0;
  m.skinRect(r.x0, r.z0, r.x1, r.z1, lift - 0.004, joint, 2.0);
  const courses = Math.max(1, Math.round(W / style.pavement.course)), cw = W / courses, gap = 0.012;
  const [l0, l1] = style.pavement.length;
  for (let k = 0; k < courses; k++) {
    let s = (civicHash(k, salt, 77) * (l1 - l0)) % (l1 - l0);
    // the first flag of a course cut short so the joints break bond
    let first = true;
    for (let a = 0; a < L - 0.02;) {
      const len = first ? Math.max(0.2, l0 * 0.5 + s) : l0 + civicHash(a, k + salt * 13, 31) * (l1 - l0);
      first = false; s = 0;
      const b = Math.min(L, a + len);
      const u0 = a + gap / 2, u1 = b - gap / 2, v0 = k * cw + gap / 2, v1 = (k + 1) * cw - gap / 2;
      const col = toned(base, a + r.x0, k + r.z0, style.pavement.tone, salt);
      if (alongX) m.skinRect(r.x0 + u0, r.z0 + v0, r.x0 + u1, r.z0 + v1, lift, col, 1.2);
      else m.skinRect(r.x0 + v0, r.z0 + u0, r.x0 + v1, r.z0 + u1, lift, col, 1.2);
      a = b;
    }
  }
}

/** A band of granite units (0.5 m across the band's long axis, 0.8–1.2 m along), flush. */
function graniteRect(m: CivicMesh, r: CivicRect, hex: number, lift = SKIN, unit = 1.0): void {
  const base = hexRgb(hex);
  const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
  const L = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
  m.skinRect(r.x0, r.z0, r.x1, r.z1, lift - 0.004, scaleRgb(base, 0.55), 2.0);
  const n = Math.max(1, Math.round(L / unit)), u = L / n, gap = 0.01;
  for (let k = 0; k < n; k++) {
    const col = toned(base, k, r.x0 + r.z0, 0.07, 5);
    if (alongX) m.skinRect(r.x0 + k * u + gap, r.z0 + gap, r.x0 + (k + 1) * u - gap, r.z1 - gap, lift, col, 1.2);
    else m.skinRect(r.x0 + gap, r.z0 + k * u + gap, r.x1 - gap, r.z0 + (k + 1) * u - gap, lift, col, 1.2);
  }
}

/** A field of small setts drawn as a toned mosaic (a cell a sett group: the terrain's own setts carry the joints). */
function settRect(m: CivicMesh, r: CivicRect, hex: number, lift = SKIN): void {
  const base = hexRgb(hex);
  m.skinRect(r.x0, r.z0, r.x1, r.z1, lift, (x, z) => toned(base, Math.floor(x / 0.3), Math.floor(z / 0.3), 0.09, 9), 0.3);
}

/** A kerb (or a coping, a wall unit run) from a to b in units, its section from `section(end, top)`; each unit toned. */
function unitRun(m: CivicMesh, a: readonly [number, number], b: readonly [number, number], side: readonly [number, number],
  units: readonly [number, number], col: Rgb, k: number, section: (ga: number, gb: number, end: 0 | 1) => ReadonlyArray<readonly [number, number]>, salt: number): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.05) return;
  const n = Math.max(1, Math.round(len / ((units[0] + units[1]) / 2))), joint = 0.008;
  for (let i = 0; i < n; i++) {
    const t0 = i / n + (i ? joint / 2 / len : 0), t1 = (i + 1) / n - (i < n - 1 ? joint / 2 / len : 0);
    const p: [number, number] = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
    const q: [number, number] = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
    const gp = m.ground(p[0], p[1]), gq = m.ground(q[0], q[1]);
    const c = toned(col, p[0] + i * 0.37, p[1], k, salt);
    m.run(p, q, side, (end) => section(gp, gq, end), (face) => (face === -1 ? scaleRgb(c, 0.9) : c));
  }
}

/** The four sides of a bed rectangle, each with its outward normal and its run along it (counter-clockwise). */
function bedSides(r: CivicRect): Array<{ side: 'n' | 's' | 'e' | 'w'; a: [number, number]; b: [number, number]; out: [number, number] }> {
  return [
    { side: 's', a: [r.x0, r.z0], b: [r.x1, r.z0], out: [0, -1] },
    { side: 'e', a: [r.x1, r.z0], b: [r.x1, r.z1], out: [1, 0] },
    { side: 'n', a: [r.x1, r.z1], b: [r.x0, r.z1], out: [0, 1] },
    { side: 'w', a: [r.x0, r.z1], b: [r.x0, r.z0], out: [-1, 0] },
  ];
}

/** A side's stretches between its mouths' openings (inset `inset` from the corners): [from, to] along it, world. */
function sideStretches(r: CivicRect, side: 'n' | 's' | 'e' | 'w', bed: CivicBed, inset: number): Array<[number, number]> {
  const horiz = side === 'n' || side === 's';
  const lo = (horiz ? r.x0 : r.z0) + inset, hi = (horiz ? r.x1 : r.z1) - inset;
  const cuts = bed.mouths.filter((mo) => mo.side === side).map((mo) => [mo.at - mo.width / 2, mo.at + mo.width / 2] as [number, number])
    .sort((p, q) => p[0] - q[0]);
  const out: Array<[number, number]> = [];
  let at = lo;
  for (const [c0, c1] of cuts) { if (c0 > at) out.push([at, Math.min(c0, hi)]); at = Math.max(at, c1); }
  if (at < hi) out.push([at, hi]);
  return out;
}

/** A point on a side at `t` along it, `off` metres in from the edge. */
function sidePoint(r: CivicRect, side: 'n' | 's' | 'e' | 'w', t: number, off: number): [number, number] {
  switch (side) {
    case 'n': return [t, r.z1 - off];
    case 's': return [t, r.z0 + off];
    case 'e': return [r.x1 - off, t];
    default: return [r.x0 + off, t];
  }
}

/** Whether (x, z) lies on one of a bed's paths (its width and `margin` more). */
function onBedPath(bed: CivicBed, x: number, z: number, margin = 0): boolean {
  for (const p of bed.paths) {
    const dx = p.to[0] - p.from[0], dz = p.to[1] - p.from[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - p.from[0]) * dx + (z - p.from[1]) * dz) / l2));
    if (Math.hypot(x - p.from[0] - dx * t, z - p.from[1] - dz * t) <= p.width / 2 + margin) return true;
  }
  return false;
}

function composeBed(m: CivicMesh, bed: CivicBed, style: RegionalCivicStyle, pieces: CivicPiece[], census: Record<string, number>, tier: 'desktop' | 'mobile'): void {
  const r = bed.rect, E = style.edging;
  // the mown lawn inside the dwarf wall: a sward of a few greens in drifts, a worn margin along the wall's foot
  const greens = style.lawn.greens.map(hexRgb), bareCol = hexRgb(style.lawn.bare), inset = E.kerb.width + E.wall.width;
  const lawnAt = (x: number, z: number): Rgb => {
    const n = civicHash(Math.floor(x / 2.3), Math.floor(z / 2.3), 61) * 0.6 + civicHash(Math.floor(x / 0.9), Math.floor(z / 0.9), 62) * 0.4;
    const edge = Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z) - inset;
    const g = greens[Math.min(greens.length - 1, Math.floor(n * greens.length))];
    return edge < 0.6 ? mixRgb(g, bareCol, 0.35 * (1 - edge / 0.6)) : g;
  };
  m.skinRect(r.x0 + inset, r.z0 + inset, r.x1 - inset, r.z1 - inset, 0.006, lawnAt, 0.9);
  census.lawnM2 = (census.lawnM2 ?? 0) + (r.x1 - r.x0 - 2 * inset) * (r.z1 - r.z0 - 2 * inset);
  const kerbCol = hexRgb(E.kerb.hex), wallCol = hexRgb(E.wall.hex), pierCol = hexRgb(E.pier.hex);
  const kw = E.kerb.width, ww = E.wall.width;
  for (const s of bedSides(r)) {
    const horiz = s.side === 'n' || s.side === 's';
    // the kerb's run goes the whole side (the mouths' thresholds are the kerb dropped flush); the wall stops at the mouths
    const inward: [number, number] = [-s.out[0], -s.out[1]];
    for (const [t0, t1] of sideStretches(r, s.side, bed, 0)) {
      const a = sidePoint(r, s.side, t0, kw / 2), b = sidePoint(r, s.side, t1, kw / 2);
      unitRun(m, a, b, inward, [1.0, 1.4], kerbCol, 0.06, (ga, gb, end) => {
        const g = end ? gb : ga, top = g + E.kerb.face, foot = g - 0.12;
        // across `inward`: -kw/2 the road side (outside), its arris rounded off
        return [[-kw / 2, foot], [kw / 2, foot], [kw / 2, top], [-kw / 2 + 0.04, top], [-kw / 2, top - 0.04]];
      }, 11);
    }
    // the thresholds at the mouths: a flush granite sill across each opening
    for (const mo of bed.mouths.filter((q) => q.side === s.side)) {
      const a = sidePoint(r, s.side, mo.at - mo.width / 2, 0), b = sidePoint(r, s.side, mo.at + mo.width / 2, kw + ww);
      m.skinRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), SKIN + 0.004, scaleRgb(kerbCol, 0.96), 0.8);
    }
    // the dwarf wall: dressed units 0.30 wide, its coping a little proud of both faces, chamfered
    const wallStretches = sideStretches(r, s.side, bed, kw);
    for (const [t0, t1] of wallStretches) {
      const a = sidePoint(r, s.side, t0, kw + ww / 2), b = sidePoint(r, s.side, t1, kw + ww / 2);
      const H = E.wall.height, cop = E.wall.coping;
      unitRun(m, a, b, inward, [0.8, 1.3], wallCol, 0.08, (ga, gb, end) => {
        const g = end ? gb : ga;
        return [[-ww / 2, g - 0.1], [ww / 2, g - 0.1], [ww / 2, g + H - 0.06], [-ww / 2, g + H - 0.06]];
      }, 23);
      unitRun(m, a, b, inward, [0.9, 1.4], scaleRgb(wallCol, 1.06), 0.05, (ga, gb, end) => {
        const g = end ? gb : ga, y0 = g + H - 0.06, y1 = g + H;
        return [[-ww / 2 - cop, y0], [ww / 2 + cop, y0], [ww / 2 + cop, y1 - 0.015], [ww / 2 + cop - 0.02, y1], [-ww / 2 - cop + 0.02, y1], [-ww / 2 - cop, y1 - 0.015]];
      }, 29);
      // the railing modules behind the wall (lawn side), open at the mouths
      if (E.railing && !bed.mouths.some((mo) => mo.side === s.side && mo.open && t0 >= mo.at - mo.width / 2 - 0.01 && t1 <= mo.at + mo.width / 2 + 0.01)) {
        const len = t1 - t0, pitch = E.railing.pitch * E.railing.scale, n = Math.floor(len / pitch + 0.15);
        const lead = (len - n * pitch) / 2;
        for (let k = 0; k < n; k++) {
          const t = t0 + lead + (k + 0.5) * pitch;
          const [x, z] = sidePoint(r, s.side, t, kw + ww + 0.07);
          pieces.push({ kind: E.railing.kind, x, z, yaw: horiz ? Math.PI / 2 : 0, scale: E.railing.scale });
          census.railing = (census.railing ?? 0) + 1;
        }
      }
    }
    // the gate piers either side of each mouth on the wall's line, their caps
    for (const mo of bed.mouths.filter((q) => q.side === s.side)) {
      for (const sgn of [-1, 1]) {
        const t = mo.at + sgn * (mo.width / 2 + E.pier.size / 2);
        const [x, z] = sidePoint(r, s.side, t, kw + ww / 2);
        const yaw = horiz ? 0 : Math.PI / 2;
        m.block(x, z, yaw, E.pier.size / 2, E.pier.size / 2, E.pier.height, toned(pierCol, x, z, 0.05, 3), { level: true, ch: 0.02, embed: 0.1 });
        m.block(x, z, yaw, E.pier.size / 2 + 0.035, E.pier.size / 2 + 0.035, E.pier.height + 0.07, scaleRgb(pierCol, 1.08),
          { level: true, ch: 0.025, top: m.ground(x, z) + E.pier.height + 0.07, embed: -E.pier.height + 0.01 });
        census.piers = (census.piers ?? 0) + 1;
      }
      // the worn ground at the mouth inside the gate (bare earth either side of the path)
      const [px, pz] = sidePoint(r, s.side, mo.at, kw + ww + 1.2);
      const bare = hexRgb(style.lawn.bare);
      for (let q = 0; q < 2; q++) {
        const off = (q ? 1 : -1) * (mo.width / 2 + 0.5);
        const cx = horiz ? px + off : px, cz = horiz ? pz : pz + off;
        m.skinRing(cx, cz, 0, 0.75 + civicHash(cx, cz, 4) * 0.35, 7, SKIN - 0.004, (k) => toned(bare, cx + k, cz, 0.08, 6));
      }
    }
  }
  // the gravel paths, their edges a row of setts
  const pathCol = hexRgb(style.path.hex), edgeCol = hexRgb(style.path.edgeHex);
  const ring = bed.feature?.kind === 'flowerRondell' ? bed.feature : null;
  for (const p of bed.paths) {
    const dx = p.to[0] - p.from[0], dz = p.to[1] - p.from[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    const nx = -uz, nz = ux, hw = p.width / 2;
    // the stretches outside the feature's ring
    const spans: Array<[number, number]> = [];
    if (ring) {
      const t = (ring.x - p.from[0]) * ux + (ring.z - p.from[1]) * uz, off = Math.abs((ring.x - p.from[0]) * nx + (ring.z - p.from[1]) * nz);
      if (off < ring.ring) {
        const half = Math.sqrt(ring.ring * ring.ring - off * off) - 0.3;
        spans.push([0, Math.max(0, t - half)], [Math.min(len, t + half), len]);
      } else spans.push([0, len]);
    } else spans.push([0, len]);
    for (const [s0, s1] of spans) {
      if (s1 - s0 < 0.1) continue;
      const P = (s: number, o: number): [number, number] => [p.from[0] + ux * s + nx * o, p.from[1] + uz * s + nz * o];
      m.skin(P(s0, -hw), P(s1, -hw), P(s1, hw), P(s0, hw), SKIN, (x, z) => toned(pathCol, Math.floor(x / 0.7), Math.floor(z / 0.7), 0.05, 12), 0.7);
      for (const o of [-hw, hw]) {
        const n = Math.max(1, Math.round((s1 - s0) / 0.14));
        for (let k = 0; k < n; k++) {
          const a = s0 + (s1 - s0) * k / n, b = s0 + (s1 - s0) * (k + 1) / n - 0.012, e = o > 0 ? o - 0.13 : o;
          m.skin(P(a, e), P(b, e), P(b, e + 0.13), P(a, e + 0.13), SKIN + 0.006, toned(edgeCol, a, o, 0.1, 13), 0.5);
        }
      }
      census.pathM2 = (census.pathM2 ?? 0) + (s1 - s0) * p.width;
    }
  }
  if (ring) {
    // the gravel ring, the flower bed's sandstone edge, its soil and its begonias in rings, red and white
    m.skinRing(ring.x, ring.z, ring.r, ring.ring, 40, SKIN, (k) => toned(pathCol, k, ring.x, 0.05, 14));
    const edge = hexRgb(style.edging.wall.hex);
    for (let k = 0; k < 20; k++) {
      const a0 = (k / 20) * Math.PI * 2, a1 = ((k + 0.95) / 20) * Math.PI * 2, rr = ring.r - 0.12;
      const p0: [number, number] = [ring.x + Math.sin(a0) * rr, ring.z + Math.cos(a0) * rr], p1: [number, number] = [ring.x + Math.sin(a1) * rr, ring.z + Math.cos(a1) * rr];
      const mid = (a0 + a1) / 2, out: [number, number] = [Math.sin(mid), Math.cos(mid)];
      const g = m.ground(ring.x, ring.z);
      m.run(p0, p1, out, () => [[-0.12, g - 0.08], [0.12, g - 0.08], [0.12, g + 0.1], [0.1, g + 0.12], [-0.1, g + 0.12], [-0.12, g + 0.1]], toned(edge, k, 2, 0.06, 15));
    }
    m.skinRing(ring.x, ring.z, 0, ring.r - 0.24, 24, 0.07, () => hexRgb(0x3a2e22));
    const flowers = style.flowers.map(hexRgb), leaf = hexRgb(0x2e4a26);
    // the bedding in rings: each plant a low cushion of leaves (eight-sided) under its dome of blooms, red and white in
    // alternate rings, a plant's blooms its own shade
    const rings = tier === 'mobile' ? 3 : 5;
    for (let band = 0; band < rings; band++) {
      const rr = 0.3 + band * ((ring.r - 0.65) / Math.max(1, rings - 1)), n = Math.max(4, Math.round((Math.PI * 2 * rr) / 0.34));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + band * 0.37, cx = ring.x + Math.sin(a) * rr, cz = ring.z + Math.cos(a) * rr;
        const bloom = toned(flowers[(band % 2) * 2 + (k % 2)] ?? flowers[0], cx, cz, 0.12, 63), g = m.ground(cx, cz) + 0.07;
        const h = 0.16 + civicHash(cx, cz, 16) * 0.06, rad = 0.17, seg = tier === 'mobile' ? 5 : 8;
        const top = [cx, g + h, cz];
        for (let sg = 0; sg < seg; sg++) {
          const b0 = (sg / seg) * Math.PI * 2, b1 = ((sg + 1) / seg) * Math.PI * 2, bm = (b0 + b1) / 2;
          const q0 = [cx + Math.sin(b0) * rad, g, cz + Math.cos(b0) * rad], q1 = [cx + Math.sin(b1) * rad, g, cz + Math.cos(b1) * rad];
          const w0 = [cx + Math.sin(b0) * rad * 0.7, g + h * 0.6, cz + Math.cos(b0) * rad * 0.7], w1 = [cx + Math.sin(b1) * rad * 0.7, g + h * 0.6, cz + Math.cos(b1) * rad * 0.7];
          const out = [Math.sin(bm), 0.5, Math.cos(bm)];
          m.quad(q0, q1, w1, w0, scaleRgb(leaf, 0.9 + 0.2 * civicHash(cx, sg, 64)), out);
          m.tri(w0, w1, top, bloom, [Math.sin(bm), 1.4, Math.cos(bm)]);
        }
        census.flowers = (census.flowers ?? 0) + 1;
      }
    }
  }
  if (bed.feature?.kind === 'hedgeArc') {
    const f = bed.feature, hedge = hexRgb(style.hedge);
    const a0 = deg(f.fromDeg), a1 = deg(f.toDeg), n = Math.max(4, Math.round(Math.abs(a1 - a0) * f.r / 0.45));
    for (let k = 0; k < n; k++) {
      const p = a0 + (a1 - a0) * (k / n), q = a0 + (a1 - a0) * ((k + 1) / n), mid = (p + q) / 2;
      const P0: [number, number] = [f.x + Math.sin(p) * f.r, f.z + Math.cos(p) * f.r], P1: [number, number] = [f.x + Math.sin(q) * f.r, f.z + Math.cos(q) * f.r];
      const cx = (P0[0] + P1[0]) / 2, cz = (P0[1] + P1[1]) / 2;
      if (onBedPath(bed, cx, cz, 0.35)) continue;
      const out: [number, number] = [Math.sin(mid), Math.cos(mid)], H = f.height * (0.95 + civicHash(cx, cz, 17) * 0.1);
      const g0 = m.ground(P0[0], P0[1]), g1 = m.ground(P1[0], P1[1]);
      // a clipped box hedge: square sides, its top rounded; each length its own green
      m.run(P0, P1, out, (end) => {
        const g = end ? g1 : g0;
        return [[-0.32, g - 0.05], [0.32, g - 0.05], [0.33, g + H * 0.72], [0.22, g + H], [-0.22, g + H], [-0.33, g + H * 0.72]];
      }, (face) => toned(face === 3 ? scaleRgb(hedge, 1.18) : hedge, cx, cz + face, 0.1, 18), false);
      census.hedgeM = (census.hedgeM ?? 0) + f.r * Math.abs(q - p);
    }
  }
}

/** The frontage walks: along each plot's face that fronts the room (within 3.5 m of it, facing it), flags `width` wide
 *  out from the facade and the Rinne at their foot; not over a bed, an arm's prop-free middle is no matter (paving). */
function frontageWalks(m: CivicMesh, area: CivicAreaPlan, plots: readonly CivicPlot[], style: RegionalCivicStyle, census: Record<string, number>,
  debug: CivicAreaBuild['debug']): void {
  const room = area.room, cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
  const W = 2.0, G = style.gutter.width, base = hexRgb(style.pavement.hex), joint = hexRgb(style.pavement.joint), gut = hexRgb(style.gutter.hex);
  for (const b of plots) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const ax: [number, number] = [c, -s], az: [number, number] = [s, c];
    for (const [nrm, half, along, alongHalf] of [
      [ax, b.w / 2, az, b.d / 2], [[-ax[0], -ax[1]], b.w / 2, az, b.d / 2], [az, b.d / 2, ax, b.w / 2], [[-az[0], -az[1]], b.d / 2, ax, b.w / 2],
    ] as Array<[[number, number], number, [number, number], number]>) {
      const mx = b.x + nrm[0] * half, mz = b.z + nrm[1] * half;
      if (inRect(room, mx, mz, -0.5)) continue; // a plot inside the room is not its frontage
      if (rectDistance(room, mx, mz) > 3.5) continue;
      if (nrm[0] * (cx - mx) + nrm[1] * (cz - mz) <= 0) continue;
      // the face must turn to the room squarely (within 30 degrees of the room edge it faces)
      const toRoom = Math.abs(nrm[0]) > Math.abs(nrm[1]) ? [Math.sign(nrm[0]), 0] : [0, Math.sign(nrm[1])];
      if (nrm[0] * toRoom[0] + nrm[1] * toRoom[1] < 0.86) continue;
      // the walk's cells along the face, a metre at a time; each cell kept off the beds and the room's outside
      const n = Math.max(1, Math.round((alongHalf * 2) / 1.0));
      for (let k = 0; k < n; k++) {
        const t0 = -alongHalf + (alongHalf * 2 * k) / n, t1 = -alongHalf + (alongHalf * 2 * (k + 1)) / n;
        const at = (t: number, o: number): [number, number] => [mx + along[0] * t + nrm[0] * o, mz + along[1] * t + nrm[1] * o];
        const mid = at((t0 + t1) / 2, W / 2);
        if (!inRect(room, mid[0], mid[1], 1.5)) continue;
        if (area.beds.some((bed) => inRect(bed.rect, mid[0], mid[1], 0.6))) continue;
        if (area.paving.some((p) => inRect(p.rect, mid[0], mid[1], 0.2))) continue;
        // flags in two courses (1.0 m each) on the joint bed, then the Rinne's three rows of setts, dished
        m.skin(at(t0, 0.02), at(t1, 0.02), at(t1, W), at(t0, W), SKIN - 0.004, joint, 1.2);
        for (let q = 0; q < 2; q++) {
          const o0 = 0.02 + q * (W / 2) + 0.006, o1 = 0.02 + (q + 1) * (W / 2) - 0.006, sh = (k + q) % 2 ? 0.5 : 0;
          const cuts = [t0, t0 + (t1 - t0) * (0.35 + sh * 0.3), t1];
          for (let j = 0; j + 1 < cuts.length; j++) {
            const a = cuts[j] + 0.006, e = cuts[j + 1] - 0.006;
            m.skin(at(a, o0), at(e, o0), at(e, o1), at(a, o1), SKIN, toned(base, mid[0] + j + q * 3, mid[1] + k, style.pavement.tone, 21), 1.2);
          }
        }
        for (let row = 0; row < style.gutter.rows; row++) {
          const o0 = W + (row * G) / style.gutter.rows + 0.005, o1 = W + ((row + 1) * G) / style.gutter.rows - 0.005;
          const dip = row === 1 ? -style.gutter.dish : -style.gutter.dish * 0.5;
          const ns = Math.max(1, Math.round((t1 - t0) / 0.16));
          for (let j = 0; j < ns; j++) {
            const a = t0 + ((t1 - t0) * j) / ns + 0.005, e = t0 + ((t1 - t0) * (j + 1)) / ns - 0.005;
            m.skin(at(a, o0), at(e, o0), at(e, o1), at(a, o1), SKIN + dip * 0.2, toned(gut, a + row, mid[1], 0.12, 22), 0.6);
          }
        }
        census.walkM2 = (census.walkM2 ?? 0) + (t1 - t0) * W;
      }
      const p0 = [mx + along[0] * -alongHalf, mz + along[1] * -alongHalf], p1 = [mx + along[0] * alongHalf, mz + along[1] * alongHalf];
      debug.push({ pts: [p0[0], p0[1], p1[0], p1[1], p1[0] + nrm[0] * W, p1[1] + nrm[1] * W, p0[0] + nrm[0] * W, p0[1] + nrm[1] * W], col: [150, 120, 60] });
    }
  }
}

/** A civic area composed from its plan: its geometry, the destructibles it adds, its veto. */
export function composeCivicArea(area: CivicAreaPlan, style: RegionalCivicStyle, ctx: CivicAreaContext): CivicAreaBuild {
  const m = new CivicMesh(ctx.ground);
  const pieces: CivicPiece[] = [];
  const census: Record<string, number> = {};
  const debug: CivicAreaBuild['debug'] = [];
  const granite = hexRgb(style.bands.granite), basalt = hexRgb(style.bands.basalt);
  // the roundel: its ring band in granite units, the basalt rose and its rays
  const C = area.centre;
  m.skinRing(C.x, C.z, C.ringR[0], C.ringR[1], 64, SKIN, (k) => toned(granite, k, 1, 0.07, 31));
  m.skinRing(C.x, C.z, C.ringR[0] - 0.22, C.ringR[0] - 0.02, 64, SKIN, (k) => toned(basalt, k, 9, 0.06, 30));
  m.skinRing(C.x, C.z, C.roseR, C.roseR + 0.16, 32, SKIN, (k) => toned(basalt, k, 2, 0.06, 32));
  const rays = C.rays * 2;
  for (let k = 0; k < rays; k++) {
    const a0 = (k / rays) * Math.PI * 2, a1 = ((k + 1) / rays) * Math.PI * 2, am = (a0 + a1) / 2;
    // a ray: the point out at the rim on the even sectors (basalt), the granite between
    const tipR = C.roseR, P = (a: number, r: number): number[] => { const x = C.x + Math.sin(a) * r, z = C.z + Math.cos(a) * r; return [x, ctx.ground(x, z) + SKIN, z]; };
    m.tri(P(a0, 0.45), P(am, tipR), P(a1, 0.45), k % 2 ? toned(basalt, k, 3, 0.05, 33) : toned(granite, k, 3, 0.05, 34));
    m.tri(P(a0, 0.45), P(a0, tipR), P(am, tipR), toned(granite, k, 4, 0.05, 35));
    m.tri(P(a1, 0.45), P(am, tipR), P(a1, tipR), toned(granite, k, 5, 0.05, 36));
  }
  m.skinRing(C.x, C.z, 0, 0.45, 12, SKIN, () => granite);
  for (const bed of area.beds) {
    composeBed(m, bed, style, pieces, census, ctx.tier);
    const r = bed.rect;
    debug.push({ pts: [r.x0, r.z0, r.x1, r.z0, r.x1, r.z1, r.x0, r.z1], col: [40, 140, 40], fill: [170, 205, 150] });
  }
  for (const p of area.paving) {
    if (p.kind === 'flags') flagRect(m, p.rect, style, SKIN, 3);
    else if (p.kind === 'setts') settRect(m, p.rect, style.bands.sett, SKIN);
    else graniteRect(m, p.rect, p.kind === 'basalt' ? style.bands.basalt : style.bands.granite, SKIN);
    debug.push({ pts: [p.rect.x0, p.rect.z0, p.rect.x1, p.rect.z0, p.rect.x1, p.rect.z1, p.rect.x0, p.rect.z1], col: [130, 130, 130] });
  }
  frontageWalks(m, area, ctx.plots, style, census, debug);
  if (area.fountainRing) {
    const f = area.fountainRing;
    m.skinRing(f.x, f.z, f.r - 0.5, f.r, 56, SKIN, (k) => toned(granite, k, 6, 0.07, 37));
    m.skinRing(f.x, f.z, f.r, f.r + 0.45, 56, SKIN - 0.006, (k) => toned(hexRgb(style.gutter.hex), k, 7, 0.1, 38));
  }
  for (const st of area.steps) {
    const yaw = deg(st.yawDeg), c = Math.cos(yaw), s = Math.sin(yaw), g = ctx.ground(st.x, st.z), col = hexRgb(style.steps);
    for (let k = 0; k < st.count; k++) {
      // step k (0 the lowest) runs out from the door its treads' depth, its top k + 1 rises over the ground at the door
      const depth = (st.count - k) * 0.38, x = st.x + s * depth / 2, z = st.z + c * depth / 2;
      m.block(x, z, yaw, st.width / 2 - k * 0.15, depth / 2, st.rise * (k + 1), toned(col, x, z, 0.05, 39),
        { top: g + st.rise * (k + 1), ch: 0.02, embed: 0.08 });
    }
  }
  const bay = hexRgb(style.bands.bay);
  for (const b of area.bayMarks) {
    const yaw = deg(b.yawDeg), ux = Math.sin(yaw), uz = Math.cos(yaw), n = Math.max(1, Math.round(b.length / 0.16));
    for (let k = 0; k < n; k++) {
      const t0 = -b.length / 2 + (b.length * k) / n + 0.006, t1 = -b.length / 2 + (b.length * (k + 1)) / n - 0.006;
      const P = (t: number, o: number): [number, number] => [b.x + ux * t - uz * o, b.z + uz * t + ux * o];
      m.skin(P(t0, -0.08), P(t1, -0.08), P(t1, 0.08), P(t0, 0.08), SKIN + 0.004, toned(bay, t0 + b.x, b.z, 0.06, 40), 0.5);
    }
  }
  // the trees' grates: an iron grate of concentric slots in a granite frame
  const iron = hexRgb(style.grate.iron), frame = hexRgb(style.grate.frame);
  for (const t of area.trees.stations) {
    if (!t.grate) continue;
    const h = 0.9;
    m.skinRect(t.x - h, t.z - h, t.x + h, t.z + h, SKIN, frame, 1.0);
    m.skinRect(t.x - h + 0.14, t.z - h + 0.14, t.x + h - 0.14, t.z + h - 0.14, SKIN + 0.003, iron, 0.8);
    for (let ring = 1; ring <= 3; ring++) {
      m.skinRing(t.x, t.z, 0.18 * ring, 0.18 * ring + 0.05, 16, SKIN + 0.006, () => scaleRgb(iron, 1.6));
    }
    census.grates = (census.grates ?? 0) + 1;
  }
  // the monument's gravel octagon and its granite chain posts (the column itself is the props' destructible)
  if (area.monument) {
    const mo = area.monument, path = hexRgb(style.path.hex);
    m.skinRing(mo.x, mo.z, 0, 2.9, 8, SKIN + 0.002, (k) => toned(path, k, 8, 0.04, 41), Math.PI / 8, Math.PI * 2 + Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8, x = mo.x + Math.sin(a) * 2.75, z = mo.z + Math.cos(a) * 2.75;
      m.block(x, z, a, 0.09, 0.09, 0.62, toned(hexRgb(style.edging.pier.hex), x, z, 0.06, 42), { level: true, ch: 0.025, embed: 0.12 });
      // the chain to the next post: a sagging line of links
      const b = ((k + 1) / 8) * Math.PI * 2 + Math.PI / 8, x2 = mo.x + Math.sin(b) * 2.75, z2 = mo.z + Math.cos(b) * 2.75;
      const g = ctx.ground(x, z);
      for (let l = 0; l < 6; l++) {
        const u0 = l / 6, u1 = (l + 0.8) / 6, sag = (u: number) => 0.5 - 0.14 * 4 * u * (1 - u);
        const p0: [number, number] = [x + (x2 - x) * u0, z + (z2 - z) * u0], p1: [number, number] = [x + (x2 - x) * u1, z + (z2 - z) * u1];
        const side: [number, number] = [-(z2 - z), x2 - x], sl = Math.hypot(side[0], side[1]) || 1;
        m.run(p0, p1, [side[0] / sl, side[1] / sl], (end) => {
          const y = g + sag(end ? u1 : u0);
          return [[-0.012, y - 0.012], [0.012, y - 0.012], [0.012, y + 0.012], [-0.012, y + 0.012]];
        }, iron, false);
      }
    }
  }
  // the pieces: the furniture, the parked vehicles, the lamps
  for (const f of [...area.furniture, ...area.parking, ...area.lamps]) {
    pieces.push({ kind: f.kind, x: f.x, z: f.z, yaw: deg(f.yawDeg), scale: f.scale ?? 1 });
    census[f.kind] = (census[f.kind] ?? 0) + 1;
  }
  for (const a of area.arms) debug.push({ pts: [a.x0, a.z0, a.x1, a.z0, a.x1, a.z1, a.x0, a.z1], col: [90, 90, 200] });
  debug.push({ pts: [area.room.x0, area.room.z0, area.room.x1, area.room.z0, area.room.x1, area.room.z1, area.room.x0, area.room.z1], col: [200, 0, 200] });
  census.triangles = m.triangles;
  return { geometry: m.geometry(`civic:${area.id}`), pieces, veto: area.room, census, debug };
}
