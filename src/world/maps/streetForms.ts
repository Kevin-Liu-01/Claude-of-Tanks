// src/world/maps/streetForms.ts — the street furniture's geometry, form by form (props lane A, family #14, 2026-10-14;
// WORKLIST.md #14: "seat and back slats with gaps and chamfers on end frames; sign posts with caps, U-bolt clamps,
// plates with folded edges and back rails, legends in relief; extruded barrier profiles with slope breaks, lifting
// slots, scuppers and connectors; cones with base flange; trash cans with lids and liners").
//
// Each builder returns one non-indexed geometry on the baked material (position, normal, flat uv, linear vertex
// colour), base on y = 0, in the legacy kind's frame and extent (streetKit.ts keeps every record). The kit tables
// (streetKit.ts) choose the form and its paint by map and period.
import * as THREE from 'three';
import { mix, mul, type Rgb, type V3 } from './craftMesh.ts';
import { bar, easedBoard, extrude, faceTri, finish, lathe, newMesh, place, pole, tip, tone, waneyBoard } from './clutterForms.ts';

type Rng = () => number;
const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];
type M = ReturnType<typeof newMesh>;

// ------------------------------------------------------------------------------------------------------- benches

/** A bench's make: cast-iron park ends, the Eastern bloc's concrete ends, a rendered mastaba, bamboo, a WPA plank bench on
 *  log legs, stone supports under timber, a Scandinavian timber bench, a municipal steel-and-wood one, all-steel. */
export interface BenchForm {
  kind: 'castiron' | 'concrete' | 'mastaba' | 'bamboo' | 'wpa' | 'stone' | 'timber' | 'municipal' | 'steel';
  wood: Rgb; frame: Rgb;
}
const L = 1.7, SEAT_Y = 0.46, DEPTH = 0.42;

/** The seat's slats along the bench (x), eased, with gaps; `n` of them across its depth, at `y`, from z0 to z1. */
function slats(m: M, n: number, y: number, z0: number, z1: number, len: number, col: Rgb, rng: Rng, t = 0.03): void {
  const w = (z1 - z0) / n;
  for (let k = 0; k < n; k++) {
    const z = z0 + w * (k + 0.5), c = tone(col, rng, 0.16);
    extrude(m, [-len / 2, y, z], [len / 2, y, z], easedBoard(w - 0.014, t, 0.006), [0, 0, 1], Y, c, mul(c, 1.12), 0);
  }
}
/** The back's slats, leaning back by `lean`, from height y0 to y1 behind z. */
function backSlats(m: M, n: number, y0: number, y1: number, z: number, lean: number, len: number, col: Rgb, rng: Rng): void {
  const h = (y1 - y0) / n;
  for (let k = 0; k < n; k++) {
    const yc = y0 + h * (k + 0.5), zc = z - (yc - y0) * Math.tan(lean), c = tone(col, rng, 0.16);
    const up: V3 = [0, Math.cos(lean), -Math.sin(lean)], out: V3 = [0, Math.sin(lean), Math.cos(lean)];
    extrude(m, [-len / 2, yc, zc], [len / 2, yc, zc], easedBoard(h - 0.02, 0.028, 0.006).map(([s, u]) => [s, u] as [number, number]), up, out, c, mul(c, 1.12), 0);
  }
}

/** The bench (1.7 m long, its seat at 0.46 m, its back to 0.9 m). Near ≤ 260 triangles. */
export function benchNear(f: BenchForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const fr = tone(f.frame, rng, 0.08);
  switch (f.kind) {
    case 'castiron': {
      // the cast ends: a front leg curving out, a rear leg rising to the back's support, the arm over them, the bearer
      for (const sx of [-1, 1]) {
        const x = sx * (L / 2 - 0.12);
        pole(m, [x, 0, 0.17], [x, 0.24, 0.13], 0.025, 4, fr, true);
        pole(m, [x, 0.24, 0.13], [x, SEAT_Y - 0.02, 0.15], 0.025, 4, fr);
        pole(m, [x, 0, -0.2], [x, SEAT_Y, -0.16], 0.025, 4, fr, true);
        pole(m, [x, SEAT_Y, -0.16], [x, 0.9, -0.26], 0.022, 4, fr);
        pole(m, [x, SEAT_Y - 0.03, 0.2], [x, SEAT_Y - 0.03, -0.2], 0.02, 4, fr, true);
        pole(m, [x, SEAT_Y - 0.03, 0.15], [x, 0.66, 0.18], 0.02, 4, fr);
        pole(m, [x, 0.66, 0.2], [x, 0.66, -0.2], 0.022, 4, fr, true);
      }
      slats(m, 4, SEAT_Y - 0.01, -0.2, 0.2, L, f.wood, rng);
      backSlats(m, 3, SEAT_Y + 0.1, 0.88, -0.2, 0.22, L, f.wood, rng);
      break;
    }
    case 'concrete': case 'stone': {
      // the ends: a concrete or stone block each, the seat's planks on them (a back on bent steel on the concrete ones)
      for (const sx of [-1, 1]) {
        const x = sx * (L / 2 - 0.2), sec: Array<[number, number]> = f.kind === 'stone'
          ? [[-0.2, 0], [0.2, 0], [0.19, SEAT_Y - 0.06], [0.16, SEAT_Y - 0.03], [-0.16, SEAT_Y - 0.03], [-0.19, SEAT_Y - 0.06]]
          : [[-0.19, 0], [0.19, 0], [0.17, SEAT_Y - 0.03], [-0.17, SEAT_Y - 0.03]];
        extrude(m, [x - 0.1, 0, 0], [x + 0.1, 0, 0], sec.map(([z, y]) => [z, y] as [number, number]), [0, 0, -1], Y, tone(f.frame, rng, 0.12), mul(f.frame, 0.92));
      }
      if (f.kind === 'stone') { slats(m, 2, SEAT_Y - 0.03, -0.19, 0.19, L, f.wood, rng, 0.05); break; }
      slats(m, 4, SEAT_Y - 0.03, -0.19, 0.19, L, f.wood, rng);
      for (const sx of [-1, 1]) pole(m, [sx * (L / 2 - 0.2), SEAT_Y - 0.03, -0.17], [sx * (L / 2 - 0.2), 0.86, -0.25], 0.02, 4, mul(f.frame, 0.6));
      backSlats(m, 2, SEAT_Y + 0.14, 0.86, -0.21, 0.2, L, f.wood, rng);
      break;
    }
    case 'mastaba': {
      // a rendered bench against nothing: its block, its sloped back, a cloth thrown over the seat
      extrude(m, [-L / 2, 0, 0], [L / 2, 0, 0], [[-0.21, 0], [0.24, 0], [0.24, SEAT_Y - 0.03], [0.2, SEAT_Y], [-0.21, SEAT_Y]], [0, 0, -1], Y,
        (e) => tone(f.frame, () => ((e * 7) % 5) / 5, 0.12), mul(f.frame, 0.9));
      extrude(m, [-L / 2, 0, 0], [L / 2, 0, 0], [[-0.21, SEAT_Y], [-0.05, SEAT_Y], [-0.12, 0.86], [-0.21, 0.88]], [0, 0, -1], Y, mul(f.frame, 0.96), mul(f.frame, 0.88));
      // a folded rug laid along the seat (two layers, its fold toward the front)
      const cloth = tone(f.wood, rng, 0.1);
      extrude(m, [-0.5, SEAT_Y, 0.04], [0.45, SEAT_Y, 0.04], [[-0.08, 0], [0.14, 0], [0.15, 0.015], [0.14, 0.03], [-0.08, 0.03]], [0, 0, 1], Y, cloth, mul(cloth, 0.85), 0);
      extrude(m, [-0.46, SEAT_Y + 0.03, 0.06], [0.4, SEAT_Y + 0.03, 0.06], [[-0.05, 0], [0.1, 0], [0.11, 0.012], [0.1, 0.024], [-0.05, 0.024]], [0, 0, 1], Y, mul(cloth, 0.92), mul(cloth, 0.8), 0);
      break;
    }
    case 'bamboo': case 'wpa': {
      // legs (bamboo culms or split logs), two rails, the seat of culms or a thick plank, a back rail
      const r = f.kind === 'bamboo' ? 0.03 : 0.055;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        pole(m, [sx * (L / 2 - 0.15), -0.05, sz * 0.15], [sx * (L / 2 - 0.15) + sx * 0.03, SEAT_Y - 0.04, sz * 0.15], r, 5, tone(f.frame, rng, 0.12), false);
      }
      for (const sx of [-1, 1]) pole(m, [sx * (L / 2 - 0.12), SEAT_Y - 0.08, -0.2], [sx * (L / 2 - 0.12), SEAT_Y - 0.08, 0.2], r * 0.8, 4, mul(f.frame, 0.9), true);
      if (f.kind === 'bamboo') {
        for (let k = 0; k < 5; k++) pole(m, [-L / 2, SEAT_Y - 0.035, -0.16 + k * 0.08], [L / 2, SEAT_Y - 0.035, -0.16 + k * 0.08], 0.035, 5, tone(f.wood, rng, 0.14), true);
        for (const sx of [-1, 1]) pole(m, [sx * (L / 2 - 0.15), SEAT_Y - 0.04, -0.18], [sx * (L / 2 - 0.15), 0.84, -0.24], 0.025, 4, f.frame);
        pole(m, [-L / 2, 0.8, -0.24], [L / 2, 0.8, -0.24], 0.032, 5, tone(f.wood, rng, 0.14), true);
      } else {
        const c = tone(f.wood, rng, 0.14);
        extrude(m, [-L / 2, SEAT_Y - 0.06, 0], [L / 2, SEAT_Y - 0.06, 0], waneyBoard(0.4, 0.06, rng), [0, 0, 1], Y, c, mul(c, 1.15));
        for (const sx of [-1, 1]) pole(m, [sx * (L / 2 - 0.15), SEAT_Y, -0.18], [sx * (L / 2 - 0.15), 0.86, -0.24], 0.04, 5, f.frame);
        extrude(m, [-L / 2, 0.72, -0.25], [L / 2, 0.72, -0.25], waneyBoard(0.2, 0.045, rng).map(([s, u]) => [s, u] as [number, number]), Y, [0, 0, 1], tone(f.wood, rng, 0.14), mul(c, 1.1));
      }
      break;
    }
    default: {
      // timber, municipal and steel benches: two end frames of members, the seat and back slats on them
      for (const sx of [-1, 1]) {
        const x = sx * (L / 2 - 0.1), col = tone(f.frame, rng, 0.1);
        bar(m, [x, 0, 0.17], [x, SEAT_Y - 0.03, 0.17], 0.05, 0.05, X, col, 0.01, false);
        bar(m, [x, 0, -0.17], [x, 0.9, -0.25], 0.05, 0.05, X, col, 0.01, false);
        bar(m, [x, SEAT_Y - 0.06, 0.2], [x, SEAT_Y - 0.06, -0.21], 0.05, 0.05, X, mul(col, 0.92), 0.01, false);
      }
      const seat = f.kind === 'steel' ? mul(f.wood, 1) : f.wood;
      slats(m, f.kind === 'timber' ? 3 : 4, SEAT_Y - 0.035, -0.2, 0.2, L, seat, rng, f.kind === 'timber' ? 0.04 : 0.03);
      backSlats(m, f.kind === 'timber' ? 2 : 3, SEAT_Y + 0.12, 0.88, -0.19, 0.2, L, seat, rng);
    }
  }
  return finish(m);
}

