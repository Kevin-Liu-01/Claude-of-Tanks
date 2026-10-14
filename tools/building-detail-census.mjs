// tools/building-detail-census.mjs — the building-detail census (BLD-04 / HB-1b; props Lane B, 2026-10-14; promoted from
// the 10-12 B1 probe, docs/BUILDING-DETAIL.md). Every regional kit's buildings measured the way the owner reads them:
//
//   kits   each builder built at three seeds (11 plaster, 29 plaster2, 47 stone) on its own map, with the shared detail
//          modules instrumented (building-detail-census-loader.mjs): triangles, triangles per m² of wall, the decor and
//          fine shares, its buffer hashes at seeds 11 and 29, the house grammar's specs it built; per kit, over its
//          dwelling-class builders, Verdant's twenty elements E1–E20 (B1 §2.3), the three reading distances (K2),
//          the geometry floor (K3: tris/m² and fine share), the face pass (K4: dwellings through buildHouse) and the
//          regional light kit (K9). The declared-bespoke manifest credits craft the instrumentation cannot see.
//   maps   every battlefield's planned kinds against its kit (K1 coverage: the share built by the map's own kit).
//   world  (--world; minutes a map) each battlefield built in Node as the dedicated host builds it (headlessWorldCollision):
//          K12 — floating buildings (a footprint corner whose ground lies below the building's lowest part), identical
//          houses (the share of distinct dwelling geometries) and the empty core (the densest cluster's buildings and
//          the share of the plan it holds).
//
//   node tools/building-detail-census.mjs [--json=out.json] [--kits=a,b] [--world] [--maps=a,b] [--check] [--update-baseline]
//
// --check compares against src/world/buildingDetail.baseline.json and fails when a kit or a map drops below its own
// baseline (the ratchet: buildingDetail.selftest.mjs); --update-baseline rewrites it from this run.
import { register } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

register('./building-detail-census-loader.mjs', import.meta.url);

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const BASELINE_PATH = `${ROOT}src/world/buildingDetail.baseline.json`;

/** The dwelling class (B1): the builders a kit's houses come from. */
export const DWELLINGS = new Set(['cottage', 'farmhouse', 'tavern', 'cornershop', 'rowhouse', 'rangerlodge', 'alpine', 'logcabin', 'adobe', 'bathhouse',
  'marketRow', 'compound']);
/** The plot each builder is measured on (B1 kitBuild: the base plan's sizes). */
const INFO = {
  alpine: [8.7, 10.5, 6.7], logcabin: [6.2, 7.0, 4.0], onionchurch: [7.5, 10.0, 12.2], yardshed: [3.6, 3.0, 3.2],
  cottage: [6.0, 8.4, 5.0], farmhouse: [13.4, 9.9, 6.0], tavern: [9.7, 14.9, 8.4], schoolhouse: [9.1, 16.1, 11],
  cornershop: [9.0, 9.0, 7.3], barn: [8.4, 12.3, 6.2], granary: [4.2, 6.4, 4.7], woodshed: [4.3, 5.4, 3.1],
  depot: [11, 20, 6], ruin: [6.8, 9.0, 3.0], church: [9.6, 23.1, 20.4], chapel: [5.8, 8.6, 8.0], mill: [6.6, 6.6, 9.9],
  boatshed: [9.0, 12.0, 5.0], tower: [3.8, 3.8, 9.4], foundryoffice: [13.5, 14.4, 9.8], warehouse: [16, 24, 7.5],
  rangerlodge: [12.8, 16.4, 10.7], marketRow: [12, 5.2, 3.2], fishery: [18, 20, 7], rowhouse: [9.6, 10.2, 11],
  adobe: [6.6, 7.6, 4.2], caravanserai: [21.4, 19.4, 7.4], compound: [23, 14.5, 5.6], compoundSouk: [22, 16, 6],
  minaret: [4, 4, 13], bathhouse: [11, 10, 7], factory: [16, 26, 15], watertower: [5.6, 5.6, 14],
  shed: [8, 14, 6], stack: [3.4, 3.4, 26], market: [6.6, 5.2, 3.0], containerRow: [15, 6.4, 3.4], gantry: [21, 5.4, 12],
  firestation: [11.8, 15.4, 14.1], terrace: [22, 9.6, 9], netyard: [14, 10, 4], lighthouse: [6, 6, 18],
  megatower: [23.7, 24.7, 64.8], needletower: [19, 21, 64.9], arcology: [31, 23.2, 49.7], terracetower: [25.4, 22.4, 56.3],
  civichall: [33.2, 22.8, 14.7], parkingdeck: [27.4, 22.4, 13.7], broadcasttower: [24.2, 20.2, 60.1],
};
/**
 * The declared-bespoke manifest (B1 §2.3, PLAN K3): elements a kit lays in its own code where the shared-module
 * instrumentation cannot see them, confirmed by reading; credited as present ('b'). These kits are judged on K2 and
 * captures, not on K3's triangle floor.
 */
