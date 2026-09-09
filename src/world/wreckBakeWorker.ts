import { ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { bakeTankWreck } from './wrecks.ts';
import { packWreckBake } from './wreckBakeWire.ts';
import type { WreckBakeRequest, WreckBakeReply } from './wreckBakeClient.ts';

declare const self: {
  onmessage: ((event: MessageEvent<WreckBakeRequest>) => void) | null;
  postMessage(reply: WreckBakeReply, transfer?: ArrayBuffer[]): void;
};

// The client serializes jobs and owns termination. Only the requested donor's
// family/calibration is loaded; no speculative full-fleet builder barrier.
self.onmessage = async ({ data }) => {
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
    self.postMessage({ requestId: data.requestId, ok: false,
      message: error instanceof Error ? error.message : 'Wreck bake failed' });
  }
};
