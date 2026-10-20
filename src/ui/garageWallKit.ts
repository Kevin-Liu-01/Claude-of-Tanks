import { KitBuilder } from './garageKitGeometry.ts';
import { garageDisplayRect } from './garageDisplayAtlas.ts';

/**
 * K2, wall systems (garage r9). Outdoor perimeter runs follow a polyline on the ground, each module standing on a
 * footing whose base darkens into the ground (the builder's AO), replacing the white box walls; Verdant's hall gets
 * insulated liner panels, a blockwork dado with the brand-accent stripe, column protectors and a full set of services in
 * every structural bay. Brick, render, planks and granite are the pack's own textured buckets (`surfaceBox`), so a
 * brick yard wall reads as brick at no extra draw; murals and mesh banners are atlas faces.
 *
 * Budgets (triangles): HESCO 70/m, T-wall 48/panel, Heras 30/m, brick wall 50/m, palisade 40/m, gabions 40/m,
 * quay coping 30/m, kerb 16/m; indoor walls 9,000 per hall.
 */

export type KitWallKind = 'hesco' | 'twall' | 'heras' | 'brick' | 'palisade' | 'gabion' | 'quay' | 'kerb';

export interface KitWallRunParams {
  /** Atlas rect for murals (T-walls) or mesh banners (HESCO, Heras), and how many modules apart they repeat. */
  readonly mural?: string;
  readonly muralEvery?: number;
  /** Module height override (m). */
  readonly height?: number;
  /** Brick wall pier spacing (m). */
  readonly pierEvery?: number;
}

export const GARAGE_WALL_BUDGETS: Readonly<Record<KitWallKind, number>> = Object.freeze({
  hesco: 70, twall: 48, heras: 30, brick: 50, palisade: 40, gabion: 40, quay: 30, kerb: 16,
});

/**
 * A mural on a module's face (the frame's +Z face at z): a stencil ('stencil.*', paint with alpha) is a DECAL painted on
 * the concrete; a banner or crest rect is an atlas face (DISPLAY-LIT).
 */
function mural(b: KitBuilder, rect: string, cx: number, cy: number, z: number, w: number, h: number): void {
  if (rect.startsWith('stencil.')) {
    b.decal([cx - w / 2, cy - h / 2, z + 0.004], [cx + w / 2, cy - h / 2, z + 0.004], [cx + w / 2, cy + h / 2, z + 0.004],
      [cx - w / 2, cy + h / 2, z + 0.004], garageDisplayRect(rect));
  } else {
    b.uprightFace(cx, cy, z + 0.002, w, h, garageDisplayRect(rect));
  }
}

/** Walk a polyline in metre steps of `module`, calling `place(x, z, yaw, index)` at each module centre. */
function walk(points: ReadonlyArray<readonly [number, number]>, module: number,
  place: (x: number, z: number, yaw: number, index: number, along: number) => void): number {
  let index = 0, total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const length = Math.hypot(x1 - x0, z1 - z0);
    const count = Math.max(1, Math.round(length / module));
    const step = length / count;
    const yaw = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2; // module local +X runs along the wall
    for (let k = 0; k < count; k += 1) {
      const t = (k + 0.5) / count;
      place(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, yaw, index, step);
      index += 1;
    }
    total += length;
  }
  return total;
}

