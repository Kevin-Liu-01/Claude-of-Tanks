import { KitBuilder, type KitColor } from './garageKitGeometry.ts';
import { garageDisplayRect } from './garageDisplayAtlas.ts';

/**
 * K5, tool and parts clutter (garage r9): authored, bevelled, vertex-AO pieces that take the region skin, replacing
 * the facility's primitive drums, jerrycans and crates. Every builder draws one piece standing on y = 0 with its front
 * toward +Z, into a KitBuilder at the caller's frame; repeated pieces are cheap enough to merge by the dozen into a
 * pack's existing baked bucket (no draw of their own). Stencils on kit (crate and drum codes) are DECAL quads.
 *
 * `GARAGE_PROP_BUDGETS` is the triangle budget per piece (the kit receipt builds each one and checks it).
 */

export interface KitPropParams {
  /** Paint override (otherwise the skin's paint or the piece's own colour). */
  readonly color?: KitColor;
  /** A variant index for pieces with versions (sandbags, crates). */
  readonly variant?: number;
  /** Lying on its side instead of standing (drums, gas cylinders). */
  readonly lying?: boolean;
}

type PropBuilder = (b: KitBuilder, params?: KitPropParams) => void;

const DRUM_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0, 0.012], [0.275, 0.012], [0.29, 0.03], [0.29, 0.28], [0.304, 0.295], [0.29, 0.31], [0.29, 0.57],
  [0.304, 0.585], [0.29, 0.6], [0.29, 0.865], [0.272, 0.88], [0, 0.88],
];

/** 200 L steel drum: rolling hoops, chimes, the bung on its head. */
const drum200: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? b.skin.paint, 0.05);
  if (params.lying) {
    b.push().translate(-0.44, 0.3, 0).rotateZ(-Math.PI / 2);
    b.lathe(0, 0, 0, DRUM_PROFILE, 10, color);
    b.pop();
    return;
  }
  b.lathe(0, 0, 0, DRUM_PROFILE, 10, color);
  b.box(0.15, 0.89, 0.08, 0.06, 0.02, 0.06, 0x2a2b2b, { bevel: 0 });
};

/** 20 L jerrycan: the X pressing, three handles, the spout cap. */
const jerrycan: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? b.skin.paint, 0.05);
  b.box(0, 0.235, 0, 0.165, 0.43, 0.35, color, { bevel: 0.02, noBottom: true });
  for (const s of [-1, 1]) {
    b.beam([s * 0.084, 0.06, -0.15], [s * 0.084, 0.4, 0.15], 0.006, 0.03, color, { bevel: 0 });
    b.beam([s * 0.084, 0.06, 0.15], [s * 0.084, 0.4, -0.15], 0.006, 0.03, color, { bevel: 0 });
  }
  for (const z of [-0.09, 0, 0.09]) b.box(0, 0.47, z, 0.03, 0.05, 0.025, color, { bevel: 0, noBottom: true });
  b.box(0, 0.47, 0.15, 0.05, 0.05, 0.05, 0x26272a, { bevel: 0, noBottom: true });
};

/** Steel ammunition box: lid seam, two latches, the carrying handle. */
const ammoBoxSteel: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? 0x4a503c, 0.04);
  b.box(0, 0.095, 0, 0.3, 0.19, 0.16, color, { bevel: 0.012, noBottom: true });
  b.box(0, 0.165, 0, 0.305, 0.012, 0.165, 0x2e3128, { bevel: 0 });
  for (const x of [-0.09, 0.09]) b.box(x, 0.15, 0.083, 0.03, 0.05, 0.008, 0x2e3128, { bevel: 0, noBottom: true });
  b.box(0, 0.2, 0, 0.12, 0.012, 0.02, 0x2e3128, { bevel: 0, noBottom: true });
};

