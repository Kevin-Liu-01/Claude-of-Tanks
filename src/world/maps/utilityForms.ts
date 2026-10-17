// src/world/maps/utilityForms.ts — the transformer, form by form (props lane A, family #21, 2026-10-14; WORKLIST.md
// #21: "Transformers: pad-mount cabinets (coastal, caldera, airfield, oasis, badlands, mangrove, delta), pole-mount cans
// on H-frames (titan_gorge, skybridge, copper_mesa), brick or concrete kiosk substations (ruinspires, saltwind, urban,
// frontier, orchard), steel switchgear housing (whiteout); period forms from periodClutterKit ... transformer cabinets
// with doors and hinges, louvre grilles, fins, bushings in place, earthing straps, warning signs ... cabinets lose doors,
// casing split, fins buckled").
//
// Each builder returns one non-indexed geometry on the baked material (clutterForms' writer: position, normal, flat uv,
// a linear vertex colour), its base on y = 0, centred in the record's footprint (inhabitKit transformer: 1.52 x 1.02 m,
// its front, the doors, toward +z). One form at every distance: a transformer casts its shadow. Near and wreck within
// 600 triangles. Builders read only their arguments (a form's palette and a stream of their own).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hexLin, mix, mul, type Rgb, type V3 } from './craftMesh.ts';
import { bar, crateBroken, crateNear, extrude, faceTri, finish, lathe, newMesh, place, pole, tip, tone, type CrateForm } from './clutterForms.ts';

type Rng = () => number;
type M = ReturnType<typeof newMesh>;
const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];
/** The transformer record's half-footprint (inhabitKit: hw 0.76, hl 0.51). */
const HW = 0.76, HL = 0.51;
const DARK = hexLin(0x1c1e1c), COPPER = hexLin(0x8a5a32), SIGN = hexLin(0xe8e4d8), SIGN_Y = hexLin(0xe0b020), PORCELAIN = hexLin(0x6a3a26);
const GREEN_GLASS = hexLin(0x4a6a58), OIL = hexLin(0x18160f);

/** A transformer's make: the pad-mount cabinet on its slab, the cans on a timber H-frame, the masonry kiosk (a slab or a
 *  tiled hip roof), the steel switchgear housing on skids, or the period's stack of supply crates on skids. */
export interface TransformerForm {
  kind: 'pad' | 'hframe' | 'kiosk' | 'switchgear' | 'crates';
  body: Rgb; trim: Rgb;
  /** the kiosk's roof: its tiles (a hip roof) or its slab's concrete */
  roof?: Rgb; hip?: boolean;
  /** the period's crates (clutterKit's crate form of the map) */
  crate?: CrateForm;
}

/** A rectangle's section with its upper corners cut (x half-width hx, from y0 to y1, chamfer c). */
const lidded = (hx: number, y0: number, y1: number, c: number): Array<[number, number]> =>
  [[-hx, y0], [hx, y0], [hx, y1 - c], [hx - c, y1], [-hx + c, y1], [-hx, y1 - c]];
/** A plan rectangle (x0..x1, z0..z1) with its corners cut by c, counter-clockwise. */
const planRect = (x0: number, x1: number, z0: number, z1: number, c: number): Array<[number, number]> =>
  [[x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c]];
