// src/world/maps/coalBays.ts — the coal stockpiles' heaps and their records (the looks lane's r2 sub-stream, 2026-10-16).
// Extract-then-own: coalStockpile.ts's faceted heap, its lumps, its convex record and crushable pile (Lane B's, parked)
// moved here byte for byte; coalStockpile.ts keeps its clear-site law and re-exports these.
import * as THREE from 'three';
import { cloneCollisionRecord, convexHull2, setConvexShape, type CollisionRecord } from '../collision.ts';
import { CrushableClutter } from '../crushableClutter.ts';
import type { CoalGround } from './coalStockpile.ts';

/** What a heap registers into (mapKits.ts FocusedDressingContext's members it uses). */
interface CoalContext {
  obstacles?: CollisionRecord[];
  colliders?: CollisionRecord[];
  clutter?: (pile: CrushableClutter) => void;
  /** (the r2 sub-stream) the dressing buckets its bunker joins */
  buckets?: { baked?: THREE.BufferGeometry[] };
}

type CoalVertex = readonly [number, number, number];

function coalFacet(
  positions: number[], colors: number[], uvs: number[],
  a: CoalVertex, b: CoalVertex, c: CoalVertex, phase: number,
): void {
  // Three small irregular facets retain a granular highlight, not smooth
  // interpolated ellipsoid normals. No additional seeded draws are consumed.
  const middle: CoalVertex = [(a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3 + 0.015 * (1 + Math.sin(phase * 2.7)),
    (a[2] + b[2] + c[2]) / 3];
  const corners = [a, b, c];
  for (let edge = 0; edge < 3; edge++) {
    const shade = 0.032 + 0.012 * Math.sin(phase * 4.1 + edge * 1.7);
    for (const vertex of [corners[edge], corners[(edge + 1) % 3], middle]) {
      positions.push(...vertex);
      colors.push(shade * 0.94, shade, shade * 1.03);
      uvs.push(vertex[0] * 0.6, vertex[2] * 0.6);
    }
  }
}

/** A lump of coal lying on a heap's facet (a, b, c) at barycentric `w`: a low pyramid sunk 3 cm into the facet's plane. */
function coalLump(
  positions: number[], colors: number[], uvs: number[],
  a: CoalVertex, b: CoalVertex, c: CoalVertex, w: readonly [number, number, number], size: number, phase: number,
): void {
  const at = (k: number) => a[k] * w[0] + b[k] * w[1] + c[k] * w[2];
  const cx = at(0), cz = at(2);
  // the facet's plane: y over (x, z)
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const planeY = (x: number, z: number) => a[1] - (nx * (x - a[0]) + nz * (z - a[2])) / ny;
  const ring: CoalVertex[] = [];
  for (let k = 0; k < 5; k++) {
    const ang = phase * 1.3 + k * Math.PI * 2 / 5, r = size * (0.75 + 0.25 * Math.sin(phase * 2.1 + k * 2.3));
    // the ring's angle rising from x toward z, as the heap's own rings (its faces then wind up and out)
    const x = cx + Math.cos(ang) * r, z = cz + Math.sin(ang) * r;
    ring.push([x, planeY(x, z) - 0.03, z]);
  }
  const apex: CoalVertex = [cx + size * 0.15 * Math.sin(phase), planeY(cx, cz) + size * (0.8 + 0.25 * Math.sin(phase * 3.7)), cz + size * 0.15 * Math.cos(phase)];
  for (let k = 0; k < 5; k++) {
    const shade = 0.05 + 0.02 * Math.sin(phase * 2.9 + k * 1.9);
    for (const vertex of [ring[k], apex, ring[(k + 1) % 5]]) {
      positions.push(...vertex);
      colors.push(shade * 0.95, shade, shade * 1.06);
      uvs.push(vertex[0] * 0.6, vertex[2] * 0.6);
    }
  }
}

export function makeCoalStockpile(
  field: CoalGround, x: number, z: number,
  radius: number, length: number, phase: number, mapId?: string,
): THREE.BufferGeometry {
  const base: CoalVertex[] = [], shoulder: CoalVertex[] = [];
  const height = 0.66 + (radius - 1.1) * 0.36;
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const dx = Math.cos(angle) * radius, dz = Math.sin(angle) * length;
    base.push([x + dx, field.getHeightAt(x + dx, z + dz) - 0.05, z + dz]);
    const sx = x + dx * 0.47 + radius * 0.08, sz = z + dz * 0.47;
    shoulder.push([sx, field.getHeightAt(sx, sz) + height * (0.54 + 0.06 * Math.sin(i * 2 + phase)), sz]);
  }
  const peak: CoalVertex = [x - radius * 0.1, field.getHeightAt(x - radius * 0.1, z) + height, z];
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [];
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    // Clockwise XZ winding faces upward in Three's Y-up world.
    coalFacet(positions, colors, uvs, base[i], shoulder[i], base[next], phase + i * 3);
    coalFacet(positions, colors, uvs, base[next], shoulder[i], shoulder[next], phase + i * 3 + 1);
    coalFacet(positions, colors, uvs, shoulder[i], peak, shoulder[next], phase + i * 3 + 2);
  }
  // (props census #3, lane B 2026-10-14; the judges: "a smooth faceted cone, no lumps, no loose coal") the lumps lying
  // on its faces and the loose coal spilt along its toe: low five-sided pyramids sunk into the facets they lie on, every
  // face upward, all of them inside the heap's footprint and under its peak (its collision record unchanged)
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    coalLump(positions, colors, uvs, base[next], shoulder[i], shoulder[next], [0.3, 0.35, 0.35], 0.13, phase + i * 5);
    coalLump(positions, colors, uvs, base[i], shoulder[i], base[next], [0.36, 0.28, 0.36], 0.09, phase + i * 5 + 1);
    if (i % 2 === 0) coalLump(positions, colors, uvs, shoulder[i], peak, shoulder[next], [0.5, 0.2, 0.3], 0.1, phase + i * 5 + 2);
  }
  // (the looks lane's r2 sub-stream, 2026-10-16; the r2 sweep: "one form on 2 regions") the place's own stockpile
  const form = mapId ? COAL_FORMS[mapId] : undefined;
  if (form === 'saar') cokeHeap(positions, colors, uvs, base, shoulder, peak, phase);
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'rail-coal-stockpile';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  if (form) geometry.userData.coalBay = form === 'saar' ? saarBay(field, x, z, radius, length, phase) : ruhrBunker(field, x, z, radius, length, phase);
  return geometry;
}

