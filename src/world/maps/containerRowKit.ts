// src/world/maps/containerRowKit.ts — the container rows' kit (the looks lane, 2026-10-15; the coordinator's ruling on the
// garage critic panel: "pastel, smooth container rows" on Cinder, Sirocco, Glacier and Ironworks, on maps and in garages).
//
// Extract-then-own: the rail kit's row (railKit.ts makeContainerRow, pushContainer, containerLiveries and the
// constants and draws only they use) moved here byte for byte; the shared helpers it paints with copied. railKit keeps
// the row in its builder table and re-exports it, so every map, kit and garage draws what it drew before.
import * as THREE from 'three';
import { structureBuildContext, type GeometryBuckets, type StructureBuildContext, type StructureDimensions } from './exteriorDetailKit.ts';
import {
  BOX_FACE, STEEL_ATLAS_STRIP_M, STEEL_BLANK_END_U, STEEL_DOOR_U, STEEL_STRIP_V, mapBoxFaceUv, type SteelStrip,
} from '../propsSteelAtlas.ts';
import { drawsPeriodFreight, pushPeriodFreight } from './periodFreight.ts';
import { MAP_SETTING_YEAR } from './periodClutterKit.ts';

// --- the rail kit's paint helpers (railKit.ts, copied) -------------------------------------------------------------

/** Flat vertex paint (with slight per-vertex value jitter) for the matte
 * vertex-colored 'baked' bucket — the container/tar-deck material. */
function paintGeo(
  geo: THREE.BufferGeometry,
  rng: () => number,
  r: number,
  g: number,
  b: number,
  jitter = 0.06,
): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = 1 + (rng() - 0.5) * jitter * 2;
    col[i * 3] = Math.min(1, r * v);
    col[i * 3 + 1] = Math.min(1, g * v);
    col[i * 3 + 2] = Math.min(1, b * v);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Local stream forked from one shared draw's bits: new decisions never move the seeded stream of later placements. */
