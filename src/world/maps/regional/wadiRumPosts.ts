// src/world/maps/regional/wadiRumPosts.ts — the Desert Patrol's barrack and fuel post, and the Bedouin tents of the camps
// and lookouts (the Redrock lane, round 10, 2026-10-08).
//
// Gauntlet wave 270 on Redrock: the barrack "has a vertical-stripe texture with tiny black windows", the fuel point's hut
// is "a plain panelled box", the camp tent "a plain box". Round 9 had drawn the barrack and the post in the structure
// kit's light families (structureKit.ts), which print the timber planking under every light building, and the camps
// kept the inhabiting kit's flat-coloured ridge tent. Here the barrack and the post are the same buildings on the map's
// regional plaster: a stone core on a stone footing, its render a skin 5 cm proud of it in courses, fallen in ragged
// patches (more of them low and at the corners) to the stone under it, a stone reveal round each opening, the foot damp;
// steel doors, barred windows a hand bigger, timber lintels proud of the render, a parapet round the flat roof, a
// palm-rib shade before the door. The tents are the Bedouin's bayt al-sha'ar: black goat-hair strips over a row of
// poles, sagging between them, the back and the back half of the ends walled to the ground, the front open on its
// rugs, the decorated qata curtain dividing the inside, guy ropes out to their stakes.
//
// A map adopts them by name (props structureVariants: { quonsethut: 'rumbarrack', checkpointhut: 'rumpost',
// deserttent: 'bedouintent', tent: 'bedouincamp' }): each keeps its family's key, footprint, class, collider and crush
// threshold, and only the build changes. Each build takes the family's own draws from the props' destructible geometry
// stream and discards them (that stream shapes every pool, so every pool built after this one keeps its shape) and draws
// its own from a seed of its own. Pure geometry: no DOM, no materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DESTRUCTIBLE_BUILDING_TYPES } from '../structureKit.ts';
import { DESTRUCTIBLE_TYPES } from '../inhabitKit.ts';

type Rng = () => number;
type Rgb = readonly [number, number, number];

/** The colours multiplying the plaster print: the render, its damp foot, the stone, the timber, the openings, steel. */
const RENDER: Rgb = [0.97, 0.88, 0.78];
const DAMP: Rgb = [0.74, 0.64, 0.56];
const STONE: Rgb = [0.64, 0.46, 0.37];
const TIMBER: Rgb = [0.42, 0.31, 0.21];
const OPENING: Rgb = [0.06, 0.05, 0.045];
const BARS: Rgb = [0.2, 0.2, 0.2];
const TANK: Rgb = [0.11, 0.11, 0.11];
const PALM_RIB: Rgb = [0.74, 0.63, 0.46];
/** The steel doors, painted green or blue as the village's are. */
const DOORS: readonly Rgb[] = [[0.24, 0.44, 0.38], [0.26, 0.36, 0.56], [0.42, 0.44, 0.44]];
/** The colours multiplying the canvas print: the goat hair's two blacks, the rugs, the qata's bands, the poles. */
// (round 11, the gauntlet's wave 282: "a modern grey dome tent" — the goat hair blacker, on the hessian's weave)
const GOAT: readonly Rgb[] = [[0.085, 0.072, 0.065], [0.115, 0.095, 0.08], [0.1, 0.083, 0.073]];
const RUG: readonly Rgb[] = [[0.62, 0.16, 0.13], [0.5, 0.22, 0.12], [0.2, 0.18, 0.3]];
const QATA: readonly Rgb[] = [[0.86, 0.8, 0.68], [0.6, 0.15, 0.12], [0.12, 0.1, 0.09], [0.86, 0.8, 0.68], [0.6, 0.15, 0.12], [0.86, 0.8, 0.68]];
const POLE: Rgb = [0.5, 0.38, 0.26];
const ROPE: Rgb = [0.62, 0.54, 0.42];
/** The prints' tiling: the plaster a tile every 1.8 m, the canvas's weave every 1.2 m. */
const PLASTER_UV = 1 / 1.8, CANVAS_UV = 1 / 1.2;

/** A box (centred on x, z, its base at y0), its print at the world's scale, one colour jittered by `shade`. */
function block(w: number, h: number, d: number, x: number, y0: number, z: number, colour: Rgb, rng: Rng, shade = 0.04,
  uvPerM = PLASTER_UV): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const su = ax > 0.5 ? d : w, sv = ay > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * su * uvPerM + x * 0.37, uv.getY(i) * sv * uvPerM + z * 0.29 + y0 * 0.41);
  }
  g.translate(x, y0 + h / 2, z);
  const jitter = 1 + (rng() - 0.5) * 2 * shade;
  const colours = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    colours[i * 3] = colour[0] * jitter; colours[i * 3 + 1] = colour[1] * jitter; colours[i * 3 + 2] = colour[2] * jitter;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

