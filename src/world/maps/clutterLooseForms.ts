// src/world/maps/clutterLooseForms.ts — the loose yard things' geometry, form by form (props lane A, family #2,
// 2026-10-14; WORKLIST.md #2: "Jerrycans: Wehrmacht pattern with X-pressings and 3-handle cluster, US/UK copies, plastic
// on modern maps ... Churns, pots, buckets, gas bottles, laundry and loose wheels by region likewise"; "tyres as tori
// with shoulders and tread").
//
// The kinds a hull knocks about (the physics jerrycan, bucket, gas bottle, churn and loose wheel) keep the legacy body's
// extent and origin (base on y = 0); the kinds that break (the pot cluster, the red drum, the laundry line, the cable
// drum) carry their own broken form. Builders read only their arguments; every geometry is the baked material's
// (position, normal, flat uv, linear vertex colour), as clutterForms.ts.
import * as THREE from 'three';
import { hexLin, mix, mul, type Rgb, type V3 } from './craftMesh.ts';
import { bar, extrude, finish, lathe, newMesh, place, pole, tip, tone } from './clutterForms.ts';

type Rng = () => number;
const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];

// ------------------------------------------------------------------------------------------------------- jerrycans

/** A jerrycan's make: the 1937 Wehrmacht pattern (its X pressings, three handles and cam-lever spout), the US and UK
 *  copies and the NATO can after them, the moulded plastic can of the modern maps, the square kerosene tin of 1930s
 *  Shanghai, a station's sealed canister off the Earth. */
export interface CanForm { kind: 'steel' | 'plastic' | 'tin' | 'canister'; body: Rgb; trim: Rgb; label?: Rgb }

/** The body's section (x across, y up), its corners pressed round. */
function canSection(w: number, h: number, c: number): Array<[number, number]> {
  return [[-w / 2 + c, 0], [w / 2 - c, 0], [w / 2, c], [w / 2, h - c], [w / 2 - c, h], [-w / 2 + c, h], [-w / 2, h - c], [-w / 2, c]];
}

