// src/world/maps/stoneLandmarks.ts — the stone landmarks (props census #11, the looks lane, 2026-10-15): rock that
// people shaped. They are rock forms (sceneryRocks.ts buildRockFormation's FORMS), built through the rock pipeline so
// they weather with the map's rock (its tone, its lichen, its beds), each laid stone by stone:
//
//   calvary  the Breton wayside calvary (Côte de Granit's crossroads; Amberford's in limestone): three steps each laid
//            as a ring of dressed slabs, the offering table at the front, the socle with its base moulding, die,
//            tablet and cornice, the octagonal shaft with its écots (the cut branches of the croix à écots) on its
//            base ring, the necking and the console, the cross with its trefoiled ends, the Christ on its face and
//            the Virgin and Child on its back;
//   menhir   the standing stone: a split slab set on end, tapering to its broken top, leaning a little, its packing
//            stones half sunk round its foot;
//   cairn    by its rock: a granite cairn is the inuksuk of the plateau (Whiteout's roads): two leg stones, the hip
//            slab across them, the torso stones, the arms' long slab and the head stone, a few stones at its foot; a
//            sandstone one is the rujm of the desert tracks (the Dahar, Wadi Rum): a kerb of slabs set on edge round
//            its foot, its flat stones laid in corbelled courses over a rubble core, the marker stone stood on its
//            summit, slabs fallen from it; any other is the clearance cairn of a karst field (the Dalmatian gomila,
//            the orchard crest's): a dry-stone kerb of coursed flat stones round its foot, the field stone heaped in a
//            dome over a rough core inside it, the big stones on its shell, a few tumbled out.
//
// Each form draws only the formation's own stream (scenery.ts: one stream a landmark) and the shared read-only noise;
// its footprint (its radius) and its height are the authored ones, so the placements, the vegetation clearances and
// the admission stay what they were (sceneryPlan.ts STONE_LANDMARKS); the standing mass follows the new stones.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SimplexNoise } from '../../engine/simplexFast.ts';
import { looseStone, lowestGround, place, roundedBlock, type Piece, type RockFormationSpec, type RockGround } from '../sceneryRocks.ts';

type Rng = () => number;
type Lay = (g: THREE.BufferGeometry, lx: number, y: number, lz: number, turn?: number, pitch?: number, roll?: number, standing?: boolean) => void;

/** A layer in a formation's own frame (turned `yaw` about its centre): local (lx, lz) to the world, then placed. */
function framed(spec: RockFormationSpec, yaw: number, pieces: Piece[]): Lay {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (g, lx, y, lz, turn = 0, pitch = 0, roll = 0, standing = true) => {
    pieces.push({ geometry: place(g, spec.x + lx * c + lz * s, y, spec.z - lx * s + lz * c, yaw + turn, pitch, roll), layer: -1, standing });
  };
}

/** A dressed block: square arrises a little worn, no fractures. */
function dressed(hx: number, hy: number, hz: number, noise: SimplexNoise, rng: Rng, seg: number, seedOffset: number, round = 0.06): THREE.BufferGeometry {
  return roundedBlock(hx, hy, hz, round, seg, noise, rng, { weather: 0.025, cuts: 0, seedOffset });
}

/** A tapered prism block (welded): w0 x d0 at its foot to w1 x d1 at its head over h (an octagonal shaft when `oct`). */
function taperedShaft(r0: number, r1: number, h: number, sides: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, sides, 2);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const w = mergeVertices(g);
  g.dispose();
  return w;
}

// ---------------------------------------------------------------------------------------------------------- calvary

