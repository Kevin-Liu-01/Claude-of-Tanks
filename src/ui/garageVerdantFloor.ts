// Verdant Motor Pool's hall floor (GA.05, 2026-10-14; the garage critic panel: "the floor is a smear ... a power-floated
// slab: saw-cut joints on a ~6 m grid, a sheen that catches lamp and window highlights, track scuffs to the shutter, oil
// spots at the bays, a trench drain with a grate, a detail or triplanar map so it stays sharp up close"). The old floor
// stretched one 512 px canvas over the 46 m hall (11 px/m) with 11.5 m "slabs". This one is a 1024 px albedo (22 px/m)
// built straight into a typed array at boot: 7 x 7 power-floated pours with sealed saw-cut joints, each pour a shade off
// its neighbours, the rubber the hulls leave between the shutter and the turntable, oil and coolant at the bays, a damp
// band along the trench drain, faint fine mottling. The hall lays it on the graded floor program (garageHardstandProgram.ts)
// with the concrete detail relief and a low roughness, so the floor has aggregate, crazing and a sheen close up.
// Plain Node can build it (receipts time it).

/** Texels across the hall floor (square). */
export const VERDANT_FLOOR_TEXELS = 1024;
/** Pours across the hall in each direction (6.57 m slabs on the 46 m floor). */
export const VERDANT_FLOOR_POURS = 7;

interface FloorFrame {
  /** Half the hall's floor width (m). */
  readonly halfWidthM: number;
  /** The roller shutter's opening on the +z wall: x from, x to (hall metres). */
  readonly shutterX: readonly [number, number];
}

/**
 * The hall floor's albedo, RGBA sRGB bytes, row 0 at z = +halfWidth (the texture's v = 0 with flipY off; the floor plane's
 * v runs from z = +halfWidth up to z = -halfWidth), column 0 at x = -halfWidth.
 */
