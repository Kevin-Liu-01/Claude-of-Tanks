// src/world/maps/waysideKit.ts — the wayside monuments (props census #11, the looks lane, 2026-10-15), member by member:
//
//   bildstock      the Franconian and Hessian Bildstock (Steinburg's farm crossing, the Fulda farm lanes): a bedding
//                  slab, the Sockel with its framed and recessed inscription panel (gilt lettering worn), its cornice
//                  and wash, the octagonal shaft in two drums with its dated cartouche, the splayed capital, the niche
//                  house with a round-arched barrel-vaulted niche cut into it and the Madonna's painted relief inside,
//                  its archivolt on imposts, framed side panels, the cornice, the gabled saddle roof of two slabs over
//                  the gable mass and its ridge roll, the wrought-iron cross leaded into the ridge; red Buntsandstein
//                  with its damp foot, the black runs under the cornice and the grey-green lichen on every top;
//   waysidecross   the timber field cross of the Alpine and Rhineland lanes: a dressed stone footing, the oak upright
//                  wedged into it, the crossbar lapped on, zinc caps on the arms, the little roof (two boards under a
//                  zinc sheet with its standing seams, a ridge beam on struts, fretted bargeboards and a pendant), the
//                  painted corpus (head bowed, crown of thorns, the loincloth's knot, the feet crossed on the
//                  suppedaneum, the nails), the INRI titulus, a tin vase of flowers below;
//   orthodoxcross  the Russian poklonny krest: the hewn sill-cross in the turf with its four braces, the post, the
//                  titulus bar, the main bar and the slanted footrest (its viewer's-left end raised), the golubets roof
//                  with carved toothed bargeboards and a ball finial, the kiot with its icon at the crossing and the
//                  embroidered rushnyk hung over the arm;
//   tomb           the Mekong-delta family tomb in the rice fields (Mangrove Delta, eight): the two-step rendered
//                  platform, the pierced balustrades of turned balusters along the sides, the gate pillars at the
//                  foot and the head pillars beside the stele screen, each crowned with a lotus-bud finial, the grave's
//                  moulded base under its turtle-back mound, the stone altar with the incense bowl, the three-bay
//                  screen with the black granite stele in its recessed frame (gold characters), the wings' medallions,
//                  and the stele roofs: tiled slopes of cover-tile ribs, the ridges' upturned ends and the flaming
//                  pearl; painted stucco gone to mould and algae in the monsoons.
//
// Destroyed (the families before: the wells' and the monuments' own broken builds): a stone monument snaps above its
// plinth with a ragged stub (a fresh break's paler stone), its upper members thrown down round it; the timber crosses
// topple on their hinge as before (no broken state).
//
// The draw law (brokenDraws.ts): each pool builds from the shared destructible stream, so a build spends the legacy
// builder's draws exactly (below, kept for that only) and draws its own variety from no stream (hash noise). The
// registry entries keep their order, radii, heights and footprints (scenery.selftest); the collision refit follows the
// new geometry (a shard recapture). Origin at the base centre, +Y up, the face toward +Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DestructiblePropType } from './inhabitKit.ts';
import { Mesh, X, Y, Z, add, hexLin, member, mix, mul, norm, pole, scl, sub, type Rgb, type V3 } from './craftMesh.ts';
import {
  FLAT, G, dim, frustum, gbox, gridQuad, lathe, layDown, octagon, ownStream, plain, prismZ, raggedShaft, ring, weathered,
  type Faces, type Shade,
} from './waysideCraft.ts';

/** The scenery registry's entry type, its materials widened to the structure wood the timber crosses wear. */
export type SceneryDestructibleType = Omit<DestructiblePropType, 'mat'> & {
  mat: DestructiblePropType['mat'] | 'structureWood';
  /** The props pool's per-copy tint (props.ts tintDestructibleInstances): no two tombs of a row one tone. */
  instanceTintStrength?: number;
};

const ring8 = (v: number): number[] => Array(8).fill(v);
const quat = (axis: V3, angle: number): THREE.Quaternion => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...norm(axis)), angle);

// ------------------------------------------------------------------------------------------------------- the Bildstock

const BUNT = hexLin(0x965a47), BUNT_ROOF = hexLin(0x86553f), BUNT_BREAK = hexLin(0xc58d6c);
const GILT = hexLin(0xb08a3a), MARIAN = hexLin(0x46628a), ROBE_RED = hexLin(0x8a3a30), FLESH = hexLin(0xc8a185);
const LEAD = hexLin(0x5c5f63), WROUGHT = hexLin(0x2a2826), LICHEN_SAND = hexLin(0x9a9a7e);

const bildStone = (seed: number, k = 1): Shade => weathered({ base: mul(BUNT, k), seed, damp: 0.32, mottle: 0.13, mould: 0.38, lichen: 0.45, lichenCol: LICHEN_SAND });

/** A Bildstock's Sockel (to 0.69: the bedding slab, the panel, the cornice, the wash and the shaft's base block). */
function bildstockBase(m: Mesh, st: Shade): void {
  gbox(m, [-0.43, -0.12, -0.43], [0.43, 0.05, 0.43], weathered({ base: mul(BUNT, 0.82), seed: 0xb1, damp: 0.5, mottle: 0.16, lichen: 0.7, lichenCol: LICHEN_SAND }), 0.22, { ny: true });
  // the Sockel's core, its front recessed 2 cm inside a frame of rails and stiles: the inscription panel
  gbox(m, [-0.3, 0.05, -0.3], [0.3, 0.47, 0.28], st, 0.15, { ny: true });
  gbox(m, [-0.3, 0.39, 0.28], [0.3, 0.47, 0.302], st, 0.15, { ny: true, nz: true });
  gbox(m, [-0.3, 0.05, 0.28], [0.3, 0.13, 0.302], st, 0.15, { ny: true, nz: true });
  for (const s of [-1, 1]) gbox(m, [s > 0 ? 0.23 : -0.3, 0.13, 0.28], [s > 0 ? 0.3 : -0.23, 0.39, 0.302], st, 0.15, { ny: true, py: true, nz: true });
  // the lettering, gilt and mostly worn off: three lines of words and the date
  const lr = ownStream(0xb11e);
  for (const [y, w] of [[0.335, 0.36], [0.272, 0.4], [0.2, 0.2]] as const) {
    let x = -w / 2;
    while (x < w / 2 - 0.02) {
      const len = Math.min(w / 2 - x, 0.022 + lr() * 0.06);
      const worn = mix(GILT, BUNT, 0.15 + lr() * 0.55);
      gbox(m, [x, y, 0.28], [x + len, y + 0.026, 0.284], plain(worn), 1, { ny: true, nz: true });
      x += len + 0.016 + lr() * 0.01;
    }
  }
  // the cornice over a small cavetto, the wash up to the shaft's base block
  frustum(m, 0, -0.01, 0.47, 0.5, 0.6, 0.62, 0.68, 0.7, st, 'none');
  gbox(m, [-0.34, 0.5, -0.36], [0.34, 0.55, 0.34], st, 0.17, { ny: true });
  frustum(m, 0, 0, 0.55, 0.62, 0.62, 0.62, 0.36, 0.36, st, 'none');
  gbox(m, [-0.18, 0.62, -0.18], [0.18, 0.69, 0.18], st, 0.2, { ny: true });
}

const SHAFT = octagon(0.27, 0.07);

/** The shaft from y0 to y1 in drums (a joint at 1.31), its cartouche on the front with the gilt date. */
function bildstockShaft(m: Mesh, st: Shade, y0: number, y1: number, cartouche: boolean): void {
  const cuts = [y0, ...[0.98, 1.31, 1.64].filter((y) => y > y0 + 0.05 && y < y1 - 0.05), y1];
  for (let k = 0; k + 1 < cuts.length; k++) raggedShaft(m, SHAFT, ring8(cuts[k]), ring8(cuts[k + 1]), cuts[k], cuts[k + 1], st, null, null);
  if (!cartouche) return;
  // an octagonal tablet 1.5 cm proud on the front flat, the date in gilt
  const cy = 1.13, hw = 0.07, hh = 0.09, c = 0.03;
  prismZ(m, [[-hw + c, cy - hh], [hw - c, cy - hh], [hw, cy - hh + c], [hw, cy + hh - c], [hw - c, cy + hh], [-hw + c, cy + hh], [-hw, cy + hh - c], [-hw, cy - hh + c]],
    0.125, 0.15, st, 0, 'front');
  for (let d = 0; d < 4; d++) gbox(m, [-0.05 + d * 0.026, cy - 0.022, 0.15], [-0.05 + d * 0.026 + 0.017, cy + 0.022, 0.153], plain(mix(GILT, BUNT, 0.35)), 1, { ny: true, nz: true });
}