export const BESPOKE = {
  breton: { E5: 'lucarnes', E6: 'gable-end stacks', E14: 'coped gable parapets with kneelers' },
  polder: { E6: 'gable stacks' },
  andalusian: { E11: 'rejas and balconies' },
  longleaf: { E13: 'porch on brick piers' },
  wadirum: { E19: 'regional light kinds as structureVariants (wadiRumPosts.ts)' },
  ksar: { E19: 'regional light kinds as structureVariants (ksarGate.ts)' },
};
/** The three reading distances (K2): which elements each one reads. */
export const TIERS = {
  silhouette: ['E3', 'E4', 'E6', 'E13', 'E18'], // 100-300 m: eave, ridge, chimney, porch, yard
  mid: ['E1', 'E2', 'E8', 'E10', 'E12', 'E16'], // 30-100 m: plinth, its band, surrounds, shutters, door steps, wall craft
  fine: ['E5', 'E7', 'E9', 'E11', 'E14', 'E15', 'E17'], // 5-30 m: roof craft, glazing bars, sills, ornament, gable craft, gutters, dressing
};
const ELEMENTS = Array.from({ length: 20 }, (_, i) => `E${i + 1}`);
const SEEDS = [[11, 'plaster'], [29, 'plaster2'], [47, 'stone']];

function geometryHash(parts) {
  const h = createHash('sha1');
  for (const bucket of Object.keys(parts).sort()) {
    const list = parts[bucket];
    if (!Array.isArray(list)) continue;
    h.update(bucket);
    for (const g of list) {
      const pos = g.getAttribute?.('position');
      if (!pos) continue;
      h.update(Buffer.from(pos.array.buffer, pos.array.byteOffset, pos.array.byteLength));
      if (g.index) h.update(Buffer.from(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength));
    }
  }
  return h.digest('hex').slice(0, 16);
}

