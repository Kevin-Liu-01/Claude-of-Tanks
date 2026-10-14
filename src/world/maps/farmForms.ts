// src/world/maps/farmForms.ts — the farmyard's hay and troughs, form by form (props lane A, family #18, 2026-10-14;
// WORKLIST.md #18: "bales as bulged drums with rolled spiral layer rings, ragged wrap and raised twine/net bands,
// weight-flattened contact ... troughs with boards and housed ends, iron straps, chamfered rims, a dark water surface
// with scum").
//
// The hay forms wear the hay print (hayPrint.ts: the packed band round a bale, the face band up a cock) on the straw
// material, turned by haystackKit's `turn` (its locks and lumps break every outline); a silage bale is plastic film on
// the vertex-colour material. The troughs are the vertex-colour material's (clutterForms' writer). Every form keeps its
// legacy kind's extent: the bale's drum (1.45 m long, 0.72 m round, lying along x), the trough's 2.0 × 0.72 m.
import * as THREE from 'three';
import { HAY_FACE_V, HAY_PACKED_V, HAY_THATCH_V } from '../hayPrint.ts';
import { bandV, hayMerge, pole as hayPole, turn, type ProfilePoint } from './haystackKit.ts';
import { mix, mul, hexLin, type Rgb, type V3 } from './craftMesh.ts';
import { bar, extrude, faceTri, finish, lathe, newMesh, place, pole, tip, tone } from './clutterForms.ts';

type Rng = () => number;
const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];

// ------------------------------------------------------------------------------------------------------- bales

/** A bale's make: the loose hay cock of the hand-mown maps, the twine-tied rectangular bales of the 1940s to the 1970s
 *  stacked in a ricklet, the round bale with its net or twine, the round bale wrapped in silage film. A cock's `cock` is
 *  its place's build: the raked dome ('hay'), the Russian kopna (bigger, coned, its top twisted into a knot), the
 *  Podhale ostrewka (hay hung up a spruce pole whose lopped branches poke through it), the monsoon belt's rice-straw
 *  stack (packed round a bamboo pole, its cap thatched and tied, the pole standing out of it). */
export interface BaleForm { kind: 'cock' | 'square' | 'round' | 'silage'; cock?: 'hay' | 'kopna' | 'ostrewka' | 'rice'; film?: Rgb; tape?: Rgb }

/** A drum along x: its side the packed band round it (u), its ends the face band's spiral layers, twine raised. */
function roundBale(rng: Rng): THREE.BufferGeometry {
  const R = 0.72, L = 1.45, packed = (t: number) => bandV(HAY_PACKED_V, t);
  // the side, turned about y then laid along x: its bulge, the twine's raised turns, its rolled edges
  const side: ProfilePoint[] = [[R * 0.93, -L / 2, packed(0), 0.012], [R * 0.99, -L / 2 + 0.06, packed(0.08), 0.015], [R * 1.01, -0.42, packed(0.2), 0.012],
    [R * 1.025, -0.4, packed(0.22), 0.004], [R * 1.01, -0.38, packed(0.24), 0.012], [R * 1.03, 0, packed(0.5), 0.015], [R * 1.01, 0.38, packed(0.76), 0.012],
    [R * 1.025, 0.4, packed(0.78), 0.004], [R * 1.01, 0.42, packed(0.8), 0.012], [R * 0.99, L / 2 - 0.06, packed(0.92), 0.015], [R * 0.93, L / 2, packed(1), 0.012]];
  const parts = [turn(side, 14, rng, 3)];
  // each end: the spiral of its layers, ring by ring, a little proud and sunk in turn, its core drawn in
  for (const s of [-1, 1]) {
    const face = (t: number) => bandV(HAY_FACE_V, 0.2 + t * 0.5);
    const rings: ProfilePoint[] = [[R * 0.93, 0, face(0), 0.01], [R * 0.72, 0.02, face(0.2), 0.012], [R * 0.52, -0.005, face(0.4), 0.012], [R * 0.32, 0.018, face(0.6), 0.01],
      [R * 0.12, -0.01, face(0.85), 0.008], [0.01, 0.0, face(1), 0]];
    const end = turn(rings, 14, rng, 2);
    if (s < 0) end.rotateX(Math.PI);
    end.translate(0, s * L / 2, 0);
    parts.push(end);
  }
  const g = hayMerge(parts);
  g.rotateZ(Math.PI / 2);
  // (its own weight flattens it where it sits: the bottom of the drum pressed a little into its contact)
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -R * 0.82) p.setY(i, -R * 0.82 - (p.getY(i) + R * 0.82) * 0.25);
  g.computeVertexNormals();
  g.translate(0, R * 0.82 + 0.0, 0);
  return g;
}
/** One twine-tied rectangular bale (0.9 × 0.46 × 0.36 m along x): its sides the packed band, its cut ends the face's. */
function smallBale(rng: Rng): THREE.BufferGeometry {
  const w = 0.23, h = 0.18, L = 0.9, packed = (t: number) => bandV(HAY_PACKED_V, t);
  // four sides turned as a square (four segments, its corners eased), the two twines raised, its ends capped
  const r = Math.hypot(w, h) * 0.92, profile: ProfilePoint[] = [
    [0.01, -L / 2 - 0.01, bandV(HAY_FACE_V, 0.4), 0], [r * 0.95, -L / 2, packed(0), 0.01], [r, -L / 2 + 0.05, packed(0.06), 0.012], [r, -0.22, packed(0.25), 0.012],
    [r * 1.025, -0.2, packed(0.27), 0.003], [r, -0.18, packed(0.29), 0.012], [r, 0.18, packed(0.7), 0.012], [r * 1.025, 0.2, packed(0.72), 0.003], [r, 0.22, packed(0.74), 0.012],
    [r, L / 2 - 0.05, packed(0.94), 0.012], [r * 0.95, L / 2, packed(1), 0.01], [0.01, L / 2 + 0.01, bandV(HAY_FACE_V, 0.6), 0]];
  const g = turn(profile, 4, rng, 1);
  g.rotateY(Math.PI / 4);
  g.scale(w / (r * Math.SQRT1_2), 1, h / (r * Math.SQRT1_2));
  g.rotateZ(Math.PI / 2);
  return g;
}
/** The hay cock: a dome of hay drawn down in locks, a hat of hay twisted at its top, the loose hay at its foot. The kopna
 *  is the bigger Russian cock, coned higher, its top twisted into a knot of thatch. */