/** A prism standing from y0 to y1 on a plan polygon (x, z), counter-clockwise. */
function standing(m: M, plan: ReadonlyArray<readonly [number, number]>, y0: number, y1: number, side: Rgb | ((e: number) => Rgb), cap: Rgb): void {
  extrude(m, [0, y0, 0], [0, y1, 0], plan, X, Z, side, cap);
}
/** The warning sign (white with its yellow triangle and the black bolt), on a face at z facing +z, centred (x, y). */
function warning(m: M, x: number, y: number, z: number, s = 1): void {
  // (the r2 sweep, 2026-10-16: the yellow triangle was a second plate laid on the white one) one enamel plate, its
  // triangle printed in its face: the white ring round the triangle and the triangle share their corners
  const r0: V3 = [x - 0.08 * s, y - 0.07 * s, z], r1: V3 = [x + 0.08 * s, y - 0.07 * s, z], r2: V3 = [x + 0.08 * s, y + 0.07 * s, z], r3: V3 = [x - 0.08 * s, y + 0.07 * s, z];
  const t0: V3 = [x - 0.06 * s, y - 0.05 * s, z], t1: V3 = [x + 0.06 * s, y - 0.05 * s, z], t2: V3 = [x, y + 0.055 * s, z];
  for (const [a, b, c] of [[r0, r1, t1], [r0, t1, t0], [r1, r2, t2], [r1, t2, t1], [r2, r3, t2], [r3, r0, t0], [r3, t0, t2]] as const) faceTri(m, a, b, c, Z, SIGN);
  faceTri(m, t0, t1, t2, Z, SIGN_Y);
  faceTri(m, [x - 0.012 * s, y + 0.025 * s, z + 0.004], [x + 0.008 * s, y - 0.005 * s, z + 0.004], [x - 0.004 * s, y - 0.005 * s, z + 0.004], Z, DARK);
  faceTri(m, [x - 0.004 * s, y, z + 0.004], [x + 0.012 * s, y - 0.035 * s, z + 0.004], [x - 0.008 * s, y, z + 0.004], Z, DARK);
}
/** A dark stain spread on the ground round (x, z): a ragged polygon (the oil a broken transformer bled). */
function stain(m: M, x: number, z: number, rx: number, rz: number, col: Rgb, rng: Rng): void {
  const n = 9, pts: V3[] = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, j = 0.65 + rng() * 0.45; pts.push([x + Math.cos(a) * rx * j, 0.006, z + Math.sin(a) * rz * j]); }
  for (let k = 0; k < n; k++) faceTri(m, [x, 0.007, z], pts[k], pts[(k + 1) % n], Y, mul(col, 0.9 + (k % 3) * 0.06));
}

// ------------------------------------------------------------------------------------------------ the pad-mount cabinet

const PAD_W = 0.6, PAD_D = 0.38, PAD_Y0 = 0.12, PAD_Y1 = 1.18;
/** The concrete pad (chamfered), a hand proud of the ground. */
function pad(m: M, col: Rgb, top = PAD_Y0): void {
  extrude(m, [0, 0, -HL + 0.02], [0, 0, HL - 0.02], lidded(HW - 0.02, -0.06, top, 0.025), X, Y, (e) => mul(col, 0.88 + (e % 2) * 0.08), mul(col, 0.84));
}
/** The cabinet's front: its two doors' seams, hinges, handle and padlock, the warning sign. */
function cabinetFront(m: M, w: number, y0: number, y1: number, z: number, body: Rgb, trim: Rgb): void {
  const seam = mul(body, 0.45);
  bar(m, [0, y0 + 0.07, z], [0, y1 - 0.07, z], 0.012, 0.008, X, seam);
  for (const y of [y0 + 0.07, y1 - 0.07]) bar(m, [-w + 0.05, y, z], [w - 0.05, y, z], 0.012, 0.008, Y, seam);
  for (const s of [-1, 1]) {
    bar(m, [s * (w - 0.05), y0 + 0.07, z], [s * (w - 0.05), y1 - 0.07, z], 0.012, 0.008, X, seam);
    for (const y of [y0 + 0.22, y1 - 0.28]) bar(m, [s * (w - 0.02), y, z + 0.008], [s * (w - 0.02), y + 0.1, z + 0.008], 0.028, 0.02, X, trim);
  }
  // the handle and its padlock on the right leaf
  bar(m, [0.07, (y0 + y1) / 2 - 0.1, z + 0.02], [0.07, (y0 + y1) / 2 + 0.1, z + 0.02], 0.024, 0.026, X, trim, 0.006);
  bar(m, [0.11, (y0 + y1) / 2 - 0.03, z + 0.02], [0.11, (y0 + y1) / 2 + 0.03, z + 0.02], 0.04, 0.03, X, mul(trim, 0.7), 0.006);
  warning(m, w * 0.5, y1 - 0.24, z + 0.005);
}
/** A louvre grille of fins on a side face at x (sign s: its outward side), from y0 to y1 across z0..z1. */
function louvre(m: M, x: number, s: number, y0: number, y1: number, z0: number, z1: number, col: Rgb): void {
  const n = Math.max(3, Math.round((y1 - y0) / 0.07));
  for (let k = 0; k < n; k++) {
    const y = y0 + (k + 0.5) * (y1 - y0) / n;
    bar(m, [x + s * 0.012, y, z0], [x + s * 0.012, y, z1], 0.045, 0.014, [0, Math.cos(0.5), s * Math.sin(0.5)], col, 0, true);
  }
}

