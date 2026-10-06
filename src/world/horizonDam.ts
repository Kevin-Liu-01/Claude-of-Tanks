// The map-revival lane (2026-10-06, Skybridge round 2; gauntlet wave 107: "no drowned canyon, no dam"): Glen Canyon Dam
// in the ring. Skybridge's gorge runs on out of the square through the north ring as a canyon cut into the plateau —
// a level floor between walls of about 69 degrees, which the ring's steep-face shading beds as sandstone — and a
// concrete arch closes it under the plateau's rim: the upstream face a vertical cylinder convex to the reservoir, the
// downstream face battered from the crest's 8 m to four tenths of the dam's height at the floor (Glen Canyon's
// proportion), the crest's road deck overhanging it, the powerhouse along the toe. Behind the dam the canyon holds the
// reservoir a few metres under the crest, as the ring's own water, so the plateau's skyline opens over the arch where
// the drowned canyon runs on. Opt-in per map (horizon.dam): the carve runs in the sampled and the uploaded ring alike,
// after the road passes, heights only; the dam is one merged, vertex-coloured mesh (one draw and one far-cascade shadow
// draw, about 700 triangles) seated on the seated ring's surface, its foot sunk into the floor and its ends into the
// walls, with no collision: it stands some 650 m past the playable edge.
import * as THREE from 'three';
import { SHADOW_CASTER_LAST_CASCADE, setShadowCasterCascades } from '../engine/renderLayers.ts';
import { suppressNeedles } from './horizonMassif.ts';

export interface HorizonDamSettings {
  /** The crest's middle (m). The canyon's axis runs out from the map's centre through it. */
  x: number;
  z: number;
  /** The crest's elevation (m), under the walls at both abutments. */
  crestM: number;
  /** The canyon floor below the dam, the tailwater's bed (m). */
  floorM: number;
  /** How far out along the axis the canyon begins (m from the centre): inward of it the floor rises onto the plain. */
  mouthM: number;
  /** The floor's half-width (m, default 35) and the walls' rise per metre across (default 2.6, about 69 degrees). */
  floorHalfM?: number;
  wallSlope?: number;
  /** The arch: its upstream face's radius in plan (m, default 150) and its thickness at the crest and at the floor
   * (m, defaults 8 and 0.41 of its height, Glen Canyon's proportion; the face's batter stays under 3.4:1). */
  archRadiusM?: number;
  crestThickM?: number;
  baseThickM?: number;
  /** The reservoir behind the dam stands this far under the crest (m, default 3). */
  freeboardM?: number;
}

interface DamFrame {
  /** the axis (outward) and across it */
  ux: number; uz: number; vx: number; vz: number;
  /** the arch's centre in plan (downstream of the crest by its radius) and its distance out along the axis */
  cx: number; cz: number; cAlong: number;
  R: number; crest: number; floor: number; reservoir: number; mouth: number;
  halfW: number; wall: number; tc: number; tb: number;
  /** the downstream face's batter: its fall per metre outward from the upstream face */
  batter: number;
}

/** The reservoir's level runs this far in under the upstream face; from there the ring's surface under the dam (its
 * foundation) falls to the tailwater's bed parallel to the downstream face, so it stays inside the dam all the way. */
const RESERVOIR_INSET_M = 3;
/** The floor's rise per metre inward of the mouth: the canyon closes onto the plain. */
const MOUTH_RISE = 0.6;
/** The dam's foot and ends are sunk this far into the ring's surface. */
const EMBED_M = 6;
/** The crest's road deck overhangs the downstream face by this much, its fascia this deep. */
const DECK_OVERHANG_M = 2;
const FASCIA_M = 2.5;

function damFrame(dam: HorizonDamSettings): DamFrame {
  const r = Math.hypot(dam.x, dam.z);
  const ux = dam.x / r, uz = dam.z / r;
  const R = dam.archRadiusM ?? 150;
  const span = dam.crestM - dam.floorM;
  const tc = dam.crestThickM ?? 8, tb = dam.baseThickM ?? Math.max(tc + span / 3.4, span * 0.41);
  return {
    ux, uz, vx: -uz, vz: ux,
    cx: dam.x - ux * R, cz: dam.z - uz * R, cAlong: r - R,
    R, crest: dam.crestM, floor: dam.floorM, reservoir: dam.crestM - (dam.freeboardM ?? 3), mouth: dam.mouthM,
    halfW: dam.floorHalfM ?? 35, wall: dam.wallSlope ?? 2.6, tc, tb, batter: span / (tb - tc),
  };
}