/**
 * The head from the capital up, its foot at y0: the splayed capital and abacus, the niche house with its vaulted niche
 * and the relief, the side panels, the cornice, the gabled roof and (when `cross`) the iron cross. Returns the ridge's
 * height. `roof`: 'both' slabs, or 'one' (the other knocked off).
 */
function bildstockHead(m: Mesh, st: Shade, y0: number, roof: 'both' | 'one', cross: boolean): number {
  const inner = dim(st, 0.6), lit = bildStone(0xb13, 1.04);
  frustum(m, 0, 0, y0, y0 + 0.09, 0.27, 0.27, 0.4, 0.4, st, 'none');
  gbox(m, [-0.22, y0 + 0.09, -0.22], [0.22, y0 + 0.15, 0.22], st, 0.2);
  const HB = y0 + 0.15, W = 0.25, D = 0.2, BACK = -0.07, JAMB = 0.16, R = 0.16, LINT = HB + 0.5, SPR = LINT - 0.18, HT = LINT + 0.08;
  // the sill with its lip, the back wall and the jambs (their faces in the niche in its shade), the lintel over the vault
  gbox(m, [-W, HB, -D], [W, HB + 0.08, D + 0.02], lit, 0.12);
  gbox(m, [-W, HB + 0.08, -D], [W, LINT, BACK], st, 0.12, { ny: true, py: true, pz: true });
  gridQuad(m, [-JAMB, HB + 0.08, BACK], [JAMB, HB + 0.08, BACK], [JAMB, LINT, BACK], [-JAMB, LINT, BACK], Z, inner, 0.08);
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? JAMB : -W, x1 = s > 0 ? W : -JAMB, wallSide: Faces = s > 0 ? { nx: true } : { px: true };
    gbox(m, [x0, HB + 0.08, BACK], [x1, LINT, D], st, 0.12, { ny: true, py: true, nz: true, ...wallSide });
    gridQuad(m, s > 0 ? [JAMB, HB + 0.08, D] : [-JAMB, HB + 0.08, BACK], s > 0 ? [JAMB, HB + 0.08, BACK] : [-JAMB, HB + 0.08, D],
      s > 0 ? [JAMB, LINT, BACK] : [-JAMB, LINT, D], s > 0 ? [JAMB, LINT, D] : [-JAMB, LINT, BACK], [-s, 0, 0], inner, 0.08);
    // the spandrel over each half of the round arch (from its apex down to the springing): the barrel vault's soffit in
    // the niche's shade, its face the facade's
    const arc: Array<[number, number]> = [];
    for (let k = 6; k >= 0; k--) { const a = (Math.PI / 2) * (k / 6); arc.push([s * Math.cos(a) * R, SPR + Math.sin(a) * R]); }
    const spandrel: Array<[number, number]> = [[s * JAMB, LINT], [0, LINT], ...arc];
    prismZ(m, spandrel, BACK, D, inner, 0, 'none');
    prismZ(m, spandrel, BACK, D, st, 0, 'front', FLAT, false);
    // the impost block the archivolt springs from
    gbox(m, [s > 0 ? JAMB : -JAMB - 0.045, SPR - 0.035, D], [s > 0 ? JAMB + 0.045 : -JAMB, SPR, D + 0.018], lit, 1, { nz: true });
    // a framed panel on the side face
    const fx = s * W;
    for (const [z0, z1, ya, yb] of [[-0.15, 0.15, LINT - 0.06, LINT - 0.035], [-0.15, 0.15, HB + 0.11, HB + 0.135], [-0.15, -0.125, HB + 0.135, LINT - 0.06], [0.125, 0.15, HB + 0.135, LINT - 0.06]] as const) {
      gbox(m, [s > 0 ? fx : fx - 0.012, ya, z0], [s > 0 ? fx + 0.012 : fx, yb, z1], lit, 1, wallSide);
    }
  }
  gbox(m, [-W, LINT, -D], [W, HT, D], st, 0.12, { ny: true });
  // the archivolt: a moulded ring round the arch, 1.8 cm proud of the face
  for (let k = 0; k < 8; k++) {
    const a0 = (Math.PI * k) / 8, a1 = (Math.PI * (k + 1)) / 8, r0 = R + 0.005, r1 = R + 0.04;
    prismZ(m, [[Math.cos(a0) * r0, SPR + Math.sin(a0) * r0], [Math.cos(a0) * r1, SPR + Math.sin(a0) * r1], [Math.cos(a1) * r1, SPR + Math.sin(a1) * r1], [Math.cos(a1) * r0, SPR + Math.sin(a1) * r0]],
      D, D + 0.018, lit, 0, 'front');
  }
  // the Madonna in the niche, painted relief on its back wall: the halo behind her head, the cloak, the red robe, the
  // veil, the face, the gilt crescent at her feet
  const z0 = BACK, fy = HB + 0.1;
  const halo: Array<[number, number]> = [];
  for (let k = 0; k < 12; k++) halo.push([Math.cos((k / 12) * Math.PI * 2) * 0.052, fy + 0.25 + Math.sin((k / 12) * Math.PI * 2) * 0.052]);
  prismZ(m, halo, z0, z0 + 0.008, plain(mix(GILT, BUNT, 0.3)), 0, 'front');
  prismZ(m, [[-0.072, fy], [0.072, fy], [0.046, fy + 0.2], [0.03, fy + 0.235], [-0.03, fy + 0.235], [-0.046, fy + 0.2]], z0, z0 + 0.03, plain(mix(MARIAN, BUNT, 0.3)), 0, 'front');
  prismZ(m, [[-0.026, fy + 0.02], [0.026, fy + 0.02], [0.02, fy + 0.19], [-0.02, fy + 0.19]], z0 + 0.03, z0 + 0.037, plain(mix(ROBE_RED, BUNT, 0.35)), 0, 'front');
  prismZ(m, [[-0.034, fy + 0.215], [0.034, fy + 0.215], [0.03, fy + 0.27], [0, fy + 0.29], [-0.03, fy + 0.27]], z0 + 0.008, z0 + 0.028, plain(mix(MARIAN, BUNT, 0.25)), 0, 'front');
  gbox(m, [-0.018, fy + 0.222, z0 + 0.012], [0.018, fy + 0.268, z0 + 0.034], plain(mix(FLESH, BUNT, 0.25)), 1, { nz: true });
  prismZ(m, [[-0.06, fy - 0.012], [0.06, fy - 0.012], [0.045, fy + 0.006], [-0.045, fy + 0.006]], z0, z0 + 0.03, plain(mix(GILT, BUNT, 0.4)), 0, 'front');
  // the cornice over its splay
  frustum(m, 0, 0, HT - 0.025, HT, 0.5, 0.4, 0.58, 0.48, st, 'none');
  gbox(m, [-0.29, HT, -0.24], [0.29, HT + 0.05, 0.24], lit, 0.15, { ny: true });
  // the gable mass and the two roof slabs (overhanging the cornice), the ridge roll
  const E = HT + 0.05, RIDGE = E + 0.17, run = 0.27, over = 0.07;
  prismZ(m, [[-run, E], [run, E], [0, RIDGE]], -0.235, 0.235, st, 0);
  const roofShade = weathered({ base: BUNT_ROOF, seed: 0xb14, damp: 0, mottle: 0.15, mould: 0.25, lichen: 0.85, lichenCol: LICHEN_SAND });
  const slope = norm([run, -(RIDGE - E), 0]), up = norm([RIDGE - E, run, 0]), t = 0.055;
  for (const s of roof === 'both' ? [-1, 1] : [1]) {
    const a: V3 = [s * up[0] * t / 2, RIDGE + up[1] * t / 2, 0];
    const b: V3 = add(a, [s * slope[0] * (run + over) / slope[0], slope[1] * (run + over) / slope[0], 0]);
    member(m, a, b, 0.6, t, Z, BUNT_ROOF, FLAT, { chamfer: 0.012, shade: roofShade });
  }
  pole(m, [0, RIDGE + 0.045, -0.31], [0, RIDGE + 0.045, 0.31], 0.032, 0.032, mul(BUNT_ROOF, 0.95), 0, 8);
  if (cross) {
    // the wrought-iron cross, leaded into the ridge: its ends trefoiled
    gbox(m, [-0.032, RIDGE + 0.06, -0.032], [0.032, RIDGE + 0.1, 0.032], plain(LEAD), 1);
    const c0 = RIDGE + 0.1;
    member(m, [0, c0, 0], [0, c0 + 0.21, 0], 0.024, 0.024, Z, WROUGHT, FLAT);
    member(m, [-0.08, c0 + 0.14, 0], [0.08, c0 + 0.14, 0], 0.024, 0.024, Y, WROUGHT, FLAT);
    for (const [x, y] of [[0, c0 + 0.215], [-0.085, c0 + 0.14], [0.085, c0 + 0.14]] as const) {
      lathe(m, [[0, -0.016], [0.012, -0.012], [0.016, 0], [0.012, 0.012], [0, 0.016]], 6, [x, y, 0], plain(WROUGHT));
    }
  }
  return RIDGE;
}