/** Every kit's builders measured (the kits section). */
export async function censusKits({ kits = null } = {}) {
  const { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } = await import('../src/world/maps/regional/index.ts');
  const { streamFrom } = await import('../src/world/maps/regional/geometry.ts');
  const { REGIONAL_DESTRUCTIBLE_TYPES } = await import('../src/world/maps/structureKit.ts');
  const { MAP_IDS, getMapConfig } = await import('../src/world/maps/index.ts').then(async (m) => ({ ...m, ...(await import('../src/world/maps/mapIds.ts')) }));
  const mapOf = {};
  for (const id of MAP_IDS) {
    const kit = getMapConfig(id).props?.architecture;
    if (kit && !mapOf[kit]) mapOf[kit] = id;
  }
  let cur = null;
  globalThis.__bdcRecord = (name, a) => {
    if (!cur) return;
    cur.calls[name] = (cur.calls[name] || 0) + 1;
    if (name === 'openings.ts:windowUnit') {
      const s = a[6] || {};
      cur.win.n++;
      if (s.shutters) cur.win.shutters++;
      if (s.surround) cur.win.surround++;
      if (s.sill) cur.win.sill++;
      if (s.carved) cur.win.carved++;
      if (s.head) cur.win.head++;
      if (s.bars && s.bars !== 'none') cur.win.bars++;
      if (s.shutters?.paint) cur.win.paintedShutters++;
    } else if (name === 'openings.ts:doorUnit') {
      const s = a[6] || {};
      cur.door.n++;
      if (s.steps) cur.door.steps++;
    } else if (name === 'openings.ts:gateUnit') cur.door.n++;
  };
  const builders = [];
  const kitRows = [];
  try {
    for (const style of ARCHITECTURE_STYLES) {
      if (kits && !kits.includes(style.id)) continue;
      const mapId = mapOf[style.id] ?? 'selftest';
      const snowCap = mapId === 'whiteout' || mapId === 'alpine';
      const rows = [];
      for (const id of Object.keys(style.builders)) {
        const [w, d, h] = INFO[id] ?? [7, 9, 6];
        const row = { kit: style.id, id, dwelling: DWELLINGS.has(id), w, d, h, tris: 0, decor: 0, fine: 0, hashes: {}, specs: [], buildHouse: false,
          calls: {}, win: { n: 0, shutters: 0, surround: 0, sill: 0, carved: 0, head: 0, bars: 0, paintedShutters: 0 }, door: { n: 0, steps: 0 }, seeds: 0 };
        for (const [seed, wall] of SEEDS) {
          cur = row;
          let parts;
          try {
            parts = buildRegionalParts(style, {
              structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
              wallBucket: wall, rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId, snowCap, tier: 'desktop',
            }, streamFrom(seed * 3 + 5));
          } catch (error) { row.error = String(error).slice(0, 160); cur = null; break; }
          cur = null;
          row.seeds++;
          for (const list of Object.values(parts)) {
            if (!Array.isArray(list)) continue;
            for (const g of list) {
              const pos = g.getAttribute?.('position');
              if (!pos) continue;
              const t = (g.index ? g.index.count : pos.count) / 3;
              row.tris += t;
              if (g.userData?.noCollision) row.decor += t;
              if (g.userData?.fine) row.fine += t;
            }
          }
          if (seed !== 47) row.hashes[seed] = geometryHash(parts);
          for (const hp of regionalKitPlanOf(parts)?.houses ?? []) {
            const s = hp.spec;
            row.specs.push({ plinth: s.plinth ? s.plinth.h : 0, eave: s.roof.eave ?? 0, ridge: !!s.roof.ridge, chimneys: s.chimneys.length, gutters: !!s.gutters,
              verge: !!s.verge, rafters: !!s.rafters, roof: s.roof.kind, thickness: s.roof.thickness ?? 0 });
          }
        }
        if (row.calls['house.ts:buildHouse']) row.buildHouse = true;
        if (row.seeds) {
          row.tris = Math.round(row.tris / row.seeds);
          row.decorShare = row.tris ? +(row.decor / row.seeds / row.tris).toFixed(3) : 0;
          row.fineShare = row.tris ? +(row.fine / row.seeds / row.tris).toFixed(3) : 0;
          row.trisPerWallM2 = +(row.tris / (2 * (w + d) * h)).toFixed(2);
        }
        delete row.decor; delete row.fine;
        rows.push(row);
        builders.push(row);
      }
      kitRows.push(scoreKit(style, rows, REGIONAL_DESTRUCTIBLE_TYPES?.[style.id], mapId));
    }
  } finally { globalThis.__bdcRecord = undefined; }
  return { kits: kitRows, builders: builders.map(({ specs, ...b }) => ({ ...b, houses: specs.length })) };
}