/** Wooden ammunition crate: battens, rope beckets and a stencilled lot code. */
const ammoCrate: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? b.skin.wood, 0.05);
  const long = params.variant === 1;
  const w = long ? 1.2 : 0.75, d = 0.42, h = 0.36;
  b.box(0, h / 2, 0, w, h, d, color, { bevel: 0.012, noBottom: true });
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) b.box(x, h / 2, 0, 0.06, h + 0.01, d + 0.02, color.clone().multiplyScalar(0.82), { bevel: 0 });
  b.decal([-w * 0.3, 0.08, d / 2 + 0.003], [w * 0.3, 0.08, d / 2 + 0.003], [w * 0.3, 0.2, d / 2 + 0.003], [-w * 0.3, 0.2, d / 2 + 0.003],
    garageDisplayRect('stencil.code'));
};

/** A four-way pallet: stringers, deck and bottom boards. */
const pallet: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? b.skin.wood, 0.06);
  for (const x of [-0.5, 0, 0.5]) b.box(x, 0.07, 0, 0.1, 0.1, 1.0, color.clone().multiplyScalar(0.85), { bevel: 0, noBottom: true });
  for (let i = 0; i < 5; i += 1) b.box(0, 0.132, -0.42 + i * 0.21, 1.2, 0.022, 0.14, color, { bevel: 0, noBottom: true });
  for (const z of [-0.43, 0, 0.43]) b.box(0, 0.011, z, 1.2, 0.022, 0.14, color.clone().multiplyScalar(0.78), { bevel: 0, noBottom: true });
};

/** A road wheel: the rubber tyre, the disc and its hub. */
const roadWheel: PropBuilder = (b, params = {}) => {
  const lying = params.lying ?? true;
  b.push();
  if (lying) b.translate(0, 0, 0); else b.translate(0, 0.35, 0).rotateX(Math.PI / 2);
  b.lathe(0, 0, 0, [[0.28, 0], [0.345, 0.012], [0.35, 0.05], [0.35, 0.12], [0.345, 0.158], [0.28, 0.17]], 12, b.skin.rubber);
  b.lathe(0, 0, 0, [[0, 0.03], [0.28, 0.03]], 12, b.skin.paint);
  b.lathe(0, 0, 0, [[0.28, 0.14], [0.11, 0.14], [0.1, 0.19], [0, 0.19]], 12, [b.skin.paint, b.skin.steel, b.skin.steel]);
  b.pop();
};

/** A pallet of track links: two runs of shoes with their end connectors. */
const trackPallet: PropBuilder = (b) => {
  pallet(b);
  for (let layer = 0; layer < 2; layer += 1) {
    for (let i = 0; i < 6; i += 1) {
      const y = 0.15 + layer * 0.1;
      b.box(0, y + 0.04, -0.42 + i * 0.168, 0.66, 0.07, 0.15, 0x2c2d2e, { bevel: 0, noBottom: true });
      if (i % 2 === 0) b.box(0.36, y + 0.045, -0.34 + i * 0.168, 0.05, 0.05, 0.32, 0x1f2021, { bevel: 0, noBottom: true });
    }
  }
};

/** A tow bar with its two eyes. */
const towBar: PropBuilder = (b) => {
  b.beam([-1.3, 0.06, 0], [1.3, 0.06, 0], 0.1, 0.1, b.skin.paint, { bevel: 0.01 });
  for (const x of [-1.42, 1.42]) b.torus(x, 0.06, 0, 0.12, 0.03, 6, 3, b.skin.steel, 'y');
};

/** A pair of wheel chocks on their rope. */
const chocks: PropBuilder = (b) => {
  for (const x of [-0.2, 0.2]) {
    const c = b.skin.accent;
    b.polygon([[x - 0.08, 0, 0.14], [x + 0.08, 0, 0.14], [x + 0.08, 0.12, -0.14], [x - 0.08, 0.12, -0.14]], c, [0, 1, 1]);
    b.polygon([[x - 0.08, 0, -0.14], [x - 0.08, 0.12, -0.14], [x + 0.08, 0.12, -0.14], [x + 0.08, 0, -0.14]], c, [0, 0, -1]);
    b.polygon([[x - 0.08, 0, 0.14], [x - 0.08, 0.12, -0.14], [x - 0.08, 0, -0.14]], c, [-1, 0, 0]);
    b.polygon([[x + 0.08, 0, 0.14], [x + 0.08, 0, -0.14], [x + 0.08, 0.12, -0.14]], c, [1, 0, 0]);
  }
  b.tube([[-0.12, 0.08, -0.1], [0, 0.02, -0.2], [0.12, 0.08, -0.1]], 0.008, 4, 0x8a7a5a);
};