function buildBildstock(broken: boolean): THREE.BufferGeometry {
  const m = new Mesh({ kind: 'render' });
  const st = bildStone(0xb12);
  bildstockBase(m, st);
  if (!broken) {
    bildstockShaft(m, st, 0.69, 1.97, true);
    bildstockHead(m, st, 1.97, 'both', true);
    return m.geometry();
  }
  // snapped above the plinth: a ragged stub of the shaft stands; its upper drums lie where they fell, the head beyond
  // them on its side with one roof slab, the other slab and the bent iron cross on the ground, chips of the break
  const r = ownStream(0xb15), dir = 0.65, cx = Math.cos(dir), cz = Math.sin(dir);
  const top = SHAFT.map(() => 0.96 + r() * 0.16), fresh = weathered({ base: BUNT_BREAK, seed: 0xb16, damp: 0, mottle: 0.2 });
  raggedShaft(m, SHAFT, ring8(0.69), top, 0.69, 1.02, st, null, fresh);
  let from = m.mark;
  raggedShaft(m, SHAFT, top.map((y) => y - 0.96 + r() * 0.04), ring8(1.0), 0.08, 1.0, st, fresh, null);
  layDown(m, from, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(cx, -0.08, cz).normalize()), cx * 0.95, cz * 0.95, 0.03);
  from = m.mark;
  bildstockHead(m, st, 0, 'one', false);
  layDown(m, from, quat([-cz, 0, cx], 1.75).multiply(quat(Y, 0.4)), cx * 1.95 - cz * 0.15, cz * 1.95 + cx * 0.15, 0.04);
  from = m.mark;
  member(m, [-0.04, 0, 0], [0.34 + 0.04, -0.21, 0], 0.6, 0.055, Z, BUNT_ROOF, FLAT, { chamfer: 0.012, shade: weathered({ base: BUNT_ROOF, seed: 0xb17, damp: 0, lichen: 0.8, lichenCol: LICHEN_SAND }) });
  layDown(m, from, quat(Z, 0.5).multiply(quat(Y, 1.2)), cx * 1.2 + cz * 0.9, cz * 1.2 - cx * 0.9, 0.02);
  from = m.mark;
  member(m, [0, 0, 0], [0.05, 0.13, 0], 0.024, 0.024, Z, WROUGHT, FLAT);
  member(m, [0.05, 0.13, 0], [0.02, 0.24, 0.04], 0.024, 0.024, Z, WROUGHT, FLAT);
  member(m, [-0.05, 0.15, 0.01], [0.13, 0.12, -0.01], 0.024, 0.024, Y, WROUGHT, FLAT);
  layDown(m, from, quat(X, Math.PI / 2 - 0.1).multiply(quat(Y, 0.7)), cx * 2.5 + cz * 0.4, cz * 2.5 - cx * 0.4, 0.0);
  for (let k = 0; k < 7; k++) {
    from = m.mark;
    const s = 0.05 + r() * 0.09;
    gbox(m, [-s, -s * 0.6, -s * 0.8], [s, s * 0.6, s * 0.8], k % 2 ? fresh : st, 1);
    const a = dir + (r() - 0.5) * 2.4, d = 0.45 + r() * 1.4;
    layDown(m, from, quat([r() - 0.5, 1, r() - 0.5], r() * 6), Math.cos(a) * d, Math.sin(a) * d, s * 0.25);
  }
  return m.geometry();
}

// ---------------------------------------------------------------------------------------------- the timber crosses

const OAK_GREY = hexLin(0x7d7467), OAK_DARK = hexLin(0x5b5349), ZINC = hexLin(0x8b908d), FOOT_STONE = hexLin(0x968f84);
const CORPUS = hexLin(0xd3b69d), CLOTH_GILT = hexLin(0xd8cba0), HAIR = hexLin(0x3f3024), THORN = hexLin(0x50482f), NAIL = hexLin(0x262422);
const TITLE = hexLin(0xe3ddcf), INK = hexLin(0x1f1d1b), BLOOM_RED = hexLin(0xa8322a), BLOOM_GOLD = hexLin(0xc9a032), LEAF = hexLin(0x3f5a2e);
const LICHEN_WOOD = hexLin(0x8e937a);

/**
 * The carved corpus, its feet at (0, y, z) and its hands `span` either side at y + 0.86, facing +Z: legs crossed at the
 * feet, the knees forward, the loincloth's knot at the right hip, the arms up along the bar, the head bowed to the right
 * under the crown of thorns; the nails dark.
 */
function corpus(m: Mesh, y: number, z: number, span: number): void {
  const f = (p: V3): V3 => [p[0], y + p[1], z + p[2]];
  const flesh = CORPUS, cloth = CLOTH_GILT;
  const limb = (a: V3, b: V3, w: number, col: Rgb) => member(m, f(a), f(b), w, w, Z, col, FLAT, { chamfer: w * 0.3 });
  // the feet, crossed one over the other, and the nail through them
  limb([-0.012, 0.0, 0.01], [0.022, 0.07, 0.03], 0.04, flesh);
  limb([0.014, 0.0, 0.03], [-0.02, 0.07, 0.01], 0.04, flesh);
  gbox(m, f([-0.008, 0.035, 0.05]), f([0.008, 0.051, 0.058]), plain(NAIL), 1);
  // the shins and the thighs, the knees forward
  for (const s of [-1, 1]) {
    limb([s * 0.01, 0.06, 0.02], [s * 0.03, 0.26, 0.045], 0.05, flesh);
    limb([s * 0.03, 0.26, 0.045], [s * 0.042, 0.44, 0.0], 0.064, flesh);
  }
  // the loincloth and its knot, the torso widening to the chest, the neck
  frustum(m, 0, z + 0.002, y + 0.4, y + 0.5, 0.15, 0.085, 0.16, 0.08, plain(cloth), 'both');
  member(m, f([0.075, 0.48, 0.015]), f([0.1, 0.35, 0.03]), 0.055, 0.016, Z, mul(cloth, 0.95), FLAT);
  frustum(m, 0, z, y + 0.5, y + 0.73, 0.12, 0.068, 0.18, 0.08, plain(flesh), 'none');
  frustum(m, 0, z, y + 0.73, y + 0.76, 0.18, 0.08, 0.1, 0.06, plain(flesh), 'none');
  limb([0.005, 0.74, 0.0], [0.014, 0.79, 0.008], 0.042, flesh);
  // the arms up along the bar to the hands, the nails through the palms
  for (const s of [-1, 1]) {
    limb([s * 0.075, 0.725, 0.0], [s * 0.27, 0.8, -0.012], 0.044, flesh);
    limb([s * 0.27, 0.8, -0.012], [s * (span - 0.03), 0.86, -0.02], 0.038, flesh);
    gbox(m, f([s * (span - 0.03) - 0.025, 0.835, -0.035]), f([s * (span - 0.03) + 0.025, 0.885, -0.012]), plain(flesh), 1);
    gbox(m, f([s * (span - 0.03) - 0.008, 0.852, -0.012]), f([s * (span - 0.03) + 0.008, 0.868, -0.004]), plain(NAIL), 1);
  }
  // the head bowed to its right, the hair and beard, the crown of thorns
  member(m, f([0.012, 0.775, 0.012]), f([0.04, 0.865, 0.03]), 0.07, 0.08, X, flesh, FLAT, { chamfer: 0.022 });
  member(m, f([0.006, 0.79, -0.012]), f([0.034, 0.875, 0.004]), 0.078, 0.06, X, HAIR, FLAT, { chamfer: 0.02 });
  ring(m, f([0.034, 0.858, 0.018]), 0.046, 7, 0.012, THORN, FLAT, 0.25);
}

