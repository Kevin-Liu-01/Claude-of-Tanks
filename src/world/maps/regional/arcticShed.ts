// src/world/maps/regional/arcticShed.ts — DYE-M's utility shed (the arctic kit's woodshed), moved out of arctic.ts byte
// for byte (props census #17, the looks lane's vernacular sub-stream, 2026-10-15; the coordinator's extract-then-own
// grant). arctic.ts builds its table from it, as it does arcticYard.ts's builders.
import { PartSink, faceBox, rgb, shade } from './geometry.ts';
import { buildHouse } from './house.ts';
import { windowUnit } from './openings.ts';
import type { RegionalBuilder } from './types.ts';
import { PLY, STEEL_DARK, WINDOW, uvOffset, wallsIn } from './arctic.ts';

type Paint = 'plaster' | 'plaster2' | 'plaster3';
const ORANGE = rgb(0xc4602b);

/**
 * The utility shed (the woodshed's plot, its door to +x; the props census #17, 2026-10-15, the judges: "a towed DEW Line
 * utility shed: skids with cross-members, tow eyes and a sill, plywood panels with battened seams and corner trims, a
 * roof with a fascia, drip edge and a slight pitch, a framed insulated door in a reveal with hinges and a hasp, and a
 * vent stack with a cap and guy"): a plywood hut on its towing skids so it can be dragged across the pad, on the
 * house grammar (its house plan breaks it: the panels tear, the frame racks), painted, its sheets' seams battened and
 * its corners trimmed, the insulated door hung in its reveal on three hinges with its hasp, the small window, the
 * shallow sheet roof with its fascia and drip edge, the stove's vent stack on its guys; the fuel drums beside it.
 */
