// src/world/hinterland/outland.ts — the outland planner (HL-1 site plan; HL-6 roads, water, settlements and
// vegetation; the horizons stream, 2026-10-13; B-architecture §4.4).
//
// Verdant's distance reads as "a world beyond" because the middle distance is inhabited and continuous (A-verdant
// §5): roads that run on from the square's exits, farms and villages in the map's own kit at the place's density, a
// church (or the place's vertical) at each village's core facing the roads, hedges and shelterbelts, a power line. This
// planner makes that a pure function of the spec and the field: it picks the settlements' sites the way the old
// farmstead search did (a flat footprint, off water and woods, a road bonus, a side cap; borderFarmsteads.ts), extended
// by the region's pattern — a street village strings its plots along its road, a nucleated village rings a core, a dyke
// village lines a dyke's foot, dispersed hamlets scatter — continues every exit road to a settlement or the far band,
// links the settlements (a spanning tree plus the map's links), places the region's verticals at their real spacing
// (a church tower per village, windmills on the polders' dikes, headframes at the works), and in the far band (1.5–12
// km) scatters the distant villages whose towers stand on the skyline. Everything is seeded from the map's place seed
// (never Math.random), so the plan is deterministic and a new stage never re-rolls one that passed.
import type { HinterlandField, HinterlandFlatPad, HinterlandGradeLine, HinterlandPlanFeatures } from './field.ts';
import { HINTERLAND_EDGE_M } from './field.ts';
import { hashString, mulberry32, noise2, smoothstep } from './noise.ts';
import { HINTERLAND_SEASON_LEAF, hinterlandPoint, type HinterlandSpec, type HinterlandVerticalKind } from './spec.ts';
import { dikeCrowns } from './landforms.ts';

export type HinterlandSettlementKind = 'town' | 'village' | 'hamlet' | 'farm' | 'works' | 'station';

export interface HinterlandSettlement {
  id: number;
  kind: HinterlandSettlementKind;
  x: number; z: number;
  /** The settlement's heading (rad, world XZ): its street or its yard squared to the fields. */
  yaw: number;
  /** Its footprint's radius (m) and how many buildings stand in it. */
  radiusM: number;
  buildings: number;
  /** 1 within 1.5 km of the edge (kit geometry and impostors), 0 in the far band (impostors only). */
  near: boolean;
  /** The vertical at its core (a church tower, a minaret, a headframe), if it raises one. */
  vertical: HinterlandVerticalKind | null;
  /** Standing in a flood (Walcheren, October 1944): its roofs and trees stand out of the water. */
  flooded?: boolean;
  /** Its tower's authored height (m), when a sightline village names one. */
  towerM?: number;
  name?: string;
}

export interface HinterlandRoad {
  kind: 'road' | 'track' | 'rail' | 'dikeRoad';
  xs: number[]; zs: number[];
  widthM: number;
  /** Where it comes from (an exit, a settlement) and goes. */
  from: string; to: string;
}

export interface HinterlandVertical {
  kind: HinterlandVerticalKind;
  x: number; z: number;
  /** Its height over the ground (m) and its footprint's half-width (m). */
  heightM: number; halfM: number;
  yaw: number;
  settlement: number | null;
  name?: string;
}

/** A building's footprint in a settlement (HL-6: the kit builds one structure per footprint). */
export interface HinterlandBuilding {
  settlement: number;
  /** The kit's plan kind ('cottage', 'farmhouse', 'barn', 'church', 'mill', …). */
  kind: string;
  x: number; z: number; yaw: number;
  width: number; depth: number;
}

/** A line of trees (a dike's poplars, an avenue, a shelterbelt, a hedge's standards). */
export interface HinterlandTreeRow {
  xs: number[]; zs: number[];
  species: string;
  spacingM: number;
  kind: 'dike' | 'avenue' | 'shelterbelt' | 'hedge';
}

/** One tree the outland stands (the vegetation tier draws them as impostors; the envelope reads them as objects). */
export interface HinterlandTree {
  x: number; z: number;
  species: string;
  /** Its height and its crown's radius (m). */
  heightM: number; crownM: number;
  /** 0..1 its foliage's turn (an older or more exposed tree turns first in autumn; a tone within its species). */
  tone: number;
  /** Its crown's form: a Lombardy column, a broad crown (a Canadian poplar, an ash, an oak), a pollard willow's knob. */
  form: 'columnar' | 'broad' | 'pollard' | 'conifer';
  /** 0..1 the foliage it still carries (the season's, varied tree by tree; a conifer keeps its needles). */
  leaf: number;
}

export interface HinterlandPlan {
  settlements: HinterlandSettlement[];
  roads: HinterlandRoad[];
  verticals: HinterlandVertical[];
  buildings: HinterlandBuilding[];
  rows: HinterlandTreeRow[];
  /** Every tree of the rows, the avenues and the farms' shelter groups. */
  trees: HinterlandTree[];
  /** Term 3: what the field levels and grades for this plan. */
  features: HinterlandPlanFeatures;
  ms: number;
}

