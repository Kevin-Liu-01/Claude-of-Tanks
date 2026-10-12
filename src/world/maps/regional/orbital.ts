// src/world/maps/regional/orbital.ts — the outpost kit (Olympus Basin: the station of the future on Mars; the buildings
// lane, 2026-10-11, waves 418b's "still Earth construction cues: corrugated site offices with picture windows, rusted
// Quonsets, wood-grain silos"). The plan's own buildings in the station's construction: pressurised habitat modules
// lying in their cradles on a sintered regolith pad, banked behind with regolith in bags against the radiation and the
// cold, joined by short tunnels, an airlock porch on the front, the radiator panels standing over the berm; the
// regolith processing plant's gantry between its two process towers, its conveyor up from the hopper, the walkways and
// ladders round the towers, the radiators along its back. Every hull a smooth white composite (the steel family's
// sheet spread to a texel: no ribs), the frames grey, the orange of the station's warning bands and hatches.
import { PartSink, faceBox, facePanel, rgb, shade, type Face, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

/** The station's colours (orbitalStructures.ts and structureKit's PAL.orbital): the hull white, the frames, the orange. */
const HULL = rgb(0xe7e7df), HULL_GREY = rgb(0xd4d9de), FRAME = rgb(0x66727a), DARK = rgb(0x263846);
const ORANGE = rgb(0xd87736), GOLD = rgb(0xb99a55), GLASS = rgb(0x52849a), RADIATOR = rgb(0xc9ced2);
/** A hull's composite skin: the steel family's sheet spread to a texel's breadth (smooth, never ribbed). */
const SKIN = { density: 0.04 } as const;

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}
interface Fill { w: number; d: number; cx: number; cz: number }
function fillOf(ctx: RegionalBuildContext, inset = 0.1): Fill {
  const b = ctx.bounds;
  return { w: b.maxX - b.minX - 2 * inset, d: b.maxZ - b.minZ - 2 * inset, cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2 };
}

/** A hull section along x from x0 to x1 at height cy, radius r: its shell, the ring frames, the end caps domed. */
function hull(sink: PartSink, x0: number, x1: number, cy: number, z: number, r: number, caps: { left: boolean; right: boolean }, mobile: boolean): void {
  sink.cylinder('structureMetal', [x0, cy, z], 'x', x1 - x0, r, 16, { colour: HULL, ...SKIN }, r, false);
  // the domed heads: a frustum and its cap at each closed end (each drawn from its own low-x end)
  const head = { colour: HULL_GREY, ...SKIN };
  if (caps.left) {
    sink.cylinder('structureMetal', [x0 - r * 0.32, cy, z], 'x', r * 0.32, r * 0.62, 16, head, r, true);
    sink.cylinder('structureMetal', [x0 - r * 0.46, cy, z], 'x', r * 0.14, r * 0.22, 16, head, r * 0.62, true);
  }
  if (caps.right) {
    sink.cylinder('structureMetal', [x1, cy, z], 'x', r * 0.32, r, 16, head, r * 0.62, true);
    sink.cylinder('structureMetal', [x1 + r * 0.32, cy, z], 'x', r * 0.14, r * 0.62, 16, head, r * 0.22, true);
  }
  if (mobile) return;
  for (let x = x0 + 0.5; x < x1 - 0.3; x += 1.3) {
    sink.cylinder('structureMetal', [x, cy, z], 'x', 0.09, r + 0.035, 16, { colour: FRAME, decor: true }, r + 0.035, false);
  }
}

/** A module's cradle: two saddles under it at u0 and u1 along x, the hull's radius r over its axis at cy. */
function cradles(sink: PartSink, xs: readonly number[], cy: number, z: number, r: number, y0: number): void {
  for (const x of xs) sink.span('structureMetal', x - 0.18, y0, z - r * 0.8, x + 0.18, cy - r * 0.55, z + r * 0.8, { colour: FRAME });
}

