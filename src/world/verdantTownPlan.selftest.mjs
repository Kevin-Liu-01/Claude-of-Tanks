// Verdant Fields' classic town plan (maps lane, 2026-10-03; the owner: "the old verdant town plan was better"). The
// layout-brief rebuild keeps its swells, barrows, hedgerow banks, pads and strongpoints, but the village stands as it did
// on main: every house where main put it, the six village wall runs, no apron clearing the centre. This receipt holds
// that against the committed collision shard, so a later terrain, road or dressing change that re-seats the town fails
// here instead of in a screenshot.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeCollisionManifest } from '../../server/collisionManifestCodec.ts';
import { getMapConfig } from './maps/index.ts';

// The nine village structures of origin/main's verdant shard (unchanged from 7353d5b48 to 1eb8375d6): footprint centre
// x, z and extent w, d in metres. Heights follow the rebuilt terrain and are not compared.
const MAIN_HOUSES = [
  [-33.16, 79.14, 16.45, 10.63],
  [-29.99, 55.32, 6.69, 4.28],
  [3.49, 1.70, 10.99, 14.70],
  [6.84, 32.63, 6.83, 8.98],
  [7.96, 96.31, 6.46, 8.80],
  [28.21, -34.19, 14.00, 10.63],
  [28.24, -1.00, 9.17, 13.87],
  [30.97, 31.53, 6.65, 8.75],
  [62.71, 90.16, 6.22, 6.22],
];
// The village wall runs of the classic plan (relative to the classic village rect), and main's stone count along them.
const VILLAGE_WALLS = [
  [-56, 8, -56, 64, 2], [-56, 8, -20, 8, 3], [74, 30, 74, 96, 4],
  [-8, 110, 52, 110, 2], [38, -34, 74, -34, 1], [-44, 108, -10, 108, 0],
];
const MAIN_VILLAGE_STONES = 74;
const VILLAGE_BOX = [-80, 100, -60, 140];

const config = getMapConfig('verdant');
assert.equal(config.terrain.roads, undefined, 'Verdant keeps the country road generator its frontage lots stand on');
const village = { x0: -60, x1: 80, z0: -40, z1: 120 };
for (const stand of config.terrain.hardstands ?? []) {
  const clear = stand.x + stand.width / 2 < village.x0 - 40 || stand.x - stand.width / 2 > village.x1 + 40
    || stand.z + stand.length / 2 < village.z0 - 40 || stand.z - stand.length / 2 > village.z1 + 40;
  assert.ok(clear, `no apron clears the town (one stands at ${stand.x}, ${stand.z})`);
}
for (const run of VILLAGE_WALLS) {
  assert.ok(config.props.wallRuns.some((own) => own.every((v, i) => v === run[i])), `the village wall run ${run} stands`);
}

const manifest = decodeCollisionManifest(JSON.parse(readFileSync(
  new URL('../../server/world-collision-manifests/verdant.json', import.meta.url), 'utf8')));
const footprint = (o) => ({ cx: (o.b[0] + o.b[3]) / 2, cz: (o.b[2] + o.b[5]) / 2, w: o.b[3] - o.b[0], d: o.b[5] - o.b[2] });
const houses = manifest.obstacles.filter((o) => o.k === 'structure').map(footprint);
assert.equal(houses.length, MAIN_HOUSES.length, `the town has main's ${MAIN_HOUSES.length} structures (${houses.length})`);
let worst = 0;
for (const [x, z, w, d] of MAIN_HOUSES) {
  const near = houses.reduce((best, h) => (Math.hypot(h.cx - x, h.cz - z) < Math.hypot(best.cx - x, best.cz - z) ? h : best));
  const off = Math.max(Math.abs(near.cx - x), Math.abs(near.cz - z), Math.abs(near.w - w), Math.abs(near.d - d));
  worst = Math.max(worst, off);
  assert.ok(off <= 0.1, `the house at (${x}, ${z}) stands where main has it, ${w} x ${d} m (off by ${off.toFixed(3)} m)`);
}
const [x0, x1, z0, z1] = VILLAGE_BOX;
const stones = manifest.obstacles.filter((o) => o.k === 'wallstone').map(footprint)
  .filter((s) => s.cx >= x0 && s.cx <= x1 && s.cz >= z0 && s.cz <= z1);
assert.equal(stones.length, MAIN_VILLAGE_STONES, `the village walls carry main's ${MAIN_VILLAGE_STONES} stones (${stones.length})`);
const segmentDistance = (px, pz, [ax, az, bx, bz]) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
};
for (const s of stones) {
  assert.ok(VILLAGE_WALLS.some((run) => segmentDistance(s.cx, s.cz, run) < 4), `a stone at (${s.cx.toFixed(1)}, ${s.cz.toFixed(1)}) stands on a village wall run`);
}
console.log(`verdantTownPlan.selftest: ${houses.length} houses where main has them (worst ${worst.toFixed(3)} m), `
  + `${stones.length} village wall stones on the six runs, no apron in the town`);
