// src/world/maps/wallBreachRubble.ts — the rubble a broken field wall spilled at its breach (the looks lane, r2 sweep,
// 2026-10-16: props.ts addBrokenBreach drew five roughened boxes, a box share of 1.00 on the nine maps that place it).
//
// On a brick map each block is a lump of the wall's own bonded brickwork: two to five courses, their ends snapped along
// the bond so they stand toothed by a quarter brick course on course, the upper courses broken back further than the
// lower, lying on its bed or tipped onto its face, a loose bat (a snapped half brick) beside it. On a snow map's
// dry-stone wall each block is a knocked field stone, a third of it bedded in the snow. props.ts keeps the old box for its
// draws and its footprint record and draws this in its place; the piece takes its shape from a stream of its own, named
// by its place (fieldWallDressing.ts placeSeed), so the props stream spends exactly what it spent before.
import * as THREE from 'three';
import { dressingRng, jitterFieldStoneUV, placeSeed } from './fieldWallDressing.ts';

type P2 = readonly [number, number];

/** A brick course (a 65 mm brick on a 12 mm bed) and a quarter brick (the bond's toothing step). */
const COURSE_M = 0.077, QUARTER_M = 0.0625;
/** The print density the wall's brick and stone take (props.ts breachUv: one tile 1.4 m). */
const UV_PER_M = 0.7;

/** Triangles in a piece's own frame, with their uv (planar along each triangle's dominant axis). */
class Soup {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  private readonly du: number;
  private readonly dv: number;
  constructor(du: number, dv: number) { this.du = du; this.dv = dv; }
  tri(a: readonly number[], b: readonly number[], c: readonly number[]): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      const [s, t] = nx >= ny && nx >= nz ? [p[2], p[1]] : ny >= nz ? [p[0], p[2]] : [p[0], p[1]];
      this.uv.push(this.du + s * UV_PER_M, this.dv + t * UV_PER_M);
    }
  }
}

/**
 * A profile (counter-clockwise in its own a-b plane, may be concave) laid in the piece's plane and extruded across it:
 * `plane` 'xy' (a lump's elevation, extruded along z) or 'xz' (a bat's plan, extruded up y), from -depth/2 to depth/2.
 */
function prism(soup: Soup, profile: readonly P2[], depth: number, plane: 'xy' | 'xz'): void {
  const pts = profile.map(([a, b]) => new THREE.Vector2(a, b));
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  const at = (p: THREE.Vector2, c: number): number[] => (plane === 'xy' ? [p.x, p.y, c] : [p.x, c, -p.y]);
  const h = depth / 2;
  for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) {
    // each cap triangle counter-clockwise in the profile's plane (its +depth cap faces along the extrusion)
    const [a, b, c] = t, [i, j, k] = (pts[b].x - pts[a].x) * (pts[c].y - pts[a].y) - (pts[b].y - pts[a].y) * (pts[c].x - pts[a].x) >= 0 ? [a, b, c] : [a, c, b];
    soup.tri(at(pts[i], h), at(pts[j], h), at(pts[k], h));
    soup.tri(at(pts[k], -h), at(pts[j], -h), at(pts[i], -h));
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    soup.tri(at(p, -h), at(q, -h), at(q, h));
    soup.tri(at(p, -h), at(q, h), at(p, h));
  }
}

/** Drop points closer than 5 mm to the one before them (a toothing step that came out flush). */
function clean(points: P2[]): P2[] {
  const out: P2[] = [];
  for (const p of points) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.005) out.push(p);
  }
  while (out.length > 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 0.005) out.pop();
  return out;
}

/**
 * A lump of bonded brickwork `len` long and `courses` high, in elevation: each course's ends broken back along the bond
 * (a quarter brick in or out course on course, the upper courses broken back further), each snapped end leaning a little.
 */
function lumpProfile(r: () => number, len: number, courses: number): P2[] {
  const ends: Array<[number, number]> = [];
  for (let k = 0; k < courses; k++) {
    const back = k / courses * 0.32 * len;
    let l = -len / 2 + (k % 2) * QUARTER_M + back * r() + (r() - 0.5) * 0.02;
    let rr = len / 2 - ((k + 1) % 2) * QUARTER_M - back * r() + (r() - 0.5) * 0.02;
    if (rr - l < 0.14) { const m = (l + rr) / 2; l = m - 0.07; rr = m + 0.07; }
    ends.push([l, rr]);
  }
  const lean = () => (r() - 0.5) * 0.03;
  const pts: P2[] = [[ends[0][0], 0], [ends[0][1], 0]];
  for (let k = 0; k < courses; k++) {
    const y = (k + 1) * COURSE_M;
    pts.push([ends[k][1] + lean(), y]);
    if (k + 1 < courses) pts.push([ends[k + 1][1], y]);
  }
  for (let k = courses - 1; k >= 0; k--) {
    const y = (k + 1) * COURSE_M;
    if (k + 1 < courses) pts.push([ends[k + 1][0], y]);
    pts.push([ends[k][0] + lean(), y]);
  }
  return clean(pts);
}