/**
 * The canyon's surface at (x, z): its section (the tailwater's bed and the walls rising across the axis, closing onto
 * the plain inward of the mouth), filled behind the arch — by the dam's foundation under its body and by the
 * reservoir upstream of it. The ring takes the lower of this and its own surface.
 */
function canyonHeightAt(f: DamFrame, x: number, z: number): number {
  const along = x * f.ux + z * f.uz;
  const across = Math.abs(x * f.vx + z * f.vz);
  let h = f.floor + Math.max(0, across - f.halfW) * f.wall;
  if (along < f.mouth) h += (f.mouth - along) * MOUTH_RISE;
  if (along > f.cAlong) {
    const s = f.R - Math.hypot(x - f.cx, z - f.cz); // < 0 upstream of the arch's upstream face
    h = Math.max(h, f.reservoir - Math.max(0, s - RESERVOIR_INSET_M) * f.batter);
  }
  return h;
}

/** The cut settles by the tableland stair's laws (horizonEscarpment.ts): the radial cliff bound, no one-column needle. */
const MAX_SLOPE = 3.6;

/**
 * Cut the dam's canyon into the ring (heights only; a vertex is only ever lowered). Then the cut settles as the bed
 * stair settles its own: beside the walls a column the cut left standing alone between the canyon and a fall on its
 * other side would draw as a spike, so it comes down to one arc step over the higher of its neighbours, and the 3.6:1
 * radial cliff bound holds — each law by lowering the higher vertex, over the cut and its neighbours, in a few rounds.
 */
export function carveHorizonDamCanyon(
  ring: { positions: Float32Array; heights: Float32Array; maxHeight: number }, dam: HorizonDamSettings, columns: number,
): void {
  const f = damFrame(dam);
  const h = ring.heights, p = ring.positions, n = columns, rowCount = h.length / n;
  const mask = new Float32Array(h.length);
  let carved = false;
  for (let i = 0; i < h.length; i++) {
    const cut = canyonHeightAt(f, p[i * 3], p[i * 3 + 2]);
    if (!(cut < h[i])) continue;
    h[i] = cut;
    carved = true;
    const row = (i / n) | 0, k = i % n;
    mask[i] = 1;
    mask[row * n + (k + 1) % n] = 1;
    mask[row * n + (k + n - 1) % n] = 1;
    if (row > 0) mask[i - n] = 1;
    if (row < rowCount - 1) mask[i + n] = 1;
  }
  if (!carved) return;
  const rOf = (i: number): number => Math.hypot(p[i * 3], p[i * 3 + 2]);
  const lowerTo = (i: number, j: number): void => {
    const lim = MAX_SLOPE * Math.max(1, Math.abs(rOf(i) - rOf(j)));
    if (h[i] > h[j] + lim) { h[i] = h[j] + lim; mask[i] = 1; }
  };
  for (let round = 0; round < 3; round++) {
    for (let row = 0; row < rowCount; row++) suppressNeedles(h, p, row * n, n, mask);
    for (let row = 1; row < rowCount; row++) {
      for (let k = 0; k < n; k++) {
        const i = row * n + k, j = i - n;
        if (mask[i] > 0 || mask[j] > 0) { lowerTo(i, j); lowerTo(j, i); }
      }
    }
  }
  ring.maxHeight = 1;
  for (let i = 0; i < h.length; i++) {
    p[i * 3 + 1] = h[i];
    ring.maxHeight = Math.max(ring.maxHeight, h[i]);
  }
}

/**
 * The reservoir as the ring's water: the canyon's ring vertices upstream of the arch, within the lake's reach (where
 * the canyon's section stands under the reservoir's level) and not above it, take the ring's marine weight and level,
 * so the ring's own sea shading (horizon.ts: the reflected sky in the vertex colours, the marine flag in the uv) lays
 * water on the reservoir, including where the plateau behind the dam already lay lower than the lake.
 */