/** What the planner reads besides the spec: heights (the pyramid's, cheap) and water and woods from the field. */
export interface HinterlandPlanInputs {
  heightAt(x: number, z: number): number;
  wetAt(x: number, z: number): number;
  /** The water's kind there (field.ts HinterlandWaterSample.kind: 5 a flood). */
  waterKindAt?(x: number, z: number): number;
  woodsAt(x: number, z: number): number;
  /** The battlefield's road exits past the edge (terrain.ts roadExits), to run on. */
  exits: readonly { xs: ArrayLike<number>; zs: ArrayLike<number>; length: number }[];
}

/** The heights of the region's verticals (m over the ground) and their footprint half-widths. */
export const VERTICAL_SIZE: Readonly<Record<HinterlandVerticalKind, readonly [number, number]>> = Object.freeze({
  churchTower: [34, 4], spire: [42, 4], onionDome: [26, 6], campanile: [30, 3], minaret: [32, 2.5], pagoda: [24, 6],
  elevator: [36, 8], waterTower: [28, 5], windmill: [24, 5], postMill: [14, 4], chimney: [60, 3], headframe: [40, 7],
  coolingTower: [70, 26], slagTip: [45, 90], radome: [22, 11], mast: [60, 2], pylonLine: [30, 3], lighthouse: [32, 4],
  castle: [30, 22], kurgan: [6, 30], tvTower: [120, 6], kilnChimney: [36, 2.5], lookoutTower: [30, 3], burnerCone: [18, 7],
  damWall: [80, 120],
});

const SIDE_NAMES = ['n', 'e', 's', 'w'] as const;

function sideOf(x: number, z: number): number {
  return Math.abs(x) > Math.abs(z) ? (x > 0 ? 1 : 3) : (z > 0 ? 0 : 2);
}

/** The settlement's buildings by kind for the region's pattern (the kit's plan kinds). */
function buildingKinds(spec: HinterlandSpec, kind: HinterlandSettlementKind): readonly string[] {
  if (kind === 'works') return ['depot', 'depot', 'barn', 'granary', 'cottage'];
  if (kind === 'farm') return ['farmhouse', 'barn', 'granary', 'woodshed'];
  if (kind === 'station') return ['depot', 'cottage', 'depot'];
  const p = spec.region.settlement;
  if (p === 'colony') return ['cottage', 'cottage', 'cottage', 'cottage', 'tavern', 'schoolhouse'];
  if (p === 'cityEdge') return ['cottage', 'cottage', 'depot', 'tavern', 'cottage', 'granary'];
  return ['cottage', 'farmhouse', 'cottage', 'barn', 'cottage', 'granary', 'tavern', 'farmhouse', 'woodshed', 'cottage'];
}

/**
 * Plan the outland for a spec. `inputs` reads the land (the pyramid's heights, the field's water and woods); the
 * result's `features` go back into the field (withFeatures) so the yards stand level and the roads graded.
 */
