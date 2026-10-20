#!/usr/bin/env node
// tools/hinterland-draft.mjs — a first `hinterland` block from today's config (HL-1, the horizons stream, 2026-10-13;
// B-architecture §4.0, §7.3 step 1): "a migration starts from what the owner already sees".
//
//   MAP_BORDERS (borderLandform.ts, resolveBorderLandform)   → outland: woods, hedges, fields, farms
//   horizon.panorama.regional (or the relief character)      → far: the far country's form, relief and layers
//   the old ring's skyline summits (sampleHorizonGeometry)   → landforms: each summit a world-space landform at its
//                                                              bearing, distance and height, of the ring style's kind
//   resolveSeaOpenings (edgeWater.ts)                        → water: a sea arc per opening at its level
//   the map header's Reference: line                        → place
// The draft is then edited to the real place (C-map-briefs): the place line, region, settlements, landforms, far
// sectors and verticals.
//
//   node tools/hinterland-draft.mjs --map=polders            print the block
//   node tools/hinterland-draft.mjs --map=polders --write    write src/world/hinterland/drafts/polders.ts (lab: true)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { countSummits, ringColumnSkyline } from './horizon-envelope.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAR_FROM_REGIONAL = { plain: 'plain', erg: 'erg', upland: 'upland', forested: 'forested', karstRidge: 'karstRidge', ridges: 'ridges', jebel: 'jebels', volcanicField: 'volcanicField', iceSheet: 'iceSheet' };
const FAR_FROM_CHARACTER = { alpine: 'alpine', polar: 'polar', rolling: 'upland', coastal: 'upland', volcanic: 'volcanicField', mesa: 'tables', martian: 'martian', karst: 'ridges' };
const LANDFORM_FROM_STYLE = { rolling: 'ridge', escarpment: 'escarpment', alpine: 'massif', mesa: 'mesa' };
const MAP_FILES = { titan_gorge: 'titanGorge', copper_mesa: 'copperMesa' };

/** The reference line of a map file's header (its `Reference:` comment), if it has one. */
function referenceLine(id) {
  try {
    const src = readFileSync(path.join(ROOT, 'src/world/maps', `${MAP_FILES[id] ?? id}.ts`), 'utf8');
    const m = /\/\/[ \t]*Reference:[ \t]*([^\n]+(?:\n\/\/[ \t]{1,3}(?![ \t]*$)[^\n]+)*)/.exec(src);
    if (!m) return null;
    return m[1].replace(/\n\/\/\s*/g, ' ').replace(/\s+/g, ' ').replace(/\.$/, '').trim();
  } catch { return null; }
}