/** One kit's elements, reading distances, floors and face pass over its dwelling-class builders. */
export function scoreKit(style, rows, light, mapId) {
  const okRows = rows.filter((r) => r.seeds);
  const dwell = okRows.filter((r) => r.dwelling);
  const D = dwell.length ? dwell : okRows;
  const specs = D.flatMap((r) => r.specs);
  const calls = {};
  const win = { n: 0, shutters: 0, surround: 0, sill: 0, carved: 0, head: 0, bars: 0, paintedShutters: 0 }, door = { n: 0, steps: 0 };
  for (const r of D) {
    for (const [k, v] of Object.entries(r.calls)) calls[k] = (calls[k] || 0) + v;
    for (const k of Object.keys(win)) win[k] += r.win[k];
    for (const k of Object.keys(door)) door[k] += r.door[k];
  }
  const any = (...names) => names.some((n) => calls[n] > 0);
  const half = (pred, share = 0.5) => specs.length > 0 && specs.filter(pred).length >= specs.length * share;
  const ratio = (a, b, share) => b > 0 && a / b >= share;
  const E = {
    E1: half((s) => s.plinth >= 0.15),
    E2: any('facade.ts:plinthPaint') || (style.groundCraft !== false && half((s) => s.plinth >= 0.2)),
    E3: half((s) => s.eave >= 0.3),
    E4: half((s) => s.ridge),
    E5: any('facade.ts:thatchCourses', 'facade.ts:ridgeRiders', 'facade.ts:roofDormers'),
    E6: half((s) => s.chimneys > 0),
    E7: ratio(win.bars, win.n, 0.5),
    E8: ratio(win.surround, win.n, 0.5),
    E9: ratio(win.sill, win.n, 0.5),
    E10: ratio(win.shutters, win.n, 0.3),
    E11: any('facade.ts:nalichnikCrest', 'facade.ts:windowHead') || win.carved > 0 || win.head > 0 || win.paintedShutters > 0,
    E12: ratio(door.steps, door.n, 0.5),
    // (an extra roof over a door: a roof the builder emits beyond its houses' own — kolkhoz's ganok, a shophouse's awning)
    E13: any('vernacular.ts:veranda', 'facade.ts:doorCanopy', 'house.ts:leanTo') || (calls['house.ts:emitRoof'] ?? 0) > (calls['house.ts:buildHouse'] ?? 0),
    E14: any('facade.ts:carvedVerge', 'facade.ts:gableWindows') || specs.some((s) => s.verge || s.rafters),
    E15: half((s) => s.gutters, 0.3),
    E16: any('facade.ts:pilaster', 'facade.ts:dentilCornice', 'facade.ts:dressedQuoin', 'facade.ts:plinthPaint', 'facade.ts:paintBand'),
    E17: any(...['flowerBox', 'bench', 'woodpile', 'wallLantern', 'washingLine', 'floweringShrub', 'hollyhocks', 'tvAerial', 'roofLadder', 'pottedPlant'].map((n) => `dressing.ts:${n}`)),
    E18: !!style.yard,
    E19: !!light && Object.keys(light).length > 0,
    E20: D.length > 0 && D.filter((r) => r.buildHouse).length >= D.length / 2,
  };
  const bespoke = BESPOKE[style.id] ?? {};
  const marks = Object.fromEntries(ELEMENTS.map((e) => [e, E[e] ? '●' : bespoke[e] ? 'b' : '·']));
  const present = (e) => marks[e] !== '·';
  const tier = Object.fromEntries(Object.entries(TIERS).map(([name, els]) => [name, els.filter(present).length]));
  const tris = D.reduce((s, r) => s + r.tris, 0), wall = D.reduce((s, r) => s + 2 * (r.w + r.d) * r.h, 0);
  const fineTris = D.reduce((s, r) => s + r.tris * (r.fineShare ?? 0), 0);
  return {
    kit: style.id, map: mapId, builders: okRows.length, errors: rows.filter((r) => !r.seeds).map((r) => r.id), dwellingBuilders: dwell.map((r) => r.id),
    marks, score: ELEMENTS.filter(present).length, tiers: tier,
    trisPerWallM2: wall ? +(tris / wall).toFixed(2) : 0, fineShare: tris ? +(fineTris / tris).toFixed(3) : 0,
    facePass: D.length ? +(D.filter((r) => r.buildHouse).length / D.length).toFixed(3) : 0,
    allFacePass: okRows.length ? +(okRows.filter((r) => r.buildHouse).length / okRows.length).toFixed(3) : 0,
    lightKinds: light ? Object.keys(light).length : 0, yard: !!style.yard, bespoke: Object.keys(bespoke).length > 0,
    windows: win.n, doors: door.n,
  };
}

