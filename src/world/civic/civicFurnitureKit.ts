// src/world/civic/civicFurnitureKit.ts — the civic kit's street furniture (the maps lane, 228): what a town square of its
// place and period stands about it, member by member at the props r2 bar (tools/r2-standard.mjs), each a props
// destructible with its record and its broken state. The 1980s West German square's:
//   kiosk         the Trinkhalle: cream enamel panels on green corner posts, its serving hatch a real opening over its
//                 counter, its awning, the sign band under the flat roof's overhang, the door at its back;
//   litfass       the Litfaßsäule: the drum on its moulded foot, its posters pasted round it proud of the drum (some torn
//                 at their foot), the cornice and the dome with its finial;
//   telzelle      the Bundespost's TelH78: yellow posts and frame, glazed on three sides and the door, the kick panels,
//                 the roof and its sign band, the telephone on its back wall;
//   poller        a cast-iron bollard: flange, shaft, collar, dome;
//   pflanzkuebel  a hexagonal concrete planter, its rim, its soil and a clipped shrub.
// Regional forms join the kit with their maps (a K67 kiosk for Sarajevo); a kind's form is chosen by the map's place.
// Pure geometry on the baked material (base on y = 0, local +z the front), no draws from any placement stream.
import * as THREE from 'three';
import { bar, extrude, faceTri, finish, lathe, newMesh, pole, tone } from '../maps/clutterForms.ts';
import { hexLin, mul, mix, type Rgb, type V3 } from '../maps/craftMesh.ts';
import type { DestructiblePropType } from '../maps/inhabitKit.ts';

type Rng = () => number;
type M = ReturnType<typeof newMesh>;
const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];
const L = (hex: number): Rgb => hexLin(hex);

const ENAMEL = L(0xe6dcc0), TRIM = L(0x2f5a3c), ROOF = L(0x5a5e5c), GLASS = L(0x9fb4bc), YELLOW = L(0xe2a900), ALU = L(0xb8bcbc);
const IRON = L(0x2f3a30), CONCRETE = L(0x837f77), SOIL = L(0x3a2e22), SHRUB = L(0x335a2a), SHRUB_DARK = L(0x264620);
const LITFASS = L(0x2f4a3a), CORNICE = L(0x3a4a40);
const POSTERS: readonly Rgb[] = [L(0xc8b47a), L(0xa8584a), L(0x6a7a98), L(0xd8d2c2), L(0x7a8a68), L(0xb8865a), L(0x8a5a6a), L(0xcac4b2)];
const PAPER = L(0xd6cfbd);

/** A box member standing from (x, y0, z) to y1 (a post, a panel), sx along x and sz along z, its arrises eased. */
function upright(m: M, x: number, z: number, y0: number, y1: number, sx: number, sz: number, col: Rgb, ch = 0.01): void {
  bar(m, [x, y0, z], [x, y1, z], sx, sz, X, col, ch);
}
/** A horizontal member along x at (y, z) from x0 to x1, its section w (z) × h (y). */
function railX(m: M, x0: number, x1: number, y: number, z: number, w: number, h: number, col: Rgb, ch = 0.008): void {
  bar(m, [x0, y, z], [x1, y, z], w, h, Z, col, ch);
}
function railZ(m: M, z0: number, z1: number, y: number, x: number, w: number, h: number, col: Rgb, ch = 0.008): void {
  bar(m, [x, y, z0], [x, y, z1], w, h, X, col, ch);
}

// ------------------------------------------------------------------------------------------------------ the kiosk

const KW = 2.6, KD = 2.0, KH = 2.7;

