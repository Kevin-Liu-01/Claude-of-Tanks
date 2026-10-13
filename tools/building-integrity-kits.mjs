// The kits source of the building integrity check (tools/building-integrity-check.mjs --source=kits): every builder of
// every regional kit built under its own map, the generic catalog builders (villageKit, urbanKit, structureKit, railKit
// and the market set) with their catalog exterior, and every map's set pieces (landmarks) at their authored parameters,
// each from several seeds on flat ground; and the ledger rows the selftest holds them to.
import { ARCHITECTURE_STYLES, buildRegionalParts } from '../src/world/maps/regional/index.ts';
import { streamFrom, hashSeed } from '../src/world/maps/regional/geometry.ts';
import { MAP_IDS, getMapConfig } from '../src/world/maps/index.ts';
import { VILLAGE_BUILDERS } from '../src/world/maps/villageKit.ts';
import { URBAN_BUILDERS } from '../src/world/maps/urbanKit.ts';
import { STRUCTURE_BUILDERS } from '../src/world/maps/structureKit.ts';
import { addCatalogExterior } from '../src/world/maps/exteriorDetailKit.ts';
import { LANDMARK_BUILDERS } from '../src/world/landmarks/index.ts';
import { resolveLandmarkParams } from '../src/world/landmarks/plan.ts';

/** Representative base footprints (info) of the plan ids (regionalArchitecture.selftest.mjs's table). */
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
  firestation: [11.8, 15.4, 14.1], terrace: [22, 9.6, 9],
  megatower: [23.7, 24.7, 64.8], needletower: [19, 21, 64.9], arcology: [31, 23.2, 49.7], terracetower: [25.4, 22.4, 56.3],
  civichall: [33.2, 22.8, 14.7], parkingdeck: [27.4, 22.4, 13.7], broadcasttower: [24.2, 20.2, 60.1],
};

/** The census's views: three rings and the overhead view, coarser than the maps source's (the selftest's budget). */
export const KIT_VIEW_OPTIONS = Object.freeze({ elevations: [-20, 0, 25], pxM: 0.1, maxRes: 192 });

const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function worstOf(rows) {
  // the row's numbers are the worst of its seeds, each number on its own
  const out = { ...rows[0] };
  out.summary = { ...rows[0].summary };
  for (const r of rows.slice(1)) {
    for (const [k, v] of Object.entries(r.summary)) out.summary[k] = Math.max(out.summary[k] ?? 0, v);
    if (r.severity > out.severity) { out.severity = r.severity; out.detail = r.detail; out.seed = r.seed; }
  }
  out.tris = Math.max(...rows.map((r) => r.tris));
  return out;
}