/** A bat: a brick snapped across, in plan — its whole end square, its broken end ragged along a slant. */
function batProfile(r: () => number): P2[] {
  const len = 0.12 + r() * 0.13, w = 0.12, slant = (r() - 0.5) * 0.06;
  return clean([[0, -w / 2], [len - slant, -w / 2], [len + (r() - 0.5) * 0.02, -w * 0.1], [len + slant, w / 2], [0, w / 2]]);
}

/**
 * A knocked field stone w × h × d: the twelve corners of an icosahedron stretched to it, each knocked in by its own
 * share, so no two stones in a breach share a shape.
 */
function fieldStone(soup: Soup, r: () => number, w: number, h: number, d: number): void {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position, knock = new Map<string, number[]>();
  const corner = (i: number): number[] => {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let c = knock.get(key);
    if (!c) {
      const k = 0.78 + r() * 0.22;
      c = [p.getX(i) * w / 2 * k, Math.max(p.getY(i), -0.55) * h / 2 * (0.85 + r() * 0.15), p.getZ(i) * d / 2 * k];
      knock.set(key, c);
    }
    return c;
  };
  for (let i = 0; i + 2 < p.count; i += 3) soup.tri(corner(i), corner(i + 1), corner(i + 2));
  g.dispose();
}

/** The soup turned by `m` and seated on the lowest ground within `reach` of (x, z), `sink` below it: its positions. */
function seated(soup: Soup, m: THREE.Matrix4, x: number, z: number, reach: number, sink: number, ground: (x: number, z: number) => number): number[] {
  const v = new THREE.Vector3(), out: number[] = [];
  let low = Infinity;
  for (let i = 0; i < soup.pos.length; i += 3) {
    v.set(soup.pos[i], soup.pos[i + 1], soup.pos[i + 2]).applyMatrix4(m);
    out.push(v.x, v.y, v.z);
    low = Math.min(low, v.y);
  }
  // seated on the lowest ground under it, so no corner of it stands off a slope
  let foot = ground(x, z);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) foot = Math.min(foot, ground(x + dx * reach, z + dz * reach));
  const lift = foot - sink - low;
  for (let i = 0; i < out.length; i += 3) { out[i] += x; out[i + 1] += lift; out[i + 2] += z; }
  return out;
}

/**
 * The drawn piece of one breach block: `size` the block's draw (0.16-0.38 m), (x, z) its place, `spin` its yaw, `ground`
 * the terrain. `brick`: the wall is brick (a bonded lump and its bat); else a knocked field stone (the snow maps' dry-stone
 * walls). `fieldPrint`: the piece takes the field-stone print's face band (fieldWallDressing.ts jitterFieldStoneUV).
 */
export function breachRubble(brick: boolean, fieldPrint: boolean, x: number, z: number, size: number, spin: number,
  ground: (x: number, z: number) => number): THREE.BufferGeometry {
  const r = dressingRng(placeSeed(x, z, brick ? 0xb2e1 : 0xb2f5));
  const du = r() * 7.31, dv = r() * 5.17, pos: number[] = [], uv: number[] = [];
  const add = (soup: Soup, m: THREE.Matrix4, px: number, pz: number, reach: number, sink: number) => {
    pos.push(...seated(soup, m, px, pz, reach, sink, ground));
    uv.push(...soup.uv);
  };
  const turn = (ax: number, az: number) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(ax, spin, az, 'YXZ'));
  if (brick) {
    const len = size * 1.5, depth = Math.max(0.12, size), courses = Math.max(2, Math.min(5, Math.round(size * 0.8 / COURSE_M)));
    const lump = new Soup(du, dv);
    prism(lump, lumpProfile(r, len, courses), depth, 'xy');
    // on its bed (most) or tipped onto its face
    const onFace = r() < 0.35;
    add(lump, turn(onFace ? Math.PI / 2 * (r() < 0.5 ? 1 : -1) : (r() - 0.5) * 0.16, (r() - 0.5) * 0.12), x, z, len / 2 + 0.05, 0.015);
    // the bat beside it, lying flat a hand or two off the lump's face
    const bat = new Soup(du + 0.37, dv + 0.21), side = r() < 0.5 ? -1 : 1, off = depth / 2 + 0.08 + r() * 0.2, along = (r() - 0.5) * len * 0.6;
    prism(bat, batProfile(r), 0.065, 'xz');
    const bx = x + Math.cos(spin) * along + Math.sin(spin) * side * off, bz = z - Math.sin(spin) * along + Math.cos(spin) * side * off;
    add(bat, new THREE.Matrix4().makeRotationY(spin + r() * Math.PI * 2), bx, bz, 0.15, 0.01);
  } else {
    const stone = new Soup(du, dv);
    fieldStone(stone, r, size * 1.5, size * 0.8, size);
    add(stone, turn((r() - 0.5) * 0.3, (r() - 0.5) * 0.3), x, z, size * 0.75, size * 0.8 * 0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  if (fieldPrint) jitterFieldStoneUV(g, r);
  return g;
}