/** Every battlefield's planned kinds against its kit (K1). */
export async function censusMaps({ maps = null } = {}) {
  const { MAP_IDS } = await import('../src/world/maps/mapIds.ts');
  const { getMapConfig } = await import('../src/world/maps/index.ts');
  const { resolveRegionalArchitecture } = await import('../src/world/maps/regional/index.ts');
  const out = [];
  for (const id of MAP_IDS) {
    if (maps && !maps.includes(id)) continue;
    const P = getMapConfig(id).props ?? {};
    const kit = P.architecture ? resolveRegionalArchitecture(P.architecture) : null;
    const kinds = [...(P.plan ?? []), ...(P.plannedSites ?? []).map((s) => s.structure), ...(P.townPlan ?? []).map((t) => t.structure)];
    const distinct = [...new Set(kinds)];
    const fromKit = distinct.filter((k) => kit?.builders[k]);
    const plans = kinds.length, kitPlans = kinds.filter((k) => kit?.builders[k]).length;
    out.push({ map: id, kit: P.architecture ?? null, planned: plans, kinds: distinct.length, kitKinds: fromKit.length,
      coverage: distinct.length ? +(fromKit.length / distinct.length).toFixed(3) : 1, planCoverage: plans ? +(kitPlans / plans).toFixed(3) : 1,
      generic: distinct.filter((k) => !kit?.builders[k]), yard: !!kit?.yard, rows: (P.townRowPlan ?? []).length });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------- world

let worldMods = null;
async function worldModules() {
  if (worldMods) return worldMods;
  const { installWorldBuildFixture } = await import('./headlessWorldCollision.mjs');
  installWorldBuildFixture();
  const [maps, terrain, vegetation, props, fleet, models] = await Promise.all([
    import('../src/world/maps/index.ts'), import('../src/world/terrain.ts'), import('../src/world/vegetation.ts'),
    import('../src/world/props.ts'), import('../src/vehicles/fleetFactory.ts'), import('../src/world/propsModelStore.ts'),
  ]);
  await models.preloadPropModels();
  worldMods = { maps, terrain, vegetation, props, fleet };
  return worldMods;
}

/**
 * K12 on one battlefield, built in Node with the shards' seeds as the dedicated host builds it (headlessWorldCollision):
 * every placed building's damage anatomy (its builder, pose, footprint, openings) and its lowest collision part.
 *   floating   a footprint corner whose ground lies more than 5 cm below the building's lowest part;
 *   identical  the share of dwellings whose anatomy (size, storeys, every face's openings, roof, chimneys) repeats another's;
 *   core       the largest cluster of buildings standing within 45 m of each other, and its share of the map's buildings.
 */
export async function censusWorld(mapId) {
  const { maps, terrain, vegetation, props, fleet } = await worldModules();
  const config = maps.getMapConfig(mapId);
  const wreckIds = config.props?.tankWrecks?.ids ?? [];
  if (wreckIds.length) await fleet.ensureTankBuilders(wreckIds);
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  const field = terrain.createHeightField(1337, config);
  const flora = vegetation.createVegetation(field, engine, 2001, config);
  const dressing = props.createProps(field, engine, 2002, config, flora);
  const bottom = new Map();
  for (const o of dressing.obstacles) {
    if (o.kind !== 'structure' || o.structureIdx === undefined) continue;
    bottom.set(o.structureIdx, Math.min(bottom.get(o.structureIdx) ?? Infinity, o.min[1]));
  }
  const r2 = (v) => Math.round(v * 50) / 50;
  const records = [...dressing.structureDamage.entries()].map(([idx, { builder, style, anatomy: a }]) => {
    const p = a.placement ?? { x: 0, y: 0, z: 0, yaw: 0 }, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
      const lx = sx * a.w / 2, lz = sz * a.d / 2;
      return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
    });
    const signature = JSON.stringify([builder, style, r2(a.w), r2(a.d), r2(a.h), a.plinth ? r2(a.plinth.h) : 0, a.roof?.kind ?? null, (a.chimneys ?? []).length,
      (a.storeys ?? []).map((st) => (st.faces ?? []).map((f) => [f.name, r2(f.width), r2(f.height), (f.openings ?? []).map((o) => [o.kind, r2(o.u), r2(o.w), r2(o.y0), r2(o.h)])]))]);
    return { idx, builder, style, x: p.x, z: p.z, y: p.y, corners, bottom: bottom.get(idx) ?? p.y, signature };
  });
  const floating = [];
  for (const r of records) {
    const low = Math.min(...r.corners.map(([x, z]) => field.getHeightAt(x, z)));
    if (Number.isFinite(low) && low < r.bottom - 0.05) floating.push({ builder: r.builder, gap: +(r.bottom - low).toFixed(2), x: +r.x.toFixed(1), z: +r.z.toFixed(1) });
  }
  const houses = records.filter((r) => DWELLINGS.has(r.builder));
  const groups = {};
  for (const r of houses) groups[r.signature] = (groups[r.signature] || 0) + 1;
  const parent = records.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) {
    if (Math.hypot(records[i].x - records[j].x, records[i].z - records[j].z) < 45) parent[find(i)] = find(j);
  }
  const sizes = {};
  for (let i = 0; i < records.length; i++) sizes[find(i)] = (sizes[find(i)] || 0) + 1;
  const core = Math.max(0, ...Object.values(sizes));
  return {
    map: mapId, kit: config.props?.architecture ?? null, buildings: records.length, dwellings: houses.length, distinctDwellings: Object.keys(groups).length,
    identicalShare: houses.length ? +(1 - Object.keys(groups).length / houses.length).toFixed(3) : 0, largestIdentical: Math.max(0, ...Object.values(groups)),
    floating: floating.length, floatingWorst: floating.sort((a, b) => b.gap - a.gap).slice(0, 5),
    coreBuildings: core, coreShare: records.length ? +(core / records.length).toFixed(3) : 0, clusters: Object.keys(sizes).length,
  };
}