function calvary(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  const S = spec.radius / 1.6; // 1.6 m half-base at scale 1
  const H = spec.height;
  const yaw = THREE.MathUtils.degToRad(spec.yawDeg ?? 0);
  const { min } = lowestGround(ground, spec.x, spec.z, spec.radius);
  const seg = mobile ? 1 : 2;
  const lay = framed(spec, yaw, pieces);
  let seed = 600;
  // the steps: each a ring of four dressed slabs (the front and back run through, the sides between), the lowest set
  // into the ground's lowest corner so no step floats
  let y = min - 0.25;
  const steps: Array<[number, number]> = [[1.6, 0.42], [1.22, 0.36], [0.86, 0.34]];
  for (const [half0, h0] of steps) {
    const half = half0 * S, h = h0 + (y < min ? 0.12 : 0), depth = Math.min(0.42 * S, half * 0.5), j = () => (rng() - 0.5) * 0.012;
    for (const sz of [-1, 1]) lay(dressed(half - 0.005, h / 2, depth / 2 - 0.006, noise, rng, seg, seed++), j(), y + h / 2, sz * (half - depth / 2), j());
    for (const sx of [-1, 1]) lay(dressed(depth / 2 - 0.006, h / 2, half - depth - 0.008, noise, rng, seg, seed++), sx * (half - depth / 2), y + h / 2, j(), j());
    if (!mobile && half - depth > 0.05) lay(dressed(half - depth, h / 2 - 0.01, half - depth, noise, rng, 1, seed++, 0.02), 0, y + h / 2 - 0.01, 0);
    y += h0;
  }
  // the offering table on the top step before the socle: its slab on a pier
  const tz = 0.5 * S + 0.24 * S;
  if (!mobile) {
    lay(dressed(0.14 * S, 0.17, 0.1 * S, noise, rng, 1, seed++), 0, y + 0.17, tz);
    lay(dressed(0.34 * S, 0.035, 0.2 * S, noise, rng, 1, seed++, 0.1), 0, y + 0.375, tz + 0.03 * S);
  }
  // the socle: its base moulding, the die with the tablet on its face, the cornice
  lay(dressed(0.58 * S, 0.07, 0.58 * S, noise, rng, seg, seed++, 0.12), 0, y + 0.07, 0);
  lay(dressed(0.5 * S, 0.36, 0.5 * S, noise, rng, seg, seed++), 0, y + 0.14 + 0.36, 0);
  lay(dressed(0.3 * S, 0.17, 0.012, noise, rng, 1, seed++, 0.2), 0, y + 0.52, 0.5 * S + 0.008);
  lay(dressed(0.6 * S, 0.075, 0.6 * S, noise, rng, seg, seed++, 0.15), 0, y + 0.86 + 0.075, 0);
  y += 1.01;
  // the shaft on its base ring, the écots stubbing out of it, the necking and the console
  const CROSS_H = 1.48, CONSOLE = 0.2;
  const shaftH = Math.max(1.2, H - (y - min) - CONSOLE - CROSS_H);
  lay(dressed(0.27 * S, 0.06, 0.27 * S, noise, rng, seg, seed++, 0.25), 0, y + 0.06, 0, Math.PI / 8);
  y += 0.12;
  lay(taperedShaft(0.2 * S, 0.165 * S, shaftH, mobile ? 6 : 8), 0, y + shaftH / 2, 0, Math.PI / 8);
  const ecots = mobile ? 3 : 5;
  for (let k = 0; k < ecots; k++) {
    const t = (k + 0.6) / (ecots + 0.4), a = k * 2.2 + 0.5, r = (0.2 - 0.035 * t) * S;
    const knob = roundedBlock(0.07 * S, 0.045, 0.055 * S, 0.45, 1, noise, rng, { weather: 0.05, cuts: 1, cutDepth: 0.75, seedOffset: seed++ });
    lay(knob, Math.cos(a) * (r + 0.04 * S), y + shaftH * t, Math.sin(a) * (r + 0.04 * S), -a, 0, 0.5);
  }
  y += shaftH;
  lay(dressed(0.21 * S, 0.04, 0.21 * S, noise, rng, seg, seed++, 0.4), 0, y + 0.04, 0, Math.PI / 4);
  lay(dressed(0.2 * S, 0.06, 0.17 * S, noise, rng, seg, seed++, 0.1), 0, y + 0.08 + 0.06, 0);
  y += CONSOLE;
  // the cross: its upright and arms, the trefoiled ends
  const armY = y + 0.98, upH = 0.74, armHalf = 0.56 * S, uw = 0.11 * S, ud = 0.1 * S;
  lay(dressed(uw, upH, ud, noise, rng, seg, seed++, 0.12), 0, y + upH, 0);
  lay(dressed(armHalf, 0.1, ud, noise, rng, seg, seed++, 0.12), 0, armY, 0);
  for (const [lx, ly] of [[-armHalf, armY], [armHalf, armY], [0, y + 2 * upH]] as const) {
    lay(roundedBlock(0.13 * S, 0.13, ud * 1.15, 0.55, seg, noise, rng, { weather: 0.04, cuts: 0, seedOffset: seed++ }), lx, ly, 0);
  }
  // the Christ on the cross's face: head bowed, torso, loincloth, legs together, arms along the bar
  const fz = ud + 0.05 * S, k = S;
  lay(roundedBlock(0.055 * k, 0.065, 0.05 * k, 0.6, seg, noise, rng, { weather: 0.02, cuts: 0, seedOffset: seed++ }), 0.015 * k, armY - 0.04, fz + 0.01, 0, 0.25, -0.2);
  lay(roundedBlock(0.085 * k, 0.15, 0.05 * k, 0.4, 1, noise, rng, { weather: 0.02, cuts: 0, seedOffset: seed++ }), 0, armY - 0.27, fz);
  lay(roundedBlock(0.09 * k, 0.055, 0.058 * k, 0.3, 1, noise, rng, { weather: 0.02, cuts: 0, seedOffset: seed++ }), 0, armY - 0.45, fz);
  lay(roundedBlock(0.06 * k, 0.22, 0.05 * k, 0.4, 1, noise, rng, { weather: 0.02, cuts: 0, seedOffset: seed++ }), 0, armY - 0.72, fz - 0.005);
  for (const sx of [-1, 1]) {
    lay(roundedBlock(0.22 * k, 0.035, 0.038 * k, 0.5, 1, noise, rng, { weather: 0.02, cuts: 0, seedOffset: seed++ }), sx * 0.27 * k, armY - 0.06, fz - 0.005, 0, 0, sx * 0.2);
  }
  // the Virgin and Child on its back: the mantle, the head, the child on her arm
  if (mobile) return;
  const bz = -(ud + 0.06 * S);
  lay(roundedBlock(0.1 * k, 0.24, 0.06 * k, 0.45, 1, noise, rng, { weather: 0.02, cuts: 0, seedOffset: seed++ }), 0, armY - 0.36, bz);
  lay(roundedBlock(0.05 * k, 0.06, 0.05 * k, 0.6, 2, noise, rng, { weather: 0.02, cuts: 0, seedOffset: seed++ }), 0, armY - 0.06, bz - 0.005);
  lay(roundedBlock(0.045 * k, 0.07, 0.04 * k, 0.5, 1, noise, rng, { weather: 0.02, cuts: 0, seedOffset: seed++ }), -0.08 * k, armY - 0.26, bz - 0.04);
}

