// src/world/maps/regional/lantern.ts — a light's lantern on its gallery (props census #5, lane B 2026-10-15), shared by
// the kits' lighthouses (phare.ts, fyr.ts): the gallery's iron railing, the lantern's dwarf wall, its panes (the curtain
// bucket's night windows: the light burns at night), the astragals between them and the glazing bar across them, the
// cupola with its eaves ring, the ventilator ball and the lightning rod. The caller lays the gallery floor it stands on.
import { LocalFrame, PartSink, type EmitOptions, type Rgb, type Vec3 } from './geometry.ts';

export interface LanternSpec {
  /** the lantern's axis */
  x: number;
  z: number;
  /** the gallery floor's top */
  y: number;
  /** the panes' radius (to the corners) and the lantern's sides */
  r: number;
  sides: number;
  /** the dwarf wall's height under the panes and the panes' height */
  dwarf: number;
  glass: number;
  /** the gallery railing: its half-size on a square gallery (sides 4) or its radius on a round one */
  rail: { half: number; sides: number; colour: Rgb };
  /** the lantern's ironwork (dwarf wall, astragals) and its cupola */
  iron: Rgb;
  cupola: Rgb;
}

/** A rod `s` square from a to b, level (a rail, a glazing bar). */
function rod(sink: PartSink, a: Vec3, b: Vec3, s: number, opts: EmitOptions): void {
  const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  const ux = dx / len, uz = dz / len;
  // the frame's z = x × y (a level x, y up)
  const frame = new LocalFrame([ux, 0, uz], [0, 1, 0], [-uz, 0, ux], [0, 0, 0]);
  sink.box('structureMetal', [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [len / 2, s / 2, s / 2], opts, frame);
}

/** The ring of `n` corners at radius `r` and height `y` about (x, z), wound as PartSink.cylinder winds its sides. */
function ring(x: number, y: number, z: number, r: number, n: number, phase: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = -(i / n * Math.PI * 2 + phase);
    out.push([x + Math.cos(a) * r, y, z + Math.sin(a) * r]);
  }
  return out;
}

/** The lantern on its gallery; returns the top of the lightning rod. */
export function lightLantern(sink: PartSink, L: LanternSpec): number {
  const { x, z, y, r, sides: n } = L;
  const iron = { colour: L.iron };
  const ironDecor = { colour: L.iron, decor: true };
  const railDecor = { colour: L.rail.colour, decor: true };
  const phase = Math.PI / n;
  // the railing: posts at the corners and between them, a top rail and a mid rail
  const rn = L.rail.sides, rr = rn === 4 ? L.rail.half * Math.SQRT2 : L.rail.half;
  const corners = ring(x, y, z, rr, rn, rn === 4 ? Math.PI / 4 : phase);
  for (let i = 0; i < rn; i++) {
    const p = corners[i], q = corners[(i + 1) % rn];
    const len = Math.hypot(q[0] - p[0], q[2] - p[2]), k = Math.max(1, Math.round(len / 0.7));
    for (let j = 0; j < k; j++) {
      const t = j / k, px = p[0] + (q[0] - p[0]) * t, pz = p[2] + (q[2] - p[2]) * t;
      sink.span('structureMetal', px - 0.025, y, pz - 0.025, px + 0.025, y + 1.0, pz + 0.025, railDecor);
    }
    rod(sink, [p[0], y + 1.0, p[2]], [q[0], y + 1.0, q[2]], 0.05, railDecor);
    rod(sink, [p[0], y + 0.5, p[2]], [q[0], y + 0.5, q[2]], 0.03, { ...railDecor, fine: true });
  }
  // the dwarf wall, the panes over it, the astragals at their corners and the glazing bar across each
  const y1 = y + L.dwarf, y2 = y1 + L.glass;
  sink.cylinder('structureMetal', [x, y, z], 'y', L.dwarf, r + 0.03, n, iron, r + 0.03, false, phase);
  const lo = ring(x, y1, z, r, n, phase), hi = ring(x, y2, z, r, n, phase);
  const apothem = r * Math.cos(Math.PI / n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const mx = (lo[i][0] + lo[j][0]) / 2 - x, mz = (lo[i][2] + lo[j][2]) / 2 - z, ml = Math.hypot(mx, mz) || 1;
    sink.quad('curtain', lo[i], lo[j], hi[j], hi[i], { decor: true, window: [mx / ml, 0, mz / ml] });
    const p = lo[i];
    sink.span('structureMetal', p[0] - 0.035, y1, p[2] - 0.035, p[0] + 0.035, y2, p[2] + 0.035, { ...ironDecor, fine: true });
    const k = (apothem + 0.02) / apothem, ym = (y1 + y2) / 2;
    rod(sink, [x + (lo[i][0] - x) * k, ym, z + (lo[i][2] - z) * k], [x + (lo[j][0] - x) * k, ym, z + (lo[j][2] - z) * k], 0.03, { ...ironDecor, fine: true });
  }
  // the cupola: its eaves ring over the panes, the dome in three courses, the ventilator ball and the rod
  sink.cylinder('structureMetal', [x, y2, z], 'y', 0.1, r + 0.14, n, { colour: L.cupola }, r + 0.14, true, phase);
  const dome: Array<[number, number, number]> = [[r + 0.08, r * 0.8, 0.3], [r * 0.8, r * 0.48, 0.26], [r * 0.48, 0.1, 0.22]];
  let yy = y2 + 0.1;
  for (const [a, b, h] of dome) {
    sink.cylinder('structureMetal', [x, yy, z], 'y', h, a, n, { colour: L.cupola }, b, b === 0.1, phase);
    yy += h;
  }
  sink.cylinder('structureMetal', [x, yy, z], 'y', 0.1, 0.07, 8, { colour: L.cupola, decor: true }, 0.19, false);
  sink.cylinder('structureMetal', [x, yy + 0.1, z], 'y', 0.12, 0.19, 8, { colour: L.cupola, decor: true }, 0.19, false);
  sink.cylinder('structureMetal', [x, yy + 0.22, z], 'y', 0.1, 0.19, 8, { colour: L.cupola, decor: true }, 0.05, true);
  const top = yy + 1.15;
  sink.span('structureMetal', x - 0.02, yy + 0.3, z - 0.02, x + 0.02, top, z + 0.02, { colour: [0.08, 0.08, 0.08], decor: true });
  return top;
}