/** A radiator panel standing on its two legs: `w` long along x, `h` tall, its fins drawn as dark lines (decor). */
function radiator(sink: PartSink, x: number, y: number, z: number, w: number, h: number, tilt: number, mobile: boolean): void {
  const top = y + h, back = z - Math.sin(tilt) * h;
  // (all dressing: a phone build leaves the radiators out, and its solids stay the desktop's)
  for (const s of [-1, 1]) sink.member('structureMetal', [x + s * (w / 2 - 0.08), y, z], [x + s * (w / 2 - 0.08), top, back], 0.08, 0.08, [0, 0, 1], { colour: FRAME, exposed: true, decor: true }, 0.02);
  const a: Vec3 = [x - w / 2, y + 0.3, z - Math.sin(tilt) * 0.3], b: Vec3 = [x + w / 2, y + 0.3, a[2]];
  const c: Vec3 = [x + w / 2, top, back], d: Vec3 = [x - w / 2, top, back];
  sink.quad('structureMetal', a, b, c, d, { colour: RADIATOR, decor: true, ...SKIN });
  sink.quad('structureMetal', b, a, d, c, { colour: shade(RADIATOR, 0.8), decor: true, ...SKIN });
  if (mobile) return;
  for (let k = 1; k < 8; k++) {
    const t = k / 8, p: Vec3 = [x - w / 2 + w * t, a[1], a[2]], q: Vec3 = [x - w / 2 + w * t, top, back];
    sink.member('structureMetal', p, q, 0.03, 0.02, [0, 0, 1], { colour: DARK, decor: true, fine: true }, 0);
  }
}

/**
 * A row of habitat modules: the pad, the modules in their cradles along the row joined by tunnels, the regolith berm
 * banked against their backs, the airlock porch on the middle module's front, the radiators over the berm.
 */
const habitatRow: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx), mobile = ctx.tier === 'mobile';
  const W = Math.max(6, f.w), D = Math.max(4, f.d);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const pad = 0.28, r = Math.min(1.55, D * 0.24, (ctx.info.h - pad) / 2.1), cy = pad + r + 0.12;
    // the sintered pad over the plot (the regolith fused in one slab: the render's grain in the basin's red-brown, no joints)
    sink.span('plaster', -W / 2, -0.4, -D / 2, W / 2, pad, D / 2);
    // the modules along the row, a tunnel between each and the next
    const n = Math.max(2, Math.min(4, Math.round(W / 5.2))), gap = 0.9, L = (W - 0.6 - (n - 1) * gap - 2 * r * 0.46) / n;
    const z = D / 2 - 0.35 - r - 1.2;
    let x = -W / 2 + 0.3 + r * 0.46;
    for (let i = 0; i < n; i++) {
      hull(sink, x, x + L, cy, z, r, { left: i === 0, right: i === n - 1 }, mobile);
      cradles(sink, [x + L * 0.2, x + L * 0.8], cy, z, r, pad);
      if (i + 1 < n) sink.cylinder('structureMetal', [x + L, cy, z], 'x', gap, r * 0.48, 12, { colour: HULL_GREY, ...SKIN }, r * 0.48, false);
      // a window port strip on the front, the module's number band
      if (!mobile) {
        const face: Face = { origin: [x + L / 2, 0, z + r], u: [1, 0, 0], out: [0, 0, 1], width: L };
        facePanel(sink, 'structureMetal', face, -L * 0.15, cy + r * 0.18, 0.02, Math.min(1.6, L * 0.35), 0.32, { colour: GLASS, decor: true });
        facePanel(sink, 'structureMetal', face, L * 0.3, cy + r * 0.25, 0.02, 0.5, 0.16, { colour: ORANGE, decor: true });
      }
      x += L + gap;
    }
    // the regolith berm banked against the modules' backs (in bags: the render's coarse grain), to over their axes
    const zb0 = -D / 2 + 0.2, zb1 = z, bt = cy + r * 0.35;
    // (counter-clockwise seen from +x: the foot at the back, up the back slope, over the crest, down to the hulls)
    sink.prism('plaster', [[-W / 2 + 0.2, pad, zb0], [-W / 2 + 0.2, bt, zb0 + 1.2], [-W / 2 + 0.2, bt, zb1 - 0.4], [-W / 2 + 0.2, pad, zb1]],
      [1, 0, 0], W - 0.4, {});
    // the airlock porch on the middle module's front: its box, the hatch in its orange frame, the step
    const px = 0, pz = z + r - 0.1, pw = 1.5, pd = 1.7, ph = Math.min(2.3, cy + r * 0.5);
    sink.span('structureMetal', px - pw / 2, pad, pz, px + pw / 2, pad + ph, pz + pd, { colour: HULL_GREY, ...SKIN });
    const door: Face = { origin: [px, 0, pz + pd], u: [1, 0, 0], out: [0, 0, 1], width: pw };
    faceBox(sink, 'structureMetal', door, 0, pad + 0.95, 0.03, 0.95, 1.7, 0.05, { colour: ORANGE, decor: true });
    facePanel(sink, 'structureMetal', door, 0, pad + 0.95, 0.06, 0.75, 1.5, { colour: DARK, decor: true });
    sink.span('stone', px - 0.6, pad, pz + pd, px + 0.6, pad + 0.18, pz + pd + 0.5, { decor: true });
    // the radiators standing on the berm's top
    // (on the berm's crest, between its back slope's head and the hulls)
    if (!mobile) for (let k = 0; k < Math.max(1, n - 1); k++) radiator(sink, -W / 2 + W * (k + 0.5) / Math.max(1, n - 1), bt, zb0 + 1.6, 2.2, 1.6, 0.38, mobile);
  });
  return sink.finish();
};