function buildWaysideCross(): THREE.BufferGeometry {
  const m = new Mesh({ kind: 'wood' });
  const oak = weathered({ base: OAK_GREY, seed: 0x7c01, damp: 0.4, mottle: 0.07, lichen: 0.3, lichenCol: LICHEN_WOOD });
  const oakDark = weathered({ base: OAK_DARK, seed: 0x7c02, damp: 0.3, mottle: 0.08 });
  const stone = weathered({ base: FOOT_STONE, seed: 0x7c03, damp: 0.45, mottle: 0.14, lichen: 0.6, lichenCol: LICHEN_WOOD });
  // the footing: a dressed stone with its washed top, the upright wedged into its mortise
  member(m, [0, -0.16, 0], [0, 0.26, 0], 0.46, 0.44, X, FOOT_STONE, FLAT, { chamfer: 0.03, shade: stone });
  frustum(m, 0, 0, 0.26, 0.3, 0.46, 0.44, 0.3, 0.28, stone, 'top');
  for (const s of [-1, 1]) member(m, [s * 0.092, 0.27, 0], [s * 0.088, 0.345, 0], 0.03, 0.11, Z, OAK_DARK, G(0.7), { shade: oakDark });
  // the upright and the crossbar lapped on, zinc caps over the arms' end grain
  member(m, [0, 0.26, 0], [0, 3.42, 0], 0.15, 0.13, X, OAK_GREY, G(0.15), { chamfer: 0.018, shade: oak });
  const BY = 2.56;
  member(m, [-0.6, BY, 0.012], [0.6, BY, 0.012], 0.13, 0.11, Y, OAK_GREY, G(0.45), { chamfer: 0.016, shade: oak });
  for (const s of [-1, 1]) member(m, [s * 0.595, BY, 0.012], [s * 0.665, BY, 0.012], 0.145, 0.125, Y, ZINC, FLAT, { chamfer: 0.01 });
  // the roof: a ridge beam on the upright, two struts, two boards under a zinc sheet with its standing seams, the
  // fretted bargeboards front and back with the pendant at the front's apex, the ridge's zinc capping
  const RY = 3.5, half = 0.31, drop = 0.235, z0 = -0.16, z1 = 0.36, zc = (z0 + z1) / 2, zl = z1 - z0;
  const slope = norm([half, -drop, 0]), nUp = norm([drop, half, 0]);
  member(m, [0, 3.405, z0], [0, 3.405, z1], 0.07, 0.07, X, OAK_DARK, G(0.3), { chamfer: 0.012, shade: oakDark });
  for (const s of [-1, 1]) member(m, [s * 0.07, 3.17, 0], [s * 0.18, 3.36, 0], 0.045, 0.045, Z, OAK_DARK, G(0.55), { chamfer: 0.008, shade: oakDark });
  for (const s of [-1, 1]) {
    const sl: V3 = [s * slope[0], slope[1], 0], up: V3 = [s * nUp[0], nUp[1], 0];
    const a: V3 = add([0, RY, zc], scl(up, -0.0125)), b = add(a, scl(sl, 0.39));
    member(m, a, b, zl, 0.025, Z, OAK_DARK, G(0.2 + s * 0.05), { shade: oakDark });
    const sa = add(a, scl(up, 0.016)), sb = add(sa, scl(sl, 0.4));
    member(m, sa, sb, zl + 0.03, 0.006, Z, ZINC, FLAT);
    for (const zz of [-0.07, 0.1, 0.27]) member(m, add(add(sa, scl(up, 0.012)), [0, 0, zz - zc]), add(add(sb, scl(up, 0.012)), [0, 0, zz - zc]), 0.018, 0.01, up, mul(ZINC, 0.9), FLAT);
    for (const zb of [z1 + 0.012, z0 - 0.012]) {
      const ba = add([0, RY - 0.04, zb], [0, 0, 0]), bb = add(ba, scl(sl, 0.38));
      member(m, ba, bb, 0.07, 0.022, norm([s * nUp[0], nUp[1], 0]), OAK_GREY, G(0.6), { shade: oak });
      // the fret: teeth hung under the board
      if (zb > 0) {
        for (let k = 0; k < 4; k++) {
          const t0 = 0.05 + k * 0.08, p0 = add(ba, scl(sl, t0)), p1 = add(ba, scl(sl, t0 + 0.05)), pm = add(ba, scl(sl, t0 + 0.025));
          const lo = -0.035 / nUp[1];
          prismZ(m, [[p0[0], p0[1] + lo], [p1[0], p1[1] + lo], [pm[0], pm[1] + lo - 0.04]], zb - 0.011, zb + 0.011, oak, 0);
        }
      }
    }
  }
  member(m, [0, RY + 0.012, z0 - 0.02], [0, RY + 0.012, z1 + 0.02], 0.05, 0.05, norm([1, 1, 0]), mul(ZINC, 0.95), FLAT);
  lathe(m, [[0, -0.12], [0.012, -0.11], [0.022, -0.075], [0.018, -0.04], [0.012, 0]], 6, [0, RY - 0.05, z1 + 0.012], oakDark);
  // the corpus, the suppedaneum under its feet, the titulus
  member(m, [0, 1.66, 0.085], [0, 1.72, 0.085], 0.1, 0.045, X, OAK_GREY, G(0.8), { chamfer: 0.008, shade: oak });
  corpus(m, 1.72, 0.105, 0.6);
  member(m, [0, 2.93, 0.074], [0, 3.03, 0.074], 0.22, 0.018, X, TITLE, FLAT);
  for (let k = 0; k < 4; k++) gbox(m, [-0.075 + k * 0.042, 2.955, 0.083], [-0.075 + k * 0.042 + (k === 1 ? 0.008 : 0.024), 3.005, 0.086], plain(INK), 1, { nz: true });
  // a tin vase on its bracket below, a bunch of field flowers in it
  member(m, [0, 1.25, 0.065], [0, 1.25, 0.15], 0.02, 0.012, Y, NAIL, FLAT);
  lathe(m, [[0, 0], [0.032, 0], [0.036, 0.04], [0.03, 0.09], [0.036, 0.12]], 7, [0, 1.256, 0.15], plain(ZINC));
  const fr = ownStream(0x7c05);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, rr = 0.025 + fr() * 0.02, h = 1.42 + fr() * 0.07;
    const tip: V3 = [Math.cos(a) * rr * 1.6, h, 0.15 + Math.sin(a) * rr * 1.6];
    member(m, [0, 1.36, 0.15], tip, 0.006, 0.006, Z, LEAF, FLAT);
    lathe(m, [[0, -0.018], [0.016, -0.008], [0.018, 0.004], [0, 0.016]], 5, tip, plain(k % 3 ? BLOOM_RED : BLOOM_GOLD));
  }
  return m.geometry();
}

const LARCH = hexLin(0x857d71), LARCH_DARK = hexLin(0x5e574d), RUSHNYK = hexLin(0xe6e1d6), RUSH_RED = hexLin(0xa3302a);
const ICON_GOLD = hexLin(0xb38d42), ICON_DARK = hexLin(0x3a2c25), KIOT_BLUE = hexLin(0x41566e);