// ------------------------------------------------------------------------------------------------------------- ratchet

/** A run's ratchet figures: per kit its score and reading distances, density and face pass; per map its coverage. */
export function baselineOf(run) {
  return {
    note: 'building-detail census (tools/building-detail-census.mjs): a kit or map may rise, never drop. --update-baseline after a deliberate change.',
    kits: Object.fromEntries(run.kits.map((k) => [k.kit, { score: k.score, silhouette: k.tiers.silhouette, mid: k.tiers.mid, fine: k.tiers.fine,
      trisPerWallM2: k.trisPerWallM2, fineShare: k.fineShare, facePass: k.facePass }])),
    maps: Object.fromEntries(run.maps.map((m) => [m.map, { coverage: m.coverage }])),
    hashes: Object.fromEntries(run.builders.filter((b) => b.seeds).map((b) => [`${b.kit}/${b.id}`, b.hashes[11]])),
  };
}

/** What dropped below the baseline (a density drop of more than 3 % counts; the elements, tiers, face pass and coverage strictly). */
export function ratchetFailures(baseline, run) {
  const now = baselineOf(run), out = [];
  for (const [kit, was] of Object.entries(baseline.kits ?? {})) {
    const is = now.kits[kit];
    if (!is) { out.push(`${kit}: kit missing`); continue; }
    for (const key of ['score', 'silhouette', 'mid', 'fine', 'facePass']) if (is[key] < was[key] - 1e-9) out.push(`${kit}: ${key} ${was[key]} -> ${is[key]}`);
    for (const key of ['trisPerWallM2', 'fineShare']) if (is[key] < was[key] * 0.97 - 1e-9) out.push(`${kit}: ${key} ${was[key]} -> ${is[key]}`);
  }
  for (const [map, was] of Object.entries(baseline.maps ?? {})) {
    const is = now.maps[map];
    if (is && is.coverage < was.coverage - 1e-9) out.push(`${map}: coverage ${was.coverage} -> ${is.coverage}`);
  }
  return out;
}