/** A process tower: the white column, its orange bands, the walkway rings with their railings and the caged ladder. */
function processTower(sink: PartSink, x: number, z: number, r: number, h: number, y0: number, mobile: boolean): void {
  sink.cylinder('structureMetal', [x, y0, z], 'y', h, r, 16, { colour: HULL, ...SKIN }, r, false);
  sink.cylinder('structureMetal', [x, y0 + h, z], 'y', r * 0.5, r, 16, { colour: HULL_GREY, ...SKIN }, r * 0.35, true);
  for (const f of [0.18, 0.86]) sink.cylinder('structureMetal', [x, y0 + h * f, z], 'y', 0.25, r + 0.012, 16, { colour: ORANGE, decor: true }, r + 0.012, false);
  if (mobile) return;
  for (const f of [0.5, 0.97]) {
    const wy = y0 + h * f, wr = r + 0.8;
    sink.cylinder('structureMetal', [x, wy - 0.12, z], 'y', 0.12, wr, 16, { colour: FRAME, decor: true }, wr, true);
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
      const p0: Vec3 = [x + Math.cos(a0) * (wr - 0.04), wy, z + Math.sin(a0) * (wr - 0.04)], p1: Vec3 = [x + Math.cos(a1) * (wr - 0.04), wy, z + Math.sin(a1) * (wr - 0.04)];
      sink.member('structureMetal', p0, [p0[0], wy + 1.0, p0[2]], 0.05, 0.05, [Math.cos(a0), 0, Math.sin(a0)], { colour: ORANGE, decor: true, fine: true }, 0);
      sink.member('structureMetal', [p0[0], wy + 1.0, p0[2]], [p1[0], wy + 1.0, p1[2]], 0.045, 0.045, [0, 1, 0], { colour: ORANGE, decor: true, fine: true }, 0);
    }
  }
  for (const s of [-1, 1]) sink.member('structureMetal', [x + r + 0.3, y0, z + s * 0.22], [x + r + 0.3, y0 + h * 0.97 + 1.0, z + s * 0.22], 0.05, 0.05, [1, 0, 0], { colour: FRAME, decor: true }, 0);
  for (let y = y0 + 0.4; y < y0 + h * 0.97; y += 0.5) sink.member('structureMetal', [x + r + 0.3, y, z - 0.22], [x + r + 0.3, y, z + 0.22], 0.03, 0.03, [1, 0, 0], { colour: FRAME, decor: true, fine: true }, 0);
}

/**
 * The regolith plant's gantry: the pad, the two process towers at its ends banked round their feet, the lattice girders
 * between their heads, the conveyor up from the hopper at the front to the upper girder, the radiators along the back.
 */