export const shed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const fit = wallsIn(ctx, 0.15, 0.15);
  const W = Math.max(2.4, fit.w), D = Math.max(2.4, fit.d), paint: Paint = look() < 0.6 ? 'plaster2' : 'plaster';
  const w = W - 0.9, skid = 0.3, h = 2.25, bx = -W / 2 + w / 2;
  const timber = rgb(0x5f5446), trim = shade(PLY, 0.7);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    // the skids, their noses turned up at the tow end, the cross-members bolted over them, the tow eyes
    for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) {
      sink.span('wood', -W / 2, -0.2, z - 0.12, -W / 2 + w + 0.15, 0.18, z + 0.12);
      sink.member('structureWood', [-W / 2 + w + 0.1, 0.0, z], [-W / 2 + w + 0.45, 0.16, z], 0.2, 0.24, [0, 1, 0], { colour: timber, decor: true, exposed: true }, 0);
      sink.dressing(mobile, () => {
        sink.cylinder('structureMetal', [-W / 2 + w + 0.42, 0.12, z], 'z', 0.03, 0.07, 8, { colour: STEEL_DARK, decor: true, fine: true }, 0.07);
      });
    }
    for (let k = 0; k < 3; k++) {
      const x = -W / 2 + 0.2 + (w - 0.4) * k / 2;
      sink.span('structureWood', x - 0.07, 0.18, -D / 2 + 0.1, x + 0.07, skid, D / 2 - 0.1, { colour: timber });
    }
    // the hut on them: painted plywood on its studs, the door and the window cut, a shallow sheet roof
    sink.placed(0, bx, skid, 0, () => {
      const frame = buildHouse(sink, {
        w, d: D, plinth: null, storeys: [{ h, wall: paint }],
        roof: { kind: 'shed', pitchDeg: 4, eave: 0.16, verge: 0.14, thickness: 0.08, bucket: 'roof' }, gableBucket: paint,
        openings: [{ face: 'right', storey: 0, kind: 'door', u: -D * 0.15, w: 0.85, y0: 0.05, h: 1.9 },
          { face: 'right', storey: 0, kind: 'window', u: D * 0.25, w: 0.6, y0: 1.0, h: 0.55 }],
        chimneys: [], gutters: null, verge: null, reveal: 0.12, spall: null,
      }, {
        window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, WINDOW, rng, 0.5),
        door: (s, face, o, y0) => {
          const y = y0 + o.y0, go = s.recess > 0 ? -s.recess + 0.03 : 0.02;
          // the insulated leaf at the back of the reveal in its steel frame, three hinges, the hasp and its staple
          faceBox(s, 'structureMetal', face, o.u, y + o.h / 2, go + 0.03, o.w, o.h, 0.06, { colour: shade(PLY, 0.75) });
          for (const side of [-1, 1]) faceBox(s, 'structureMetal', face, o.u + side * (o.w / 2 + 0.03), y + o.h / 2, 0.02, 0.06, o.h + 0.06, 0.05, { colour: STEEL_DARK, decor: true });
          faceBox(s, 'structureMetal', face, o.u, y + o.h + 0.03, 0.02, o.w + 0.12, 0.06, 0.05, { colour: STEEL_DARK, decor: true });
          for (const t of [0.12, 0.5, 0.88]) faceBox(s, 'structureMetal', face, o.u - o.w / 2 + 0.06, y + o.h * t, go + 0.07, 0.1, 0.12, 0.03, { colour: STEEL_DARK, decor: true, fine: true });
          faceBox(s, 'structureMetal', face, o.u + o.w / 2 - 0.08, y + o.h * 0.52, go + 0.07, 0.05, 0.18, 0.02, { colour: STEEL_DARK, decor: true, fine: true });
          faceBox(s, 'structureMetal', face, o.u + o.w / 2 - 0.05, y + o.h * 0.6, go + 0.08, 0.03, 0.05, 0.03, { colour: STEEL_DARK, decor: true, fine: true });
        },
      });
      sink.dressing(mobile, () => {
        // the plywood's seams battened every 1.22 m and the corner trims, all round
        for (const name of ['front', 'right', 'back', 'left'] as const) {
          const f = frame.faces[name], half = f.width / 2;
          for (const side of [-1, 1]) faceBox(sink, 'structureWood', f, side * (half - 0.05), h / 2, 0.02, 0.1, h, 0.03, { colour: trim, decor: true }, 'caps');
          for (let u = -half + 1.22; u < half - 0.3; u += 1.22) {
            if (name === 'right' && (Math.abs(u + D * 0.15) < 0.6 || Math.abs(u - D * 0.25) < 0.45)) continue;
            faceBox(sink, 'structureWood', f, u, h / 2, 0.012, 0.06, h - 0.06, 0.024, { colour: shade(trim, 1.1), decor: true, fine: true }, 'caps');
          }
        }
        // the fascia round the roof's edge, the drip edge folded over it
        const top = frame.eaveY;
        for (const name of ['front', 'right', 'back', 'left'] as const) {
          const f = frame.faces[name], out = name === 'front' || name === 'back' ? 0.14 : 0.16;
          faceBox(sink, 'structureWood', f, 0, top + 0.02, out, f.width + 0.3, 0.14, 0.025, { colour: trim, decor: true });
          faceBox(sink, 'structureMetal', f, 0, top + 0.1, out + 0.015, f.width + 0.32, 0.03, 0.012, { colour: STEEL_DARK, decor: true, fine: true });
        }
      });
    });
    // the vent stack through the roof, its cone cap and its three guys to the roof's edge
    sink.dressing(mobile, () => {
      const vx = -W / 2 + w * 0.3, vz = D * 0.2, y0 = skid + h + 0.12, top = y0 + 0.95;
      sink.cylinder('structureMetal', [vx, y0 - 0.1, vz], 'y', 1.05, 0.08, 8, { colour: STEEL_DARK, decor: true });
      sink.cylinder('structureMetal', [vx, top, vz], 'y', 0.16, 0.2, 8, { colour: STEEL_DARK, decor: true }, 0.03);
      for (const [gx, gz] of [[-w / 2 + 0.1, -D / 2 + 0.15], [-w / 2 + 0.1, D / 2 - 0.15], [w / 2 - 0.1, vz]] as const) {
        sink.member('structureMetal', [vx, top - 0.15, vz], [bx + gx, y0, gz], 0.012, 0.012, [0, 1, 0], { colour: STEEL_DARK, decor: true, fine: true, exposed: true }, 0);
      }
    });
    // the fuel drums on the open side
    for (let k = 0; k < 2; k++) sink.cylinder('structureMetal', [W / 2 - 0.4, 0, -D / 2 + 0.5 + k * 0.62], 'y', 0.88, 0.29, 10, { colour: k ? shade(ORANGE, 0.8) : STEEL_DARK });
  });
  return sink.finish();
};