export function formatTable(run) {
  const lines = [];
  lines.push(`kit (map)                    ${ELEMENTS.map((e) => e.padStart(3)).join('')}  score  S/M/F   tris/m2  fine  face`);
  for (const k of [...run.kits].sort((a, b) => b.score - a.score || b.trisPerWallM2 - a.trisPerWallM2)) {
    lines.push(`${`${k.kit} (${k.map})`.padEnd(29)}${ELEMENTS.map((e) => k.marks[e].padStart(3)).join('')}  ${String(k.score).padStart(5)}  ${k.tiers.silhouette}/${k.tiers.mid}/${k.tiers.fine}  ${String(k.trisPerWallM2).padStart(8)}  ${k.fineShare.toFixed(2)}  ${k.facePass.toFixed(2)}`);
  }
  lines.push('');
  lines.push('map            kit          plan  kinds  kit-kinds  coverage  generic');
  for (const m of run.maps) lines.push(`${m.map.padEnd(15)}${String(m.kit ?? '-').padEnd(13)}${String(m.planned).padStart(4)}  ${String(m.kinds).padStart(5)}  ${String(m.kitKinds).padStart(9)}  ${m.coverage.toFixed(2).padStart(8)}  ${m.generic.join(' ')}`);
  if (run.world?.length) {
    lines.push('');
    lines.push('map            buildings  dwellings  distinct  identical  largest  floating  core  coreShare  clusters');
    for (const w of run.world) {
      if (w.error) { lines.push(`${w.map.padEnd(15)}error: ${w.error}`); continue; }
      lines.push(`${w.map.padEnd(15)}${String(w.buildings).padStart(9)}  ${String(w.dwellings).padStart(9)}  ${String(w.distinctDwellings).padStart(8)}  ${w.identicalShare.toFixed(2).padStart(9)}  ${String(w.largestIdentical).padStart(7)}  ${String(w.floating).padStart(8)}  ${String(w.coreBuildings).padStart(4)}  ${w.coreShare.toFixed(2).padStart(9)}  ${String(w.clusters).padStart(8)}`);
    }
  }
  return lines.join('\n');
}

/** The census as docs/BUILDING-DETAIL.md (`--md=`). */
export function formatMarkdown(run, date = new Date().toISOString().slice(0, 10)) {
  const L = [];
  L.push('# Building detail (HB-1b, BLD-04)', '');
  L.push(`Generated by \`node tools/building-detail-census.mjs --md=docs/BUILDING-DETAIL.md${run.world?.length ? ' --world' : ''}\` on ${date}.`);
  L.push('The census measures every regional kit the way the owner reads Verdant\'s buildings: element completeness at three');
  L.push('reading distances, in one vocabulary (the 10-12 B1 study, `~/cot-launch-state/2026-10-12/docs/horizons-buildings/`).');
  L.push('Each builder is built at seeds 11, 29 and 47 on its own map with the shared detail modules instrumented');
  L.push('(`tools/building-detail-census-loader.mjs`); a kit is scored over its dwelling-class builders (all of them where it has none).');
  L.push('`src/world/buildingDetail.selftest.mjs` holds every kit and map to `src/world/buildingDetail.baseline.json`: a kit may rise, never drop.', '');
  L.push('**Elements** (● present, b bespoke craft confirmed by reading, · absent): E1 plinth ≥ 0.15 m · E2 plinth band or water table ·');
  L.push('E3 eave ≥ 0.3 m · E4 ridge cap · E5 roof craft (thatch courses, riders, dormers) · E6 chimney · E7 glazing bars · E8 surround ·');
  L.push('E9 sill · E10 shutters (≥ 30 %) · E11 opening ornament (carved crest, painted shutters, heads) · E12 door steps ·');
  L.push('E13 porch, canopy, veranda or an extra roof over a door · E14 gable or eave ornament · E15 gutters (≥ 30 %) ·');
  L.push('E16 wall craft (pilasters, cornice, quoins, plinth paint, bands) · E17 domestic dressing · E18 yard · E19 regional light kit ·');
  L.push('E20 house grammar (≥ half the dwellings through `buildHouse`). Present on half the specs or windows unless stated.', '');
  L.push(`**Reading distances (K2):** silhouette (100–300 m) ${TIERS.silhouette.join(' ')}; mid (30–100 m) ${TIERS.mid.join(' ')}; fine (5–30 m) ${TIERS.fine.join(' ')}.`);
  L.push('**K3:** triangles per m² of wall over the dwellings (B1 floor ≥ 15, fine share ≥ 0.5; the declared-bespoke kits are judged on K2).');
  L.push('**K4 face pass:** the share of dwelling builders through the house grammar.', '');
  L.push(`| Kit (map) | ${ELEMENTS.join(' | ')} | Score | S/M/F | tris/m² | fine | face |`);
  L.push(`|---|${ELEMENTS.map(() => '---').join('|')}|---|---|---|---|---|`);
  for (const k of [...run.kits].sort((a, b) => b.score - a.score || b.trisPerWallM2 - a.trisPerWallM2)) {
    L.push(`| ${k.kit} (${k.map}) | ${ELEMENTS.map((e) => k.marks[e]).join(' | ')} | ${k.score} | ${k.tiers.silhouette}/${k.tiers.mid}/${k.tiers.fine} | ${k.trisPerWallM2} | ${k.fineShare.toFixed(2)} | ${k.facePass.toFixed(2)} |`);
  }
  L.push('', '**K1 coverage:** the share of a battlefield\'s planned kinds its own kit builds (the rest draw the generic catalog).', '');
  L.push('| Map | Kit | Planned | Kinds | From the kit | Coverage | Generic kinds |', '|---|---|---|---|---|---|---|');
  for (const m of run.maps) L.push(`| ${m.map} | ${m.kit ?? '—'} | ${m.planned} | ${m.kinds} | ${m.kitKinds} | ${m.coverage.toFixed(2)} | ${m.generic.join(', ')} |`);
  if (run.world?.length) {
    L.push('', '**K12 (the world built in Node with the shards\' seeds):** floating = buildings with a footprint corner whose ground lies more');
    L.push('than 5 cm below their lowest part; identical = the share of dwellings whose anatomy repeats another\'s (largest: the biggest');
    L.push('group of one design); core = the largest cluster of buildings within 45 m of each other and its share of the map\'s buildings.', '');
    L.push('| Map | Kit | Buildings | Dwellings | Distinct | Identical | Largest | Floating | Core | Core share | Clusters |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const w of run.world) {
      if (w.error) { L.push(`| ${w.map} | error: ${w.error.replace(/\|/g, '/')} |||||||||| `); continue; }
      L.push(`| ${w.map} | ${w.kit ?? '—'} | ${w.buildings} | ${w.dwellings} | ${w.distinctDwellings} | ${w.identicalShare.toFixed(2)} | ${w.largestIdentical} | ${w.floating} | ${w.coreBuildings} | ${w.coreShare.toFixed(2)} | ${w.clusters} |`);
    }
  }
  L.push('');
  return L.join('\n');
}

