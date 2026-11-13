// src/world/maps/regional/appearance.ts — each building's look, picked from its map's variation (item buildings-270; Main
// 2026-11-05: "each row names its variation … and instance appearance picks from it. No two neighbours may share every
// feature").
//
// A building's look is its tints (the kit's palettes: which render, stone and roof tint), its roof's age within the row's
// spread, and its dress: one named option on each axis the row lists (a gable's dress, a porch, a trim colour), which the
// kit's builder reads (dressOf) for decor-only choices. The look is drawn from the building's weather stream, never the
// build stream, so no shape and no collision moves with it.
//
// The rule: no building within LOOK_RADIUS_M of another wears the same dress while the row's axes have one to spare, and
// none shares every feature with it. The props build keeps one ledger per map (a new one each build, so nothing carries
// between maps or builds) and offers it here with the building's world position; a dress a neighbour wears is stepped to
// the next free one, then a whole look a neighbour has is stepped over the roof, the render, the roof's age and the stone
// (the dress kept free). Without a ledger (a receipt's bare build, a set piece) the first pick stands.
import { rgb, type Rgb } from './geometry.ts';
import { registerBuildScope } from '../buildScopes.ts';
import type { WeatherPalette, WeatherTints } from './weather.ts';

/** What a map's buildings vary in (its row of the building-style table). */
export interface BuildingVariation {
  /** named dress, axis by axis: the options the kit's houses choose among on this map */
  readonly axes: Readonly<Record<string, readonly string[]>>;
  /** the roofs' age spread, 0 (new) – 1 (a century of weather) */
  readonly roofAge: readonly [number, number];
}

export interface BuildingLook {
  readonly tints: WeatherTints;
  /** the building's option on each of the row's axes */
  readonly dress: Readonly<Record<string, string>>;
  /** every feature as one key: what no neighbour may share */
  readonly key: string;
}

/** How near two buildings stand to count as neighbours (metres between their plots' centres). */
export const LOOK_RADIUS_M = 45;
/** The roof-age spread is read in this many steps for the key (a roof one step older reads as another roof). */
const AGE_STEPS = 3;

/** One map's placed looks (props.ts makes one per build). */
export class AppearanceLedger {
  private readonly placed: Array<{ x: number; z: number; key: string; dress: string }> = [];
  /** a neighbour (within LOOK_RADIUS_M) already has this whole look */
  clashes(x: number, z: number, key: string): boolean {
    for (const p of this.placed) if (p.key === key && Math.hypot(p.x - x, p.z - z) < LOOK_RADIUS_M) return true;
    return false;
  }
  /** a neighbour already wears this dress */
  dressed(x: number, z: number, dress: string): boolean {
    for (const p of this.placed) if (p.dress === dress && Math.hypot(p.x - x, p.z - z) < LOOK_RADIUS_M) return true;
    return false;
  }
  place(x: number, z: number, key: string, dress = ''): void {
    this.placed.push({ x, z, key, dress });
  }
}

const NO_VARIATION: BuildingVariation = Object.freeze({ axes: Object.freeze({}), roofAge: [0, 1] as const });

/**
 * A building's look: every draw from `rng` first (the indices, the jitters, the age), so the stream reads the same
 * whatever the ledger says; then the first free pick in the stepping order.
 */
export function pickLook(palette: WeatherPalette, variation: BuildingVariation | null, rng: () => number,
  at?: { ledger: AppearanceLedger; x: number; z: number }): BuildingLook {
  const v = variation ?? NO_VARIATION;
  const axes = Object.keys(v.axes).sort();
  const index = (n: number) => Math.min(n - 1, Math.floor(rng() * n));
  const radices = [...axes.map((a) => v.axes[a].length), palette.roof.length, palette.plaster.length, AGE_STEPS, palette.stone.length];
  const base = radices.map(index);
  const jitter = [rng(), rng(), rng()];
  const ageFrac = rng();
  const tuple = [...base];
  const n = axes.length;
  /** the next tuple in mixed radix over digits [from, to), the first turning fastest */
  const step = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      tuple[i] = (tuple[i] + 1) % radices[i];
      if (tuple[i] !== 0) break;
    }
  };
  const count = (from: number, to: number) => radices.slice(from, to).reduce((a, b) => a * b, 1);
  if (at) {
    // the dress first (what a passer-by sees): no neighbour wears the same, while the row's axes have a dress to spare;
    // then the whole look: no neighbour shares every feature
    if (n) for (let k = 0, c = count(0, n); k < c && at.ledger.dressed(at.x, at.z, tuple.slice(0, n).join('.')); k++) step(0, n);
    const dressFree = !n || !at.ledger.dressed(at.x, at.z, tuple.slice(0, n).join('.'));
    const from = dressFree ? n : 0;
    for (let k = 0, c = count(from, tuple.length); k < c && at.ledger.clashes(at.x, at.z, tuple.join('.')); k++) step(from, tuple.length);
    at.ledger.place(at.x, at.z, tuple.join('.'), tuple.slice(0, n).join('.'));
  }
  const dress: Record<string, string> = {};
  axes.forEach((a, i) => { dress[a] = v.axes[a][tuple[i]]; });
  const shift = (c: Rgb, j: number, k: number): Rgb => {
    const s = 1 + (j - 0.5) * k;
    return [c[0] * s, c[1] * s, c[2] * s];
  };
  // the render variants carry their own canvas tone: the building's tint only shifts them a shade
  const plaster = shift(palette.plaster[tuple[n + 1]], jitter[0], 0.06);
  const stone = shift(palette.stone[tuple[n + 3]], jitter[1], 0.08), roof = shift(palette.roof[tuple[n]], jitter[2], 0.08);
  const [a0, a1] = v.roofAge;
  const roofAge = a0 + (a1 - a0) * ((tuple[n + 2] + ageFrac) / AGE_STEPS);
  return { tints: { plaster, plaster2: plaster, plaster3: plaster, stone, roof, roofAge }, dress, key: tuple.join('.') };
}

/**
 * The paint of the building's doors and shutters (the shared `paint` axis: a row lists its place's paints as hex, e.g.
 * '#2e6aa8'): openings.ts doorUnit and windowUnit take it over their kit's colour while the building builds. The slot is
 * set round one synchronous builder call (regional/index.ts), so it never reaches another building.
 */
let paintSlot: Rgb | null = null;
registerBuildScope('appearance.paint', () => paintSlot !== null); // (2026-11-02 audit R1: buildScopes.ts; round 8 Y11)
export function withPaint<T>(paint: string | undefined, build: () => T): T {
  const prior = paintSlot;
  paintSlot = paint && /^#[0-9a-f]{6}$/.test(paint) ? rgb(parseInt(paint.slice(1), 16)) : null;
  try { return build(); } finally { paintSlot = prior; }
}
/** The building's door and shutter paint, or null (the kit's own). */
export function paintOverride(): Rgb | null {
  return paintSlot;
}