/** A traffic cone on its square foot, with a reflective collar. */
const cone: PropBuilder = (b) => {
  b.box(0, 0.015, 0, 0.36, 0.03, 0.36, 0x1d1d1d, { bevel: 0, noBottom: true });
  b.lathe(0, 0.03, 0, [[0.14, 0], [0.105, 0.24], [0.09, 0.32], [0.04, 0.68], [0, 0.69]], 8, [0xc25a24, 0xd8d6cc, 0xc25a24, 0xc25a24]);
};

/** A steel bollard, its yellow and black bands. */
const bollard: PropBuilder = (b) => {
  b.lathe(0, 0, 0, [[0.11, 0], [0.11, 0.6], [0.11, 0.78], [0.09, 0.86], [0, 0.88]], 10, [b.skin.accent, 0x1c1c1c, b.skin.accent, b.skin.accent]);
};

/** A fire extinguisher: the red body, its valve and the hose. */
const extinguisher: PropBuilder = (b) => {
  b.lathe(0, 0, 0, [[0, 0], [0.08, 0], [0.08, 0.48], [0.05, 0.54], [0, 0.56]], 8, 0xa8302a);
  b.box(0, 0.6, 0, 0.03, 0.08, 0.1, 0x1c1c1c, { bevel: 0 });
  b.tube([[0, 0.58, 0.05], [0.07, 0.5, 0.09], [0.09, 0.3, 0.06]], 0.008, 4, 0x1c1c1c);
};

/** A gas cylinder with its shoulder, valve and guard. */
const gasCylinder: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? 0x4a5a6a, 0.04);
  b.lathe(0, 0, 0, [[0, 0], [0.115, 0], [0.115, 1.2], [0.06, 1.33], [0, 1.36]], 8, color);
  b.cylinder(0, 1.36, 0, 0.025, 0.08, 6, 0x8a7a40);
  b.box(0, 1.46, 0, 0.1, 0.02, 0.02, 0x2a2a2a, { bevel: 0 });
};

/** A cable reel: two flanges, the drum and the wound cable. */
const cableReel: PropBuilder = (b) => {
  b.push().translate(0, 0.4, -0.2);
  for (const z of [0, 0.36]) b.cylinder(0, 0, z, 0.4, 0.04, 12, b.skin.wood, { axis: 'z' });
  b.cylinder(0, 0, 0.04, 0.27, 0.32, 12, 0x1d1e1f, { axis: 'z' });
  b.pop();
};

/** A coiled air or fuel hose lying flat. */
const coiledHose: PropBuilder = (b, params = {}) => {
  const color = params.color ?? 0x1e2a3a;
  b.torus(0, 0.03, 0, 0.32, 0.03, 12, 4, color, 'y');
  b.torus(0, 0.08, 0, 0.27, 0.03, 12, 4, color, 'y');
};

/** A tarp-draped stack: kit under a lashed tarpaulin on pallets. */
const tarpStack: PropBuilder = (b, params = {}) => {
  pallet(b);
  const tarp = b.jitter(params.color ?? b.skin.canvas, 0.04);
  b.box(0, 0.6, 0, 1.24, 0.9, 1.05, tarp, { bevel: 0.14, noBottom: true });
  for (const z of [-0.3, 0.3]) b.tube([[-0.64, 0.16, z], [-0.64, 1.0, z], [0.64, 1.0, z], [0.64, 0.16, z]], 0.01, 4, 0x2a2a28);
};

/** A sandbag (three lumpy variants). */
const sandbag: PropBuilder = (b, params = {}) => {
  const v = (params.variant ?? 0) % 3;
  const color = b.jitter(params.color ?? 0x8a7c5c, 0.06);
  b.box(0, 0.075, 0, [0.62, 0.58, 0.6][v], 0.15, [0.34, 0.36, 0.32][v], color, { bevel: 0.05 });
};