/** A drum standing (or lying along z), its print round it, one colour. */
function drum(x: number, y0: number, z: number, colour: Rgb, rng: Rng, lying = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 12, 1).toNonIndexed();
  if (lying) g.rotateX(Math.PI / 2);
  g.translate(x, y0 + (lying ? 0.29 : 0.44), z);
  const p = g.attributes.position as THREE.BufferAttribute;
  const jitter = 0.94 + rng() * 0.12, colours = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    colours[i * 3] = colour[0] * jitter; colours[i * 3 + 1] = colour[1] * jitter; colours[i * 3 + 2] = colour[2] * jitter;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

/** Everything below `rise` metres darker toward the ground (the rain's splash and the sand's scour, the foot's dirt). */
function dampFoot(g: THREE.BufferGeometry, rise: number): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute, c = g.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, Math.min(1, p.getY(i) / rise));
    c.setXYZ(i, c.getX(i) * (DAMP[0] / RENDER[0] + (1 - DAMP[0] / RENDER[0]) * t),
      c.getY(i) * (DAMP[1] / RENDER[1] + (1 - DAMP[1] / RENDER[1]) * t), c.getZ(i) * (DAMP[2] / RENDER[2] + (1 - DAMP[2] / RENDER[2]) * t));
  }
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('wadiRumPosts: merge produced no geometry');
  for (const part of parts) part.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** An opening in a face: u0..u1 along it, y0..y1 up. */
type Hole = readonly [number, number, number, number];

/**
 * One rendered face of a stone core: the render 5 cm proud in 0.35 m courses, each course one panel between the openings
 * (a reveal of stone round each, the courses' cells clear of it) and the holes where the render has fallen (ragged
 * ellipses, more of them low and at the ends). The face lies at `at` on `axis`, facing `sign`; it runs u0..u1 along the
 * other horizontal axis (x for a z face, z for an x face) and y0..y1 up.
 */
function renderFace(parts: THREE.BufferGeometry[], axis: 'x' | 'z', sign: number, at: number, u0: number, u1: number,
  y0: number, y1: number, openings: readonly Hole[], holeCount: number, rng: Rng): void {
  const holes: Array<[number, number, number, number]> = [];
  for (let k = 0; k < holeCount; k++) {
    const end = rng() < 0.4;
    const cu = end ? (rng() < 0.5 ? u0 + rng() * 0.8 : u1 - rng() * 0.8) : u0 + rng() * (u1 - u0);
    holes.push([cu, y0 + (y1 - y0) * rng() * rng(), 0.35 + rng() * 0.75, 0.25 + rng() * 0.45]);
  }
  const k = 0.97 + rng() * 0.06, colour: Rgb = [RENDER[0] * k, RENDER[1] * k, RENDER[2] * k];
  const rows = Math.max(1, Math.round((y1 - y0) / 0.35)), dy = (y1 - y0) / rows;
  const cols = Math.max(1, Math.round((u1 - u0) / 0.25)), du = (u1 - u0) / cols;
  for (let r = 0; r < rows; r++) {
    const ya = y0 + r * dy, yb = ya + dy, y = (ya + yb) / 2;
    for (let c = 0, run = -1; c <= cols; c++) {
      let lost = c === cols;
      if (!lost) {
        const ua = u0 + c * du, ub = ua + du, u = (ua + ub) / 2;
        lost = openings.some(([a, b, lo, hi]) => ub > a - 0.05 && ua < b + 0.05 && yb > lo - 0.05 && ya < hi + 0.05);
        if (!lost) {
          const edge = 0.7 + 0.6 * rng();
          lost = holes.some(([hu, hy, ru, ry]) => ((u - hu) / ru) ** 2 + ((y - hy) / ry) ** 2 < edge);
        }
      }
      if (!lost && run < 0) run = c;
      if (lost && run >= 0) {
        const a = u0 + run * du, b = u0 + c * du;
        // (one lot of render to the face: no course reads as a seam)
        parts.push(axis === 'x' ? block(0.05, dy, b - a, at + sign * 0.025, ya, (a + b) / 2, colour, rng, 0)
          : block(b - a, dy, 0.05, (a + b) / 2, ya, at + sign * 0.025, colour, rng, 0));
        run = -1;
      }
    }
  }
}

/** A door or window in a face: the opening dark on the core, a steel leaf (a door) or bars (a window), a timber lintel
 * proud of the render over it. */