// ---- the regional forms (the looks lane's r2 sub-stream, 2026-10-16) ------------------------------------------------

/**
 * The stockpile's form by map: Cinder Junction's (Ruhr) locomotive depot keeps its steam coal in a bunker of old
 * sleepers stacked between rails driven upright (a Bahnbetriebswerk's Kohlenbansen); the Völklingen works (Saar) keep
 * the blast furnaces' coke in cast-concrete stockyard bays open to the siding. Every other map keeps the plain heap.
 */
const COAL_FORMS: Readonly<Record<string, 'ruhr' | 'saar'>> = Object.freeze({ railyard: 'ruhr', foundry: 'saar' });

type Rgb3 = readonly [number, number, number];
interface Soup { positions: number[]; colors: number[]; uvs: number[] }

/** One flat triangle, wound to face `out` (a direction), its colour per corner. */
function tri(soup: Soup, a: CoalVertex, b: CoalVertex, c: CoalVertex, out: CoalVertex, colour: (p: CoalVertex) => Rgb3): void {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const order = nx * out[0] + ny * out[1] + nz * out[2] < 0 ? [a, c, b] : [a, b, c];
  for (const p of order) {
    soup.positions.push(p[0], p[1], p[2]);
    const k = colour(p);
    soup.colors.push(k[0], k[1], k[2]);
    soup.uvs.push(p[0] * 0.6, p[2] * 0.6);
  }
}
function quadTo(soup: Soup, a: CoalVertex, b: CoalVertex, c: CoalVertex, d: CoalVertex, out: CoalVertex, colour: (p: CoalVertex) => Rgb3): void {
  tri(soup, a, b, c, out, colour); tri(soup, a, c, d, out, colour);
}
const sub = (p: CoalVertex, q: CoalVertex): CoalVertex => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const addK = (p: CoalVertex, q: CoalVertex, k: number): CoalVertex => [p[0] + q[0] * k, p[1] + q[1] * k, p[2] + q[2] * k];

/**
 * A convex section (its corners `section`, in a plane across `dir`) swept `depth` along `dir`: its sides and both caps,
 * every face turned out from the section's centre (a chamfered sleeper, a battered wall, a coping, a counterfort).
 */
