/**
 * The host actor's thread for Node (P2 client lane): the core on an in-process port pair, so the headless sessions,
 * the receipts and `tools/mp-p2p-e2e.mjs` host exactly as a browser does, on the map's collision shard
 * (`server/world-collision-manifests`) or on the bare height field. Never imported by browser code (the Node collision loader).
 */
import { createDedicatedWorldCollision } from '../../../server/dedicatedWorldCollision.ts';
import { createHostPortPair } from './hostProtocol.ts';
import type { HostPort, HostToWorkerMessage, WorkerToHostMessage } from './hostProtocol.ts';
import { createMatchHostCore } from './matchHostCore.ts';
import type { MatchHostCore, MatchHostCoreOptions } from './matchHostCore.ts';

export interface InProcessHostOptions extends Omit<MatchHostCoreOptions, 'port' | 'buildWorld'> {
  /** 'dedicated' loads the map's collision shard (`server/world-collision-manifests`); 'terrain' the bare height field. */
  world?: 'dedicated' | 'terrain';
  onCore?: (core: MatchHostCore) => void;
}

/** A port factory for `createMatchHost` / `MatchSession`'s p2p options: every call runs a fresh core in this process. */
export function createInProcessHostPort({ world = 'dedicated', onCore, ...options }: InProcessHostOptions = {}): () => HostPort<HostToWorkerMessage, WorkerToHostMessage> {
  return () => {
    const pair = createHostPortPair<HostToWorkerMessage, WorkerToHostMessage>();
    const core = createMatchHostCore({
      port: pair.worker,
      buildWorld: async (config) => (world === 'dedicated' ? createDedicatedWorldCollision(config.mapId, { retain: true }) : 'terrain'),
      ...options,
    });
    onCore?.(core);
    return pair.main;
  };
}