const plantGantry: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx), mobile = ctx.tier === 'mobile';
  const W = Math.max(10, f.w), D = Math.max(4, f.d), H = Math.max(6, Math.min(14, ctx.info.h));
  sink.placed(0, f.cx, 0, f.cz, () => {
    const pad = 0.3;
    sink.span('plaster', -W / 2, -0.4, -D / 2, W / 2, pad, D / 2);
    const r = Math.min(1.4, D * 0.26), tx = W / 2 - r - 0.6, th = H - r * 0.5 - 0.3;
    for (const s of [-1, 1]) {
      processTower(sink, s * tx, 0, r, th, pad, mobile);
      // the regolith banked round its foot
      sink.cylinder('plaster', [s * tx, pad, 0], 'y', 1.1, r + 1.0, 14, {}, r + 0.15, true);
    }
    // the lattice girders between the towers' heads: two chords, their verticals and diagonals
    for (const gy of [th * 0.62, th * 0.94]) {
      for (const dz of [-0.5, 0.5]) sink.member('structureMetal', [-tx + r * 0.9, pad + gy, dz], [tx - r * 0.9, pad + gy, dz], 0.22, 0.22, [0, 1, 0], { colour: FRAME, exposed: true }, 0.05);
      if (mobile) continue;
      const bays = Math.max(3, Math.round((2 * tx) / 2.4));
      for (let k = 0; k <= bays; k++) {
        const x = -tx + r * 0.9 + ((2 * tx - 1.8 * r) * k) / bays;
        sink.member('structureMetal', [x, pad + gy, -0.5], [x, pad + gy, 0.5], 0.1, 0.1, [0, 1, 0], { colour: FRAME, decor: true }, 0.02);
        if (k < bays) {
          const x1 = -tx + r * 0.9 + ((2 * tx - 1.8 * r) * (k + 1)) / bays;
          sink.member('structureMetal', [x, pad + gy, -0.5], [x1, pad + gy, 0.5], 0.07, 0.07, [0, 1, 0], { colour: FRAME, decor: true, fine: true }, 0.02);
        }
      }
    }
    // the conveyor up from the hopper at the front to the upper girder, on its two trestles
    const hz = D / 2 - 0.9, top: Vec3 = [-tx * 0.15, pad + th * 0.94, 0.4], foot: Vec3 = [tx * 0.35, pad + 1.6, hz];
    sink.span('structureMetal', foot[0] - 0.9, pad, hz - 0.8, foot[0] + 0.9, pad + 1.6, hz + 0.8, { colour: HULL_GREY, ...SKIN });
    sink.member('structureMetal', foot, top, 0.5, 0.36, [0, 1, 0], { colour: GOLD, exposed: true }, 0.05);
    for (const t of [0.35, 0.7]) {
      const p: Vec3 = [foot[0] + (top[0] - foot[0]) * t, foot[1] + (top[1] - foot[1]) * t, foot[2] + (top[2] - foot[2]) * t];
      sink.member('structureMetal', [p[0], pad, p[2]], [p[0], p[1] - 0.2, p[2]], 0.18, 0.18, [1, 0, 0], { colour: FRAME, exposed: true }, 0.02);
    }
    // the radiators along the back
    if (!mobile) for (let k = 0; k < 4; k++) radiator(sink, -tx * 0.6 + (k * tx * 1.2) / 3, pad, -D / 2 + 0.7, 2.0, 2.4, 0.25, mobile);
  });
  return sink.finish();
};

export const ORBITAL_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  containerRow: habitatRow,
  gantry: plantGantry,
});

export const ORBITAL_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'orbital',
  region: "Olympus Basin's outpost on Mars (the future): pressurised habitat modules banked in regolith, the regolith plant's gantry and its process towers, radiators",
  surfaces: {
    roof: { kind: 'sheet', tint: [0.86, 0.87, 0.86] },
    // the sintered regolith pavers of the pads
    stone: { kind: 'block', tint: [0.62, 0.42, 0.33] },
    sourced: { plaster: false, wood: false },
    // the regolith in its bags: the render's coarse grain in the basin's red-brown
    render: { kind: 'limeRender', seed: 0x0b17 },
    tones: {
      plaster: (_h, s, l) => [0.04, Math.min(1, s * 0.6 + 0.35), Math.min(1, l * 0.62 + 0.08)],
    },
  },
  builders: ORBITAL_BUILDERS,
  weather: {
    plaster: [[1, 1, 1], [0.96, 0.93, 0.9], [1.02, 0.97, 0.94]],
    stone: [[1, 1, 1], [0.94, 0.92, 0.9], [0.9, 0.87, 0.85]],
    roof: [[1, 1, 1], [0.96, 0.95, 0.94]],
    damp: 0, moss: 0,
  },
  wear: 0.1,
});

export type { RegionalParts };