/** A towable diesel generator set on its skid. */
const generator: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? b.skin.paint, 0.03);
  for (const x of [-0.45, 0.45]) b.box(x, 0.06, 0, 0.1, 0.12, 2.0, 0x2a2b2c, { bevel: 0.01, noBottom: true });
  b.box(0, 0.65, 0, 1.05, 1.06, 1.9, color, { bevel: 0.03, noBottom: true });
  for (let i = 0; i < 6; i += 1) b.box(0.53, 0.5 + i * 0.06, 0.55, 0.01, 0.025, 0.55, 0x1c1d1e, { bevel: 0 });
  b.box(0.53, 0.72, -0.5, 0.01, 0.4, 0.45, 0x2e3133, { bevel: 0 });
  b.cylinder(-0.3, 1.18, -0.6, 0.05, 0.32, 8, 0x2a2b2b);
  b.box(0, 1.2, 0, 0.12, 0.08, 0.04, b.skin.steel, { bevel: 0 });
  b.tube([[0.4, 0.3, -0.95], [0.6, 0.05, -1.3], [0.9, 0.02, -1.6]], 0.02, 4, 0x1c1c1c);
};

/** A towable air compressor: receiver, motor, guard and wheels. */
const compressor: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? b.skin.accent, 0.04);
  b.cylinder(-0.5, 0.42, 0, 0.26, 1.2, 12, color, { axis: 'x', bevel: 0.03 });
  b.box(0.05, 0.85, 0, 0.6, 0.4, 0.42, 0x2e3133, { bevel: 0.02 });
  b.cylinder(-0.35, 0.85, 0, 0.14, 0.3, 10, 0x2e3133, { axis: 'x' });
  for (const z of [-0.32, 0.32]) b.cylinder(0.45, 0.18, z - 0.05, 0.18, 0.1, 10, b.skin.rubber, { axis: 'z' });
  b.beam([-0.7, 0.3, 0], [-1.3, 0.22, 0], 0.06, 0.06, b.skin.steel, { bevel: 0 });
};

/** A towable light tower: trailer, outriggers, the mast and four lamp heads (their lenses glow). */
const lightTower: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? b.skin.paint, 0.03);
  b.box(0, 0.65, 0, 1.3, 0.9, 2.2, color, { bevel: 0.03, noBottom: true });
  for (const z of [-0.5, 0.5]) b.cylinder(0.72, 0.32, z - 0.08, 0.3, 0.16, 12, b.skin.rubber, { axis: 'x' });
  b.beam([0, 0.4, 1.1], [0, 0.32, 1.9], 0.08, 0.08, b.skin.steel, { bevel: 0 });
  for (const s of [-1, 1]) {
    b.beam([s * 0.6, 0.4, -0.8], [s * 1.3, 0.2, -0.8], 0.08, 0.08, b.skin.steel, { bevel: 0 });
    b.box(s * 1.3, 0.06, -0.8, 0.2, 0.12, 0.2, b.skin.steel, { bevel: 0 });
  }
  const mastTop = 6.5;
  b.box(0, (1.1 + mastTop) / 2, -0.7, 0.16, mastTop - 1.1, 0.16, b.skin.steel, { bevel: 0.01 });
  b.box(0, mastTop, -0.7, 1.4, 0.08, 0.12, b.skin.steel, { bevel: 0 });
  const warm = garageDisplayRect('glow.warm');
  for (const [x, y] of [[-0.45, 0.3], [0.45, 0.3], [-0.45, -0.18], [0.45, -0.18]] as const) {
    b.box(x, mastTop + y, -0.62, 0.38, 0.3, 0.12, 0x2a2b2c, { bevel: 0.01 });
    b.face([x - 0.16, mastTop + y - 0.12, -0.555], [x + 0.16, mastTop + y - 0.12, -0.555], [x + 0.16, mastTop + y + 0.12, -0.555], [x - 0.16, mastTop + y + 0.12, -0.555], warm);
  }
  b.tube([[0.08, 1.1, -0.62], [0.1, mastTop - 0.2, -0.62]], 0.012, 4, 0x1c1c1c);
};