function kioskNear(rng: Rng): THREE.BufferGeometry {
  const m = newMesh(), hw = KW / 2, hd = KD / 2, t = 0.06;
  // the plinth, the floor
  bar(m, [-hw - 0.05, 0.075, 0], [hw + 0.05, 0.075, 0], KD + 0.1, 0.15, Z, CONCRETE, 0.02);
  // the corner posts in the trim's green
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) upright(m, sx * (hw - 0.05), sz * (hd - 0.05), 0.15, KH - 0.32, 0.1, 0.1, TRIM, 0.015);
  // the walls of enamel panels between the posts: the back and the sides whole (their panel seams proud), the front
  // round the hatch (1.5 wide, from 1.0 to 1.95 m)
  const enamel = (): Rgb => tone(ENAMEL, rng, 0.05);
  const y0 = 0.15, y1 = KH - 0.32, hatch0 = 1.0, hatch1 = 1.95, hx = 0.75;
  for (const sx of [-1, 1]) {
    bar(m, [sx * (hw - t / 2), (y0 + y1) / 2, -hd + 0.1], [sx * (hw - t / 2), (y0 + y1) / 2, hd - 0.1], t, y1 - y0, X, enamel(), 0.004);
    for (const z of [-0.33, 0.33]) upright(m, sx * (hw + 0.006), z, y0 + 0.05, y1 - 0.05, 0.02, 0.025, mul(ENAMEL, 0.92), 0.004);
  }
  // the back: the door (a leaf of the same enamel, a step proud, its handle) and the panels either side
  bar(m, [-hw + 0.1, (y0 + y1) / 2, -hd + t / 2], [hw - 0.1, (y0 + y1) / 2, -hd + t / 2], t, y1 - y0, Z, enamel(), 0.004);
  upright(m, 0.35, -hd - 0.012, y0 + 0.05, 2.05, 0.8, 0.025, mul(ENAMEL, 0.96), 0.006);
  railX(m, 0.62, 0.7, 1.05, -hd - 0.04, 0.03, 0.03, ALU);
  // the front: the panels below and beside the hatch, the lintel band over it
  const fz = hd - t / 2;
  bar(m, [-hw + 0.1, (y0 + hatch0) / 2, fz], [hw - 0.1, (y0 + hatch0) / 2, fz], t, hatch0 - y0, Z, enamel(), 0.004);
  for (const s of [-1, 1]) bar(m, [s * hx, (hatch0 + hatch1) / 2, fz], [s * (hw - 0.1), (hatch0 + hatch1) / 2, fz], t, hatch1 - hatch0, Z, enamel(), 0.004);
  bar(m, [-hw + 0.1, (hatch1 + y1) / 2, fz], [hw - 0.1, (hatch1 + y1) / 2, fz], t, y1 - hatch1, Z, enamel(), 0.004);
  // the hatch's frame in aluminium, the counter shelf out over the street, the goods on the shelves inside
  for (const s of [-1, 1]) upright(m, s * hx, hd, hatch0, hatch1, 0.04, 0.05, ALU, 0.006);
  railX(m, -hx, hx, hatch1 - 0.02, hd, 0.05, 0.04, ALU);
  bar(m, [-hx - 0.05, hatch0 - 0.02, hd - 0.05], [hx + 0.05, hatch0 - 0.02, hd - 0.05], 0.42, 0.04, Z, mul(TRIM, 1.1), 0.01);
  // the inner counter (wall to wall) and the shelf on the back wall, the papers and sweets on it
  railX(m, -hw + 0.06, hw - 0.06, 0.85, -0.2, 0.5, 0.04, mul(ENAMEL, 0.7));
  railX(m, -hw + 0.06, hw - 0.06, 1.5, -hd + 0.21, 0.3, 0.03, mul(ENAMEL, 0.7));
  for (let k = 0; k < 7; k++) {
    // the papers and the sweets on the shelf behind the hatch: little blocks of colour
    const x = -0.6 + k * 0.2, c = POSTERS[k % POSTERS.length];
    bar(m, [x, 1.515, -hd + 0.21], [x, 1.515 + 0.12 + (k % 3) * 0.04, -hd + 0.21], 0.14, 0.18, Z, mul(c, 0.85), 0.004);
  }
  bar(m, [-0.5, 0.87, -0.2], [-0.5, 1.0, -0.2], 0.4, 0.3, Z, mul(POSTERS[3], 0.8), 0.004);
  // the awning over the hatch, pitched out, its valance; its two arms back to the wall
  const aw0: V3 = [0, hatch1 + 0.12, hd], aw1: V3 = [0, hatch1 - 0.05, hd + 0.6];
  const awStart = m.mark;
  extrude(m, [-hx - 0.15, 0, 0], [hx + 0.15, 0, 0], [[0, 0], [0.6, -0.17], [0.6, -0.15], [0.02, 0.025]].map(([u, v]) => [u, v] as [number, number]),
    [0, 0, 1], Y, TRIM, mul(TRIM, 0.85));
  // (the awning laid at the origin: carried to the hatch's head)
  for (let i = awStart; i < m.mark; i += 3) { m.p[i + 1] += aw0[1]; m.p[i + 2] += aw0[2]; }
  for (const s of [-1, 1]) pole(m, [s * (hx + 0.1), hatch1 + 0.1, hd + 0.02], [s * (hx + 0.1), aw1[1] - 0.02, aw1[2] - 0.05], 0.012, 4, mul(TRIM, 0.8), true);
  // the sign band under the roof (cream on green, no lettering), the flat roof with its overhang and drip
  bar(m, [-hw - 0.04, KH - 0.17, 0], [hw + 0.04, KH - 0.17, 0], KD + 0.08, 0.3, Z, TRIM, 0.01);
  for (const s of [-1, 1]) bar(m, [-hw + 0.3, KH - 0.17, s * (hd + 0.045)], [hw - 0.3, KH - 0.17, s * (hd + 0.045)], 0.012, 0.18, Z, ENAMEL, 0.003);
  bar(m, [-hw - 0.15, KH - 0.01, 0], [hw + 0.15, KH - 0.01, 0], KD + 0.3, 0.06, Z, ROOF, 0.015);
  // the stand of papers at its side
  for (const s of [-1, 1]) pole(m, [hw + 0.25, 0, s * 0.25], [hw + 0.25, 1.1, s * 0.25], 0.012, 4, ALU, true);
  for (let k = 0; k < 3; k++) railZ(m, -0.3, 0.3, 0.45 + k * 0.28, hw + 0.25, 0.04, 0.24, mul(POSTERS[(k + 2) % POSTERS.length], 0.9), 0.004);
  return finish(m);
}