function buildOrthodoxCross(): THREE.BufferGeometry {
  const m = new Mesh({ kind: 'wood' });
  const larch = weathered({ base: LARCH, seed: 0x0c01, damp: 0.42, mottle: 0.07, lichen: 0.32, lichenCol: LICHEN_WOOD });
  const dark = weathered({ base: LARCH_DARK, seed: 0x0c02, damp: 0.4, mottle: 0.08, lichen: 0.5, lichenCol: LICHEN_WOOD });
  // the hewn sill-cross half-lapped in the turf, a brace from each arm up to the post
  member(m, [-0.46, 0.035, 0], [0.46, 0.035, 0], 0.13, 0.15, Y, LARCH_DARK, G(0.2), { chamfer: 0.02, shade: dark });
  member(m, [0, 0.065, -0.46], [0, 0.065, 0.46], 0.13, 0.15, Y, LARCH_DARK, G(0.35), { chamfer: 0.02, shade: dark });
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    member(m, [dx * 0.4, dz ? 0.15 : 0.1, dz * 0.4], [dx * 0.075, 0.74, dz * 0.07], 0.065, 0.065, dx ? Z : X, LARCH_DARK, G(0.5), { chamfer: 0.01, shade: dark });
  }
  // the post, the titulus bar, the main bar and the slanted footrest (raised at the viewer's left)
  member(m, [0, -0.06, 0], [0, 3.33, 0], 0.16, 0.14, X, LARCH, G(0.1), { chamfer: 0.02, shade: larch });
  member(m, [-0.28, 2.98, 0.012], [0.28, 2.98, 0.012], 0.11, 0.11, Y, LARCH, G(0.6), { chamfer: 0.016, shade: larch });
  member(m, [-0.65, 2.58, 0.012], [0.65, 2.58, 0.012], 0.13, 0.12, Y, LARCH, G(0.4), { chamfer: 0.018, shade: larch });
  const sl = Math.tan(0.38) * 0.4;
  member(m, [-0.4, 1.32 + sl, 0.012], [0.4, 1.32 - sl, 0.012], 0.11, 0.11, norm([Math.sin(0.38), Math.cos(0.38), 0]), LARCH, G(0.7), { chamfer: 0.016, shade: larch });
  // the golubets: two boards pitched over the head, the carved bargeboards with their teeth, the ball finial
  const RY = 3.44, half = 0.31, drop = 0.2, z0 = -0.17, z1 = 0.17;
  const slope = norm([half, -drop, 0]), nUp = norm([drop, half, 0]);
  for (const s of [-1, 1]) {
    const sl2: V3 = [s * slope[0], slope[1], 0], up: V3 = [s * nUp[0], nUp[1], 0];
    const a: V3 = add([0, RY, 0], scl(up, -0.0125));
    member(m, a, add(a, scl(sl2, 0.38)), z1 - z0, 0.025, Z, LARCH_DARK, G(0.25 + s * 0.05), { shade: dark });
    for (const zb of [z1 + 0.011, z0 - 0.011]) {
      const ba: V3 = [0, RY - 0.035, zb], bb = add(ba, scl(sl2, 0.37));
      member(m, ba, bb, 0.065, 0.02, up, LARCH, G(0.65), { shade: larch });
      const lo = -0.0325 / nUp[1];
      for (let k = 0; k < 5; k++) {
        const t0 = 0.04 + k * 0.065, p0 = add(ba, scl(sl2, t0)), p1 = add(ba, scl(sl2, t0 + 0.045)), pm = add(ba, scl(sl2, t0 + 0.0225));
        prismZ(m, [[p0[0], p0[1] + lo], [p1[0], p1[1] + lo], [pm[0], pm[1] + lo - 0.038]], zb - 0.01, zb + 0.01, larch, 0);
      }
    }
  }
  member(m, [0, RY + 0.01, z0 - 0.03], [0, RY + 0.01, z1 + 0.03], 0.05, 0.05, norm([1, 1, 0]), LARCH_DARK, G(0.9), { shade: dark });
  lathe(m, [[0.012, 0], [0.012, 0.04], [0.04, 0.07], [0.045, 0.1], [0.032, 0.13], [0.006, 0.16], [0, 0.17]], 8, [0, RY + 0.025, 0], dark);
  // the kiot at the crossing's foot: a little cased icon under its hood, its frame open on the gold
  const ky0 = 2.22, ky1 = 2.44, kz = 0.07;
  gbox(m, [-0.085, ky0, kz], [0.085, ky1, kz + 0.014], plain(KIOT_BLUE), 1, { nz: true });
  for (const s of [-1, 1]) gbox(m, [s > 0 ? 0.072 : -0.085, ky0, kz + 0.014], [s > 0 ? 0.085 : -0.072, ky1, kz + 0.06], plain(KIOT_BLUE), 1, { nz: true });
  gbox(m, [-0.085, ky0 - 0.012, kz], [0.085, ky0, kz + 0.066], plain(mul(KIOT_BLUE, 0.9)), 1);
  gbox(m, [-0.072, ky0 + 0.02, kz + 0.014], [0.072, ky1 - 0.02, kz + 0.018], plain(ICON_GOLD), 1, { nz: true });
  prismZ(m, [[-0.035, ky0 + 0.03], [0.035, ky0 + 0.03], [0.022, ky0 + 0.14], [-0.022, ky0 + 0.14]], kz + 0.018, kz + 0.022, plain(ICON_DARK), 0, 'front');
  gbox(m, [-0.015, ky0 + 0.142, kz + 0.018], [0.015, ky0 + 0.172, kz + 0.022], plain(mul(CORPUS, 0.8)), 1, { nz: true });
  for (const [x0, x1, y0, y1] of [[-0.072, 0.072, ky1 - 0.02, ky1], [-0.072, 0.072, ky0, ky0 + 0.02]] as const) {
    gbox(m, [x0, y0, kz + 0.05], [x1, y1, kz + 0.062], plain(KIOT_BLUE), 1, { nz: true });
  }
  prismZ(m, [[-0.1, ky1], [0.1, ky1], [0, ky1 + 0.06]], kz - 0.002, kz + 0.075, plain(mul(KIOT_BLUE, 0.85)), 0);
  // the rushnyk hung over the left arm: its two falls front and back, its red-worked ends
  const rx = -0.46;
  gbox(m, [rx - 0.08, 2.645, -0.06], [rx + 0.08, 2.657, 0.085], plain(RUSHNYK), 1);
  member(m, [rx, 2.65, 0.08], [rx - 0.01, 2.0, 0.095], 0.16, 0.01, X, RUSHNYK, FLAT);
  member(m, [rx, 2.65, -0.055], [rx + 0.015, 2.08, -0.075], 0.16, 0.01, X, RUSHNYK, FLAT);
  for (const [y0, y1] of [[2.04, 2.1], [2.13, 2.15]] as const) {
    const f0 = (2.65 - y1) / 0.65, f1 = (2.65 - y0) / 0.65;
    member(m, [rx - 0.01 * f0, y1, 0.08 + 0.015 * f0 + 0.006], [rx - 0.01 * f1, y0, 0.08 + 0.015 * f1 + 0.006], 0.162, 0.004, X, RUSH_RED, FLAT);
  }
  return m.geometry();
}

// ---------------------------------------------------------------------------------------------- the Mekong tomb

const TOMB_OCHRE = hexLin(0xd5c38e), TOMB_TRIM = hexLin(0xdedad0), TOMB_BLUE = hexLin(0x86a9b2), GRANITE_BLACK = hexLin(0x2a2c2f);
const TOMB_GOLD = hexLin(0xc79f45), TILE_GREEN = hexLin(0x4c7356), LOTUS_PINK = hexLin(0xd7a8a0), LOTUS_LEAF = hexLin(0x6f8f5a);
const DECK_GREY = hexLin(0x9a968b), INCENSE_RED = hexLin(0x9b3a2a), MOSS_DARK = hexLin(0x3a4630);

const tombWash = (base: Rgb, seed: number, mould = 0.45): Shade => weathered({ base, seed, foot: 0, damp: 0.3, mottle: 0.12, mould, algae: 0.55, lichen: 0.25, lichenCol: MOSS_DARK });

/** A lotus bud finial on a cap at (x, y, z): its leaf collar, the bud swelling and pointed, painted. */
function lotus(m: Mesh, x: number, y: number, z: number, k = 1): void {
  lathe(m, [[0, 0], [0.085 * k, 0], [0.095 * k, 0.025 * k], [0.06 * k, 0.045 * k]], 6, [x, y, z], plain(LOTUS_LEAF));
  lathe(m, [[0.06 * k, 0.045 * k], [0.085 * k, 0.09 * k], [0.095 * k, 0.15 * k], [0.08 * k, 0.21 * k], [0.045 * k, 0.26 * k], [0, 0.31 * k]], 6, [x, y, z], plain(LOTUS_PINK));
}

/** A rendered square pillar from y0 to y1 at (x, z), its moulded cap and the lotus on it. */
function tombPillar(m: Mesh, x: number, z: number, y0: number, y1: number, w: number, sh: Shade, trim: Shade, k = 1): void {
  gbox(m, [x - w / 2 - 0.02, y0, z - w / 2 - 0.02], [x + w / 2 + 0.02, y0 + 0.1, z + w / 2 + 0.02], trim, 1, { ny: true });
  gbox(m, [x - w / 2, y0 + 0.1, z - w / 2], [x + w / 2, y1, z + w / 2], sh, 0.35, { ny: true, py: true });
  frustum(m, x, z, y1, y1 + 0.03, w, w, w + 0.07, w + 0.07, trim, 'none');
  gbox(m, [x - w / 2 - 0.035, y1 + 0.03, z - w / 2 - 0.035], [x + w / 2 + 0.035, y1 + 0.075, z + w / 2 + 0.035], trim, 1, { ny: true });
  lotus(m, x, y1 + 0.075, z, k);
}

/**
 * A tiled roof over a bay, its ridge along X from -hw to hw at (zc, ridgeY), its eaves `run` out front and back at
 * eaveY: the slopes, the cover-tile ribs, the ridge with its upturned ends, the eaves' corners lifted.
 */
function tileRoof(m: Mesh, xa: number, xb: number, zc: number, run: number, eaveY: number, ridgeY: number, tiles: Shade, endsUp: 'both' | 'outer-a' | 'outer-b'): void {
  const t = 0.05;
  for (const s of [-1, 1]) {
    const sl = norm([0, eaveY - ridgeY, s * run]), up = norm([0, run, s * (ridgeY - eaveY)]);
    const a: V3 = add([(xa + xb) / 2, ridgeY, zc], scl(up, -t / 2)), len = Math.hypot(run, ridgeY - eaveY) + 0.02;
    member(m, a, add(a, scl(sl, len)), xb - xa, t, X, TILE_GREEN, FLAT, { shade: tiles });
    for (let x = xa + 0.06; x < xb - 0.03; x += 0.12) {
      const ra = add(add(a, scl(up, t / 2 + 0.01)), [x - (xa + xb) / 2, 0, 0]);
      member(m, ra, add(ra, scl(sl, len - 0.01)), 0.024, 0.036, up, mul(TILE_GREEN, 0.85), FLAT, { skipEnds: true, shade: dim(tiles, 0.85) });
    }
    for (const [x, o] of [[xa, -1], [xb, 1]] as const) {
      if ((endsUp === 'outer-a' && o > 0) || (endsUp === 'outer-b' && o < 0)) continue;
      const e: V3 = [x, eaveY - 0.01, zc + s * (run + 0.02)];
      member(m, e, add(e, [o * 0.08, 0.075, s * 0.05]), 0.05, 0.03, Y, mul(TILE_GREEN, 0.95), FLAT, { shade: tiles });
    }
  }
  member(m, [xa - 0.02, ridgeY + 0.035, zc], [xb + 0.02, ridgeY + 0.035, zc], 0.07, 0.075, Y, TOMB_TRIM, FLAT, { chamfer: 0.012, shade: dim(tiles, 1.1) });
  for (const [x, o] of [[xa, -1], [xb, 1]] as const) {
    if ((endsUp === 'outer-a' && o > 0) || (endsUp === 'outer-b' && o < 0)) continue;
    member(m, [x, ridgeY + 0.035, zc], [x + o * 0.1, ridgeY + 0.15, zc], 0.06, 0.06, Z, TOMB_TRIM, FLAT, { chamfer: 0.012 });
    member(m, [x + o * 0.1, ridgeY + 0.15, zc], [x + o * 0.07, ridgeY + 0.21, zc], 0.045, 0.045, Z, TOMB_TRIM, FLAT, { chamfer: 0.01 });
  }
}

