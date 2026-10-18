// tools/generate-garage-skylines.mjs (garage r9, K10): each Garage's outside environment, derived from its own map.
//
// For every Garage map this bakes, from the Garage's anchor (the map's player spawn, the terrain patch's centre):
// - BANDS: the battlefield's own near relief, ray-cast over the map heightfield in three distance bands (60-160 m,
//   160-340 m, 340-720 m) at 72 bearings: the highest elevation angle seen in each band, so the horizon ring's near
//   layers stand where the real ground rises (Redrock's canyon walls, Glacier's spurs, Monsoon's jungle rim);
// - LANDMARKS: the map's named places past the yard, in true metres at their true compass bearing from the anchor:
//   the hinterland drafts' jebels, inselbergs, massifs, ridges and forts (src/world/hinterland/drafts), the map file's
//   lakes, floor inselbergs, villages, churches, sawmill, town, river and wayside cross, and, where a map has no
//   hinterland draft, a short authored list taken from its map file's reference and its map art (each row says so).
// The runtime (src/ui/garageSkyline.ts) projects the landmarks into the Garage's horizon ring (bearing kept, distance
// compressed, elevation angle compressed by one factor) and builds each one in the horizon's one vertex-colour draw.
//
// Compass: +x east, +z north, bearings clockwise from north (the hinterland spec's convention). Deterministic: the
// output is byte-stable; --check fails when it is stale.
//   node tools/generate-garage-skylines.mjs [--check]

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { getMapConfig } from '../src/world/maps/index.ts';
import { createHeightField } from '../src/world/terrain.ts';
import { HINTERLAND_LAB_DRAFTS } from '../src/world/hinterland/drafts/index.ts';

const MAP_IDS = ['verdant', 'desert', 'winter', 'urban', 'coastal', 'railyard', 'monsoon', 'alpine', 'badlands', 'foundry'];
const TERRAIN_SEED = 1337;
const EYE_M = 2.35; // the opening camera's height over the Garage datum
const BEARINGS = 72; // every 5 degrees
const BANDS_M = [[60, 160], [160, 340], [340, 720]];
const MAP_HALF_M = 510;
const NO_DATA = -32768;
const outputUrl = new URL('../src/ui/garageSkylines.generated.ts', import.meta.url);

const round = (value, digits = 1) => Number(value.toFixed(digits));
const compass = (dx, dz) => ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;

/** A landmark row from a world point (map metres) relative to the anchor. */
function at(anchor, x, z, row) {
  const dx = x - anchor.x, dz = z - anchor.z;
  return { ...row, azDeg: round(compass(dx, dz)), distM: Math.round(Math.hypot(dx, dz)) };
}

/** A hinterland `at` (bearing and distance from the map's centre) as a world point. */
function fromCentre(place) {
  const a = (place.azDeg * Math.PI) / 180;
  return [place.distM * Math.sin(a), place.distM * Math.cos(a)];
}

function encodeInt16(values) {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setInt16(index * 2, value, true));
  return Buffer.from(bytes).toString('base64');
}

/** The near relief: the highest elevation angle (centi-degrees) per band and bearing; NO_DATA past the map's edge. */
function rayBands(field, anchor) {
  const h0 = field.getHeightAt(anchor.x, anchor.z);
  const out = [];
  for (const [d0, d1] of BANDS_M) {
    for (let k = 0; k < BEARINGS; k += 1) {
      const bearing = (k / BEARINGS) * Math.PI * 2;
      const sx = Math.sin(bearing), sz = Math.cos(bearing);
      let best = -Infinity;
      for (let step = 0; step <= 24; step += 1) {
        const d = d0 + ((d1 - d0) * step) / 24;
        const x = anchor.x + sx * d, z = anchor.z + sz * d;
        if (Math.abs(x) > MAP_HALF_M || Math.abs(z) > MAP_HALF_M) break;
        best = Math.max(best, Math.atan2(field.getHeightAt(x, z) - h0 - EYE_M, d));
      }
      out.push(Number.isFinite(best) ? Math.round((best * 180 / Math.PI) * 100) : NO_DATA);
    }
  }
  return out;
}

const DRAFT_KINDS = new Set(['jebel', 'inselberg', 'massif', 'ridge', 'mesa', 'butte']);