/** Build one perimeter run along `points` ([x, z] pairs on the ground); returns its length in metres. */
export function buildWallRun(b: KitBuilder, kind: KitWallKind, points: ReadonlyArray<readonly [number, number]>,
  params: KitWallRunParams = {}): number {
  const { skin } = b;
  const muralEvery = params.muralEvery ?? 4;
  switch (kind) {
    case 'hesco': {
      const h = params.height ?? 1.37;
      return walk(points, 1.0, (x, z, yaw, index, step) => b.at(x, 0, z, yaw, () => {
        // the geotextile-lined mesh cage, its fill showing at the top, a lip of fabric over the rim
        b.box(0, h / 2, 0, step - 0.02, h, 1.0, b.jitter(0xa69a7a, 0.03), { bevel: 0, noBottom: true });
        b.box(0, h + 0.015, 0, step - 0.1, 0.03, 0.9, skin.ground, { bevel: 0, noBottom: true });
        for (const fx of [-0.3, 0.3]) b.box(fx * step, h / 2, 0.505, 0.02, h, 0.01, 0x6a6c64, { bevel: 0 });
        b.box(0, h * 0.5, 0.506, step - 0.04, 0.02, 0.01, 0x6a6c64, { bevel: 0 });
        if (index % 2 === 0) b.box(0, h + 0.1, 0, 0.6, 0.15, 0.34, 0x8a7c5c, { bevel: 0.05 });
        if (params.mural && index % muralEvery === 0) mural(b, params.mural, 0, h * 0.55, 0.51, step * 0.96, h * 0.5);
      }));
    }
    case 'twall': {
      const h = params.height ?? 3.6;
      return walk(points, 1.2, (x, z, yaw, index, step) => b.at(x, 0, z, yaw, () => {
        b.box(0, 0.2, 0, step - 0.02, 0.4, 1.4, b.jitter(skin.concrete, 0.025), { bevel: 0, noBottom: true });
        b.box(0, 0.4 + (h - 0.4) / 2, 0, step - 0.03, h - 0.4, 0.26, b.jitter(skin.concrete, 0.025), { bevel: 0.03, noBottom: true });
        b.box(0, h + 0.05, 0, 0.3, 0.1, 0.06, skin.steel, { bevel: 0, noBottom: true }); // lifting eye
        if (params.mural && index % muralEvery === 0) {
          const wide = params.mural.includes('wordmark') || params.mural.includes('banner.h');
          mural(b, params.mural, 0, h * 0.55, 0.13, step * 0.92, wide ? step * 0.92 * 0.19 : step * 0.92);
        }
      }));
    }
    case 'heras': {
      return walk(points, 3.5, (x, z, yaw, index, step) => b.at(x, 0, z, yaw, () => {
        const steel = 0x9aa0a2;
        for (const fx of [-step / 2 + 0.03, step / 2 - 0.03]) {
          b.box(fx, 1.0, 0, 0.04, 2.0, 0.04, steel, { bevel: 0 });
          b.box(fx, 0.07, 0, 0.18, 0.14, 0.62, skin.concrete, { bevel: 0.02, noBottom: true });
        }
        for (const y of [0.1, 1.98]) b.box(0, y, 0, step - 0.06, 0.03, 0.03, steel, { bevel: 0 });
        for (let k = 1; k < 4; k += 1) b.box(-step / 2 + (k / 4) * step, 1.0, 0, 0.012, 1.9, 0.012, steel, { bevel: 0 });
        b.box(0, 1.0, 0, step - 0.06, 0.012, 0.012, steel, { bevel: 0 });
        if (params.mural && index % muralEvery === 0) mural(b, params.mural, 0, 1.05, 0.028, step - 0.2, 1.4);
      }));
    }
    case 'brick': {
      const h = params.height ?? 2.2;
      const pierEvery = params.pierEvery ?? 3.0;
      return walk(points, pierEvery, (x, z, yaw, _index, step) => b.at(x, 0, z, yaw, () => {
        b.surfaceBox('stone', 0, h / 2, 0, step, h, 0.23, 1.2, { noBottom: true });
        b.surfaceBox('stone', -step / 2, (h + 0.15) / 2, 0, 0.45, h + 0.15, 0.4, 1.2, { noBottom: true });
        b.box(0, h + 0.04, 0, step, 0.08, 0.3, b.jitter(skin.concrete, 0.02), { bevel: 0.01 }); // coping
        b.box(-step / 2, h + 0.2, 0, 0.5, 0.08, 0.46, b.jitter(skin.concrete, 0.02), { bevel: 0.01 }); // pier cap
      }));
    }
    case 'palisade': {
      const h = params.height ?? 2.0;
      return walk(points, 2.4, (x, z, yaw, _index, step) => b.at(x, 0, z, yaw, () => {
        const boards = Math.round(step / 0.25);
        for (let k = 0; k < boards; k += 1) {
          b.surfaceBox('wood', -step / 2 + (k + 0.5) * (step / boards), h / 2 + (k % 2) * 0.04, 0.03, step / boards - 0.02, h, 0.03, 2, { noBottom: true });
        }
        for (const y of [0.4, h - 0.3]) b.surfaceBox('wood', 0, y, -0.03, step, 0.09, 0.05, 2);
        b.surfaceBox('wood', -step / 2, h / 2, -0.08, 0.1, h + 0.1, 0.1, 2, { noBottom: true });
      }));
    }
    case 'gabion': {
      const h = params.height ?? 1.0;
      return walk(points, 2.0, (x, z, yaw, _index, step) => b.at(x, 0, z, yaw, () => {
        b.box(0, h / 2, 0, step - 0.02, h, 1.0, b.jitter(0x8c867a, 0.04), { bevel: 0, noBottom: true });
        for (let k = 1; k < 4; k += 1) b.box(-step / 2 + (k / 4) * step, h / 2, 0.505, 0.012, h, 0.01, 0x6a6c68, { bevel: 0 });
        b.box(0, h / 2, 0.506, step, 0.012, 0.01, 0x6a6c68, { bevel: 0 });
      }));
    }
    case 'quay': {
      return walk(points, 1.2, (x, z, yaw, index, step) => b.at(x, 0, z, yaw, () => {
        b.box(0, 0.2, 0, step - 0.015, 0.4, 0.6, b.jitter(0x8e8e88, 0.04 + 0.02 * (index % 3)), { bevel: 0, noBottom: true });
      }));
    }
    case 'kerb':
    default: {
      return walk(points, 1.0, (x, z, yaw, index, step) => b.at(x, 0, z, yaw, () => {
        b.box(0, 0.06, 0, step - 0.01, 0.15, 0.15, b.jitter(skin.concrete, 0.02 + 0.01 * (index % 2)), { bevel: 0, noBottom: true });
      }));
    }
  }
}

