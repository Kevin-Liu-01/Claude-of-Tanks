// Recorded town plans and the carriageway post-pass (maps-and-layouts lane, 2026-10-03; the owner's town-plan ruling): a
// battlefield whose settlement replays PR #9's head (props.ts townPlan, maps/townPlans.generated.ts) keeps every one of
// its structures where that build seated it, whatever its ground, roads and aprons have become, and a map that
// generates its plan with the road clearance (Blackglass) keeps its draws; in both, only a building that stood in a
// carriageway moves, by the least distance that clears it (props.ts roadBuildingClearance). This receipt holds that
// against the committed collision shards and the footprints the PR head's shards carried.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeCollisionManifest } from '../../server/collisionManifestCodec.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';
import { TOWN_LIGHT_PLANS, TOWN_PLANS } from './maps/townPlans.generated.ts';

// The PR head's (0bbb0cddc) 'structure' footprints per map, [centre x, centre z, width, depth] in metres, and how many
// of them stood in a carriageway there (and so may move off it).
const PR_HEAD = {
  titan_gorge: { carriageway: 5, structures: [
    [-112.8, 48.69, 27.35, 26.51], [58.71, -50.19, 27.41, 24.25], [75.47, -24.66, 18.7, 23.15],
    [46.16, -6.49, 11.23, 11.9], [90.05, 3.45, 11.48, 9.24], [61.22, 21.14, 5.64, 5.64],
    [106.94, 29.99, 10.05, 9.36], [128.68, 19.75, 24.06, 22.37], [111.97, 46.53, 19.7, 22.73],
    [94.61, 72.92, 10.5, 10.95], [102.99, 113.98, 15.45, 12.71], [78.25, 99.65, 4.91, 4.91],
    [89.02, 143.74, 18.32, 20.96], [62.74, 127.32, 24.86, 28.81], [115.69, -35.67, 15.35, 24.56],
    [138.14, -69.41, 9.71, 8.57], [144.82, -38.87, 7.61, 18.3], [-126.18, -123.24, 4.66, 10.93],
    [-43.68, -122.04, 20.23, 21.39], [-18.22, -119.67, 6.73, 8.39], [39.26, -122.48, 4.1, 4.1],
    [62.11, -114.35, 8.78, 6.53], [87.58, -116.85, 12.37, 19.8], [92.25, -92.22, 20.76, 10.11],
    [118.28, -61.62, 14.96, 7.18], [-100.21, -35.47, 14.76, 19.7], [95.77, -41.61, 24.29, 17.09],
    [-127.75, -8.86, 8.59, 6.81],
  ] },
  // Blackglass generates its district (no recorded plan) with the clearance: nine of its blocks stood in a carriageway;
  // eight moved off it, and the civic hall at (-101.9, -85.8), with no clear place within 30 m, stays where it stood
  blackglass: { carriageway: 9, structures: [
    [-254.16, -252.85, 37.15, 37.18], [-281.08, -227.61, 27.81, 28.03], [-263.82, -203.71, 34.76, 34.49],
    [-241.99, -183.91, 38.16, 37.03], [-197.23, -186.09, 11.01, 11.06], [-176.85, -167.41, 33.18, 33.27],
    [-205.49, -139.99, 22.07, 22.2], [-157, -148.08, 34.58, 34.7], [-186.15, -120.18, 31.13, 31.09],
    [-140.51, -125.54, 19.54, 19.51], [-121.68, -105.25, 11.62, 11.57], [-101.84, -85.72, 37.9, 37.4],
    [-61.47, -48.85, 37.05, 37.27], [-41.17, -28.86, 34.55, 34.73], [-64.83, -3.1, 26.64, 25.81],
    [-22.86, -5.75, 33.94, 33.88], [-43.35, 16.52, 11.44, 11.28], [44.09, 50.49, 19.14, 19.07],
    [16.87, 80.28, 37.02, 38.16], [65.62, 70.11, 34.24, 34.82], [37.88, 100.25, 28.04, 27.92],
    [84.67, 93.03, 11.09, 11.1], [62.08, 116.27, 33.29, 33.14], [109.13, 109.31, 19.48, 19.54],
    [80.39, 137.24, 27.6, 27.36], [126, 132.35, 34.77, 34.46], [146.79, 151.6, 31.22, 30.93],
    [140.02, 197.8, 37.5, 37.82], [206.6, 211.81, 11.46, 11.54], [180.51, 237.16, 33.88, 33.94],
    [201.39, 255.06, 18.92, 19.56], [244.14, 257.9, 34.83, 34.17], [263.29, 279.81, 37.59, 35.67],
    [268.97, -270.48, 10.88, 11.1], [249.49, -247.08, 38.34, 36.67], [224.59, -267.9, 27.88, 28.04],
    [-230, -213.48, 11.62, 11.51], [-208.5, -189.47, 11.61, 11.51], [-133.56, -109.93, 11.62, 11.53],
    [175.38, 191.59, 11.27, 11.2], [188.99, 205.45, 11.12, 11.08], [209.67, 226.75, 11.47, 11.41],
    [-294.09, -246.85, 11.57, 11.48], [-159.73, -105.98, 14.49, 14.55], [-137.3, -80.13, 11.36, 11.3],
    [-116.41, -58.99, 12.84, 12.82], [110.1, 158.42, 10.6, 10.56], [230.18, 288.55, 14.05, 13.85],
    [-275.43, -119.76, 12.19, 10.38], [-261.1, -118.51, 7.69, 9.33], [-246.68, -117.73, 10.07, 12.08],
    [-219.48, -113.33, 12.53, 11.28], [-66.58, -112.04, 7.97, 10.39], [-51.05, -112.64, 11.33, 12.2],
    [-35, -114.96, 7.7, 9.66], [-18.75, -115.56, 8.1, 10.22], [-1.97, -116.67, 11.69, 11.67],
    [9.62, -116.73, 7.36, 9.33], [25.01, -116.5, 7.58, 9.14], [39.94, -114.02, 12.06, 12.25],
    [55.88, -111.73, 8.26, 10.21], [73.04, -110.78, 7.43, 9.52], [87.53, -109.06, 10.79, 12.99],
    [126.1, -103.46, 11.72, 10.93], [145.22, -101.82, 10.03, 11.1], [161.43, -98.95, 7.88, 9.7],
    [178.89, -102.72, 10.38, 13.25], [194.42, -104.07, 11.5, 10.84], [209.5, -106.3, 12.95, 12.39],
    [243.53, -111.13, 8.03, 9.4], [257.61, -115.82, 8.09, 10.51], [282.71, -118.4, 11.28, 11.02],
    [-274.77, -96.7, 8.19, 9.33], [-260.55, -95.34, 8.03, 9.71], [-245.31, -92.27, 8.3, 9.89],
    [-200.94, -86.46, 12.18, 12.59], [-184.6, -85.44, 11.32, 11.09], [-164.23, -84.28, 10.98, 11],
    [-71.31, -88, 11.36, 9.98], [-62, -86.82, 7.95, 9.9], [-37.86, -90.7, 12.56, 12.06],
    [-22.04, -91.94, 11.59, 12.47], [-7.13, -91.89, 11.26, 13.13], [6.89, -94.94, 9.73, 9.92],
    [20.23, -93.5, 12.44, 11.33], [36.71, -89.66, 11.74, 13.28], [51.6, -89.13, 11.33, 11.44],
    [66.04, -88.27, 8.09, 9.2], [106.93, -83.02, 11.48, 11.93], [122.75, -81.38, 11.99, 11.79],
    [136.76, -78.97, 9.93, 12.81], [151.38, -77.07, 8.29, 10.57], [164.09, -75.92, 8.19, 10.14],
    [177.99, -78.13, 8.29, 9.68], [191.09, -82.46, 12.48, 10.55], [206.56, -83.27, 8.54, 9.82],
    [238.78, -87.95, 11.34, 13.31], [254.73, -90.24, 12.99, 13.05], [270.56, -92.74, 12.79, 12.96],
    [286.5, -94.92, 12.31, 12.26], [-198.55, -276.8, 9.69, 7.68], [-199.93, -261.52, 12.05, 11.01],
    [-202.86, -246.73, 10.55, 7.59], [-204.76, -231.12, 10.1, 7.88], [-205.78, -216.41, 9.38, 7.82],
    [-215.25, -160.3, 11.33, 11.91], [-215.08, -91.12, 14, 12.4], [-210.95, -71.3, 10.87, 8.7],
    [-208.39, -56.82, 12.02, 10.69], [-203.48, -32.56, 10.09, 8.65], [-197.27, 3.82, 13.61, 13.04],
    [-196.61, 19.1, 10.51, 10.79], [-191.88, 38.34, 12.54, 11.43], [-193.46, 52.04, 9.76, 7.86],
    [-195.74, 67.45, 10.6, 7.8], [-198.09, 82.74, 11.51, 11.94], [-202.19, 104.66, 9.64, 8.4],
    [-205.56, 130.67, 12.71, 13.04], [-207.41, 146.33, 13.36, 12.5], [-214.93, 179.06, 9.42, 8.05],
    [-215.81, 194.89, 10.57, 8.36], [-218.36, 207.03, 10.36, 8.25], [-215.51, 223.74, 13.24, 10.32],
    [-213.21, 243, 9.52, 7.67], [-208.13, 286.38, 9.64, 8.26], [-224.32, -265.56, 9.51, 8.21],
    [-224.44, -250.88, 9.78, 8.32], [-227.35, -237.06, 10, 7.7], [-241, -148.37, 9.44, 7.88],
    [-236.53, -78.06, 10.36, 7.83], [-232.79, -55.3, 10.02, 7.9], [-230.4, -39.18, 13.46, 12.34],
    [-226.62, -24.01, 9.35, 7.7], [-225.05, -7.68, 10.17, 8.68], [-221.09, 7.7, 11.66, 10.55],
    [-219.14, 22, 9.63, 7.93], [-215.92, 37.69, 10.61, 8.55], [-216.01, 50.06, 11.18, 11.16],
    [-221.12, 71.72, 9.72, 8.46], [-222.52, 84.88, 11.64, 12.01], [-224.99, 100.85, 10.53, 10.26],
    [-227.42, 118.11, 13.07, 11.55], [-231.97, 140.51, 10.54, 8.5], [-237.4, 173.82, 12.35, 12.27],
    [-240.59, 198.51, 11.32, 11.95], [-241.88, 211.53, 11.21, 11.18], [-237.91, 232.47, 9.55, 8.28],
    [-236.07, 249.39, 10.47, 7.53], [-234.26, 264.71, 12.24, 11.64], [-233.14, 280.01, 9.6, 8.1],
  ] },
};

