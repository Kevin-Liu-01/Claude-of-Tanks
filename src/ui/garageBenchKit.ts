import { KitBuilder } from './garageKitGeometry.ts';
import { garageDisplayRect } from './garageDisplayAtlas.ts';

/**
 * K4, workbenches, tables and the bays' stands (garage r9). The fix for "the same tables stuff in all ten": the bench
 * family is built once per garage in its region skin and dressed as a working cell (a vehicle, its stands, tools,
 * parts, power, light and waste together), never one red box per bay. Every piece stands on y = 0, its working face
 * toward +Z. `GARAGE_BENCH_BUDGETS` holds the triangle budgets the kit receipt checks.
 */

export interface KitBenchParams {
  /** Bench length (m). */
  readonly length?: number;
  /** The rugged laptop's screen (an atlas readout or map rect). */
  readonly screen?: string;
  /** Leave the dressing set off (a clean bench). */
  readonly bare?: boolean;
}

type BenchBuilder = (b: KitBuilder, params?: KitBenchParams) => void;

const casters = (b: KitBuilder, w: number, d: number, y = 0.06): void => {
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const z of [-d / 2 + 0.06, d / 2 - 0.06]) {
    b.cylinder(x - 0.02, y, z, y, 0.04, 6, 0x1c1c1c, { axis: 'x' });
  }
};

/** A steel-frame bench: worn hardwood top, drawer pedestal, vice, bins, task lamp, backboard, and its dressing set. */
const workbench: BenchBuilder = (b, params = {}) => {
  const { skin } = b;
  const length = params.length ?? 2.0;
  const half = length / 2;
  const frame = skin.paint;
  for (const x of [-half + 0.05, half - 0.05]) for (const z of [-0.3, 0.3]) b.box(x, 0.43, z, 0.05, 0.86, 0.05, frame, { bevel: 0 });
  b.box(0, 0.12, -0.3, length - 0.1, 0.04, 0.04, frame, { bevel: 0 });
  b.box(0, 0.1, 0, length - 0.1, 0.03, 0.6, frame, { bevel: 0 }); // the lower shelf
  b.box(0, 0.9, 0.02, length, 0.06, 0.72, b.jitter(skin.wood, 0.05), { bevel: 0.01 }); // the hardwood top
  // the drawer pedestal with four drawer fronts and pulls
  b.box(half - 0.32, 0.5, 0.02, 0.5, 0.74, 0.62, frame, { bevel: 0.012 });
  for (let i = 0; i < 4; i += 1) {
    b.box(half - 0.32, 0.22 + i * 0.17, 0.335, 0.46, 0.005, 0.01, 0x1a1b1c, { bevel: 0 });
    b.box(half - 0.32, 0.3 + i * 0.17, 0.34, 0.16, 0.02, 0.02, skin.steel, { bevel: 0 });
  }
  // the vice on the front left corner
  b.box(-half + 0.3, 1.0, 0.3, 0.18, 0.14, 0.24, 0x4a5868, { bevel: 0.01 });
  b.box(-half + 0.3, 1.0, 0.45, 0.2, 0.12, 0.05, 0x4a5868, { bevel: 0.008 });
  b.rod([-half + 0.3, 1.0, 0.48], [-half + 0.3, 1.0, 0.6], 0.012, 6, skin.steel);
  // the backboard: a shadow board with its tools hung in their outlines, a row of bins above
  b.box(0, 1.5, -0.36, length, 1.1, 0.025, 0x3a4044, { bevel: 0 });
  for (let i = 0; i < Math.floor(length / 0.18); i += 1) {
    const x = -half + 0.16 + i * 0.18;
    const tall = i % 3 === 0;
    b.box(x, tall ? 1.42 : 1.48, -0.34, 0.035, tall ? 0.34 : 0.22, 0.015, i % 4 === 1 ? 0x8a3a2c : skin.steel, { bevel: 0 });
  }
  for (let i = 0; i < Math.floor(length / 0.28); i += 1) b.box(-half + 0.2 + i * 0.28, 1.88, -0.27, 0.22, 0.12, 0.16, i % 2 ? 0x2f5a8a : 0xc0602a, { bevel: 0.008 });
  // the LED task lamp on its arm
  b.beam([half - 0.2, 0.93, -0.28], [half - 0.32, 1.45, -0.05], 0.025, 0.025, 0x2a2b2c, { bevel: 0 });
  b.beam([half - 0.32, 1.45, -0.05], [half - 0.6, 1.35, 0.15], 0.025, 0.025, 0x2a2b2c, { bevel: 0 });
  b.box(half - 0.66, 1.32, 0.17, 0.26, 0.04, 0.08, 0x2a2b2c, { bevel: 0.005 });
  b.face([half - 0.78, 1.299, 0.14], [half - 0.54, 1.299, 0.14], [half - 0.54, 1.299, 0.2], [half - 0.78, 1.299, 0.2], garageDisplayRect('glow.warm'));
  if (params.bare) return;
  // the dressing set: tool roll, torque wrench, socket tray, bolt tray, gasket, rags, oil can, the rugged laptop
  const top = 0.93;
  b.box(-0.35, top + 0.02, 0.1, 0.5, 0.04, 0.22, 0x3a2e24, { bevel: 0.01 });
  b.beam([-0.6, top + 0.02, 0.25], [-0.05, top + 0.03, 0.3], 0.025, 0.025, 0x9aa0a4, { bevel: 0 });
  b.box(0.05, top + 0.02, 0.02, 0.32, 0.03, 0.18, 0xb8302a, { bevel: 0.005 });
  b.box(0.42, top + 0.015, 0.22, 0.2, 0.03, 0.14, skin.steel, { bevel: 0.005 });
  b.torus(-0.05, top + 0.006, 0.24, 0.1, 0.006, 10, 3, 0x2a2420, 'y');
  b.box(0.25, top + 0.02, -0.12, 0.2, 0.04, 0.16, 0x8a8478, { bevel: 0.02 });
  b.lathe(0.6, top, -0.1, [[0, 0], [0.05, 0], [0.05, 0.1], [0.012, 0.16], [0, 0.22]], 6, 0xb08a30);
  // the rugged laptop, open, showing a readout
  b.box(-0.05, top + 0.02, -0.12, 0.38, 0.04, 0.26, 0x2a2c2a, { bevel: 0.012 });
  b.push().translate(-0.05, top + 0.04, -0.25).rotateX(-0.25);
  b.box(0, 0.13, 0, 0.38, 0.26, 0.02, 0x2a2c2a, { bevel: 0.008 });
  b.uprightFace(0, 0.13, 0.011, 0.32, 0.2, garageDisplayRect(params.screen ?? 'readout.modules.abrams'));
  b.pop();
};