function kioskBroken(rng: Rng): THREE.BufferGeometry {
  // the box folded in: the side walls leant out, the front fallen forward over its counter, the roof dropped askew on
  // what still stands, the plinth and the back wall's lower half in place
  const m = newMesh(), hw = KW / 2, hd = KD / 2;
  bar(m, [-hw - 0.05, 0.075, 0], [hw + 0.05, 0.075, 0], KD + 0.1, 0.15, Z, CONCRETE, 0.02);
  bar(m, [-hw + 0.1, 0.65, -hd + 0.03], [hw - 0.1, 0.65, -hd + 0.03], 0.06, 1.0, Z, mul(ENAMEL, 0.9), 0.004);
  for (const sx of [-1, 1]) {
    const s0 = m.mark;
    bar(m, [sx * (hw - 0.03), 0.8, -hd + 0.1], [sx * (hw - 0.03), 0.8, hd - 0.1], 0.06, 1.3, X, mul(ENAMEL, 0.85 + rng() * 0.1), 0.004);
    m.tilt(s0, [sx * (hw - 0.03), 0.15, 0], [0, 0, 1], -sx * 0.5);
    upright(m, sx * (hw - 0.05), -hd + 0.05, 0.15, 1.6, 0.1, 0.1, TRIM, 0.015);
  }
  const f0 = m.mark;
  bar(m, [-hw + 0.1, 0.9, hd - 0.03], [hw - 0.1, 0.9, hd - 0.03], 0.06, 1.5, Z, mul(ENAMEL, 0.88), 0.004);
  m.tilt(f0, [0, 0.15, hd], [1, 0, 0], 1.2);
  const r0 = m.mark;
  bar(m, [-hw - 0.15, 1.35, 0], [hw + 0.15, 1.35, 0], KD + 0.3, 0.06, Z, ROOF, 0.015);
  bar(m, [-hw - 0.04, 1.2, 0], [hw + 0.04, 1.2, 0], KD + 0.08, 0.24, Z, TRIM, 0.01);
  m.tilt(r0, [0, 1.2, 0], [0.6, 0, 0.8], 0.28);
  for (let k = 0; k < 6; k++) {
    const x = (rng() - 0.5) * KW * 1.2, z = hd + 0.3 + rng() * 0.8;
    bar(m, [x, 0, z], [x, 0.08 + rng() * 0.06, z], 0.16 + rng() * 0.1, 0.12, Z, mul(POSTERS[k % POSTERS.length], 0.8), 0.004);
  }
  return finish(m);
}

// --------------------------------------------------------------------------------------------- the Litfaßsäule

const LF_R = 0.68, LF_H = 3.7;

function litfassNear(rng: Rng): THREE.BufferGeometry {
  const m = newMesh(), seg = 16;
  // the moulded foot, the drum, the cornice, the dome and its finial
  lathe(m, [[0.78, 0], [0.78, 0.12], [0.72, 0.18], [LF_R, 0.24]], seg, () => mul(CORNICE, 0.95), { capTop: false });
  lathe(m, [[LF_R, 0.24], [LF_R, 3.12]], seg, (k) => mul(LITFASS, 0.96 + (k % 2) * 0.05));
  lathe(m, [[LF_R, 3.12], [0.76, 3.18], [0.78, 3.3], [0.72, 3.36], [0.5, 3.52], [0.2, 3.6], [0.06, 3.62]], seg, (k, b) => mul(CORNICE, 0.9 + b * 0.03 + (k % 2) * 0.03), { capTop: true });
  pole(m, [0, 3.6, 0], [0, LF_H, 0], 0.035, 6, mul(CORNICE, 1.2));
  // the posters: curved sheets pasted round the drum a few millimetres proud, in two ranks, some torn at the foot
  const rr = LF_R + 0.006;
  const sheet = (a0: number, a1: number, y0: number, y1: number, col: Rgb, torn: boolean): void => {
    const n = Math.max(2, Math.round((a1 - a0) / 0.2));
    for (let k = 0; k < n; k++) {
      const p = a0 + ((a1 - a0) * k) / n, q = a0 + ((a1 - a0) * (k + 1)) / n, mid = (p + q) / 2;
      const yb0 = torn ? y0 + 0.08 + Math.abs(Math.sin(p * 13.1)) * 0.25 : y0, yb1 = torn ? y0 + 0.08 + Math.abs(Math.sin(q * 13.1)) * 0.25 : y0;
      const A: V3 = [Math.sin(p) * rr, yb0, Math.cos(p) * rr], B: V3 = [Math.sin(q) * rr, yb1, Math.cos(q) * rr];
      const C: V3 = [Math.sin(q) * rr, y1, Math.cos(q) * rr], D: V3 = [Math.sin(p) * rr, y1, Math.cos(p) * rr];
      const out: V3 = [Math.sin(mid), 0, Math.cos(mid)], c = mix(col, POSTERS[3], (k % 3) * 0.08);
      faceTri(m, A, B, C, out, c); faceTri(m, A, C, D, out, c);
    }
  };
  // the bills: three ranks of sheets of their own sizes, each its own paper (a pale field, its printed block a shade of
  // its colour), the old layers showing where a sheet is torn
  let a = rng() * Math.PI * 2;
  const widths = Array.from({ length: 9 }, () => 0.42 + rng() * 0.3), fit = (Math.PI * 2 - 9 * 0.04) / widths.reduce((p, q) => p + q, 0);
  for (let k = 0; k < 9; k++) {
    const w = widths[k] * fit, col = mix(POSTERS[k % POSTERS.length], PAPER, 0.25 + rng() * 0.3);
    sheet(a, a + w, 2.2, 3.0, col, false);
    sheet(a + 0.12, a + w + 0.05, 1.3, 2.15, mix(POSTERS[(k + 3) % POSTERS.length], PAPER, 0.3 + rng() * 0.3), false);
    sheet(a + 0.05, a + w - 0.02, 0.4, 1.25, mix(POSTERS[(k + 5) % POSTERS.length], PAPER, 0.35), k % 3 === 1);
    a += w + 0.04;
  }
  return finish(m);
}