/** A parked counterbalance forklift: forks lowered to the floor, the overhead guard, no driver. */
const forklift: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? b.skin.accent, 0.03);
  const dark = 0x232526;
  // chassis and counterweight
  b.box(0, 0.5, -0.2, 1.1, 0.55, 1.9, color, { bevel: 0.04 });
  b.box(0, 0.62, -1.05, 1.12, 0.75, 0.5, 0x2d2f30, { bevel: 0.06 });
  // wheels
  for (const s of [-1, 1]) {
    b.cylinder(s * 0.62 - (s > 0 ? 0.24 : 0), 0.32, 0.45, 0.32, 0.24, 12, b.skin.rubber, { axis: 'x' });
    b.cylinder(s * 0.6 - (s > 0 ? 0.2 : 0), 0.26, -0.8, 0.26, 0.2, 12, b.skin.rubber, { axis: 'x' });
  }
  // seat, steering column and wheel
  b.box(0, 1.0, -0.45, 0.45, 0.12, 0.45, 0x1d1e1f, { bevel: 0.03 });
  b.box(0, 1.25, -0.66, 0.45, 0.45, 0.1, 0x1d1e1f, { bevel: 0.03 });
  b.beam([0, 0.8, 0.25], [0, 1.25, 0.05], 0.06, 0.06, dark, { bevel: 0 });
  b.torus(0, 1.27, 0.03, 0.17, 0.018, 10, 4, dark, 'y');
  // overhead guard
  for (const [x, z] of [[-0.48, 0.2], [0.48, 0.2], [-0.48, -0.9], [0.48, -0.9]] as const) b.box(x, 1.45, z, 0.06, 1.8, 0.06, dark, { bevel: 0 });
  b.box(0, 2.36, -0.35, 1.04, 0.05, 1.2, dark, { bevel: 0.01 });
  for (let i = 0; i < 5; i += 1) b.box(0, 2.32, -0.85 + i * 0.25, 1.0, 0.03, 0.04, dark, { bevel: 0 });
  // mast and carriage, forks flat on the floor
  for (const x of [-0.38, 0.38]) b.box(x, 1.25, 0.82, 0.08, 2.3, 0.12, dark, { bevel: 0.01 });
  for (const y of [0.4, 2.3]) b.box(0, y, 0.82, 0.84, 0.08, 0.1, dark, { bevel: 0 });
  b.box(0, 0.25, 0.92, 0.9, 0.4, 0.05, dark, { bevel: 0.01 });
  for (const x of [-0.28, 0.28]) {
    b.box(x, 0.25, 0.96, 0.1, 0.42, 0.04, 0x3a3c3e, { bevel: 0 });
    b.box(x, 0.022, 1.5, 0.1, 0.045, 1.1, 0x3a3c3e, { bevel: 0.005 });
  }
  b.cylinder(0.3, 0.6, 0.86, 0.04, 1.6, 8, 0xb0b4b6); // lift cylinder
};

/** A pallet jack, its forks and tiller. */
const palletJack: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? 0xb8302a, 0.03);
  for (const x of [-0.27, 0.27]) b.box(x, 0.045, 0.45, 0.16, 0.07, 1.15, color, { bevel: 0.01, noBottom: true });
  b.box(0, 0.12, -0.15, 0.7, 0.14, 0.2, color, { bevel: 0.02 });
  b.cylinder(0, 0.2, -0.22, 0.07, 0.3, 8, 0x3a3c3e);
  b.beam([0, 0.45, -0.25], [0, 1.15, -0.55], 0.04, 0.04, color, { bevel: 0 });
  b.torus(0, 1.2, -0.58, 0.1, 0.018, 8, 3, 0x1c1c1c, 'x');
  for (const x of [-0.12, 0.12]) b.cylinder(x - 0.04, 0.09, -0.2, 0.09, 0.08, 8, 0x1c1c1c, { axis: 'x' });
};

