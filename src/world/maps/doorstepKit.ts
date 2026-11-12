// The doorstep kit (buildings-271 R4): one merged geometry per family the doorstep planner places (world/doorstepDressing
// .ts): terracotta pots of geraniums and herbs, a plank bench, a zinc bucket, an oak cask, a stack of split logs, a
// two-wheeled handcart, a stack of crates. Each stands on y = 0 in its own frame, its back toward -z (the wall) and its
// front toward +z, inside the planner's family radius, on the vertex-colour material the yard families use. First-party
// generated geometry; no model is loaded.

import type * as THREE from 'three';
import type { DoorstepFamily } from '../doorstepDressing.ts';
import { hexLin, mul, type Rgb } from './craftMesh.ts';
import { bar, finish, lathe, newMesh, pole } from './clutterForms.ts';

const CLAY = hexLin(0xa4553a), SOIL = hexLin(0x3a2c22);
const LEAF = hexLin(0x3f6a2e), LEAF_DARK = hexLin(0x2c4c22), BLOOM = hexLin(0xc23a34);
const OAK = hexLin(0x7a5a3c), OAK_DARK = hexLin(0x584029), IRON = hexLin(0x2f2d2b);
const ZINC = hexLin(0x9aa0a2), LOG = hexLin(0x8a6a48), LOG_END = hexLin(0xc8a676), BARK = hexLin(0x4f3d2c);
const PLANK = hexLin(0x8c7556), CRATE = hexLin(0xa38660);

/** Two or three pots along the wall, a geranium's red over its leaves in each. */
function potsOf(): THREE.BufferGeometry {
  const m = newMesh();
  for (const [x, s] of [[-0.18, 1], [0.16, 0.8], [0.0, 0.65]] as const) {
    const z = x === 0 ? 0.14 : -0.04, h = 0.3 * s, r = 0.15 * s;
    lathe(m, [[r * 0.72, 0], [r, h * 0.9], [r * 1.08, h * 0.92], [r * 1.08, h], [r * 0.95, h]], 6, (k) => (k % 2 ? CLAY : mul(CLAY, 0.93)), { x, z, capBottom: true, capTop: true, capColour: SOIL });
    lathe(m, [[r * 0.9, h], [r * 1.25, h + 0.12 * s], [r * 0.9, h + 0.24 * s], [0, h + 0.28 * s]], 5, (k) => (k % 3 ? LEAF : LEAF_DARK), { x, z, phase: x });
    lathe(m, [[r * 0.5, h + 0.2 * s], [r * 0.6, h + 0.27 * s], [0, h + 0.33 * s]], 4, () => BLOOM, { x, z: z + 0.02, phase: 0.4 });
  }
  return finish(m);
}

/** A plank bench against the wall: its seat on two splayed trestles, a back rail. */
function benchOf(): THREE.BufferGeometry {
  const m = newMesh();
  bar(m, [-0.75, 0.44, 0.02], [0.75, 0.44, 0.02], 0.34, 0.05, [0, 0, 1], PLANK, 0.01);
  bar(m, [-0.75, 0.82, -0.15], [0.75, 0.82, -0.15], 0.1, 0.04, [0, 0, 1], mul(PLANK, 0.92));
  for (const x of [-0.6, 0.6]) {
    for (const z of [-0.1, 0.14]) bar(m, [x, 0, z + (z > 0 ? 0.04 : -0.04)], [x, 0.42, z], 0.05, 0.05, [1, 0, 0], OAK_DARK);
    bar(m, [x, 0.42, -0.17], [x, 0.84, -0.17], 0.05, 0.04, [1, 0, 0], OAK_DARK);
  }
  return finish(m);
}

/** A zinc bucket with its bail. */
function bucketOf(): THREE.BufferGeometry {
  const m = newMesh();
  lathe(m, [[0.12, 0], [0.16, 0.28], [0.165, 0.29]], 10, (k) => (k % 2 ? ZINC : mul(ZINC, 0.9)), { capBottom: true, capTop: true, capColour: mul(ZINC, 0.55) });
  pole(m, [-0.16, 0.28, 0], [0, 0.42, 0], 0.008, 4, IRON);
  pole(m, [0, 0.42, 0], [0.16, 0.28, 0], 0.008, 4, IRON);
  return finish(m);
}

