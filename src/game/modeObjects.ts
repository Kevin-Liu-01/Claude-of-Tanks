// src/game/modeObjects.ts — the match modes' objects built as things (props lane A, family #28, 2026-10-15; WORKLIST.md
// #28): Turbo's ball as a welded steel buoy and its goals as bolted hoops hung on lattice gantries; the air-dropped supply
// load on its skid board under a gored canopy, the canopy collapsed beside it once it lands; and the CTF flag's home
// stand, by the battlefield (objectivePosts.ts objectivePostFormOf). Lit (the presentation folds the materials into the
// cascades), built in each object's own frame from fixed shapes (no stream), boot-light (no world module imported).
import * as THREE from 'three';
import { bag, hash, srgb, Writer, type ObjectivePostForm, type Rgb, type V3 } from './objectivePosts.ts';

const BUOY = srgb(0xd6dadc), BUOY_SEAM = srgb(0x8e9496), BUOY_BAND = srgb(0x2a2e32), STENCIL = srgb(0xe8e4d8);
const STEEL = srgb(0x7c8084), STEEL_DARK = srgb(0x3e4246), CONCRETE = srgb(0xa29e94), RUST = srgb(0x7a4a30);
const LAMP = srgb(0xf0d070), PLY = srgb(0x9a8662), PLY_DARK = srgb(0x6e5e44), STRAP = srgb(0x3a3e2a), HONEYCOMB = srgb(0xb8a676);
const CANOPY_A = srgb(0x8a9268), CANOPY_B = srgb(0xa8ae88), LINE = srgb(0xc8ccb0), WOOD = srgb(0x6e5438), STONE = srgb(0xa89070);
const STONE_DARK = srgb(0x7a6650), FRAME = srgb(0xb8bcc0);

/** The finished geometry of a writer (position, normal, colour). */
const done = (w: Writer, name: string): THREE.BufferGeometry => { const g = w.geometry(); g.name = name; return g; };

/**
 * Turbo's ball, radius `r` (2.2 m): a welded steel buoy — its plates in courses round it, the weld seams darker, a
 * painted band at its equator with its stencilled number, a lifting lug at each pole.
 */
export function buildTurboBall(r = 2.2): THREE.BufferGeometry {
  const w = new Writer(), LAT = 10, LON = 16;
  const at = (i: number, j: number): V3 => {
    const th = (i / LAT) * Math.PI, ph = (j / LON) * Math.PI * 2;
    return [r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)];
  };
  for (let i = 0; i < LAT; i++) for (let j = 0; j < LON; j++) {
    const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j + 1), d = at(i + 1, j);
    const mid: V3 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
    // the equator's painted band (rows 4-5) with its stencil at four places; the plate courses' seams every other row
    // and every fourth meridian; the plates themselves a hand-finished grey
    // (one course painted round its equator, a pale stencil mark on it at four places)
    const band = i === 5, stencil = band && j % 4 === 2;
    const seam = i % 3 === 0 || j % 4 === 0;
    const col: Rgb = stencil ? STENCIL : band ? BUOY_BAND : seam ? BUOY_SEAM : (hash(i, j, 3) < 0.12 ? RUST : BUOY);
    if (i === 0) w.tri(a, c, d, mid, col); else if (i === LAT - 1) w.tri(a, b, d, mid, col); else w.quad(a, b, c, d, mid, col);
  }
  // the lifting lugs: a plate and its eye at each pole
  for (const s of [1, -1]) {
    w.box([0, s * (r + 0.12), 0], [0.05, 0.16, 0.28], 0, STEEL_DARK);
    w.rod([0, s * (r + 0.22), -0.16], [0, s * (r + 0.22), 0.16], 0.09, 0.09, 8, () => STEEL_DARK);
  }
  return done(w, 'turbo-ball-buoy');
}

/**
 * A goal's gantry in its marker's frame (the hoop's centre 10 m over the ground at the origin, its face along z): two
 * lattice towers on concrete footings either side of the 12 m hoop, a truss across their heads the hoop hangs from, the
 * guys to their pegs; neutral steel (the hoop itself, buildGoalHoop, wears the team's paint).
 */