function forkRng(u: number): () => number {
  let a = (u * 4294967296) | 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const _livery = new THREE.Color();

/** Flat vertex paint from a colour, the value jitter drawn from the given stream (one draw per vertex). */
function paintHex(geo: THREE.BufferGeometry, rng: () => number, hex: number, scale = 1, jitter = 0.06): THREE.BufferGeometry {
  _livery.set(hex);
  return paintGeo(geo, rng, _livery.r * scale, _livery.g * scale, _livery.b * scale, jitter);
}

// --- the row (railKit.ts, moved) ---------------------------------------------------------------------------------

/** ISO twenty-foot box: width across the row, height, length along the row's depth. */
const CONTAINER_W = 2.44, CONTAINER_H = 2.6, CONTAINER_L = 6.1;

/** The door leaves sit this far inside the corner posts; everything on them stays inside the body's footprint. */
const CONTAINER_DOOR_RECESS = 0.07;

/**
 * Operator liveries (authored sRGB, THREE.Color.set converts once) by battlefield character. The atlas carries
 * dark stencils, so every set stays light enough for black lettering to read; the rust mask and the weathering
 * hook do the fading.
 */
const CONTAINER_LIVERIES: Readonly<Record<string, readonly number[]>> = {
  brownfield: [0x8a3a2c, 0x3a5878, 0x5a6844, 0xa8925f, 0x7c8186, 0x436e6a, 0xb4ac96, 0xa45f2a],
  polar: [0xd8702a, 0x4a6fa8, 0xdedfda, 0x8f959a, 0xb85a30, 0x6e8b57],
  martian: [0xe1e3e5, 0xd97d2e, 0x9ea4aa, 0xcdc6b8],
};

/**
 * (the looks lane, 2026-10-15) The operators' and armies' colours by the battlefield's period (periodClutterKit.ts
 * MAP_SETTING_YEAR): the early boxes of the 1960s and 70s (Sea-Land's aluminium and maroon, the Army's CONEX olive,
 * the lessors' greys and blues), the lessors' and lines' boxes of the 1980s and 90s, today's lines; deep, worn paint,
 * never pastel. A garage (no map) draws the brownfield set.
 */
const CONTAINER_PERIOD_LIVERIES: Readonly<Record<string, readonly number[]>> = {
  early: [0xa3a5a1, 0x7a2e26, 0x55593e, 0x5a6a78, 0xb5602a, 0x7a4a2e, 0x6e7f86, 0x8c8a80],
  late: [0x5b86ab, 0x3f6e48, 0xbe6428, 0xa8966f, 0x7c2f27, 0x86898b, 0x48607a, 0x3f6f6a],
  modern: [0xb08a3c, 0x2b3d63, 0x5a86aa, 0xbd5f28, 0x2f5f9a, 0x7e2c55, 0x3a6a44, 0x8c8f91, 0x8a382e],
};

function containerLiveries(context?: StructureBuildContext): readonly number[] {
  if (!context) return CONTAINER_LIVERIES.brownfield;
  if (context.mapId === 'mars') return CONTAINER_LIVERIES.martian;
  if (context.snowCap || context.mapId === 'whiteout') return CONTAINER_LIVERIES.polar;
  const year = MAP_SETTING_YEAR[context.mapId];
  if (year !== undefined) return CONTAINER_PERIOD_LIVERIES[year < 1980 ? 'early' : year < 2000 ? 'late' : 'modern'];
  return CONTAINER_LIVERIES.brownfield;
}

/** The 24 value draws the old cube's paint made, taken in the cube's place in the shared stream. */
function drawBodyJitter(shared: () => number): Float32Array {
  const values = new Float32Array(24);
  for (let i = 0; i < 24; i++) values[i] = 1 + (shared() - 0.5) * 0.06 * 2;
  return values;
}

/** A colour's linear rgb from authored sRGB hex. */
function hexRgb(hex: number): [number, number, number] {
  _livery.set(hex);
  return [_livery.r, _livery.g, _livery.b];
}

/** A smooth hash noise along one axis (the rust's streaks): no stream. */
function streakNoise(t: number, seed: number): number {
  const h = (k: number): number => {
    let q = Math.imul(k | 0, 374761393) ^ Math.imul(Math.floor(seed * 1e6) | 0, 668265263);
    q = Math.imul(q ^ (q >>> 13), 1274126177);
    return ((q ^ (q >>> 16)) >>> 0) / 4294967296;
  };
  const k = Math.floor(t), f = t - k, w = f * f * (3 - 2 * f);
  return h(k) + (h(k + 1) - h(k)) * w;
}

/**
 * The container's walls as built (the looks lane, 2026-10-15; the garage critic panel: "pastel, smooth container
 * rows"): each side a sheet of trapezoidal corrugation (36 mm deep, its ribs at twice the ISO 209 mm pitch: its crests a couple of
 * millimetres inside the box, its troughs in), the blank end corrugated across, the four corner posts, the top and
 * bottom side rails and the end rails, and the eight corner castings with their side apertures — all inside the
 * body's box (the solid's hull and the dedicated shards unchanged). Painted in the livery: the paint faded on top,
 * rust run down from the top rail in streaks, the troughs darker, dirt and rust along the bottom rail. Parts new to the
 * stream (uvJitter 'none'); `seed` is one draw of the box's own stream.
 */
function pushContainerShell(placePart: (g: THREE.BufferGeometry) => THREE.BufferGeometry, seed: number, hex: number,
  side: readonly [number, number], end: readonly [number, number], W: number, H: number, L: number): void {
  // every part of the shell is dressing on the body, inside its box: no collision part of its own, so the derivation
  // sees the cubes' box and the door's parts alone and the dedicated shards stay what they were
  const place = (g: THREE.BufferGeometry): THREE.BufferGeometry => { g.userData.noCollision = true; return placePart(g); };
  const paint = hexRgb(hex), rust = hexRgb(0x6b3a22), grime = hexRgb(0x2e2a24);
  const mix3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  /** The paint at a wall point: `along` its run (m), `y` its height, `trough` 0 crest .. 1 trough. */
  const wallColour = (along: number, yy: number, trough: number, salt: number): [number, number, number] => {
    const top = yy / H;
    let c = mix3(paint, [paint[0] * 1.15 + 0.03, paint[1] * 1.15 + 0.03, paint[2] * 1.15 + 0.03], Math.max(0, top - 0.6) * 0.8);
    const streak = streakNoise(along / 0.42 + salt * 13.1, seed + salt);
    c = mix3(c, rust, Math.max(0, streak - 0.45) * 1.3 * Math.pow(top, 1.6));
    c = mix3(c, mix3(grime, rust, 0.5), Math.max(0, 1 - yy / 0.5) * 0.45);
    const k = 1 - 0.16 * trough;
    return [c[0] * k, c[1] * k, c[2] * k];
  };
  // (the ribs at twice the ISO pitch, every other one of the atlas's painted ribs: the silhouette at half the cost)
  const P = 0.418, DEPTH = 0.036, IN = 0.002;
  /**
   * One corrugated wall in the plane facing +x at x = hw, its run along z from z0 to z1 (u running from u0 at z0 to u1
   * at z1), from y0 to y1; its crests at hw - IN, its troughs DEPTH further in.
   */
  const wall = (hw: number, z0: number, z1: number, y0: number, y1: number, u0: number, u1: number, v: readonly [number, number],
    salt: number): THREE.BufferGeometry => {
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
    // the profile's points along the run: crest flat, down, trough flat, up (a pitch's four corners)
    const stops: Array<{ z: number; trough: number }> = [];
    const n = Math.max(1, Math.round((z1 - z0) / P)), pitch = (z1 - z0) / n;
    for (let k = 0; k < n; k++) {
      const a = z0 + k * pitch;
      stops.push({ z: a, trough: 0 }, { z: a + pitch * 0.32, trough: 0 }, { z: a + pitch * 0.5, trough: 1 }, { z: a + pitch * 0.82, trough: 1 });
    }
    stops.push({ z: z1, trough: 0 });
    for (let k = 0; k + 1 < stops.length; k++) {
      const s0 = stops[k], s1 = stops[k + 1];
      const x0 = hw - IN - DEPTH * s0.trough, x1 = hw - IN - DEPTH * s1.trough;
      // the quad's outward normal in the x-z plane
      const dz = s1.z - s0.z, dx = x1 - x0, ln = Math.hypot(dz, dx) || 1;
      const nx = dz / ln, nz = -dx / ln;
      const pts: Array<[number, number, number, number]> = [[x0, y0, s0.z, s0.trough], [x1, y0, s1.z, s1.trough], [x1, y1, s1.z, s1.trough], [x0, y1, s0.z, s0.trough]];
      for (const i of [0, 2, 1, 0, 3, 2]) {
        const [px, py, pz, tr] = pts[i];
        pos.push(px, py, pz); nor.push(nx, 0, nz);
        uv.push(u0 + (u1 - u0) * ((pz - z0) / (z1 - z0)), v[0] + (v[1] - v[0]) * (py / H));
        col.push(...wallColour(pz, py, tr, salt));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.userData.uvJitter = 'none';
    return g;
  };
  const POST = 0.1, RAIL_LO = 0.16, RAIL_HI = 0.1;
  // the long sides: the +x wall built as the box's +x face is mapped (u falling with z), the -x one the same turned half
  // round (its u then rising with z, as the -x face's is)
  for (const s of [1, -1]) {
    const g = wall(W / 2, -L / 2 + POST, L / 2 - POST, RAIL_LO, H - RAIL_HI, 0.5 + (L / 2 - POST) / L, 0.5 - (L / 2 - POST) / L, side, s > 0 ? 1 : 2);
    if (s < 0) g.rotateY(Math.PI);
    place(g);
  }
  // the blank end (-z), corrugated across its width: built facing +x and turned to face -z
  {
    // (the box's -z face maps its u falling with x: the blank end's atlas range, its posts' widths in from either edge)
    const g = wall(L / 2, -W / 2 + POST, W / 2 - POST, RAIL_LO, H - RAIL_HI, STEEL_BLANK_END_U[1] - POST / L, STEEL_BLANK_END_U[0] + POST / L, end, 3);
    g.rotateY(Math.PI / 2);
    place(g);
  }
  // the posts, the rails and the castings, in the livery (a little darker), the castings bare and dark
  const member = (w: number, h: number, d: number, cx: number, cy: number, cz: number, c: readonly number[]): void => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    const n = g.getAttribute('position').count, colA = new Float32Array(n * 3), uvA = g.getAttribute('uv');
    const lum = (q: readonly number[]): number => 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2];
    for (let i = 0; i < n; i++) {
      const yy = g.getAttribute('position').getY(i) + cy;
      // the wall's weathering as a shade on the member's own colour (faded on top, grimed at the foot)
      const k = Math.min(1.3, Math.max(0.6, lum(wallColour(cz + g.getAttribute('position').getZ(i), Math.max(0, yy), 0, 7)) / Math.max(1e-3, lum(paint))));
      colA[i * 3] = c[0] * k; colA[i * 3 + 1] = c[1] * k; colA[i * 3 + 2] = c[2] * k;
      uvA.setXY(i, 0.62, (STEEL_STRIP_V.plain[0] + STEEL_STRIP_V.plain[1]) / 2);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
    g.translate(cx, cy, cz);
    g.userData.uvJitter = 'none';
    place(g);
  };
  const frame = paint.map((v) => v * 0.82), bare = hexRgb(0x3a3936);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // a corner post, its full height between the castings
    member(POST - 0.002, H - 0.24, POST - 0.002, sx * (W / 2 - POST / 2), H / 2, sz * (L / 2 - POST / 2), frame);
  }
  for (const sx of [-1, 1]) {
    member(0.09, RAIL_LO, L - 0.36, sx * (W / 2 - 0.046), RAIL_LO / 2, 0, frame);
    member(0.07, RAIL_HI, L - 0.36, sx * (W / 2 - 0.036), H - RAIL_HI / 2, 0, frame);
  }
  for (const sz of [-1, 1]) {
    member(W - 0.33, RAIL_LO, 0.09, 0, RAIL_LO / 2, sz * (L / 2 - 0.046), frame);
    member(W - 0.33, RAIL_HI + 0.08, 0.08, 0, H - (RAIL_HI + 0.08) / 2, sz * (L / 2 - 0.041), frame);
  }
  for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
    const cx = sx * (W / 2 - 0.083), cy = sy ? H - 0.06 : 0.06, cz = sz * (L / 2 - 0.091);
    member(0.162, 0.118, 0.178, cx, cy, cz, bare);
    // the castings' apertures, on the side faces
    const dark = (): THREE.BufferGeometry => {
      const q = new THREE.PlaneGeometry(0.075, 0.05).toNonIndexed();
      const n = q.getAttribute('position').count, c = new Float32Array(n * 3).fill(0.02);
      q.setAttribute('color', new THREE.BufferAttribute(c, 3));
      for (let i = 0; i < n; i++) q.getAttribute('uv').setXY(i, 0.62, (STEEL_STRIP_V.plain[0] + STEEL_STRIP_V.plain[1]) / 2);
      q.userData.uvJitter = 'none';
      return q;
    };
    const a = dark(); a.rotateY(sx * Math.PI / 2); a.translate(sx * (W / 2 - 0.001), cy, cz); place(a);
  }
}