// --------------------------------------------------------------------------------------------- the TelH78

const TB = 1.15, TH = 2.35;

function telzelleNear(rng: Rng): THREE.BufferGeometry {
  const m = newMesh(), h = TB / 2;
  // the corner posts and the frame in the Bundespost's yellow, the kick panels under the glazing
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) upright(m, sx * (h - 0.035), sz * (h - 0.035), 0, TH - 0.2, 0.07, 0.07, YELLOW, 0.012);
  for (const s of [-1, 1]) {
    railX(m, -h + 0.07, h - 0.07, 0.04, s * (h - 0.035), 0.05, 0.08, mul(YELLOW, 0.9));
    railZ(m, -h + 0.07, h - 0.07, 0.04, s * (h - 0.035), 0.05, 0.08, mul(YELLOW, 0.9));
    railX(m, -h + 0.07, h - 0.07, TH - 0.24, s * (h - 0.035), 0.05, 0.08, YELLOW);
    railZ(m, -h + 0.07, h - 0.07, TH - 0.24, s * (h - 0.035), 0.05, 0.08, YELLOW);
  }
  // the glazing: the back's lower panel solid (the telephone on it), its upper and the sides and the door glazed above
  // their kick panels, the glazing bars across
  for (const [side, n] of [['px', [1, 0, 0]], ['nx', [-1, 0, 0]], ['pz', [0, 0, 1]], ['nz', [0, 0, -1]]] as const) {
    const onX = side[1] === 'x', s = side[0] === 'p' ? 1 : -1, off = s * (h - 0.035);
    const kick = 0.42;
    if (onX) {
      bar(m, [off, (0.08 + kick) / 2, -h + 0.07], [off, (0.08 + kick) / 2, h - 0.07], 0.03, kick - 0.08, X, mul(YELLOW, 0.95), 0.004);
      bar(m, [off, (kick + TH - 0.28) / 2, -h + 0.07], [off, (kick + TH - 0.28) / 2, h - 0.07], 0.012, TH - 0.28 - kick, X, GLASS, 0);
      railZ(m, -h + 0.07, h - 0.07, 1.35, off + s * 0.01, 0.03, 0.035, YELLOW);
    } else {
      const solid = side === 'nz';
      bar(m, [-h + 0.07, (0.08 + kick) / 2, off], [h - 0.07, (0.08 + kick) / 2, off], 0.03, kick - 0.08, Z, mul(YELLOW, 0.95), 0.004);
      bar(m, [-h + 0.07, (kick + TH - 0.28) / 2, off], [h - 0.07, (kick + TH - 0.28) / 2, off], solid ? 0.03 : 0.012, TH - 0.28 - kick, Z, solid ? mul(ALU, 0.9) : GLASS, 0);
      railX(m, -h + 0.07, h - 0.07, 1.35, off + s * 0.01, 0.03, 0.035, YELLOW);
      if (side === 'pz') { pole(m, [h - 0.16, 0.95, off + 0.018], [h - 0.16, 1.15, off + 0.018], 0.012, 4, ALU, true); }
    }
    void n;
  }
  // the telephone on the back wall: its box, its handset, the directory shelf
  bar(m, [0, 1.2, -h + 0.08], [0, 1.6, -h + 0.08], 0.22, 0.09, X, mul(ALU, 0.75), 0.01);
  bar(m, [-0.13, 1.42, -h + 0.14], [-0.13, 1.56, -h + 0.14], 0.05, 0.05, Z, L(0x2a2a2a), 0.01);
  bar(m, [-0.35, 0.95, -h + 0.18], [0.35, 0.95, -h + 0.18], 0.24, 0.03, Z, mul(ALU, 0.85), 0.006);
  // the roof: its slab overhanging, the sign band round it (white on yellow, no lettering), the cap
  bar(m, [-h - 0.02, TH - 0.12, 0], [h + 0.02, TH - 0.12, 0], TB + 0.04, 0.16, Z, YELLOW, 0.01);
  for (const s of [-1, 1]) {
    bar(m, [-h + 0.12, TH - 0.12, s * (h + 0.016)], [h - 0.12, TH - 0.12, s * (h + 0.016)], 0.01, 0.1, Z, L(0xf2f0e8), 0.002);
    bar(m, [s * (h + 0.016), TH - 0.12, -h + 0.12], [s * (h + 0.016), TH - 0.12, h - 0.12], 0.01, 0.1, X, L(0xf2f0e8), 0.002);
  }
  bar(m, [-h - 0.05, TH - 0.02, 0], [h + 0.05, TH - 0.02, 0], TB + 0.1, 0.04, Z, mul(ROOF, 1.1), 0.01);
  void rng;
  return finish(m);
}

// --------------------------------------------------------------------------------------------- the bollard