export function buildGoalGantry(R = 12, H = 10): THREE.BufferGeometry {
  const w = new Writer(), top = H + R + 1.2, x0 = R + 1.6, half = 0.6;
  for (const s of [-1, 1]) {
    const cx = s * x0;
    // the footing, the four legs and their girts and diagonals every 2.4 m
    w.box([cx, 0.2, 0], [1.1, 0.45, 1.1], 0, CONCRETE);
    const leg = (dx: number, dz: number): [V3, V3] => [[cx + dx * half, 0.6, dz * half], [cx + dx * half * 0.6, top, dz * half * 0.6]];
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [a, b] = leg(dx, dz); w.rod(a, b, 0.07, 0.06, 5, () => STEEL); }
    const levels = Math.round((top - 0.6) / 2.4);
    for (let k = 0; k <= levels; k++) {
      const y = 0.6 + ((top - 0.6) * k) / levels, h = half * (1 - 0.4 * (k / levels));
      const c: V3[] = [[cx - h, y, -h], [cx + h, y, -h], [cx + h, y, h], [cx - h, y, h]];
      for (let e = 0; e < 4; e++) w.rod(c[e], c[(e + 1) % 4], 0.035, 0.035, 4, () => STEEL);
      if (k < levels) {
        const y1 = 0.6 + ((top - 0.6) * (k + 1)) / levels, h1 = half * (1 - 0.4 * ((k + 1) / levels));
        const d: V3[] = [[cx - h1, y1, -h1], [cx + h1, y1, -h1], [cx + h1, y1, h1], [cx - h1, y1, h1]];
        for (let e = 0; e < 4; e++) w.rod(c[e], d[(e + 1) % 4], 0.025, 0.025, 3, () => STEEL_DARK);
      }
    }
    // two guys from the tower's head to pegs behind and in front of it
    for (const dz of [-1, 1]) {
      const peg: V3 = [cx + s * 3, 0.05, dz * (top * 0.55)];
      w.rod([cx, top - 0.3, 0], peg, 0.012, 0.012, 3, () => STEEL_DARK);
      w.rod([peg[0], -0.25, peg[2]], [peg[0], 0.2, peg[2]], 0.04, 0.03, 4, () => STEEL);
    }
  }
  // the truss across the towers' heads (a top and bottom chord with their verticals) and the hangers down to the hoop
  for (const y of [top, top - 1.0]) w.rod([-x0, y, 0], [x0, y, 0], 0.06, 0.06, 5, () => STEEL);
  for (let k = 0; k <= 12; k++) {
    const x = -x0 + (2 * x0 * k) / 12;
    w.rod([x, top - 1.0, 0], [x, top, 0], 0.03, 0.03, 4, () => STEEL_DARK);
    if (k < 12) w.rod([x, top - 1.0, 0], [x + (2 * x0) / 12, top, 0], 0.025, 0.025, 3, () => STEEL_DARK);
  }
  for (const x of [-R * 0.55, 0, R * 0.55]) {
    const y = H + Math.sqrt(Math.max(0, R * R - x * x));
    w.rod([x, top - 1.0, 0], [x, y, 0], 0.025, 0.025, 4, () => STEEL_DARK);
  }
  // marker lights on the towers' heads
  for (const s of [-1, 1]) w.box([s * x0, top + 0.25, 0], [0.18, 0.18, 0.18], 0, LAMP);
  return done(w, 'turbo-goal-gantry');
}

/** A goal's hoop (radius R, its centre 10 m up): sixteen bolted steel segments, each flanged at its joints. White: the
 *  team's paint is its material's colour. */
export function buildGoalHoop(R = 12, H = 10): THREE.BufferGeometry {
  const w = new Writer(), N = 16, white: Rgb = [1, 1, 1], flange: Rgb = [0.7, 0.7, 0.7];
  const at = (t: number, rr = R): V3 => [Math.cos(t) * rr, H + Math.sin(t) * rr, 0];
  for (let k = 0; k < N; k++) {
    const t0 = (k / N) * Math.PI * 2, t1 = ((k + 1) / N) * Math.PI * 2;
    w.rod(at(t0 + 0.012), at(t1 - 0.012), 0.42, 0.42, 8, () => white);
    // the flange plates at the joint (bolted: a ring a little proud)
    w.rod(at(t0 - 0.012), at(t0 + 0.012), 0.55, 0.55, 8, () => flange);
  }
  return done(w, 'turbo-goal-hoop');
}