/** A bunded oil rack: the spill tray, a two-shelf frame, drums lying in cradles and their hand pumps. */
const oilRack: PropBuilder = (b) => {
  const { skin } = b;
  const tray = skin.accent;
  b.box(0, 0.12, 0, 1.5, 0.24, 1.0, tray, { bevel: 0.015, noBottom: true });
  for (const [x, z] of [[-0.7, -0.45], [0.7, -0.45], [-0.7, 0.45], [0.7, 0.45]] as const) b.box(x, 0.85, z, 0.05, 1.3, 0.05, skin.steel, { bevel: 0 });
  for (const y of [0.55, 1.15]) b.box(0, y, 0, 1.46, 0.04, 0.96, skin.steel, { bevel: 0 });
  b.push().translate(0, 0.62, 0);
  for (const x of [-0.35, 0.35]) {
    b.push().translate(x, 0.29, -0.44).rotateX(Math.PI / 2);
    b.lathe(0, 0, 0, DRUM_PROFILE, 10, b.jitter(x < 0 ? 0x2c4a6a : 0x6a2c2a, 0.04));
    b.pop();
  }
  b.pop();
  for (const x of [-0.35, 0.35]) {
    b.cylinder(x, 1.17, 0.3, 0.025, 0.4, 6, 0x3a3c3e);
    b.box(x, 1.6, 0.3, 0.08, 0.1, 0.1, 0x2a2b2c, { bevel: 0 });
  }
};

/** A spill-kit bin: lidded, its pictogram plate. */
const spillBin: PropBuilder = (b) => {
  b.box(0, 0.4, 0, 0.8, 0.8, 0.6, 0xd8b23a, { bevel: 0.03, noBottom: true });
  b.box(0, 0.82, 0, 0.84, 0.05, 0.64, 0x2a2b2c, { bevel: 0.015 });
  b.uprightFace(0, 0.5, 0.301, 0.3, 0.3, garageDisplayRect('picto.flammable'));
};

/** A skip: its sloped ends, rim and lifting lugs. */
const skip: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? b.skin.paint, 0.04);
  const bw = 1.7, tw = 1.9, bl = 1.6, tl = 3.2, h = 1.1;
  const B = (x: number, z: number): [number, number, number] => [x, 0.08, z];
  const T = (x: number, z: number): [number, number, number] => [x, h, z];
  b.polygon([B(-bw / 2, -bl / 2), B(bw / 2, -bl / 2), T(tw / 2, -tl / 2), T(-tw / 2, -tl / 2)], color, [0, 0.6, -1]);
  b.polygon([B(-bw / 2, bl / 2), T(-tw / 2, tl / 2), T(tw / 2, tl / 2), B(bw / 2, bl / 2)], color, [0, 0.6, 1]);
  b.polygon([B(bw / 2, -bl / 2), B(bw / 2, bl / 2), T(tw / 2, tl / 2), T(tw / 2, -tl / 2)], color, [1, 0, 0]);
  b.polygon([B(-bw / 2, -bl / 2), T(-tw / 2, -tl / 2), T(-tw / 2, tl / 2), B(-bw / 2, bl / 2)], color, [-1, 0, 0]);
  b.polygon([B(-bw / 2, -bl / 2), B(-bw / 2, bl / 2), B(bw / 2, bl / 2), B(bw / 2, -bl / 2)], 0x2a2724, [0, 1, 0]);
  b.box(0, h, 0, tw + 0.08, 0.08, tl + 0.08, color, { bevel: 0.01 });
  for (const x of [-1, 1]) b.box(x * (tw / 2 + 0.06), h - 0.3, 0, 0.1, 0.16, 0.5, color, { bevel: 0.01 });
  for (const z of [-0.6, 0.6]) b.box(0, 0.04, z, bw, 0.08, 0.16, 0x2a2b2c, { bevel: 0, noBottom: true });
  // its scrap
  for (let i = 0; i < 5; i += 1) b.box(-0.6 + i * 0.3, h - 0.06, -0.8 + (i % 2) * 1.2, 0.5, 0.06, 0.12, 0x5a4a40, { bevel: 0 });
};

