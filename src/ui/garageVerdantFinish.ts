import { KitBuilder } from './garageKitGeometry.ts';
import { garageDisplayRect } from './garageDisplayAtlas.ts';
import { buildMonitor } from './garageDisplayKit.ts';

/**
 * Verdant's hall finish (garage r9, the brief's "Mezzanine, today an empty deck"): the pieces only the hall carries.
 * Each builder draws one assembly standing on y = 0 (its floor: the mezzanine deck or the hall slab), its front toward
 * +Z, through the shared KitBuilder (vertex-coloured solids, atlas faces for screens and lamp lenses).
 *
 * - `buildMezzanineOffice`: the glass-fronted operations office on the deck: insulated side and back panels, a sill
 *   wall and slim mullions, the blinds half lowered, a door bay, its warm ceiling panels, a monitor wall of four screens
 *   (readouts and the Verdant Fields map) over a desk with its chairs and a filing cabinet.
 * - `buildLongSpanRacking`: long-span racking along the deck: braced upright frames, orange beams, three levels of
 *   labelled parts bins, boxes, a pallet of track links and a pallet of road wheels.
 * - `buildDeckLedStrip`: the warm LED strip along the deck's fascia.
 */

const PANEL = 0xb9bdb8, PANEL_DARK = 0x8d918c, FRAME = 0x2a2e30, BLIND = 0xd6d2c4, WARM_WALL = 0xd9cfbd;

/** The operations office, `width` x `depth` x `height`, its glass front at z = depth / 2. */
export function buildMezzanineOffice(b: KitBuilder, params: { readonly width: number; readonly depth: number; readonly height: number;
  readonly screens: readonly string[] }): number {
  const start = b.triangleCount;
  const { width: w, depth: d, height: h } = params;
  const hw = w / 2, hd = d / 2;
  // the shell: back wall, side walls, roof slab with its fascia, a skirting band
  b.box(0, h / 2, -hd + 0.06, w, h, 0.12, WARM_WALL, { bevel: 0, noBottom: true });
  for (const side of [-1, 1]) b.box(side * (hw - 0.06), h / 2, 0, 0.12, h, d, PANEL, { bevel: 0.01, noBottom: true });
  b.box(0, h + 0.09, 0, w + 0.2, 0.18, d + 0.2, PANEL_DARK, { bevel: 0.02 });
  b.box(0, h - 0.02, hd + 0.08, w + 0.2, 0.12, 0.06, FRAME, { bevel: 0 }); // the head over the glazing
  // the front: a sill wall, mullions every ~1.5 m, a transom, one bay a door
  const bays = Math.max(3, Math.round(w / 1.5));
  const bayW = w / bays;
  const sillH = 0.95, headY = h - 0.12;
  for (let k = 0; k < bays; k += 1) {
    const x0 = -hw + k * bayW, xc = x0 + bayW / 2;
    const door = k === 1;
    if (!door) b.box(xc, sillH / 2, hd - 0.03, bayW, sillH, 0.08, PANEL, { bevel: 0, noBottom: true });
    else b.box(xc, (headY - 0.4) / 2, hd - 0.03, bayW - 0.12, headY - 0.4, 0.05, PANEL_DARK, { bevel: 0, noBottom: true }); // the door leaf
    // the blinds, half lowered: slats from the head down over the upper part of the glass
    if (!door) {
      const slats = 6;
      for (let s = 0; s < slats; s += 1) {
        const y = headY - 0.12 - s * 0.13;
        b.box(xc, y, hd - 0.12, bayW - 0.14, 0.02, 0.06, BLIND, { bevel: 0 });
      }
      b.box(xc, headY - 0.06, hd - 0.12, bayW - 0.1, 0.07, 0.08, BLIND, { bevel: 0 }); // the headrail
    }
  }
  for (let k = 0; k <= bays; k += 1) b.box(-hw + k * bayW, h / 2, hd, 0.06, h, 0.1, FRAME, { bevel: 0, noBottom: true });
  b.box(0, sillH, hd, w, 0.06, 0.12, FRAME, { bevel: 0 });
  b.box(0, headY - 0.36, hd, w, 0.04, 0.08, FRAME, { bevel: 0 }); // the transom
  // the interior: warm ceiling panels, the monitor wall over a desk, two chairs, a filing cabinet, a whiteboard
  const warm = garageDisplayRect('glow.warm');
  for (const x of [-w * 0.25, w * 0.25]) {
    b.face([x - 0.6, h - 0.005, 0.3], [x + 0.6, h - 0.005, 0.3], [x + 0.6, h - 0.005, -0.3], [x - 0.6, h - 0.005, -0.3], warm);
  }
  const screens = params.screens;
  screens.forEach((rect, index) => {
    const column = index % 2, row = Math.floor(index / 2);
    b.push().translate(-0.55 + column * 1.1, 1.9 - row * 0.62, -hd + 0.2);
    buildMonitor(b, rect, 0.95, 'wall');
    b.pop();
  });
  b.box(0, 0.72, -hd + 0.75, 2.6, 0.04, 0.8, 0x6a6e70, { bevel: 0.006 });
  for (const x of [-1.15, 1.15]) b.box(x, 0.35, -hd + 0.75, 0.05, 0.7, 0.7, FRAME, { bevel: 0 });
  for (const x of [-0.6, 0.6]) {
    b.box(x, 0.46, -hd + 1.45, 0.48, 0.08, 0.46, 0x2a2c30, { bevel: 0.02 });
    b.box(x, 0.8, -hd + 1.66, 0.46, 0.6, 0.06, 0x2a2c30, { bevel: 0.02 });
    b.box(x, 0.22, -hd + 1.45, 0.06, 0.44, 0.06, FRAME, { bevel: 0 });
  }
  b.box(hw - 0.45, 0.66, -hd + 0.42, 0.5, 1.32, 0.62, 0x6e7468, { bevel: 0.01, noBottom: true });
  b.box(-hw + 0.1, 1.6, -0.2, 0.03, 1.0, 1.6, 0xe8e6de, { bevel: 0 }); // the whiteboard on the side wall
  return b.triangleCount - start;
}