function opening(parts: THREE.BufferGeometry[], axis: 'x' | 'z', sign: number, at: number, hole: Hole, door: Rgb | null, rng: Rng): void {
  const [a, b, lo, hi] = hole, w = b - a, h = hi - lo, u = (a + b) / 2;
  const put = (along: number, up: number, out: number, depth: number, y0: number, colour: Rgb, uc = u) => parts.push(axis === 'x'
    ? block(depth, up, along, at + sign * out, y0, uc, colour, rng, 0.03) : block(along, up, depth, uc, y0, at + sign * out, colour, rng, 0.03));
  put(w, h, 0.01, 0.02, lo, OPENING);
  if (door) put(w - 0.08, h - 0.06, 0.025, 0.02, lo, door);
  else for (const f of [-0.3, 0, 0.3]) put(0.03, h - 0.04, 0.035, 0.03, lo + 0.02, BARS, u + f * w);
  put(w + 0.36, 0.14, 0.08, 0.16, hi + 0.04, TIMBER);
}

/** A palm-rib shade before a door: two posts, a beam and the mat of ribs, out along `out` (+1: +x / +z). */
function shade(parts: THREE.BufferGeometry[], axis: 'x' | 'z', at: number, u: number, span: number, reach: number, top: number, rng: Rng): void {
  const put = (along: number, up: number, across: number, outC: number, y0: number, uc: number, colour: Rgb, s = 0.06) => parts.push(axis === 'x'
    ? block(across, up, along, at + outC, y0, uc, colour, rng, s) : block(along, up, across, uc, y0, at + outC, colour, rng, s));
  for (const f of [-1, 1]) put(0.14, top, 0.14, reach, 0, u + f * span / 2, TIMBER);
  put(span + 0.3, 0.12, 0.14, reach, top, u, TIMBER);
  // the mat: ribs laid across from the wall to the beam, a hand apart
  for (let s = -span / 2 - 0.1; s <= span / 2 + 0.1; s += 0.13) put(0.07, 0.04, reach + 0.12, reach / 2 + 0.02, top + 0.12, u + s, PALM_RIB, 0.12);
}

/** The barrack's measures (m): its body, its height to the roof, the parapet. (Inside the Quonset hut's 3.49 x 5.86 m half
 *  extents and 4 m height, the shade included.) */
const BW = 4.6, BD = 11.0, BH = 3.1, BPARAPET = 0.5;

/** The Desert Patrol's barrack block: doors and barred windows down its +x side, a palm-rib shade over the middle door, high
 *  windows in the back, a black tank on the roof. */
export function buildRumBarrack(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const door = DOORS[Math.floor(rng() * DOORS.length)];
  parts.push(block(BW + 0.24, 0.85, BD + 0.24, 0, -0.3, 0, STONE, rng, 0.05));
  parts.push(block(BW, BH, BD, 0, 0, 0, STONE, rng, 0.03));
  // the front's doors and windows (along z), the back's high windows
  const front: Hole[] = [], back: Hole[] = [];
  for (const [z, isDoor] of [[-3.8, true], [-2.0, false], [0, true], [2.0, false], [3.8, true]] as const) {
    front.push(isDoor ? [z - 0.5, z + 0.5, 0.0, 2.05] : [z - 0.45, z + 0.45, 1.2, 2.0]);
  }
  for (const z of [-3, 0, 3]) back.push([z - 0.35, z + 0.35, 1.95, 2.45]);
  // (the side faces' render runs past the corners over the ends' edges)
  renderFace(parts, 'x', 1, BW / 2, -BD / 2 - 0.05, BD / 2 + 0.05, 0.55, BH - 0.18, front, 3, rng);
  renderFace(parts, 'x', -1, -BW / 2, -BD / 2 - 0.05, BD / 2 + 0.05, 0.55, BH - 0.18, back, 3, rng);
  renderFace(parts, 'z', 1, BD / 2, -BW / 2, BW / 2, 0.55, BH - 0.18, [], 1, rng);
  renderFace(parts, 'z', -1, -BD / 2, -BW / 2, BW / 2, 0.55, BH - 0.18, [], 1, rng);
  for (const h of front) opening(parts, 'x', 1, BW / 2, h, h[2] === 0 ? door : null, rng);
  for (const h of back) opening(parts, 'x', -1, -BW / 2, h, null, rng);
  // the roof slab's lip over the render, the parapet round the roof
  parts.push(block(BW + 0.14, 0.18, BD + 0.14, 0, BH - 0.18, 0, RENDER, rng, 0.02));
  for (const s of [-1, 1]) {
    parts.push(block(0.22, BPARAPET, BD + 0.14, s * (BW / 2 - 0.04), BH, 0, RENDER, rng, 0.03));
    parts.push(block(BW - 0.3, BPARAPET, 0.22, 0, BH, s * (BD / 2 - 0.04), RENDER, rng, 0.03));
  }
  parts.push(block(1.1, 0.8, 1.1, -0.9, BH, -3.0, TANK, rng, 0.04));
  shade(parts, 'x', BW / 2, 0, 2.6, 0.95, 2.5, rng);
  return merge(parts.map((g) => dampFoot(g, 0.9)));
}