/** The hinterland draft's landforms, forts and villages. */
function draftLandmarks(mapId, anchor) {
  const draft = HINTERLAND_LAB_DRAFTS[mapId];
  if (!draft) return [];
  const rows = [];
  for (const form of draft.landforms ?? []) {
    if (!DRAFT_KINDS.has(form.kind)) continue;
    const [x, z] = fromCentre(form.at);
    rows.push(at(anchor, x, z, {
      type: form.kind, name: form.name ?? null, heightM: form.heightM, lengthM: form.lengthM ?? form.widthM ?? 600,
      widthM: form.widthM ?? form.lengthM ?? 600, strikeDeg: form.strikeDeg ?? 0, source: `hinterland/${mapId}`,
    }));
  }
  for (const mark of draft.landmarks ?? []) {
    if (mark.kind !== 'castle' || !mark.at) continue;
    const [x, z] = fromCentre(mark.at);
    rows.push(at(anchor, x, z, { type: 'fort', name: mark.name ?? null, heightM: mark.heightM ?? 14, lengthM: 90, widthM: 60,
      strikeDeg: 0, source: `hinterland/${mapId}` }));
  }
  for (const village of draft.outland?.settle?.villagesAt ?? []) {
    const [x, z] = fromCentre(village);
    rows.push(at(anchor, x, z, { type: 'village', name: village.name ?? null, heightM: village.towerM ?? 30, lengthM: 220, widthM: 120,
      strikeDeg: 0, source: `hinterland/${mapId}` }));
  }
  return rows;
}

/** A cluster of planned sites (houses and their church) as one village row at its centroid. */
function siteCluster(anchor, sites, filter, row) {
  const picked = sites.filter(filter);
  if (!picked.length) return [];
  const cx = picked.reduce((s, p) => s + p.x, 0) / picked.length, cz = picked.reduce((s, p) => s + p.z, 0) / picked.length;
  const reach = Math.max(...picked.map((p) => Math.hypot(p.x - cx, p.z - cz)));
  return [at(anchor, cx, cz, { ...row, lengthM: Math.round(Math.max(60, reach * 2)), widthM: Math.round(Math.max(40, reach)),
    houses: picked.length })];
}