function hayCock(rng: Rng, kopna: boolean): THREE.BufferGeometry {
  const R = kopna ? 0.86 : 0.72, H = (kopna ? 1.75 : 1.2) + rng() * 0.15, face = (y: number) => bandV(HAY_FACE_V, y / H);
  const body = kopna
    ? turn([[R * 0.98, -0.05, face(0), 0.04], [R, 0.12, face(0.12), 0.06], [R * 0.93, H * 0.3, face(H * 0.3), 0.08], [R * 0.72, H * 0.55, face(H * 0.55), 0.09],
      [R * 0.44, H * 0.78, face(H * 0.78), 0.08], [R * 0.2, H * 0.92, bandV(HAY_THATCH_V, 0.4), 0.05], [0.04, H, bandV(HAY_THATCH_V, 0.8), 0.02]], 12, rng, 2)
    : turn([[R * 0.98, -0.05, face(0), 0.04], [R, 0.12, face(0.12), 0.06], [R * 0.96, H * 0.35, face(H * 0.35), 0.08], [R * 0.78, H * 0.6, face(H * 0.6), 0.09],
      [R * 0.5, H * 0.82, face(H * 0.82), 0.08], [R * 0.2, H * 0.95, bandV(HAY_THATCH_V, 0.5), 0.05], [0.03, H, bandV(HAY_THATCH_V, 1), 0.02]], 12, rng, 2);
  const parts = [body, cockSkirt(R, H, rng)];
  if (kopna) {
    // the knot: a fist of hay twisted up out of the crown and bent over
    const knot = turn([[0.16, H - 0.1, bandV(HAY_THATCH_V, 0.6), 0.02], [0.12, H + 0.08, bandV(HAY_THATCH_V, 0.8), 0.03], [0.06, H + 0.22, bandV(HAY_THATCH_V, 0.95), 0.02],
      [0.02, H + 0.3, bandV(HAY_THATCH_V, 1), 0.01]], 6, rng, 1);
    knot.translate(0, -H, 0); knot.rotateZ(0.35); knot.translate(0, H, 0);
    parts.push(knot);
  }
  return hayMerge(parts);
}
function cockSkirt(R: number, H: number, rng: Rng): THREE.BufferGeometry {
  const face = (y: number) => bandV(HAY_FACE_V, y / H);
  return turn([[R * 1.25, -0.02, face(0), 0.05], [R * 1.12, 0.04, face(0.05), 0.04], [R * 0.98, 0.08, face(0.08), 0.02]], 12, rng, 2);
}
/** A stub of a lopped branch along +x from the pole, rising by `rise` over its length, turned to `yaw`, at height y. */
function stub(len: number, rise: number, yaw: number, y: number): THREE.BufferGeometry {
  const g = hayPole(0.022, 0, len, 0, 0);
  g.rotateZ(-Math.PI / 2 + Math.atan2(rise, len));
  g.rotateY(yaw);
  g.translate(0, y, 0);
  return g;
}
/** The Podhale ostrewka: a lopped spruce pole set in the meadow, the hay hung up it in a slim stack, the branch stubs
 *  poking out through the hay and standing bare over its top. */