/** The barrack shelled: its walls broken to stumps over the footing, the slab fallen in, the rubble of both. */
export function buildRumBarrackBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [block(BW + 0.24, 0.6, BD + 0.24, 0, -0.3, 0, STONE, rng, 0.05)];
  for (const s of [-1, 1]) for (let z = -BD / 2 + 0.6; z < BD / 2 - 0.7; z += 1.7) {
    if (rng() < 0.35) continue;
    parts.push(block(0.4, 0.5 + rng() * 1.5, 1.4, s * (BW / 2 - 0.2), 0, z, rng() < 0.5 ? RENDER : STONE, rng, 0.05));
  }
  parts.push(block(0.4, 1.9, 1.2, -BW / 2 + 0.2, 0, -BD / 2 + 0.6, RENDER, rng, 0.04));
  for (let i = 0; i < 16; i++) {
    const s = 0.4 + rng() * 0.7, b = block(s, s * (0.4 + rng() * 0.4), s * (0.6 + rng() * 0.6), 0, 0, 0, i % 3 ? RENDER : STONE, rng, 0.06);
    b.rotateY(rng() * Math.PI); b.rotateZ((rng() - 0.5) * 0.6);
    parts.push(b.translate((rng() - 0.5) * (BW - 1), 0.1 + rng() * 0.4, (rng() - 0.5) * (BD - 1)));
  }
  return merge(parts.map((g) => dampFoot(g, 0.9)));
}

/** The fuel post's measures (m). (Inside the checkpoint hut's 2.40 x 3.7 m half extents and 3.3 m height.) */
const PW = 3.4, PD = 4.4, PH = 2.6, PPARAPET = 0.36;

/** The Desert Patrol's fuel and water post: its door and a barred window on +z under a palm-rib shade, a window in each
 *  side wall, a tank on the roof, the fuel drums stood and lying against its +x wall. */
export function buildRumPost(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const door = DOORS[Math.floor(rng() * DOORS.length)];
  parts.push(block(PW + 0.2, 0.8, PD + 0.2, 0, -0.3, 0, STONE, rng, 0.05));
  parts.push(block(PW, PH, PD, 0, 0, 0, STONE, rng, 0.03));
  const front: Hole[] = [[-1.08, -0.12, 0, 1.95], [0.5, 1.15, 1.35, 1.95]];
  const side: Hole[] = [[-0.98, -0.42, 1.45, 1.95]];
  renderFace(parts, 'z', 1, PD / 2, -PW / 2, PW / 2, 0.5, PH - 0.16, front, 1, rng);
  renderFace(parts, 'z', -1, -PD / 2, -PW / 2, PW / 2, 0.5, PH - 0.16, [], 2, rng);
  // (the side faces' render runs past the corners over the ends' edges; a window in each, at the same z)
  renderFace(parts, 'x', 1, PW / 2, -PD / 2 - 0.05, PD / 2 + 0.05, 0.5, PH - 0.16, side, 1, rng);
  renderFace(parts, 'x', -1, -PW / 2, -PD / 2 - 0.05, PD / 2 + 0.05, 0.5, PH - 0.16, side, 1, rng);
  opening(parts, 'z', 1, PD / 2, front[0], door, rng);
  opening(parts, 'z', 1, PD / 2, front[1], null, rng);
  opening(parts, 'x', 1, PW / 2, side[0], null, rng);
  opening(parts, 'x', -1, -PW / 2, side[0], null, rng);
  parts.push(block(PW + 0.12, 0.16, PD + 0.12, 0, PH - 0.16, 0, RENDER, rng, 0.02));
  for (const s of [-1, 1]) {
    parts.push(block(0.2, PPARAPET, PD + 0.12, s * (PW / 2 - 0.04), PH, 0, RENDER, rng, 0.03));
    parts.push(block(PW - 0.28, PPARAPET, 0.2, 0, PH, s * (PD / 2 - 0.04), RENDER, rng, 0.03));
  }
  parts.push(block(0.95, 0.62, 0.95, 0.6, PH, -0.9, TANK, rng, 0.04));
  shade(parts, 'z', PD / 2, -0.6, 2.1, 0.95, 2.25, rng);
  // the fuel drums against the +x wall: three standing, one lying
  for (const [z, c] of [[-1.5, [0.36, 0.44, 0.28]], [-0.84, [0.56, 0.3, 0.22]], [-0.18, [0.36, 0.44, 0.28]]] as const) {
    parts.push(drum(PW / 2 + 0.33, 0, z, c, rng));
  }
  parts.push(drum(PW / 2 + 0.33, 0, 1.2, [0.48, 0.4, 0.3], rng, true));
  return merge(parts.map((g) => dampFoot(g, 0.8)));
}