// ----------------------------------------------------------------------------------------------------------- menhir

function menhir(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  // a standing stone: a split slab set on end, narrowing up to its broken top, leaning a little; its packing stones
  // half sunk round its foot
  const H = spec.height, W = Math.max(0.5, spec.radius);
  const yaw = THREE.MathUtils.degToRad(spec.yawDeg ?? rng() * 180);
  const { min } = lowestGround(ground, spec.x, spec.z, W * 0.6);
  const sink = 0.6 + H * 0.08;
  const hy = (H + sink) * 0.5;
  const g = roundedBlock(W * 0.5, hy, W * (0.28 + rng() * 0.08), 0.32, mobile ? 4 : 6, noise, rng,
    { weather: 0.14, cuts: 3, cutDepth: 0.62, seedOffset: 300 });
  // the taper: a quarter narrower at the top than at the foot, the faces' weathering kept
  const p = g.attributes.position, taper = 0.24 + rng() * 0.1;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) + hy) / (2 * hy)));
    const f = 1 - taper * t * t;
    p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * (1 - taper * 0.6 * t * t));
  }
  pieces.push({ geometry: place(g, spec.x, min - sink + hy, spec.z, yaw, (rng() - 0.5) * 0.09, (rng() - 0.5) * 0.12), layer: -1, standing: true });
  const n = mobile ? 3 : 7;
  for (let i = 0; i < n; i++) {
    const a = yaw + (i / n) * Math.PI * 2 + rng() * 0.6, rr = W * (0.42 + rng() * 0.22);
    const x = spec.x + Math.cos(a) * rr, z = spec.z + Math.sin(a) * rr;
    const size = 0.16 + rng() * 0.22;
    pieces.push({ geometry: place(looseStone(size, 0.6, noise, rng, 0, 0.55), x, ground.getHeightAt(x, z) - size * 0.38, z, rng() * 6.3, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4), layer: -1, standing: false });
  }
}