/** The air-dropped load on its frame's floor: a strapped plywood crate on a honeycomb skid board (2.2 x 2.4 x 2 m as the
 *  old box: its contents' panel the presentation's glyph on its face). */
export function buildAirdropLoad(): THREE.BufferGeometry {
  const w = new Writer();
  // the skid board and its honeycomb layer
  w.box([0, -1.12, 0], [1.25, 0.08, 1.1], 0, PLY_DARK, PLY);
  w.box([0, -1.0, 0], [1.18, 0.05, 1.04], 0, HONEYCOMB);
  // the crate: its panels, its corner battens, a darker top
  w.box([0, 0.0, 0], [1.1, 0.95, 1.0], 0, PLY, PLY_DARK);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) w.box([sx * 1.08, 0, sz * 0.98], [0.06, 0.97, 0.06], 0, PLY_DARK);
  for (const y of [-0.9, 0.9]) {
    w.box([0, y, 1.02], [1.1, 0.05, 0.02], 0, PLY_DARK); w.box([0, y, -1.02], [1.1, 0.05, 0.02], 0, PLY_DARK);
  }
  // the webbing straps round it both ways, buckled
  for (const x of [-0.55, 0.55]) {
    w.box([x, 0.97, 0], [0.04, 0.02, 1.04], 0, STRAP); w.box([x, 0, 1.04], [0.04, 0.97, 0.02], 0, STRAP);
    w.box([x, 0, -1.04], [0.04, 0.97, 0.02], 0, STRAP); w.box([x, 0.3, 1.07], [0.07, 0.06, 0.02], 0, STEEL_DARK);
  }
  for (const z of [-0.5, 0.5]) {
    w.box([0, 0.97, z], [1.14, 0.02, 0.04], 0, STRAP); w.box([1.14, 0, z], [0.02, 0.97, 0.04], 0, STRAP);
    w.box([-1.14, 0, z], [0.02, 0.97, 0.04], 0, STRAP);
  }
  // the clevis the risers meet at, over the crate's top
  w.rod([0, 0.98, 0], [0, 1.25, 0], 0.05, 0.04, 6, () => STEEL_DARK);
  return done(w, 'airdrop-load');
}

/** The open canopy over the load (its frame the load's, the clevis at y 1.25): sixteen gores to a vent, the skirt
 *  scalloped, the suspension lines from the skirt to the clevis. */
export function buildAirdropCanopy(): THREE.BufferGeometry {
  const w = new Writer(), N = 16, R = 3.9, Y = 7.0, vent = 0.45, clevis: V3 = [0, 1.25, 0];
  const p = (k: number, f: number): V3 => {
    // f 0 at the skirt, 1 at the vent: a flattened dome, each gore bulging between its seams
    const th = (k / N) * Math.PI * 2, r = R * (1 - f) + vent * f, y = Y + Math.sin(f * Math.PI / 2) * 1.6;
    return [Math.cos(th) * r, y - (f === 0 ? 0.25 * Math.abs(Math.sin(th * N / 2)) : 0), Math.sin(th) * r];
  };
  for (let k = 0; k < N; k++) {
    const col = k % 2 ? CANOPY_A : CANOPY_B;
    for (let r = 0; r < 3; r++) {
      const f0 = r / 3, f1 = (r + 1) / 3, out: V3 = [0, 1, 0];
      w.quad(p(k, f0), p(k + 1, f0), p(k + 1, f1), p(k, f1), out, col);
      w.quad(p(k, f0), p(k + 1, f0), p(k + 1, f1), p(k, f1), [0, -1, 0], col);
    }
    if (k % 2 === 0) w.rod(p(k, 0), clevis, 0.012, 0.012, 3, () => LINE);
  }
  return done(w, 'airdrop-canopy');
}