function sweep(soup: Soup, section: readonly CoalVertex[], dir: CoalVertex, depth: number, colour: (p: CoalVertex) => Rgb3, caps = true): void {
  const n = section.length, far = section.map((p) => addK(p, dir, depth));
  const c0 = section.reduce((m, p) => addK(m, p, 1 / n), [0, 0, 0] as CoalVertex);
  for (let i = 0; i < n; i++) {
    const a = section[i], b = section[(i + 1) % n];
    const out = sub([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], c0);
    quadTo(soup, a, b, far[(i + 1) % n], far[i], out, colour);
  }
  if (!caps) return;
  const back: CoalVertex = [-dir[0], -dir[1], -dir[2]];
  for (let i = 1; i + 1 < n; i++) {
    tri(soup, section[0], section[i], section[i + 1], back, colour);
    tri(soup, far[0], far[i], far[i + 1], dir, colour);
  }
}

function soupGeometry(soup: Soup, name: string): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.name = name;
  g.setAttribute('position', new THREE.Float32BufferAttribute(soup.positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(soup.colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(soup.uvs, 2));
  g.computeVertexNormals();
  // dressing beside the heap: no record of its own (the heap's convex record is the stockpile's), no stream draws
  g.userData.noCollision = true;
  g.userData.uvJitter = 'none';
  return g;
}

/**
 * Saar: the coke. The same heap, burnt to the blast furnace's coke: its grey, silvered lumps larger and more of them on
 * the upper facets (every one under the heap's highest point and inside its toe, so its convex record is the coal's).
 */
function cokeHeap(positions: number[], colors: number[], uvs: number[], base: readonly CoalVertex[], shoulder: readonly CoalVertex[],
  peak: CoalVertex, phase: number): void {
  let top = -Infinity;
  for (let i = 1; i < positions.length; i += 3) top = Math.max(top, positions[i]);
  const from = positions.length;
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    coalLump(positions, colors, uvs, shoulder[i], peak, shoulder[next], [0.42, 0.16, 0.42], 0.16, phase + i * 7 + 3);
    coalLump(positions, colors, uvs, base[next], shoulder[i], shoulder[next], [0.12, 0.44, 0.44], 0.14, phase + i * 7 + 4);
  }
  // (the lumps' apexes held under the heap's top: the record's height stays the coal's)
  for (let i = from + 1; i < positions.length; i += 3) positions[i] = Math.min(positions[i], top - 0.002);
  // the coke's grey: lighter than coal, a cold silver in it, the fines darker between the lumps
  for (let i = 0; i < colors.length; i += 3) {
    const v = colors[i + 1], k = 0.07 + (v - 0.02) * 1.6;
    colors[i] = k * 0.96; colors[i + 1] = k; colors[i + 2] = k * 1.07;
  }
}

/**
 * Ruhr: the depot's coal bunker round the heap's toe — two courses of old creosoted sleepers (chamfered, the upper set a
 * little in) on every side of its octagon, held at the corners by old rails driven upright (their I-section: head, web
 * and foot), their tops weathered to rust.
 */
