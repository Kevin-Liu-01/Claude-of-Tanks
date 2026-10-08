// Receipt for the surface paint prefetch (src/world/surfacePaintPrefetch.ts and surfacePaintWorker.ts, the time-to-battle
// lane): the worker's prints are the props build's own, texel for texel — the straw's and the dry-stone walls' (both
// lithologies), and (2026-10-08) the tiles the build paints from its noise: the rock tile (every lithology) and the
// building kit's three detail tiles — painted by the worker module against the same painters run where the props build
// runs them; the prefetch hands each print over once, by its exact arguments, and nothing it does not hold; a settled
// tile goes only to the noise registered with its seed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { HAY_PRINT_SEED, paintHayBuffers } from './hayPrint.ts';
import { FIELD_STONE_PRINT_SEED, paintFieldStoneBuffers } from './fieldStoneSurface.ts';
import { registerPaintNoise, settledPaint, startSurfacePaints, surfacePaintKey } from './surfacePaintPrefetch.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { paintRockDetailBuffers } from './rockDressing.ts';
import { paintStructureDetailBuffers } from './structureDetailTile.ts';

const drain = (g) => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };
const digest = (buffers) => Object.fromEntries(Object.entries(buffers).filter(([, v]) => ArrayBuffer.isView(v)).sort()
  .map(([k, v]) => [k, createHash('sha256').update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)).digest('hex')]));