// ------------------------------------------------------------------------------------------------------------ cairns

function cairn(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  if (spec.geology === 'granite') inuksuk(spec, ground, noise, rng, mobile, pieces);
  else if (spec.geology === 'sandstone') rujm(spec, ground, noise, rng, mobile, pieces);
  else gomila(spec, ground, noise, rng, mobile, pieces);
}

/** The inuksuk: the figure of stones that marks the way over the plateau, about the authored height. */
function inuksuk(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  const R = spec.radius, H = spec.height, u = H / 2.0, span = Math.max(0.75, R) / 0.9;
  const yaw = THREE.MathUtils.degToRad(spec.yawDeg ?? rng() * 360);
  const { min } = lowestGround(ground, spec.x, spec.z, R * 0.6);
  const seg = mobile ? 1 : 2;
  const lay = framed(spec, yaw, pieces);
  let seed = 800;
  const stone = (hx: number, hy: number, hz: number, round = 0.2) => roundedBlock(hx, hy, hz, round, seg, noise, rng, { weather: 0.07, cuts: 2, cutDepth: 0.82, seedOffset: seed++ });
  const tilt = () => (rng() - 0.5) * 0.06;
  // the legs: two stones on end, apart, sunk a little
  let y = min - 0.06 * u;
  const legH = 0.37 * u;
  for (const sx of [-1, 1]) lay(stone(0.16 * u, legH, 0.14 * u), sx * 0.3 * u * span, y + legH, (rng() - 0.5) * 0.04, tilt(), tilt(), tilt());
  y += legH * 2;
  // the hip slab across them, the torso's two stones, the arms' long slab, the head
  lay(stone(0.5 * u * span, 0.08 * u, 0.17 * u, 0.15), 0, y + 0.08 * u, 0, tilt(), tilt(), tilt());
  y += 0.16 * u;
  lay(stone(0.24 * u, 0.17 * u, 0.17 * u), (rng() - 0.5) * 0.04, y + 0.17 * u, 0, tilt() * 4, tilt(), tilt());
  y += 0.34 * u;
  lay(stone(0.2 * u, 0.13 * u, 0.15 * u), (rng() - 0.5) * 0.04, y + 0.13 * u, 0, tilt() * 4, tilt(), tilt());
  y += 0.26 * u;
  lay(stone(0.66 * u * span, 0.07 * u, 0.14 * u, 0.15), 0, y + 0.07 * u, 0, tilt(), tilt(), tilt());
  y += 0.14 * u;
  lay(stone(0.15 * u, 0.15 * u, 0.13 * u, 0.3), 0, y + 0.15 * u - 0.01, 0, tilt() * 4, tilt(), tilt());
  // a few stones at its foot
  for (let i = 0; i < (mobile ? 2 : 4); i++) {
    const a = rng() * Math.PI * 2, rr = R * (0.5 + rng() * 0.4);
    const x = spec.x + Math.cos(a) * rr, z = spec.z + Math.sin(a) * rr, size = 0.12 + rng() * 0.14;
    pieces.push({ geometry: place(looseStone(size, 0.55, noise, rng, mobile ? 0 : 1, 0.4), x, ground.getHeightAt(x, z) - size * 0.3, z, rng() * 6.3), layer: -1, standing: false });
  }
}