function padNear(f: TransformerForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const body = tone(f.body, rng, 0.06), slab = hexLin(0x9a968c);
  pad(m, slab);
  extrude(m, [0, 0, -PAD_D], [0, 0, PAD_D], lidded(PAD_W, PAD_Y0, PAD_Y1, 0.035), X, Y, (e) => mul(body, e === 0 ? 0.8 : e === 1 || e === 5 ? 0.95 : 1), mul(body, 0.97));
  // the lid, a little proud all round, its top falling to both sides
  extrude(m, [0, 0, -PAD_D - 0.03], [0, 0, PAD_D + 0.03], [[-PAD_W - 0.03, PAD_Y1 - 0.01], [PAD_W + 0.03, PAD_Y1 - 0.01], [PAD_W + 0.03, PAD_Y1 + 0.025], [0, PAD_Y1 + 0.06], [-PAD_W - 0.03, PAD_Y1 + 0.025]],
    X, Y, (e) => mul(body, e === 2 || e === 3 ? 1.04 : 0.9), mul(body, 0.92));
  cabinetFront(m, PAD_W, PAD_Y0, PAD_Y1, PAD_D + 0.002, body, f.trim);
  for (const s of [-1, 1]) louvre(m, s * PAD_W, s, PAD_Y1 - 0.42, PAD_Y1 - 0.12, -0.24, 0.24, mul(body, 0.82));
  // the lifting lugs at the lid's corners and the earthing strap down its back into the ground
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(m, [sx * (PAD_W - 0.05), PAD_Y1 + 0.02, sz * (PAD_D - 0.06)], [sx * (PAD_W - 0.05), PAD_Y1 + 0.075, sz * (PAD_D - 0.06)], 0.025, 0.05, X, f.trim);
  bar(m, [-PAD_W + 0.12, PAD_Y0 + 0.16, -PAD_D - 0.008], [-PAD_W + 0.12, 0.0, -PAD_D - 0.09], 0.03, 0.006, X, COPPER);
  return finish(m);
}
function padBroken(f: TransformerForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const body = mul(tone(f.body, rng, 0.06), 0.8), slab = hexLin(0x9a968c);
  stain(m, 0.1, 0.25, 1.0, 0.75, OIL, rng);
  pad(m, slab);
  // the casing split open: its lower part standing, torn ragged above the doors' lower hinge, the core inside it
  const torn = 0.55 + rng() * 0.15;
  extrude(m, [0, 0, -PAD_D], [0, 0, PAD_D], [[-PAD_W, PAD_Y0], [PAD_W, PAD_Y0], [PAD_W, torn - 0.08], [PAD_W * 0.4, torn + 0.06], [-PAD_W * 0.2, torn - 0.02], [-PAD_W, torn + 0.08]],
    X, Y, (e) => mul(body, e === 0 ? 0.75 : 0.95), mul(body, 0.7));
  // the core and its coils, charred, standing out of it
  lathe(m, [[0.18, torn - 0.1], [0.2, torn + 0.12], [0.16, torn + 0.28], [0, torn + 0.3]], 6, (k) => mul(DARK, 1.2 + (k % 2) * 0.3), { x: -0.18, z: 0, faceted: true });
  lathe(m, [[0.17, torn - 0.1], [0.19, torn + 0.1], [0.14, torn + 0.22], [0, torn + 0.24]], 6, (k) => mul(COPPER, 0.5 + (k % 2) * 0.2), { x: 0.2, z: 0.02, faceted: true });
  // the lid thrown off onto the ground, a door leaf beside it
  let from = m.mark;
  extrude(m, [0, 0, -PAD_D - 0.03], [0, 0, PAD_D + 0.03], [[-PAD_W - 0.03, 0], [PAD_W + 0.03, 0], [PAD_W + 0.03, 0.035], [0, 0.07], [-PAD_W - 0.03, 0.035]], X, Y, mul(body, 0.95), mul(body, 0.9));
  tip(m, from, [0, 0, 0], Z, 0.12);
  place(m, from, 0.6 + rng() * 0.4, 0.15, 0.04, -0.75);
  from = m.mark;
  extrude(m, [0, 0, 0], [0, 0, 0.025], lidded(0.29, 0, PAD_Y1 - PAD_Y0 - 0.1, 0.01), X, Y, body, mul(body, 0.8));
  tip(m, from, [0, 0, 0], X, -Math.PI / 2 + 0.06);
  place(m, from, 0.4 + rng() * 0.5, 0.95, 0.03, 0.55);
  for (const s of [-1, 1]) louvre(m, s * PAD_W, s, PAD_Y0 + 0.1, Math.min(torn - 0.12, PAD_Y0 + 0.4), -0.24, 0.24, mul(body, 0.7));
  return finish(m);
}