function ruhrBunker(field: CoalGround, x: number, z: number, radius: number, length: number, phase: number): THREE.BufferGeometry {
  const soup: Soup = { positions: [], colors: [], uvs: [] };
  const corner = (i: number): [number, number] => {
    const a = i * Math.PI / 4;
    return [x + Math.cos(a) * (radius + 0.3), z + Math.sin(a) * (length + 0.3)];
  };
  const sleeperTone = (salt: number) => (p: CoalVertex): Rgb3 => {
    const k = 0.075 + 0.02 * Math.sin(salt * 2.3 + p[0] * 1.7 + p[2] * 1.3);
    return [k * 1.18, k * 1.02, k * 0.86];
  };
  for (let i = 0; i < 8; i++) {
    const [ax, az] = corner(i), [bx, bz] = corner(i + 1);
    const g = Math.min(field.getHeightAt(ax, az), field.getHeightAt(bx, bz), field.getHeightAt((ax + bx) / 2, (az + bz) / 2)) - 0.03;
    const len = Math.hypot(bx - ax, bz - az), dir: CoalVertex = [(bx - ax) / len, 0, (bz - az) / len];
    // across the run, away from the heap
    let ox = -dir[2], oz = dir[0];
    if (ox * ((ax + bx) / 2 - x) + oz * ((az + bz) / 2 - z) < 0) { ox = -ox; oz = -oz; }
    for (let k = 0; k < 2; k++) {
      const w = 0.24, h = 0.15, c = 0.025, inset = k * 0.02, y0 = g + k * (h + 0.004);
      const s0: CoalVertex = [ax + dir[0] * 0.07, 0, az + dir[2] * 0.07];
      const P = (across: number, up: number): CoalVertex => [s0[0] + ox * (across - inset), y0 + up, s0[2] + oz * (across - inset)];
      sweep(soup, [P(-w / 2 + c, 0), P(w / 2 - c, 0), P(w / 2, c), P(w / 2, h - c), P(w / 2 - c, h), P(-w / 2 + c, h), P(-w / 2, h - c), P(-w / 2, c)],
        dir, len - 0.14, sleeperTone(phase + i * 3 + k));
    }
  }
  // the rails driven upright at the corners, their foot to the heap
  const steel = (p: CoalVertex): Rgb3 => { const r = Math.max(0, Math.min(1, (p[1] - field.getHeightAt(x, z)) / 0.6)); return [0.09 + 0.13 * r, 0.075 + 0.05 * r, 0.07 + 0.02 * r]; };
  for (let i = 0; i < 8; i++) {
    const [cx, cz] = corner(i), a = i * Math.PI / 4;
    const g = field.getHeightAt(cx, cz);
    const fx = Math.cos(a), fz = Math.sin(a), sx = -fz, sz = fx;
    // the rail's section in plan: foot (toward the heap), web, head; d along (fx, fz) outward, s across
    const outline: Array<[number, number]> = [[-0.086, -0.075], [-0.086, 0.075], [-0.074, 0.075], [-0.074, 0.008], [0.04, 0.008], [0.04, 0.036],
      [0.086, 0.036], [0.086, -0.036], [0.04, -0.036], [0.04, -0.008], [-0.074, -0.008], [-0.074, -0.075]];
    const at = ([d, s]: [number, number], y: number): CoalVertex => [cx + fx * d + sx * s, y, cz + fz * d + sz * s];
    const y0 = g - 0.12, y1 = g + 0.5 + 0.06 * Math.sin(phase + i);
    // (the outline's winding in (d, s): a side's outward normal is its edge turned a quarter away from the inside)
    let area = 0;
    for (let k = 0; k < outline.length; k++) { const p = outline[k], q = outline[(k + 1) % outline.length]; area += p[0] * q[1] - q[0] * p[1]; }
    const turn = area > 0 ? 1 : -1;
    for (let k = 0; k < outline.length; k++) {
      const p = outline[k], q = outline[(k + 1) % outline.length];
      const ed = q[0] - p[0], es = q[1] - p[1], nd = es * turn, ns = -ed * turn;
      quadTo(soup, at(p, y0), at(q, y0), at(q, y1), at(p, y1), [fx * nd + sx * ns, 0, fz * nd + sz * ns], steel);
    }
    // its top: the foot, the web and the head
    for (const [d0, s0, d1, s1] of [[-0.086, -0.075, -0.074, 0.075], [-0.074, -0.008, 0.04, 0.008], [0.04, -0.036, 0.086, 0.036]] as const) {
      quadTo(soup, at([d0, s0], y1), at([d1, s0], y1), at([d1, s1], y1), at([d0, s1], y1), [0, 1, 0], steel);
    }
  }
  return soupGeometry(soup, 'rail-coal-bay');
}

/**
 * Saar: the works' coke bay — a cast-concrete back wall behind the heap and two return walls, open to the siding (the
 * stockyard's bays at Völklingen were filled from the wagons and emptied by grab): their faces battered, a chamfered
 * coping along their heads, counterforts behind the back wall, all sunk into the ground; the concrete weathered grey,
 * blacked with coke dust low on the inside and where the heap leans on it.
 */