export function planHinterlandOutland(spec: HinterlandSpec, seed: number, inputs: HinterlandPlanInputs): HinterlandPlan {
  const started = performance.now();
  const rng = mulberry32((seed ^ hashString(`hinterland-plan:${spec.mapId}`)) >>> 0);
  const settle = spec.outland.settle;
  const pattern = spec.region.settlement;
  const settlements: HinterlandSettlement[] = [];
  const verticals: HinterlandVertical[] = [];
  const roads: HinterlandRoad[] = [];
  const rows: HinterlandTreeRow[] = [];
  const buildings: HinterlandBuilding[] = [];
  const heading = (inputs as { heading?: number }).heading ?? (rng() - 0.5) * 0.8;

  // ---- the exits run on: each road leaving the square continues along its last bearing, wandering gently, to 5 km
  const roadPts: { x: number; z: number }[] = [];
  inputs.exits.forEach((exit, index) => {
    const n = exit.xs.length;
    if (n < 2) return;
    const xs: number[] = [], zs: number[] = [];
    for (let i = 0; i < n; i++) { xs.push(exit.xs[i]); zs.push(exit.zs[i]); }
    let x = xs[n - 1], z = zs[n - 1];
    let dir = Math.atan2(xs[n - 1] - xs[Math.max(0, n - 4)], zs[n - 1] - zs[Math.max(0, n - 4)]);
    // bend outward if the exit's last stretch runs along the edge
    const out = Math.atan2(x, z);
    const turn = Math.atan2(Math.sin(out - dir), Math.cos(out - dir));
    if (Math.abs(turn) > 0.9) dir += turn * 0.5;
    for (let d = 0; d < 5000; d += 60) {
      dir += 0.06 * noise2(d / 900 + index * 7.1, index * 3.3) + 0.04 * Math.atan2(Math.sin(out - dir), Math.cos(out - dir));
      x += Math.sin(dir) * 60; z += Math.cos(dir) * 60;
      if (inputs.wetAt(x, z) > 0.5) break;
      xs.push(x); zs.push(z);
    }
    if (xs.length > n) {
      roads.push({ kind: pattern === 'dykeVillage' ? 'dikeRoad' : 'road', xs, zs, widthM: 5.5, from: `exit:${index}`, to: 'far' });
      for (let i = n; i < xs.length; i++) roadPts.push({ x: xs[i], z: zs[i] });
    }
  });
  // the dikes' crowns: their roads join the network, their poplars stand in rows along them
  for (const crown of dikeCrowns(spec)) {
    if (crown.road) {
      roads.push({ kind: 'dikeRoad', xs: crown.xs, zs: crown.zs, widthM: 4.5, from: crown.name ?? 'dike', to: 'dike' });
      for (let i = 0; i < crown.xs.length; i++) roadPts.push({ x: crown.xs[i], z: crown.zs[i] });
    }
    if (crown.trees) rows.push({ xs: crown.xs, zs: crown.zs, species: crown.trees, spacingM: 9, kind: 'dike' });
  }
  const roadDistance = (x: number, z: number): number => {
    let best = Infinity;
    for (const p of roadPts) { const d = Math.hypot(p.x - x, p.z - z); if (d < best) best = d; }
    return best;
  };

  // ---- sites: candidates over the near band (110 m – 1.5 km past the edge), scored by flatness, water, woods, roads
  interface Candidate { x: number; z: number; score: number; side: number; relief: number; road: number }
  const candidates: Candidate[] = [];
  const flat = spec.outland.flat;
  for (let d = 110; d <= 1500; d += 70) {
    const h = HINTERLAND_EDGE_M + d, perimeter = 8 * h;
    for (let s = rng() * 80; s < perimeter; s += 80) {
      const side = Math.floor(s / (2 * h)), t = (s % (2 * h)) - h;
      const jx = (rng() - 0.5) * 40, jz = (rng() - 0.5) * 40;
      const [x, z] = side === 0 ? [t + jx, h + jz] : side === 1 ? [h + jx, -t + jz] : side === 2 ? [-t + jx, -h + jz] : [-h + jx, t + jz];
      if (inputs.wetAt(x, z) > 0.05) continue;
      const g = inputs.heightAt(x, z);
      let lo = g, hi = g, wet = 0, woods = inputs.woodsAt(x, z);
      for (const [du, dv] of [[40, 0], [-40, 0], [0, 40], [0, -40], [28, 28], [-28, -28], [28, -28], [-28, 28]]) {
        const gh = inputs.heightAt(x + du, z + dv);
        lo = Math.min(lo, gh); hi = Math.max(hi, gh);
        wet = Math.max(wet, inputs.wetAt(x + du, z + dv));
        woods = Math.max(woods, inputs.woodsAt(x + du, z + dv));
      }
      const relief = hi - lo;
      if (relief > (flat ? 4 : 9) || wet > 0.05 || woods > 0.3) continue;
      const road = roadDistance(x, z);
      const roadBonus = road < 250 ? 1 - road / 250 : 0;
      const score = (1 - relief / 9) * 0.5 + roadBonus * 0.9 + (1 - smoothstep(600, 1500, d)) * 0.35 + rng() * 0.3;
      candidates.push({ x, z, score, side: sideOf(x, z), relief, road });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const place = (kind: HinterlandSettlementKind, count: number, minSpacing: number, radiusM: number, buildingRange: readonly [number, number], preferRoad: boolean): void => {
    const perSide = [0, 0, 0, 0];
    const cap = Math.max(1, Math.ceil(count / 3));
    let placed = 0;
    for (const c of candidates) {
      if (placed >= count) break;
      if (perSide[c.side] >= cap) continue;
      if (preferRoad && c.road > 220 && placed < count - 1) continue;
      let ok = true;
      for (const s of settlements) {
        const need = Math.max(minSpacing, (s.radiusM + radiusM) * 1.4);
        if (Math.hypot(s.x - c.x, s.z - c.z) < need) { ok = false; break; }
      }
      if (!ok) continue;
      const yaw = preferRoad && c.road < 250 ? nearestRoadYaw(c.x, c.z) : heading + (rng() < 0.5 ? 0 : Math.PI / 2);
      const nb = Math.round(buildingRange[0] + (buildingRange[1] - buildingRange[0]) * rng());
      const vertical = kind === 'village' || kind === 'town' ? spec.region.verticals[0] ?? null
        : kind === 'works' ? (spec.region.verticals.find((v) => v === 'headframe' || v === 'chimney' || v === 'kilnChimney' || v === 'burnerCone') ?? null) : null;
      settlements.push({ id: settlements.length, kind, x: c.x, z: c.z, yaw, radiusM, buildings: nb, near: true, vertical });
      perSide[c.side]++; placed++;
    }
  };
  function nearestRoadYaw(x: number, z: number): number {
    let best = Infinity, yaw = heading;
    for (const r of roads) {
      for (let i = 0; i + 1 < r.xs.length; i++) {
        const d = Math.hypot(r.xs[i] - x, r.zs[i] - z);
        if (d < best) { best = d; yaw = Math.atan2(r.xs[i + 1] - r.xs[i], r.zs[i + 1] - r.zs[i]); }
      }
    }
    return yaw;
  }

  // the town first (authored), then villages on the roads, works, hamlets, farms
  if (settle.town) {
    const p = hinterlandPoint({ azDeg: settle.town.azDeg, distM: settle.town.distM });
    const size = settle.town.size === 'large' ? [140, 400] : settle.town.size === 'medium' ? [80, 160] : [40, 90];
    settlements.push({ id: 0, kind: 'town', x: p.x, z: p.z, yaw: heading, radiusM: size[0] * 3, buildings: size[1], near: settle.town.distM < 2100,
      vertical: spec.region.verticals[0] ?? null, name: settle.town.name });
  }
  const per = spec.region.density.perVillage;
  const villageRadius = pattern === 'streetVillage' || pattern === 'dykeVillage' ? 170 : 130;
  // the sightlines' villages first (authored): each on its bearing, moved along it off water and out of woods, its
  // street on the nearest road; laid out as a near village out to 2.7 km, a far one's houses beyond
  let anchored = 0;
  // (a landmark must be seen: the sightline from the battlefield's edge on its bearing to the village crosses no wood —
  // the pilot's south view lost Ellewoutsdijk's tower behind a wood nearer the line)
  const clearSight = (q: { x: number; z: number }, azDeg: number): boolean => {
    const e = hinterlandPoint({ azDeg, distM: 530 });
    const len = Math.hypot(q.x - e.x, q.z - e.z);
    for (let t = 60; t < len - 120; t += 60) {
      const x = e.x + (q.x - e.x) * (t / len), z = e.z + (q.z - e.z) * (t / len);
      if (inputs.woodsAt(x, z) > 0.3) return false;
    }
    return true;
  };
  for (const a of settle.villagesAt) {
    let at: { x: number; z: number } | null = null, fallback: { x: number; z: number } | null = null;
    search: for (const dd of [0, -160, 160, -320, 320, -480, 480]) {
      for (const da of [0, -3, 3, -6, 6]) {
        const q = hinterlandPoint({ azDeg: a.azDeg + da, distM: a.distM + dd });
        if (inputs.wetAt(q.x, q.z) > 0.05 || inputs.woodsAt(q.x, q.z) >= 0.3
          || settlements.some((s) => Math.hypot(s.x - q.x, s.z - q.z) < 600)) continue;
        fallback ??= q;
        if (clearSight(q, a.azDeg + da)) { at = q; break search; }
      }
    }
    at ??= fallback;
    if (!at) continue;
    const near = a.distM <= 2700;
    settlements.push({
      id: settlements.length, kind: 'village', x: at.x, z: at.z, yaw: nearestRoadYaw(at.x, at.z), radiusM: villageRadius,
      buildings: Math.round(Math.max(10, per[0] * 0.7) + (Math.max(14, per[1] * 0.55) - Math.max(10, per[0] * 0.7)) * rng()),
      near, vertical: spec.region.verticals[0] ?? null, ...(a.name ? { name: a.name } : {}), ...(a.towerM ? { towerM: a.towerM } : {}),
    });
    anchored++;
  }
  place('village', Math.max(0, settle.villages - anchored), 650, villageRadius, [Math.max(8, Math.round(per[0] * 0.6)), Math.max(12, Math.round(per[1] * 0.5))], true);
  place('works', settle.works, 500, 110, [5, 9], true);
  place('hamlet', settle.hamlets, 320, 60, [3, 8], pattern !== 'dispersedHamlets');
  place('farm', settle.farms, 230, 32, [2, 4], false);

  // ---- links: a spanning tree over the settlements and the exit roads' first stretch (Prim), plus `links` extra edges
  const nodes = settlements.filter((s) => s.near && s.kind !== 'farm').map((s) => ({ x: s.x, z: s.z, id: `s${s.id}` }));
  inputs.exits.forEach((exit, index) => {
    const n = exit.xs.length;
    if (n) nodes.push({ x: exit.xs[n - 1], z: exit.zs[n - 1], id: `exit:${index}` });
  });
  if (nodes.length > 1) {
    const inTree = new Set<number>([0]);
    const edges: [number, number][] = [];
    while (inTree.size < nodes.length) {
      let best = Infinity, bi = -1, bj = -1;
      for (const i of inTree) for (let j = 0; j < nodes.length; j++) {
        if (inTree.has(j)) continue;
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
        if (d < best) { best = d; bi = i; bj = j; }
      }
      inTree.add(bj); edges.push([bi, bj]);
    }
    for (const [i, j] of edges.slice(0, Math.max(0, nodes.length - 1))) {
      const a = nodes[i], b = nodes[j];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 2600) continue;
      const line = routeLine(a, b, inputs, rng);
      if (line) roads.push({ kind: pattern === 'dykeVillage' ? 'dikeRoad' : 'track', xs: line.xs, zs: line.zs, widthM: 4, from: a.id, to: b.id });
    }
  }

  // ---- the far band: distant villages and towns whose towers stand on the skyline (1.6–12 km), at the pattern's spacing
  const farSpacing = pattern === 'dykeVillage' || pattern === 'nucleated' ? 2800 : pattern === 'streetVillage' ? 3400
    : pattern === 'dispersedHamlets' ? 2400 : pattern === 'none' || pattern === 'station' ? 0 : 4200;
  if (farSpacing > 0) {
    for (let d = 2100; d <= 12000; d += farSpacing * 0.9) {
      const count = Math.max(3, Math.round((2 * Math.PI * d) / farSpacing));
      const offset = rng() * 360;
      for (let k = 0; k < count; k++) {
        const az = offset + (k / count) * 360 + (rng() - 0.5) * (240 / count);
        const dist = d + (rng() - 0.5) * farSpacing * 0.5;
        const p = hinterlandPoint({ azDeg: az, distM: dist });
        // (a village under a flood still stands: its roofs, its tower and its trees out of the water)
        const flooded = inputs.wetAt(p.x, p.z) > 0.2 && inputs.waterKindAt?.(p.x, p.z) === 5;
        if (inputs.wetAt(p.x, p.z) > 0.2 && !flooded) continue;
        if (settlements.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < farSpacing * 0.5)) continue;
        settlements.push({ id: settlements.length, kind: 'village', x: p.x, z: p.z, yaw: heading, radiusM: 180,
          buildings: Math.round(per[0] + (per[1] - per[0]) * rng() * 0.7), near: false, vertical: spec.region.verticals[0] ?? null,
          ...(flooded ? { flooded: true } : {}) });
      }
    }
  }

  // ---- verticals: each settlement's core, then the region's own kinds at their spacing, then the authored landmarks
  for (const s of settlements) {
    if (!s.vertical) continue;
    const [h, half] = VERTICAL_SIZE[s.vertical];
    const off = s.kind === 'town' ? 0 : s.radiusM * 0.15;
    verticals.push({ kind: s.vertical, x: s.x + Math.sin(s.yaw + Math.PI / 2) * off, z: s.z + Math.cos(s.yaw + Math.PI / 2) * off,
      heightM: s.towerM ?? h * (s.kind === 'town' ? 1.25 : s.near ? 1 : 0.95),
      // (a church tower's footprint as outlandGeometry draws it: its buildings keep clear of it)
      halfM: s.vertical === 'churchTower' ? Math.max(half, (s.towerM ?? h) / ((s.towerM ?? h) >= 70 ? 10 : 7)) : half, yaw: s.yaw, settlement: s.id });
  }
  const regionExtra = spec.region.verticals.slice(1);
  if (regionExtra.includes('windmill') && pattern === 'dykeVillage') {
    // the polders' mills: on the dikes and the old land, 6–10 within reach of the edge, more in the far band
    const mills = 8;
    let placedMills = 0;
    for (const c of candidates) {
      if (placedMills >= mills) break;
      if (settlements.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < s.radiusM + 60)) continue;
      if (verticals.some((v) => v.kind === 'windmill' && Math.hypot(v.x - c.x, v.z - c.z) < 450)) continue;
      verticals.push({ kind: 'windmill', x: c.x, z: c.z, heightM: VERTICAL_SIZE.windmill[0], halfM: VERTICAL_SIZE.windmill[1], yaw: 5.24, settlement: null });
      placedMills++;
    }
    for (let k = 0; k < 14; k++) {
      const p = hinterlandPoint({ azDeg: rng() * 360, distM: 1900 + rng() * 6000 });
      if (inputs.wetAt(p.x, p.z) > 0.2) continue;
      verticals.push({ kind: 'windmill', x: p.x, z: p.z, heightM: VERTICAL_SIZE.windmill[0], halfM: VERTICAL_SIZE.windmill[1], yaw: 5.24, settlement: null });
    }
  }
  for (const kind of regionExtra) {
    if (kind === 'waterTower' || kind === 'elevator') {
      const host = settlements.find((s) => s.near && (s.kind === 'town' || s.kind === 'village'));
      if (host) verticals.push({ kind, x: host.x + host.radiusM * 0.6, z: host.z - host.radiusM * 0.3,
        heightM: VERTICAL_SIZE[kind][0], halfM: VERTICAL_SIZE[kind][1], yaw: host.yaw, settlement: host.id });
    }
  }
  for (const lm of spec.landmarks) {
    if (lm.kind === 'pylonLine' && lm.azDeg !== undefined) {
      // a power line striding out from the edge along its bearing, a tower every 320 m to 7 km
      const side = lm.from?.startsWith('exit:') ? lm.from.slice(5) : null;
      const az0 = side === 'n' ? 0 : side === 'e' ? 90 : side === 's' ? 180 : side === 'w' ? 270 : lm.azDeg;
      const a0 = (az0 * Math.PI) / 180, sx = Math.sin(a0), sz = Math.cos(a0);
      const k0 = (HINTERLAND_EDGE_M + 40) / Math.max(Math.abs(sx), Math.abs(sz));
      let x = sx * k0, z = sz * k0;
      const a = (lm.azDeg * Math.PI) / 180;
      for (let d = 0; d < 7000; d += 320) {
        if (inputs.wetAt(x, z) < 0.2) verticals.push({ kind: 'pylonLine', x, z, heightM: VERTICAL_SIZE.pylonLine[0], halfM: VERTICAL_SIZE.pylonLine[1], yaw: a, settlement: null, name: lm.name });
        x += Math.sin(a) * 320; z += Math.cos(a) * 320;
      }
      continue;
    }
    if (!lm.at) continue;
    const p = hinterlandPoint(lm.at);
    const [h, half] = VERTICAL_SIZE[lm.kind];
    verticals.push({ kind: lm.kind, x: p.x, z: p.z, heightM: lm.heightM ?? h, halfM: half, yaw: 0, settlement: null, name: lm.name });
  }

  // ---- buildings: each near settlement's footprints by its pattern (a street village along its yaw, a nucleated one
  // round its core, a farm's yard round its paved court), squared to the street, kept off water, off the roads, off the
  // verticals' feet and off one another (a few tries a footprint; one that will not fit is left out)
  const roadBoxes = roads.map((r) => ({ r, minX: Math.min(...r.xs) - 30, maxX: Math.max(...r.xs) + 30, minZ: Math.min(...r.zs) - 30, maxZ: Math.max(...r.zs) + 30 }));
  const roadHit = { i: 0, t: 0 };
  const clearOfRoads = (x: number, z: number, radius: number): boolean => {
    for (const { r, minX, maxX, minZ, maxZ } of roadBoxes) {
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      if (polylineDist(r.xs, r.zs, x, z, roadHit) < radius + r.widthM / 2 + 3) return false;
    }
    return true;
  };
  const footprintClear = (x: number, z: number, radius: number): boolean => {
    for (const o of buildings) if (Math.hypot(o.x - x, o.z - z) < radius + Math.hypot(o.width, o.depth) * 0.5 + 3) return false;
    for (const v of verticals) if (Math.hypot(v.x - x, v.z - z) < radius + v.halfM + 4) return false;
    return true;
  };
  for (const s of settlements) {
    if (!s.near) continue;
    const kinds = buildingKinds(spec, s.kind);
    const cos = Math.cos(s.yaw), sin = Math.sin(s.yaw);
    const linear = pattern === 'streetVillage' || pattern === 'dykeVillage' || pattern === 'colony';
    for (let b = 0; b < s.buildings; b++) {
      const kind = kinds[b % kinds.length];
      const big = kind === 'barn' || kind === 'depot' || kind === 'granary';
      const width = big ? 12 + rng() * 6 : 7 + rng() * 3, depth = big ? 18 + rng() * 8 : 9 + rng() * 4;
      const radius = Math.hypot(width, depth) * 0.5;
      for (let attempt = 0; attempt < 8; attempt++) {
        let u: number, v: number, yaw: number;
        const jitter = attempt * 0.35;
        if (s.kind === 'farm') {
          const a = (b / s.buildings) * Math.PI * 2 + rng() * 0.4 + jitter;
          const r = 16 + radius + attempt * 4;
          u = Math.sin(a) * r; v = Math.cos(a) * r; yaw = s.yaw + (b % 2) * Math.PI / 2;
        } else if (linear) {
          const along = (b / Math.max(1, s.buildings - 1) - 0.5) * s.radiusM * 1.8 + (rng() - 0.5) * (8 + attempt * 10);
          const sideSign = (b + attempt) % 2 === 0 ? 1 : -1;
          u = sideSign * (8 + radius + rng() * 6 + attempt * 3); v = along; yaw = s.yaw + (sideSign > 0 ? Math.PI / 2 : -Math.PI / 2);
        } else {
          const a = rng() * Math.PI * 2, r = 22 + Math.sqrt(rng()) * s.radiusM * 0.8;
          u = Math.sin(a) * r; v = Math.cos(a) * r; yaw = s.yaw + Math.round(rng() * 3) * Math.PI / 2;
        }
        const x = s.x + u * cos + v * sin, z = s.z - u * sin + v * cos;
        if (inputs.wetAt(x, z) > 0.02 || !clearOfRoads(x, z, radius) || !footprintClear(x, z, radius)) continue;
        // a level footprint: no more than 2.5 m of relief under it (the yard is levelled, not terraced into a slope)
        const h0 = inputs.heightAt(x, z);
        if (Math.abs(inputs.heightAt(x + radius, z) - h0) > 2.5 || Math.abs(inputs.heightAt(x, z + radius) - h0) > 2.5
          || Math.abs(inputs.heightAt(x - radius, z) - h0) > 2.5 || Math.abs(inputs.heightAt(x, z - radius) - h0) > 2.5) continue;
        buildings.push({ settlement: s.id, kind, x, z, yaw, width, depth });
        break;
      }
    }
  }

  // ---- the trees (HL-2b, the coordinator on the first eye sheets: "one unbroken wall of trees all round, at a single
  // height, every row the same dark green"): a row is planted in cohorts — segments of a few hundred metres, each its own
  // age and height (a young poplar 12 m, an old one 30), some segments felled or never planted, a willow or an oak reach
  // here and there — and single trees go missing; the farms stand in their shelter groups; some roads run between
  // avenues. Long views open between them where no row stands.
  const trees: HinterlandTree[] = [];
  const species = spec.region.vegetation.species.length ? spec.region.vegetation.species : [['oak', 1] as const];
  const pickSpecies = (u: number): string => {
    let acc = 0; const total = species.reduce((a, [, w]) => a + w, 0);
    for (const [name, w] of species) { acc += w / total; if (u < acc) return name; }
    return species[species.length - 1][0];
  };
  const CONIFERS = new Set(['pine', 'spruce', 'fir', 'cedar', 'cypress', 'larch']);
  const seasonLeaf = HINTERLAND_SEASON_LEAF[spec.season];
  /** A tree of a species, a form and an age (0 young … 1 old): its height and crown, its foliage left. */
  const makeTree = (x: number, z: number, name: string, form: HinterlandTree['form'], age: number, tone: number): HinterlandTree => {
    const canopy = spec.region.vegetation.canopyM || 18;
    let h: number, c: number;
    if (form === 'columnar') { h = 16 + 14 * age; c = 2.3 + 1.2 * age; }
    else if (form === 'pollard') { h = 5 + 3 * age; c = 2.4 + 1.2 * age; }
    else if (form === 'conifer') { h = canopy * (0.55 + 0.6 * age); c = 2.4 + 1.6 * age; }
    else if (name === 'poplar') { h = 18 + 14 * age; c = 4.5 + 3.5 * age; } // a Canadian poplar: tall, broad
    else if (name === 'palm') { h = 8 + 10 * age; c = 3 + 1 * age; }
    else { h = canopy * (0.55 + 0.55 * age); c = 3.5 + 3.5 * age; }
    const leaf = form === 'conifer' ? 1 : Math.max(0, Math.min(1, seasonLeaf + (rng() - 0.5) * 0.5 * (1 - Math.abs(seasonLeaf - 0.5))));
    return { x, z, species: name, heightM: h, crownM: c, tone, form, leaf };
  };
  /** A row species' forms: poplar rows mostly broad (a Lombardy reach as an accent), willows pollarded. */
  const rowForm = (name: string, accent: number): HinterlandTree['form'] =>
    CONIFERS.has(name) ? 'conifer' : name === 'willow' ? 'pollard' : name === 'poplar' && accent < 0.14 ? 'columnar' : 'broad';
  for (const row of rows) {
    let segLeft = 0, present = true, age = 0.5, segSpecies = row.species, segForm: HinterlandTree['form'] = 'broad';
    let carry = 0;
    for (let i = 0; i + 1 < row.xs.length; i++) {
      const ax = row.xs[i], az = row.zs[i], bx = row.xs[i + 1], bz = row.zs[i + 1], len = Math.hypot(bx - ax, bz - az);
      for (let t = carry; t < len; t += row.spacingM) {
        if (segLeft <= 0) {
          segLeft = 80 + 320 * rng();
          present = rng() < 0.7;
          age = rng();
          // (a reach of ash or oak, or of pollard willows where the row runs by water)
          const mix = rng();
          segSpecies = mix < 0.18 ? 'oak' : mix < 0.3 && row.species === 'poplar' ? 'willow' : row.species;
          segForm = rowForm(segSpecies, rng());
        }
        segLeft -= row.spacingM;
        carry = t + row.spacingM - len;
        if (!present || rng() < 0.08) continue;
        const x = bx === ax && bz === az ? ax : ax + (bx - ax) * (t / len) + (rng() - 0.5) * 1.2;
        const z = bx === ax && bz === az ? az : az + (bz - az) * (t / len) + (rng() - 0.5) * 1.2;
        trees.push(makeTree(x, z, segSpecies, segForm, Math.max(0, Math.min(1, age + (rng() - 0.5) * 0.25)), Math.max(0, Math.min(1, age * 0.7 + rng() * 0.3))));
      }
    }
  }
  // the farms' and hamlets' shelter groups, the villages' edges
  for (const st of settlements) {
    if (!st.near || st.kind === 'works') continue;
    const n = st.kind === 'farm' ? 4 + Math.floor(rng() * 6) : st.kind === 'hamlet' ? 6 + Math.floor(rng() * 6) : 10 + Math.floor(rng() * 10);
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, r = st.radiusM * (0.7 + rng() * 0.6) + 10;
      const x = st.x + Math.sin(a) * r, z = st.z + Math.cos(a) * r;
      if (inputs.wetAt(x, z) > 0.05 || !clearOfRoads(x, z, 3) || !footprintClear(x, z, 2)) continue;
      const name = pickSpecies(rng());
      trees.push(makeTree(x, z, name, rowForm(name, rng() + 0.1), 0.3 + rng() * 0.7, rng()));
    }
  }
  // avenues: some stretches of the roads that run on (not the dyke crowns: their rows are the dykes')
  const avenues = spec.region.vegetation.habit === 'shelterbelt' || spec.region.vegetation.habit === 'hedgerow' || spec.region.vegetation.habit === 'dikeRows';
  if (avenues) {
    for (const road of roads) {
      if (road.kind === 'dikeRoad' || road.kind === 'rail') continue;
      let on = false, left = 0;
      const name = pickSpecies(rng()), age = rng();
      for (let i = 0; i + 1 < road.xs.length; i++) {
        const ax = road.xs[i], az = road.zs[i], bx = road.xs[i + 1], bz = road.zs[i + 1], len = Math.hypot(bx - ax, bz - az) || 1;
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        for (let t = 0; t < len; t += 11) {
          if (left <= 0) { on = rng() < 0.4; left = 150 + rng() * 350; }
          left -= 11;
          if (!on) continue;
          const px = ax + (bx - ax) * (t / len), pz = az + (bz - az) * (t / len);
          if (Math.max(Math.abs(px), Math.abs(pz)) < HINTERLAND_EDGE_M + 30) continue;
          for (const side of [-1, 1]) {
            const x = px + nx * side * (road.widthM / 2 + 4), z = pz + nz * side * (road.widthM / 2 + 4);
            if (inputs.wetAt(x, z) > 0.05 || rng() < 0.07) continue;
            trees.push(makeTree(x, z, name, rowForm(name, 0.5), Math.max(0, Math.min(1, age + (rng() - 0.5) * 0.2)), age));
          }
        }
      }
    }
  }

  // ---- the sightlines' long views (the tower pass, 2026-10-14: the pilot's eye frames lost every sightline tower
  // behind a dyke's poplars nearer the line): where a row or an avenue crosses the view from the battlefield to a
  // sightline village, its trees there are felled (a gap in the row, as Zeeland's rows have), so the tower stands clear
  const sightlines = settlements.filter((s) => s.towerM).map((s) => ({ az: Math.atan2(s.x, s.z), d: Math.hypot(s.x, s.z) }));
  if (sightlines.length) {
    const kept = trees.filter((t) => {
      const az = Math.atan2(t.x, t.z), d = Math.hypot(t.x, t.z);
      for (const v of sightlines) {
        let da = Math.abs(az - v.az);
        if (da > Math.PI) da = 2 * Math.PI - da;
        // (the corridor: ±4.5° about the bearing from the square's centre, which covers the views from its edges)
        if (da < 0.0785 && d < v.d - 60) return false;
      }
      return true;
    });
    trees.length = 0;
    trees.push(...kept);
  }

  // ---- term 3: the yards levelled and the roads graded (near band only: the far band's ground is the field's own)
  const pads: HinterlandFlatPad[] = [];
  for (const b of buildings) pads.push({ x: b.x, z: b.z, r: Math.hypot(b.width, b.depth) * 0.5 + 2, featherM: 10, y: Number.NaN, kind: 'yard' });
  for (const v of verticals) if (Math.max(Math.abs(v.x), Math.abs(v.z)) < 2600) pads.push({ x: v.x, z: v.z, r: v.halfM + 2, featherM: 8, y: Number.NaN, kind: 'yard' });
  const lines: HinterlandGradeLine[] = roads.map((r) => ({
    xs: r.xs, zs: r.zs, halfWidthM: r.widthM / 2, featherM: 7, crownM: r.kind === 'dikeRoad' ? 0.8 : 0.15,
    kind: r.kind === 'rail' ? 'rail' : r.kind === 'track' ? 'track' : 'road',
  }));
  return { settlements, roads, verticals, buildings, rows, trees, features: { pads, lines }, ms: performance.now() - started };
}