/** The rujm: the desert track's cairn of flat stones in corbelled courses inside a kerb of slabs on edge. */
function rujm(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  const R = spec.radius, H = spec.height;
  const { min } = lowestGround(ground, spec.x, spec.z, R);
  let seed = 900;
  // the rubble core under the courses (it shows only between them)
  const core = roundedBlock(R * 0.74, H * 0.72, R * 0.7, 1, 3, noise, rng, { weather: 0.14, cuts: 0, seedOffset: seed++ });
  pieces.push({ geometry: place(core, spec.x, min - H * 0.22, spec.z, rng() * 6.3), layer: -1, standing: true });
  // the kerb: slabs set on edge round the foot, each leaning out a little
  const kr = R * 0.92, kn = Math.max(8, Math.round((2 * Math.PI * kr) / (mobile ? 0.7 : 0.48)));
  for (let i = 0; i < kn; i++) {
    const a = ((i + rng() * 0.3) / kn) * Math.PI * 2;
    const x = spec.x + Math.cos(a) * kr, z = spec.z + Math.sin(a) * kr;
    const hy = 0.2 + rng() * 0.1, hx = 0.2 + rng() * 0.07;
    const slab = roundedBlock(hx, hy, 0.07 + rng() * 0.02, 0.12, 1, noise, rng, { weather: 0.08, cuts: 2, cutDepth: 0.8, seedOffset: seed++ });
    pieces.push({ geometry: place(slab, x, ground.getHeightAt(x, z) + hy * 0.55, z, Math.atan2(-Math.cos(a), -Math.sin(a)), -0.12 + (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08), layer: 2, standing: true });
  }
  // the courses: flat stones laid radially in rings, each ring stepped in, each stone shedding outward
  const K = Math.max(4, Math.round((H * 0.85) / (mobile ? 0.24 : 0.16)));
  for (let k = 0; k < K; k++) {
    const t = k / K, rk = R * 0.8 * Math.pow(1 - t, 0.72), yk = min + 0.06 + t * H * 0.84;
    const nk = Math.max(1, Math.round((2 * Math.PI * rk) / (mobile ? 0.6 : 0.42)));
    for (let i = 0; i < nk; i++) {
      const a = ((i + (k % 2) * 0.5 + rng() * 0.25) / nk) * Math.PI * 2;
      const hx = 0.17 + rng() * 0.08, hz = 0.12 + rng() * 0.06, hy = 0.055 + rng() * 0.025;
      const g = roundedBlock(hx, hy, hz, 0.25, 1, noise, rng, { weather: 0.08, cuts: 1, cutDepth: 0.75, seedOffset: seed++ });
      const r = nk === 1 ? 0 : rk - hx * 0.5;
      pieces.push({ geometry: place(g, spec.x + Math.cos(a) * r, yk + hy, spec.z + Math.sin(a) * r, -a, (rng() - 0.5) * 0.08, -0.14 + (rng() - 0.5) * 0.08), layer: (rng() < 0.25 ? 1 : 2), standing: true });
    }
  }
  // the marker stone stood on the summit, wedged among the top course
  const top = min + 0.06 + H * 0.84;
  const marker = roundedBlock(0.17, 0.26, 0.08, 0.2, mobile ? 1 : 2, noise, rng, { weather: 0.08, cuts: 2, cutDepth: 0.78, seedOffset: seed++ });
  pieces.push({ geometry: place(marker, spec.x + (rng() - 0.5) * 0.1, top + 0.18, spec.z + (rng() - 0.5) * 0.1, rng() * 6.3, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12), layer: 2, standing: true });
  // slabs fallen from it, lying out past the kerb
  for (let i = 0; i < (mobile ? 2 : 4); i++) {
    const a = rng() * Math.PI * 2, rr = R * (1.05 + rng() * 0.35);
    const x = spec.x + Math.cos(a) * rr, z = spec.z + Math.sin(a) * rr;
    const g = roundedBlock(0.18 + rng() * 0.08, 0.06, 0.13 + rng() * 0.05, 0.25, 1, noise, rng, { weather: 0.08, cuts: 1, cutDepth: 0.75, seedOffset: seed++ });
    pieces.push({ geometry: place(g, x, ground.getHeightAt(x, z) + 0.03, z, rng() * 6.3, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3), layer: -1, standing: false });
  }
}

/** The gomila: a karst field's clearance cairn, the field stone heaped in a dome inside a dry-stone kerb. */
function gomila(spec: RockFormationSpec, ground: RockGround, noise: SimplexNoise, rng: Rng, mobile: boolean, pieces: Piece[]): void {
  const R = spec.radius, H = spec.height;
  const { min } = lowestGround(ground, spec.x, spec.z, R);
  let seed = 1000;
  // the kerb: courses of flat stones round the foot, broken in bond, each course stepped in (a batter)
  const courses = mobile ? 2 : 3, ch = 0.21;
  for (let k = 0; k < courses; k++) {
    const r = R * 0.97 - k * 0.07, n = Math.max(10, Math.round((2 * Math.PI * r) / (mobile ? 1.2 : 0.62)));
    for (let i = 0; i < n; i++) {
      const a = ((i + (k % 2) * 0.5 + (rng() - 0.5) * 0.15) / n) * Math.PI * 2;
      const x = spec.x + Math.cos(a) * r, z = spec.z + Math.sin(a) * r;
      const hx = (Math.PI * r) / n * 0.96, hy = ch * 0.46 * (0.85 + rng() * 0.3), hz = 0.17 + rng() * 0.05;
      const g = roundedBlock(hx, hy, hz, 0.2, 1, noise, rng, { weather: 0.07, cuts: 1, cutDepth: 0.82, seedOffset: seed++ });
      const y = ground.getHeightAt(x, z) - 0.08 + k * ch + hy;
      pieces.push({ geometry: place(g, x, y, z, Math.atan2(-Math.cos(a), -Math.sin(a)), (rng() - 0.5) * 0.06, (rng() - 0.5) * 0.06), layer: -1, standing: true });
    }
  }
  // the heap inside it: a rough core under a shell of the larger stones, the shell's rings from the kerb's top up
  const kerbTop = min - 0.08 + courses * ch;
  const core = roundedBlock(R * 0.84, H * 0.9, R * 0.78, 1, mobile ? 3 : 4, noise, rng, { weather: 0.16, cuts: 0, seedOffset: 500 });
  pieces.push({ geometry: place(core, spec.x, min - H * 0.12, spec.z, rng() * 6.3), layer: -1, standing: true });
  const stone = Math.max(0.35, Math.min(0.9, R * 0.16));
  const rings = Math.max(2, Math.round(H / (stone * 0.9)));
  for (let k = mobile ? 1 : 0; k < rings; k++) {
    const t = k / rings;
    const rr = Math.min(R * 0.86, R * Math.pow(1 - t, 0.85) * 0.9);
    const n = Math.max(1, Math.round((2 * Math.PI * rr) / (stone * (mobile ? 2.6 : 2.0))));
    const yRing = Math.max(kerbTop - 0.05, min + t * H * 0.9);
    for (let i = 0; i < n; i++) {
      const a = ((i + rng() * 0.6) / n) * Math.PI * 2;
      const x = spec.x + Math.cos(a) * rr, z = spec.z + Math.sin(a) * rr * 0.93;
      const size = stone * (0.6 + rng() * 0.6) * (1 - t * 0.35);
      pieces.push({ geometry: place(looseStone(size, 0.55 + rng() * 0.2, noise, rng, mobile ? 0 : 1, 0.3), x, yRing + size * 0.1, z, rng() * 6.3, (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6), layer: -1, standing: true });
    }
  }
  // a few stones tumbled out past the kerb
  for (let i = 0; i < (mobile ? 3 : 6); i++) {
    const a = rng() * Math.PI * 2, rr = R * (1.03 + rng() * 0.25);
    const x = spec.x + Math.cos(a) * rr, z = spec.z + Math.sin(a) * rr, size = stone * (0.4 + rng() * 0.4);
    pieces.push({ geometry: place(looseStone(size, 0.6, noise, rng, 0, 0.35), x, ground.getHeightAt(x, z) - size * 0.25, z, rng() * 6.3), layer: -1, standing: false });
  }
}

export { menhir, cairn, calvary };