/** A fuel bowser: the tank on its chassis, hose reel, nozzle, ladder and drawbar. */
const bowser: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? b.skin.paint, 0.03);
  b.box(0, 0.48, 0, 1.4, 0.14, 3.6, 0x232526, { bevel: 0.01 });
  b.push().translate(0, 1.15, -1.55).rotateX(Math.PI / 2);
  b.lathe(0, 0, 0, [[0, 0], [0.6, 0], [0.68, 0.08], [0.68, 3.0], [0.6, 3.1], [0, 3.1]], 14, color);
  b.pop();
  for (const z of [-1.2, 0, 1.2]) b.torus(0, 1.15, z, 0.69, 0.02, 14, 3, 0x2a2b2c, 'z');
  b.box(0, 1.86, 0, 0.5, 0.08, 0.5, 0x2a2b2c, { bevel: 0.01 }); // manlid
  for (const x of [-0.25, 0.25]) b.box(x, 1.95, 0, 0.03, 0.18, 1.6, b.skin.accent, { bevel: 0 }); // walkway rail
  for (const z of [-0.4, 0.4]) for (const s of [-1, 1]) b.cylinder(s * 0.72 - (s > 0 ? 0.18 : 0), 0.38, z, 0.38, 0.18, 12, b.skin.rubber, { axis: 'x' });
  b.box(0, 0.72, 0, 1.5, 0.08, 1.4, 0x2a2b2c, { bevel: 0.01 }); // mudguards
  // the rear cabinet with its reel and the hose run to a nozzle hung on its hook
  b.box(0, 0.95, 1.95, 1.3, 0.85, 0.4, color.clone().multiplyScalar(0.9), { bevel: 0.02 });
  b.cylinder(-0.35, 0.95, 2.18, 0.28, 0.12, 12, 0x1c1c1c, { axis: 'z' });
  b.tube([[-0.35, 0.7, 2.3], [-0.1, 0.3, 2.45], [0.35, 0.65, 2.18]], 0.02, 4, 0x1c1c1c);
  b.box(0.35, 0.7, 2.18, 0.08, 0.16, 0.06, 0x2a2b2c, { bevel: 0 });
  for (let y = 0.6; y < 1.8; y += 0.3) b.box(0.55, y, 2.2, 0.3, 0.03, 0.03, b.skin.steel, { bevel: 0 }); // ladder
  b.beam([0, 0.45, -1.8], [0, 0.4, -2.7], 0.1, 0.1, b.skin.steel, { bevel: 0 });
  b.decal([0.705, 1.2, -0.3], [0.705, 1.2, 0.3], [0.705, 1.42, 0.3], [0.705, 1.42, -0.3], garageDisplayRect('stencil.fuel'));
  b.uprightFace(0.4, 1.0, 2.151, 0.24, 0.24, garageDisplayRect('picto.nosmoking'));
};

/** A gas-cylinder cage: frame, mesh, chain and the cylinders inside. */
const gasCage: PropBuilder = (b) => {
  const steel = b.skin.steel;
  for (const [x, z] of [[-0.75, -0.4], [0.75, -0.4], [-0.75, 0.4], [0.75, 0.4]] as const) b.box(x, 0.9, z, 0.05, 1.8, 0.05, steel, { bevel: 0 });
  for (const y of [0.05, 1.78]) b.box(0, y, 0, 1.55, 0.04, 0.85, steel, { bevel: 0 });
  for (let x = -0.45; x <= 0.46; x += 0.3) b.box(x, 0.9, -0.41, 0.012, 1.72, 0.012, steel, { bevel: 0 });
  for (let y = 0.45; y < 1.7; y += 0.45) b.box(0, y, -0.41, 1.5, 0.012, 0.012, steel, { bevel: 0 });
  for (let i = 0; i < 4; i += 1) {
    b.at(-0.48 + i * 0.32, 0.07, 0, 0, () => gasCylinder(b, { color: i % 2 ? 0x2a4a5a : 0x5a3a2a }));
  }
  b.tube([[-0.75, 1.1, 0.42], [0, 1.0, 0.44], [0.75, 1.1, 0.42]], 0.01, 4, 0x2a2a2a);
};