/** The turtle-back mound: a half-ellipse section along Z, its ends domed in, smooth. */
function mound(m: Mesh, za: number, zb: number, rx: number, ry: number, y0: number, sh: Shade): void {
  const nu = 10, nv = 6, L = zb - za, taper = Math.min(0.42, L / 3);
  const P = (i: number, j: number): V3 => {
    const z = za + (L * i) / nu, e = Math.min(z - za, zb - z) / taper;
    const k = e >= 1 ? 1 : Math.sqrt(Math.max(0, 1 - (1 - e) * (1 - e)));
    const a = (Math.PI * j) / nv;
    return [Math.cos(a) * rx * k, y0 + Math.sin(a) * ry * k, z];
  };
  const N = (p: V3): V3 => {
    const zc = Math.min(zb - taper, Math.max(za + taper, p[2]));
    return norm([p[0] / (rx * rx), (p[1] - y0) / (ry * ry), (p[2] - zc) / (taper * taper)]);
  };
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    for (const [p, q, r] of [[a, b, c], [a, c, d]] as const) {
      const g = norm(scl(add(add(N(p), N(q)), N(r)), 1 / 3));
      const area = Math.hypot(...sub(q, p)) * Math.hypot(...sub(r, p));
      if (area < 1e-9) continue;
      const col = m.colour(sh(scl(add(add(p, q), r), 1 / 3), g), false);
      const w = add(sub(q, p), [0, 0, 0]);
      const nrm = norm([w[1] * (r[2] - p[2]) - w[2] * (r[1] - p[1]), w[2] * (r[0] - p[0]) - w[0] * (r[2] - p[2]), w[0] * (r[1] - p[1]) - w[1] * (r[0] - p[0])]);
      const flat = m.surface.flatUv ?? [0.5, 0.5];
      if (nrm[0] * g[0] + nrm[1] * g[1] + nrm[2] * g[2] >= 0) m.tri(p, q, r, N(p), N(q), N(r), flat, flat, flat, col);
      else m.tri(p, r, q, N(p), N(r), N(q), flat, flat, flat, col);
    }
  }
}

/** A turned baluster from y0 to y1 at (x, z). */
function baluster(m: Mesh, x: number, z: number, y0: number, y1: number, sh: Shade): void {
  const h = y1 - y0;
  lathe(m, [[0, 0], [0.042, 0], [0.028, 0.22 * h], [0.05, 0.55 * h], [0.034, h], [0, h]], 5, [x, y0, z], sh);
}

const SCREEN_Z0 = -1.5, SCREEN_Z1 = -1.26;