/** The post shelled: a corner standing over a low heap of its render and stone, the drums scattered. */
/** The shade's measures (m): its back wall's run along z, its depth across x (the open front at +x), its eaves. */
const SW = 8.6, SD = 11.6, SH = 3.5;

/** The Desert Patrol's vehicle shade (round 11, the motor pool's family on Redrock): a rendered block back wall, low side
 *  walls, timber posts along the open front, a timber frame under a palm-rib roof falling to the front, drums and a box. */
export function buildRumShed(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const back = -SW / 2;
  // the back wall and the side walls: stone cores on their footing, the render broken on their outer faces
  parts.push(block(0.7, 0.75, SD + 0.2, back + 0.25, -0.3, 0, STONE, rng, 0.05));
  parts.push(block(0.5, SH + 0.15, SD, back + 0.25, 0, 0, STONE, rng, 0.03));
  renderFace(parts, 'x', -1, back, -SD / 2 - 0.05, SD / 2 + 0.05, 0.45, SH + 0.1, [], 2, rng);
  renderFace(parts, 'x', 1, back + 0.5, -SD / 2 + 0.3, SD / 2 - 0.3, 0.45, SH + 0.1, [], 1, rng);
  for (const s of [-1, 1]) {
    parts.push(block(SW * 0.55, 1.25, 0.4, back + SW * 0.275, 0, s * (SD / 2 - 0.2), STONE, rng, 0.03));
    renderFace(parts, 'z', s, s * SD / 2, back, back + SW * 0.55, 0.3, 1.25, [], 1, rng);
  }
  // the front posts and the frame: a beam along the front, rafters back to the wall, falling 0.5 m to the front
  const front = SW / 2 - 0.35, frontH = SH - 0.5;
  for (let z = -SD / 2 + 0.4; z <= SD / 2 - 0.39; z += (SD - 0.8) / 3) parts.push(block(0.2, frontH, 0.2, front, 0, z, TIMBER, rng, 0.08));
  parts.push(block(0.24, 0.22, SD - 0.4, front, frontH, 0, TIMBER, rng, 0.06));
  // (each built about its own middle, turned to the roof's fall, then set in place)
  const fall = -Math.atan2(0.5, SW - 1.0);
  for (let z = -SD / 2 + 0.6; z <= SD / 2 - 0.59; z += 1.6) {
    const r = block(SW - 0.6, 0.14, 0.14, 0, -0.07, 0, TIMBER, rng, 0.06);
    r.rotateZ(fall);
    parts.push(r.translate(0.05, frontH + 0.47, z));
  }
  // the palm-rib roof: ribs laid front to back over the rafters, a hand apart, each a shade of its own
  for (let z = -SD / 2 + 0.1; z <= SD / 2 - 0.1; z += 0.16) {
    const rib = block(SW - 0.2, 0.05, 0.1, 0, -0.025, 0, PALM_RIB, rng, 0.12);
    rib.rotateZ(fall);
    parts.push(rib.translate(0.1, frontH + 0.6, z));
  }
  // the pool's drums under the roof and its timber box by the back wall
  for (const [x, z, c] of [[-1.6, -3.7, [0.36, 0.44, 0.28]], [-1.0, -3.9, [0.56, 0.3, 0.22]], [-1.5, 3.6, [0.36, 0.44, 0.28]]] as const) {
    parts.push(drum(x, 0, z, c, rng));
  }
  parts.push(block(2.4, 0.9, 0.7, back + 1.2, 0, 0.8, TIMBER, rng, 0.08));
  return merge(parts.map((g) => dampFoot(g, 0.8)));
}

/** The shade shelled: the back wall's stumps and its footing, the roof's ribs and timber strewn, the drums down. */
export function buildRumShedBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [block(0.7, 0.5, SD + 0.2, -SW / 2 + 0.25, -0.3, 0, STONE, rng, 0.05)];
  for (let z = -SD / 2 + 0.8; z < SD / 2 - 0.8; z += 2.0) {
    if (rng() < 0.35) continue;
    parts.push(block(0.5, 0.5 + rng() * 1.8, 1.8, -SW / 2 + 0.25, 0, z, rng() < 0.5 ? RENDER : STONE, rng, 0.05));
  }
  for (let i = 0; i < 14; i++) {
    const b = block(2 + rng() * 3, 0.08, 0.14, 0, 0, 0, rng() < 0.6 ? PALM_RIB : TIMBER, rng, 0.1);
    b.rotateY(rng() * Math.PI);
    parts.push(b.translate((rng() - 0.5) * (SW - 3), 0.05 + rng() * 0.25, (rng() - 0.5) * (SD - 3)));
  }
  parts.push(drum(1.0, 0, -2.0, [0.36, 0.44, 0.28], rng, true), drum(-0.8, 0, 2.6, [0.56, 0.3, 0.22], rng, true));
  return merge(parts.map((g) => dampFoot(g, 0.8)));
}