function pollerNear(rng: Rng): THREE.BufferGeometry {
  const m = newMesh(), col = tone(IRON, rng, 0.05);
  lathe(m, [[0.13, -0.02], [0.13, 0.04], [0.1, 0.07], [0.085, 0.12], [0.085, 0.58], [0.105, 0.6], [0.105, 0.65], [0.085, 0.67], [0.085, 0.8],
    [0.075, 0.86], [0.045, 0.9], [0, 0.915]], 10, (k, b) => mul(col, b === 5 ? 1.25 : 0.95 + (k % 2) * 0.05), { capTop: false });
  return finish(m);
}

// --------------------------------------------------------------------------------------------- the planter

function pflanzkuebelNear(rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  // the hexagonal tub: its foot, its walls, its rim lip (faceted: six sides), the soil inside
  lathe(m, [[0.56, 0], [0.6, 0.04], [0.6, 0.48], [0.64, 0.5], [0.64, 0.56], [0.54, 0.56], [0.54, 0.5]], 6, (k, b) => mul(CONCRETE, 0.92 + (k % 2) * 0.05 + (b > 2 ? 0.06 : 0)), { faceted: true, phase: Math.PI / 6 });
  lathe(m, [[0.54, 0.48], [0, 0.49]], 6, () => SOIL, { faceted: true, phase: Math.PI / 6 });
  // the clipped shrub: a faceted ball in two tones, a smaller lump at its side
  lathe(m, [[0.1, 0.48], [0.38, 0.58], [0.46, 0.75], [0.42, 0.92], [0.28, 1.04], [0, 1.08]], 9, (k, b) => (k + b) % 2 ? SHRUB : SHRUB_DARK, { faceted: true, phase: rng() });
  lathe(m, [[0.06, 0.49], [0.2, 0.55], [0.22, 0.66], [0.12, 0.74], [0, 0.76]], 7, (k) => (k % 2 ? SHRUB_DARK : SHRUB), { faceted: true, x: 0.28, z: 0.12 });
  return finish(m);
}

function pflanzkuebelBroken(rng: Rng): THREE.BufferGeometry {
  // the tub burst: four wall pieces still standing round the soil (two of them broken low), two fallen out, the shrub
  // torn out and lying over the rim
  const m = newMesh();
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6, b = ((k + 1) / 6) * Math.PI * 2 + Math.PI / 6, am = (a + b) / 2;
    const P: V3 = [Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6], Q: V3 = [Math.sin(b) * 0.6, 0, Math.cos(b) * 0.6];
    const h = k % 3 === 0 ? 0.5 : k % 3 === 1 ? 0.28 : 0.42;
    const s0 = m.mark;
    bar(m, [(P[0] + Q[0]) / 2, 0, (P[2] + Q[2]) / 2], [(P[0] + Q[0]) / 2, h, (P[2] + Q[2]) / 2], 0.6, 0.08, [Math.cos(am), 0, -Math.sin(am)], mul(CONCRETE, 0.9 + rng() * 0.08), 0);
    if (k === 1 || k === 4) m.tilt(s0, [P[0], 0, P[2]], [Q[0] - P[0], 0, Q[2] - P[2]], 1.35);
  }
  lathe(m, [[0.55, 0], [0.5, 0.25], [0.2, 0.36], [0, 0.38]], 6, () => SOIL, { faceted: true });
  const s0 = m.mark;
  lathe(m, [[0.1, 0.0], [0.38, 0.14], [0.36, 0.4], [0.18, 0.52], [0, 0.55]], 6, (k) => (k % 2 ? SHRUB : SHRUB_DARK), { faceted: true });
  m.tilt(s0, [0, 0, 0], [1, 0, 0], 1.25);
  for (let i = s0; i < m.mark; i += 3) { m.p[i + 2] += 0.75; m.p[i + 1] += 0.36; }
  return finish(m);
}

function litfassBroken(rng: Rng): THREE.BufferGeometry {
  // snapped above its foot: the stump with its ragged top, the drum lying out on the ground, the dome rolled beside it
  const m = newMesh(), seg = 16;
  lathe(m, [[0.78, 0], [0.78, 0.12], [0.72, 0.18], [LF_R, 0.24], [LF_R, 1.1]], seg, (k) => mul(LITFASS, 0.95 + (k % 2) * 0.04), { capTop: true });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    bar(m, [Math.sin(a) * 0.5, 1.1, Math.cos(a) * 0.5], [Math.sin(a) * 0.5, 1.18 + rng() * 0.15, Math.cos(a) * 0.5], 0.3, 0.12, Z, mul(LITFASS, 0.9), 0.02);
  }
  const s0 = m.mark;
  lathe(m, [[LF_R, 0], [LF_R, 2.0], [0.76, 2.06], [0.6, 2.3], [0.2, 2.42], [0, 2.44]], seg, (k) => mul(LITFASS, 0.95 + (k % 2) * 0.04), { capTop: true, capBottom: true });
  m.tilt(s0, [0, 0, 0], [1, 0, 0], Math.PI / 2);
  for (let i = s0; i < m.mark; i += 3) { m.p[i + 1] += LF_R; m.p[i + 2] += 1.0; }
  return finish(m);
}

