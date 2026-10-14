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
import { bar, extrude, finish, lathe, newMesh, place, pole, tip, tone } from './clutterForms.ts';

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
  m.quad([-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz], Y, () => uv, (q) => (Math.abs(q[0]) > hx * 0.8 ? scum : col), false);
  m.quad([-hx * 0.8, y + 0.001, -hz], [hx * 0.8, y + 0.001, -hz], [hx * 0.8, y + 0.001, -hz * 0.6], [-hx * 0.8, y + 0.001, -hz * 0.6], Y, () => uv, () => mul(scum, 0.9), false);
}

/** The trough (1.9 m along z, 0.62 m across, its rim about 0.6 m up). Near ≤ 260 triangles. */
export function troughNear(f: TroughForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const body = tone(f.body, rng, 0.08);
  switch (f.kind) {
    case 'log': {
      // a log split and hollowed: its round underside, its flat cut top with the hollow sunk in it, on two cross legs
      const r = 0.3, y = 0.36;
      extrude(m, [0, y, -TL / 2], [0, y, TL / 2], [[-r * 0.86, 0.12], [-r, -0.05], [-r * 0.7, -r * 0.7], [0, -r], [r * 0.7, -r * 0.7], [r, -0.05], [r * 0.86, 0.12], [r * 0.6, 0.15], [-r * 0.6, 0.15]],
        [-1, 0, 0], Y, (e) => (e >= 7 ? mul(f.trim, 1.1) : mul(body, 0.86 + (e % 3) * 0.06)), mix(body, f.trim, 0.5));
      // the hollow (its walls and floor dark wood, its water)
      extrude(m, [0, y + 0.151, -TL / 2 + 0.12], [0, y + 0.151, TL / 2 - 0.12], [[-r * 0.55, -0.001], [r * 0.55, -0.001], [r * 0.45, -0.14], [-r * 0.45, -0.14]], [-1, 0, 0], Y,
        mul(body, 0.45), mul(body, 0.4), 2);
      water(m, y + 0.06, r * 0.5, TL / 2 - 0.14, f.water);
      for (const z of [-TL * 0.32, TL * 0.32]) for (const s of [-1, 1]) pole(m, [s * 0.36, 0, z], [-s * 0.12, y - 0.05, z], 0.05, 5, tone(f.trim, rng, 0.12), true);
      break;
    }
    case 'stone': case 'concrete': {
      // a block hollowed: its walls (the rim chamfered), its floor, its water; a concrete one's float valve and its pipe
      const H = 0.58, t = 0.09;
      const sec = (w: number, h: number): Array<[number, number]> => [[-w, 0], [w, 0], [w, h - 0.03], [w - 0.03, h], [-w + 0.03, h], [-w, h - 0.03]];
      for (const sx of [-1, 1]) extrude(m, [sx * (TW / 2 - t / 2), 0, -TL / 2], [sx * (TW / 2 - t / 2), 0, TL / 2], sec(t / 2, H), [-1, 0, 0], Y,
        (e) => mul(body, 0.88 + (e % 3) * 0.06), mul(body, 0.92));
      for (const sz of [-1, 1]) extrude(m, [-TW / 2 + t, 0, sz * (TL / 2 - t / 2)], [TW / 2 - t, 0, sz * (TL / 2 - t / 2)], sec(t / 2, H), Z, Y, mul(body, 0.95), mul(body, 0.9));
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
      // the galvanised stock tank: its round-ended shell in corrugated rings, its rolled rim, the water
      const from = m.mark;
      lathe(m, [[0.42, 0], [0.44, 0.02], [0.44, 0.15], [0.452, 0.18], [0.44, 0.21], [0.44, 0.38], [0.452, 0.41], [0.44, 0.44], [0.44, 0.58], [0.46, 0.6], [0.42, 0.6]], 12,
        (k, b) => mul(body, (b === 3 || b === 6 || b === 9 ? 1.12 : 1) * (0.94 + (k % 3) * 0.04)), { capBottom: true });
      // the tank is stretched long: its round ends either side of a straight middle
      const p = m.p;
      for (let i = from; i < p.length; i += 3) p[i + 2] = p[i + 2] * 1.0 + Math.sign(p[i + 2]) * (TL / 2 - 0.44);
      for (let i = from; i < p.length; i += 3) p[i] *= (TW / 2 + 0.02) / 0.44;
      water(m, 0.48, TW / 2 - 0.02, TL / 2 - 0.1, f.water);
      break;
    }
    case 'tub': {
      // two coopered tubs side by side, their hoops of bamboo, one with its dipper
      for (const z of [-0.48, 0.48]) {
        const staves = Array.from({ length: 9 }, () => tone(f.body, rng, 0.2));
        lathe(m, [[0.34, 0], [0.37, 0.12], [0.385, 0.15], [0.4, 0.46], [0.415, 0.49], [0.42, 0.56], [0.38, 0.56]], 9,
          (k, b) => (b === 1 || b === 3 ? f.trim : staves[k]), { faceted: true, capBottom: true, z });
        const wet = m.mark;
        water(m, 0.48, 0.3, 0.3, f.water);
        place(m, wet, 0, 0, 0, z);
      }
      pole(m, [0.1, 0.5, -0.48], [0.35, 0.75, -0.6], 0.012, 4, f.trim);
      break;
    }
  }
  return finish(m);
}
export function troughFar(f: TroughForm): THREE.BufferGeometry {
  const m = newMesh();
  extrude(m, [0, 0, -TL / 2], [0, 0, TL / 2], [[-TW / 2, 0], [TW / 2, 0], [TW / 2, 0.56], [-TW / 2, 0.56]], [-1, 0, 0], Y, f.body, mul(f.body, 0.9), 0);
  return finish(m);
}
/** The trough broken: split along its length or its stone cracked through, its halves apart, the water gone dark into
 *  the ground. */
export function troughBroken(f: TroughForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const body = tone(f.body, rng, 0.08), uv: [number, number] = [0.5, 0.5];
  m.quad([-0.9, 0.004, -1.2], [0.9, 0.004, -1.2], [0.9, 0.004, 1.2], [-0.9, 0.004, 1.2], Y, () => uv, () => mul(hexLin(0x3a3226), 0.9), false);
  for (const [i, s] of [-1, 1].entries()) {
    const from = m.mark, len = TL * (0.45 + rng() * 0.1);
    if (f.kind === 'tank' || f.kind === 'tub') lathe(m, [[0.42, 0], [0.44, 0.3], [0.44, 0.5]], 8, (k) => mul(body, 0.9 + (k % 2) * 0.08), { capBottom: true });
    else extrude(m, [0, 0, -len / 2], [0, 0, len / 2], [[-0.3, 0], [0.3, 0], [0.3, 0.45], [0.2, 0.52], [-0.3, 0.4]], [-1, 0, 0], Y, (e) => mul(body, 0.85 + (e % 2) * 0.1), mul(body, 0.7));
    tip(m, from, [0.3, 0, 0], Z, s * (0.25 + rng() * 0.2));
    place(m, from, (rng() - 0.5) * 0.6, s * 0.18, 0, (i - 0.5) * 1.05);
  }
  return finish(m);
}