// --------------------------------------------------------------------------------------------- indoor (Verdant)

/**
 * One structural bay of an indoor wall, in the wall's own frame (x along the wall, y up, +z out of the wall face):
 * liner panels above 2.4 m, the blockwork dado with its brand-accent stripe at 1.2 m and kick rail, and the bay's
 * services: a cable tray at 4 m with conduit drops to sockets, the compressed-air ring with a drop and hose reel, an
 * electrical board, a fire point, eyewash and first aid, and PPE lockers. `numeral` paints the 2 m bay number.
 */
export function buildIndoorWallBay(b: KitBuilder, params: { readonly width: number; readonly height: number;
  readonly numeral?: number; readonly services?: boolean; readonly liner?: boolean }): number {
  const start = b.triangleCount;
  const { skin } = b;
  const w = params.width, h = params.height;
  if (params.liner !== false) {
    const panels = Math.max(2, Math.round(w / 1.0));
    for (let k = 0; k < panels; k += 1) {
      const x = -w / 2 + (k + 0.5) * (w / panels);
      b.box(x, 2.4 + (h - 2.4) / 2, 0.03, w / panels - 0.012, h - 2.4, 0.05, b.jitter(0xb9bdb8, 0.015), { bevel: 0 });
    }
  }
  // the dado: blockwork, the brand-accent stripe, the kick rail
  b.box(0, 1.2, 0.05, w, 2.4, 0.06, b.jitter(0x8a8c86, 0.02), { bevel: 0 });
  for (let course = 1; course < 12; course += 1) b.box(0, course * 0.2, 0.082, w, 0.008, 0.004, 0x6a6c66, { bevel: 0 });
  b.box(0, 1.2, 0.088, w, 0.12, 0.012, skin.accent, { bevel: 0 });
  b.box(0, 0.12, 0.1, w, 0.24, 0.04, 0x3a3e40, { bevel: 0.006 });
  if (params.numeral) {
    const rect = garageDisplayRect(`num.0${Math.min(8, Math.max(1, params.numeral))}`);
    b.decal([-1.0, 2.6, 0.06], [1.0, 2.6, 0.06], [1.0, 4.6, 0.06], [-1.0, 4.6, 0.06], rect);
  }
  if (params.services === false) return b.triangleCount - start;
  // cable tray at 4 m with two conduit drops to switched sockets
  b.box(0, 4.0, 0.25, w, 0.04, 0.3, 0x8a9094, { bevel: 0 });
  for (const s of [-1, 1]) b.box(0, 4.06, 0.25 + s * 0.15, w, 0.1, 0.01, 0x8a9094, { bevel: 0 });
  for (const x of [-w * 0.3, w * 0.22]) {
    b.box(x, 2.9, 0.1, 0.03, 2.2, 0.03, 0x8a9094, { bevel: 0 });
    b.box(x, 1.75, 0.12, 0.14, 0.14, 0.07, 0xc8c4b8, { bevel: 0.008 });
  }
  // the compressed-air ring with a drop to a hose reel
  b.rod([-w / 2, 3.55, 0.12], [w / 2, 3.55, 0.12], 0.025, 6, 0x2f6a9a);
  b.rod([w * 0.35, 3.55, 0.12], [w * 0.35, 2.2, 0.12], 0.02, 6, 0x2f6a9a);
  b.cylinder(w * 0.35, 1.9, 0.08, 0.24, 0.16, 10, 0x2a2b2c, { axis: 'z' });
  b.torus(w * 0.35, 1.9, 0.18, 0.18, 0.02, 10, 3, 0xb8862a, 'z');
  // the electrical board
  b.box(-w * 0.38, 2.0, 0.15, 0.6, 0.9, 0.2, 0x8a9094, { bevel: 0.012 });
  b.uprightFace(-w * 0.38, 2.25, 0.252, 0.18, 0.18, garageDisplayRect('picto.electric'));
  // the fire point: board with its pictogram, two extinguishers on brackets, a call point and the blanket
  b.box(-w * 0.12, 1.5, 0.08, 0.9, 1.6, 0.02, 0xa8302a, { bevel: 0 });
  b.uprightFace(-w * 0.12, 2.1, 0.092, 0.34, 0.34, garageDisplayRect('picto.extinguisher'));
  for (const dx of [-0.22, 0.22]) b.at(-w * 0.12 + dx, 0.82, 0.18, 0, () => {
    b.lathe(0, 0, 0, [[0, 0], [0.08, 0], [0.08, 0.48], [0.05, 0.54], [0, 0.56]], 8, 0xa8302a);
  });
  b.box(-w * 0.12 + 0.55, 1.6, 0.12, 0.12, 0.12, 0.06, 0xc8362b, { bevel: 0.008 });
  b.uprightFace(-w * 0.12 + 0.55, 1.6, 0.151, 0.1, 0.1, garageDisplayRect('picto.callpoint'));
  b.box(-w * 0.12 + 0.55, 2.0, 0.1, 0.18, 0.24, 0.05, 0xa8302a, { bevel: 0.008 });
  // eyewash and first aid
  b.box(w * 0.1, 1.55, 0.09, 0.4, 0.5, 0.12, 0x2c8a4e, { bevel: 0.01 });
  b.uprightFace(w * 0.1, 1.55, 0.151, 0.28, 0.28, garageDisplayRect('picto.eyewash'));
  b.box(w * 0.1, 2.15, 0.08, 0.36, 0.36, 0.1, 0xe8e6e0, { bevel: 0.01 });
  b.uprightFace(w * 0.1, 2.15, 0.131, 0.26, 0.26, garageDisplayRect('picto.firstaid'));
  // PPE lockers with their mandatory-signs
  for (let k = 0; k < 3; k += 1) {
    const x = w * 0.3 + (k - 1) * 0.42;
    if (x + 0.2 > w / 2) continue;
    b.box(x, 0.95, 0.27, 0.4, 1.8, 0.45, 0x5a6268, { bevel: 0.01 });
    b.box(x, 0.95, 0.496, 0.004, 1.7, 0.004, 0x2a2e30, { bevel: 0 });
    b.uprightFace(x, 1.55, 0.497, 0.2, 0.2, garageDisplayRect(['picto.head', 'picto.ear', 'picto.eye'][k]));
  }
  return b.triangleCount - start;
}

