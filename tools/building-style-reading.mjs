// tools/building-style-reading.mjs — what every regional kit builds, read from its house plans (item buildings-270): the
// storeys and their heights, the roof forms and pitches, the windows' size and bay spacing, the doors and shopfronts. The
// building-style table (src/world/maps/buildingStyleTable.ts) states these per map from the place's photographs;
// buildingStyleTable.selftest.mjs holds each row to its kit's reading, so a row never says what its kit does not build.
//
//   node tools/building-style-reading.mjs [--kits=a,b] [--json=out.json]
//
// Each builder is built at three seeds on the census plots (tools/building-detail-census.mjs), and every house body it
// lays (house.ts HousePlan; recorded bodies excluded) is read.
import { writeFileSync } from 'node:fs';
import { isMainModule } from './map-probe-runtime.mjs';

const SEEDS = [[11, 'plaster'], [29, 'plaster2'], [47, 'stone']];

const round = (v, q = 0.05) => +(Math.round(v / q) * q).toFixed(2);

/** The window rhythm of one face of one storey: the centre spacing of its windows, sorted along the face. */
function bays(openings) {
  const groups = new Map();
  for (const o of openings) {
    if (o.kind !== 'window') continue;
    const key = `${o.face}:${o.storey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o.u);
  }
  const out = [];
  for (const us of groups.values()) {
    us.sort((a, b) => a - b);
    for (let i = 1; i < us.length; i++) out.push(us[i] - us[i - 1]);
  }
  return out;
}

/** The value a share `q` of `xs` lies at or under (null for none). */
const quantile = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};
const median = (xs) => quantile(xs, 0.5);
/** The middle of a spread: its tenth and ninetieth centiles, rounded to `q` (a porch's or a hall's storey left out). */
const spread = (xs, q) => (xs.length ? [round(quantile(xs, 0.1), q), round(quantile(xs, 0.9), q)] : null);

/** Every kit's reading: { [kit]: { storeys: [min, max], storeyM: [min, max], roofs: {kind: n}, pitchDeg: [min, max],
 *  window: { w, h, bayM }, doors: {kind: n}, houses } }. */
export async function readKits({ kits = null } = {}) {
  const { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } = await import('../src/world/maps/regional/index.ts');
  const { streamFrom } = await import('../src/world/maps/regional/geometry.ts');
  const { MAP_IDS } = await import('../src/world/maps/mapIds.ts');
  const { getMapConfig } = await import('../src/world/maps/index.ts');
  const { INFO } = await import('./building-detail-census.mjs');
  const mapOf = {};
  for (const id of MAP_IDS) {
    const kit = getMapConfig(id).props?.architecture;
    if (kit && !mapOf[kit]) mapOf[kit] = id;
  }
  const out = {};
  for (const style of ARCHITECTURE_STYLES) {
    if (kits && !kits.includes(style.id)) continue;
    const mapId = mapOf[style.id] ?? 'selftest';
    const r = { map: mapId, houses: 0, storeys: [], storeyM: [], roofs: {}, pitchDeg: [], windowW: [], windowH: [], bayM: [], doors: {} };
    for (const id of Object.keys(style.builders)) {
      const [w, d, h] = INFO[id] ?? [7, 9, 6];
      for (const [seed, wall] of SEEDS) {
        let parts;
        try {
          parts = buildRegionalParts(style, {
            structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
            wallBucket: wall, rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId,
            snowCap: mapId === 'whiteout' || mapId === 'alpine', tier: 'desktop',
          }, streamFrom(seed * 3 + 5));
        } catch { break; }
        for (const hp of regionalKitPlanOf(parts)?.houses ?? []) {
          if (hp.recorded || hp.shaft) continue;
          const s = hp.spec;
          r.houses++;
          r.storeys.push(s.storeys.length);
          for (const st of s.storeys) r.storeyM.push(st.h);
          r.roofs[s.roof.kind] = (r.roofs[s.roof.kind] ?? 0) + 1;
          if (s.roof.kind !== 'flat') r.pitchDeg.push(s.roof.pitchDeg);
          for (const o of s.openings) {
            if (o.kind === 'window') { r.windowW.push(o.w); r.windowH.push(o.h); } else r.doors[o.kind] = (r.doors[o.kind] ?? 0) + 1;
          }
          r.bayM.push(...bays(s.openings));
        }
      }
    }
    out[style.id] = {
      map: r.map, houses: r.houses,
      // the middles the table is held to (buildingStyleTable.selftest.mjs), then the spreads round them
      mid: r.houses ? { storeys: median(r.storeys), storeyM: round(median(r.storeyM)), pitchDeg: r.pitchDeg.length ? Math.round(median(r.pitchDeg)) : null,
        bayM: r.bayM.length ? round(median(r.bayM), 0.1) : null } : null,
      storeys: spread(r.storeys, 1),
      storeyM: spread(r.storeyM, 0.05),
      roofs: r.roofs,
      pitchDeg: spread(r.pitchDeg, 1),
      window: r.windowW.length ? { w: round(median(r.windowW)), h: round(median(r.windowH)), bayM: spread(r.bayM, 0.1) } : null,
      doors: r.doors,
    };
  }
  return out;
}

async function main(argv) {
  const kits = argv.find((a) => a.startsWith('--kits='))?.slice(7).split(',') ?? null;
  const json = argv.find((a) => a.startsWith('--json='))?.slice(7) ?? null;
  const reading = await readKits({ kits });
  if (json) writeFileSync(json, `${JSON.stringify(reading, null, 2)}\n`);
  for (const [kit, r] of Object.entries(reading)) {
    console.log(`${kit.padEnd(12)} ${String(r.map).padEnd(12)} houses ${String(r.houses).padStart(3)}  storeys ${JSON.stringify(r.storeys)} ${JSON.stringify(r.storeyM)} m  `
      + `roofs ${JSON.stringify(r.roofs)} ${JSON.stringify(r.pitchDeg)}°  window ${JSON.stringify(r.window)}  doors ${JSON.stringify(r.doors)}`);
  }
  return 0;
}

if (isMainModule(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
