// src/world/maps/regional/kyushuNamako.ts — the kura's namako base band (kyushu.ts kuraBody), extracted (the looks lane's r2
// sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builder was taken extract-then-own) and rebuilt here.
//
// The r2 sweep read the band's runs on a kura's front as painted plates (containerRow@kyushu on Caldera: two dark 3 cm
// boards 1.2 x 1.8 m on the plaster, ending in the plaster at the door's frame). The band is the tile cladding of the
// whole base, so it is built as one: each run's face, its head and foot, its ends cut square at the doorway, and at the
// building's corners the runs mitred into one another round the walls (their corners shared), the band one course of
// tile round the kura.
import { facePoint, rgb, type Face, type PartSink, type Vec3 } from './geometry.ts';
import type { HouseFrame } from './house.ts';

function facePt(f: Face, u: number, y: number, o: number): Vec3 {
  return [f.origin[0] + f.u[0] * u + f.out[0] * o, y, f.origin[2] + f.u[2] * u + f.out[2] * o];
}

/** The namako base band round a kura's walls to NAMAKO_H, its pointing a lattice on it. */
export function namakoBand(sink: PartSink, frame: HouseFrame, NAMAKO_H: number): void {
  // the namako base band: dark tile squares with white diagonal pointing (the band dark, the pointing a lattice)
  const b = frame.bodies[0];
  for (const name of ['front', 'back', 'left', 'right'] as const) {
    const f = frame.faces[name];
    // (props census #3, lane B 2026-10-14; the judges: "the namako band ONE dark 3 cm plate the full width of each face,
    // laid with no regard to the door ... the lower 1.3 m of every kura doorway is boarded over"; Caldera r7: the band to a third
    // of the wall, NAMAKO_H) the band runs to the
    // door's stepped frame each side and returns round it; its runs between the openings that reach down into it
    const half = f.width / 2, gaps = frame.spec.openings.filter((o) => o.face === name && o.y0 < NAMAKO_H)
      .map((o): [number, number] => [o.u - o.w / 2 - 0.32, o.u + o.w / 2 + 0.32]).sort((x, y) => x[0] - y[0]);
    const runs: Array<[number, number]> = [];
    let from = -half;
    for (const [g0, g1] of gaps) { if (g0 > from + 0.1) runs.push([from, g0]); from = Math.max(from, g1); }
    if (half > from + 0.1) runs.push([from, half]);
    for (const [r0, r1] of runs) {
      bandRun(sink, f, r0, r1, b.y0, b.y0 + NAMAKO_H + 0.08, r0 <= -half + 1e-6, r1 >= half - 1e-6);
      // the pointing (Caldera round 2, wave 114: "a zigzag band where the diagonal namako tile grid should be"): the
      // square tiles set on the diagonal, their raised white joints two families of lines at 45 degrees, 0.3 m apart,
      // each clipped to the run's ends
      const yb = b.y0 + 0.04, H = NAMAKO_H - 0.08;
      for (const dir of [1, -1]) {
        for (let c = -half - H; c < half; c += 0.34) {
          // the line u = c + dir (y - yb) over the band, clipped to [r0, r1]
          let ua = dir > 0 ? c : c + H, ub = dir > 0 ? c + H : c, ya = yb, yy = yb + H;
          const clip = (uEdge: number) => {
            const t = (uEdge - ua) / (ub - ua);
            return ya + (yy - ya) * t;
          };
          if (Math.max(ua, ub) <= r0 || Math.min(ua, ub) >= r1) continue;
          if (ua < r0) { ya = clip(r0); ua = r0; } else if (ua > r1) { ya = clip(r1); ua = r1; }
          if (ub < r0) { yy = clip(r0); ub = r0; } else if (ub > r1) { yy = clip(r1); ub = r1; }
          if (Math.hypot(ub - ua, yy - ya) < 0.12) continue;
          sink.member('structureWood', facePt(f, ua, ya, 0.04), facePt(f, ub, yy, 0.04), 0.045, 0.015, f.out,
            { colour: rgb(0xdcd8cc), decor: true, fine: true, exposed: true }, 0);
        }
      }
    }
  }
}

/** The band's faces: from the wall (a hand off it) out to its face, 3 cm of tile. */
const BAND_IN = 0.005, BAND_OUT = 0.035;

/**
 * One run of the band along a face from u0 to u1, y0 to y1: its face, head and foot; a square end where it stops at a
 * doorway, a mitre (the corner's points, shared with the next face's run) where it turns a corner of the building.
 */
function bandRun(sink: PartSink, f: Face, u0: number, u1: number, y0: number, y1: number, corner0: boolean, corner1: boolean): void {
  const opts = { colour: rgb(0x2e3134), decor: true };
  const P = (u: number, y: number, o: number) => facePoint(f, u, y, o);
  // the run's ends at the face line (o) out of the wall: at a corner the mitre runs on by o
  const a = (o: number) => (corner0 ? u0 - o : u0), b = (o: number) => (corner1 ? u1 + o : u1);
  const oi = BAND_IN, oo = BAND_OUT;
  sink.quad('structureWood', P(a(oo), y0, oo), P(b(oo), y0, oo), P(b(oo), y1, oo), P(a(oo), y1, oo), opts);
  sink.quad('structureWood', P(a(oo), y1, oo), P(b(oo), y1, oo), P(b(oi), y1, oi), P(a(oi), y1, oi), opts);
  sink.quad('structureWood', P(a(oi), y0, oi), P(b(oi), y0, oi), P(b(oo), y0, oo), P(a(oo), y0, oo), opts);
  if (!corner0) sink.quad('structureWood', P(u0, y0, oi), P(u0, y0, oo), P(u0, y1, oo), P(u0, y1, oi), opts);
  if (!corner1) sink.quad('structureWood', P(u1, y0, oo), P(u1, y0, oi), P(u1, y1, oi), P(u1, y1, oo), opts);
}