/** A roll cab on casters: drawer stack, side handle, its top tray. */
const rollCab: BenchBuilder = (b) => {
  const color = b.jitter(b.skin.accent === 0xc39a35 ? 0x6e2621 : b.skin.paint, 0.03);
  b.box(0, 0.55, 0, 0.7, 0.9, 0.46, color, { bevel: 0.015 });
  for (let i = 0; i < 6; i += 1) {
    b.box(0, 0.2 + i * 0.13, 0.232, 0.66, 0.005, 0.008, 0x1a1b1c, { bevel: 0 });
    b.box(0, 0.26 + i * 0.13, 0.24, 0.5, 0.015, 0.015, b.skin.steel, { bevel: 0 });
  }
  b.box(0, 1.02, 0, 0.72, 0.04, 0.48, 0x2a2b2c, { bevel: 0.008 });
  b.beam([0.4, 0.75, -0.15], [0.4, 0.75, 0.15], 0.02, 0.02, b.skin.steel, { bevel: 0 });
  casters(b, 0.66, 0.42);
};

/** A parts trolley: three shelves, corner posts, a push handle and parts on it. */
const partsTrolley: BenchBuilder = (b) => {
  const steel = b.skin.steel;
  for (const y of [0.18, 0.5, 0.82]) b.box(0, y, 0, 0.9, 0.03, 0.55, steel, { bevel: 0 });
  for (const x of [-0.42, 0.42]) for (const z of [-0.25, 0.25]) b.box(x, 0.5, z, 0.03, 0.8, 0.03, steel, { bevel: 0 });
  b.beam([-0.45, 0.9, -0.26], [-0.45, 0.9, 0.26], 0.025, 0.025, steel, { bevel: 0 });
  casters(b, 0.86, 0.5);
  b.cylinder(0.15, 0.835, 0, 0.12, 0.08, 8, 0x4a4c48); // a hub
  b.box(-0.2, 0.86, 0.05, 0.3, 0.06, 0.2, 0x2c2d2e, { bevel: 0, noBottom: true }); // a track shoe
  b.box(0.1, 0.53, 0, 0.5, 0.06, 0.3, 0x3a3c3a, { bevel: 0, noBottom: true });
};