// ------------------------------------------------------------------------------------------------ the cans on an H-frame

const POST_X = 0.62, DECK_Y = 1.02, POST_TOP = 2.55;
/** A pole-mount can: its tank in rings, its rolled lid, two high-voltage bushings on top and one low on its side. */
function can(m: M, x: number, y: number, z: number, body: Rgb, rng: Rng): void {
  const from = m.mark;
  lathe(m, [[0.22, 0], [0.25, 0.03], [0.25, 0.32], [0.262, 0.34], [0.25, 0.6], [0.265, 0.63], [0.2, 0.68], [0, 0.69]], 8,
    (k, b) => mul(body, (b === 3 || b === 5 ? 1.1 : 1) * (0.92 + (k % 2) * 0.06)));
  place(m, from, rng() * Math.PI, x, y, z);
  for (const dx of [-0.09, 0.09]) {
    const b = m.mark;
    lathe(m, [[0.045, 0], [0.055, 0.05], [0.03, 0.1], [0, 0.15]], 5, (k) => mul(PORCELAIN, 0.9 + (k % 2) * 0.12), { faceted: true });
    place(m, b, 0, x + dx, y + 0.66, z);
  }
}
function hframeNear(f: TransformerForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const wood = tone(f.trim, rng, 0.1), body = tone(f.body, rng, 0.06);
  // the two creosoted posts (set in the ground), the deck beams bolted across them, its planks
  for (const s of [-1, 1]) pole(m, [s * POST_X, -0.3, 0], [s * POST_X, POST_TOP, 0], 0.11, 7, mul(wood, 0.9 + (s + 1) * 0.04));
  for (const z of [-0.17, 0.17]) bar(m, [-HW + 0.02, DECK_Y - 0.07, z], [HW - 0.02, DECK_Y - 0.07, z], 0.08, 0.13, Z, mul(wood, 1.05));
  for (let k = 0; k < 4; k++) { const x = -0.42 + k * 0.28; bar(m, [x, DECK_Y + 0.005, -0.3], [x, DECK_Y + 0.005, 0.3], 0.24, 0.03, X, tone(wood, rng, 0.2)); }
  can(m, -0.26, DECK_Y + 0.02, 0, body, rng);
  can(m, 0.26, DECK_Y + 0.02, 0, body, rng);
  // the crossarm at the posts' heads, its three insulators and the drop leads down to the bushings
  bar(m, [-HW, POST_TOP - 0.18, 0.12], [HW, POST_TOP - 0.18, 0.12], 0.09, 0.1, Y, mul(wood, 1.1));
  for (const x of [-0.5, 0, 0.5]) {
    const from = m.mark;
    lathe(m, [[0.045, 0], [0.055, 0.04], [0.035, 0.08], [0, 0.1]], 5, () => GREEN_GLASS, { faceted: true });
    place(m, from, 0, x, POST_TOP - 0.13, 0.12);
  }
  for (const [x0, x1] of [[-0.5, -0.35], [0, -0.17], [0, 0.17], [0.5, 0.35]] as const) bar(m, [x0, POST_TOP - 0.02, 0.12], [x1, DECK_Y + 0.82, 0], 0.012, 0.012, Z, DARK);
  // the earthing wire down the left post into the ground
  bar(m, [-POST_X - 0.11, DECK_Y + 0.6, 0], [-POST_X - 0.11, -0.05, 0], 0.012, 0.012, Z, COPPER);
  return finish(m);
}
function hframeBroken(f: TransformerForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const wood = mul(tone(f.trim, rng, 0.1), 0.85), body = mul(tone(f.body, rng, 0.06), 0.85);
  stain(m, 0.2, 0.35, 0.9, 0.7, OIL, rng);
  // the right post snapped above the deck, its top thrown down; the left one standing, leaning, the deck hanging off it
  pole(m, [POST_X, -0.3, 0], [POST_X + 0.04, 1.25, 0.02], 0.11, 7, wood);
  let from = m.mark;
  pole(m, [0, 0, 0], [0, 1.35, 0], 0.1, 7, wood);
  tip(m, from, [0, 0, 0], Z, -Math.PI / 2 + 0.08);
  place(m, from, 0.5 + rng() * 0.4, POST_X + 0.25, 0.1, 0.5);
  pole(m, [-POST_X, -0.3, 0], [-POST_X + 0.35, POST_TOP - 0.2, 0.05], 0.11, 7, wood);
  from = m.mark;
  for (const z of [-0.17, 0.17]) bar(m, [-HW + 0.02, 0, z], [HW - 0.02, 0, z], 0.08, 0.13, Z, mul(wood, 1.05), 0.012);
  for (let k = 0; k < 3; k++) { const x = -0.48 + k * 0.24; bar(m, [x, 0.075, -0.3], [x, 0.075, 0.3], 0.2, 0.03, X, wood, 0.006); }
  // (the deck hangs from the leaning post: its left end at the post, its right end down on the ground)
  tip(m, from, [-HW, 0, 0], Z, -0.62);
  place(m, from, 0, 0, DECK_Y - 0.07, 0);
  // one can slid off the deck upright onto the ground, the other rolled off onto its side
  can(m, -0.3, 0, -0.42, body, rng);
  from = m.mark;
  can(m, 0, 0, 0, body, rng);
  tip(m, from, [0, 0, 0], X, Math.PI / 2 - 0.1);
  place(m, from, rng() * Math.PI, 0.35, 0.27, -0.62);
  // the crossarm down beside them
  bar(m, [-0.7, 0.06, 0.75], [0.75, 0.05, 0.62], 0.09, 0.1, Y, mul(wood, 1.1), 0.012);
  return finish(m);
}