/** The jerrycan (the kind's 0.38 × 0.72 × 0.21 m body). Near ≤ 150 triangles. */
export function canNear(f: CanForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const body = tone(f.body, rng, 0.08);
  if (f.kind === 'steel') {
    const W = 0.345, H = 0.47, D = 0.165;
    extrude(m, [0, 0, -D / 2], [0, 0, D / 2], canSection(W, H, 0.03), X, Y, (e) => mul(body, e % 2 ? 0.94 : 1), mul(body, 0.9));
    // the X pressings standing proud on both broad faces, and the weld bead round its seam
    for (const sz of [-1, 1]) for (const s of [-1, 1]) {
      bar(m, [-s * W * 0.36, H * 0.12, sz * (D / 2 + 0.004)], [s * W * 0.36, H * 0.86, sz * (D / 2 + 0.004)], 0.03, 0.008, X, mul(body, 0.86), 0, true);
    }
    bar(m, [-W / 2 - 0.004, 0.02, 0], [-W / 2 - 0.004, H - 0.02, 0], 0.012, 0.008, Z, mul(body, 0.8), 0, true);
    // the three handles over the top and the spout's cam lever beside them
    for (const x of [-0.1, 0, 0.1]) {
      bar(m, [x, H, -0.035], [x, H + 0.085, -0.035], 0.02, 0.025, X, mul(f.trim, 0.95), 0, true);
      bar(m, [x, H, 0.035], [x, H + 0.085, 0.035], 0.02, 0.025, X, mul(f.trim, 0.95), 0, true);
      bar(m, [x, H + 0.095, -0.05], [x, H + 0.095, 0.05], 0.022, 0.02, X, f.trim);
    }
    lathe(m, [[0.032, H - 0.005], [0.03, H + 0.05], [0.036, H + 0.055], [0, H + 0.065]], 6, () => tone(f.trim, rng, 0.1), { x: W / 2 - 0.06, z: 0 });
  } else if (f.kind === 'plastic') {
    const W = 0.33, H = 0.5, D = 0.2;
    extrude(m, [0, 0, -D / 2], [0, 0, D / 2], canSection(W, H, 0.055), X, Y, (e) => mul(body, e % 2 ? 0.93 : 1), mul(body, 0.88));
    // the moulded handle over its back and the stand of its spout at the front, the cap on it
    bar(m, [-W / 2 + 0.05, H, 0], [-W / 2 + 0.05, H + 0.1, 0], 0.035, 0.05, X, body, 0, true);
    bar(m, [W * 0.05, H, 0], [W * 0.05, H + 0.1, 0], 0.035, 0.05, X, body, 0, true);
    bar(m, [-W / 2 + 0.03, H + 0.115, 0], [W * 0.07, H + 0.115, 0], 0.035, 0.05, Z, mul(body, 1.05));
    lathe(m, [[0.04, H - 0.01], [0.04, H + 0.06], [0.045, H + 0.06], [0.045, H + 0.085], [0, H + 0.09]], 7, (_k, b) => (b < 2 ? body : f.trim), { x: W / 2 - 0.065, z: 0 });
    for (const sz of [-1, 1]) bar(m, [-W * 0.3, H * 0.5, sz * (D / 2 + 0.004)], [W * 0.3, H * 0.5, sz * (D / 2 + 0.004)], 0.03, 0.008, X, mul(body, 0.9), 0, true);
  } else if (f.kind === 'tin') {
    const W = 0.24, H = 0.35;
    extrude(m, [0, 0, -W / 2], [0, 0, W / 2], canSection(W, H, 0.008), X, Y, (e) => mul(body, e % 2 ? 0.8 : 1), mul(body, 0.95));
    // the soldered seams at its edges, the screw spout and the wire bail
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bar(m, [sx * W / 2, 0.01, sz * W / 2], [sx * W / 2, H - 0.01, sz * W / 2], 0.014, 0.014, X, mul(f.trim, 0.9), 0, true);
    lathe(m, [[0.03, H], [0.03, H + 0.035], [0, H + 0.04]], 6, () => f.trim, { x: 0.06, z: 0.05 });
    pole(m, [-0.08, H, 0], [-0.05, H + 0.08, 0], 0.006, 3, f.trim);
    pole(m, [-0.05, H + 0.08, 0], [0.05, H + 0.08, 0], 0.006, 3, f.trim);
    pole(m, [0.05, H + 0.08, 0], [0.08, H, 0], 0.006, 3, f.trim);
  } else {
    // the sealed canister: a ribbed drum on its foot ring, its clamp lid and carrying bail
    const R = 0.15, H = 0.5;
    lathe(m, [[R * 0.9, 0], [R, 0.02], [R, H * 0.3], [R * 1.05, H * 0.32], [R, H * 0.34], [R, H * 0.66], [R * 1.05, H * 0.68], [R, H * 0.7], [R, H - 0.02], [R * 0.86, H]],
      9, (_k, b) => (b === 3 || b === 6 || b === 0 ? f.trim : f.label && b === 4 ? f.label : body), { capBottom: true });
    lathe(m, [[R * 0.86, H], [R * 0.86, H + 0.03], [0, H + 0.035]], 9, () => f.trim, {});
    pole(m, [-R * 0.8, H + 0.03, 0], [-R * 0.5, H + 0.12, 0], 0.01, 4, f.trim);
    pole(m, [-R * 0.5, H + 0.12, 0], [R * 0.5, H + 0.12, 0], 0.012, 4, f.trim);
    pole(m, [R * 0.5, H + 0.12, 0], [R * 0.8, H + 0.03, 0], 0.01, 4, f.trim);
  }
  return finish(m);
}