export async function runKitCensus({ kits = [], builders = [], seeds = [11, 29], generic = true, landmarks = true, only = '',
  onRow, packParts, analyseBuilding, severity, summarise, viewOptions = KIT_VIEW_OPTIONS, images = null }) {
  const wantKit = (id) => !kits.length || kits.includes(id);
  const wantBuilder = (id) => !builders.length || builders.includes(id);
  const mapOfStyle = new Map(); const mapConfigs = new Map();
  for (const mapId of MAP_IDS) {
    const cfg = getMapConfig(mapId); mapConfigs.set(mapId, cfg);
    const arch = cfg.props?.architecture; if (arch && !mapOfStyle.has(arch)) mapOfStyle.set(arch, mapId);
  }
  const analyse = (key, kit, builder, parts, seed, extra = {}) => {
    const own = packParts(parts);
    if (!own.pos.length) return null;
    const r = analyseBuilding(own, { groundFn: () => 0, ...viewOptions, keepRasters: !!images });
    if (images) images(`${key.replace(/[^\w.-]+/g, '_')}_s${seed}`, r.rasters);
    return { key, kit, builder, seed, tris: r.tris, severity: severity(r, builder), summary: summarise(r, builder), detail: r, ...extra };
  };
  if (!only || only === 'kits') {
    for (const style of ARCHITECTURE_STYLES) {
      if (!wantKit(style.id)) continue;
      const mapId = mapOfStyle.get(style.id) ?? 'selftest';
      const snowCap = !!mapConfigs.get(mapId)?.props?.snowCap || mapId === 'whiteout' || mapId === 'alpine';
      for (const id of Object.keys(style.builders)) {
        if (!wantBuilder(id)) continue;
        const [w, d, h] = INFO[id] ?? [7, 9, 6];
        const perSeed = [];
        for (const seed of seeds) {
          const parts = buildRegionalParts(style, {
            structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
            wallBucket: seed % 2 ? 'plaster2' : 'stone', rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3),
            mapId, snowCap, tier: 'desktop',
          }, streamFrom(seed * 3 + 5));
          const row = analyse(`${style.id}/${id}`, style.id, id, parts, seed, { map: mapId });
          if (row) perSeed.push(row);
        }
        if (perSeed.length) onRow(worstOf(perSeed));
      }
    }
  }
  if (generic && (!only || only === 'generic')) {
    const catalog = { ...URBAN_BUILDERS, ...VILLAGE_BUILDERS, ...STRUCTURE_BUILDERS };
    for (const [id, build] of Object.entries(catalog)) {
      if (!wantKit('generic') || !wantBuilder(id)) continue;
      const perSeed = [];
      for (const seed of seeds) {
        const tmp = { plaster: [], plaster2: [], plaster3: [], stone: [], roof: [], wood: [], dark: [], glass: [], curtain: [], straw: [], baked: [], steel: [], structureMetal: [] };
        const info = build(mulberry(seed), tmp, seed % 2 ? 'plaster2' : 'plaster');
        addCatalogExterior(tmp, { id, info, variant: seed % 3 });
        const row = analyse(`generic/${id}`, 'generic', id, tmp, seed);
        if (row) perSeed.push(row);
      }
      if (perSeed.length) onRow(worstOf(perSeed));
    }
  }
  if (landmarks && (!only || only === 'landmarks')) {
    for (const [mapId, cfg] of mapConfigs) {
      const pieces = cfg.props?.landmarks ?? [];
      pieces.forEach((placement, i) => {
        const builder = LANDMARK_BUILDERS[placement.kind];
        if (!builder || !wantKit('landmark') || !wantBuilder(placement.kind)) return;
        const style = cfg.props?.architecture;
        const perSeed = [];
        for (const seed of seeds) {
          const id = hashSeed(`landmark:${mapId}:${placement.kind}:${i}`, seed);
          const built = builder({ kind: placement.kind, params: resolveLandmarkParams(placement), rng: streamFrom(id), variant: streamFrom(id ^ 0x5bd1e995),
            age: streamFrom(id ^ 0x27d4eb2f), tier: 'desktop', groundFall: 0, brick: false, snowCap: false, mapId });
          const row = analyse(`landmark/${mapId}:${placement.kind}#${i}`, 'landmark', placement.kind, built.parts, seed, { map: mapId, style: style ?? null });
          if (row) perSeed.push(row);
        }
        if (perSeed.length) onRow(worstOf(perSeed));
      });
    }
  }
}

// ------------------------------------------------------------------------------------------------ ledger
const AREA_KEYS = ['floatingM2', 'holeM2', 'insideM2', 'gapM2', 'invertedM2'];
const COUNT_KEYS = ['floating', 'sliver'];

/** One ledger row per checked building row: its numbers as the gate compares them. */
export function ledgerRows(rows) {
  const out = {};
  for (const r of rows) {
    const s = r.summary;
    out[r.key] = Object.fromEntries([...COUNT_KEYS, ...AREA_KEYS].map((k) => [k, +(s[k] ?? 0)]));
  }
  return out;
}

/** Each current row against its ledger row: counts may not grow; areas may not grow past max(0.05 m2, 10 %). */
export function ledgerVerdicts(ledger, current) {
  const fail = [], missing = []; let pass = 0;
  for (const [key, row] of Object.entries(current)) {
    const was = ledger[key];
    if (!was) { missing.push(key); continue; }
    const why = [];
    for (const k of COUNT_KEYS) if ((row[k] ?? 0) > (was[k] ?? 0)) why.push(`${k} ${was[k] ?? 0} -> ${row[k]}`);
    for (const k of AREA_KEYS) {
      const a = was[k] ?? 0, b = row[k] ?? 0;
      if (b > a + Math.max(0.05, a * 0.1)) why.push(`${k} ${a} -> ${b}`);
    }
    if (why.length) fail.push(`${key}: ${why.join(', ')}`); else pass++;
  }
  return { pass, fail, missing };
}