/** A tank-transporter low-loader: deck, gooseneck, axles, ramps down, timber blocks and chains. */
const lowLoader: PropBuilder = (b, params = {}) => {
  const color = b.jitter(params.color ?? b.skin.paint, 0.03);
  const deckY = 1.0;
  b.box(0, deckY, 0, 3.2, 0.2, 9.0, color, { bevel: 0.03 });
  for (const x of [-1.0, 1.0]) b.ibeam([x, deckY - 0.3, -4.4], [x, deckY - 0.3, 4.4], 0.4, 0.2, 0x232526);
  // the gooseneck up to the fifth wheel
  b.box(0, deckY + 0.55, 5.2, 2.6, 0.3, 1.8, color, { bevel: 0.03 });
  b.beam([0, deckY + 0.05, 4.4], [0, deckY + 0.55, 4.6], 2.6, 0.3, color, { bevel: 0.02 });
  b.box(0, deckY + 0.05, 6.4, 1.2, 0.8, 0.8, 0x232526, { bevel: 0.03 });
  // four axle lines
  for (let i = 0; i < 4; i += 1) {
    const z = -3.8 + i * 1.3;
    for (const s of [-1, 1]) {
      b.cylinder(s * 1.15 - (s > 0 ? 0.5 : 0), 0.5, z, 0.5, 0.5, 12, b.skin.rubber, { axis: 'x' });
      b.cylinder(s * 1.15 - (s > 0 ? 0.52 : -0.02), 0.5, z, 0.25, 0.52, 10, b.skin.steel, { axis: 'x' });
    }
  }
  // ramps down at the rear, timber blocks and chains
  for (const x of [-1.0, 1.0]) b.beam([x, deckY + 0.05, -4.5], [x, 0.04, -7.2], 0.9, 0.12, color, { bevel: 0.02 });
  for (const [x, z] of [[-1.2, -2.5], [1.2, -2.5], [-1.2, 2.2], [1.2, 2.2]] as const) b.box(x, deckY + 0.22, z, 0.3, 0.24, 0.6, b.skin.wood, { bevel: 0.01 });
  for (const [x, z] of [[-1.5, -3.2], [1.5, 3.0]] as const) b.tube(KitBuilder.catenary([x, deckY + 0.12, z], [x - Math.sign(x) * 0.3, deckY + 0.12, z + 1.2], 0.15, 5), 0.02, 4, 0x3a3a38);
  for (const z of [-4.48, 4.48]) b.box(0, deckY - 0.05, z, 3.2, 0.06, 0.04, b.skin.accent, { bevel: 0 });
};

/** Every clutter piece by name. */
export const GARAGE_PROP_BUILDERS: Readonly<Record<string, PropBuilder>> = Object.freeze({
  drum200, jerrycan, ammoBoxSteel, ammoCrate, pallet, roadWheel, trackPallet, towBar, chocks, cone, bollard,
  extinguisher, gasCylinder, cableReel, coiledHose, tarpStack, sandbag, generator, compressor, lightTower, forklift,
  palletJack, oilRack, spillBin, skip, bowser, gasCage, lowLoader,
});

/**
 * The triangle budget per piece (design K5; the receipt allows 25 % slack for the AO bands and bevels). The extinguisher
 * and the cylinder cage carry 20 and 100 more than the design sheet: their lathed bodies need the bands to read round.
 */
export const GARAGE_PROP_BUDGETS: Readonly<Record<string, number>> = Object.freeze({
  drum200: 180, jerrycan: 120, ammoBoxSteel: 90, ammoCrate: 80, pallet: 120, roadWheel: 200, trackPallet: 300,
  towBar: 120, chocks: 40, cone: 60, bollard: 80, extinguisher: 80, gasCylinder: 80, cableReel: 160, coiledHose: 160,
  tarpStack: 300, sandbag: 40, generator: 500, compressor: 450, lightTower: 900, forklift: 1800, palletJack: 250,
  oilRack: 900, spillBin: 120, skip: 300, bowser: 1600, gasCage: 500, lowLoader: 1500,
});

/** Build one clutter piece by name. */
export function buildGarageProp(b: KitBuilder, name: string, params: KitPropParams = {}): number {
  const builder = GARAGE_PROP_BUILDERS[name];
  if (!builder) throw new Error(`garage prop kit has no piece '${name}'`);
  const start = b.triangleCount;
  builder(b, params);
  return b.triangleCount - start;
}