/** An oak cask on end: its bellied staves and three iron hoops. */
function caskOf(): THREE.BufferGeometry {
  const m = newMesh();
  const prof: Array<[number, number]> = [[0.25, 0], [0.29, 0.2], [0.31, 0.42], [0.29, 0.64], [0.25, 0.84]];
  lathe(m, prof, 12, (k) => (k % 2 ? OAK : mul(OAK, 0.88)), { faceted: true, capBottom: true, capTop: true, capColour: OAK_DARK });
  for (const y of [0.1, 0.42, 0.74]) {
    const r = y === 0.42 ? 0.315 : 0.285;
    lathe(m, [[r, y - 0.025], [r + 0.006, y], [r, y + 0.025]], 12, () => IRON);
  }
  return finish(m);
}

/** Split logs stacked against the wall between two stakes, their cut ends out. */
function logsOf(): THREE.BufferGeometry {
  const m = newMesh();
  const rows = [[-0.6, -0.36, -0.12, 0.12, 0.36, 0.6], [-0.48, -0.24, 0, 0.24, 0.48], [-0.36, -0.12, 0.12, 0.36]];
  rows.forEach((row, k) => {
    for (const x of row) {
      const y = 0.1 + k * 0.17, r = 0.085 + ((x * 31 + k) % 3) * 0.006;
      pole(m, [x, y, -0.25], [x, y, 0.25], r, 6, (Math.round(x * 10) + k) % 2 ? BARK : mul(BARK, 0.85), true);
      lathe(m, [[r * 0.98, 0], [0, 0.002]], 6, () => LOG_END, { x, z: 0.25 });
    }
  });
  for (const x of [-0.78, 0.78]) bar(m, [x, 0, 0], [x, 0.62, 0], 0.06, 0.06, [1, 0, 0], LOG);
  return finish(m);
}

/** The two-wheeled handcart: its plank bed with low sides, the wheels on their axle, the shafts down to the ground. */
function handcartOf(): THREE.BufferGeometry {
  const m = newMesh();
  bar(m, [-0.5, 0.55, 0], [0.5, 0.55, 0], 1.0, 0.05, [0, 0, 1], PLANK);
  for (const z of [-0.5, 0.5]) bar(m, [-0.5, 0.68, z], [0.5, 0.68, z], 0.04, 0.22, [0, 0, 1], mul(PLANK, 0.9));
  for (const x of [-0.5, 0.5]) bar(m, [x, 0.68, -0.5], [x, 0.68, 0.5], 0.04, 0.22, [1, 0, 0], mul(PLANK, 0.85));
  pole(m, [0, 0.36, -0.62], [0, 0.36, 0.62], 0.03, 6, IRON);
  for (const z of [-0.6, 0.6]) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      pole(m, [0, 0.36, z], [Math.cos(a) * 0.34, 0.36 + Math.sin(a) * 0.34, z], 0.018, 4, OAK_DARK);
    }
    // the felloe as a twelve-sided ring of short bars
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
      bar(m, [Math.cos(a0) * 0.35, 0.36 + Math.sin(a0) * 0.35, z], [Math.cos(a1) * 0.35, 0.36 + Math.sin(a1) * 0.35, z], 0.05, 0.05, [0, 0, 1], OAK_DARK);
    }
  }
  for (const z of [-0.36, 0.36]) bar(m, [0.5, 0.58, z], [1.1, 0.05, z], 0.05, 0.05, [0, 0, 1], OAK);
  return finish(m);
}

/** Two crates stacked off-square, a third beside them. */
function cratesOf(): THREE.BufferGeometry {
  const m = newMesh();
  const box = (x: number, y: number, z: number, s: number, col: Rgb) => {
    for (const k of [0.15, 0.5, 0.85]) bar(m, [x - s / 2, y + s * k, z + s / 2], [x + s / 2, y + s * k, z + s / 2], 0.02, s * 0.28, [0, 0, 1], col);
    bar(m, [x, y, z], [x, y + s, z], s, s, [0, 0, 1], mul(col, 0.9));
  };
  box(-0.2, 0, 0, 0.5, CRATE);
  box(-0.17, 0.5, 0.02, 0.44, mul(CRATE, 0.93));
  box(0.32, 0, 0.04, 0.42, mul(CRATE, 1.05));
  return finish(m);
}

const BUILDERS: Readonly<Record<DoorstepFamily, () => THREE.BufferGeometry>> = Object.freeze({
  pots: potsOf, bench: benchOf, bucket: bucketOf, cask: caskOf, logs: logsOf, handcart: handcartOf, crates: cratesOf,
});

/** Build one family's geometry (the caller owns and disposes it; one per family per battlefield). */
export function buildDoorstepFamily(family: DoorstepFamily): THREE.BufferGeometry {
  return BUILDERS[family]();
}