function ostrewka(rng: Rng): THREE.BufferGeometry {
  const R = 0.56, H = 1.9 + rng() * 0.15, face = (y: number) => bandV(HAY_FACE_V, y / H);
  const body = turn([[R * 0.95, -0.05, face(0), 0.04], [R, 0.16, face(0.16), 0.06], [R * 1.02, H * 0.36, face(H * 0.36), 0.08], [R * 0.9, H * 0.62, face(H * 0.62), 0.08],
    [R * 0.68, H * 0.82, face(H * 0.82), 0.07], [R * 0.32, H * 0.95, bandV(HAY_THATCH_V, 0.6), 0.04], [0.05, H, bandV(HAY_THATCH_V, 1), 0.02]], 10, rng, 2);
  const parts = [body, cockSkirt(R, H, rng), hayPole(0.045, -0.3, H + 0.5, (rng() - 0.5) * 0.06, (rng() - 0.5) * 0.06)];
  // through the hay: the stubs reach a hand past its face (its radius at that height, read off the profile above)
  for (const [t, r] of [[0.3, R * 1.02], [0.55, R * 0.95], [0.78, R * 0.72]] as const) {
    const yaw = rng() * Math.PI * 2;
    parts.push(stub(r + 0.14, 0.06, yaw, H * t));
  }
  // over the top: two bare stubs on the pole, cocked up
  for (const [dy, len] of [[0.16, 0.24], [0.34, 0.18]] as const) parts.push(stub(len, len * 0.5, rng() * Math.PI * 2, H + dy));
  return hayMerge(parts);
}
/** The monsoon belt's rice-straw stack: the straw packed round a bamboo pole in a drum, its cap thatched down and tied
 *  with a straw rope, the pole standing out of the top. */
function riceStack(rng: Rng): THREE.BufferGeometry {
  const R = 0.8, H = 1.95 + rng() * 0.15, face = (y: number) => bandV(HAY_FACE_V, y / H), cap = (t: number) => bandV(HAY_THATCH_V, t);
  const body = turn([[R * 0.95, -0.05, face(0), 0.03], [R, 0.1, face(0.1), 0.04], [R * 1.04, H * 0.3, face(H * 0.3), 0.05], [R, H * 0.58, face(H * 0.58), 0.05],
    [R * 0.9, H * 0.68, cap(0.1), 0.06], [R * 0.52, H * 0.82, cap(0.45), 0.06], [R * 0.22, H * 0.93, cap(0.8), 0.04], [0.04, H, cap(1), 0.02]], 12, rng, 2);
  // the tie: a straw rope round the cap where it closes on the pole
  const yt = H * 0.9, rt = R * 0.3;
  const rope = turn([[rt + 0.02, yt - 0.05, cap(0.9), 0], [rt + 0.06, yt, cap(0.95), 0], [rt + 0.01, yt + 0.05, cap(1), 0]], 10, rng, 1);
  return hayMerge([body, rope, cockSkirt(R, H, rng), hayPole(0.04, -0.3, H + 0.7, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.05)]);
}
function cockOf(f: BaleForm, rng: Rng): THREE.BufferGeometry {
  if (f.cock === 'ostrewka') return ostrewka(rng);
  if (f.cock === 'rice') return riceStack(rng);
  return hayCock(rng, f.cock === 'kopna');
}

/** The bale: a round bale, a ricklet of five small ones, a cock. On the hay print (position, normal, uv). Near ≤ 700. */
export function baleNear(f: BaleForm, rng: Rng): THREE.BufferGeometry {
  if (f.kind === 'cock') return cockOf(f, rng);
  if (f.kind === 'square') {
    // two side by side on two, a fifth across them, each its own lie
    const parts: THREE.BufferGeometry[] = [];
    const seats: Array<[number, number, number, number]> = [[0, 0.18, -0.24, 0.02], [0, 0.18, 0.24, -0.03], [0, 0.54, -0.24, 0.04], [0, 0.54, 0.24, -0.02], [0.05, 0.9, 0, Math.PI / 2 + 0.1]];
    for (const [x, y, z, yaw] of seats) {
      const b = smallBale(rng);
      b.rotateY(yaw);
      b.translate(x + (rng() - 0.5) * 0.04, y, z + (rng() - 0.5) * 0.03);
      parts.push(b);
    }
    return hayMerge(parts);
  }
  return roundBale(rng);
}

/** The silage bale: the round drum in its film, the film's wrinkles where it was stretched, the tape over its seam. On
 *  the vertex-colour material. Near ≤ 300 (one form: a bale casts its shadow). */