/** The draft block for a map. */
async function draftHinterland(id) {
  const [{ getMapConfig }, { createHeightField }, horizon, border, edge, relief, pano, regions] = await Promise.all([
    import('../src/world/maps/index.ts'), import('../src/world/terrain.ts'), import('../src/world/maps/horizon.ts'),
    import('../src/world/borderLandform.ts'), import('../src/world/edgeWater.ts'), import('../src/world/horizonRelief.ts'),
    import('../src/world/horizonPanorama.ts'), import('../src/world/hinterland/regions.ts'),
  ]);
  const cfg = getMapConfig(id);
  const H = cfg.horizon ?? {};
  const ground = createHeightField(1337, cfg);
  const regionId = regions.HINTERLAND_MAP_REGIONS[id];
  const region = regions.HINTERLAND_REGIONS[regionId];
  const settings = border.resolveBorderLandform(H.style, cfg.terrain?.border, id);
  const character = relief.resolveHorizonReliefCharacter(H, id);
  const regional = typeof H.panorama === 'object' ? H.panorama.regional : undefined;
  const farChar = H.panorama === false ? null : pano.resolveHorizonPanoramaCharacter(character, typeof H.panorama === 'object' ? H.panorama : undefined);
  const form = regional ? FAR_FROM_REGIONAL[regional] : FAR_FROM_CHARACTER[character] ?? region.far.form;
  // the old ring's summits from the centre eye, as world-space landforms of the ring style's kind
  const ring = horizon.sampleHorizonGeometry(cfg, 1337, ground);
  const columns = horizon.HORIZON_SEGMENTS;
  const eyeY = ground.getHeightAt(0, 0) + 3;
  const sky = ringColumnSkyline(ring, columns, eyeY);
  const datum = ground.getHeightAt(0, 0);
  const style = H.ringStyle || H.style || 'rolling';
  const landforms = [];
  const n = sky.elev.length;
  for (let i = 0; i < n; i++) {
    const v = sky.elev[i];
    if (!(v >= sky.elev[(i - 1 + n) % n] && v > sky.elev[(i + 1) % n])) continue;
    let lo1 = v, lo2 = v, w1 = 0, w2 = 0;
    for (let k = 1; k < n; k++) { const w = sky.elev[(i + k) % n]; if (w > v) break; lo1 = Math.min(lo1, w); }
    for (let k = 1; k < n; k++) { const w = sky.elev[(i - k + n) % n]; if (w > v) break; lo2 = Math.min(lo2, w); }
    // its width: the bearings either side still within 0.4° of the summit
    while (w1 < n / 8 && sky.elev[(i + w1 + 1) % n] > v - 0.4) w1++;
    while (w2 < n / 8 && sky.elev[(i - w2 - 1 + n) % n] > v - 0.4) w2++;
    const prom = v - Math.max(lo1, lo2);
    const az = (i / n) * 360, r = sky.radius[i];
    // its height over the land the hinterland already continues there (the battlefield's outland): the landform adds only
    // what the ring stood above it
    const sx = r * Math.sin((az * Math.PI) / 180), sz = r * Math.cos((az * Math.PI) / 180);
    const heightM = sky.above[i] + eyeY - (ground.getOutlandHeightAt ? ground.getOutlandHeightAt(sx, sz) : datum);
    if (prom < 0.4 || heightM < 12) continue;
    const lengthM = Math.max(300, Math.round(((w1 + w2 + 1) / n) * 2 * Math.PI * r));
    landforms.push({ prom, lf: { kind: LANDFORM_FROM_STYLE[style] ?? 'ridge', at: { azDeg: Math.round(az), distM: Math.round(r) }, heightM: Math.round(heightM),
      lengthM, widthM: Math.round(lengthM * 0.45), strikeDeg: Math.round((az + 90) % 180) } });
  }
  landforms.sort((a, b) => b.prom - a.prom);
  const openings = edge.resolveSeaOpenings(H.seaOpening, ground, id);
  const water = openings.map((o) => ({ kind: 'sea', arc: { azDeg: [Math.round(o.azimuthDeg - o.widthDeg / 2), Math.round(o.azimuthDeg + o.widthDeg / 2)] },
    coastM: Math.round(512 + (o.coastReachM ?? 0) + 200), level: +o.level.toFixed(2) }));
  const block = {
    place: referenceLine(id) ?? region.place,
    region: regionId,
    lab: true,
    outland: { woods: +settings.forest.toFixed(2), hedges: +settings.hedgerows.toFixed(2), fields: +settings.fields.toFixed(2),
      settle: { farms: settings.farms } },
    landforms: landforms.slice(0, 12).map((l) => l.lf),
    water,
    far: farChar ? [{ azDeg: [0, 360], distKm: [4, form === 'plain' || form === 'erg' ? 15 : 18], reliefM: Math.round(farChar.ampM),
      form, layers: farChar.layers > 0.5 ? 2 : farChar.layers > 0 ? 1 : 0 }] : [],
  };
  return { block, summits: countSummits(sky.elev) };
}

/** A TS literal: small objects and arrays on one line, keys bare, strings single-quoted. */
function literal(v, indent = '') {
  const one = (x) => JSON.stringify(x).replace(/"([a-zA-Z_][a-zA-Z0-9_]*)":/g, '$1: ').replace(/,(?=\S)/g, ', ')
    .replace(/'/g, "\\'").replace(/"/g, "'");
  const flat = one(v);
  if (flat.length + indent.length < 112 || v === null || typeof v !== 'object') return flat;
  const next = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => next + literal(x, next)).join(',\n')},\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${next}${/^[a-zA-Z_]\w*$/.test(k) ? k : `'${k}'`}: ${literal(x, next)}`).join(',\n')},\n${indent}}`;
}

function toTs(id, block) {
  const body = literal(block);
  return `// src/world/hinterland/drafts/${id}.ts — generated by \`node tools/hinterland-draft.mjs --map=${id} --write\` (${new Date().toISOString().slice(0, 10)})
// from today's config: the outland from MAP_BORDERS, the far country from the panorama's class, the old ring's skyline
// summits as world-space landforms, the sea openings as water. A lab draft (lab: true): it draws only under
// ?hinterland=1 until its map item edits it to the real place and moves it into the map file.
import type { HinterlandConfig } from '../spec.ts';

const DRAFT: HinterlandConfig = ${body};

export default DRAFT;
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const id = arg('map');
  if (!id) { console.error('usage: node tools/hinterland-draft.mjs --map=<id> [--write]'); process.exit(2); }
  const { block, summits } = await draftHinterland(id);
  const ts = toTs(id, block);
  if (process.argv.includes('--write')) {
    const dir = path.join(ROOT, 'src/world/hinterland/drafts');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${id}.ts`), ts);
    console.log(`wrote src/world/hinterland/drafts/${id}.ts (${block.landforms.length} landforms from ${summits} ring summits, ${block.water.length} water)`);
  } else console.log(ts);
}