/**
 * A door leaf's hinge (the r2 sweep, 2026-10-16): its section in the leaf's plan — the strap (14 mm thick) along the leaf
 * from 17 cm in to the pin's barrel (26 mm round, its axis `xk` out on the `sx` side), the barrel's front in two facets
 * back to the leaf at its edge — carried 30 cm up about `yc`, capped (20 triangles, as the block's 12 and its 8 spare a
 * box); its back on the leaf's face at `zf`, all inside the leaf's edge and the body's box. Painted in the livery (`hex`,
 * grimed), so it reads as the door's own steel.
 */
function containerHinge(sx: number, xk: number, yc: number, zf: number, hex: number, local: () => number,
  plain: readonly [number, number]): THREE.BufferGeometry {
  const R0 = 0.026, T = 0.014, IN = 0.17, HH = 0.15;
  // the section (x out along the leaf on the sx = 1 side, z out of it): the strap's back on the leaf, the barrel's back
  // corner, its front in two facets, the strap's step and its front
  const pts: Array<[number, number]> = [
    [xk - IN, zf], [xk + R0 * 0.98, zf], [xk + R0, zf + R0 * 1.3], [xk - R0 * 0.4, zf + R0 * 2], [xk - R0 * 1.2, zf + T], [xk - IN, zf + T],
  ].map(([x, z]) => [sx * x, z] as [number, number]);
  const k = pts.length;
  // (the section's turn: its edges' outward side from its signed area, as x and z run)
  let area = 0;
  for (let i = 0; i < k; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % k]; area += ax * bz - bx * az; }
  const turn = area > 0 ? 1 : -1;
  const pos: number[] = [], nor: number[] = [];
  /** a triangle wound to face `want` (its flat normal) */
  const tri = (a: number[], b: number[], c: number[], want: readonly number[]): void => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * want[0] + cy * want[1] + cz * want[2] < 0) { const t = b; b = c; c = t; }
    pos.push(...a, ...b, ...c); nor.push(...want, ...want, ...want);
  };
  const y0 = yc - HH, y1 = yc + HH;
  for (let i = 0; i < k; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % k];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    const nx = turn * (bz - az) / l, nz = -turn * (bx - ax) / l;
    tri([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [nx, 0, nz]);
    tri([ax, y0, az], [bx, y1, bz], [ax, y1, az], [nx, 0, nz]);
  }
  // the caps, fanned from the barrel's back corner (it sees every other corner: the strap's step is the one reflex one)
  for (let i = 2; i < k; i++) {
    const [fx, fz] = pts[1], [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % k];
    tri([fx, y1, fz], [ax, y1, az], [bx, y1, bz], [0, 1, 0]);
    tri([fx, y0, fz], [ax, y0, az], [bx, y0, bz], [0, -1, 0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const n = pos.length / 3, uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { uv[i * 2] = 0.62; uv[i * 2 + 1] = (plain[0] + plain[1]) / 2; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  paintHex(g, local, hex, 0.86, 0.04);
  g.userData.uvJitter = 'none';
  return g;
}

/**
 * One container body: the closed box minus its door face (dropped from the index, so the solid's hull is still the
 * whole 2.44 x 6.1 m rectangle), the recessed door leaf, the reveal strips that close the recess, four locking bars
 * with their handles and the hinges — every door part strictly inside the body's footprint, so the collision
 * derivation absorbs them and the dedicated shards stay byte-identical (props.ts structureCollision, round 75).
 * The body paint draws its 24 vertex values from the shared stream (as the old box did); everything else from
 * the local one.
 */
function pushContainer(
  target: THREE.BufferGeometry[], bodyJitter: Float32Array, local: () => number,
  hex: number, sideStrip: SteelStrip, yaw: number, x: number, y: number, z: number, doorsForward: boolean,
): void {
  const W = CONTAINER_W, H = CONTAINER_H, L = CONTAINER_L, R = CONTAINER_DOOR_RECESS;
  const side = STEEL_STRIP_V[sideStrip], plain = STEEL_STRIP_V.plain, end = STEEL_STRIP_V.end;
  const parts: THREE.BufferGeometry[] = [];
  const place = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    if (!doorsForward) g.rotateY(Math.PI);
    g.rotateY(yaw);
    g.translate(x, y, z);
    parts.push(g);
    return g;
  };
  // the body: door face (+z) removed from the index; the roof and floor run their ribs across the width
  const body = new THREE.BoxGeometry(W, H, L);
  mapBoxFaceUv(body, BOX_FACE.px, [0, 1], side);
  mapBoxFaceUv(body, BOX_FACE.nx, [0, 1], side);
  const roofV: readonly [number, number] = [plain[0], plain[0] + (plain[1] - plain[0]) * (W / STEEL_ATLAS_STRIP_M)];
  mapBoxFaceUv(body, BOX_FACE.py, [0, 1], roofV, true);
  mapBoxFaceUv(body, BOX_FACE.ny, [0, 1], roofV, true);
  mapBoxFaceUv(body, BOX_FACE.nz, STEEL_BLANK_END_U, end);
  mapBoxFaceUv(body, BOX_FACE.pz, STEEL_DOOR_U, end);
  const index = body.getIndex()!;
  // (the looks lane, 2026-10-15) the sides and the blank end are drawn as the container's own corrugated walls, posts,
  // rails and castings below, inside this box: the box keeps its roof and floor (and all 24 corners, so the solid's hull
  // and the containers' damage reading, regional/container.ts readContainers, are what they were)
  // The roof and the floor alone would be two flat pieces that the collision derivation drops (structureCollision
  // solidsFromComponents; the 225 receipts: the band over the lower tier fell apart into its posts, rails and
  // castings). A web inside the blank end's +x corner post joins them into one solid, from the roof's corner to the
  // floor's and 4 cm in. It stands inside the post and the castings, so the solid is the cubes' box again.
  const pos0 = body.getAttribute('position'), nor0 = body.getAttribute('normal'), uv0 = body.getAttribute('uv');
  const corner = (sy: number): number => {
    for (let i = 0; i < pos0.count; i++) {
      if (Math.abs(pos0.getX(i) - W / 2) < 1e-5 && Math.abs(pos0.getY(i) - sy * H / 2) < 1e-5 && Math.abs(pos0.getZ(i) + L / 2) < 1e-5) return i;
    }
    throw new Error('container body: its blank-end corner');
  };
  const top = corner(1), foot = corner(-1), WEB = 0.04, WEB_Y = 0.03;
  const n0 = pos0.count, webN = 1 / Math.SQRT2;
  const position = new Float32Array((n0 + 2) * 3), normal = new Float32Array((n0 + 2) * 3), uvs = new Float32Array((n0 + 2) * 2);
  position.set(pos0.array as Float32Array); normal.set(nor0.array as Float32Array); uvs.set(uv0.array as Float32Array);
  position.set([W / 2 - WEB, H / 2 - WEB_Y, -L / 2 + WEB, W / 2 - WEB, -H / 2 + WEB_Y, -L / 2 + WEB], n0 * 3);
  normal.set([webN, 0, webN, webN, 0, webN], n0 * 3);
  uvs.set([uv0.getX(top), uv0.getY(top), uv0.getX(foot), uv0.getY(foot)], n0 * 2);
  body.setAttribute('position', new THREE.BufferAttribute(position, 3));
  body.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  body.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  // the web along the corner's diagonal, its face to +x +z (counter-clockwise seen from there)
  const kept = new Uint16Array(18);
  kept.set((index.array as Uint16Array).subarray(12, 24), 0);
  kept.set([top, n0 + 1, foot, top, n0, n0 + 1], 12);
  body.setIndex(new THREE.BufferAttribute(kept, 1));
  body.clearGroups();
  _livery.set(hex);
  const bodyColor = new Float32Array((n0 + 2) * 3);
  for (let i = 0; i < n0; i++) {
    bodyColor[i * 3] = Math.min(1, _livery.r * bodyJitter[i]);
    bodyColor[i * 3 + 1] = Math.min(1, _livery.g * bodyJitter[i]);
    bodyColor[i * 3 + 2] = Math.min(1, _livery.b * bodyJitter[i]);
  }
  // the web in the box's mean paint, so the livery the damage reading takes (the mean of the body's colours) is the same
  for (let c = 0; c < 3; c++) {
    let sum = 0;
    for (let i = 0; i < n0; i++) sum += bodyColor[i * 3 + c];
    bodyColor[n0 * 3 + c] = bodyColor[(n0 + 1) * 3 + c] = sum / n0;
  }
  body.setAttribute('color', new THREE.BufferAttribute(bodyColor, 3));
  body.userData.uvJitter = 'consume';
  body.translate(0, H / 2, 0);
  place(body);
  pushContainerShell(place, local(), hex, side, end, W, H, L);
  // the door leaf, recessed; its outer face carries the door strip
  const leaf = new THREE.BoxGeometry(W - 0.12, H - 0.12, 0.03);
  for (const face of [BOX_FACE.px, BOX_FACE.nx, BOX_FACE.py, BOX_FACE.ny, BOX_FACE.nz]) mapBoxFaceUv(leaf, face, [0.55, 0.56], plain);
  mapBoxFaceUv(leaf, BOX_FACE.pz, STEEL_DOOR_U, end);
  paintHex(leaf, local, hex);
  leaf.userData.uvJitter = 'none';
  leaf.translate(0, H / 2, L / 2 - R - 0.015);
  place(leaf);
  // reveal strips closing the recess: a millimetre inside the body's walls, two short of its end plane
  const depth = R - 0.002, zc = L / 2 - R / 2 - 0.001;
  const post = 0x50565b;
  for (const [w, h, dx, dy] of [
    [W - 0.002, 0.06, 0, H - 0.031], [W - 0.002, 0.06, 0, 0.031],
    [0.06, H - 0.12, -(W / 2 - 0.031), H / 2], [0.06, H - 0.12, W / 2 - 0.031, H / 2],
  ] as const) {
    const strip = new THREE.BoxGeometry(w, h, depth);
    for (let face = 0; face < 6; face++) mapBoxFaceUv(strip, face, [0.6, 0.61], plain);
    paintHex(strip, local, post, 1, 0.04);
    strip.userData.uvJitter = 'none';
    strip.translate(dx, dy, zc);
    place(strip);
  }
  // locking bars, handles and hinges on the leaf plane, proud of it by 5 cm and short of the posts' plane
  const zBar = L / 2 - R + 0.03;
  const barHex = local() < 0.5 ? post : hex;
  for (const bx of [-0.88, -0.34, 0.34, 0.88]) {
    const bar = new THREE.BoxGeometry(0.05, H - 0.5, 0.05);
    for (let face = 0; face < 6; face++) mapBoxFaceUv(bar, face, [0.62, 0.625], plain);
    paintHex(bar, local, barHex, 0.62, 0.04);
    bar.userData.uvJitter = 'none';
    bar.translate(bx, H / 2, zBar);
    place(bar);
    if (Math.abs(bx) < 0.5) continue; // one handle per leaf, on its outer bar (176 triangles a box)
    const handle = new THREE.BoxGeometry(0.30, 0.04, 0.045);
    for (let face = 0; face < 6; face++) mapBoxFaceUv(handle, face, [0.62, 0.625], plain);
    paintHex(handle, local, post, 0.8, 0.04);
    handle.userData.uvJitter = 'none';
    handle.translate(bx - Math.sign(bx) * 0.13, 1.05 + (local() - 0.5) * 0.1, zBar);
    place(handle);
  }
  // the hinges (the r2 sweep, 2026-10-16: a dark 12 x 34 cm block stuck on each leaf read as a painted plate on Mars's
  // pale boxes): each leaf's hinge as built, a strap welded along the leaf from its pin's barrel at the outer edge, one
  // section (a strap 14 mm thick running into the barrel's round) carried up its height; painted with the box, as the
  // line paints its doors' hardware, a little grimed
  for (const sx of [-1, 1]) {
    // (the old block's 24 paint draws, then its height draw: every hinge at the height it had)
    for (let i = 0; i < 24; i++) local();
    const yc = H * 0.5 + (local() - 0.5) * 0.3;
    place(containerHinge(sx, W / 2 - 0.085, yc, L / 2 - R, hex, local, plain));
  }
  for (const g of parts) target.push(g);
}

/**
 * Container row: 5-6 shipping boxes in a ragged rank, a couple stacked two high — the yard's signature hard
 * cover. Round 75: corrugated painted steel on the 'steel' atlas bucket (an operator livery per box from the
 * battlefield's set, marked side strips, doors with bars and hinges, corner posts and rails, rust in the mask)
 * in place of the flat vertex-painted cubes. The shared-stream draws are the ones the cubes made (count, a livery
 * draw, yaw, offset, the 24 paint draws, the stack roll, the stacked box's four draws and paint, the gap) and the
 * bodies keep the cubes' dimensions, so every later placement and every dedicated collision shard is unchanged.
 */
export function makeContainerRow(
  rng: () => number,
  buckets: GeometryBuckets,
): StructureDimensions {
  const target = buckets.steel || buckets.baked || buckets.dark;
  const context = structureBuildContext(buckets);
  const liveries = containerLiveries(context);
  // the map-revival lane (2026-10-09): before the ISO box (periodFreight.ts) the seats hold the period's freight, on a
  // map with its own mix (a kit that rebuilds the row keeps the base row's bounds: drawsPeriodFreight)
  const freightMap = context && drawsPeriodFreight(context.mapId) ? context.mapId : null;
  const n = 5 + ((rng() * 2) | 0);
  const CL = CONTAINER_L, CW = CONTAINER_W, CH = CONTAINER_H;
  let x = -((n - 1) * (CW + 0.5)) / 2;
  // (the building census's world pass, 227: on a slope a box's downhill end stood up to 0.19 m over the ground) each
  // ground-tier load on two timber dunnage sleepers bedded into the ground across its width: dressing, new to the stream
  // (flush under the load they carry no collision: a ground-contact solid stands to 6 cm)
  const dunnage = (cx: number, cz: number, yaw: number): void => {
    for (const dz of [-CL * 0.36, CL * 0.36]) {
      // (within the box's width: a kit that rebuilds the row reads the base row's bounds, which the sleepers must not widen;
      // 227, the integrity gate: 0.6 m deep they hung under the row in its below-ground views — 0.25 m beds a 0.19 m slope)
      const g = new THREE.BoxGeometry(CW - 0.02, 0.25, 0.22).toNonIndexed();
      g.translate(0, -0.115, dz); g.rotateY(yaw); g.translate(cx, 0, cz);
      g.userData.noCollision = true; g.userData.uvJitter = 'none';
      // (timber, not the boxes' steel: in the matte painted bucket, outside the boxes the steel parts keep to)
      (buckets.baked ?? target).push(paintHex(g, () => 0.5, 0x5a4a3a, 1, 0));
    }
  };
  for (let k = 0; k < n; k++) {
    const liveryDraw = rng();
    const local = forkRng(liveryDraw + k * 0.137);
    const hex = liveries[(liveryDraw * liveries.length) | 0];
    const yaw = (rng() - 0.5) * 0.08;
    const zOff = (rng() - 0.5) * 1.4;
    const jitter = drawBodyJitter(rng);
    if (freightMap !== null) {
      // the same shared draws as the boxes: the stack roll, then the stacked box's livery, paint, yaw and offsets
      const upper = rng() < 0.45;
      if (upper) { rng(); drawBodyJitter(rng); rng(); rng(); rng(); }
      pushPeriodFreight(buckets, local, freightMap, x, zOff, yaw, upper);
      dunnage(x, zOff, yaw);
      x += CW + 0.4 + rng() * 0.5;
      continue;
    }
    const strip: SteelStrip = local() < 0.5 ? 'sideA' : 'sideB';
    pushContainer(target, jitter, local, hex, strip, yaw, x, 0, zOff, local() < 0.5);
    dunnage(x, zOff, yaw);
    if (rng() < 0.45) { // second tier
      const liveryDraw2 = rng();
      const local2 = forkRng(liveryDraw2 + k * 0.311);
      const hex2 = liveries[(liveryDraw2 * liveries.length) | 0];
      const jitter2 = drawBodyJitter(rng); // the cube painted before it was posed
      const yaw2 = yaw + (rng() - 0.5) * 0.05;
      const x2 = x + (rng() - 0.5) * 0.2;
      const z2 = zOff + (rng() - 0.5) * 0.5;
      pushContainer(target, jitter2, local2, hex2, local2() < 0.5 ? 'sideA' : 'sideB', yaw2, x2, CH + 0.02, z2, local2() < 0.5);
    }
    x += CW + 0.4 + rng() * 0.5;
  }
  const w = n * (CW + 0.5) + 0.6;
  return { w, d: CL + 2.2, h: CH * 2 + 0.2 };
}