export function buildVerdantFloorAlbedo({ halfWidthM, shutterX }: FloorFrame, seed = 0x5eed05): Uint8Array {
  const S = VERDANT_FLOOR_TEXELS;
  const W = halfWidthM * 2;
  const pxPerM = S / W;
  let state = seed >>> 0;
  const rng = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // tone: 1 = the base; every mark multiplies into it
  const tone = new Float32Array(S * S).fill(1);
  // each pour cures a shade off its neighbours
  const P = VERDANT_FLOOR_POURS;
  const pour = Float32Array.from({ length: P * P }, () => 1 + (rng() - 0.5) * 0.07);
  // fine mottling: value noise on a 24-cell grid, +/- 3 %
  const G = 24;
  const grid = Float32Array.from({ length: (G + 1) * (G + 1) }, () => (rng() - 0.5) * 0.06);
  const slab = S / P;
  for (let y = 0; y < S; y++) {
    const gy = (y / S) * G, iy = Math.floor(gy), ty0 = gy - iy, ty = ty0 * ty0 * (3 - 2 * ty0);
    const py = Math.min(P - 1, Math.floor(y / slab));
    for (let x = 0; x < S; x++) {
      const gx = (x / S) * G, ix = Math.floor(gx), tx0 = gx - ix, tx = tx0 * tx0 * (3 - 2 * tx0);
      const a = grid[iy * (G + 1) + ix], b = grid[iy * (G + 1) + ix + 1];
      const c = grid[(iy + 1) * (G + 1) + ix], d = grid[(iy + 1) * (G + 1) + ix + 1];
      const mottle = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      const px = Math.min(P - 1, Math.floor(x / slab));
      tone[y * S + x] = pour[py * P + px] * (1 + mottle);
    }
  }
  const toPx = (xM: number, zM: number): [number, number] => [(xM + halfWidthM) * pxPerM, (halfWidthM - zM) * pxPerM];
  /** Multiplies a soft disc (radius rM, factor at the centre, eased to 1 at the rim) into the tone. */
  const spot = (xM: number, zM: number, rM: number, factor: number, squash = 1, angle = 0): void => {
    const [cx, cy] = toPx(xM, zM);
    const r = rM * pxPerM, reach = Math.ceil(r + 1);
    const c = Math.cos(angle), s = Math.sin(angle);
    for (let dy = -reach; dy <= reach; dy++) {
      const y = Math.floor(cy) + dy;
      if (y < 0 || y >= S) continue;
      for (let dx = -reach; dx <= reach; dx++) {
        const x = Math.floor(cx) + dx;
        if (x < 0 || x >= S) continue;
        const ox = x + 0.5 - cx, oy = y + 0.5 - cy;
        const u = (ox * c + oy * s) / r, v = (-ox * s + oy * c) / (r * squash);
        const d2 = u * u + v * v;
        if (d2 >= 1) continue;
        const fall = (1 - d2) * (1 - d2);
        tone[y * S + x] *= 1 + (factor - 1) * fall;
      }
    }
  };
  // the rubber the hulls leave: two bands a track gauge apart from the shutter's threshold to the turntable's rim,
  // stamped into a wear field (max, so the stamps never pile up) and multiplied in once
  const wear = new Float32Array(S * S);
  const scuff = (x0: number, z0: number, x1: number, z1: number, x2: number, z2: number, gauge: number, widthM: number,
    strength: number): void => {
    const steps = Math.ceil(Math.hypot(x2 - x0, z2 - z0) / 0.12);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      const x = u * u * x0 + 2 * u * t * x1 + t * t * x2, z = u * u * z0 + 2 * u * t * z1 + t * t * z2;
      const dxdt = 2 * u * (x1 - x0) + 2 * t * (x2 - x1), dzdt = 2 * u * (z1 - z0) + 2 * t * (z2 - z1);
      const len = Math.hypot(dxdt, dzdt) || 1;
      const nx = -dzdt / len, nz = dxdt / len;
      const fade = Math.min(1, t / 0.12, (1 - t) / 0.2) * (0.7 + 0.3 * Math.sin(t * 23 + x0));
      for (const side of [-1, 1]) {
        const [cx, cy] = toPx(x + nx * side * gauge / 2, z + nz * side * gauge / 2);
        const r = (widthM / 2) * pxPerM, reach = Math.ceil(r + 1);
        for (let dy = -reach; dy <= reach; dy++) {
          const yy = Math.floor(cy) + dy;
          if (yy < 0 || yy >= S) continue;
          for (let dx = -reach; dx <= reach; dx++) {
            const xx = Math.floor(cx) + dx;
            if (xx < 0 || xx >= S) continue;
            const d = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) / r;
            if (d >= 1) continue;
            const w = strength * fade * (1 - d * d);
            const index = yy * S + xx;
            if (w > wear[index]) wear[index] = w;
          }
        }
      }
    }
  };
  const shutterMid = (shutterX[0] + shutterX[1]) / 2;
  const doorZ = halfWidthM - 0.9, rimR = 6.7;
  // the hulls come in square through the shutter and swing onto the turntable
  scuff(shutterMid, doorZ, shutterMid * 0.7, doorZ - 7, shutterMid * 0.35, rimR + 0.3, 2.9, 0.62, 0.16);
  scuff(shutterMid - 0.6, doorZ, shutterMid - 3.5, doorZ - 8, -rimR * 0.5, rimR * 0.82, 2.9, 0.58, 0.1);
  // a forklift's tighter lines from the door toward the stores
  scuff(shutterMid + 1.2, doorZ, shutterMid + 6, doorZ - 4, shutterMid + 9, doorZ - 12, 1.1, 0.24, 0.09);
  // the round worn by hulls swinging on and off the turntable
  for (let i = 0; i < 120; i++) {
    const a = rng() * Math.PI * 2, r = rimR + rng() * 2.6;
    spot(Math.cos(a) * r, Math.sin(a) * r, 0.5 + rng() * 0.9, 0.95, 0.5, a + Math.PI / 2);
  }
  for (let i = 0; i < S * S; i++) tone[i] *= 1 - wear[i];
  // oil, hydraulic fluid and coolant at the bays round the hall (never under the turntable)
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r = 9 + rng() * 10;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    spot(x, z, 0.25 + rng() * (rng() < 0.25 ? 1.1 : 0.45), 0.62 + rng() * 0.15, 0.55 + rng() * 0.4, rng() * Math.PI);
    if (rng() < 0.5) spot(x + (rng() - 0.5) * 0.6, z + (rng() - 0.5) * 0.6, 0.18 + rng() * 0.3, 0.7);
  }
  // the damp band along the trench drain inside the shutter, and the wet tracked in from the apron
  for (let x = shutterX[0] - 0.4; x <= shutterX[1] + 0.4; x += 0.35) spot(x, halfWidthM - 0.62, 0.55, 0.86, 0.5, 0);
  // sealed saw-cut joints: a dark sealant core with a worn light arris on one side
  const out = new Uint8Array(S * S * 4);
  const base = [88, 86, 81];
  for (let y = 0; y < S; y++) {
    const jy = y % slab;
    const nearY = Math.min(jy, slab - jy);
    for (let x = 0; x < S; x++) {
      const jx = x % slab;
      const nearX = Math.min(jx, slab - jx);
      let f = tone[y * S + x];
      const near = Math.min(nearX, nearY);
      if (near < 1.2 && x > 1 && y > 1 && x < S - 2 && y < S - 2) f *= 0.5 + 0.3 * near;
      else if (near < 2.4) f *= 1.04;
      // a hash speckle, +/- 3 %
      let h = Math.imul(x * 374761393 + y * 668265263, 1274126177);
      h ^= h >>> 13;
      f *= 1 + (((h >>> 0) & 1023) / 1023 - 0.5) * 0.06;
      const at = (y * S + x) * 4;
      out[at] = Math.max(0, Math.min(255, Math.round(base[0] * f)));
      out[at + 1] = Math.max(0, Math.min(255, Math.round(base[1] * f)));
      out[at + 2] = Math.max(0, Math.min(255, Math.round(base[2] * f)));
      out[at + 3] = 255;
    }
  }
  return out;
}