function telzelleBroken(rng: Rng): THREE.BufferGeometry {
  // knocked over on its back: the frame lying, its glass gone, the roof broken off beside it
  const m = newMesh(), h = TB / 2;
  const s0 = m.mark;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) upright(m, sx * (h - 0.035), sz * (h - 0.035), 0, TH - 0.2, 0.07, 0.07, YELLOW, 0.012);
  for (const s of [-1, 1]) { railX(m, -h, h, 0.04, s * (h - 0.035), 0.05, 0.08, YELLOW); railX(m, -h, h, TH - 0.24, s * (h - 0.035), 0.05, 0.08, YELLOW); }
  bar(m, [-h + 0.07, 0.25, -h + 0.03], [h - 0.07, 0.25, -h + 0.03], 0.03, 0.34, Z, mul(YELLOW, 0.9), 0.004);
  m.tilt(s0, [0, 0, -h], [1, 0, 0], -Math.PI / 2 + 0.05);
  for (let i = s0; i < m.mark; i += 3) m.p[i + 1] += h;
  bar(m, [-h, 0.08, 1.9], [h, 0.08, 1.9], TB, 0.16, Z, YELLOW, 0.01);
  // the base frame left standing where it was bolted down, and its kick panel
  railX(m, -h, h, 0.04, h - 0.035, 0.05, 0.08, mul(YELLOW, 0.85));
  upright(m, -h + 0.035, h - 0.035, 0, 0.6, 0.07, 0.07, YELLOW, 0.012);
  upright(m, h - 0.035, h - 0.035, 0, 0.42 + rng() * 0.2, 0.07, 0.07, YELLOW, 0.012);
  return finish(m);
}

function pollerBroken(rng: Rng): THREE.BufferGeometry {
  // snapped at its collar and bent over: the stump standing, the head lying at its foot
  const m = newMesh(), col = tone(IRON, rng, 0.05);
  lathe(m, [[0.13, -0.02], [0.13, 0.04], [0.1, 0.07], [0.085, 0.12], [0.085, 0.42]], 10, () => col, { capTop: true });
  const s0 = m.mark;
  lathe(m, [[0.085, 0], [0.085, 0.16], [0.105, 0.18], [0.105, 0.23], [0.085, 0.25], [0.085, 0.38], [0.075, 0.44], [0.045, 0.48], [0, 0.495]], 10, () => col, { capTop: false });
  m.tilt(s0, [0, 0, 0], [1, 0, 0], Math.PI / 2 - 0.15);
  for (let i = s0; i < m.mark; i += 3) { m.p[i + 1] += 0.1; m.p[i + 2] += 0.2; }
  return finish(m);
}

// ------------------------------------------------------------------------------------- the Wochenmarkt's stall
// (228 r2; the blind critics on r1's market: "two bare box stalls with flat striped awnings and a lone white lump and an
// orange box as wares") a Franconian market stand in the stall's record (its footprint 2.84 × 1.88 m, its counter and
// posts its collider): a trestle table under an oilcloth, the produce in tiers of wooden Steigen (apples, oranges,
// cabbages, potatoes, plums, carrots, lettuce, lemons), each a heaped dome in its crate, slate price boards, a scale; four
// posts, the awning's red and cream stripes sloping to a scalloped valance, a green and cream curtain at its back.

const OAK_W = L(0x8a6a48), OAK_DARK = L(0x5e4630), OILCLOTH = L(0x3d6a4c), SLATE = L(0x2c2e30);
const AWNING_A = L(0xb3352c), AWNING_B = L(0xe9e1cf), CURTAIN_A = L(0x2f6a42);
const PRODUCE: readonly Rgb[] = [L(0xb8322a), L(0xe2892c), L(0x6f9a46), L(0x9c7a4e), L(0x5c2a4c), L(0xd8702a), L(0x8cba5a), L(0xe4cf44)];

/** A Steige at (x, y, z) on its base, its long side along x, heaped with a produce colour. */
function steige(m: M, x: number, y: number, z: number, produce: Rgb, rng: Rng, lean = false): void {
  const w = 0.56, d = 0.4, h = 0.15, t = 0.018, wood = tone(OAK_W, rng, 0.1);
  bar(m, [x - w / 2, y + 0.01, z], [x + w / 2, y + 0.01, z], d, 0.02, Z, mul(wood, 0.85), 0.003);
  for (const s of [-1, 1]) {
    bar(m, [x - w / 2, y + h / 2, z + s * (d / 2 - t / 2)], [x + w / 2, y + h / 2, z + s * (d / 2 - t / 2)], t, h * (s > 0 ? 0.62 : 1), Z, wood, lean ? 0 : 0.003);
    if (!lean) bar(m, [x + s * (w / 2 - t / 2), y + h / 2, z - d / 2], [x + s * (w / 2 - t / 2), y + h / 2, z + d / 2], t, h, X, mul(wood, 0.93), 0.003);
  }
  // the heap: a low dome of the produce, each facet its own shade (the fruit's bumps), set down in the crate
  const s0 = m.mark;
  lathe(m, lean ? [[0.25, 0], [0.21, 0.08], [0.1, 0.12], [0, 0.128]] : [[0.25, 0], [0.245, 0.04], [0.21, 0.08], [0.14, 0.11], [0.06, 0.125], [0, 0.128]], lean ? 6 : 9,
    (k, j) => mul(produce, 0.82 + 0.3 * (((k * 7 + j * 3) % 5) / 4) * (0.8 + rng() * 0.4)), { faceted: true, capBottom: false, phase: rng() });
  // (the heap a hand inside the crate's boards: clear of their inner faces)
  for (let i = s0; i < m.mark; i += 3) { m.p[i] = x + m.p[i] * 0.98; m.p[i + 1] += y + 0.035; m.p[i + 2] = z + m.p[i + 2] * 0.64; }
}

