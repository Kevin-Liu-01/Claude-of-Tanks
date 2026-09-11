// Recover the exact orientation of failed pilot bank samples, then retain
// actual cross-sections for visual review. This does not rerun/relax a gate.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createHeightField } from '../src/world/terrain.ts';
import { getMapConfig } from '../src/world/maps/index.ts';
import { ROAD_ENDPOINT_INTENTS } from '../src/world/maps/roadEndpoints.ts';
import { createCaptureLock } from './capture-lock.mjs';

const receiptPath = process.argv.find(a => a.startsWith('--receipt='))?.slice(10);
const output = process.argv.find(a => a.startsWith('--out='))?.slice(6);
if (!receiptPath || !output) throw new Error('Require --receipt=<pilot-json> --out=<fresh-json>');
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
const source = () => ({ terrain: hash(new URL('../src/world/terrain.ts', import.meta.url)),
  corridor: hash(new URL('../src/world/maps/roadBorderCorridor.ts', import.meta.url)),
  endpoints: hash(new URL('../src/world/maps/roadEndpoints.ts', import.meta.url)) });
const frozen = source();
for (const key of Object.keys(frozen)) assert.equal(frozen[key], receipt.source.candidate[key]);
assert.equal(receipt.status, 'failed');

function sectionOwner(config, roads, point) {
  const spec = config.terrain.roads, shift = spec.grid ? spec.grid.xs.length + spec.grid.zs.length : 0;
  let best = null;
  for (let at = 0; at < spec.paths.length * 2; at++) {
    const i = at >> 1, end = at & 1;
    if (ROAD_ENDPOINT_INTENTS[config.id][i + shift][end] !== 'boundary') continue;
    const path = spec.paths[i], route = roads[i + shift];
    const a = end ? path.at(-1) : path[0], b = end ? route.at(-1) : route[0];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!length) continue;
    const ux = (b[0] - a[0]) / length, uz = (b[1] - a[1]) / length;
    const along = (point.x - a[0]) * ux + (point.z - a[1]) * uz;
    if (along < 0 || along > length) continue;
    const error = Math.abs((point.x - a[0]) * uz - (point.z - a[1]) * ux - point.side * point.offset);
    if (!best || error < best.error) best = { route: i + shift, end, anchor: a, terminal: b,
      length, ux, uz, along, error, center: [a[0] + ux * along, a[1] + uz * along] };
  }
  assert.ok(best && best.error < 1e-8, 'the recorded point must resolve to its original portal orientation');
  return best;
}
function crossSection(field, point, owner) {
  const samples = [];
  for (let offset = -96; offset <= 96; offset += 4) {
    const shift = offset - point.side * point.offset;
    const x = point.x + owner.uz * shift, z = point.z - owner.ux * shift;
    if (Math.max(Math.abs(x), Math.abs(z)) > 510) continue;
    const left = field.getHeightAt(x - owner.uz, z + owner.ux);
    const right = field.getHeightAt(x + owner.uz, z - owner.ux);
    samples.push({ signedOffsetM: offset, x, z, y: field.getHeightAt(x, z),
      signedSlopeOver2m: (right - left) / 2, roadDistanceM: field._roadDist(x, z) });
  }
  return samples;
}
const lock = createCaptureLock();
await lock.acquire(45 * 60 * 1000);
const heartbeat = setInterval(() => lock.refresh(), 30000);
const result = { scope: 'four actual failed bank cross-sections; coordinates outside510 omitted; not a new gate or timing/native evidence',
  receiptPath, receiptSha256: hash(receiptPath), source: frozen, records: [] };
try {
  const failures = receipt.records.filter(r => r.grades.wideShoulder > 2);
  assert.equal(failures.length, 4);
  for (const record of failures) {
    const config = getMapConfig(record.mapId), field = createHeightField(record.seed, config);
    const point = record.grades.worstWide, owner = sectionOwner(config, field._layout.roads, point);
    const left = field.getHeightAt(point.x - owner.uz, point.z + owner.ux);
    const right = field.getHeightAt(point.x + owner.uz, point.z - owner.ux);
    assert.equal(Math.abs(right - left) / 2, record.grades.wideShoulder, 'reproduce the recorded slope exactly');
    result.records.push({ mapId: record.mapId, seed: record.seed, point,
      pointY: field.getHeightAt(point.x, point.z), owner, signedSlopeOver2m: (right - left) / 2,
      samples: crossSection(field, point, owner) });
  }
  assert.deepEqual(source(), frozen);
} finally {
  clearInterval(heartbeat); lock.release();
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ records: result.records.length, output }));
}