function buildTomb(broken: boolean): THREE.BufferGeometry {
  const m = new Mesh({ kind: 'render' });
  const deck = tombWash(DECK_GREY, 0x70b1, 0.2), wall = tombWash(TOMB_OCHRE, 0x70b2), trim = tombWash(TOMB_TRIM, 0x70b3, 0.5);
  const blue = tombWash(TOMB_BLUE, 0x70b4, 0.4), tiles = weathered({ base: TILE_GREEN, seed: 0x70b5, damp: 0, mottle: 0.16, mould: 0.3, lichen: 0.5, lichenCol: MOSS_DARK });
  const r = ownStream(0x70b6);
  // the platform: its lower step and its deck under a moulded edge
  gbox(m, [-1.3, -0.15, -1.7], [1.3, 0.12, 1.7], deck, 0.6, { ny: true });
  gbox(m, [-1.18, 0.12, -1.58], [1.18, 0.24, 1.58], deck, 0.6, { ny: true, py: true });
  gbox(m, [-1.21, 0.24, -1.61], [1.21, 0.28, 1.61], trim, 0.6, { ny: true });
  // the grave: its moulded base, the mound, the altar before the stele with the incense bowl and its sticks
  gbox(m, [-0.62, 0.28, -1.0], [0.62, 0.48, 1.0], wall, 0.45, { ny: true, py: true });
  gbox(m, [-0.66, 0.48, -1.04], [0.66, 0.52, 1.04], trim, 1, { ny: true });
  mound(m, -0.62, 0.9, 0.5, 0.4, 0.52, blue);
  gbox(m, [-0.2, 0.52, -0.98], [0.2, 0.74, -0.8], trim, 0.1, { ny: true, py: true });
  gbox(m, [-0.24, 0.74, -1.02], [0.24, 0.78, -0.76], trim, 0.12, { ny: true });
  // the side balustrades between the head pillars and the gate pillars: a rail, turned balusters, the coping rail
  for (const s of [-1, 1]) {
    const x = s * 1.1, za = -1.24, zb = 1.3;
    gbox(m, [x - 0.07, 0.28, za], [x + 0.07, 0.36, zb], trim, 1, { ny: true });
    const n = 6;
    for (let k = 0; k < n; k++) {
      const z = za + ((k + 0.5) * (zb - za)) / n;
      if (broken && r() < 0.45) continue;
      baluster(m, x, z, 0.36, 0.62, trim);
    }
    if (!broken) gbox(m, [x - 0.085, 0.62, za], [x + 0.085, 0.68, zb], trim, 1);
  }
  // the gate pillars at the foot, the head pillars beside the screen, each with its lotus
  for (const s of [-1, 1]) {
    if (!broken || s < 0) tombPillar(m, s * 1.1, 1.42, 0.28, 1.0, 0.22, blue, trim, 0.85);
    else {
      gbox(m, [s * 1.1 - 0.13, 0.28, 1.29], [s * 1.1 + 0.13, 0.38, 1.55], trim, 0.15, { ny: true });
      raggedShaft(m, [[0.11, -0.11], [0.11, 0], [0.11, 0.11], [0, 0.11], [-0.11, 0.11], [-0.11, 0], [-0.11, -0.11], [0, -0.11]],
        ring8(0.38), ring8(0).map(() => 0.62 + r() * 0.14), 0.38, 0.7, blue, null, plain(mul(TOMB_TRIM, 0.9)), [s * 1.1, 1.42]);
    }
  }
  // the screen: three bays, the stele's in a recessed frame, the wings with their medallions and copings
  const top = broken ? 0.9 : 1.62, wingTop = broken ? 0.72 : 1.18;
  gbox(m, [-0.42, 0.28, SCREEN_Z0], [0.42, top, SCREEN_Z1 - 0.03], wall, 0.2, { ny: true, ...(broken ? { py: true } : {}) });
  for (const s of [-1, 1]) {
    gbox(m, [s > 0 ? 0.3 : -0.42, 0.28, SCREEN_Z1 - 0.03], [s > 0 ? 0.42 : -0.3, top, SCREEN_Z1], blue, 0.4, { ny: true, nz: true, ...(broken ? { py: true } : {}) });
    gbox(m, [s > 0 ? 0.42 : -1.02, 0.28, SCREEN_Z0 + 0.02], [s > 0 ? 1.02 : -0.42, wingTop, SCREEN_Z1], wall, 0.2, { ny: true, ...(broken ? { py: true } : {}) });
  }
  gbox(m, [-0.3, 0.28, SCREEN_Z1 - 0.03], [0.3, 0.55, SCREEN_Z1], blue, 0.3, { ny: true, nz: true });
  if (!broken) gbox(m, [-0.3, 1.4, SCREEN_Z1 - 0.03], [0.3, top, SCREEN_Z1], blue, 0.3, { nz: true });
  // the stele: black granite proud of the recess, three columns of gold characters
  const steleTop = broken ? 0.88 : 1.34;
  gbox(m, [-0.24, 0.6, SCREEN_Z1 - 0.03], [0.24, steleTop, SCREEN_Z1 - 0.012], plain(GRANITE_BLACK), 1, { nz: true });
  for (const cx of [-0.12, 0, 0.12]) {
    for (let k = 0; k < 5; k++) {
      const y = 1.24 - k * 0.13;
      if (y + 0.05 > steleTop) continue;
      gbox(m, [cx - 0.03, y, SCREEN_Z1 - 0.012], [cx + 0.03, y + 0.055, SCREEN_Z1 - 0.009], plain(mix(TOMB_GOLD, GRANITE_BLACK, r() * 0.3)), 1, { nz: true });
    }
  }
  for (const s of [-1, 1]) {
    const mx = s * 0.72, my = broken ? 0.52 : 0.78;
    const disc: Array<[number, number]> = [];
    for (let k = 0; k < 10; k++) disc.push([mx + Math.cos((k / 10) * Math.PI * 2) * 0.14, my + Math.sin((k / 10) * Math.PI * 2) * 0.14]);
    prismZ(m, disc, SCREEN_Z1, SCREEN_Z1 + 0.016, trim, 0, 'front');
    const inner = disc.map(([x, y]) => [mx + (x - mx) * 0.6, my + (y - my) * 0.6] as [number, number]);
    prismZ(m, inner, SCREEN_Z1 + 0.016, SCREEN_Z1 + 0.026, blue, 0, 'front');
    if (!broken) gbox(m, [s > 0 ? 0.4 : -1.06, wingTop, SCREEN_Z0 - 0.02], [s > 0 ? 1.06 : -0.4, wingTop + 0.06, SCREEN_Z1 + 0.04], trim, 0.5);
  }
  if (!broken) gbox(m, [-0.46, top, SCREEN_Z0 - 0.02], [0.46, top + 0.05, SCREEN_Z1 + 0.04], trim, 0.5);
  // the stele roofs: the centre's high over its pearl, the wings' lower, every ridge's end upturned
  const zc = (SCREEN_Z0 + SCREEN_Z1) / 2;
  if (!broken) {
    tileRoof(m, -0.56, 0.56, zc, 0.29, top + 0.07, top + 0.29, tiles, 'both');
    lathe(m, [[0, 0], [0.03, 0], [0.032, 0.02], [0.02, 0.035]], 8, [0, top + 0.36, zc], plain(TOMB_TRIM));
    lathe(m, [[0, -0.06], [0.04, -0.045], [0.06, 0], [0.04, 0.045], [0, 0.06]], 10, [0, top + 0.45, zc], plain(TOMB_GOLD));
    prismZ(m, [[-0.025, top + 0.5], [0.025, top + 0.5], [0, top + 0.6]], zc - 0.01, zc + 0.01, plain(mix(TOMB_GOLD, INCENSE_RED, 0.4)), 0);
    tileRoof(m, -1.04, -0.42, zc, 0.24, wingTop + 0.1, wingTop + 0.26, tiles, 'outer-a');
    tileRoof(m, 0.42, 1.04, zc, 0.24, wingTop + 0.1, wingTop + 0.26, tiles, 'outer-b');
    for (const s of [-1, 1]) tombPillar(m, s * 1.12, -1.38, 0.28, 1.45, 0.24, blue, trim, 1);
    // the incense bowl on the altar, its sticks burnt down
    lathe(m, [[0, 0], [0.06, 0], [0.08, 0.03], [0.1, 0.08], [0.09, 0.1], [0, 0.1]], 8, [0, 0.78, -0.89], plain(mix(TOMB_GOLD, DECK_GREY, 0.4)));
    for (let k = 0; k < 3; k++) member(m, [-0.03 + k * 0.03, 0.86, -0.89 + (k % 2) * 0.02], [-0.045 + k * 0.022, 0.97 + r() * 0.05, -0.9 + (k % 2) * 0.025], 0.006, 0.006, Z, INCENSE_RED, FLAT);
    return m.geometry();
  }
  // broken: the screen snapped above its foot, ragged; the stele's top and its roof thrown down behind the tomb; the head
  // pillars snapped, their tops and lotuses on the ground; the altar over, the coping rails down in lengths; the chips
  const fresh = weathered({ base: hexLin(0xbdb4a2), seed: 0x70b7, damp: 0, mottle: 0.2 });
  const edge: Array<[number, number]> = [];
  for (let k = 0; k <= 8; k++) edge.push([-1.0 + (2.0 * k) / 8, 0]);
  const sec: Array<[number, number]> = [...edge.map(([x]) => [x, SCREEN_Z1 + 0.001] as [number, number]), ...edge.slice().reverse().map(([x]) => [x, SCREEN_Z0 + 0.021] as [number, number])];
  const ragTop = sec.map(([x]) => (Math.abs(x) < 0.42 ? top : wingTop) + 0.02 + r() * 0.12);
  raggedShaft(m, sec, sec.map(([x]) => (Math.abs(x) < 0.42 ? top : wingTop) - 0.01), ragTop, top, top + 0.06, wall, null, fresh, [0, 0]);
  let from = m.mark;
  gbox(m, [-0.42, 0, -0.12], [0.42, 0.7, 0.12], wall, 0.12);
  gbox(m, [-0.46, 0.7, -0.14], [0.46, 0.75, 0.14], trim, 0.15);
  tileRoof(m, -0.56, 0.56, 0, 0.29, 0.82, 1.04, tiles, 'both');
  layDown(m, from, quat(X, -1.35).multiply(quat(Y, 0.25)), 0.15, -2.35, 0.05);
  for (const s of [-1, 1]) {
    const x = s * 1.12;
    gbox(m, [x - 0.14, 0.28, -1.52], [x + 0.14, 0.38, -1.24], trim, 0.15, { ny: true });
    raggedShaft(m, [[0.12, -0.12], [0.12, 0], [0.12, 0.12], [0, 0.12], [-0.12, 0.12], [-0.12, 0], [-0.12, -0.12], [0, -0.12]],
      ring8(0.38), ring8(0).map(() => 0.74 + r() * 0.16), 0.38, 0.82, blue, null, fresh, [x, -1.38]);
    from = m.mark;
    gbox(m, [-0.12, 0, -0.12], [0.12, 0.62, 0.12], blue, 0.12);
    gbox(m, [-0.155, 0.62, -0.155], [0.155, 0.665, 0.155], trim, 0.2);
    lotus(m, 0, 0.665, 0, 1);
    layDown(m, from, quat([0.3, 0, 1], s * 1.45), x + s * 0.75, -1.9 + r() * 0.3, 0.04);
  }
  from = m.mark;
  gbox(m, [-0.24, 0, -0.13], [0.24, 0.26, 0.13], trim, 0.12);
  layDown(m, from, quat(X, 1.3), 0.0, -0.62, -0.5);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      from = m.mark;
      gbox(m, [-0.085, -0.03, -0.55], [0.085, 0.03, 0.55], trim, 0.2);
      layDown(m, from, quat(Y, (r() - 0.5) * 0.6).multiply(quat(Z, (r() - 0.5) * 0.4)), s * (1.1 + 0.25 + r() * 0.3), -0.6 + k * 1.2, -0.27 + 0.27);
    }
  }
  for (let k = 0; k < 12; k++) {
    from = m.mark;
    const s = 0.05 + r() * 0.1;
    gbox(m, [-s, -s * 0.5, -s * 0.8], [s, s * 0.5, s * 0.8], k % 3 === 0 ? fresh : k % 3 === 1 ? wall : tiles, 1);
    const a = r() * Math.PI * 2, d = 1.6 + r() * 1.0;
    layDown(m, from, quat([r() - 0.5, 1, r() - 0.5], r() * 6), Math.cos(a) * d * 0.8, -1.6 + Math.sin(a) * d * 0.5, s * 0.2);
  }
  return m.geometry();
}

// ---------------------------------------------------------------------------------------------- the registry entries

/**
 * The four kinds' entries in the scenery registry (sceneryKit.ts SCENERY_DESTRUCTIBLE_TYPES keeps their order): the
 * radii, heights, footprints and contact classes as before; each build spends its legacy builder's draws first.
 */
export const WAYSIDE_DESTRUCTIBLE_TYPES = {
  bildstock: {
    cls: 'break', mat: 'baked', contact: 'ob', r: 0.5, h: 3.25, hw: 0.33, hl: 0.33, collider: true, keep: 0.9, crushMin: 2.6,
    build: (rng: Rng) => { legacyBildstock(rng).dispose(); return buildBildstock(false); },
    broken: (rng: Rng) => { legacyBildstockBroken(rng).dispose(); return buildBildstock(true); },
  },
  // (the timber crosses' legacy builds drew nothing: the stream is untouched either way)
  waysidecross: {
    cls: 'topple', mat: 'structureWood', contact: 'ob', r: 0.75, h: 3.65, shape: 'circle', collisionR: 0.2, groundR: 0.25,
    build: () => buildWaysideCross(), broken: null, keep: 0.97,
  },
  orthodoxcross: {
    cls: 'topple', mat: 'structureWood', contact: 'ob', r: 0.65, h: 3.6, shape: 'circle', collisionR: 0.18, groundR: 0.24,
    build: () => buildOrthodoxCross(), broken: null, keep: 0.97,
  },
  tomb: {
    cls: 'break', mat: 'baked', contact: 'ob', r: 1.9, h: 2.4, hw: 1.3, hl: 1.7, collider: true, keep: 0.86, crushMin: 2.4,
    instanceTintStrength: 0.07,
    build: (rng: Rng) => { legacyTomb(rng).dispose(); return buildTomb(false); },
    broken: (rng: Rng) => { legacyTombBroken(rng).dispose(); return buildTomb(true); },
  },
} satisfies Record<string, SceneryDestructibleType>;