function marktstandNear(lean = false): THREE.BufferGeometry {
  const rng = mulberry(0x5a11f2), m = newMesh();
  const HW = 1.3, back = -0.82, front = 0.8, yBack = 2.3, yFront = 2.04;
  // the trestles (an A each end) and the table's top under its oilcloth, the cloth hanging at the front and the ends
  for (const sx of [-1, 1]) {
    for (const [z0, z1] of [[-0.46, -0.08], [0.36, -0.02]] as const) bar(m, [sx * 1.0, 0, z0], [sx * 1.0, 0.82, z1], 0.05, 0.05, X, tone(OAK_DARK, rng, 0.1), 0.006);
    bar(m, [sx * 1.0, 0.42, -0.27], [sx * 1.0, 0.42, 0.17], 0.04, 0.035, X, OAK_DARK, 0.005);
  }
  bar(m, [-1.24, 0.835, -0.05], [1.24, 0.835, -0.05], 1.0, 0.04, Z, tone(OAK_W, rng, 0.08), 0.006);
  bar(m, [-1.26, 0.858, -0.05], [1.26, 0.858, -0.05], 1.03, 0.008, Z, OILCLOTH, 0.002);
  bar(m, [-1.26, 0.56, 0.465], [1.26, 0.56, 0.465], 0.01, 0.6, Z, mul(OILCLOTH, 0.92), 0.002);
  for (const sx of [-1, 1]) bar(m, [sx * 1.255, 0.66, -0.55], [sx * 1.255, 0.66, 0.46], 0.01, 0.4, X, mul(OILCLOTH, 0.86), 0.002);
  // the riser at the back (the second tier) and the crates: the back row on it, the front row on the cloth
  bar(m, [-1.2, 0.93, -0.32], [1.2, 0.93, -0.32], 0.42, 0.14, Z, tone(OAK_W, rng, 0.08), 0.006);
  for (let k = 0; k < 4; k++) {
    const x = -0.87 + k * 0.58;
    steige(m, x, 1.0, -0.32, PRODUCE[(k * 3 + 1) % PRODUCE.length], rng, lean);
    steige(m, x, 0.862, 0.17, PRODUCE[(k * 5 + 2) % PRODUCE.length], rng, lean);
    // a slate price board stuck in the front crate (no lettering)
    if (!lean) bar(m, [x + 0.14, 1.02, 0.36], [x + 0.14, 1.13, 0.37], 0.12, 0.008, X, tone(SLATE, rng, 0.1), 0.002);
  }
  // the scale at the table's end: its body and its dish
  bar(m, [1.06, 0.92, 0.1], [1.06, 1.06, 0.1], 0.16, 0.2, X, L(0xd4d2c8), 0.01);
  const dish = m.mark;
  lathe(m, [[0.1, 0], [0.12, 0.03], [0.125, 0.035]], 10, () => L(0xa8a49a), { x: 1.06, z: 0.1, capBottom: true });
  for (let i = dish; i < m.mark; i += 3) m.p[i + 1] += 1.065;
  // the posts: taller at the back, the awning's rails between their heads
  for (const sx of [-1, 1]) {
    upright(m, sx * HW, back, 0, yBack, 0.06, 0.06, tone(OAK_DARK, rng, 0.08), 0.008);
    upright(m, sx * HW, front, 0, yFront, 0.06, 0.06, tone(OAK_DARK, rng, 0.08), 0.008);
    bar(m, [sx * HW, yBack - 0.02, back], [sx * HW, yFront - 0.02, front], 0.05, 0.04, X, OAK_DARK, 0.005);
  }
  // the awning: eight stripes, red and cream, sagging a little between the rails, out over the front 0.18 m
  const NS = 8, sw = (HW * 2 + 0.16) / NS, fz = front + 0.18, fy = yFront - 0.03;
  for (let k = 0; k < NS; k++) {
    const x = -HW - 0.08 + sw * (k + 0.5), col = k % 2 ? AWNING_B : AWNING_A, midY = (yBack + fy) / 2 - 0.045;
    bar(m, [x, yBack + 0.03, back - 0.08], [x, midY, (back + fz) / 2], sw, 0.012, X, col, 0);
    bar(m, [x, midY, (back + fz) / 2], [x, fy, fz], sw, 0.012, X, mul(col, 0.96), 0);
    // the valance: its panel and its scallop below
    bar(m, [x - sw / 2, fy - 0.08, fz + 0.006], [x + sw / 2, fy - 0.08, fz + 0.006], 0.008, 0.16, Z, mul(col, 0.9), 0);
    faceTri(m, [x - sw / 2, fy - 0.16, fz + 0.006], [x + sw / 2, fy - 0.16, fz + 0.006], [x, fy - 0.235, fz + 0.006], [0, 0, 1], mul(col, 0.88));
    faceTri(m, [x - sw / 2, fy - 0.16, fz + 0.002], [x + sw / 2, fy - 0.16, fz + 0.002], [x, fy - 0.235, fz + 0.002], [0, 0, -1], mul(col, 0.7));
    // the curtain at the back, green and cream, from the rail to a hand above the table
    bar(m, [x, 1.72, back - 0.03], [x, yBack - 0.01, back - 0.03], 0.01, sw, Z, mul(k % 2 ? AWNING_B : CURTAIN_A, 0.92), 0);
  }
  return finish(m);
}