export function buildRumPostBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [block(PW + 0.2, 0.55, PD + 0.2, 0, -0.3, 0, STONE, rng, 0.05)];
  parts.push(block(1.4, 1.5, 0.36, -PW / 2 + 0.7, 0, -PD / 2 + 0.18, RENDER, rng, 0.04));
  parts.push(block(0.36, 1.1, 1.3, -PW / 2 + 0.18, 0, -PD / 2 + 0.9, RENDER, rng, 0.04));
  for (let i = 0; i < 12; i++) {
    const s = 0.35 + rng() * 0.55, b = block(s, s * (0.45 + rng() * 0.4), s * (0.7 + rng() * 0.5), 0, 0, 0, i % 3 ? RENDER : STONE, rng, 0.06);
    b.rotateY(rng() * Math.PI); b.rotateX((rng() - 0.5) * 0.7);
    parts.push(b.translate((rng() - 0.5) * (PW - 0.8), 0.05 + rng() * 0.3, (rng() - 0.5) * (PD - 0.8)));
  }
  parts.push(drum(PW / 2 - 0.2, 0, 1.0, [0.36, 0.44, 0.28], rng, true), drum(-0.4, 0, PD / 2 - 0.5, [0.56, 0.3, 0.22], rng, true));
  return merge(parts.map((g) => dampFoot(g, 0.8)));
}

/** A tent's measures (m): its depth across (x, the back at -x, the open front at +x), its length (z), the ridge, the
 *  front and back eaves, the pole stations, the sag between them, the stakes' reach. */
type TentPlan = { w: number; l: number; ridge: number; front: number; back: number; poles: number; sag: number; stakeX: number; stakeZ: number };
/** The lookouts' and outposts' tent (inside the desert tent's 3.10 x 4.4 m half extents and 3.4 m height). */
const BIG_TENT: TentPlan = { w: 5.0, l: 8.2, ridge: 2.2, front: 1.6, back: 1.0, poles: 3, sag: 0.26, stakeX: 3.0, stakeZ: 4.35 };
/** A camp's tent (inside the camp tent's 1.28 x 1.90 m half extents and 2.1 m height). */
// (round 11: lower and longer — a black tent's long low line, not a dome)
const CAMP_TENT: TentPlan = { w: 2.2, l: 3.5, ridge: 1.5, front: 1.12, back: 0.7, poles: 2, sag: 0.16, stakeX: 1.25, stakeZ: 1.88 };

