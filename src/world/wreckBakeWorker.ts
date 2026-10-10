import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { bakeTankWreck } from './wrecks.ts';
import { packWreckBake } from './wreckBakeWire.ts';
import type { WreckBakeRequest, WreckBakeReply } from './wreckBakeClient.ts';

declare const self: {
  onmessage: ((event: MessageEvent<WreckBakeRequest>) => void) | null;
  postMessage(reply: WreckBakeReply, transfer?: ArrayBuffer[]): void;
  addEventListener?(type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void): void;
};

const failureMessage = (error: unknown): string => (error instanceof Error ? error.message : 'Wreck bake failed');

// The request being baked, for a failure that escapes its handler.
let active = 0;

// (the wreck-worker lane, 2026-10-09) a rejection nobody handles in a worker fires no error event at the page's Worker:
// the client would only learn of it from its silence timeout. Report it as this request's failure instead (requestId 0
// when no request is in flight: the client fails whichever request it is waiting on).
self.addEventListener?.('unhandledrejection', (event) => {
  const requestId = active;
  active = 0;
  try {
    self.postMessage({ requestId, ok: false, message: `Wreck worker: ${failureMessage(event.reason)}` });
  } catch { /* the port is gone: the client's onerror or silence timeout still ends the request */ }
});

// The client serializes jobs and owns termination. Only the requested donor's
// family/calibration is loaded; no speculative full-fleet builder barrier.
self.onmessage = async ({ data }) => {
  active = data.requestId;
  try {
    await ensureTankBuilder(data.specId);
    const baked = bakeTankWreck({}, data.specId, data.options);
    if (!baked) {
      self.postMessage({ requestId: data.requestId, ok: true, wire: null });
      return;
    }
    try {
      const { wire, transfer } = packWreckBake(baked);
      self.postMessage({ requestId: data.requestId, ok: true, wire }, transfer);
    } finally {
      baked.geo.dispose();
      baked.shadowGeo?.dispose();
    }
  } catch (error) {
    try {
      self.postMessage({ requestId: data.requestId, ok: false, message: failureMessage(error) });
    } catch {
      // a reply that cannot be sent (its clone failed) still reports a plain failure
      self.postMessage({ requestId: data.requestId, ok: false, message: 'Wreck bake failed' });
    }
  } finally {
    if (active === data.requestId) active = 0;
  }
};