/** The stand knocked over by a hull: its own build tipped forward onto its table's front edge and a little turned, the
 *  crates' produce spilled before it (a dome or two on the setts). */
function marktstandBroken(lean = false): THREE.BufferGeometry {
  const rng = mulberry(0x5a11f3), m = newMesh();
  const g = marktstandNear(lean), pos = g.attributes.position, nrm = g.attributes.normal, col = g.attributes.color;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.05);
  const r = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.16);
  q.premultiply(r);
  const v = new THREE.Vector3();
  let lo = Infinity;
  const pts: number[] = [], ns: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i) - 0.47).applyQuaternion(q);
    pts.push(v.x, v.y, v.z + 0.47); lo = Math.min(lo, v.y);
    v.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).applyQuaternion(q);
    ns.push(v.x, v.y, v.z);
  }
  for (let i = 0; i < pts.length; i += 3) pts[i + 1] -= lo + 0.02;
  m.p.push(...pts); m.n.push(...ns);
  for (let i = 0; i < pos.count; i++) { m.t.push(0.5, 0.5); m.c.push(col.getX(i), col.getY(i), col.getZ(i)); }
  g.dispose();
  for (let k = 0; k < 3; k++) steige(m, -0.9 + k * 0.85 + (rng() - 0.5) * 0.3, 0, 1.25 + rng() * 0.5, PRODUCE[(k * 3) % PRODUCE.length], rng, lean);
  return finish(m);
}

/** A tiny mulberry32 (the stand's own stream: no placement or pool stream draws for it). */
function mulberry(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The market stall's regional forms by civic style (the props' 'stall' kind on a map whose plan names the style: its
 *  record and the legacy builders' draws kept, its geometry this); `lean` a phone's (its crates' ends and boards left
 *  out, its heaps coarser). */
export const CIVIC_STALL_FORMS: Readonly<Record<string, { build: (lean?: boolean) => THREE.BufferGeometry; broken: (lean?: boolean) => THREE.BufferGeometry }>> = Object.freeze({
  franconian: { build: marktstandNear, broken: marktstandBroken },
});

/** The civic kinds' records (props destructibles): a kiosk and a phone box break and stop no round (sheet metal and
 *  glass), a Litfaßsäule is concrete (a collider, a hull breaks it at speed), a bollard and a planter a hull drives
 *  over; the memorial column is fortified (collision.ts isFortifiedCoverKind): the third heavy HE hit or a heavy ram
 *  brings it down, and every round stops on it. */
export const CIVIC_RECORDS = Object.freeze({
  kiosk: { cls: 'break', mat: 'baked', contact: 'ob', r: 1.65, h: 2.75, hw: 1.42, hl: 1.12, keep: 0.9, crushMin: 1.4 },
  litfass: { cls: 'break', mat: 'baked', contact: 'ob', r: 0.8, h: LF_H, shape: 'circle', collisionR: 0.74, collider: true, keep: 0.82, crushMin: 2.2 },
  telzelle: { cls: 'break', mat: 'baked', contact: 'ob', r: 0.82, h: TH, hw: 0.6, hl: 0.6, keep: 0.94, crushMin: 1.2 },
  poller: { cls: 'break', mat: 'baked', contact: 'ob', r: 0.15, h: 0.92, shape: 'circle', collisionR: 0.13, keep: 0.97 },
  pflanzkuebel: { cls: 'break', mat: 'baked', contact: 'ob', r: 0.66, h: 1.08, shape: 'circle', collisionR: 0.64, keep: 0.93 },
  memorialcolumn: { cls: 'break', mat: 'stone', contact: 'ob', r: 2.05, h: 12.3, shape: 'circle', collisionR: 2.05, collider: true, keep: 0.35, crushMin: 999 },
} as const);

/** The builders of the furniture kinds (the column's are wellKit's 'saeule', bound by props.ts on its kit's stone). */
export const CIVIC_BUILDERS: Readonly<Record<string, { build: (rng: Rng) => THREE.BufferGeometry; broken: (rng: Rng) => THREE.BufferGeometry }>> = Object.freeze({
  kiosk: { build: kioskNear, broken: kioskBroken },
  litfass: { build: litfassNear, broken: litfassBroken },
  telzelle: { build: telzelleNear, broken: telzelleBroken },
  poller: { build: pollerNear, broken: pollerBroken },
  pflanzkuebel: { build: pflanzkuebelNear, broken: pflanzkuebelBroken },
});

/** The civic furniture kinds as props destructible types (props.ts LOCAL_TYPES). */
export function civicFurnitureTypes(): Record<string, DestructiblePropType> {
  const out: Record<string, DestructiblePropType> = {};
  for (const [kind, b] of Object.entries(CIVIC_BUILDERS)) {
    out[kind] = { ...(CIVIC_RECORDS as Record<string, object>)[kind], build: b.build, broken: b.broken } as DestructiblePropType;
  }
  return out;
}
void X;