/** The canopy down: collapsed beside the load, its gores in a long slack heap trailing away (+x), the lines across the
 *  ground to the clevis. */
export function buildAirdropCanopyDown(): THREE.BufferGeometry {
  const w = new Writer(), L = 6.5;
  for (let s = 0; s < 6; s++) {
    const x0 = 1.6 + (L * s) / 6, x1 = 1.6 + (L * (s + 1)) / 6, h = 0.35 * (1 - s / 7), wd = 1.4 + 0.6 * Math.sin(s * 0.9);
    const col = s % 2 ? CANOPY_A : CANOPY_B;
    const a: V3 = [x0, -1.18, -wd], b: V3 = [x1, -1.18, -wd * 0.95], c: V3 = [x1, -1.18 + h * 0.8, 0], d: V3 = [x0, -1.18 + h, 0];
    const e: V3 = [x1, -1.18, wd * 0.95], f: V3 = [x0, -1.18, wd];
    w.quad(a, b, c, d, [0, 1, -1], col); w.quad(d, c, e, f, [0, 1, 1], col);
  }
  for (const z of [-0.6, -0.2, 0.2, 0.6]) w.rod([0.4, -1.15, z * 0.3], [1.7, -1.16, z], 0.012, 0.012, 3, () => LINE);
  return done(w, 'airdrop-canopy-down');
}

/**
 * The flag's home stand by the battlefield, its socket at the origin (the pole stands in it at y 0): a sandbagged socket
 * on the 1937-45 maps, a weighted tripod on the modern ones, a stone cairn in the deserts, a regolith anchor on Mars
 * and the Moon.
 */
export function buildFlagStand(form: ObjectivePostForm): THREE.BufferGeometry {
  const w = new Writer();
  if (form === 'field') {
    for (let course = 0; course < 2; course++) for (let i = 0; i < 6; i++) {
      const a = ((i + course * 0.5) / 6) * Math.PI * 2;
      bag(w, Math.cos(a) * 0.62, course * 0.2 - 0.05, Math.sin(a) * 0.62, -a + Math.PI / 2, 7 * i + course);
    }
    w.rod([0, -0.3, 0], [0, 0.55, 0], 0.09, 0.09, 8, () => WOOD);
  } else if (form === 'cairn') {
    const stones = [[0, 0.12, 0, 0.5, 0.16, 0.48], [0.3, 0.14, 0.18, 0.24, 0.14, 0.22], [-0.28, 0.12, -0.15, 0.22, 0.13, 0.24],
      [0.05, 0.38, 0.02, 0.36, 0.14, 0.34], [0, 0.58, 0, 0.24, 0.11, 0.22]] as const;
    stones.forEach(([x, y, z, hx, hy, hz], i) => w.lump([x, y - 0.04, z], [hx, hy, hz], 41 + i * 13, STONE, STONE_DARK));
  } else if (form === 'beacon') {
    // a regolith anchor: a ring of plates pinned into the ground round a socket tube
    w.rod([0, -0.4, 0], [0, 0.5, 0], 0.08, 0.07, 8, () => FRAME);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      w.box([Math.cos(a) * 0.55, 0.03, Math.sin(a) * 0.55], [0.22, 0.04, 0.14], a, STEEL_DARK);
      w.rod([Math.cos(a) * 0.12, 0.35, Math.sin(a) * 0.12], [Math.cos(a) * 0.5, 0.06, Math.sin(a) * 0.5], 0.025, 0.025, 4, () => FRAME);
    }
  } else {
    // the weighted tripod: three legs to a socket collar, a sandbag on each foot
    w.rod([0, 0.1, 0], [0, 0.9, 0], 0.07, 0.07, 8, () => STEEL);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3, foot: V3 = [Math.cos(a) * 0.9, 0.04, Math.sin(a) * 0.9];
      w.rod(foot, [0, 0.8, 0], 0.03, 0.025, 5, () => STEEL_DARK);
      bag(w, foot[0], -0.08, foot[2], a, 90 + k);
    }
  }
  return done(w, `flag-stand-${form}`);
}