function saarBay(field: CoalGround, x: number, z: number, radius: number, length: number, phase: number): THREE.BufferGeometry {
  const soup: Soup = { positions: [], colors: [], uvs: [] };
  const xb = x + radius + 0.34, z0 = z - length - 0.42, z1 = z + length + 0.42, xr = x - radius * 0.55;
  const T = 0.26, H = 0.82, BATTER = 0.05;
  const concrete = (p: CoalVertex): Rgb3 => {
    const g = field.getHeightAt(x, z), up = Math.max(0, Math.min(1, (p[1] - g) / H));
    const inside = Math.max(0, 1 - Math.hypot((p[0] - x) / (radius + 0.6), (p[2] - z) / (length + 0.6)));
    const k = (0.3 + 0.03 * Math.sin(phase * 3.1 + p[0] * 2.1 + p[2] * 1.7)) * (1 - 0.55 * (1 - up) * (0.4 + inside));
    return [k * 1.02, k, k * 0.95];
  };
  /** A wall from (ax, az) to (bx, bz), its inner face toward the heap: battered outside, its coping, sunk 12 cm. */
  const wall = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), dir: CoalVertex = [(bx - ax) / len, 0, (bz - az) / len];
    let ox = -dir[2], oz = dir[0];
    if (ox * ((ax + bx) / 2 - x) + oz * ((az + bz) / 2 - z) < 0) { ox = -ox; oz = -oz; }
    let lo = Infinity, hi = -Infinity;
    for (let t = 0; t <= 1.001; t += 0.25) { const y = field.getHeightAt(ax + (bx - ax) * t, az + (bz - az) * t); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const y0 = lo - 0.12, y1 = hi + H;
    // across: 0 the inner face (toward the heap), T the outer
    const P = (across: number, y: number): CoalVertex => [ax + ox * across, y, az + oz * across];
    sweep(soup, [P(0, y0), P(T, y0), P(T, y0 + 0.2), P(T - BATTER, y1), P(0, y1)], dir, len, concrete);
    // the coping: proud both sides, its top chamfered to shed the rain
    const c0 = -0.035, c1 = T - BATTER + 0.035, ct = y1 + 0.07;
    sweep(soup, [P(c0, y1), P(c1, y1), P(c1, ct - 0.02), P(c1 - 0.03, ct), P(c0 + 0.03, ct), P(c0, ct - 0.02)],
      dir, len, (p) => { const k = concrete(p); return [k[0] * 1.08, k[1] * 1.08, k[2] * 1.08]; });
    return { dir, ox, oz, y0, y1, len };
  };
  const back = wall(xb, z0, xb, z1);
  wall(xr, z0, xb + T, z0);
  wall(xr, z1, xb + T, z1);
  // the counterforts behind the back wall
  for (const t of [0.22, 0.5, 0.78]) {
    const cz = z0 + (z1 - z0) * t - 0.1, g = field.getHeightAt(xb + T + 0.3, cz) - 0.1;
    const ox = back.ox, foot = xb + ox * T;
    sweep(soup, [[foot, g, cz], [foot + ox * 0.55, g, cz], [foot + ox * 0.55, g + 0.16, cz], [foot, back.y1 - 0.12, cz]], [0, 0, 1], 0.2, concrete);
  }
  return soupGeometry(soup, 'rail-coal-bay');
}

export function registerCoalStockpile(geometry: THREE.BufferGeometry, ctx: CoalContext): void {
  const position = geometry.getAttribute('position'), points: Array<[number, number]> = [];
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < position.count; i++) {
    points.push([position.getX(i), position.getZ(i)]);
    low = Math.min(low, position.getY(i)); high = Math.max(high, position.getY(i));
  }
  // Same ordinary conservative vertical prism as authored rocks: exact
  // projected convex footprint/Y bounds, not a rectangular invisible wall.
  const record = setConvexShape({min: [0, low, 0], max: [0, high, 0], kind: 'coal-heap'}, convexHull2(points));
  const shell = cloneCollisionRecord(record);
  ctx.obstacles?.push(record);
  ctx.colliders?.push(shell);
  // (destruction stream, 2026-10-13; the owner: every prop under a size destructible by ramming or shooting) a hull
  // drives through a coal pile and a round bursts it: crushed, the pile lies flattened where it stood
  if (ctx.clutter) {
    let cx = 0, cz = 0;
    for (const [x, z] of points) { cx += x; cz += z; }
    cx /= Math.max(1, points.length); cz /= Math.max(1, points.length);
    let r = 0;
    for (const [x, z] of points) r = Math.max(r, Math.hypot(x - cx, z - cz));
    const pile = new CrushableClutter('coal-heap', cx, low, cz, r, high - low, [record], [shell]);
    pile.ownPiece(geometry);
    ctx.clutter(pile);
  }
  // (the r2 sub-stream) the heap's bunker or bay beside it in the dressing (it stands when a hull flattens the pile)
  const bay = geometry.userData.coalBay as THREE.BufferGeometry | undefined;
  if (bay) ctx.buckets?.baked?.push(bay);
}