export function floodHorizonDamReservoir(
  ring: { positions: Float32Array; heights: Float32Array }, sea: { weight: Float32Array; level: Float32Array },
  dam: HorizonDamSettings,
): void {
  const f = damFrame(dam);
  const reach = f.halfW + (f.reservoir - f.floor) / f.wall;
  for (let i = 0; i < ring.heights.length; i++) {
    if (ring.heights[i] > f.reservoir + 0.01) continue;
    const x = ring.positions[i * 3], z = ring.positions[i * 3 + 2];
    if (x * f.ux + z * f.uz <= f.cAlong || Math.abs(x * f.vx + z * f.vz) > reach) continue;
    if (f.R - Math.hypot(x - f.cx, z - f.cz) > RESERVOIR_INSET_M) continue;
    sea.weight[i] = 1;
    sea.level[i] = f.reservoir;
  }
}

// the concrete (linear albedo): weathered buff-grey, darker toward the wet foot; the deck and its fascia a shade
// paler; the powerhouse's walls and its gravel roof
const CONCRETE: readonly [number, number, number] = [0.50, 0.47, 0.41];
const DECK: readonly [number, number, number] = [0.56, 0.54, 0.49];
const POWERHOUSE: readonly [number, number, number] = [0.53, 0.50, 0.45];
const ROOF: readonly [number, number, number] = [0.33, 0.32, 0.30];

interface DamBuffers { positions: number[]; normals: number[]; colors: number[]; indices: number[] }

/**
 * One smooth-shaded strip: rows[r][j] are its vertices (j along the arch), shaded by `tone(r, j)`; the winding is
 * chosen so the strip's normals face `outward` (a direction at the strip's middle).
 */
function addStrip(
  out: DamBuffers, rows: readonly (readonly THREE.Vector3[])[], tone: (r: number, j: number) => readonly [number, number, number],
  outward: THREE.Vector3,
): void {
  const R = rows.length, J = rows[0].length, base = out.positions.length / 3;
  const normals = rows.map((row) => row.map(() => new THREE.Vector3()));
  const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  // the face normals of the quads (r, j)-(r + 1, j + 1), summed onto their corners
  let sign = 0;
  for (let r = 0; r < R - 1; r++) for (let j = 0; j < J - 1; j++) {
    a.subVectors(rows[r + 1][j + 1], rows[r][j]);
    b.subVectors(rows[r][j + 1], rows[r + 1][j]);
    n.crossVectors(a, b);
    if (r === Math.floor((R - 1) / 2) && j === Math.floor((J - 1) / 2)) sign = Math.sign(n.dot(outward)) || 1;
    normals[r][j].add(n); normals[r + 1][j].add(n); normals[r][j + 1].add(n); normals[r + 1][j + 1].add(n);
  }
  for (let r = 0; r < R; r++) for (let j = 0; j < J; j++) {
    const p = rows[r][j], q = normals[r][j].multiplyScalar(sign);
    if (q.lengthSq() < 1e-12) q.copy(outward);
    q.normalize();
    const c = tone(r, j);
    out.positions.push(p.x, p.y, p.z);
    out.normals.push(q.x, q.y, q.z);
    out.colors.push(c[0], c[1], c[2]);
  }
  for (let r = 0; r < R - 1; r++) for (let j = 0; j < J - 1; j++) {
    const i00 = base + r * J + j, i01 = i00 + 1, i10 = i00 + J, i11 = i10 + 1;
    // (a x b above, with a = p11 - p00 and b = p01 - p10, is the normal of the triangles (p00, p10, p11), (p00, p11, p01))
    if (sign > 0) out.indices.push(i00, i10, i11, i00, i11, i01);
    else out.indices.push(i00, i11, i10, i00, i01, i11);
  }
}

/** A flat polygon (a fan from its first vertex) facing `outward`. */
function addFan(out: DamBuffers, points: readonly THREE.Vector3[], outward: THREE.Vector3, tone: readonly [number, number, number]): void {
  const base = out.positions.length / 3;
  for (const p of points) {
    out.positions.push(p.x, p.y, p.z);
    out.normals.push(outward.x, outward.y, outward.z);
    out.colors.push(tone[0], tone[1], tone[2]);
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let k = 1; k < points.length - 1; k++) {
    a.subVectors(points[k], points[0]); b.subVectors(points[k + 1], points[0]);
    if (a.cross(b).dot(outward) >= 0) out.indices.push(base, base + k, base + k + 1);
    else out.indices.push(base, base + k + 1, base + k);
  }
}