// ------------------------------------------------------------------------------------------------ the kiosk substation

const KIOSK_TOP = 1.84, DOOR_HW = 0.32, DOOR_TOP = 1.5, WALL = 0.11;
/** The kiosk's walls round its door opening (front +z): the back, the sides, the jambs and the lintel. */
function kioskWalls(m: M, top: number, wall: Rgb, cutRng?: Rng): void {
  const side = (e: number) => mul(wall, 0.9 + (e % 3) * 0.05), cap = mul(wall, 0.85);
  const h = (base: number) => (cutRng ? 0.45 + cutRng() * 0.7 : base);
  standing(m, planRect(-HW + 0.02, HW - 0.02, -HL + 0.02, -HL + 0.02 + WALL, 0.02), 0.14, h(top), side, cap);
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -HW + 0.02 : HW - 0.02 - WALL, x1 = x0 + WALL;
    standing(m, planRect(x0, x1, -HL + 0.02 + WALL, HL - 0.02, 0.02), 0.14, h(top), side, cap);
    const j0 = s < 0 ? -HW + 0.02 + WALL : DOOR_HW, j1 = s < 0 ? -DOOR_HW : HW - 0.02 - WALL;
    standing(m, planRect(j0, j1, HL - 0.02 - WALL, HL - 0.02, 0.015), 0.14, h(top), side, cap);
  }
  if (!cutRng) standing(m, planRect(-DOOR_HW, DOOR_HW, HL - 0.02 - WALL, HL - 0.02, 0.01), DOOR_TOP, top, side, cap);
}
/** The kiosk's steel doors set back in their opening: two leaves, each a field of louvre fins, the sign on the right. */
function kioskDoors(m: M, door: Rgb, trim: Rgb): void {
  const z = HL - 0.02 - WALL + 0.035;
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -DOOR_HW + 0.01 : 0.005, x1 = s < 0 ? -0.005 : DOOR_HW - 0.01;
    extrude(m, [0, 0, z - 0.025], [0, 0, z], [[x0, 0.15], [x1, 0.15], [x1, DOOR_TOP - 0.01], [x0, DOOR_TOP - 0.01]], X, Y, door, mul(door, 1.04));
    for (let k = 0; k < 6; k++) bar(m, [x0 + 0.03, 0.3 + k * 0.08, z + 0.006], [x1 - 0.03, 0.3 + k * 0.08, z + 0.006], 0.04, 0.012, [0, Math.cos(0.5), Math.sin(0.5)], mul(door, 0.85), 0, true);
  }
  bar(m, [0.04, 0.82, z + 0.02], [0.04, 0.98, z + 0.02], 0.022, 0.024, X, trim, 0.006);
  warning(m, DOOR_HW * 0.5, 1.2, z + 0.004, 1.1);
}
function kioskRoof(m: M, f: TransformerForm, top: number): void {
  const roof = f.roof ?? hexLin(0x8a8680);
  if (!f.hip) {
    // a concrete slab, its drip edge proud of the walls all round
    extrude(m, [0, top, -HL - 0.06], [0, top, HL + 0.06], lidded(HW + 0.06, 0, 0.12, 0.03), X, Y, (e) => mul(roof, e === 0 ? 0.7 : 0.95), mul(roof, 0.9));
    return;
  }
  // a tiled hip roof over its eaves board
  const ex = HW + 0.1, ez = HL + 0.1, y0 = top + 0.06, y1 = top + 0.52, rx = 0.26;
  extrude(m, [0, top, -ez], [0, top, ez], lidded(ex, -0.02, 0.06, 0.01), X, Y, mul(f.trim, 0.9), mul(f.trim, 0.85));
  const a: V3 = [-ex, y0, -ez], b: V3 = [ex, y0, -ez], c: V3 = [ex, y0, ez], d: V3 = [-ex, y0, ez], r0: V3 = [-rx, y1, 0], r1: V3 = [rx, y1, 0];
  const uv: [number, number] = [0.5, 0.5];
  m.quad(d, c, r1, r0, [0, 0.7, 0.7], () => uv, (q) => mul(roof, 0.92 + 0.08 * Math.sin(q[0] * 9)), false);
  m.quad(b, a, r0, r1, [0, 0.7, -0.7], () => uv, (q) => mul(roof, 0.88 + 0.08 * Math.sin(q[0] * 9)), false);
  faceTri(m, c, b, r1, [0.7, 0.7, 0], mul(roof, 0.9));
  faceTri(m, a, d, r0, [-0.7, 0.7, 0], mul(roof, 0.86));
  bar(m, r0, r1, 0.07, 0.05, X, mul(roof, 0.75), 0.01);
}
function kioskNear(f: TransformerForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const wall = tone(f.body, rng, 0.05);
  extrude(m, [0, 0, -HL], [0, 0, HL], lidded(HW, -0.08, 0.14, 0.02), X, Y, (e) => mul(wall, 0.72 + (e % 2) * 0.06), mul(wall, 0.7));
  kioskWalls(m, KIOSK_TOP, wall);
  kioskDoors(m, mix(f.trim, hexLin(0x6a706a), 0.5), f.trim);
  kioskRoof(m, f, KIOSK_TOP);
  // a vent grille high on each side and the cable conduits into the ground at the back
  for (const s of [-1, 1]) louvre(m, s * (HW - 0.02), s, 1.38, 1.62, -0.22, 0.12, mul(wall, 0.78));
  for (const x of [-0.25, 0.25]) pole(m, [x, -0.2, -HL - 0.04], [x, 0.55, -HL - 0.04], 0.045, 6, mul(f.trim, 0.8), true);
  return finish(m);
}
function kioskBroken(f: TransformerForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const wall = mul(tone(f.body, rng, 0.05), 0.85);
  extrude(m, [0, 0, -HL], [0, 0, HL], lidded(HW, -0.08, 0.14, 0.02), X, Y, mul(wall, 0.72), mul(wall, 0.7));
  // its walls broken off at a man's waist and chest, the transformer inside showing
  kioskWalls(m, KIOSK_TOP, wall, rng);
  lathe(m, [[0.26, 0.14], [0.3, 0.3], [0.3, 0.75], [0.22, 0.85], [0, 0.86]], 6, (k) => mul(DARK, 1.3 + (k % 2) * 0.3), { x: 0, z: -0.05, faceted: true });
  // the roof slab down across the rubble, a door leaf on the ground before it, the rubble
  let from = m.mark;
  extrude(m, [0, 0, -HL - 0.06], [0, 0, HL + 0.06], lidded(HW + 0.06, 0, 0.12, 0.03), X, Y, mul(f.roof ?? hexLin(0x8a8680), 0.85), mul(f.roof ?? hexLin(0x8a8680), 0.8));
  tip(m, from, [0, 0, 0], X, 0.42);
  place(m, from, (rng() - 0.5) * 0.4, 0.05, 0.62, -0.35);
  from = m.mark;
  extrude(m, [0, 0, 0], [0, 0, 0.025], [[-0.3, 0], [0.3, 0], [0.3, 1.32], [-0.3, 1.32]], X, Y, mix(f.trim, hexLin(0x6a706a), 0.5), mul(f.trim, 0.8));
  tip(m, from, [0, 0, 0], X, -Math.PI / 2 + 0.05);
  place(m, from, 0.3 + rng() * 0.4, 0.15, 0.03, HL + 0.45);
  for (let k = 0; k < 5; k++) {
    const a = rng() * Math.PI * 2, dist = 0.5 + rng() * 0.5, c = 0.12 + rng() * 0.08;
    lathe(m, [[c, 0], [c * 0.75, c * 0.8], [0, c * 0.95]], 4, () => mul(wall, 0.8 + rng() * 0.25), { faceted: true, x: Math.cos(a) * dist, z: Math.sin(a) * dist * 0.7, phase: rng() });
  }
  return finish(m);
}

