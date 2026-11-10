// The riding-parts prebuild (UI-LOCKDOWN E, 2026-10-25). A riding cradle or riding station is built once per option set
// and copied by every build after (ridingPartsCache.ts), but its first build is a 200-900 ms fit on the main thread, and
// almost every tank has its own. The first time the page asks for tanks' builders ahead of their builds (the Garage's
// neighbour pass after its first tank, a deploy intent, a battle's roster: fleetFactory.ensureTankBuilders), a worker
// builds every option set in the manifest, those tanks' first, and this seeds each into the cache as it arrives: a later
// build copies it. A build that needs a key not seeded yet builds it in-line, as before.
// (2026-11-02 audit R6) the worker-client pattern (src/workerClientHealth.ts): the prebuild is idle, running or done. A
// worker that cannot start or fails (`error`) goes back to idle, so a later ask starts a fresh one for the keys still
// missing (`have` is read at each start), three failures in a row at most; a `messageerror` loses that one part, which
// builds in-line, and the rest go on. Before, a failed start latched the prebuild off for the session. It has no
// deadline: nothing waits on it.
import type { RidingPartsReply, RidingPartsRequest } from './ridingPartsWorker.ts';
import { ridingPartKeys, seedRidingParts } from './ridingPartsWire.ts';
import { createWorkerClientHealth } from '../workerClientHealth.ts';

type RidingPartsPrebuildState = 'idle' | 'running' | 'done';

let state: RidingPartsPrebuildState = 'idle';
const health = createWorkerClientHealth();

/** Where the prebuild stands (its probe). */
export function ridingPartsPrebuildState(): RidingPartsPrebuildState {
  return state === 'idle' && health.state === 'unavailable' ? 'done' : state;
}

/** Start the prebuild unless it runs or ran (later calls do nothing); `order` names the tanks to serve first. */
export function startRidingPartsPrebuild(order: readonly string[]): void {
  if (state !== 'idle' || health.state === 'unavailable' || typeof Worker !== 'function') return;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./ridingPartsWorker.ts', import.meta.url), { type: 'module', name: 'cot-riding-parts' });
  } catch {
    health.failed();
    return;
  }
  state = 'running';
  const stop = (next: 'idle' | 'done'): void => {
    worker.onmessage = worker.onerror = worker.onmessageerror = null;
    worker.terminate();
    if (next === 'done') health.succeeded(); else health.failed();
    state = next;
  };
  worker.onmessage = (event: MessageEvent<RidingPartsReply>) => {
    if (event.data?.kind === 'riding-part') seedRidingParts(event.data.wire);
    else if (event.data?.kind === 'riding-parts-done') stop('done');
  };
  worker.onerror = () => stop('idle');
  worker.onmessageerror = () => { /* one part's wire could not be read: that key builds in-line */ };
  const request: RidingPartsRequest = { order, have: ridingPartKeys() };
  worker.postMessage(request);
}