/** A welding cart: welder set, two chained cylinders with regulators, coiled hose and the torch on its hook. */
const weldingCart: BenchBuilder = (b) => {
  const { skin } = b;
  b.box(0, 0.15, 0, 0.6, 0.04, 0.9, skin.steel, { bevel: 0.005 });
  for (const z of [-0.35, 0.35]) b.cylinder(-0.33, 0.12, z, 0.12, 0.06, 8, skin.rubber, { axis: 'x' });
  b.box(0, 0.42, 0.2, 0.5, 0.5, 0.42, 0x2f5a8a, { bevel: 0.02 });
  b.box(0, 0.45, 0.415, 0.4, 0.3, 0.01, 0x1c1d1e, { bevel: 0 });
  for (const x of [-0.13, 0.13]) {
    b.lathe(x, 0.17, -0.22, [[0, 0], [0.11, 0], [0.11, 1.1], [0.05, 1.22], [0, 1.25]], 8, x < 0 ? 0x2a4a5a : 0x5a2a2a);
    b.box(x, 1.47, -0.22, 0.06, 0.08, 0.1, 0x8a7a40, { bevel: 0 }); // regulator
  }
  b.beam([-0.28, 0.9, -0.33], [-0.28, 1.25, -0.33], 0.025, 0.025, skin.steel, { bevel: 0 });
  b.tube([[-0.28, 1.0, -0.36], [0, 0.95, -0.37], [0.28, 1.0, -0.36]], 0.008, 3, 0x3a3a38); // the chain
  b.torus(0.32, 0.6, 0.1, 0.16, 0.018, 10, 3, 0x2a2a2a, 'x'); // coiled lead
  b.beam([0.28, 0.8, 0.3], [0.32, 0.6, 0.42], 0.02, 0.05, 0x2a2b2c, { bevel: 0 }); // the torch
};

/** A fume extractor arm: wall bracket, two jointed tubes and the hood. */
const fumeArm: BenchBuilder = (b) => {
  b.box(0, 2.4, -0.05, 0.2, 0.3, 0.1, 0x2a2b2c, { bevel: 0.01 });
  b.rod([0, 2.4, 0], [0.2, 2.6, 0.9], 0.07, 8, 0xc0a040);
  b.rod([0.2, 2.6, 0.9], [0.3, 1.8, 1.4], 0.065, 8, 0xc0a040);
  b.lathe(0.3, 1.55, 1.45, [[0.2, 0], [0.08, 0.25]], 8, 0x2a2b2c);
};

/** Orange welding screens on their frames, a run of three panels. */
const weldingScreens: BenchBuilder = (b, params = {}) => {
  const length = params.length ?? 3.6;
  const panels = 3, w = length / panels;
  for (let i = 0; i < panels; i += 1) {
    const x = -length / 2 + w / 2 + i * w;
    b.box(x, 1.05, 0, w - 0.08, 1.6, 0.012, 0xb85a1e, { bevel: 0 });
    for (const sx of [-1, 1]) {
      b.box(x + sx * (w / 2 - 0.03), 0.95, 0, 0.03, 1.9, 0.03, 0x2a2b2c, { bevel: 0 });
      b.box(x + sx * (w / 2 - 0.03), 0.015, 0, 0.05, 0.03, 0.6, 0x2a2b2c, { bevel: 0, noBottom: true });
    }
  }
};