/** Distance from (x, z) to a polyline (its segment and parameter into `hit`). */
function polylineDist(xs: ArrayLike<number>, zs: ArrayLike<number>, x: number, z: number, hit: { i: number; t: number }): number {
  let best = Infinity;
  for (let i = 0; i + 1 < xs.length; i++) {
    const ax = xs[i], az = zs[i], bx = xs[i + 1] - ax, bz = zs[i + 1] - az;
    const len2 = bx * bx + bz * bz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / len2)) : 0;
    const d = Math.hypot(x - ax - bx * t, z - az - bz * t);
    if (d < best) { best = d; hit.i = i; hit.t = t; }
  }
  return best;
}

/** A road between two points, bending round water and easing over the land (a straight run with a few kinks). */
function routeLine(a: { x: number; z: number }, b: { x: number; z: number }, inputs: HinterlandPlanInputs, rng: () => number): { xs: number[]; zs: number[] } | null {
  const xs: number[] = [a.x], zs: number[] = [a.z];
  const len = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(2, Math.ceil(len / 50));
  const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
  const bow = (rng() - 0.5) * len * 0.12;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    let x = a.x + (b.x - a.x) * t + nx * bow * Math.sin(Math.PI * t), z = a.z + (b.z - a.z) * t + nz * bow * Math.sin(Math.PI * t);
    // keep out of the square and off water: step aside along the normal
    for (let k = 0; k < 8 && (inputs.wetAt(x, z) > 0.3 || Math.max(Math.abs(x), Math.abs(z)) < HINTERLAND_EDGE_M + 20); k++) {
      x += nx * 40 * (k % 2 ? -1 : 1) * (k + 1); z += nz * 40 * (k % 2 ? -1 : 1) * (k + 1);
    }
    xs.push(x); zs.push(z);
  }
  xs.push(b.x); zs.push(b.z);
  return xs.length >= 2 ? { xs, zs } : null;
}

/** The planner's inputs from a field and a height sampler (the pyramid's), with the ground's exits. */
export function planInputsFrom(field: HinterlandField, heightAt: (x: number, z: number) => number,
  exits: readonly { xs: ArrayLike<number>; zs: ArrayLike<number>; length: number }[]): HinterlandPlanInputs {
  const water = { wet: 0, level: 0, kind: 0 };
  const cover = { cls: 0, crop: 31, fieldId: 0, woods: 0, hedge: 0, wet: 0, rock: 0, scree: 0, snow: 0, settle: 0, road: 0, edgeU: 1e9, edgeV: 1e9 };
  return {
    heightAt,
    wetAt: (x, z) => field.waterAt(x, z, water).wet,
    waterKindAt: (x, z) => field.waterAt(x, z, water).kind,
    woodsAt: (x, z) => { field.coverAt(x, z, cover, 2, heightAt(x, z)); return cover.woods; },
    exits,
  };
}

export { SIDE_NAMES };