export function silageNear(f: BaleForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const R = 0.72, L = 1.45, film = f.film ?? hexLin(0x1c1e1c);
  const from = m.mark;
  lathe(m, [[R * 0.9, -L / 2], [R * 0.99, -L / 2 + 0.06], [R * 1.01, -0.3], [R * 1.02, 0], [R * 1.01, 0.3], [R * 0.99, L / 2 - 0.06], [R * 0.9, L / 2]], 14,
    (k, b) => mul(film, (0.92 + ((k * 7 + b * 3) % 5) * 0.035) * (b === 0 || b === 5 ? 0.9 : 1)), { capBottom: true, capTop: true });
  // the wrapping's overlaps: a few raised film bands spiralling round
  for (const t of [-0.25, 0.1, 0.42]) lathe(m, [[R * 1.035, t * L], [R * 1.035, t * L + 0.05]], 14, () => mul(film, 1.12), { phase: t });
  tip(m, from, [0, 0, 0], Z, Math.PI / 2);
  if (f.tape) bar(m, [-L / 2 - 0.004, R * 0.5, -0.04], [L / 2 + 0.004, R * 0.98, -0.04], 0.06, 0.004, Z, f.tape, 0, true);
  const g = finish(m);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -R * 0.84) p.setY(i, -R * 0.84 - (p.getY(i) + R * 0.84) * 0.2);
  g.translate(0, R * 0.84, 0);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
/** A bale burst: its hay slumped in a low heap where it lay, wads of it thrown, the twine loose (a cock knocked flat). */
export function baleBroken(f: BaleForm, rng: Rng): THREE.BufferGeometry {
  if (f.kind === 'silage') {
    // the film split and peeled, the silage spilled dark from it
    const m = newMesh();
    lathe(m, [[1.0, 0], [0.85, 0.22], [0.45, 0.42], [0, 0.46]], 10, (k) => mul(hexLin(0x5a5a2a), 0.9 + (k % 2) * 0.1), {});
    for (const s of [-1, 1]) {
      const from = m.mark;
      lathe(m, [[0.7, 0], [0.7, 0.9]], 6, () => f.film ?? hexLin(0x1c1e1c), {});
      tip(m, from, [0, 0, 0], X, s * 1.3);
      place(m, from, rng(), s * 0.6, 0.04, s * 0.3);
    }
    return finish(m);
  }
  const face = (y: number) => bandV(HAY_FACE_V, Math.min(1, y / 0.6));
  const parts = [turn([[1.15, -0.03, face(0), 0.08], [1.0, 0.12, face(0.12), 0.1], [0.7, 0.3, face(0.3), 0.1], [0.3, 0.42, face(0.42), 0.06], [0.03, 0.46, face(0.46), 0.02]], 12, rng, 2)];
  for (let k = 0; k < 4; k++) {
    const a = rng() * Math.PI * 2, d = 1.2 + rng() * 0.6, r = 0.18 + rng() * 0.12;
    const wad = turn([[r, -0.02, face(0), 0.03], [r * 0.8, r * 0.4, face(0.3), 0.04], [0.02, r * 0.6, face(0.5), 0.01]], 7, rng, 1);
    wad.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(wad);
  }
  // the rice straw falls as packed sheaves: a higher heap than loose hay's
  if (f.cock === 'rice') parts[0].scale(1.05, 1.35, 1.05);
  if (f.cock === 'ostrewka' || f.cock === 'rice') {
    // the pole snapped: its foot still standing out of the heap, askew, the top thrown down across the straw
    const r = f.cock === 'rice' ? 0.04 : 0.045, yaw = rng() * Math.PI * 2;
    parts.push(hayPole(r, -0.3, 0.95, Math.cos(yaw) * 0.12, Math.sin(yaw) * 0.12));
    const down = hayPole(r * 0.9, 0, f.cock === 'rice' ? 1.6 : 1.3, 0, 0);
    down.rotateZ(-Math.PI / 2 + 0.2);
    down.rotateY(yaw + 0.5);
    down.translate(Math.cos(yaw) * 0.3, 0.2, -Math.sin(yaw) * 0.3);
    parts.push(down);
  }
  if (f.kind === 'square') {
    // two of the small bales still whole, lying where they fell
    for (const [x, z, yaw] of [[0.9, 0.5, 0.7], [-0.8, -0.6, 2.1]] as const) {
      const b = smallBale(rng);
      b.rotateY(yaw);
      b.translate(x, 0.18, z);
      parts.push(b);
    }
  }
  return hayMerge(parts);
}

// ------------------------------------------------------------------------------------------------------- troughs

/** A trough's make: a hollowed log on its legs, a carved stone trough, a galvanised stock tank, a concrete trough with
 *  its float valve, a coopered wooden tub. */
export interface TroughForm { kind: 'log' | 'stone' | 'tank' | 'concrete' | 'tub'; body: Rgb; trim: Rgb; water: Rgb }
const TL = 1.9, TW = 0.62;

