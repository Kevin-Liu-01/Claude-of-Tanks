// Receipt for the surface paint prefetch (src/world/surfacePaintPrefetch.ts and surfacePaintWorker.ts, the time-to-battle
// lane): the worker's prints are the props build's own, texel for texel — the straw's and the dry-stone walls' (both
// lithologies) painted by the worker module against the same painters drained where the props build drains them — and
// the prefetch hands each print over once, by its exact arguments, and nothing it does not hold.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { HAY_PRINT_SEED, paintHayBuffers } from './hayPrint.ts';
import { FIELD_STONE_PRINT_SEED, paintFieldStoneBuffers } from './fieldStoneSurface.ts';
import { startSurfacePaints, surfacePaintKey } from './surfacePaintPrefetch.ts';

const drain = (g) => { let r = g.next(); while (!r.done) r = g.next(); return r.value; };
const digest = (buffers) => Object.fromEntries(Object.entries(buffers).filter(([, v]) => ArrayBuffer.isView(v)).sort()
  .map(([k, v]) => [k, createHash('sha256').update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)).digest('hex')]));

// the worker module, run in this realm: its onmessage on a stand-in `self`
const replies = [];
globalThis.self = { onmessage: null, postMessage: (reply, transfer) => replies.push({ reply, transfer }) };
await import('./surfacePaintWorker.ts');
const worker = globalThis.self;
const jobs = [
  { id: 1, kind: 'hay', size: 256, seed: HAY_PRINT_SEED },
  { id: 2, kind: 'fieldStone', size: 256, seed: FIELD_STONE_PRINT_SEED, lithology: 'fieldstone' },
  { id: 3, kind: 'fieldStone', size: 256, seed: FIELD_STONE_PRINT_SEED, lithology: 'chalk' },
];
for (const job of jobs) worker.onmessage({ data: job });
assert.equal(replies.length, 3);
const inline = [
  drain(paintHayBuffers(256, HAY_PRINT_SEED)),
  drain(paintFieldStoneBuffers(256, FIELD_STONE_PRINT_SEED, 'fieldstone')),
  drain(paintFieldStoneBuffers(256, FIELD_STONE_PRINT_SEED, 'chalk')),
];
replies.forEach(({ reply, transfer }, i) => {
  assert.equal(reply.ok, true, `job ${i + 1}`);
  assert.deepEqual(digest(reply.buffers), digest(inline[i]), `job ${i + 1}: the worker's print is the props build's, texel for texel`);
  assert.ok(transfer.length >= 2, 'the typed arrays travel as transfers, not copies');
});
// the default seeds are the named ones (a painter called without one paints the same print)
assert.deepEqual(digest(drain(paintHayBuffers(256))), digest(inline[0]));

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
  const hay = p.take(surfacePaintKey('hay', 512, HAY_PRINT_SEED));
  assert.ok(hay);
  assert.equal(p.take(surfacePaintKey('hay', 512, HAY_PRINT_SEED)), null, 'and handed over once');
  assert.equal(p.take(surfacePaintKey('fieldStone', 512, FIELD_STONE_PRINT_SEED, 'fieldstone')), null, 'another lithology is not this print');
  port.onmessage({ data: { id: posted[0].id, ok: true, buffers: { size: 512, marker: 'hay' } } });
  assert.equal((await hay).marker, 'hay');
  const stone = p.take(surfacePaintKey('fieldStone', 512, FIELD_STONE_PRINT_SEED, 'chalk'));
  port.onmessage({ data: { id: posted[1].id, ok: false, message: 'boom' } });
  await assert.rejects(stone, /boom/);
  p.dispose();
  assert.ok(port.terminated);
  assert.deepEqual([p.stats.planned, p.stats.taken, p.stats.missed, p.stats.failed], [2, 2, 2, 1]);
}
assert.equal(startSurfacePaints([], () => { throw new Error('no worker for nothing'); }), null);

// the plan asks for the straw everywhere and the dry-stone print where the walls are dry stone
const { installWorldBuildFixture } = await import('../../tools/headlessWorldCollision.mjs');
installWorldBuildFixture();
const { plannedSurfacePaints } = await import('./props.ts');
const plan = (id, props = {}) => plannedSurfacePaints({ id, props }).map((r) => surfacePaintKey(r.kind, r.size, r.seed, r.lithology));
assert.ok(plan('verdant').includes(`hay|512|${HAY_PRINT_SEED}`));
assert.ok(plan('verdant').some((k) => k.startsWith('fieldStone|512|')), 'a dry-stone map paints its walls\' print');
assert.ok(!plan('urban').some((k) => k.startsWith('fieldStone')), 'a brick map paints no dry-stone print');
assert.ok(!plan('desert', { wallStyle: 'adobe' }).some((k) => k.startsWith('fieldStone')), 'nor an adobe-walled one');
console.log('surfacePaintPrefetch: the worker\'s prints are the props build\'s texel for texel (straw, dry stone, chalk), handed over once by exact arguments, failures where taken, the plan by wall style PASS');
