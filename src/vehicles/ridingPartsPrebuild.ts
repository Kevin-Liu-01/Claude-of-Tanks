// The riding-parts prebuild (UI-LOCKDOWN E, 2026-10-25). A riding cradle or riding station is built once per option set
// and copied by every build after (ridingPartsCache.ts), but its first build is a 200-900 ms fit on the main thread, and
// almost every tank has its own. The first time the page asks for tanks' builders ahead of their builds (the Garage's
// neighbour pass after its first tank, a deploy intent, a battle's roster: fleetFactory.ensureTankBuilders), a worker
// builds every option set in the manifest, those tanks' first, and this seeds each into the cache as it arrives: a later
// build copies it. A build that needs a key not seeded yet builds it in-line, as before.
import type { RidingPartsReply, RidingPartsRequest } from './ridingPartsWorker.ts';
import { ridingPartKeys, seedRidingParts } from './ridingPartsWire.ts';

let started = false;

/** Start the prebuild once a session (later calls do nothing); `order` names the tanks to serve first. */
export function startRidingPartsPrebuild(order: readonly string[]): void {
  if (started || typeof Worker !== 'function') return;
  started = true;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./ridingPartsWorker.ts', import.meta.url), { type: 'module', name: 'cot-riding-parts' });
  } catch {
    return;
  }
  worker.onmessage = (event: MessageEvent<RidingPartsReply>) => {
    if (event.data?.kind === 'riding-part') seedRidingParts(event.data.wire);
    else if (event.data?.kind === 'riding-parts-done') worker.terminate();
  };
  worker.onerror = () => worker.terminate();
  const request: RidingPartsRequest = { order, have: ridingPartKeys() };
  worker.postMessage(request);
}
