// src/world/maps/fractureWreckWorker.ts — (the destructible-kits lane, 2026-10-11) the settled wrecks built off the page's
// thread (fractureWreckJob.ts): one job per message, the geometry transferred back (fractureWreckWire.ts). The client
// (fractureWreckClient.ts) sends one job at a time and owns termination. The worker realm starts with an empty intact
// cache (fortKit.ts keptIntact), so a pillbox's wreck builds its intact work first: the same pieces the page built.
import type * as THREE from 'three';
import { buildShedWreck } from './shedKit.ts';
import { buildPillbox } from './fortKit.ts';
import { packFractureWreck } from './fractureWreckWire.ts';
import type { FractureWreckJob } from './fractureWreckJob.ts';
import type { FractureWreckReply, FractureWreckRequest } from './fractureWreckClient.ts';

declare const self: {
  onmessage: ((event: MessageEvent<FractureWreckRequest>) => void) | null;
  postMessage(reply: FractureWreckReply, transfer?: ArrayBuffer[]): void;
};

/** The job's own builder: the one its deferred wreck runs on the page (structureKit.ts shedMeta, props.ts the pillbox). */
function buildFractureWreck(job: FractureWreckJob): THREE.BufferGeometry {
  return job.kit === 'shed'
    ? buildShedWreck(job.kind, job.style, job.seed, job.salt)
    : buildPillbox(job.style, job.tones, job.seed, true);
}

self.onmessage = ({ data }) => {
  try {
    const geometry = buildFractureWreck(data.job);
    try {
      const { wire, transfer } = packFractureWreck(geometry);
      self.postMessage({ requestId: data.requestId, ok: true, wire }, transfer);
    } finally {
      geometry.dispose();
    }
  } catch (error) {
    self.postMessage({ requestId: data.requestId, ok: false, message: error instanceof Error ? error.message : 'Fracture wreck failed' });
  }
};