/** Each map's own places (its map file), and an authored row where the map has no hinterland draft. */
const MAP_LANDMARKS = {
  badlands(config, anchor) {
    // the floor's inselbergs (landforms with the 'inselberg' geology), each massif with its lobe
    return (config.terrain.landforms ?? [])
      .filter((form) => form.kind === 'knoll' && form.geology?.profile === 'inselberg' && form.height >= 20)
      .map((form) => at(anchor, form.x, form.z, { type: 'inselberg', name: 'a floor inselberg', heightM: form.height,
        lengthM: form.rx * 2, widthM: form.rz * 2, strikeDeg: 0, source: 'maps/badlands.ts landforms' }))
      .filter((row) => row.distM < 900);
  },
  alpine(config, anchor) {
    const sites = config.props?.plannedSites ?? [];
    const rows = [];
    // the frozen lake (the map's identity) and the tarn
    for (const lake of config.terrain.lakes ?? []) {
      rows.push(at(anchor, lake.x, lake.z, { type: 'lake', name: lake.r > 80 ? 'the frozen lake' : 'the tarn', heightM: 0,
        lengthM: lake.r * 2, widthM: lake.r * 2, strikeDeg: 0, source: 'maps/alpine.ts terrain.lakes' }));
    }
    // the Hospice on the north shore (its warehouse plot) and the village on the west shore round its onion church
    const hospice = sites.find((site) => site.structure === 'warehouse');
    if (hospice) rows.push(at(anchor, hospice.x, hospice.z, { type: 'hospice', name: 'the Hospice', heightM: 16, lengthM: 48, widthM: 22,
      strikeDeg: hospice.yawDeg, source: 'maps/alpine.ts plannedSites' }));
    rows.push(...siteCluster(anchor, sites, (s) => s.z < -100 && s.x < -120 && s.structure !== 'chapel',
      { type: 'village', name: 'the col village', heightM: 22, strikeDeg: 0, source: 'maps/alpine.ts plannedSites' }));
    for (const mark of config.props?.landmarks ?? []) {
      if (mark.kind === 'waysidecross') rows.push(at(anchor, mark.x, mark.z, { type: 'cross', name: mark.name ?? 'the cross', heightM: 9,
        lengthM: 4, widthM: 4, strikeDeg: 0, source: 'maps/alpine.ts landmarks' }));
    }
    return rows;
  },
  winter(config, anchor) {
    const sites = config.props?.plannedSites ?? [];
    const rows = [];
    // authored from the map file's reference (the Podhale under the High Tatra, the Bialy Dunajec running down from it)
    // and its map art (the great snow massif standing over the valley, a lower range to its left): the Tatra
    rows.push(at(anchor, ...pointAt(anchor, 52, 2900), { type: 'massif', name: 'the High Tatra', heightM: 980, lengthM: 4200, widthM: 2600,
      strikeDeg: 120, source: 'authored: maps/winter.ts reference + map art' }));
    rows.push(at(anchor, ...pointAt(anchor, 12, 3600), { type: 'massif', name: 'the Tatra foothills', heightM: 520, lengthM: 4600, widthM: 2400,
      strikeDeg: 95, source: 'authored: maps/winter.ts map art' }));
    rows.push(at(anchor, ...pointAt(anchor, 300, 2600), { type: 'ridge', name: 'the Gorce ridge', heightM: 300, lengthM: 4200, widthM: 1600,
      strikeDeg: 30, source: 'authored: maps/winter.ts reference' }));
    rows.push(at(anchor, ...pointAt(anchor, 205, 2400), { type: 'ridge', name: 'the Pieniny hills', heightM: 260, lengthM: 4400, widthM: 1600,
      strikeDeg: 110, source: 'authored: maps/winter.ts reference' }));
    // the frozen river's pools (the marsh chain under frozenMarshes): the nearest broad reach
    const pools = (config.terrain.marshes ?? []).filter((m) => m.r >= 20)
      .map((m) => ({ m, d: Math.hypot(m.x - anchor.x, m.z - anchor.z) })).sort((a, b) => a.d - b.d).slice(0, 1);
    for (const { m } of pools) rows.push(at(anchor, m.x, m.z, { type: 'lake', name: 'the frozen river', heightM: 0, lengthM: m.r * 3,
      widthM: m.r * 2, strikeDeg: 0, source: 'maps/winter.ts terrain.marshes (frozen)' }));
    // the timber village on the west terrace round its wooden church, and the sawmill at its north end
    const church = sites.find((site) => site.structure === 'onionchurch');
    if (church) rows.push(at(anchor, church.x, church.z, { type: 'church', name: 'the wooden church', heightM: 24, lengthM: 18, widthM: 12,
      strikeDeg: church.yawDeg, source: 'maps/winter.ts plannedSites' }));
    rows.push(...siteCluster(anchor, sites, (s) => s.structure === 'logcabin' && s.z < 0,
      { type: 'village', name: 'the timber village', heightM: 9, strikeDeg: 0, source: 'maps/winter.ts plannedSites' }));
    const mill = sites.filter((s) => s.z > 60 && (s.structure === 'woodshed' || s.structure === 'warehouse' || s.structure === 'depot'));
    if (mill.length) {
      const cx = mill.reduce((s, p) => s + p.x, 0) / mill.length, cz = mill.reduce((s, p) => s + p.z, 0) / mill.length;
      rows.push(at(anchor, cx, cz, { type: 'sawmill', name: 'the sawmill', heightM: 16, lengthM: 40, widthM: 16, strikeDeg: 0,
        source: 'maps/winter.ts plannedSites (the sawmill yard)' }));
    }
    return rows;
  },
  monsoon(config, anchor) {
    const sites = config.props?.plannedSites ?? [];
    const rows = [];
    // the flood channel's broad reaches nearest the anchor (the river glimpse)
    const reaches = (config.terrain.marshes ?? []).filter((m) => m.r >= 28)
      .map((m) => ({ m, d: Math.hypot(m.x - anchor.x, m.z - anchor.z) })).sort((a, b) => a.d - b.d).slice(0, 2);
    for (const { m } of reaches) rows.push(at(anchor, m.x, m.z, { type: 'river', name: 'the flood channel', heightM: 0, lengthM: m.r * 4,
      widthM: m.r * 1.4, strikeDeg: 45, source: 'maps/monsoon.ts terrain.marshes' }));
    // Kohima on its saddle: the bazaar and bungalows, the mission church
    rows.push(...siteCluster(anchor, sites, (s) => s.structure !== 'farmhouse',
      { type: 'town', name: 'Kohima', heightM: 12, strikeDeg: 0, source: 'maps/monsoon.ts plannedSites' }));
    const chapel = sites.find((site) => site.structure === 'chapel');
    if (chapel) rows.push(at(anchor, chapel.x, chapel.z, { type: 'church', name: 'the mission church', heightM: 15, lengthM: 16,
      widthM: 10, strikeDeg: chapel.yawDeg, source: 'maps/monsoon.ts plannedSites' }));
    // the tea estate east of the east spur (its drying yard is the map's apron at x 400)
    const yard = (config.terrain.hardstands ?? []).find((h) => h.x > 300);
    if (yard) rows.push(at(anchor, yard.x, yard.z, { type: 'terraces', name: 'the tea estate', heightM: 26, lengthM: 260, widthM: 160,
      strikeDeg: 0, source: 'maps/monsoon.ts hardstands (the drying yard)' }));
    // authored from the map file's reference (Kohima in the Naga Hills) and its map art (jungle ridges layered into
    // mist on every side): the Naga ranges standing over the rim
    for (const [az, dist, height, length, name] of [
      [20, 2600, 520, 5200, 'the Japfu range'], [95, 3000, 440, 4800, 'the Pulie Badze spur'],
      [165, 2800, 400, 5000, 'the Aradura spur'], [235, 2600, 480, 5200, 'the Kohima ridge'],
      [300, 3200, 560, 5600, 'the Naga Hills'],
    ]) {
      rows.push(at(anchor, ...pointAt(anchor, az, dist), { type: 'ridge', name, heightM: height, lengthM: length, widthM: 1800,
        strikeDeg: (az + 90) % 360, source: 'authored: maps/monsoon.ts reference + map art' }));
    }
    return rows;
  },
};