/** Long-span racking `length` long: braced frames, orange beams on three levels, bins, boxes and two parts pallets. */
export function buildLongSpanRacking(b: KitBuilder, params: { readonly length: number; readonly height?: number }): number {
  const start = b.triangleCount;
  const length = params.length, height = params.height ?? 2.5, depth = 1.0;
  const bays = Math.max(1, Math.round(length / 2.7));
  const bayL = length / bays;
  const upright = 0x3e5a7a, beam = 0xc0602a;
  for (let k = 0; k <= bays; k += 1) {
    const x = -length / 2 + k * bayL;
    for (const z of [-depth / 2, depth / 2]) b.box(x, height / 2, z, 0.08, height, 0.06, upright, { bevel: 0, noBottom: true });
    for (let y = 0.4; y < height; y += 0.7) b.beam([x, y, -depth / 2], [x, y + 0.55, depth / 2], 0.03, 0.03, upright, { bevel: 0 });
  }
  const levels = [0.12, 1.0, 1.85];
  for (const y of levels) {
    for (const z of [-depth / 2, depth / 2]) b.box(0, y, z, length, 0.1, 0.05, beam, { bevel: 0 });
    b.box(0, y + 0.06, 0, length, 0.02, depth, 0x7a7c78, { bevel: 0 }); // the decking
  }
  // the bottom level: a pallet of track links and a pallet of road wheels; the upper levels: bins and boxes
  for (let k = 0; k < bays; k += 1) {
    const xc = -length / 2 + (k + 0.5) * bayL;
    if (k === 0) {
      b.box(xc, 0.25, 0, 1.2, 0.1, 0.9, 0x7a6040, { bevel: 0 });
      for (let i = 0; i < 2; i += 1) for (let j = 0; j < 5; j += 1) b.box(xc - 0.4 + i * 0.8, 0.36 + (j % 2) * 0.05, -0.35 + j * 0.17, 0.66, 0.06, 0.14, 0x2c2d2e, { bevel: 0 });
    } else if (k === 1) {
      b.box(xc, 0.25, 0, 1.2, 0.1, 0.9, 0x7a6040, { bevel: 0 });
      for (const [x, y] of [[-0.3, 0.3], [0.3, 0.3], [0, 0.47]] as const) b.cylinder(xc + x, 0.3 + y - 0.3, 0, 0.32, 0.16, 10, 0x1c1d1e, { capBottom: false });
    }
    for (const y of levels.slice(1)) {
      const binColour = [0x2a5a8a, 0xb0402a, 0x3a6a3a, 0xd0a030][(k + Math.round(y)) % 4];
      for (let i = 0; i < 6; i += 1) {
        const bx = xc - bayL / 2 + 0.25 + i * ((bayL - 0.5) / 5);
        b.box(bx, y + 0.2, depth * 0.2, 0.3, 0.26, 0.5, binColour, { bevel: 0.01 });
      }
      b.box(xc + bayL * 0.25, y + 0.32, -depth * 0.22, 0.8, 0.5, 0.5, 0x9a7a54, { bevel: 0.01 }); // a carton
    }
    // the bay's label strip on its front beam (a stencil code)
    b.decal([xc - 0.4, levels[1] - 0.04, depth / 2 + 0.03], [xc + 0.4, levels[1] - 0.04, depth / 2 + 0.03],
      [xc + 0.4, levels[1] + 0.04, depth / 2 + 0.03], [xc - 0.4, levels[1] + 0.04, depth / 2 + 0.03], garageDisplayRect('stencil.code'));
  }
  return b.triangleCount - start;
}

/** The warm LED strip along the deck's fascia, `length` long, in the frame's XY plane at z = 0. */
export function buildDeckLedStrip(b: KitBuilder, length: number): number {
  const start = b.triangleCount;
  b.box(0, 0, -0.02, length, 0.07, 0.03, FRAME, { bevel: 0 });
  b.uprightFace(0, 0, 0.0, length - 0.04, 0.035, garageDisplayRect('glow.warm'));
  return b.triangleCount - start;
}
