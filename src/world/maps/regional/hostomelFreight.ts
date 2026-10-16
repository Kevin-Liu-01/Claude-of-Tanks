// src/world/maps/regional/hostomelFreight.ts — Kestrel Airfield's container rows (the Hostomel kit's containerRow; the
// looks lane's r2 sub-stream, 2026-10-16). Extract-then-own: hostomel.ts freightBoxes and its liveries moved here byte for
// byte (Lane B's kit keeps one import and its builder-table line); the kit helpers it paints with copied.
import { PartSink, faceBox, pick, rgb, shade, type Face, type Rgb } from './geometry.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';

// --- the Hostomel kit's helpers (hostomel.ts, copied) ----------------------------------------------------------------
const RUST = rgb(0x5e4030);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

// --- the row (hostomel.ts, moved) ------------------------------------------------------------------------------------

/**
 * (the looks lane, 2026-10-13; LOOKS-BRIEF section 6: Kestrel Airfield's two container rows drawn by the generic builder)
 * the airport's freight boxes as they stood in March 2022: twenty-foot ISO containers in their lines' faded liveries
 * (no brand marks), a few stacked, rust running from their corner castings, their corrugated sides ribbed, door ends
 * with their locking bars; two of them scorched black by the fires and holed, a line of sandbags along the front of the
 * row where it was used as a wall. Drawn in the structure steel, every box a part the container kit's damage reads
 * (container.ts readContainers: a box per container in the steel bucket).
 */
const BOX_LIVERY: readonly Rgb[] = [0x5f7f96, 0x9a6a3e, 0x6e7f62, 0xa9a49a, 0x7a3b30, 0x4f6672, 0xb08a3e].map(rgb);
export const freightBoxes: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, bb = ctx.bounds, mobile = ctx.tier === 'mobile';
  const L = 6.06, Wb = 2.44, H = 2.59;
  const W = bb.maxX - bb.minX, D = bb.maxZ - bb.minZ;
  const n = Math.max(2, Math.floor((W + 0.4) / (Wb + 0.45)));
  const pitch = (W - 0.2) / n, zc = (bb.minZ + bb.maxZ) / 2 - Math.max(0, D - L - 1.2) * 0.2;
  const box = (x: number, y: number, z: number, yaw: number, livery: Rgb, burnt: boolean) => {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const col = burnt ? shade(rgb(0x2e2a28), 0.9 + rng() * 0.2) : shade(livery, 0.88 + rng() * 0.18);
    sink.placed(yaw, x, y, z, () => {
      sink.span('structureMetal', -Wb / 2, 0, -L / 2, Wb / 2, H, L / 2, { colour: col });
      if (!mobile) {
        // the corrugation's ribs down both long sides, the corner posts and rails, the door end's bars
        for (let k = 1; k < 18; k++) {
          const zz = -L / 2 + k * L / 18;
          for (const sx of [-1, 1]) sink.span('structureMetal', sx * Wb / 2 - (sx > 0 ? 0 : 0.03), 0.12, zz - 0.06, sx * Wb / 2 + (sx > 0 ? 0.03 : 0), H - 0.1, zz + 0.06, { colour: shade(col, 0.82), decor: true });
        }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const x0 = sx * (Wb / 2 - 0.09), x1 = sx * (Wb / 2 + 0.03), z0 = sz * (L / 2 - 0.09), z1 = sz * (L / 2 + 0.03);
          sink.span('structureMetal', Math.min(x0, x1), 0, Math.min(z0, z1), Math.max(x0, x1), H, Math.max(z0, z1), { colour: shade(col, 0.7), decor: true });
          // rust from the corner castings
          if (!burnt) sink.span('structureMetal', sx * Wb / 2 - 0.02, H * 0.4, sz * (L / 2 - 0.35), sx * Wb / 2 + 0.035 * sx, H - 0.08, sz * (L / 2 - 0.25), { colour: RUST, decor: true });
        }
        const door: Face = { origin: [0, 0, L / 2 - 0.005], u: [1, 0, 0], out: [0, 0, 1], width: Wb };
        for (const u of [-0.75, -0.35, 0.35, 0.75]) faceBox(sink, 'structureMetal', door, u, H / 2, 0.03, 0.05, H - 0.4, 0.05, { colour: shade(col, 0.6), decor: true });
        faceBox(sink, 'structureMetal', door, 0, H / 2, 0.02, 0.03, H - 0.25, 0.03, { colour: shade(col, 0.5), decor: true });
      }
      if (burnt) {
        // the fire's blistered side and a blast hole torn in it
        const side: Face = { origin: [Wb / 2 + 0.01, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: L };
        faceBox(sink, 'dark', side, (rng() - 0.5) * L * 0.4, H * 0.55, 0.0, 0.7 + rng() * 0.4, 0.6 + rng() * 0.3, 0.02, { decor: true });
      }
    });
    void c; void sn;
  };
  let burntLeft = 1 + (rng() < 0.5 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const x = bb.minX + 0.1 + pitch * (k + 0.5), yaw = (rng() - 0.5) * 0.06, zOff = (rng() - 0.5) * 0.8;
    const burnt = burntLeft > 0 && rng() < 0.35;
    if (burnt) burntLeft--;
    box(x, 0, zc + zOff, yaw, pick(rng, BOX_LIVERY), burnt);
    if (rng() < 0.4) box(x + (rng() - 0.5) * 0.15, H + 0.005, zc + zOff + (rng() - 0.5) * 0.3, yaw + (rng() - 0.5) * 0.04, pick(rng, BOX_LIVERY), false);
  }
  // the sandbag line along the row's front where it stood as a wall
  const zf = zc + L / 2 + 0.75;
  if (zf + 0.4 < bb.maxZ) {
    for (let x = bb.minX + 0.4; x < bb.maxX - 0.4; x += 0.62) {
      for (let row = 0; row < 3; row++) {
        const xx = x + (row % 2) * 0.31, y = row * 0.22;
        if (xx > bb.maxX - 0.4) continue;
        sink.span('structureMetal', xx - 0.3, y, zf - 0.22, xx + 0.3, y + 0.23, zf + 0.22, { colour: shade(rgb(0x8a7c5e), 0.9 + rng() * 0.15) });
      }
    }
  }
  return sink.finish();
};