/** A world point at a compass bearing and distance from the anchor. */
function pointAt(anchor, azDeg, distM) {
  const a = (azDeg * Math.PI) / 180;
  return [anchor.x + distM * Math.sin(a), anchor.z + distM * Math.cos(a)];
}

const records = [];
for (const mapId of MAP_IDS) {
  const config = getMapConfig(mapId);
  const anchor = config.spawns.player;
  const field = createHeightField(TERRAIN_SEED, config);
  const bands = rayBands(field, anchor);
  const landmarks = [...draftLandmarks(mapId, anchor), ...(MAP_LANDMARKS[mapId]?.(config, anchor) ?? [])]
    .sort((a, b) => a.azDeg - b.azDeg || a.distM - b.distM);
  records.push({ mapId, anchor, bands: encodeInt16(bands), landmarks });
}

const header = `// Generated by tools/generate-garage-skylines.mjs (garage r9, K10). Do not edit: re-run the tool.\n`
  + `// Each Garage's outside environment from its own map: the near relief ray-cast over the map heightfield (three\n`
  + `// distance bands, 72 bearings, centi-degrees of elevation from the opening camera's height; ${NO_DATA} past the map's edge) and\n`
  + `// the map's landmarks in true metres at their compass bearing (clockwise from north, +z) from the Garage's anchor.\n\n`;
const body = `export interface GarageSkylineLandmark {\n  readonly type: string;\n  readonly name: string | null;\n`
  + `  readonly heightM: number;\n  readonly lengthM: number;\n  readonly widthM: number;\n  readonly strikeDeg: number;\n`
  + `  readonly source: string;\n  readonly azDeg: number;\n  readonly distM: number;\n  readonly houses?: number;\n}\n\n`
  + `export interface GarageSkylineRecord {\n  readonly anchor: readonly [number, number];\n  readonly bandsM: readonly (readonly [number, number])[];\n`
  + `  readonly bearings: number;\n  readonly bandsBase64: string;\n  readonly landmarks: readonly GarageSkylineLandmark[];\n}\n\n`
  + `export const GARAGE_SKYLINE_NO_DATA = ${NO_DATA};\n\n`
  + `export const GARAGE_SKYLINES: Readonly<Record<string, GarageSkylineRecord>> = Object.freeze({\n`
  + records.map((record) => `  ${record.mapId}: Object.freeze({\n    anchor: [${record.anchor.x}, ${record.anchor.z}] as const,\n`
    + `    bandsM: ${JSON.stringify(BANDS_M)} as const,\n    bearings: ${BEARINGS},\n    bandsBase64: '${record.bands}',\n`
    + `    landmarks: [\n${record.landmarks.map((row) => `      ${JSON.stringify(row)},`).join('\n')}\n    ],\n  }),`).join('\n')
  + `\n});\n`;
const source = header + body;

const outputPath = fileURLToPath(outputUrl);
if (process.argv.includes('--check')) {
  const existing = await readFile(outputPath, 'utf8').catch(() => '');
  if (existing !== source) {
    console.error('Garage skylines are stale; run npm run garage:skylines:update');
    process.exit(1);
  }
  console.log(`garage skylines: current (${records.length} maps, ${records.reduce((s, r) => s + r.landmarks.length, 0)} landmarks)`);
} else {
  await writeFile(outputPath, source);
  console.log(`wrote ${outputPath} (${records.length} maps, ${records.reduce((s, r) => s + r.landmarks.length, 0)} landmarks)`);
}
process.exit(0);