/** A yellow-and-black column base protector around a w x d column, 1.2 m tall. */
export function buildColumnProtector(b: KitBuilder, w: number, d: number): number {
  const start = b.triangleCount;
  for (let k = 0; k < 6; k += 1) b.box(0, 0.1 + k * 0.2, 0, w + 0.12, 0.2, d + 0.12, k % 2 ? 0x1c1c1c : 0xd2a531, { bevel: 0.02, noBottom: k > 0 });
  return b.triangleCount - start;
}

/** A shadow tool board in a wall frame (x along, +z out): painted outlines with each tool hung in its own. */
export function buildShadowBoard(b: KitBuilder, w: number, h: number): number {
  const start = b.triangleCount;
  b.box(0, 0, 0, w, h, 0.025, 0xd8d6cc, { bevel: 0.006 });
  const tools: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [-0.42, 0.2, 0.04, 0.42, 0x8a3a2c], [-0.32, 0.18, 0.035, 0.36, 0x9aa0a4], [-0.22, 0.16, 0.03, 0.3, 0x9aa0a4],
    [-0.1, 0.22, 0.06, 0.24, 0x2a2b2c], [0.05, 0.15, 0.03, 0.38, 0x9aa0a4], [0.18, 0.2, 0.05, 0.2, 0xb8302a],
    [0.32, 0.12, 0.08, 0.1, 0x2a2b2c], [0.42, 0.2, 0.035, 0.32, 0x9aa0a4], [-0.3, -0.22, 0.2, 0.06, 0x2a2b2c],
    [0.0, -0.22, 0.24, 0.05, 0x9aa0a4], [0.3, -0.24, 0.18, 0.12, 0x2f5a8a],
  ];
  for (const [fx, fy, tw, th, color] of tools) {
    const x = fx * w, y = fy * h;
    b.box(x, y, 0.014, tw + 0.02, th + 0.02, 0.002, 0x2a2b2c, { bevel: 0 }); // the painted outline
    b.box(x, y, 0.03, tw, th, 0.02, color, { bevel: 0.004 });
  }
  return b.triangleCount - start;
}

