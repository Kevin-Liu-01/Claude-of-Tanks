/**
 * The local Worker driver's Worker (localSimCore.ts on the Worker's own message port; docs/ARCHITECTURE.md "One core, two
 * drivers"). A lazy chunk of its own, loaded only under ?localDriver=worker: the step, the fleet and the battlefield's
 * collision world (the served manifests, world/collisionWorldLoad.ts) on the world kernels (world/soloWorldKernels.ts).
 */
import { COLLISION_MANIFEST_ROUTE, loadCollisionWorld } from '../world/collisionWorldLoad.ts';
import { loadSoloWorldKernels } from '../world/soloWorldKernels.ts';
import { createLocalSimCore, type LocalSimPort } from './localSimCore.ts';
import type { LocalSimBoot, LocalSimToPage, PageToLocalSim } from './localSimProtocol.ts';

type WorkerScope = {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
};

function workerScopePort(scope: WorkerScope): LocalSimPort {
  return {
    post(message: LocalSimToPage, transfer?: Transferable[]) { scope.postMessage(message, transfer ?? []); },
    onMessage(listener) {
      const handler = (event: { data: unknown }) => listener(event.data as PageToLocalSim);
      scope.addEventListener('message', handler);
      return () => scope.removeEventListener('message', handler);
    },
  };
}

/** Each battlefield once a thread (a battle resets its ground and its buildings as it seats; game/state.ts setupBattle). */
const worlds = new Map<string, ReturnType<typeof loadCollisionWorld>>();
function buildWorld(boot: LocalSimBoot) {
  const key = `${boot.mapId}|${boot.variant ?? ''}|${boot.manifestBase}`;
  let world = worlds.get(key);
  if (!world) {
    world = loadCollisionWorld(boot.mapId, boot.manifestBase || COLLISION_MANIFEST_ROUTE, { variant: boot.variant });
    world.catch(() => worlds.delete(key));
    worlds.set(key, world);
  }
  return world as Promise<never>;
}

let kernels: ReturnType<typeof loadSoloWorldKernels> | null = null;

const scope = globalThis as unknown as WorkerScope & { document?: unknown };
if (typeof scope.postMessage === 'function' && typeof scope.document === 'undefined') {
  createLocalSimCore({
    port: workerScopePort(scope),
    buildWorld,
    loadKernels: () => (kernels ??= loadSoloWorldKernels(false)),
  });
}