export function benchFar(f: BenchForm): THREE.BufferGeometry {
  const m = newMesh();
  extrude(m, [-L / 2, 0, 0], [L / 2, 0, 0], [[-0.2, 0], [0.2, 0], [0.2, SEAT_Y], [-0.2, SEAT_Y]], [0, 0, -1], Y, mix(f.wood, f.frame, 0.4), mul(f.frame, 0.9), 0);
  if (f.kind !== 'stone') extrude(m, [-L / 2, 0, 0], [L / 2, 0, 0], [[-0.21, SEAT_Y], [-0.15, SEAT_Y], [-0.2, 0.88], [-0.25, 0.88]], [0, 0, -1], Y, f.wood, f.wood);
  return finish(m);
}

/** The bench broken: an end down, the seat's slats snapped and lying, the back hanging off the other end. */
export function benchBroken(f: BenchForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const fr = tone(f.frame, rng, 0.08);
  if (f.kind === 'mastaba' || f.kind === 'stone' || f.kind === 'concrete') {
    // the masonry's broken: its block split, a slab of it fallen, rubble
    extrude(m, [-L / 2, 0, 0], [-0.1, 0, 0], [[-0.21, 0], [0.24, 0], [0.22, SEAT_Y * 0.7], [-0.2, SEAT_Y * 0.5]], [0, 0, -1], Y, f.frame, mul(f.frame, 0.85));
    const slab = m.mark;
    extrude(m, [0, 0, 0], [0.75, 0, 0], [[-0.2, 0], [0.2, 0], [0.2, 0.12], [-0.2, 0.12]], [0, 0, -1], Y, mul(f.frame, 0.95), mul(f.frame, 0.85));
    tip(m, slab, [0, 0, 0], Z, -0.25);
    place(m, slab, rng() * 0.4, 0.05, 0, 0.15);
  } else {
    const end = m.mark;
    for (const z of [0.17, -0.17]) pole(m, [0, 0, z], [0, SEAT_Y, z], 0.03, 4, fr, true);
    pole(m, [0, SEAT_Y - 0.03, 0.2], [0, SEAT_Y - 0.03, -0.2], 0.025, 4, fr, true);
    tip(m, end, [0, 0, 0], X, 1.45);
    place(m, end, 0.3, -L / 2 + 0.2, 0, 0.1);
    for (const sx of [1]) for (const z of [0.17, -0.17]) pole(m, [sx * (L / 2 - 0.12), 0, z], [sx * (L / 2 - 0.12), SEAT_Y, z], 0.03, 4, fr, true);
  }
  for (let k = 0; k < 4; k++) {
    const len = 0.5 + rng() * 0.6, c = tone(f.wood, rng, 0.16), from = m.mark;
    extrude(m, [-len / 2, 0, 0], [len / 2, 0, 0], easedBoard(0.08, 0.03, 0.006), Z, Y, c, mul(c, 1.12), 0);
    place(m, from, rng() * Math.PI, (rng() - 0.5) * 1.4, 0.004 + k * 0.006, (rng() - 0.5) * 0.9);
  }
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- bins

/** A litter bin's make: the galvanised dustbin with its lid, the cut oil drum, the moulded plastic bin, a wicker basket. */
export interface BinForm { kind: 'dustbin' | 'drum' | 'plastic' | 'basket'; body: Rgb; trim: Rgb }

/** The bin (0.6 m across, 0.85 m with its lid). Near ≤ 220 triangles. */
export function binNear(f: BinForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const body = tone(f.body, rng, 0.06), seg = f.kind === 'basket' ? 10 : 9;
  if (f.kind === 'dustbin') {
    lathe(m, [[0.26, 0], [0.27, 0.03], [0.285, 0.2], [0.295, 0.22], [0.285, 0.24], [0.295, 0.48], [0.305, 0.5], [0.295, 0.52], [0.31, 0.72], [0.32, 0.74]], seg,
      (k, b) => (b === 3 || b === 6 ? mul(body, 0.82) : mul(body, 0.95 + (k % 2) * 0.06)), { capBottom: true });
    lathe(m, [[0.34, 0.735], [0.34, 0.77], [0.25, 0.81], [0.08, 0.82], [0.08, 0.85], [0, 0.86]], seg, (_k, b) => (b < 4 ? f.trim : mul(f.trim, 0.8)), {});
    for (const s of [-1, 1]) {
      pole(m, [s * 0.29, 0.5, -0.07], [s * 0.34, 0.52, 0], 0.012, 3, f.trim);
      pole(m, [s * 0.34, 0.52, 0], [s * 0.29, 0.5, 0.07], 0.012, 3, f.trim);
    }
  } else if (f.kind === 'drum') {
    // an oil drum cut open at the top, its rim ragged, the bag of rubbish showing, holes punched at its foot
    lathe(m, [[0.286, 0], [0.298, 0.014], [0.293, 0.28], [0.304, 0.296], [0.293, 0.31], [0.293, 0.57], [0.304, 0.584], [0.293, 0.598], [0.293, 0.78]], 9,
      (k, b) => mul(b === 3 || b === 6 ? mul(body, 0.8) : body, 0.9 + (k % 3) * 0.06), { capBottom: true });
    lathe(m, [[0.29, 0.78], [0.25, 0.5], [0, 0.5]], 9, () => mul(f.trim, 0.3), {});
    lathe(m, [[0.25, 0.6], [0.2, 0.82], [0.1, 0.86], [0, 0.84]], 6, (k) => mul(f.trim, 0.9 + (k % 2) * 0.1), {});
  } else if (f.kind === 'plastic') {
    lathe(m, [[0.25, 0], [0.26, 0.04], [0.3, 0.7], [0.32, 0.72], [0.32, 0.76]], seg, (k) => mul(body, 0.95 + (k % 2) * 0.05), { capBottom: true });
    lathe(m, [[0.33, 0.755], [0.33, 0.79], [0.18, 0.84], [0, 0.85]], seg, () => f.trim, {});
    bar(m, [-0.12, 0.84, 0], [0.12, 0.84, 0], 0.04, 0.03, Y, mul(f.trim, 0.8));
  } else {
    // a woven basket: its staves faceted, its rim rolled, two rope handles
    lathe(m, [[0.22, 0], [0.24, 0.05], [0.3, 0.55], [0.31, 0.6], [0.29, 0.62]], seg, (k, b) => mul(body, (b === 3 ? 0.8 : 1) * (k % 2 ? 0.88 : 1.06)), { faceted: true, capBottom: true });
    lathe(m, [[0.29, 0.62], [0.24, 0.3], [0, 0.3]], seg, () => mul(body, 0.35), {});
    for (const s of [-1, 1]) pole(m, [s * 0.3, 0.5, -0.06], [s * 0.3, 0.5, 0.06], 0.015, 3, f.trim, true);
  }
  return finish(m);
}
export function binFar(f: BinForm): THREE.BufferGeometry {
  const m = newMesh();
  lathe(m, [[0.28, 0], [0.31, f.kind === 'basket' ? 0.62 : 0.78]], 6, () => f.body, { capTop: true, capColour: f.kind === 'drum' || f.kind === 'basket' ? mul(f.body, 0.4) : f.trim });
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- cones

/** A cone's make: the moulded traffic cone on its flange (its colour and its reflective bands by country), the
 *  period's striped road-closure trestle. */
export interface ConeForm { kind: 'cone' | 'trestle'; body: Rgb; band: Rgb; base: Rgb }

/** The cone (0.5 m flange, 0.75 m tall) or the trestle (0.6 m bar at 0.5 m). Near ≤ 160 triangles. */
export function coneNear(f: ConeForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  if (f.kind === 'cone') {
    // the square flange with its rounded corners, the cone with its two sleeves, the open top
    extrude(m, [0, 0, -0.24], [0, 0, 0.24], [[-0.24, 0], [0.24, 0], [0.24, 0.02], [0.2, 0.04], [-0.2, 0.04], [-0.24, 0.02]], X, Y, tone(f.base, rng, 0.08), mul(f.base, 0.9));
    lathe(m, [[0.19, 0.04], [0.17, 0.2], [0.135, 0.36], [0.115, 0.46], [0.1, 0.52], [0.07, 0.66], [0.055, 0.73], [0.04, 0.75], [0.03, 0.7]], 10,
      (_k, b) => (b === 2 || b === 4 ? f.band : f.body), {});
  } else {
    // a bar of red and white at half a metre on two splayed pairs of legs
    for (let k = 0; k < 4; k++) {
      const x0 = -0.3 + k * 0.15;
      extrude(m, [x0, 0.5, 0], [x0 + 0.15, 0.5, 0], [[-0.025, -0.04], [0.025, -0.04], [0.025, 0.04], [-0.025, 0.04]], Z, Y, k % 2 ? f.band : f.body, mul(k % 2 ? f.band : f.body, 0.9));
    }
    for (const x of [-0.26, 0.26]) for (const s of [-1, 1]) pole(m, [x, 0, s * 0.16], [x, 0.47, s * 0.02], 0.018, 4, tone(f.base, rng, 0.1));
  }
  return finish(m);
}
export function coneFar(f: ConeForm): THREE.BufferGeometry {
  const m = newMesh();
  if (f.kind === 'cone') lathe(m, [[0.2, 0], [0.19, 0.04], [0.04, 0.75]], 5, (_k, b) => (b ? f.body : f.base), {});
  else {
    extrude(m, [-0.3, 0.46, 0], [0.3, 0.46, 0], [[-0.03, 0], [0.03, 0], [0.03, 0.08], [-0.03, 0.08]], Z, Y, mix(f.body, f.band, 0.5), f.body);
    for (const x of [-0.26, 0.26]) for (const sz of [-1, 1]) pole(m, [x, 0, sz * 0.16], [x, 0.47, sz * 0.02], 0.02, 3, f.base);
  }
  return finish(m);
}


// ------------------------------------------------------------------------------------------------------- barriers

/** A barrier's make: the New Jersey profile in concrete (the Betonschutzwand), concrete blocks with a painted drum
 *  between, water-filled plastic sections, mesh gabion cells filled with sand (HESCO), blocks carrying tyres, and the
 *  period's log barricade on cross trestles. */
export interface BarrierForm { kind: 'jersey' | 'blocks' | 'water' | 'hesco' | 'tyres' | 'logs'; body: Rgb; trim: Rgb; mark?: Rgb }
const BL = 1.35;

/** The New Jersey section (x across, y up): foot, the first slope break, the steep face, the crown. */
const JERSEY: Array<[number, number]> = [[-0.3, 0], [0.3, 0], [0.3, 0.075], [0.19, 0.33], [0.075, 0.8], [-0.075, 0.8], [-0.19, 0.33], [-0.3, 0.075]];
function concreteRun(m: M, z0: number, z1: number, col: Rgb, ends: Rgb, rng: Rng): void {
  extrude(m, [0, 0, z0], [0, 0, z1], JERSEY.map(([x, y]) => [x, y] as [number, number]), [-1, 0, 0], Y, (e) => mul(col, [0.86, 1, 0.97, 1.03, 1.08, 1.03, 0.97, 1][e] * (0.96 + rng() * 0.08)), ends);
}

/** The barrier (2.7 m along z, its foot 0.6-0.72 m across, about a metre high). One form (it casts its shadow). */
export function barrierNear(f: BarrierForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const body = tone(f.body, rng, 0.06);
  switch (f.kind) {
    case 'jersey': {
      // its length in three runs over the two scuppers cut through its foot, the crown's lifting slots, the steel loops
      // of its connectors at the ends, reflectors on its faces
      concreteRun(m, -BL, -0.59, body, mul(body, 0.9), rng);
      concreteRun(m, -0.41, 0.41, body, mul(body, 0.9), rng);
      concreteRun(m, 0.59, BL, body, mul(body, 0.9), rng);
      for (const z of [-0.5, 0.5]) {
        // the scupper: a slot 12 cm high through the foot, the profile over it bridging the runs either side
        extrude(m, [0, 0.12, z - 0.09], [0, 0.12, z + 0.09], [[-0.28, 0], [0.28, 0], [0.19, 0.21], [0.075, 0.68], [-0.075, 0.68], [-0.19, 0.21]], [-1, 0, 0], Y,
          (e) => mul(body, [0.6, 1, 1.03, 1.08, 1.03, 0.97][e]), mul(body, 0.7));
      }
      for (const sz of [-1, 1]) {
        pole(m, [-0.06, 0.62, sz * (BL + 0.0)], [-0.06, 0.62, sz * (BL + 0.07)], 0.014, 4, f.trim);
        pole(m, [-0.06, 0.62, sz * (BL + 0.07)], [0.06, 0.62, sz * (BL + 0.07)], 0.014, 4, f.trim);
        pole(m, [0.06, 0.62, sz * (BL + 0.07)], [0.06, 0.62, sz * BL], 0.014, 4, f.trim);
      }
      if (f.mark) for (const sx of [-1, 1]) for (const z of [-0.9, 0.9]) bar(m, [sx * 0.105, 0.64, z - 0.06], [sx * 0.105, 0.64, z + 0.06], 0.08, 0.012, [sx, 0.3, 0], f.mark);
      break;
    }
    case 'blocks': case 'tyres': {
      // two cast blocks, chipped at their arrises; between them a painted drum (or on them, worn tyres)
      for (const z of [-0.88, 0.88]) {
        const c = tone(body, rng, 0.1);
        extrude(m, [0, 0, z - 0.42], [0, 0, z + 0.42], [[-0.34, 0], [0.34, 0], [0.34, 0.6], [0.31, 0.64], [-0.31, 0.64], [-0.34, 0.6]], [-1, 0, 0], Y, c, mul(c, 0.92));
        if (f.kind === 'tyres') {
          lathe(m, [[0.3, 0.64], [0.33, 0.68], [0.33, 0.8], [0.3, 0.84], [0.18, 0.83], [0.17, 0.66]], 8, (j) => mul(f.trim, j % 2 ? 0.85 : 1.05), { z, phase: z });
        }
      }
      if (f.kind === 'blocks') {
        lathe(m, [[0.286, 0], [0.298, 0.014], [0.293, 0.3], [0.304, 0.31], [0.293, 0.32], [0.293, 0.86], [0.272, 0.875]], 8, (_k, b) => (b === 3 ? mul(f.trim, 0.8) : f.trim), { capBottom: true });
        lathe(m, [[0.272, 0.866], [0, 0.866]], 8, () => mul(f.trim, 0.85), {});
      }
      break;
    }
    case 'water': {
      // two moulded sections, red and white, each with its rounded shoulders, its filler cap and its pin lugs
      for (const [i, z] of [-0.68, 0.68].entries()) {
        const c = i ? f.trim : body;
        extrude(m, [0, 0, z - 0.66], [0, 0, z + 0.66], [[-0.25, 0], [0.25, 0], [0.24, 0.3], [0.13, 0.78], [0.08, 0.82], [-0.08, 0.82], [-0.13, 0.78], [-0.24, 0.3]], [-1, 0, 0], Y,
          (e) => mul(c, [0.85, 1, 1.04, 1.08, 1.04, 1, 0.96, 1][e]), mul(c, 0.9));
        lathe(m, [[0.05, 0.82], [0.05, 0.85], [0, 0.86]], 6, () => mul(c, 0.7), { z: z - 0.3 });
        for (const sz of [-1, 1]) pole(m, [0, 0.55, z + sz * 0.66], [0, 0.75, z + sz * 0.66], 0.03, 4, mul(c, 0.85), true);
      }
      break;
    }
    case 'hesco': {
      // two cells: the sand-filled liner, the welded mesh at its corners and faces, the sand heaped in the top
      for (const z of [-0.68, 0.68]) {
        const sand = tone(body, rng, 0.08);
        // (the geotextile bulging between the mesh's courses under the sand's weight)
        extrude(m, [0, 0, z - 0.63], [0, 0, z + 0.63], [[-0.34, 0], [0.34, 0], [0.37, 0.18], [0.35, 0.45], [0.37, 0.7], [0.35, 0.9], [-0.35, 0.9], [-0.37, 0.7], [-0.35, 0.45], [-0.37, 0.18]],
          [-1, 0, 0], Y, (e) => mul(f.mark ?? body, 0.88 + (e % 3) * 0.06), mul(f.mark ?? body, 0.9), 0);
        lathe(m, [[0.3, 0.9], [0.2, 0.96], [0, 1.0]], 5, () => sand, { z });
        for (const sx of [-1, 1]) for (const dz of [-0.64, 0, 0.64]) pole(m, [sx * 0.36, 0, z + dz], [sx * 0.36, 0.95, z + dz], 0.008, 3, f.trim);
        for (const y of [0.3, 0.92]) for (const sx of [-1, 1]) pole(m, [sx * 0.36, y, z - 0.64], [sx * 0.36, y, z + 0.64], 0.008, 3, f.trim, true);
      }
      break;
    }
    case 'logs': {
      // three barked logs on two cross trestles: two in the crotches, one laid on them
      const crotch = 0.55;
      for (const z of [-1.08, 1.08]) for (const sx of [-1, 1]) pole(m, [sx * 0.3, 0, z], [-sx * 0.12, crotch + 0.18, z + (rng() - 0.5) * 0.04], 0.05, 5, tone(f.trim, rng, 0.12), true);
      const r = 0.12;
      for (const [x, y] of [[-0.19, crotch + r * 0.45], [0.2, crotch + r * 0.45], [0.0, crotch + r * 2.05]] as const) {
        const len = 1.31 + rng() * 0.06;
        pole(m, [x, y, -len], [x, y, len], r * (0.92 + rng() * 0.14), 7, tone(body, rng, 0.14), true);
      }
      break;
    }
  }
  return finish(m);
}
/** The barrier broken: a concrete run spalled along its profile, its rebar out; the blocks tumbled; the plastic split
 *  and flat; the cells burst into their sand; the logs rolled off the trestles. */
export function barrierBroken(f: BarrierForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const body = tone(f.body, rng, 0.06);
  if (f.kind === 'blocks' || f.kind === 'tyres') {
    // the blocks shoved apart and over, a corner of one broken off, the drum or the tyres rolled away
    for (const [i, z] of [-0.95, 1.0].entries()) {
      const from = m.mark, c = tone(body, rng, 0.1);
      extrude(m, [0, 0, -0.42], [0, 0, 0.42], [[-0.34, 0], [0.34, 0], [0.34, 0.6], [0.31, 0.64], [-0.31, 0.64], [-0.34, 0.6]], [-1, 0, 0], Y, c, mul(c, 0.92));
      if (i) tip(m, from, [0.34, 0, 0], Z, -0.35);
      place(m, from, (rng() - 0.5) * 0.9, (i - 0.5) * 0.4, 0, z);
    }
    if (f.kind === 'blocks') {
      const d = m.mark;
      lathe(m, [[0.293, 0], [0.293, 0.86]], 8, () => f.trim, { capBottom: true, capTop: true });
      tip(m, d, [0, 0, 0], X, Math.PI / 2);
      place(m, d, rng(), 0.55, 0.293, 0.2);
    } else for (const [k, z] of [-0.2, 0.5].entries()) {
      const t = m.mark;
      lathe(m, [[0.3, 0], [0.33, 0.04], [0.33, 0.16], [0.3, 0.2], [0.18, 0.19], [0.17, 0.02]], 8, (j) => mul(f.trim, j % 2 ? 0.85 : 1.05), {});
      place(m, t, k, 0.6 + k * 0.3, 0, z);
    }
    for (let k = 0; k < 3; k++) {
      const sz = 0.15 + rng() * 0.15, from = m.mark;
      extrude(m, [-sz / 2, 0, 0], [sz / 2, 0, 0], [[-sz * 0.5, 0], [sz * 0.45, 0], [sz * 0.35, sz * 0.6], [-sz * 0.4, sz * 0.7]], Z, Y, tone(body, rng, 0.12), mul(body, 0.85));
      place(m, from, rng() * Math.PI, (rng() - 0.5) * 1.0, 0, (rng() - 0.5) * 2.2);
    }
  } else if (f.kind === 'jersey') {
    // the two ends standing broken short, the middle in chunks, the rebar's ends out of the breaks
    concreteRun(m, -BL, -0.65, body, mul(body, 0.8), rng); concreteRun(m, 0.55, BL, body, mul(body, 0.8), rng);
    for (let k = 0; k < 6; k++) {
      const s = 0.18 + rng() * 0.22, from = m.mark;
      extrude(m, [-s / 2, 0, 0], [s / 2, 0, 0], [[-s * 0.5, 0], [s * 0.45, 0], [s * 0.35, s * 0.6], [-s * 0.4, s * 0.7]], Z, Y, tone(body, rng, 0.12), mul(body, 0.85));
      place(m, from, rng() * Math.PI, (rng() - 0.5) * 1.1, 0, (rng() - 0.5) * 1.3);
    }
    for (let k = 0; k < 4; k++) pole(m, [(rng() - 0.5) * 0.3, 0.1 + rng() * 0.4, -0.62], [(rng() - 0.5) * 0.5, 0.2 + rng() * 0.3, -0.62 + 0.3 + rng() * 0.3], 0.01, 3, hexLinDark);
  } else if (f.kind === 'water') {
    // one section split and flattened, the other knocked over on its side, its water out
    const flat = m.mark;
    extrude(m, [0, 0, -0.6], [0, 0, 0.6], [[-0.4, 0], [0.4, 0], [0.3, 0.16], [-0.3, 0.16]], [-1, 0, 0], Y, body, mul(body, 0.8));
    place(m, flat, (rng() - 0.5) * 0.8, (rng() - 0.5) * 0.4, 0, -0.6);
    const side = m.mark;
    extrude(m, [0, 0, -0.66], [0, 0, 0.66], [[-0.25, 0], [0.25, 0], [0.24, 0.3], [0.13, 0.78], [0.08, 0.82], [-0.08, 0.82], [-0.13, 0.78], [-0.24, 0.3]], [-1, 0, 0], Y, f.trim, mul(f.trim, 0.9));
    tip(m, side, [0.25, 0, 0], Z, -Math.PI / 2 + 0.05);
    place(m, side, (rng() - 0.5) * 0.6, 0.1, 0, 0.75);
  } else if (f.kind === 'hesco') {
    lathe(m, [[0.9, 0], [0.6, 0.32], [0.2, 0.46], [0, 0.48]], 7, (k) => mul(body, 0.92 + (k % 2) * 0.08), {});
    for (let k = 0; k < 6; k++) pole(m, [(rng() - 0.5) * 1.6, 0.02, (rng() - 0.5) * 2], [(rng() - 0.5) * 1.6, 0.3 + rng() * 0.5, (rng() - 0.5) * 2], 0.008, 3, f.trim);
  } else {
    for (const z of [-1.0, 1.0]) for (const sx of [-1, 1]) pole(m, [sx * 0.2, 0.05, z - 0.4], [sx * 0.35, 0.05, z + 0.3], 0.05, 5, tone(f.trim, rng, 0.12), true);
    for (let k = 0; k < 3; k++) { const x = (k - 1) * 0.55 + (rng() - 0.5) * 0.2, r = 0.12; pole(m, [x, r, -1.3], [x + (rng() - 0.5) * 0.4, r, 1.3], r, 7, tone(body, rng, 0.14), true); }
  }
  return finish(m);
}
const hexLinDark: Rgb = [0.05, 0.045, 0.04];

// ------------------------------------------------------------------------------------------------------- rug frames

/** The souk's rug frame: two posts and a bar, two rugs hung over it (their weave in bands, their fringes), the frame's
 *  stays. `rugs` their ground and band colours. One form (it casts its shadow). */
export interface RugFrameForm { wood: Rgb; rugs: ReadonlyArray<readonly [Rgb, Rgb]> }
export function rugFrameNear(f: RugFrameForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  for (const s of [-1, 1]) {
    pole(m, [s * 1.1, -0.1, 0], [s * 1.1, 2.08, 0], 0.045, 5, tone(f.wood, rng, 0.12));
    pole(m, [s * 1.1, 0, -0.45], [s * 1.1, 1.2, 0], 0.025, 4, mul(f.wood, 0.9));
  }
  pole(m, [-1.2, 2.04, 0], [1.2, 2.04, 0], 0.04, 5, tone(f.wood, rng, 0.12), true);
  const uv: [number, number] = [0.5, 0.5];
  for (const [i, s] of [-1, 1].entries()) {
    const [ground, band] = f.rugs[i % f.rugs.length], x0 = s * 0.52 - 0.46, x1 = s * 0.52 + 0.46, z = 0.045 * s;
    // over the bar (front and back drops, the back shorter), banded across its height, a fringe at its foot: one cloth,
    // its rows sharing their edges, swaying a little as it hangs
    const rows = [2.085, 1.86, 1.62, 1.1, 0.62, 0.48];
    const sway = rows.map((_, r) => (r === 0 ? 0 : (rng() - 0.5) * 0.03 + r * 0.004));
    for (let r = 0; r + 1 < rows.length; r++) {
      const c = r === 0 || r === 3 ? band : ground;
      for (const side of [1, -1]) {
        if (side < 0 && r > 2) continue;
        const za = r === 0 ? z * 0.2 : z + side * 0.045 + side * sway[r], zb = z + side * 0.045 + side * sway[r + 1];
        m.quad([x0, rows[r], za], [x1, rows[r], za], [x1, rows[r + 1], zb], [x0, rows[r + 1], zb], [0, 0, side], () => uv, () => mul(c, side > 0 ? 1 : 0.8), false);
      }
    }
    for (let k = 0; k < 6; k++) pole(m, [x0 + 0.08 + k * 0.152, 0.49, z + 0.045 + sway[5]], [x0 + 0.08 + k * 0.152, 0.4, z + 0.05 + sway[5]], 0.008, 3, mul(band, 0.9));
  }
  return finish(m);
}
/** The frame knocked down: a post snapped, the bar fallen, the rugs lying folded over the ground. */
export function rugFrameBroken(f: RugFrameForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  // one post standing, the bar fallen from it to the ground, a rug still over it, the other rug and the snapped post
  // lying
  pole(m, [-1.1, -0.1, 0], [-1.1, 2.08, 0], 0.045, 5, tone(f.wood, rng, 0.12));
  pole(m, [-1.1, 2.0, 0], [1.25, 0.03, 0.3], 0.04, 5, tone(f.wood, rng, 0.12), true);
  pole(m, [1.2, 0.045, -0.3], [1.0, 0.045, 1.6], 0.045, 5, tone(f.wood, rng, 0.12), true);
  const uv: [number, number] = [0.5, 0.5];
  const [g0, b0] = f.rugs[0], [g1] = f.rugs[f.rugs.length - 1];
  const at = (t: number): V3 => [-1.1 + 2.35 * t, 2.0 - 1.97 * t + 0.04, 0.3 * t];
  const a = at(0.12), b = at(0.48);
  m.quad([a[0], a[1], a[2] + 0.05], [b[0], b[1], b[2] + 0.05], [b[0] + 0.05, 0.05, b[2] + 0.12], [a[0] + 0.05, Math.max(0.05, a[1] - 1.4), a[2] + 0.12], [0, 0, 1], () => uv, () => g0, false);
  m.quad([a[0], a[1], a[2] - 0.05], [b[0], b[1], b[2] - 0.05], [b[0] + 0.05, Math.max(0.05, b[1] - 0.4), b[2] - 0.1], [a[0] + 0.05, Math.max(0.05, a[1] - 0.4), a[2] - 0.1], [0, 0, -1], () => uv, () => b0, false);
  const x = 0.4 + (rng() - 0.5) * 0.3, z = 0.9;
  m.quad([x - 0.45, 0.02, z - 0.5], [x + 0.45, 0.02, z - 0.5], [x + 0.45, 0.07, z + 0.1], [x - 0.45, 0.07, z + 0.1], Y, () => uv, () => g1, false);
  m.quad([x - 0.45, 0.07, z + 0.1], [x + 0.45, 0.07, z + 0.1], [x + 0.42, 0.02, z + 0.7], [x - 0.42, 0.02, z + 0.7], Y, () => uv, () => mul(g1, 0.9), false);
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- road signs

/** A road sign's make by national standard and period: a direction plate on a galvanised post (its colours and its
 *  pointed end by country), a warning triangle, a US route shield, a bilingual plate, and the period's fingerpost,
 *  Michelin's concrete post, the ANWB's paddenstoel, the Wehrmacht's tactical boards, a Soviet board, a PWD milestone. */
export interface SignForm {
  kind: 'direction' | 'warning' | 'shield' | 'bilingual' | 'fingerpost' | 'michelin' | 'paddenstoel' | 'tactical' | 'board' | 'milestone';
  plate: Rgb; legend: Rgb; border: Rgb; post: Rgb; pointed?: boolean;
}
/**
 * A sign plate facing +z at (cx, cy, z): its face `w` × `h` with its corners rounded off (pointed on +x when asked),
 * `t` thick, its folded rim a band of `rim` round the face's edge and down its sides, its back the rim's. One piece: the
 * face, the rim and the back share their edges (a printed border, not a plate on the plate).
 */
function plate(m: M, cx: number, cy: number, z: number, w: number, h: number, t: number, face: Rgb, rim: Rgb, pointed: boolean | 'triangle' = false, band = 0.035): void {
  const c = Math.min(w, h) * 0.08;
  const outline = (inset: number): Array<[number, number]> => {
    const W = w / 2 - inset, H = h / 2 - inset, cc = Math.max(0.005, c - inset * 0.4);
    if (pointed === 'triangle') {
      // a warning triangle on its base, its corners rounded off (inset along the bisectors)
      const Wt = w / 2 - inset * 1.7, Hb = -h / 2 + inset, Ht = h / 2 - inset * 2, k = cc * 1.4;
      return [[-Wt + k, Hb], [Wt - k, Hb], [Wt - k * 0.5, Hb + k * 0.85], [k * 0.5, Ht - k * 0.85], [-k * 0.5, Ht - k * 0.85], [-Wt + k * 0.5, Hb + k * 0.85]];
    }
    return pointed
      ? [[-W + cc, -H], [W - h * 0.35, -H], [W - inset * 0.4, 0], [W - h * 0.35, H], [-W + cc, H], [-W, H - cc], [-W, -H + cc]]
      : [[-W + cc, -H], [W - cc, -H], [W, -H + cc], [W, H - cc], [W - cc, H], [-W + cc, H], [-W, H - cc], [-W, -H + cc]];
  };
  const o = outline(0), i = outline(band), n = o.length, uv: [number, number] = [0.5, 0.5];
  const P = (q: [number, number], zz: number): V3 => [cx + q[0], cy + q[1], zz];
  for (let k = 0; k < n; k++) {
    const a = o[k], b = o[(k + 1) % n], ia = i[k], ib = i[(k + 1) % n];
    const out: V3 = [b[1] - a[1], -(b[0] - a[0]), 0];
    m.quad(P(a, z - t), P(b, z - t), P(b, z), P(a, z), out, () => uv, () => mul(rim, 0.85), false);
    m.quad(P(a, z), P(b, z), P(ib, z), P(ia, z), Z, () => uv, () => rim, false);
  }
  for (let k = 1; k + 1 < n; k++) {
    faceTri(m, P(i[0], z), P(i[k], z), P(i[k + 1], z), Z, face);
    faceTri(m, P(o[0], z - t), P(o[k], z - t), P(o[k + 1], z - t), [0, 0, -1], mul(rim, 0.7));
  }
}
/** A legend in relief on a plate's face: an arrow (a shaft and its head) and lines of lettering as raised strokes. */
function legend(m: M, cx: number, cy: number, z: number, w: number, h: number, col: Rgb, rng: Rng, arrow = true, lines = 2): void {
  if (arrow) {
    bar(m, [cx + w * 0.12, cy, z + 0.006], [cx + w * 0.36, cy, z + 0.006], h * 0.12, 0.008, Z, col, 0, false);
    extrude(m, [0, 0, z], [0, 0, z + 0.012], [[cx + w * 0.34, cy - h * 0.2], [cx + w * 0.44, cy], [cx + w * 0.34, cy + h * 0.2]], X, Y, col, col);
  }
  for (let l = 0; l < lines; l++) {
    const y = cy + h * (lines > 1 ? 0.22 - l * 0.44 : 0) * (arrow ? 1 : 0.8), x0 = cx - w * 0.4, x1 = cx + (arrow ? w * 0.05 : w * 0.38) - rng() * w * 0.12;
    bar(m, [x0, y, z + 0.006], [x1, y, z + 0.006], h * 0.13, 0.008, Z, col, 0, false);
  }
}

/** The sign (about 2.8 m tall, its post at the origin). One form (it casts its shadow). Near ≤ 260 triangles. */
export function signNear(f: SignForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const post = tone(f.post, rng, 0.06);
  switch (f.kind) {
    case 'direction': case 'bilingual': case 'warning': case 'shield': {
      // the galvanised post and its cap; the plate's back rails on two U-bolt clamps; the plate, its rim, its legend
      pole(m, [0, -0.1, 0], [0, 2.82, 0], 0.035, 6, post);
      lathe(m, [[0.04, 2.82], [0.04, 2.84], [0, 2.86]], 6, () => mul(post, 0.85), {});
      const W = f.kind === 'warning' ? 0.9 : f.kind === 'shield' ? 0.62 : 1.18, H = f.kind === 'warning' ? 0.8 : f.kind === 'shield' ? 0.66 : f.kind === 'bilingual' ? 0.86 : 0.7;
      const cy = 2.72 - H / 2, z = 0.06, cx = f.kind === 'direction' || f.kind === 'bilingual' ? 0.08 : 0;
      for (const y of [cy - H * 0.28, cy + H * 0.28]) {
        bar(m, [cx - W * 0.4, y, z - 0.035], [cx + W * 0.4, y, z - 0.035], 0.04, 0.03, Z, mul(post, 0.8), 0, false);
        bar(m, [-0.05, y, -0.045], [0.05, y, -0.045], 0.03, 0.02, Z, mul(post, 0.7), 0, false);
        bar(m, [-0.05, y, -0.045], [-0.05, y, 0.03], 0.03, 0.02, X, mul(post, 0.7), 0, true);
        bar(m, [0.05, y, -0.045], [0.05, y, 0.03], 0.03, 0.02, X, mul(post, 0.7), 0, true);
      }
      if (f.kind === 'warning') {
        // a triangle on its point up, its red border printed round its white face, its symbol in relief
        plate(m, cx, cy, z, W, H, 0.02, f.plate, f.border, 'triangle', 0.09);
        bar(m, [cx, cy - H * 0.22, z + 0.012], [cx, cy + H * 0.05, z + 0.012], 0.05, 0.008, Z, f.legend, 0, false);
        bar(m, [cx - 0.025, cy - H * 0.3, z + 0.012], [cx + 0.025, cy - H * 0.3, z + 0.012], 0.05, 0.008, Z, f.legend, 0, false);
      } else if (f.kind === 'shield') {
        // the route shield: its outline, its white face, the route's number in relief
        extrude(m, [0, 0, z - 0.02], [0, 0, z], [[cx - 0.2, cy - 0.33], [cx + 0.2, cy - 0.33], [cx + 0.31, cy - 0.05], [cx + 0.31, cy + 0.25], [cx + 0.2, cy + 0.33],
          [cx - 0.2, cy + 0.33], [cx - 0.31, cy + 0.25], [cx - 0.31, cy - 0.05]], X, Y, f.border, f.border);
        extrude(m, [0, 0, z], [0, 0, z + 0.005], [[cx - 0.17, cy - 0.29], [cx + 0.17, cy - 0.29], [cx + 0.27, cy - 0.04], [cx + 0.27, cy + 0.21], [cx + 0.17, cy + 0.27],
          [cx - 0.17, cy + 0.27], [cx - 0.27, cy + 0.21], [cx - 0.27, cy - 0.04]], X, Y, f.plate, f.plate);
        legend(m, cx, cy - 0.04, z + 0.004, 0.42, 0.36, f.legend, rng, false, 1);
      } else {
        plate(m, cx, cy, z, W, H, 0.02, f.plate, f.border, f.pointed === true);
        legend(m, cx, cy, z, W, H, f.legend, rng, f.kind === 'direction', f.kind === 'bilingual' ? 2 : 2);
      }
      break;
    }
    case 'fingerpost': {
      // a squared timber post, its pyramid cap, two finger boards pointing the roads' ways, a place plate under them
      bar(m, [0, -0.1, 0], [0, 2.7, 0], 0.12, 0.12, X, post, 0.015, false);
      lathe(m, [[0.085, 2.7], [0, 2.82]], 4, () => mul(post, 0.85), { phase: Math.PI / 4 });
      const a = (rng() - 0.5) * 0.6;
      for (const [y, yaw, len] of [[2.5, a, 0.95 + rng() * 0.2], [2.24, a + Math.PI + (rng() - 0.5) * 0.9, 0.85 + rng() * 0.2]] as const) {
        const from = m.mark;
        // the finger: its enamel faces, its dark edges, its pointed end
        extrude(m, [0.06, y, 0], [0.06 + len, y, 0], [[-0.015, -0.1], [0.015, -0.1], [0.015, 0.1], [-0.015, 0.1]], Z, Y, (e) => (e % 2 ? f.plate : f.border), f.border);
        extrude(m, [0, 0, -0.015], [0, 0, 0.015], [[0.06 + len, y - 0.1], [0.06 + len + 0.12, y], [0.06 + len, y + 0.1]], X, Y, f.plate, f.plate);
        for (const sz of [-1, 1]) bar(m, [0.12, y, sz * 0.018], [0.06 + len * 0.8, y, sz * 0.018], 0.05, 0.004, [0, 0, sz], f.legend, 0, true);
        place(m, from, yaw, 0, 0, 0);
      }
      plate(m, 0, 1.86, 0.065, 0.34, 0.24, 0.01, f.plate, f.border);
      break;
    }
    case 'michelin': {
      // the Michelin post: a concrete block with its rounded head, the enamel plates on its faces
      extrude(m, [0, 0, -0.14], [0, 0, 0.14], [[-0.2, -0.05], [0.2, -0.05], [0.2, 0.95], [0.14, 1.12], [0, 1.18], [-0.14, 1.12], [-0.2, 0.95]], [-1, 0, 0], Y, post, mul(post, 0.92));
      for (const sz of [-1, 1]) {
        const from = m.mark;
        plate(m, 0, 0.82, 0.146, 0.34, 0.22, 0.008, f.plate, f.border);
        legend(m, 0, 0.82, 0.146, 0.34, 0.22, f.legend, rng, false, 2);
        if (sz < 0) place(m, from, Math.PI, 0, 0, 0);
      }
      break;
    }
    case 'paddenstoel': {
      // the ANWB mushroom: its white foot and its domed head, the place names on its blue bands
      lathe(m, [[0.13, -0.05], [0.13, 0.42], [0.42, 0.46], [0.42, 0.62], [0.34, 0.72], [0.12, 0.78], [0, 0.79]], 10, (_k, b) => (b === 2 ? f.legend : f.plate), {});
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), sn = Math.sin(a);
        bar(m, [c * 0.425 - sn * 0.1, 0.54, sn * 0.425 + c * 0.1], [c * 0.425 + sn * 0.1, 0.54, sn * 0.425 - c * 0.1], 0.04, 0.006, [c, 0, sn], f.border, 0, true);
      }
      break;
    }
    case 'tactical': {
      // a pole with the units' boards nailed to it at their heights: arrows, their emblems, a stencilled code
      pole(m, [0, -0.1, 0], [0, 2.6, 0], 0.045, 6, post, false);
      const boards = 4;
      for (let k = 0; k < boards; k++) {
        const y = 1.2 + k * 0.28, yaw = (rng() - 0.5) * 0.5 + (k % 2 ? Math.PI : 0), w = 0.36 + rng() * 0.2, from = m.mark;
        plate(m, 0.05 + w / 2, y, 0.05, w, 0.18, 0.015, k % 3 === 0 ? f.plate : mix(f.plate, f.border, 0.5), f.border, k % 2 === 0);
        bar(m, [0.12, y, 0.062], [0.12 + w * 0.5, y, 0.062], 0.04, 0.006, Z, f.legend, 0, false);
        place(m, from, yaw, 0, 0, 0);
      }
      break;
    }
    case 'board': {
      // a painted board between two posts, its lettering raised
      for (const x of [-0.5, 0.5]) bar(m, [x, -0.1, 0], [x, 2.3, 0], 0.08, 0.08, X, post, 0.01, false);
      plate(m, 0, 1.95, 0.05, 1.1, 0.52, 0.025, f.plate, f.border);
      legend(m, 0, 1.95, 0.05, 1.1, 0.52, f.legend, rng, false, 3);
      break;
    }
    case 'milestone': {
      // the PWD milestone: a squat stone, its rounded head painted, the distance cut in its face
      extrude(m, [0, 0, -0.12], [0, 0, 0.12], [[-0.22, -0.05], [0.22, -0.05], [0.22, 0.4], [-0.22, 0.4]], [-1, 0, 0], Y, post, mul(post, 0.9), 0);
      extrude(m, [0, 0, -0.12], [0, 0, 0.12], [[-0.22, 0.4], [0.22, 0.4], [0.2, 0.52], [0.12, 0.6], [0, 0.63], [-0.12, 0.6], [-0.2, 0.52]], [-1, 0, 0], Y, f.plate, mul(f.plate, 0.9));
      bar(m, [-0.1, 0.28, 0.122], [0.1, 0.28, 0.122], 0.06, 0.006, Z, f.legend, 0, false);
      bar(m, [-0.06, 0.16, 0.122], [0.06, 0.16, 0.122], 0.05, 0.006, Z, f.legend, 0, false);
      break;
    }
  }
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- lamps

/** A street lamp's make: the Victorian column and its glazed lantern (Shanghai's Bund), the German gas lantern on its
 *  cast mast, the railway yard's floodlight mast, the West German whip mast, the Yugoslav cobra-head (shot out on a
 *  besieged street). The glass carries the night mask (its lantern lights at dusk). */
export interface LampForm { kind: 'victorian' | 'gas' | 'yard' | 'whip' | 'cobra'; metal: Rgb; glass: Rgb; broken?: boolean }

/** The lamp (about 4.7 m; its mast at the origin). One form (it casts its shadow). Near ≤ 400 triangles. Returns the
 *  geometry and the vertex ranges of its glass (streetKit.ts writes the night mask over them). */
export function lampNear(f: LampForm, rng: Rng): { geometry: THREE.BufferGeometry; glass: Array<[number, number]> } {
  const m = newMesh();
  const glass: Array<[number, number]> = [];
  const metal = tone(f.metal, rng, 0.06);
  const glazed = (body: () => void) => { const a = m.mark / 3; body(); glass.push([a, m.mark / 3]); };
  switch (f.kind) {
    case 'victorian': case 'gas': {
      // the cast base with its door, the fluted column in sections with collars, the ladder bar, the lantern: its
      // glazing bars round the panes, its roof and finial
      const H = f.kind === 'victorian' ? 3.6 : 3.4;
      lathe(m, [[0.2, -0.05], [0.2, 0.5], [0.16, 0.6], [0.12, 0.75], [0.1, 1.0], [0.11, 1.05], [0.085, 1.1], [0.07, H * 0.6], [0.085, H * 0.6 + 0.04], [0.06, H * 0.6 + 0.08], [0.055, H - 0.1], [0.08, H - 0.05], [0.08, H]],
        8, (k, b) => mul(metal, b === 4 || b === 7 || b === 10 ? 1.15 : 0.95 + (k % 2) * 0.06), { faceted: f.kind === 'victorian' });
      bar(m, [-0.012, 0.18, 0.19], [-0.012, 0.42, 0.19], 0.14, 0.012, Z, mul(metal, 0.8), 0, false);
      if (f.kind === 'gas') pole(m, [-0.32, H - 0.25, 0], [0.32, H - 0.25, 0], 0.018, 4, metal, true);
      // the lantern: four panes in their bars, tapering to the roof
      const y0 = H, y1 = H + 0.55, r0 = 0.14, r1 = 0.22;
      glazed(() => lathe(m, [[r0, y0], [r1, y1]], 4, () => f.glass, { phase: Math.PI / 4 }));
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + k * Math.PI / 2, c = Math.cos(a), sn = Math.sin(a);
        pole(m, [c * r0 * 1.02, y0, sn * r0 * 1.02], [c * r1 * 1.02, y1, sn * r1 * 1.02], 0.012, 3, metal, false);
      }
      lathe(m, [[0.16, y0 - 0.02], [0.16, y0 + 0.02], [0, y0 + 0.02]], 4, () => metal, { phase: Math.PI / 4 });
      lathe(m, [[0.3, y1], [0.3, y1 + 0.03], [0.12, y1 + 0.2], [0.03, y1 + 0.25], [0.03, y1 + 0.32], [0, y1 + 0.36]], 4, () => metal, { phase: Math.PI / 4 });
      break;
    }
    case 'yard': case 'whip': case 'cobra': {
      // the tapered mast on its foot, the arm out (a whip's curve, a cobra's swan neck, the yard's crossarm of floods)
      const H = f.kind === 'yard' ? 4.9 : 4.4;
      lathe(m, [[0.11, -0.05], [0.11, 0.35], [0.075, 0.42], [0.05, H]], 7, (k) => mul(metal, 0.95 + (k % 2) * 0.06), { capTop: true });
      if (f.kind === 'yard') {
        // the crossarm and its two floods, their glass faces down toward the yard
        pole(m, [-0.5, H - 0.1, 0], [0.5, H - 0.1, 0], 0.03, 4, metal, true);
        const floods = m.mark;
        for (const x of [-0.4, 0.4]) {
          lathe(m, [[0.18, 0], [0.16, 0.16], [0.04, 0.22]], 6, () => metal, { x, z: 0.05 });
          if (!f.broken) glazed(() => lathe(m, [[0, 0.002], [0.17, 0.002]], 6, () => f.glass, { x, z: 0.05 }));
          pole(m, [x, 0.2, 0.05], [x, 0.38, 0], 0.02, 3, metal);
        }
        place(m, floods, 0, 0, H - 0.48, 0);
      } else {
        const pts: V3[] = f.kind === 'whip'
          ? [[0, H, 0], [0.05, H + 0.35, 0], [0.3, H + 0.6, 0], [0.8, H + 0.68, 0], [1.4, H + 0.62, 0]]
          : [[0, H, 0], [0.1, H + 0.3, 0], [0.4, H + 0.45, 0], [1.1, H + 0.42, 0]];
        for (let i = 0; i + 1 < pts.length; i++) pole(m, pts[i], pts[i + 1], 0.035, 5, metal, false);
        const end = pts[pts.length - 1];
        // the head: its housing over the arm's end, the bowl of glass under it (gone from a shot-out lamp)
        const head = m.mark;
        lathe(m, [[0.18, 0], [0.17, 0.06], [0.1, 0.12], [0, 0.14]], 6, () => metal, {});
        if (!f.broken) glazed(() => lathe(m, [[0, -0.05], [0.12, -0.035], [0.17, 0.001]], 6, () => f.glass, {}));
        place(m, head, 0, end[0] + 0.1, end[1] - 0.1, 0);
      }
      break;
    }
  }
  return { geometry: finish(m), glass };
}