export function canFar(f: CanForm): THREE.BufferGeometry {
  const m = newMesh();
  if (f.kind === 'canister') lathe(m, [[0.15, 0], [0.15, 0.53]], 6, () => f.body, { capTop: true, capColour: f.trim });
  else {
    const W = f.kind === 'tin' ? 0.24 : 0.345, H = f.kind === 'tin' ? 0.38 : 0.53, D = f.kind === 'tin' ? 0.24 : 0.17;
    extrude(m, [0, 0, -D / 2], [0, 0, D / 2], [[-W / 2, 0], [W / 2, 0], [W / 2, H], [-W / 2, H]], X, Y, f.body, mul(f.body, 0.9), 0);
  }
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- buckets

/** A bucket's make: the galvanised pail, an enamelled one (its white body and blue rim), the coopered pail and the
 *  Japanese oke, the black rubber bucket cut from a tyre, the moulded plastic bucket. */
export interface BucketForm { kind: 'galv' | 'enamel' | 'wood' | 'rubber' | 'plastic'; body: Rgb; trim: Rgb; inside: Rgb }

/** The bucket (0.46 m across its rim, 0.37 m tall, its bail over it). Near ≤ 220 triangles. */
export function bucketNear(f: BucketForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const wood = f.kind === 'wood', seg = wood ? 10 : 9;
  const R0 = wood ? 0.19 : 0.165, R1 = wood ? 0.215 : 0.225, H = f.kind === 'rubber' ? 0.32 : 0.36;
  const rAt = (y: number) => R0 + (R1 - R0) * y / H;
  const prof: Array<[number, number]> = wood
    ? [[R0, 0], [rAt(0.05) + 0.008, 0.05], [rAt(0.09) + 0.008, 0.09], [rAt(0.09), 0.09], [rAt(H - 0.1), H - 0.1], [rAt(H - 0.1) + 0.008, H - 0.1], [rAt(H - 0.06) + 0.008, H - 0.06], [rAt(H - 0.06), H - 0.06], [R1, H], [R1 - 0.018, H]]
    : f.kind === 'rubber'
      ? [[R0, 0], [R0 + 0.012, 0.03], [rAt(0.12), 0.12], [rAt(0.12) + 0.01, 0.14], [rAt(0.16), 0.16], [R1, H - 0.02], [R1 + 0.012, H], [R1 - 0.012, H]]
      : [[R0 - 0.01, 0], [R0 + 0.005, 0.018], [rAt(0.1), 0.1], [rAt(0.11) + 0.008, 0.115], [rAt(0.13), 0.13], [rAt(H - 0.02), H - 0.02], [R1 + 0.01, H - 0.005], [R1 - 0.008, H]];
  const staves = Array.from({ length: seg }, () => tone(f.body, rng, wood ? 0.22 : 0.06));
  const hoopBand = (b: number) => (wood ? b === 1 || b === 5 : f.kind === 'enamel' ? b >= prof.length - 3 : b === 0 || b >= prof.length - 2);
  lathe(m, prof, seg, (k, b) => (hoopBand(b) ? f.trim : staves[k]), { faceted: wood, capBottom: true, phase: rng() * 0.5 });
  // its inside: the wall down to the floor, dark
  const [rr, ry] = prof[prof.length - 1];
  lathe(m, [[rr, ry], [R0 - 0.012, 0.03], [0, 0.03]], seg, (_k, b) => mul(f.inside, b ? 0.7 : 1), {});
  // the bail on its ears (a rope on the coopered pail and the rubber bucket)
  const ear = H - (wood ? 0.02 : 0.035), er = rAt(ear) + 0.012;
  const handle = f.kind === 'rubber' || wood ? mix(f.trim, f.body, 0.3) : f.trim;
  for (const s of [-1, 1]) if (!wood) bar(m, [s * (er - 0.006), ear - 0.03, 0], [s * (er - 0.006), ear + 0.02, 0], 0.035, 0.012, Z, f.trim, 0, true);
  const arc: V3[] = [[-er, ear, 0], [-er * 0.85, ear + 0.12, 0.05], [0, ear + 0.2, 0.08], [er * 0.85, ear + 0.12, 0.05], [er, ear, 0]];
  const lay = rng() < 0.5 ? 1 : -1;
  for (let i = 0; i + 1 < arc.length; i++) {
    const a = arc[i], b = arc[i + 1];
    pole(m, [a[0], a[1], a[2] * lay], [b[0], b[1], b[2] * lay], f.kind === 'galv' || f.kind === 'enamel' ? 0.006 : 0.011, 3, handle);
  }
  return finish(m);
}

export function bucketFar(f: BucketForm): THREE.BufferGeometry {
  const m = newMesh();
  lathe(m, [[0.17, 0], [0.22, 0.36]], 6, () => f.body, { capTop: true, capColour: f.inside });
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- gas bottles

/** A gas bottle's make: the domestic propane or butane bottle with its shroud (the country's colour), the tall
 *  industrial cylinder of oxygen or acetylene with its cap (the war's and the works'). */
export interface BottleForm { kind: 'domestic' | 'industrial'; body: Rgb; collar: Rgb; band?: Rgb }

/** The gas bottle (0.36 m across, about 1 m tall with its valve). Near ≤ 170 triangles. */
export function bottleNear(f: BottleForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const seg = 9, body = tone(f.body, rng, 0.08);
  if (f.kind === 'domestic') {
    const R = 0.165;
    const prof: Array<[number, number]> = [[R + 0.01, 0], [R + 0.012, 0.06], [R - 0.01, 0.07], [R, 0.1], [R, 0.56], [R * 0.86, 0.68], [R * 0.5, 0.75], [0.06, 0.77]];
    lathe(m, prof, seg, (_k, b) => (b < 2 ? mul(f.collar, 0.8) : f.band && b === 4 ? mix(body, f.band, 0.0) : body), { capBottom: true });
    // the shroud round the valve: a ring with its two hand holes, and the valve in it
    lathe(m, [[0.11, 0.73], [0.115, 0.9], [0.1, 0.9], [0.095, 0.74]], seg, (k, b) => (b === 0 && (k === 2 || k === 6) ? mul(f.collar, 0.35) : f.collar), {});
    lathe(m, [[0.03, 0.76], [0.03, 0.86], [0.04, 0.86], [0.04, 0.88], [0, 0.89]], 5, () => hexLin(0xb0a070), {});
    if (f.band) lathe(m, [[R + 0.002, 0.3], [R + 0.002, 0.4]], seg, () => f.band!, {});
  } else {
    const R = 0.115;
    const prof: Array<[number, number]> = [[R + 0.01, 0], [R + 0.012, 0.05], [R, 0.06], [R, 0.78], [R * 0.8, 0.85], [R * 0.45, 0.89], [0.04, 0.9]];
    lathe(m, prof, seg, (_k, b) => (b < 1 ? mul(f.collar, 0.7) : b >= 4 && f.band ? f.band : body), { capBottom: true });
    // the screwed cap over the valve
    lathe(m, [[0.06, 0.88], [0.065, 0.96], [0.05, 0.99], [0, 1.0]], 7, () => f.collar, {});
  }
  return finish(m);
}

export function bottleFar(f: BottleForm): THREE.BufferGeometry {
  const m = newMesh();
  const R = f.kind === 'domestic' ? 0.17 : 0.12;
  lathe(m, [[R, 0], [R, f.kind === 'domestic' ? 0.6 : 0.8], [0.06, f.kind === 'domestic' ? 0.9 : 1.0]], 6, (_k, b) => (b ? f.collar : f.body), { capTop: true });
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- churns

/** A churn's make: the European milk churn (galvanised, its mushroom lid), the Russian aluminium bidon (its clamp lid),
 *  the American milk can, a station's water can. */
export interface ChurnForm { kind: 'churn' | 'bidon' | 'can'; body: Rgb; trim: Rgb }

/** The churn (0.48 m across its belly, 0.8 m tall). Near ≤ 200 triangles. */
export function churnNear(f: ChurnForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const seg = 8, body = tone(f.body, rng, 0.06);
  const prof: Array<[number, number]> = f.kind === 'bidon'
    ? [[0.2, 0], [0.215, 0.02], [0.215, 0.24], [0.222, 0.26], [0.215, 0.28], [0.215, 0.5], [0.15, 0.62], [0.12, 0.66], [0.12, 0.7]]
    : f.kind === 'can'
      ? [[0.19, 0], [0.2, 0.02], [0.2, 0.42], [0.21, 0.44], [0.2, 0.46], [0.19, 0.5], [0.12, 0.6], [0.11, 0.68], [0.125, 0.7]]
      : [[0.22, 0], [0.24, 0.03], [0.225, 0.1], [0.235, 0.12], [0.225, 0.14], [0.205, 0.5], [0.15, 0.6], [0.15, 0.68], [0.165, 0.7]];
  lathe(m, prof, seg, (k, b) => mul(prof[b][0] > prof[Math.max(0, b - 1)][0] + 0.005 || b === 0 ? f.trim : body, 0.95 + (k % 2) * 0.05), { capBottom: true, phase: rng() });
  const [tr, ty] = prof[prof.length - 1];
  // the lid in the neck, its knob or clamp
  if (f.kind === 'bidon') {
    lathe(m, [[tr + 0.01, ty], [tr + 0.01, ty + 0.03], [tr * 0.7, ty + 0.05], [0, ty + 0.055]], seg, () => f.trim, {});
    bar(m, [-tr - 0.02, ty + 0.02, 0], [tr + 0.02, ty + 0.06, 0], 0.03, 0.015, Z, mul(f.trim, 0.85));
  } else {
    lathe(m, [[tr + 0.02, ty], [tr * 0.8, ty + 0.06], [0.04, ty + 0.08], [0, ty + 0.12]], seg, (_k, b) => (b < 1 ? f.trim : mul(f.trim, 0.9)), {});
  }
  // its two handles on the shoulder
  const hy = f.kind === 'churn' ? 0.56 : f.kind === 'can' ? 0.55 : 0.55, hr = f.kind === 'churn' ? 0.18 : 0.17;
  for (const s of [-1, 1]) {
    pole(m, [s * hr, hy - 0.04, -0.06], [s * (hr + 0.06), hy + 0.02, -0.05], 0.01, 3, f.trim);
    pole(m, [s * (hr + 0.06), hy + 0.02, -0.05], [s * (hr + 0.06), hy + 0.02, 0.05], 0.012, 4, f.trim);
    pole(m, [s * (hr + 0.06), hy + 0.02, 0.05], [s * hr, hy - 0.04, 0.06], 0.01, 3, f.trim);
  }
  return finish(m);
}

export function churnFar(f: ChurnForm): THREE.BufferGeometry {
  const m = newMesh();
  lathe(m, [[0.22, 0], [0.21, 0.5], [0.13, 0.66], [0.13, 0.78]], 6, (_k, b) => (b ? mul(f.body, 0.92) : f.body), { capTop: true, capColour: f.trim });
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- loose wheels

/** A loose wheel's make: a lorry's or a car's tyre on its pressed steel wheel, a cart's wooden spoked wheel with its iron
 *  tyre, the Lunar Roving Vehicle's wire-mesh wheel and its chevrons. */
export interface WheelForm { kind: 'tyre' | 'cart' | 'mesh'; rubber: Rgb; rim: Rgb; hub: Rgb }

/** The wheel standing on its tread (0.69 m across, its axis along z). Built about the y axis, then stood up. Near ≤ 200. */
export function wheelNear(f: WheelForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const R = 0.345;
  if (f.kind === 'tyre') {
    // the tyre's section revolved (its tread between the shoulders, the sidewalls, the beads), the pressed steel wheel
    // dished in it with its hub, the back of the disc
    const w = 0.095, seg = 10;
    const sec: Array<[number, number]> = [[R, -0.6 * w], [R, 0.6 * w], [R - 0.06, w], [R - 0.1, 0.85 * w], [R - 0.1, -0.85 * w], [R - 0.06, -w], [R, -0.6 * w]];
    lathe(m, sec, seg, (k, b) => mul(f.rubber, b === 0 ? (k % 2 ? 0.82 : 1.04) : 0.95), { phase: rng() });
    lathe(m, [[R - 0.1, 0.6 * w], [0.08, 0.2 * w], [0.06, 0.5 * w], [0, 0.55 * w]], seg, (_k, b) => (b ? f.hub : f.rim), {});
    lathe(m, [[R - 0.1, -0.6 * w], [0, -0.4 * w]], seg, () => mul(f.rim, 0.8), {});
  } else if (f.kind === 'cart') {
    // the iron tyre on the felloes, ten spokes, the hub with its axle hole
    lathe(m, [[R, -0.035], [R, 0.035], [R - 0.06, 0.035], [R - 0.06, -0.035], [R, -0.035]], 12, (_k, b) => (b === 0 ? f.rim : tone(f.rubber, rng, 0.15)), {});
    lathe(m, [[0.075, -0.09], [0.085, -0.03], [0.085, 0.03], [0.075, 0.09], [0.02, 0.09]], 8, () => f.hub, { capBottom: true });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      bar(m, [c * 0.08, 0, s * 0.08], [c * (R - 0.055), 0, s * (R - 0.055)], 0.03, 0.035, Y, tone(f.rubber, rng, 0.15), 0, true);
    }
  } else {
    // the woven mesh tyre, the chevrons riveted over its tread, the open disc and its hub
    lathe(m, [[R, -0.11], [R, 0.11], [R - 0.012, 0.11], [R - 0.012, -0.11], [R, -0.11]], 14, (k, b) => (b === 0 ? mul(f.rubber, k % 2 ? 0.8 : 1) : mul(f.rubber, 0.5)), {});
    for (let k = 0; k < 14; k++) {
      const a = ((k + 0.5) / 14) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      bar(m, [c * (R + 0.004), -0.1, s * (R + 0.004)], [c * (R + 0.004), 0.1, s * (R + 0.004)], 0.028, 0.006, [-s, 0, c], f.rim, 0, true);
    }
    lathe(m, [[R - 0.012, 0.0], [0.08, 0.02], [0.06, 0.06], [0, 0.065]], 10, (_k, b) => (b ? f.hub : mul(f.rim, 0.9)), {});
  }
  // stood up on its tread: the axis from y to z, the whole lifted to its centre's height
  tip(m, 0, [0, 0, 0], X, Math.PI / 2);
  place(m, 0, 0, 0, R, 0);
  return finish(m);
}

export function wheelFar(f: WheelForm): THREE.BufferGeometry {
  const m = newMesh();
  lathe(m, [[0.345, -0.09], [0.345, 0.09]], 8, () => f.rubber, { capBottom: true, capTop: true, capColour: mix(f.rubber, f.rim, 0.5) });
  tip(m, 0, [0, 0, 0], X, Math.PI / 2);
  place(m, 0, 0, 0, 0.345, 0);
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- pots

/** A pot cluster's make: the Saharan zir and its water jars, the Levantine and Dalmatian storage jars, the Navajo
 *  olla, the Bengal matka and kolshi. Each body turned; the mouths open dark. */
export interface PotForm { kind: 'zir' | 'amphora' | 'olla' | 'matka'; body: Rgb; slip: Rgb }

function potProfile(kind: PotForm['kind'], r: number): Array<[number, number]> {
  switch (kind) {
    case 'zir': return [[r * 0.35, 0], [r * 0.8, r * 0.5], [r, r * 1.15], [r * 0.85, r * 1.7], [r * 0.5, r * 2.05], [r * 0.56, r * 2.2], [r * 0.48, r * 2.18]];
    case 'amphora': return [[r * 0.3, 0], [r * 0.75, r * 0.4], [r, r * 1.25], [r * 0.7, r * 1.9], [r * 0.38, r * 2.1], [r * 0.42, r * 2.3], [r * 0.34, r * 2.28]];
    case 'olla': return [[r * 0.45, 0], [r * 0.9, r * 0.45], [r, r * 0.85], [r * 0.8, r * 1.3], [r * 0.5, r * 1.5], [r * 0.55, r * 1.62], [r * 0.47, r * 1.6]];
    case 'matka': return [[r * 0.4, 0], [r * 0.85, r * 0.3], [r, r * 0.75], [r * 0.85, r * 1.2], [r * 0.45, r * 1.42], [r * 0.5, r * 1.55], [r * 0.42, r * 1.53]];
  }
}
/** Two big pots and a small one (the legacy cluster's seats), each its own tone, the slip band at the shoulder. Near ≤ 220. */
export function potNear(f: PotForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const spots: Array<[number, number, number]> = [[0, 0, 0.3], [0.42, 0.12, 0.24], [-0.3, 0.28, 0.18]];
  for (const [i, [x, z, r]] of spots.entries()) {
    const prof = potProfile(f.kind, r), seg = i === 2 ? 6 : 7, body = tone(f.body, rng, 0.16);
    lathe(m, prof, seg, (k, b) => mul(b === 2 || b === 3 ? mix(body, f.slip, 0.35) : body, 0.94 + (k % 3) * 0.04), { x, z, capBottom: true, phase: rng() });
    const [tr, ty] = prof[prof.length - 1];
    lathe(m, [[tr, ty], [0, ty - r * 0.25]], seg, () => mul(body, 0.16), { x, z });
  }
  return finish(m);
}
export function potFar(f: PotForm): THREE.BufferGeometry {
  const m = newMesh();
  for (const [x, z, r] of [[0, 0, 0.3], [0.42, 0.12, 0.24]] as const) {
    lathe(m, [[r * 0.6, 0], [r, r * 0.9], [r * 0.5, r * 1.9]], 5, () => f.body, { x, z, capTop: true, capColour: mul(f.body, 0.3) });
  }
  return finish(m);
}
/** The cluster broken: the big pot's foot standing jagged, the sherds of the others round it, the small one rolled over. */
export function potBroken(f: PotForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const prof = potProfile(f.kind, 0.3), cut = 0.3 * (0.5 + rng() * 0.3);
  const foot = prof.filter(([, y]) => y < cut);
  foot.push([0.3 * 0.85, cut]);
  lathe(m, foot, 9, (k) => mul(f.body, 0.86 + (k % 3) * 0.06), { capBottom: true, faceted: true });
  lathe(m, [[0.3 * 0.82, cut], [0, cut - 0.05]], 9, () => mul(f.body, 0.2), {});
  for (let k = 0; k < 9; k++) {
    const a = rng() * Math.PI * 2, d = 0.35 + rng() * 0.45, s = 0.07 + rng() * 0.1;
    const from = m.mark;
    lathe(m, [[s, 0], [s * 1.1, 0.025], [s * 0.85, 0.05]], 3, () => tone(f.body, rng, 0.2), { faceted: true });
    tip(m, from, [0, 0, 0], [Math.cos(a), 0, Math.sin(a)], 0.5 + rng());
    place(m, from, rng() * 3, Math.cos(a) * d, 0.035, Math.sin(a) * d);
  }
  const small = m.mark, sp = potProfile(f.kind, 0.18);
  lathe(m, sp, 7, () => tone(f.body, rng, 0.16), { capBottom: true });
  tip(m, small, [0, 0, 0], Z, Math.PI / 2 - 0.15);
  place(m, small, rng() * 3, -0.45, 0.17, 0.25);
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- red drums

/** The red drum torn open by its own fire: the shell split and peeled back from the burst, the head blown off and lying
 *  dished, the foot standing charred. */
export function redDrumBroken(shell: Rgb, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const R = 0.293, char = hexLin(0x1c1a18);
  // the foot ring standing, charred
  lathe(m, [[0.286, 0], [0.298, 0.014], [R, 0.2], [R * 0.96, 0.22]], 9, (k) => mix(shell, char, 0.6 + (k % 3) * 0.12), { capBottom: true });
  // the shell's petals peeled out from the burst: each a curved plate (both its faces), bent out about its foot
  const uv: [number, number] = [0.5, 0.5];
  for (let k = 0; k < 5; k++) {
    const a0 = (k / 5) * Math.PI * 2 + rng() * 0.3, a1 = a0 + (Math.PI * 2 / 5) * (0.7 + rng() * 0.2), top = 0.5 + rng() * 0.2;
    const col = mix(shell, char, 0.2 + rng() * 0.45), from = m.mark;
    for (let i = 0; i < 3; i++) {
      const b0 = a0 + (a1 - a0) * i / 3, b1 = a0 + (a1 - a0) * (i + 1) / 3, bm = (b0 + b1) / 2;
      const at = (b: number, y: number): V3 => [Math.cos(b) * R, y, Math.sin(b) * R];
      const out: V3 = [Math.cos(bm), 0, Math.sin(bm)];
      m.quad(at(b0, 0.2), at(b1, 0.2), at(b1, top), at(b0, top), out, () => uv, () => col, false);
      const inn = (b: number, y: number): V3 => [Math.cos(b) * (R - 0.003), y, Math.sin(b) * (R - 0.003)];
      m.quad(inn(b0, 0.2), inn(b1, 0.2), inn(b1, top), inn(b0, top), [-out[0], 0, -out[2]], () => uv, () => mul(col, 0.55), false);
    }
    const am = (a0 + a1) / 2;
    tip(m, from, [Math.cos(am) * R, 0.2, Math.sin(am) * R], [-Math.sin(am), 0, Math.cos(am)], 1.0 + rng() * 0.5);
  }
  // the head blown off, lying a step away
  const head = m.mark;
  lathe(m, [[0.29, 0], [0.3, 0.02], [0.27, 0.03], [0, 0.05]], 9, () => mix(shell, char, 0.3), { capBottom: true });
  place(m, head, rng() * 3, 0.75, 0, -0.3);
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- laundry

/** A laundry line's linen and its colours by place: sheets, shirts, a towel, a sari; its posts and the line. */
export interface LaundryForm { post: Rgb; cloths: readonly Rgb[]; long?: boolean }

/** A cloth hung over the line at x: `w` wide, `h` long, pinned at both corners, sagging between them, its hem swung. */
function cloth(m: ReturnType<typeof newMesh>, x: number, y: number, z0: number, w: number, h: number, col: Rgb, swing: number): void {
  const uv: [number, number] = [0.5, 0.5];
  const cols = 3, rows = 2;
  const P = (i: number, j: number): V3 => {
    const u = i / cols, v = j / rows, sag = Math.sin(u * Math.PI) * 0.035;
    return [x - w / 2 + u * w, y - sag * (j ? 1 : 0) - v * h, z0 + Math.sin(u * Math.PI * 2 + swing) * 0.03 * v + swing * 0.05 * v];
  };
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const k = 0.92 + ((i + j) % 2) * 0.08;
    for (const sz of [1, -1]) {
      const o = (q: V3): V3 => [q[0], q[1], q[2] - (sz < 0 ? 0.004 : 0)];
      m.quad(o(P(i, j)), o(P(i + 1, j)), o(P(i + 1, j + 1)), o(P(i, j + 1)), [0, 0, sz], () => uv, () => mul(col, sz > 0 ? k : k * 0.85), false);
    }
  }
}
/** The laundry line: two posts with their cross-arms, the line between them, the cloths on it. Near ≤ 200 (it casts its
 *  own shadow: one form at every distance). */
export function laundryNear(f: LaundryForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  for (const s of [-1, 1]) {
    pole(m, [s * 1.7, -0.1, 0], [s * 1.7, 1.86, 0], 0.04, 5, tone(f.post, rng, 0.15));
    bar(m, [s * 1.7, 1.8, -0.18], [s * 1.7, 1.8, 0.18], 0.05, 0.05, X, tone(f.post, rng, 0.15));
  }
  for (const z of [-0.15, 0.15]) pole(m, [-1.7, 1.83, z], [1.7, 1.83, z], 0.006, 3, hexLin(0x8a8478));
  const n = f.cloths.length;
  for (let k = 0; k < n; k++) {
    const w = f.long && k === 1 ? 1.1 : 0.55 + rng() * 0.3, h = f.long && k === 1 ? 1.3 : 0.55 + rng() * 0.45;
    const x = -1.25 + (k + 0.5) * 2.5 / n, z = k % 2 ? -0.15 : 0.15;
    cloth(m, x, 1.83, z, w, h, f.cloths[k], (rng() - 0.5) * 2);
    for (const e of [-1, 1]) bar(m, [x + e * w * 0.45, 1.8, z - 0.012], [x + e * w * 0.45, 1.86, z - 0.012], 0.012, 0.012, X, hexLin(0xc8b89a), 0, true);
  }
  return finish(m);
}
/** The line brought down: one post snapped and lying, the line slack along the ground, the cloths fallen on it. */
export function laundryBroken(f: LaundryForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  pole(m, [-1.7, -0.1, 0], [-1.7, 1.86, 0], 0.04, 5, tone(f.post, rng, 0.15));
  pole(m, [1.7, 0.04, 0.1], [0.05, 0.04, 0.6], 0.04, 5, tone(f.post, rng, 0.15), true);
  pole(m, [-1.7, 1.83, 0], [-0.4, 0.02, 0.3], 0.006, 3, hexLin(0x8a8478));
  pole(m, [-0.4, 0.02, 0.3], [1.6, 0.02, 0.2], 0.006, 3, hexLin(0x8a8478));
  const uv: [number, number] = [0.5, 0.5];
  for (const [k, col] of f.cloths.entries()) {
    const x = -0.9 + k * 0.8 + (rng() - 0.5) * 0.3, z = 0.25 + (rng() - 0.5) * 0.5, w = 0.7, d = 0.5, a = rng() * Math.PI;
    const c = Math.cos(a), s = Math.sin(a);
    const P = (u: number, v: number, y: number): V3 => [x + c * u - s * v, y, z + s * u + c * v];
    m.quad(P(-w / 2, -d / 2, 0.01), P(w / 2, -d / 2, 0.01), P(w / 2, 0, 0.06), P(-w / 2, 0, 0.06), Y, () => uv, () => col, false);
    m.quad(P(-w / 2, 0, 0.06), P(w / 2, 0, 0.06), P(w / 2, d / 2, 0.01), P(-w / 2, d / 2, 0.01), Y, () => uv, () => mul(col, 0.9), false);
  }
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- cable drums

/** A cable drum's make: its timber, the cable wound on it (lead-sheathed before the PVC of 1955, black or a colour
 *  after), a steel drum on the newest maps. */
export interface SpoolForm { cheek: Rgb; cable: Rgb; steel?: boolean }

/** The cable drum standing on its cheeks (1.48 m across them, 1.1 m along its barrel): the cheeks' planks and their
 *  battens, the cable's turns on the barrel, the arbor hole. One form at every distance (it casts its shadow). Near ≤ 260. */
export function spoolNear(f: SpoolForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const R = 0.74, Rc = 0.5, seg = 10, cy = 0.68, half = 0.55;
  for (const sx of [-1, 1]) {
    const from = m.mark;
    // the cheek: a disc of planks (its faces and rim), the arbor hole dark at its middle
    lathe(m, [[0.09, -0.06], [R, -0.06], [R, 0.06], [0.09, 0.06]], seg, (k, b) => (b === 1 ? tone(f.cheek, rng, 0.15) : mul(f.cheek, (k % 3 === 0 ? 0.86 : 1) * (b === 0 ? 0.9 : 1))), {});
    lathe(m, [[0.09, 0.061], [0, 0.061]], 6, () => hexLin(0x141210), {});
    lathe(m, [[0, -0.061], [0.09, -0.061]], 6, () => hexLin(0x141210), {});
    // its two battens across the planks, outside
    for (const t of [-1, 1]) bar(m, [-R * 0.92, 0.075, t * 0.22], [R * 0.92, 0.075, t * 0.22], 0.08, 0.03, Z, mul(f.cheek, 0.82), 0, f.steel === true);
    tip(m, from, [0, 0, 0], Z, sx * Math.PI / 2);
    place(m, from, 0, sx * half, cy, 0);
  }
  // the cable's turns on the barrel between the cheeks: its layers, the end tied off on a cheek
  const from = m.mark;
  lathe(m, [[Rc, -half + 0.06], [Rc + 0.015, -0.12], [Rc, 0.12], [Rc + 0.015, half - 0.06]], seg,
    (k, b) => mul(f.cable, 0.9 + ((k + b) % 2) * 0.12), {});
  tip(m, from, [0, 0, 0], Z, Math.PI / 2);
  place(m, from, 0, 0, cy, 0);
  pole(m, [half - 0.06, cy + Rc, 0], [half - 0.06, cy + R - 0.05, 0.15], 0.018, 4, f.cable);
  return finish(m);
}
/** The drum broken: its cheeks off and lying, the cable's coil slumped where it stood, planks of the cheeks round it. */
export function spoolBroken(f: SpoolForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  // one cheek lying flat, the other leaning on the coil
  for (let k = 0; k < 2; k++) {
    const from = m.mark;
    lathe(m, [[0.09, 0], [0.7, 0], [0.7, 0.1], [0.09, 0.1]], 10, (s, b) => (b === 1 ? f.cheek : mul(f.cheek, s % 3 === 0 ? 0.85 : 1)), {});
    if (k) {
      tip(m, from, [0.7, 0, 0], Z, -(1.05 + rng() * 0.15));
      place(m, from, 0, -1.25, 0, (rng() - 0.5) * 0.3);
    } else place(m, from, rng() * 3, 0.85 + rng() * 0.2, 0.0, (rng() - 0.5) * 0.6);
  }
  lathe(m, [[0.6, 0], [0.62, 0.12], [0.5, 0.22], [0.35, 0.18], [0.3, 0.05]], 10, (s) => mul(f.cable, 0.9 + (s % 2) * 0.1), { capTop: true });
  for (let k = 0; k < 4; k++) {
    const a = rng() * Math.PI * 2, d = 0.9 + rng() * 0.4, yaw = rng() * Math.PI, len = 0.5 + rng() * 0.5;
    bar(m, [Math.cos(a) * d - Math.cos(yaw) * len / 2, 0.015, Math.sin(a) * d - Math.sin(yaw) * len / 2],
      [Math.cos(a) * d + Math.cos(yaw) * len / 2, 0.015, Math.sin(a) * d + Math.sin(yaw) * len / 2], 0.14, 0.03, Y, tone(f.cheek, rng, 0.15));
  }
  return finish(m);
}