// the worker module, run in this realm: its onmessage on a stand-in `self`
const replies = [];
globalThis.self = { onmessage: null, postMessage: (reply, transfer) => replies.push({ reply, transfer }) };
const workerModule = await import('./surfacePaintWorker.ts');
const worker = globalThis.self;
// the props build's noise (props.ts: new SimplexNoise({ random: mulberry32(seed + 7) }), seed 2002) as the worker rebuilds it
const { installWorldBuildFixture } = await import('../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const props = await import('./props.ts');
{
  const a = new SimplexNoise({ random: props.mulberry32(2009) }), b = workerModule.propsPaintNoise(2009);
  for (let i = 0; i < 200; i++) assert.equal(b.noise(i * 0.37 - 11, i * 0.11 + 3), a.noise(i * 0.37 - 11, i * 0.11 + 3), 'the worker\'s noise is the build\'s');
}
const LITHOLOGIES = ['granite', 'gneiss', 'sandstone', 'limestone', 'slate', 'basalt', 'chalk'];
const jobs = [
  { kind: 'hay', size: 256, seed: HAY_PRINT_SEED },
  { kind: 'fieldStone', size: 256, seed: FIELD_STONE_PRINT_SEED, lithology: 'fieldstone' },
  { kind: 'fieldStone', size: 256, seed: FIELD_STONE_PRINT_SEED, lithology: 'chalk' },
  ...LITHOLOGIES.map((lithology) => ({ kind: 'rockDetail', lithology, noiseSeed: 2009 })),
  ...['wood', 'canvas', 'steel'].map((detail) => ({ kind: 'structureDetail', detail, noiseSeed: 2009 })),
].map((job, i) => ({ ...job, id: i + 1 }));
for (const job of jobs) worker.onmessage({ data: job });
assert.equal(replies.length, jobs.length);
const inline = (job) => {
  switch (job.kind) {
    case 'hay': return drain(paintHayBuffers(job.size, job.seed));
    case 'fieldStone': return drain(paintFieldStoneBuffers(job.size, job.seed, job.lithology));
    case 'rockDetail': return drain(paintRockDetailBuffers(workerModule.propsPaintNoise(job.noiseSeed), job.lithology));
    default: return paintStructureDetailBuffers(workerModule.propsPaintNoise(job.noiseSeed), job.detail);
  }
};
replies.forEach(({ reply, transfer }, i) => {
  const job = jobs[i];
  assert.equal(reply.ok, true, `${job.kind} ${job.lithology ?? job.detail ?? ''}`);
  assert.deepEqual(digest(reply.buffers), digest(inline(job)), `${surfacePaintKey(job)}: the worker's print is the props build's, texel for texel`);
  assert.ok(transfer.length >= 1, 'the typed arrays travel as transfers, not copies');
});
// the default seeds are the named ones (a painter called without one paints the same print)
assert.deepEqual(digest(drain(paintHayBuffers(256))), digest(drain(paintHayBuffers(256, HAY_PRINT_SEED))));

// the prefetch: one job per distinct print, handed over once, by its exact arguments; a failure surfaces where taken
{
  const posted = [];
  let port;
  const p = startSurfacePaints([
    { kind: 'hay', size: 512, seed: HAY_PRINT_SEED },
    { kind: 'hay', size: 512, seed: HAY_PRINT_SEED },
    { kind: 'fieldStone', size: 512, seed: FIELD_STONE_PRINT_SEED, lithology: 'chalk' },
  ], () => (port = { postMessage: (job) => posted.push(job), terminate() { this.terminated = true; }, onmessage: null, onerror: null }), () => 0);
  assert.equal(posted.length, 2, 'a repeated print is one job');
  const hay = p.take(surfacePaintKey({ kind: 'hay', size: 512, seed: HAY_PRINT_SEED }));
  assert.ok(hay);
  assert.equal(p.take(surfacePaintKey({ kind: 'hay', size: 512, seed: HAY_PRINT_SEED })), null, 'and handed over once');
  assert.equal(p.take(surfacePaintKey({ kind: 'fieldStone', size: 512, seed: FIELD_STONE_PRINT_SEED, lithology: 'fieldstone' })), null,
    'another lithology is not this print');
  port.onmessage({ data: { id: posted[0].id, ok: true, buffers: { size: 512, marker: 'hay' } } });
  assert.equal((await hay).marker, 'hay');
  const stone = p.take(surfacePaintKey({ kind: 'fieldStone', size: 512, seed: FIELD_STONE_PRINT_SEED, lithology: 'chalk' }));
  port.onmessage({ data: { id: posted[1].id, ok: false, message: 'boom' } });
  await assert.rejects(stone, /boom/);
  p.dispose();
  assert.ok(port.terminated);
  assert.deepEqual([p.stats.planned, p.stats.taken, p.stats.missed, p.stats.failed], [2, 2, 2, 1]);
}
assert.equal(startSurfacePaints([], () => { throw new Error('no worker for nothing'); }), null);

// a settled tile: taken synchronously, once, and only by the noise registered with its seed; a tile still painting, or
// an unregistered noise, is painted where it stands; disposal releases the settled tiles nobody took
{
  const posted = [];
  let port;
  const p = startSurfacePaints([
    { kind: 'rockDetail', lithology: 'granite', noiseSeed: 4242 },
    { kind: 'structureDetail', detail: 'wood', noiseSeed: 4242 },
    { kind: 'structureDetail', detail: 'steel', noiseSeed: 4242 },
  ], () => (port = { postMessage: (job) => posted.push(job), terminate() {}, onmessage: null, onerror: null }), () => 0);
  const noise = {}, stranger = {};
  registerPaintNoise(noise, 4242);
  const rockKey = (seed) => surfacePaintKey({ kind: 'rockDetail', lithology: 'granite', noiseSeed: seed });
  const woodKey = (seed) => surfacePaintKey({ kind: 'structureDetail', detail: 'wood', noiseSeed: seed });
  assert.equal(settledPaint(noise, rockKey), null, 'not back yet: painted where it stands');
  port.onmessage({ data: { id: posted[0].id, ok: true, buffers: { marker: 'rock' } } });
  port.onmessage({ data: { id: posted[1].id, ok: true, buffers: { marker: 'wood' } } });
  assert.equal(settledPaint(stranger, rockKey), null, 'an unregistered noise takes nothing');
  assert.equal(settledPaint(noise, rockKey).marker, 'rock');
  assert.equal(settledPaint(noise, rockKey), null, 'taken once');
  assert.equal(p.take(rockKey(4242)), null, 'and no asynchronous take after it');
  assert.equal(p.stats.settledTaken, 1);
  p.dispose();
  assert.equal(settledPaint(noise, woodKey), null, 'disposal releases the settled tiles nobody took');
}

// the plan asks for the straw everywhere, the build's noise tiles everywhere, the dry-stone print where the walls are dry stone
const { plannedSurfacePaints } = props;
const plan = (id, props = {}) => plannedSurfacePaints({ id, props }).map((r) => surfacePaintKey(r));
assert.ok(plan('verdant').includes(`hay|512|${HAY_PRINT_SEED}`));
assert.ok(plan('verdant').some((k) => k.startsWith('fieldStone|512|')), 'a dry-stone map paints its walls\' print');
assert.ok(!plan('urban').some((k) => k.startsWith('fieldStone')), 'a brick map paints no dry-stone print');
assert.ok(!plan('desert', { wallStyle: 'adobe' }).some((k) => k.startsWith('fieldStone')), 'nor an adobe-walled one');
for (const id of ['verdant', 'urban', 'desert', 'fjord']) {
  const keys = plan(id);
  for (const detail of ['wood', 'canvas', 'steel']) assert.ok(keys.includes(`structureDetail|${detail}|2009`), `${id}: the ${detail} tile from the build's noise`);
  assert.ok(keys.some((k) => /^rockDetail\|[a-z]+\|2009$/.test(k)), `${id}: its rock tile`);
}
assert.deepEqual(plannedSurfacePaints({ id: 'verdant', props: {} }, 1337).filter((r) => r.noiseSeed !== undefined).map((r) => r.noiseSeed),
  [1344, 1344, 1344, 1344], 'another props seed, another noise');
console.log('surfacePaintPrefetch: the worker\'s prints are the props build\'s texel for texel (straw, dry stone, chalk, seven rock tiles, three kit tiles), handed over once by exact arguments, failures where taken, settled tiles only to their registered noise, the plan by wall style PASS');