/**
 * The dam, seated on the carved ring's surface (`groundAt`: the uploaded ring's height at (x, z), NaN off it); null
 * when the canyon has no wall to hold the crest on either side within 70 degrees of arch.
 */
export function buildHorizonDam(
  dam: HorizonDamSettings, groundAt: (x: number, z: number) => number,
): THREE.Mesh | null {
  const f = damFrame(dam);
  const span = f.crest - f.floor;
  if (!(span > 10)) return null;
  // the downstream face's distance from the upstream face at height h (battered from the crest to the floor)
  const thick = (h: number): number => f.tc + (f.tb - f.tc) * Math.min(1, Math.max(0, (f.crest - h) / span));
  const at = (theta: number, s: number, y: number, target = new THREE.Vector3()): THREE.Vector3 => {
    const dx = Math.cos(theta) * f.ux + Math.sin(theta) * f.vx, dz = Math.cos(theta) * f.uz + Math.sin(theta) * f.vz;
    return target.set(f.cx + (f.R - s) * dx, y, f.cz + (f.R - s) * dz);
  };
  const ground = (theta: number, s: number): number => { const p = at(theta, s, 0); return groundAt(p.x, p.z); };
  // the abutments: out from the axis until the rock stands over the crest under both edges of the deck, then on into it
  const abutment = (side: number): number => {
    const step = 0.25 * Math.PI / 180;
    for (let theta = step; theta < 70 * Math.PI / 180; theta += step) {
      const a = ground(side * theta, 0), b = ground(side * theta, f.tc + DECK_OVERHANG_M);
      if (a >= f.crest + 1 && b >= f.crest + 1) return side * (theta + EMBED_M / f.R);
    }
    return Number.NaN;
  };
  const left = abutment(-1), right = abutment(1);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  const N = Math.max(12, Math.min(40, Math.round((right - left) * f.R / 7)));
  const thetas = Array.from({ length: N + 1 }, (_, j) => left + (right - left) * (j / N));
  // each slice's foot: under the lowest ground across its footprint, sunk in
  const foot = thetas.map((theta) => {
    let low = Infinity;
    for (const s of [-2, 0, f.tc, (f.tc + f.tb) * 0.5, f.tb, f.tb + 4]) {
      const g = ground(theta, s);
      if (Number.isFinite(g)) low = Math.min(low, g);
    }
    return (Number.isFinite(low) ? Math.min(low, f.crest) : f.floor) - EMBED_M;
  });
  const out: DamBuffers = { positions: [], normals: [], colors: [], indices: [] };
  const mid = (N / 2) | 0, midTheta = thetas[mid];
  const downstream = at(midTheta, 0, 0).sub(at(midTheta, 10, 0)).negate().normalize(); // toward the arch's centre
  const upstream = downstream.clone().negate();
  const up = new THREE.Vector3(0, 1, 0);
  const tone = (base: readonly [number, number, number], y: number): readonly [number, number, number] => {
    // the foot darkens (seepage, the tailwater's spray); the upper face keeps the concrete's pale buff
    const k = 0.8 + 0.2 * Math.min(1, Math.max(0, (y - f.floor) / (span * 0.6)));
    return [base[0] * k, base[1] * k, base[2] * k];
  };
  // the upstream face: vertical, from the foot to the deck
  addStrip(out, [thetas.map((t) => at(t, 0, f.crest)), thetas.map((t, j) => at(t, 0, foot[j]))],
    (r) => (r === 0 ? CONCRETE : tone(CONCRETE, f.floor)), upstream);
  // the deck and its fascia, then the soffit under the overhang back to the face
  const deckEdge = f.tc + DECK_OVERHANG_M, soffitY = f.crest - FASCIA_M;
  addStrip(out, [thetas.map((t) => at(t, 0, f.crest)), thetas.map((t) => at(t, deckEdge, f.crest))], () => DECK, up);
  addStrip(out, [thetas.map((t) => at(t, deckEdge, f.crest)), thetas.map((t) => at(t, deckEdge, soffitY))], () => DECK, downstream);
  addStrip(out, [thetas.map((t) => at(t, deckEdge, soffitY)), thetas.map((t) => at(t, thick(soffitY), soffitY))],
    () => CONCRETE, new THREE.Vector3(0, -1, 0));
  // the downstream face: from under the soffit to each slice's foot, in levels
  const LEVELS = 7;
  const faceRows: THREE.Vector3[][] = [];
  for (let k = 0; k <= LEVELS; k++) {
    faceRows.push(thetas.map((t, j) => {
      const y = soffitY + (foot[j] - soffitY) * (k / LEVELS);
      return at(t, thick(y), y);
    }));
  }
  addStrip(out, faceRows, (r, j) => tone(CONCRETE, faceRows[r][j].y), downstream.clone().add(up.clone().multiplyScalar(0.35)).normalize());
  // the ends, sunk into the walls: each slice's section closed flat
  for (const [j, side] of [[0, -1], [N, 1]] as const) {
    const t = thetas[j];
    const section = [at(t, 0, foot[j]), at(t, 0, f.crest), at(t, deckEdge, f.crest), at(t, deckEdge, soffitY)];
    for (let k = 0; k <= LEVELS; k++) section.push(faceRows[k][j].clone());
    const tangent = at(t + side * 0.01, 0, 0).sub(at(t, 0, 0)).normalize();
    addFan(out, section, tangent, CONCRETE);
  }
  // the powerhouse along the toe: a long low hall across the floor, its roof deck 20 m over the tailwater's bed
  {
    // (its back edge sunk into the face at the roof's height)
    const roof = f.floor + 20, s0 = thick(roof) - 2, s1 = f.tb + 22, sunk = f.floor - EMBED_M;
    const half = Math.max(8, f.halfW - 8) / (f.R - f.tb);
    const M = 8, ts = Array.from({ length: M + 1 }, (_, j) => -half + 2 * half * (j / M));
    addStrip(out, [ts.map((t) => at(t, s0, roof)), ts.map((t) => at(t, s1, roof))], () => ROOF, up);
    addStrip(out, [ts.map((t) => at(t, s1, roof)), ts.map((t) => at(t, s1, sunk))],
      (r) => (r === 0 ? POWERHOUSE : tone(POWERHOUSE, f.floor)), downstream);
    for (const [t, side] of [[ts[0], -1], [ts[M], 1]] as const) {
      const tangent = at(t + side * 0.01, s1, 0).sub(at(t, s1, 0)).normalize();
      addFan(out, [at(t, s0, sunk), at(t, s0, roof), at(t, s1, roof), at(t, s1, sunk)], tangent, POWERHOUSE);
    }
  }
  // the receipts' diagnostics: the ring under the face's middle half stands below it (its foundation inside the body),
  // and the rock at both ends stands over the crest under both edges of the deck
  let proud = -Infinity;
  for (let j = Math.ceil(N / 4); j <= Math.floor((3 * N) / 4); j++) {
    for (let k = 1; k < LEVELS - 1; k++) {
      const p = faceRows[k][j];
      if (p.y > foot[j] + EMBED_M + 4) proud = Math.max(proud, groundAt(p.x, p.z) - p.y);
    }
  }
  const endRock = Math.min(...[left, right].map((t) => Math.min(ground(t, 0), ground(t, deckEdge)) - f.crest));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out.positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(out.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(out.colors, 3));
  geometry.setIndex(out.indices);
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'horizon-dam';
  const chord = at(left, 0, 0).distanceTo(at(right, 0, 0));
  mesh.userData.horizonDam = {
    triangles: out.indices.length / 3, crestM: f.crest, heightM: span, chordM: Math.round(chord), slices: N + 1,
    proudM: Math.round(proud * 10) / 10, abutmentM: Math.round(endRock * 10) / 10,
  };
  mesh.userData.aoExclude = true;
  mesh.castShadow = true;
  setShadowCasterCascades(mesh, SHADOW_CASTER_LAST_CASCADE);
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