// ------------------------------------------------------------------------------------------------ the switchgear housing

const SG_W = 0.66, SG_D = 0.42, SG_Y0 = 0.17, SG_Y1 = 1.66;
function sgBody(m: M, body: Rgb, top: number, lean = 0): void {
  extrude(m, [0, 0, -SG_D], [0, 0, SG_D], [[-SG_W, SG_Y0], [SG_W, SG_Y0], [SG_W + lean, top - 0.03], [SG_W + lean - 0.03, top], [-SG_W + lean + 0.03, top], [-SG_W + lean, top - 0.03]],
    X, Y, (e) => mul(body, e === 0 ? 0.8 : 0.95 + (e % 2) * 0.04), mul(body, 0.97));
}
function switchgearNear(f: TransformerForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const body = tone(f.body, rng, 0.05);
  // the skids it stands on, the housing, its stiffening ribs, the gable lid
  for (const z of [-SG_D + 0.08, SG_D - 0.08]) bar(m, [-HW + 0.02, 0.085, z], [HW - 0.02, 0.085, z], 0.17, 0.12, Y, mul(f.trim, 0.8), 0.015);
  sgBody(m, body, SG_Y1);
  for (const x of [-0.44, 0.44]) for (const z of [-SG_D - 0.012, SG_D + 0.012]) bar(m, [x, SG_Y0 + 0.02, z], [x, SG_Y1 - 0.04, z], 0.05, 0.024, X, mul(body, 0.88), 0.008);
  extrude(m, [-SG_W - 0.04, SG_Y1, 0], [SG_W + 0.04, SG_Y1, 0], [[-SG_D - 0.04, -0.01], [SG_D + 0.04, -0.01], [SG_D + 0.04, 0.03], [0, 0.12], [-SG_D - 0.04, 0.03]], Z, Y,
    (e) => mul(body, e === 2 || e === 3 ? 1.05 : 0.9), mul(body, 0.93));
  cabinetFront(m, 0.4, SG_Y0 + 0.02, SG_Y1 - 0.04, SG_D + 0.002, body, f.trim);
  for (const s of [-1, 1]) louvre(m, s * SG_W, s, SG_Y1 - 0.5, SG_Y1 - 0.16, -0.28, 0.28, mul(body, 0.8));
  // the cable conduit up out of the ground into its side
  pole(m, [SG_W + 0.06, -0.2, -0.15], [SG_W + 0.06, 0.5, -0.15], 0.05, 6, mul(f.trim, 0.85));
  pole(m, [SG_W + 0.06, 0.48, -0.15], [SG_W - 0.03, 0.62, -0.15], 0.05, 6, mul(f.trim, 0.85));
  return finish(m);
}
function switchgearBroken(f: TransformerForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const body = mul(tone(f.body, rng, 0.05), 0.8);
  stain(m, -0.1, 0.3, 0.95, 0.7, OIL, rng);
  for (const z of [-SG_D + 0.08, SG_D - 0.08]) bar(m, [-HW + 0.02, 0.085, z], [HW - 0.02, 0.085, z], 0.17, 0.12, Y, mul(f.trim, 0.75), 0.015);
  // the housing crumpled down and sheared over, its lid and a door on the ground
  sgBody(m, body, 0.9 + rng() * 0.2, 0.18);
  let from = m.mark;
  extrude(m, [-SG_W - 0.04, 0, 0], [SG_W + 0.04, 0, 0], [[-SG_D - 0.04, 0], [SG_D + 0.04, 0], [SG_D + 0.04, 0.04], [0, 0.13], [-SG_D - 0.04, 0.04]], Z, Y, mul(body, 0.95), mul(body, 0.9));
  tip(m, from, [0, 0, 0], X, 0.35);
  place(m, from, 0.7 + rng() * 0.5, -0.2, 0.08, -0.85);
  from = m.mark;
  extrude(m, [0, 0, 0], [0, 0, 0.02], [[-0.38, 0], [0.38, 0], [0.38, 1.36], [-0.38, 1.36]], X, Y, body, mul(body, 0.8));
  tip(m, from, [0, 0, 0], X, -Math.PI / 2 + 0.05);
  place(m, from, -0.4 + rng() * 0.4, 0.3, 0.025, SG_D + 0.3);
  lathe(m, [[0.2, 0.17], [0.22, 0.4], [0.18, 0.7], [0, 0.72]], 6, (k) => mul(DARK, 1.2 + (k % 2) * 0.3), { x: -0.2, z: 0, faceted: true });
  return finish(m);
}