/** The water in it: a dark surface at `y` over the trough's inside (x ±hx, z ±hz), scum at its edge. */
function water(m: ReturnType<typeof newMesh>, y: number, hx: number, hz: number, col: Rgb): void {
  const uv: [number, number] = [0.5, 0.5], scum = mix(col, hexLin(0x4a5a2a), 0.5);
  m.quad([-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz], Y, () => uv, () => col, false);
  m.quad([-hx * 0.8, y + 0.001, -hz], [hx * 0.8, y + 0.001, -hz], [hx * 0.8, y + 0.001, -hz * 0.6], [-hx * 0.8, y + 0.001, -hz * 0.6], Y, () => uv, () => mul(scum, 0.9), false);
}
/** A prism of any (simple, counter-clockwise) section from a to b: its sides by `extrude`, its ends triangulated. */
function prism(m: ReturnType<typeof newMesh>, a: V3, b: V3, sec: ReadonlyArray<readonly [number, number]>, s: V3, u: V3,
  side: Rgb | ((edge: number) => Rgb), ends: Rgb): void {
  extrude(m, a, b, sec, s, u, side, null);
  const at = (o: V3, p: readonly [number, number]): V3 => [o[0] + s[0] * p[0] + u[0] * p[1], o[1] + s[1] * p[0] + u[1] * p[1], o[2] + s[2] * p[0] + u[2] * p[1]];
  const tris = THREE.ShapeUtils.triangulateShape(sec.map(([x, y]) => new THREE.Vector2(x, y)), []);
  const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(e[0], e[1], e[2]);
  for (const [o, sign] of [[a, -1], [b, 1]] as const) {
    const n: V3 = [e[0] / l * sign, e[1] / l * sign, e[2] / l * sign];
    for (const [i, j, k] of tris) faceTri(m, at(o, sec[i]), at(o, sec[j]), at(o, sec[k]), n, ends);
  }
}
/** Where the water went: a dark, ragged wet patch on the ground round the wreck (rx × rz). */
function spill(m: ReturnType<typeof newMesh>, rx: number, rz: number, rng: Rng): void {
  const n = 10, wet = hexLin(0x3a3226), pts: V3[] = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, j = 0.7 + rng() * 0.4; pts.push([Math.cos(a) * rx * j, 0.004, Math.sin(a) * rz * j]); }
  for (let k = 0; k < n; k++) faceTri(m, [0, 0.005, 0], pts[k], pts[(k + 1) % n], Y, mul(wet, 0.85 + (k % 3) * 0.06));
}

/** The log trough's section (round underside, flat cut top) and its hollow's (sunk in the top: lid edge first). */
const LOG_R = 0.3, LOG_Y = 0.36, HOLLOW_W = 0.42 * LOG_R, HOLLOW_FLOOR_W = 0.32 * LOG_R, HOLLOW_D = 0.13;
const LOG_SEC: Array<[number, number]> = [[-LOG_R * 0.86, 0.12], [-LOG_R, -0.05], [-LOG_R * 0.7, -LOG_R * 0.7], [0, -LOG_R], [LOG_R * 0.7, -LOG_R * 0.7], [LOG_R, -0.05],
  [LOG_R * 0.86, 0.12], [LOG_R * 0.6, 0.15], [-LOG_R * 0.6, 0.15]];
/** The hollow: its walls and floor facing into it (the section clockwise), its ends walls facing back along it. */
function hollow(m: ReturnType<typeof newMesh>, y: number, w: number, fw: number, d: number, z0: number, z1: number, col: Rgb): void {
  extrude(m, [0, y, z0], [0, y, z1], [[-w, 0], [w, 0], [fw, -d], [-fw, -d]], [1, 0, 0], Y, (e) => (e === 2 ? mul(col, 0.9) : col), null, 0);
  for (const [z, sz] of [[z0, 1], [z1, -1]] as const) {
    faceTri(m, [-w, y, z], [w, y, z], [fw, y - d, z], [0, 0, sz], mul(col, 0.95));
    faceTri(m, [-w, y, z], [fw, y - d, z], [-fw, y - d, z], [0, 0, sz], mul(col, 0.95));
  }
}
/** The walled trough's wall section (w half-thick, h high, its top edges chamfered). */
const wallSec = (w: number, h: number): Array<[number, number]> => [[-w, 0], [w, 0], [w, h - 0.03], [w - 0.03, h], [-w + 0.03, h], [-w, h - 0.03]];
const WALL_H = 0.58, WALL_T = 0.09;
/** A length of the walled (stone or concrete) trough from z0 to z1, as the wreck keeps it: its two walls and its floor
 *  (square-edged, the chamfer chipped off), and its end wall at z0 (the trough's own end). */
function walledLength(m: ReturnType<typeof newMesh>, body: Rgb, z0: number, z1: number, rng: Rng): void {
  const t = WALL_T, H = WALL_H, sz = Math.sign(z1 - z0), box = (w: number, h: number): Array<[number, number]> => [[-w, 0], [w, 0], [w, h], [-w, h]];
  for (const sx of [-1, 1]) extrude(m, [sx * (TW / 2 - t / 2), 0, z0], [sx * (TW / 2 - t / 2), 0, z1], box(t / 2, H - rng() * 0.05), [-1, 0, 0], Y,
    (e) => mul(body, 0.88 + (e % 3) * 0.06), mul(body, 0.8));
  extrude(m, [0, 0, z0 + sz * t], [0, 0, z1], box(TW / 2 - t, 0.12), [-1, 0, 0], Y, mul(body, 0.5), mul(body, 0.7), 0);
  extrude(m, [-TW / 2 + t, 0, z0 + sz * t / 2], [TW / 2 - t, 0, z0 + sz * t / 2], box(t / 2, H), Z, Y, mul(body, 0.95), mul(body, 0.9), 0);
}
/** The stock tank's shell: round ends either side of a straight middle (no vertex on the middle's line), corrugated
 *  rings, a rolled rim and its inside down to the water. */
