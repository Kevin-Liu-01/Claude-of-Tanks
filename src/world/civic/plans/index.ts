// src/world/civic/plans/index.ts — the civic plans by map (the maps lane, 228). A map adopts the civic-area and pathway
// kit by a plan here; every other map builds exactly what it built before. Leaf module: no three.js (the terrain's lawn
// mask and the receipts read the plans in Node).
import type { CivicAreaPlan, CivicPlan, CivicRect } from '../types.ts';
import { CIVIC_STYLES } from '../styles.ts';
import { URBAN_CIVIC_PLAN } from './urban.ts';
import { RUINSPIRES_CIVIC_PLAN } from './ruinspires.ts';
import { CLIFFBRIDGE_CIVIC_PLAN } from './cliffbridge.ts';
import { BLACKGLASS_CIVIC_PLAN } from './blackglass.ts';
import { POLDERS_CIVIC_PLAN } from './polders.ts';

const PLANS: Readonly<Record<string, CivicPlan>> = Object.freeze({
  urban: URBAN_CIVIC_PLAN,
  ruinspires: RUINSPIRES_CIVIC_PLAN,
  cliffbridge: CLIFFBRIDGE_CIVIC_PLAN,
  blackglass: BLACKGLASS_CIVIC_PLAN,
  polders: POLDERS_CIVIC_PLAN,
});

/** The maps with a civic plan (the receipts iterate them). */
export const CIVIC_PLAN_MAPS: readonly string[] = Object.freeze(Object.keys(PLANS));

/** A map's civic plan, or null (the map lays its streets and squares as before). The receipts build a map without its
 *  plan (globalThis.__cotCivicOff) to hold the plan's build to the map's own seeded passes. */
export function civicPlanFor(mapId: string | null | undefined): CivicPlan | null {
  if ((globalThis as { __cotCivicOff?: boolean }).__cotCivicOff === true) return null;
  return (mapId && PLANS[mapId]) || null;
}

/** The props settings a plan sets over the map's own (no map config is edited: the overlay is applied at build). */
interface CivicOverlayTarget {
  plazaNest?: boolean;
  dressingRules?: Record<string, unknown>;
}
export function applyCivicOverlay(plan: CivicPlan, props: CivicOverlayTarget): void {
  const o = plan.overlay;
  if (o.plazaNest === false) props.plazaNest = false;
  if (o.hedgehogsAtApproaches) props.dressingRules = { ...(props.dressingRules ?? {}), hedgehogsAtApproaches: true };
}

/** The lawns a map's civic areas keep green (the terrain paints them off its road mask, its village wear off). */
export function civicLawns(mapId: string | null | undefined): readonly CivicRect[] {
  return civicPlanFor(mapId)?.areas.flatMap((area) => area.lawns) ?? [];
}

/** The rooms a map's civic areas pave frontage to frontage (the terrain paints them paved, the grass keeps off). */
export function civicPavedRooms(mapId: string | null | undefined): readonly CivicRect[] {
  return civicPlanFor(mapId)?.areas.map((area) => area.paved) ?? [];
}

/** The pads whose airfield dressing a civic area drops (hardstandDressing.ts), by index. */
export function civicUndressedPads(mapId: string | null | undefined): ReadonlySet<number> {
  return new Set(civicPlanFor(mapId)?.areas.map((area: CivicAreaPlan) => area.pad).filter((pad) => pad >= 0) ?? []);
}

/** Whether (x, z) lies in a rectangle. */
export function inCivicRect(r: CivicRect, x: number, z: number, margin = 0): boolean {
  return x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin;
}

/** Whether a point is a civic area's mown lawn proper (the grass grows there): inside a bed's lawn, inside its dwarf wall
 *  (`inset`), off its paths, its feature's ring and the monument's bed. Null on a map without a plan. */