async function main() {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? null;
  const flag = (name) => process.argv.includes(`--${name}`);
  if (arg('world-one')) { console.log(JSON.stringify(await censusWorld(arg('world-one')))); return; }
  const kits = arg('kits')?.split(',') ?? null, maps = arg('maps')?.split(',') ?? null;
  const t0 = Date.now();
  const { kits: kitRows, builders } = await censusKits({ kits });
  const mapRows = await censusMaps({ maps });
  const run = { kits: kitRows, builders, maps: mapRows, world: [] };
  if (flag('world')) {
    // each battlefield in a process of its own (a world build holds gigabytes until it exits)
    const { execFileSync } = await import('node:child_process');
    const { MAP_IDS } = await import('../src/world/maps/mapIds.ts');
    for (const id of maps ?? MAP_IDS) {
      try {
        const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), `--world-one=${id}`], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
        run.world.push(JSON.parse(out.trim().split('\n').pop()));
      } catch (error) { run.world.push({ map: id, error: String(error).slice(0, 200) }); }
      process.stderr.write(`world ${id} ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
    }
  }
  console.log(formatTable(run));
  console.log(`\n${builders.length} builders in ${kitRows.length} kits, ${mapRows.length} maps, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (arg('json')) writeFileSync(arg('json'), JSON.stringify(run, null, 1));
  if (arg('md')) writeFileSync(arg('md'), formatMarkdown(run));
  if (flag('update-baseline')) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baselineOf(run), null, 1)}\n`);
    console.log(`baseline written: ${BASELINE_PATH}`);
  }
  if (flag('check')) {
    const failures = ratchetFailures(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')), run);
    if (failures.length) { console.error(`building-detail ratchet: ${failures.length} drop(s)\n  ${failures.join('\n  ')}`); process.exit(1); }
    console.log('building-detail ratchet: nothing dropped');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