const TANK_PROFILE: Array<[number, number]> = [[0.42, 0], [0.44, 0.02], [0.44, 0.15], [0.452, 0.18], [0.44, 0.21], [0.44, 0.38], [0.452, 0.41], [0.44, 0.44], [0.44, 0.58],
  [0.46, 0.6], [0.42, 0.6], [0.42, 0.46]];
function stretchTank(m: ReturnType<typeof newMesh>, from: number): void {
  const p = m.p;
  for (let i = from; i < p.length; i += 3) { p[i + 2] += Math.sign(p[i + 2]) * (TL / 2 - 0.44); p[i] *= (TW / 2 + 0.02) / 0.44; }
}

/** The trough (1.9 m along z, 0.62 m across, its rim about 0.6 m up). Near ≤ 300 triangles. */
export function troughNear(f: TroughForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const body = tone(f.body, rng, 0.08);
  switch (f.kind) {
    case 'log': {
      // a log split and hollowed: its round underside, its flat cut top round the hollow sunk in it, on two cross legs
      const y = LOG_Y, r = LOG_R, top = y + 0.15, hz = TL / 2 - 0.14, uv: [number, number] = [0.5, 0.5];
      extrude(m, [0, y, -TL / 2], [0, y, TL / 2], LOG_SEC, [-1, 0, 0], Y, (e) => mul(body, 0.86 + (e % 3) * 0.06), mix(body, f.trim, 0.5), 7);
      const cut = mul(f.trim, 1.1);
      for (const sx of [-1, 1]) m.quad([sx * HOLLOW_W, top, -TL / 2], [sx * r * 0.6, top, -TL / 2], [sx * r * 0.6, top, TL / 2], [sx * HOLLOW_W, top, TL / 2], Y, () => uv, () => cut, false);
      for (const sz of [-1, 1]) m.quad([-HOLLOW_W, top, sz * hz], [HOLLOW_W, top, sz * hz], [HOLLOW_W, top, sz * TL / 2], [-HOLLOW_W, top, sz * TL / 2], Y, () => uv, () => cut, false);
      hollow(m, top, HOLLOW_W, HOLLOW_FLOOR_W, HOLLOW_D, -hz, hz, mul(body, 0.45));
      water(m, top - 0.05, HOLLOW_W - (HOLLOW_W - HOLLOW_FLOOR_W) * (0.05 / HOLLOW_D) - 0.003, hz - 0.003, f.water);
      for (const z of [-TL * 0.32, TL * 0.32]) for (const s of [-1, 1]) pole(m, [s * 0.36, 0, z], [-s * 0.12, y - 0.05, z], 0.05, 5, tone(f.trim, rng, 0.12), true);
      break;
    }
    case 'stone': case 'concrete': {
      // a block hollowed: its walls (the rim chamfered), its floor, its water; a concrete one's float valve and its pipe
      const H = WALL_H, t = WALL_T;
      for (const sx of [-1, 1]) extrude(m, [sx * (TW / 2 - t / 2), 0, -TL / 2], [sx * (TW / 2 - t / 2), 0, TL / 2], wallSec(t / 2, H), [-1, 0, 0], Y,
        (e) => mul(body, 0.88 + (e % 3) * 0.06), mul(body, 0.92));
      for (const sz of [-1, 1]) extrude(m, [-TW / 2 + t, 0, sz * (TL / 2 - t / 2)], [TW / 2 - t, 0, sz * (TL / 2 - t / 2)], wallSec(t / 2, H), Z, Y, mul(body, 0.95), mul(body, 0.9));
      extrude(m, [-TW / 2 + t, 0, -TL / 2 + t], [TW / 2 - t, 0, -TL / 2 + t + 0.001], [[0, 0], [TL - 2 * t, 0], [TL - 2 * t, 0.12], [0, 0.12]], Z, Y, mul(body, 0.5), mul(body, 0.5));
      water(m, H - 0.12, TW / 2 - t, TL / 2 - t, f.water);
      if (f.kind === 'concrete') {
        pole(m, [TW / 2 + 0.03, 0, -TL / 2 + 0.2], [TW / 2 + 0.03, H + 0.12, -TL / 2 + 0.2], 0.02, 5, f.trim, false);
        pole(m, [TW / 2 + 0.03, H + 0.12, -TL / 2 + 0.2], [0.1, H + 0.12, -TL / 2 + 0.2], 0.02, 5, f.trim, false);
        lathe(m, [[0.07, H - 0.13], [0.08, H - 0.07], [0.07, H - 0.04], [0, H - 0.03]], 6, () => mul(f.trim, 1.2), { x: 0.02, z: -TL / 2 + 0.28 });
      }
      break;
    }
    case 'tank': {
      // the galvanised stock tank: its round-ended shell in corrugated rings, its rolled rim, its inside, the water
      const from = m.mark, phase = Math.PI / 12;
      lathe(m, TANK_PROFILE, 12, (k, b) => (b === 10 ? mul(body, 0.7) : mul(body, (b === 3 || b === 6 || b === 9 ? 1.12 : 1) * (0.94 + (k % 3) * 0.04))), { phase });
      lathe(m, [[0.42, 0.48], [0, 0.48]], 12, () => mix(f.water, hexLin(0x4a5a2a), 0.25), { phase });
      stretchTank(m, from);
      break;
    }
    case 'tub': {
      // two coopered tubs side by side, their hoops of bamboo, their insides down to the water, one with its dipper
      for (const z of [-0.48, 0.48]) {
        const staves = Array.from({ length: 9 }, () => tone(f.body, rng, 0.2));
        lathe(m, [[0.34, 0], [0.37, 0.12], [0.385, 0.15], [0.4, 0.46], [0.415, 0.49], [0.42, 0.56], [0.38, 0.56], [0.375, 0.47]], 9,
          (k, b) => (b === 1 || b === 3 ? f.trim : b === 6 ? mul(staves[k], 0.6) : staves[k]), { faceted: true, z });
        lathe(m, [[0.376, 0.48], [0, 0.48]], 9, () => f.water, { faceted: true, z });
      }
      pole(m, [0.1, 0.5, -0.48], [0.35, 0.75, -0.6], 0.012, 4, f.trim);
      break;
    }
  }
  return finish(m);
}
/** The trough past 45 m, its own outline: the log's section, the tank's stadium, the two tubs, the walled block. */
export function troughFar(f: TroughForm): THREE.BufferGeometry {
  const m = newMesh();
  if (f.kind === 'log') extrude(m, [0, LOG_Y, -TL / 2], [0, LOG_Y, TL / 2], LOG_SEC, [-1, 0, 0], Y, (e) => mul(f.body, 0.86 + (e % 3) * 0.06), mix(f.body, f.trim, 0.5));
  else if (f.kind === 'tank') {
    const from = m.mark;
    lathe(m, [[0.44, 0], [0.44, 0.6], [0, 0.6]], 8, (k, b) => (b === 1 ? mul(f.water, 1.4) : mul(f.body, 0.94 + (k % 2) * 0.06)), { phase: Math.PI / 8 });
    stretchTank(m, from);
  } else if (f.kind === 'tub') {
    for (const z of [-0.48, 0.48]) lathe(m, [[0.36, 0], [0.42, 0.56], [0, 0.56]], 7, (k, b) => (b === 1 ? f.water : mul(f.body, 0.9 + (k % 2) * 0.08)), { faceted: true, z });
  } else extrude(m, [0, 0, -TL / 2], [0, 0, TL / 2], [[-TW / 2, 0], [TW / 2, 0], [TW / 2, 0.56], [-TW / 2, 0.56]], [-1, 0, 0], Y, f.body, mul(f.body, 0.9), 0);
  return finish(m);
}
/** The trough broken, each its own way, the water gone dark into the ground round it: the log split along its length,
 *  one half rolled over and the legs knocked out; the stone or concrete cracked across, its two ends tipped apart over
 *  the broken middle's lumps; the stock tank crushed in at one end and rolled on its side; one tub tipped over and the
 *  other burst, its staves sprung and its hoop on the ground. */