export function civicLawnTest(mapId: string | null | undefined, inset = 0.65): ((x: number, z: number) => boolean) | null {
  const plan = civicPlanFor(mapId);
  if (!plan) return null;
  const lawns = plan.areas.flatMap((a) => a.lawns), beds = plan.areas.flatMap((a) => a.beds);
  const monuments = plan.areas.flatMap((a) => (a.monument ? [a.monument] : []));
  return (x, z) => {
    if (!lawns.some((r) => inCivicRect(r, x, z, -0.2))) return false;
    for (const bed of beds) {
      if (!inCivicRect(bed.rect, x, z)) continue;
      if (!inCivicRect(bed.rect, x, z, -inset)) return false;
      for (const p of bed.paths) {
        const dx = p.to[0] - p.from[0], dz = p.to[1] - p.from[1], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - p.from[0]) * dx + (z - p.from[1]) * dz) / l2));
        if (Math.hypot(x - p.from[0] - dx * t, z - p.from[1] - dz * t) < p.width / 2 + 0.25) return false;
      }
      const f = bed.feature;
      if ((f?.kind === 'flowerRondell' || f?.kind === 'fountain') && Math.hypot(x - f.x, z - f.z) < f.ring + 0.2) return false;
      if (f?.kind === 'hedgeArc' && Math.abs(Math.hypot(x - f.x, z - f.z) - f.r) < 0.45) return false;
      return !monuments.some((mo) => Math.hypot(x - mo.x, z - mo.z) < 3.1);
    }
    return false;
  };
}

/**
 * (228 r3) Whether (x, z) lies in a kerbed street's pavement band: from a hand inside the kerb's line out past the widest
 * pavement, along a street the plan kerbs (its main streets and lanes), inside the town (the grass keeps off the flags:
 * the vegetation grows before the props lay the runs). A raster at half a metre over the town, built once a map; null on a
 * map without pathways.
 */
const paveCache = new Map<string, ((x: number, z: number) => boolean) | null>();
export function civicPavementTest(mapId: string | null | undefined, roads: ReadonlyArray<ReadonlyArray<readonly [number, number]>>):
  ((x: number, z: number) => boolean) | null {
  const plan = civicPlanFor(mapId), pw = plan?.pathways;
  if (!plan || !pw || !mapId) return null;
  const hit = paveCache.get(mapId);
  if (hit !== undefined) return hit;
  const kw = CIVIC_STYLES[plan.style]?.kerb.width ?? 0.25;
  const bands = Object.entries(pw.classes).filter(([, c]) => c === 'main' || c === 'gasse').map(([i, c]) => ({
    road: roads[Number(i)] ?? [], lo: pw.kerbM - 0.35, hi: pw.kerbM + kw + (c === 'main' ? pw.maxWalkM : pw.lane.maxWalkM) + 0.3,
  }));
  const polys = pw.inside;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const poly of polys) for (const [px, pz] of poly) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
  const C = 0.5, nx = Math.ceil((x1 - x0) / C) + 1, nz = Math.ceil((z1 - z0) / C) + 1, grid = new Uint8Array(nx * nz);
  const inPoly = (poly: readonly (readonly [number, number])[], x: number, z: number): boolean => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  // each band's segments stamped into the cells within its reach (a segment's box, then the exact distance)
  for (const b of bands) for (let s = 0; s + 1 < b.road.length; s++) {
    const [ax, az] = b.road[s], [bx, bz] = b.road[s + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - b.hi - x0) / C)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx) + b.hi - x0) / C));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - b.hi - z0) / C)), j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz) + b.hi - z0) / C));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + i * C, z = z0 + j * C, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      const k = j * nx + i;
      if (d < b.lo) grid[k] = 2; // a carriageway (another street's band never paves it)
      else if (d <= b.hi && grid[k] !== 2) grid[k] = 1;
    }
  }
  const test = (x: number, z: number): boolean => {
    const i = Math.round((x - x0) / C), j = Math.round((z - z0) / C);
    if (i < 0 || j < 0 || i >= nx || j >= nz || grid[j * nx + i] !== 1) return false;
    return polys.some((poly) => inPoly(poly, x, z)) && !pw.exclude.some((r) => inCivicRect(r, x, z));
  };
  paveCache.set(mapId, test);
  return test;
}

/** A map's civic tree stations with their species and scale band (vegetation.ts plants them on a stream of their own). */
export function civicTreeStations(mapId: string | null | undefined): Array<{ x: number; z: number; species: string; scale: readonly [number, number] }> {
  return civicPlanFor(mapId)?.areas.flatMap((a) => a.trees.stations.map((s) => ({ x: s.x, z: s.z, species: a.trees.species, scale: a.trees.scale }))) ?? [];
}