/** A stand set: axle stands with pins, timber cribbing, barrel V-blocks, a turret stand, a power-pack stand, drip trays. */
const standSet: BenchBuilder = (b) => {
  const { skin } = b;
  // two axle stands with their pins
  for (const x of [-1.4, -0.9]) {
    b.lathe(x, 0, 0, [[0.18, 0], [0.06, 0.55], [0.05, 0.62]], 6, skin.accent);
    b.rod([x - 0.08, 0.45, 0], [x + 0.08, 0.45, 0], 0.012, 4, skin.steel);
  }
  // cribbing: a criss-cross timber stack
  for (let layer = 0; layer < 3; layer += 1) {
    for (const o of [-0.18, 0.18]) {
      const along = layer % 2 === 0;
      b.box(along ? -0.1 : -0.1 + o, 0.06 + layer * 0.12, along ? o : 0, along ? 0.6 : 0.12, 0.12, along ? 0.12 : 0.6, b.jitter(skin.wood, 0.05), { bevel: 0.006 });
    }
  }
  // barrel V-blocks
  for (const x of [0.5, 1.2]) {
    b.box(x, 0.18, 0, 0.12, 0.36, 0.4, skin.paint, { bevel: 0.01 });
    b.box(x, 0.4, -0.12, 0.13, 0.08, 0.08, skin.paint, { bevel: 0, noBottom: true });
    b.box(x, 0.4, 0.12, 0.13, 0.08, 0.08, skin.paint, { bevel: 0, noBottom: true });
  }
  // a drip tray
  b.box(0.2, 0.02, 0.7, 1.1, 0.04, 0.5, 0x2a2b2c, { bevel: 0, noBottom: true });
};

/** A turret stand: a ring frame on four legs with ring bolts. */
const turretStand: BenchBuilder = (b) => {
  const { skin } = b;
  b.torus(0, 0.8, 0, 1.05, 0.06, 18, 4, skin.accent, 'y');
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.beam([Math.cos(a) * 1.05, 0.8, Math.sin(a) * 1.05], [Math.cos(a) * 1.35, 0.02, Math.sin(a) * 1.35], 0.08, 0.08, skin.accent, { bevel: 0.006 });
    b.box(Math.cos(a) * 1.35, 0.015, Math.sin(a) * 1.35, 0.22, 0.03, 0.22, skin.steel, { bevel: 0, noBottom: true });
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    b.box(Math.cos(a) * 1.05, 0.88, Math.sin(a) * 1.05, 0.05, 0.08, 0.05, skin.steel, { bevel: 0, noBottom: true });
  }
};

/** A power-pack stand: a low frame with saddles and capped hose stubs. */
const powerPackStand: BenchBuilder = (b) => {
  const { skin } = b;
  for (const x of [-1.0, 1.0]) b.box(x, 0.25, 0, 0.12, 0.5, 1.3, skin.accent, { bevel: 0.01 });
  for (const z of [-0.55, 0.55]) b.box(0, 0.45, z, 2.1, 0.1, 0.12, skin.accent, { bevel: 0.01 });
  for (const x of [-0.4, 0.4]) b.cylinder(x, 0.5, 0.62, 0.06, 0.12, 6, 0xb04a2a);
  b.box(0, 0.02, 0, 1.8, 0.04, 1.0, 0x2a2b2c, { bevel: 0, noBottom: true });
};

export const GARAGE_BENCH_BUILDERS: Readonly<Record<string, BenchBuilder>> = Object.freeze({
  workbench, rollCab, partsTrolley, weldingCart, fumeArm, weldingScreens, standSet, turretStand, powerPackStand,
});

export const GARAGE_BENCH_BUDGETS: Readonly<Record<string, number>> = Object.freeze({
  workbench: 1400, rollCab: 400, partsTrolley: 300, weldingCart: 600, fumeArm: 250, weldingScreens: 200, standSet: 600,
  turretStand: 600, powerPackStand: 300,
});

/** Build one bench-family piece by name. */
export function buildGarageBenchPiece(b: KitBuilder, name: string, params: KitBenchParams = {}): number {
  const builder = GARAGE_BENCH_BUILDERS[name];
  if (!builder) throw new Error(`garage bench kit has no piece '${name}'`);
  const start = b.triangleCount;
  builder(b, params);
  return b.triangleCount - start;
}