for (const mapId of MAP_IDS) {
  const plan = getMapConfig(mapId).props?.townPlan;
  if (plan) assert.equal(plan, TOWN_PLANS[mapId], `${mapId}: a replayed town plan is the recorded one`);
}
for (const mapId of Object.keys(TOWN_PLANS)) {
  assert.ok(mapId in PR_HEAD, `${mapId}: every recorded town plan is held here`);
  assert.equal(getMapConfig(mapId).props.townPlan, TOWN_PLANS[mapId], `${mapId}: the map replays its recorded town plan`);
  assert.ok(TOWN_PLANS[mapId].length >= 1, `${mapId}: the plan is not empty`);
}
const footprint = (o) => ({ cx: (o.b[0] + o.b[3]) / 2, cz: (o.b[2] + o.b[5]) / 2, w: o.b[3] - o.b[0], d: o.b[5] - o.b[2] });
const summary = [];
for (const [mapId, { carriageway, structures }] of Object.entries(PR_HEAD)) {
  const config = getMapConfig(mapId);
  if (!TOWN_PLANS[mapId]) {
    assert.ok(config.props.roadBuildingClearance && !config.props.townPlan, `${mapId}: a generated plan with the road clearance`);
  }
  const manifest = decodeCollisionManifest(JSON.parse(readFileSync(
    new URL(`../../server/world-collision-manifests/${mapId}.json`, import.meta.url), 'utf8')));
  const now = manifest.obstacles.filter((o) => o.k === 'structure').map(footprint);
  assert.equal(now.length, structures.length, `${mapId}: as many structures as the PR head (${now.length})`);
  let exact = 0, moved = 0, worstMove = 0;
  const taken = new Set();
  for (const [cx, cz, w, d] of structures) {
    const same = now.findIndex((s, i) => !taken.has(i) && Math.abs(s.cx - cx) <= 0.1 && Math.abs(s.cz - cz) <= 0.1
      && Math.abs(s.w - w) <= 0.1 && Math.abs(s.d - d) <= 0.1);
    if (same >= 0) { taken.add(same); exact++; continue; }
    // moved off a carriageway: the same footprint, translated a short way
    const off = now.findIndex((s, i) => !taken.has(i) && Math.abs(s.w - w) <= 0.1 && Math.abs(s.d - d) <= 0.1
      && Math.hypot(s.cx - cx, s.cz - cz) <= 30);
    assert.ok(off >= 0, `${mapId}: the structure at (${cx}, ${cz}) stands where the PR head has it or a short move off a carriageway`);
    taken.add(off); moved++;
    worstMove = Math.max(worstMove, Math.hypot(now[off].cx - cx, now[off].cz - cz));
  }
  assert.ok(moved <= carriageway, `${mapId}: only buildings that stood in a carriageway move (${moved} of ${carriageway})`);
  summary.push(`${mapId} ${exact} exact, ${moved} off a carriageway (up to ${worstMove.toFixed(1)} m)`);
}
// Light buildings (props.ts townLightPlan): a replayed settlement replays its huts, tents and sheds as well, so each one
// the record holds stands at its recorded pose in the committed shard: a destructible of its kind whose footprint holds
// that point (the pool refits a light building's box to the solids it bears on, up to a metre off its centre).
assert.deepEqual(Object.keys(TOWN_LIGHT_PLANS).sort(), Object.keys(TOWN_PLANS).sort(), 'every recorded plan records its light buildings');
for (const [mapId, entries] of Object.entries(TOWN_LIGHT_PLANS)) {
  assert.equal(getMapConfig(mapId).props.townLightPlan, entries, `${mapId}: the map replays its recorded light buildings`);
  const obstacles = decodeCollisionManifest(JSON.parse(readFileSync(
    new URL(`../../server/world-collision-manifests/${mapId}.json`, import.meta.url), 'utf8'))).obstacles;
  for (const entry of entries) {
    assert.ok(obstacles.some((o) => o.k === entry.kind && entry.x >= o.b[0] && entry.x <= o.b[3]
      && entry.z >= o.b[2] && entry.z <= o.b[5]), `${mapId}: the ${entry.kind} stands at its recorded (${entry.x}, ${entry.z})`);
  }
  summary.push(`${mapId} ${entries.length} light buildings at their recorded poses`);
}
console.log(`townPlans.selftest: ${summary.join('; ')}`);