/** A double-sided sheet over a grid of points (i across, j along): smooth normals from the grid, a colour per strip `i`. */
function sheet(points: (i: number, j: number) => [number, number, number], ni: number, nj: number,
  colourOf: (i: number, j: number) => Rgb, rng: Rng): THREE.BufferGeometry {
  const P: [number, number, number][][] = [];
  for (let i = 0; i <= ni; i++) { P.push([]); for (let j = 0; j <= nj; j++) P[i].push(points(i, j)); }
  const normalAt = (i: number, j: number): [number, number, number] => {
    const a = P[Math.min(ni, i + 1)][j], b = P[Math.max(0, i - 1)][j], c = P[i][Math.min(nj, j + 1)], d = P[i][Math.max(0, j - 1)];
    const ux = a[0] - b[0], uy = a[1] - b[1], uz = a[2] - b[2], vx = c[0] - d[0], vy = c[1] - d[1], vz = c[2] - d[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  const jitter: number[][] = P.map(() => P[0].map(() => 0.95 + rng() * 0.1));
  const push = (i: number, j: number, flip: boolean, colour: Rgb, k: number) => {
    const p = P[i][j], n = normalAt(i, j);
    pos.push(p[0], p[1], p[2]);
    nor.push(flip ? -n[0] : n[0], flip ? -n[1] : n[1], flip ? -n[2] : n[2]);
    uv.push((p[0] + p[1] * 0.6) * CANVAS_UV, p[2] * CANVAS_UV);
    col.push(colour[0] * k, colour[1] * k, colour[2] * k);
  };
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
    const colour = colourOf(i, j), k = jitter[i][j];
    for (const flip of [false, true]) {
      const quad: Array<[number, number]> = flip ? [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]] : [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      for (const t of [0, 2, 3, 0, 1, 2]) push(quad[t][0], quad[t][1], flip, colour, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** A thin member from a to b (a pole, a rope), its section `t` metres, one colour. */
function member(a: [number, number, number], b: [number, number, number], t: number, colour: Rgb, rng: Rng): THREE.BufferGeometry {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = block(t, len, t, 0, -len / 2, 0, colour, rng, 0.06, CANVAS_UV);
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

/** The bayt al-sha'ar: the roof's strips over the poles, sagging between them; the back wall and the back half of the ends
 *  to the ground; inside, the rugs, the qata dividing the men's side from the family's, the cushions along the back. */
function buildBedouinTent(plan: TentPlan, rng: Rng): THREE.BufferGeometry {
  const { w, l, ridge, front, back, poles, sag } = plan;
  const parts: THREE.BufferGeometry[] = [];
  const stations = Array.from({ length: poles }, (_, k) => -l / 2 + 0.45 + (l - 0.9) * k / (poles - 1));
  const gap = (l - 0.9) / (poles - 1);
  // the roof's height across (back eave, ridge, front eave) less the sag between the stations
  const profile = (x: number) => x < 0 ? back + (ridge - back) * (1 - (x / (-w / 2)) ** 1.6) : front + (ridge - front) * (1 - (x / (w / 2)) ** 1.4);
  const sagAt = (z: number) => {
    const s = Math.min(Math.max(z, stations[0]), stations[poles - 1]);
    const f = ((s - stations[0]) / gap) % 1;
    const between = sag * Math.sin(Math.PI * f);
    // past the end stations the strips droop to the ends' tie lines
    const over = Math.max(0, Math.abs(z) - (l / 2 - 0.45));
    return between + over * 0.55;
  };
  const NI = 8, perGap = 4, NJ = (poles - 1) * perGap + 2;
  const zAt = (j: number) => j === 0 ? -l / 2 : j === NJ ? l / 2 : stations[0] + (j - 1) * gap / perGap;
  const xAt = (i: number) => -w / 2 + w * i / NI;
  const goat = (i: number) => GOAT[(i + (i >> 2)) % GOAT.length];
  parts.push(sheet((i, j) => {
    const x = xAt(i), z = zAt(j);
    return [x, profile(x) - sagAt(z) * (0.8 + 0.2 * (1 - Math.abs(x) / (w / 2))), z];
  }, NI, NJ, (i) => goat(i), rng));
  // the back wall: from the back eave to the ground, pegged out a little at its foot
  parts.push(sheet((i, j) => {
    const z = zAt(j), top = profile(-w / 2) - sagAt(z) * 0.8;
    return i === 0 ? [-w / 2 - 0.16, 0.0, z] : i === 1 ? [-w / 2 - 0.05, top * 0.45, z] : [-w / 2, top, z];
  }, 2, NJ, (i) => GOAT[(i + 1) % GOAT.length], rng));
  // the ends: walled from the back to the ridge, open to the front
  for (const s of [-1, 1]) {
    const z = s * l / 2;
    parts.push(sheet((i, j) => {
      const x = -w / 2 + (w / 2) * j / 4, top = profile(x) - sagAt(z) * (0.8 + 0.2 * (1 - Math.abs(x) / (w / 2)));
      return [x - (j === 0 ? 0.05 : 0), top * i / 2, z + s * 0.12 * (1 - i / 2)];
    }, 2, 4, () => GOAT[1], rng));
  }
  // the poles at the stations: the ridge's, the front eave's, the back eave's
  for (const z of stations) {
    parts.push(member([0, 0, z], [0, ridge - 0.02, z], 0.08, POLE, rng));
    parts.push(member([w / 2 - 0.05, 0, z], [w / 2 - 0.05, front - 0.02, z], 0.07, POLE, rng));
    parts.push(member([-w / 2 + 0.06, 0, z], [-w / 2 + 0.06, back - 0.02, z], 0.07, POLE, rng));
    // the guy ropes from the eaves' poles out to their stakes
    parts.push(member([w / 2 - 0.05, front - 0.05, z], [plan.stakeX, 0.02, z + 0.2], 0.025, ROPE, rng));
    parts.push(member([-w / 2 + 0.06, back - 0.05, z], [-plan.stakeX, 0.02, z - 0.2], 0.025, ROPE, rng));
  }
  for (const s of [-1, 1]) parts.push(member([0, ridge - sagAt(s * l / 2) - 0.05, s * l / 2], [0.3, 0.02, s * plan.stakeZ], 0.025, ROPE, rng));
  // inside: the rugs on the sand, the qata across, the cushions along the back wall of the men's side
  const qz = stations[0] + gap * (poles > 2 ? 1.0 : 0.5) * 0.9;
  parts.push(block(w * 0.62, 0.025, (l / 2 - qz) * 0.9, w * 0.08, 0, (qz + l / 2) / 2, RUG[Math.floor(rng() * RUG.length)], rng, 0.05, CANVAS_UV));
  parts.push(block(w * 0.55, 0.025, (qz + l / 2) * 0.7, w * 0.05, 0, (qz - l / 2) / 2, RUG[Math.floor(rng() * RUG.length)], rng, 0.05, CANVAS_UV));
  const qTop = profile(-w / 4) - sagAt(qz);
  for (let b = 0; b < QATA.length; b++) {
    const y0 = (qTop * b) / QATA.length, h = qTop / QATA.length;
    parts.push(block(w / 2 + 0.02, h, 0.03, -w / 4, y0, qz, QATA[b], rng, 0.03, CANVAS_UV));
  }
  parts.push(block(0.55, 0.42, (l / 2 - qz) * 0.8, -w / 2 + 0.38, 0, (qz + l / 2) / 2, RUG[0], rng, 0.05, CANVAS_UV));
  return merge(parts);
}

/** A tent struck down: the roof lying in folds over its rugs, the poles down across it. */
function buildBedouinTentBroken(plan: TentPlan, rng: Rng): THREE.BufferGeometry {
  const { w, l } = plan;
  const parts: THREE.BufferGeometry[] = [];
  const bumps = Array.from({ length: 5 }, () => [(rng() - 0.5) * w * 0.7, (rng() - 0.5) * l * 0.7, 0.15 + rng() * 0.35] as const);
  parts.push(sheet((i, j) => {
    const x = -w / 2 + w * i / 6, z = -l / 2 + l * j / 8;
    let y = 0.04;
    for (const [bx, bz, bh] of bumps) y += bh * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / 0.9);
    return [x, Math.min(y, 0.9), z];
  }, 6, 8, (i) => GOAT[i % GOAT.length], rng));
  for (let k = 0; k < plan.poles + 2; k++) {
    const z = (rng() - 0.5) * l * 0.8, x = (rng() - 0.5) * w * 0.6, a = rng() * Math.PI;
    const r = Math.min(0.9 + rng() * 0.5, (w / 2 - Math.abs(x) - 0.08) / Math.max(0.2, Math.abs(Math.cos(a))));
    parts.push(member([x - Math.cos(a) * r, 0.06, z - Math.sin(a) * r * 0.4], [x + Math.cos(a) * r, 0.12, z + Math.sin(a) * r * 0.4], 0.07, POLE, rng));
  }
  return merge(parts);
}

function mulberry32(a: number): Rng {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/** The families they stand in for. */
const QUONSET = DESTRUCTIBLE_BUILDING_TYPES.quonsethut, HUT = DESTRUCTIBLE_BUILDING_TYPES.checkpointhut;
const MOTOR_POOL = DESTRUCTIBLE_BUILDING_TYPES.motorpool;
const DESERT_TENT = DESTRUCTIBLE_BUILDING_TYPES.deserttent, CAMP = DESTRUCTIBLE_TYPES.tent;

/** A family's variant on another surface and build: its class, contact, collider, extents, resistance and crush threshold,
 *  its builds taking the family's draws from the stream and drawing their own from their seeds. */
function variantOf<B extends { cls: string; contact: string; collider?: boolean; hw: number; hl: number; r: number; h: number; keep: number;
  crushMin?: number; build: (rng: Rng) => THREE.BufferGeometry; broken: (rng: Rng) => THREE.BufferGeometry }>(base: B, mat: string,
  build: (rng: Rng) => THREE.BufferGeometry, broken: (rng: Rng) => THREE.BufferGeometry, seed: number, tint: number) {
  return Object.freeze({
    cls: base.cls as B['cls'], mat, contact: base.contact as B['contact'], collider: base.collider as B['collider'],
    hw: base.hw, hl: base.hl, r: base.r, h: base.h, keep: base.keep, crushMin: base.crushMin as B['crushMin'],
    instanceTintStrength: tint,
    build: (rng: Rng) => { base.build(rng).dispose(); return build(mulberry32(seed)); },
    broken: (rng: Rng) => { base.broken(rng).dispose(); return broken(mulberry32(seed + 1)); },
  });
}

export const RUM_BARRACK = variantOf(QUONSET, 'regionalPlaster', buildRumBarrack, buildRumBarrackBroken, 0x7b4a11, 0.05);
export const RUM_POST = variantOf(HUT, 'regionalPlaster', buildRumPost, buildRumPostBroken, 0x7b4a21, 0.05);
export const RUM_SHED = variantOf(MOTOR_POOL, 'regionalPlaster', buildRumShed, buildRumShedBroken, 0x7b4a51, 0.05);
export const BEDOUIN_TENT = variantOf(DESERT_TENT, 'burlap', (rng) => buildBedouinTent(BIG_TENT, rng),
  (rng) => buildBedouinTentBroken(BIG_TENT, rng), 0x7b4a31, 0.04);
export const BEDOUIN_CAMP_TENT = variantOf(CAMP, 'burlap', (rng) => buildBedouinTent(CAMP_TENT, rng),
  (rng) => buildBedouinTentBroken(CAMP_TENT, rng), 0x7b4a41, 0.04);
