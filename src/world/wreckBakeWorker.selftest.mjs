import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { outputIdentity } from '../../tools/wreck-paint-bench.mjs';
import { unpackWreckBake } from './wreckBakeWire.ts';
import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { bakeTankWreck } from './wrecks.ts';

// Run the production browser worker, with only its messaging port adapted to
// Node. No fake factory/geometry, and every transmitted buffer crosses threads.
const entry = new URL('./wreckBakeWorker.ts', import.meta.url).href;
const worker = new Worker(new URL('data:text/javascript,' + encodeURIComponent(`
  import { parentPort } from 'node:worker_threads';
  globalThis.self = {
    set onmessage(handler) { parentPort.on('message', data => handler({ data })); },
    postMessage(reply, transfer) { parentPort.postMessage(reply, transfer); }
  };
  await import(${JSON.stringify(entry)});
`)));
let serial = 0;
function request(specId, options) {
  const requestId = ++serial;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      worker.off('message', message);
      worker.off('error', failed);
      worker.off('exit', exited);
    };
    const failed = error => { cleanup(); reject(error); };
    const exited = code => failed(new Error(`Worker exited before reply (${code})`));
    const message = reply => {
      if (reply.requestId !== requestId) return;
      cleanup(); resolve(reply);
    };
    const timer = setTimeout(() => failed(new Error('Worker response timeout')), 30_000);
    worker.on('message', message);
    worker.once('error', failed);
    worker.once('exit', exited);
    worker.postMessage({ requestId, specId, options });
  });
}
const dispose = baked => { baked?.geo.dispose(); baked?.shadowGeo?.dispose(); };
try {
  const receipts = [];
  for (const fixture of [{ specId: 't90m', seed: 2526, pop: false },
    { specId: 'k2', seed: 2002, pop: true }]) {
    await ensureTankBuilder(fixture.specId);
    const control = bakeTankWreck({}, fixture.specId, fixture);
    let transferred = null;
    let ticks = 0;
    const interval = setInterval(() => ticks++, 1);
    const started = performance.now();
    try {
      const reply = await request(fixture.specId, fixture);
      assert.equal(reply.ok, true, reply.message);
      assert.ok(reply.wire, 'actual requested donor was built');
      transferred = unpackWreckBake(reply.wire);
      assert.deepEqual(outputIdentity(transferred), outputIdentity(control),
        `${fixture.specId}: worker retains exact geometry, colors, shadows, metadata and collision bounds`);
      assert.ok(ticks > 0, 'the main thread services tasks during worker construction');
      receipts.push({ specId: fixture.specId, mainThreadTicks: ticks,
        workerRoundTripMs: Math.round(performance.now() - started) });
    } finally { clearInterval(interval); dispose(control); dispose(transferred); }
  }
  const missing = await request('__not_a_vehicle__', { seed: 1, pop: false });
  assert.ok(missing.ok === false || missing.wire === null, 'missing donor cannot return unrelated geometry');
  console.log('wreckBakeWorker.selftest: PASS', JSON.stringify(receipts));
} finally {
  await worker.terminate();
}