export function troughBroken(f: TroughForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const body = tone(f.body, rng, 0.08);
  spill(m, 1.0, 1.25, rng);
  switch (f.kind) {
    case 'log': {
      const r = LOG_R, half = (sx: number): Array<[number, number]> => {
        // one half of the split log's section (counter-clockwise), the hollow's half in its top
        const h: Array<[number, number]> = [[0, -r], [r * 0.7, -r * 0.7], [r, -0.05], [r * 0.86, 0.12], [r * 0.6, 0.15], [HOLLOW_W, 0.15], [HOLLOW_FLOOR_W, 0.15 - HOLLOW_D], [0, 0.15 - HOLLOW_D]];
        return sx > 0 ? h : h.map(([x, y]) => [-x, y] as [number, number]).reverse();
      };
      const side = (e: number) => mul(body, 0.86 + (e % 3) * 0.06), heart = mul(body, 0.55);
      // the one half lying as it fell, on its round back; the other rolled onto its split face, broken short
      let from = m.mark;
      prism(m, [0, 0, -TL / 2], [0, 0, TL / 2], half(-1), [-1, 0, 0], Y, side, mix(body, f.trim, 0.5));
      tip(m, from, [0, 0, 0], Z, 0.35);
      place(m, from, 0.12, -0.32, r * 0.95, 0.05);
      from = m.mark;
      const short = TL * (0.62 + rng() * 0.08);
      prism(m, [0, 0, -short / 2], [0, 0, short / 2], half(1), [-1, 0, 0], Y, (e) => (e >= 4 && e <= 6 ? heart : side(e)), mix(body, f.trim, 0.5));
      tip(m, from, [0, 0, 0], Z, Math.PI / 2 + 0.2);
      place(m, from, -0.2, 0.45, 0.3, 0.3);
      // the splinters and the legs
      for (const [x, z, yaw] of [[0.2, -0.75, 0.4], [-0.6, 0.9, 1.9]] as const) bar(m, [x - 0.25 * Math.cos(yaw), 0.03, z - 0.25 * Math.sin(yaw)], [x + 0.25 * Math.cos(yaw), 0.05, z + 0.25 * Math.sin(yaw)], 0.04, 0.06, Y, heart);
      for (const [x, z, yaw] of [[0.75, -0.3, 0.3], [0.65, 0.75, 2.6]] as const) pole(m, [x, 0.05, z], [x + 0.42 * Math.cos(yaw), 0.05, z + 0.42 * Math.sin(yaw)], 0.05, 5, tone(f.trim, rng, 0.12), true);
      break;
    }
    case 'stone': case 'concrete': {
      // cracked across: the two ends tipped apart, the broken middle in lumps between them
      for (const s of [-1, 1]) {
        const from = m.mark, len = TL * (0.34 + rng() * 0.06);
        walledLength(m, body, -TL / 2, -TL / 2 + len, rng);
        if (s > 0) m.turn(from, 0, 0, Math.PI);
        tip(m, from, [0, 0, s * (TL / 2 - len)], [1, 0, 0], s * (0.22 + rng() * 0.1));
        place(m, from, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.25, 0, s * 0.18);
      }
      for (let k = 0; k < 3; k++) {
        const a = rng() * Math.PI * 2, d = 0.1 + rng() * 0.3, c = 0.12 + rng() * 0.08, tint = mul(body, 0.8 + rng() * 0.2);
        lathe(m, [[c, 0], [c * 0.7, c * 0.8], [0, c * 0.95]], 4, () => tint, { faceted: true, x: Math.cos(a) * d, z: Math.sin(a) * d * 0.5, phase: rng() });
      }
      break;
    }
    case 'tank': {
      // crushed in at one end, its rim buckled, rolled half onto its side
      const from = m.mark;
      lathe(m, TANK_PROFILE, 12, (k, b) => (b === 10 ? mul(body, 0.7) : mul(body, (b === 3 || b === 6 || b === 9 ? 1.08 : 0.96) * (0.94 + (k % 3) * 0.04))), { phase: Math.PI / 12 });
      stretchTank(m, from);
      const p = m.p;
      for (let i = from; i < p.length; i += 3) {
        const t = (p[i + 2] + TL / 2) / TL, squash = 0.42 + 0.58 * Math.min(1, t * 1.6);
        p[i] *= 0.7 + 0.3 * squash; p[i + 1] *= squash; p[i + 1] += Math.sin(p[i + 2] * 7) * 0.02 * (1 - squash);
      }
      tip(m, from, [0, 0, 0], Z, 0.95);
      place(m, from, 0.3, 0.14, 0.12, 0);
      break;
    }
    case 'tub': {
      // the one tub tipped over on its side
      const from = m.mark;
      lathe(m, [[0.34, 0], [0.37, 0.12], [0.385, 0.15], [0.4, 0.46], [0.415, 0.49], [0.42, 0.56], [0.38, 0.56], [0.375, 0.47]], 9,
        (k, b) => (b === 1 || b === 3 ? f.trim : mul(f.body, 0.85 + (k % 3) * 0.08)), { faceted: true, capBottom: true });
      tip(m, from, [0, 0, 0], X, Math.PI / 2);
      place(m, from, 0.5, -0.15, 0.4, -0.5);
      // the other burst: its staves sprung out round its bottom, its hoop on the ground
      const cx = 0.1, cz = 0.5;
      lathe(m, [[0.34, 0.01], [0, 0.04]], 9, () => mul(f.body, 0.7), { faceted: true, x: cx, z: cz });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + (rng() - 0.5) * 1.6, d = 0.38 + rng() * 0.5, yaw = rng() * Math.PI;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, hl = 0.26;
        bar(m, [x - Math.cos(yaw) * hl, 0.02, z - Math.sin(yaw) * hl], [x + Math.cos(yaw) * hl, 0.03 + rng() * 0.04, z + Math.sin(yaw) * hl], 0.025, 0.09, Y, tone(f.body, rng, 0.2));
      }
      lathe(m, [[0.43, 0.005], [0.45, 0.02], [0.43, 0.035]], 9, () => f.trim, { faceted: true, x: cx + 0.08, z: cz - 0.05 });
      break;
    }
  }
  return finish(m);
}