// ---------------------------------------------------------------------------------------------- the legacy builds
// (moved from sceneryKit.ts at 5a06b32e7; kept only to spend their draws from the destructible stream)

type Rng = () => number;
type Palette = readonly [number, number, number];

const _c = new THREE.Color();

function scaleUV<T extends THREE.BufferGeometry>(geo: T, su: number, sv: number): T {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

function box(w: number, h: number, d: number, uvScale = 0.7): THREE.BufferGeometry {
  return scaleUV(new THREE.BoxGeometry(w, h, d), Math.max(w, d) * uvScale, h * uvScale);
}

function paint<T extends THREE.BufferGeometry>(geo: T, pal: Palette, jit: number, rng: Rng): T {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _c.setHSL(pal[0], pal[1], Math.max(0.02, pal[2] + (rng() - 0.5) * jit), THREE.SRGBColorSpace);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** One attribute set for every part (position, normal, uv, colour where the kind's material wants it), merged. */
function merge(parts: THREE.BufferGeometry[], withColor: boolean, withUv: boolean): THREE.BufferGeometry {
  const ready = parts.map((part) => {
    const g = part.index ? part.toNonIndexed() : part;
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (withUv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!withUv && g.attributes.uv) g.deleteAttribute('uv');
    if (withColor && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    if (!withColor && g.attributes.color) g.deleteAttribute('color');
    return g;
  });
  const merged = mergeGeometries(ready, false);
  if (!merged) throw new Error('waysideKit: merge produced no geometry');
  return merged;
}

// palettes (sRGB HSL)
const SANDSTONE_RED: Palette = [0.03, 0.34, 0.40];
const SANDSTONE_GREY: Palette = [0.09, 0.10, 0.52];
const NICHE_DARK: Palette = [0.06, 0.18, 0.14];
const SHRINE_PAINT: Palette = [0.6, 0.30, 0.42];
const IRON: Palette = [0.6, 0.05, 0.13];

/** A Bildstock: a carved sandstone pillar on a plinth, the niche house on top under a saddle cap, an iron cross. */
function legacyBildstock(rng: Rng): THREE.BufferGeometry {
  const red = rng() < 0.6;
  const stone = red ? SANDSTONE_RED : SANDSTONE_GREY;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(box(0.66, 0.36, 0.66).translate(0, 0.18, 0), stone, 0.05, rng));
  parts.push(paint(box(0.5, 0.12, 0.5).translate(0, 0.42, 0), stone, 0.05, rng));
  parts.push(paint(box(0.3, 1.5, 0.3).translate(0, 1.23, 0), stone, 0.06, rng));
  parts.push(paint(box(0.42, 0.08, 0.42).translate(0, 2.01, 0), stone, 0.05, rng));
  // the niche house: back, sides and a sill framing a dark recess with its painted panel
  parts.push(paint(box(0.56, 0.62, 0.12).translate(0, 2.36, -0.16), stone, 0.05, rng));
  for (const side of [-1, 1]) parts.push(paint(box(0.1, 0.62, 0.36).translate(side * 0.23, 2.36, 0), stone, 0.05, rng));
  parts.push(paint(box(0.36, 0.5, 0.04).translate(0, 2.34, -0.08), NICHE_DARK, 0.04, rng));
  parts.push(paint(box(0.2, 0.3, 0.02).translate(0, 2.36, -0.055), SHRINE_PAINT, 0.08, rng));
  parts.push(paint(box(0.56, 0.08, 0.4).translate(0, 2.02, 0.01), stone, 0.05, rng));
  // the saddle cap: two sloped slabs meeting on the ridge
  for (const side of [-1, 1]) {
    const slab = box(0.38, 0.07, 0.5);
    slab.rotateZ(side * -0.55);
    parts.push(paint(slab.translate(side * 0.15, 2.78, 0), stone, 0.05, rng));
  }
  // the iron cross on the ridge
  parts.push(paint(box(0.035, 0.34, 0.035).translate(0, 3.05, 0), IRON, 0.02, rng));
  parts.push(paint(box(0.2, 0.035, 0.035).translate(0, 3.1, 0), IRON, 0.02, rng));
  return merge(parts, true, false);
}

/** What stays of a broken shrine: the plinth and the stump of the pillar, the niche house in pieces at its foot. */
function legacyBildstockBroken(rng: Rng): THREE.BufferGeometry {
  const stone = rng() < 0.6 ? SANDSTONE_RED : SANDSTONE_GREY;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(box(0.66, 0.36, 0.66).translate(0, 0.18, 0), stone, 0.05, rng));
  const stump = box(0.3, 0.55, 0.3);
  stump.rotateZ(0.08);
  parts.push(paint(stump.translate(0.02, 0.62, 0), stone, 0.06, rng));
  for (let i = 0; i < 4; i++) {
    const chunk = box(0.22 + rng() * 0.2, 0.12 + rng() * 0.1, 0.2 + rng() * 0.18);
    chunk.rotateY(rng() * 3); chunk.rotateZ((rng() - 0.5) * 0.6);
    parts.push(paint(chunk.translate((rng() - 0.5) * 1.4, 0.07, 0.4 + rng() * 0.6), stone, 0.06, rng));
  }
  return merge(parts, true, false);
}

const paint_ = paint;
const STUCCO_PALE: Palette = [0.12, 0.2, 0.7];
const STUCCO_BLUE: Palette = [0.55, 0.14, 0.6];
const TOMB_TILE: Palette = [0.04, 0.42, 0.36];
const WEATHER_GREY: Palette = [0.1, 0.06, 0.42];

/**
 * A Mekong-delta family tomb in the rice fields: a rendered plinth, the low barrel of the grave, a headstone wall with
 * a little hipped roof of tiles, and two stub pillars at the foot — painted stucco gone grey with the monsoons.
 */
function legacyTomb(rng: Rng): THREE.BufferGeometry {
  const paint = rng() < 0.55 ? STUCCO_PALE : STUCCO_BLUE;
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint_(box(2.6, 0.32, 3.4), WEATHER_GREY, 0.06, rng).translate(0, 0.16, 0));
  parts.push(paint_(box(1.7, 0.5, 2.4), paint, 0.06, rng).translate(0, 0.57, 0.15));
  const barrel = new THREE.CylinderGeometry(0.62, 0.62, 2.2, 10, 1, false, 0, Math.PI);
  barrel.rotateZ(Math.PI / 2); barrel.rotateY(Math.PI / 2);
  parts.push(paint_(barrel, paint, 0.05, rng).translate(0, 0.82, 0.15));
  // the headstone wall and its roof at the head (+Z), the stub pillars at the foot
  parts.push(paint_(box(2.2, 1.55, 0.3), paint, 0.05, rng).translate(0, 1.05, -1.3));
  parts.push(paint_(box(0.9, 0.7, 0.04), WEATHER_GREY, 0.05, rng).translate(0, 1.05, -1.13));
  for (const side of [-1, 1]) {
    const slope = box(1.35, 0.06, 0.62);
    slope.rotateZ(side * -0.42);
    parts.push(paint_(slope, TOMB_TILE, 0.06, rng).translate(side * 0.58, 2.02, -1.3));
    parts.push(paint_(box(0.32, 0.8, 0.32), paint, 0.05, rng).translate(side * 1.05, 0.72, 1.45));
  }
  return merge(parts, true, false);
}

function legacyTombBroken(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint_(box(2.6, 0.32, 3.4), WEATHER_GREY, 0.06, rng).translate(0, 0.16, 0));
  for (let i = 0; i < 5; i++) {
    const chunk = box(0.4 + rng() * 0.6, 0.2 + rng() * 0.3, 0.4 + rng() * 0.6);
    chunk.rotateY(rng() * 3); chunk.rotateZ((rng() - 0.5) * 0.7);
    parts.push(paint_(chunk, rng() < 0.5 ? STUCCO_PALE : WEATHER_GREY, 0.08, rng).translate((rng() - 0.5) * 2.4, 0.42, (rng() - 0.5) * 3));
  }
  return merge(parts, true, false);
}