// ------------------------------------------------------------------------------------------------ the period's crates

/** The crates' form fitted to the footprint: two below on the skids, one across them above. */
function crateFit(f: TransformerForm): CrateForm {
  const c = f.crate!;
  const k = Math.min(1, (HW - 0.04) / c.w, (2 * HL - 0.1) / c.d, 0.62 / c.h);
  return { ...c, w: c.w * k, h: c.h * k, d: c.d * k };
}
function skids(m: M, col: Rgb): void {
  for (const x of [-0.48, 0.48]) bar(m, [x, 0.05, -HL + 0.04], [x, 0.05, HL - 0.04], 0.12, 0.1, X, col, 0.012);
}
function cratesNear(f: TransformerForm, rng: Rng): THREE.BufferGeometry {
  const c = crateFit(f), m = newMesh();
  skids(m, mul(c.frame, 0.85));
  const parts = [finish(m)];
  for (const s of [-1, 1]) {
    const g = crateNear(c, rng);
    g.rotateY((rng() - 0.5) * 0.06);
    g.translate(s * (c.w / 2 + 0.015), 0.1, (rng() - 0.5) * 0.04);
    parts.push(g);
  }
  const top = crateNear(c, rng);
  top.rotateY(Math.PI / 2 + (rng() - 0.5) * 0.2);
  top.translate((rng() - 0.5) * 0.08, 0.1 + c.h, 0);
  parts.push(top);
  return merged(parts);
}
function cratesBroken(f: TransformerForm, rng: Rng): THREE.BufferGeometry {
  const c = crateFit(f), m = newMesh();
  skids(m, mul(c.frame, 0.8));
  const parts = [finish(m)];
  // the lower crates burst into their boards, the top one tumbled off whole
  for (const s of [-1, 1]) {
    const g = crateBroken(c, rng);
    g.translate(s * (c.w / 2 + 0.05), 0.0, (rng() - 0.5) * 0.2);
    parts.push(g);
  }
  const top = crateNear(c, rng);
  top.rotateZ(0.2 + rng() * 0.2);
  top.rotateY(rng() * Math.PI);
  top.translate(0.2 + rng() * 0.3, 0.06, HL + 0.35);
  parts.push(top);
  return merged(parts);
}
function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = Object.keys(parts[0].attributes);
  for (const g of parts) for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
  for (const p of parts) p.dispose();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------------------------------------ by make

export function transformerNear(f: TransformerForm, rng: Rng): THREE.BufferGeometry {
  switch (f.kind) {
    case 'pad': return padNear(f, rng);
    case 'hframe': return hframeNear(f, rng);
    case 'kiosk': return kioskNear(f, rng);
    case 'switchgear': return switchgearNear(f, rng);
    case 'crates': return cratesNear(f, rng);
  }
}
export function transformerBroken(f: TransformerForm, rng: Rng): THREE.BufferGeometry {
  switch (f.kind) {
    case 'pad': return padBroken(f, rng);
    case 'hframe': return hframeBroken(f, rng);
    case 'kiosk': return kioskBroken(f, rng);
    case 'switchgear': return switchgearBroken(f, rng);
    case 'crates': return cratesBroken(f, rng);
  }
}
