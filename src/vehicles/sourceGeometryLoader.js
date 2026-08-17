// Owner-source geometry is intentionally loaded on demand.  These generated
// modules contain multi-megabyte base64 payloads; statically importing them
// made every visitor download, parse and expand every source tank before the
// garage could open.  The normal builders remain synchronous by reading this
// tiny cache.  Garage/battle orchestration preloads the relevant ids before
// calling createTank; direct/tooling callers retain each tank's detailed
// procedural fallback until the source chunk is ready.

const SOURCES = Object.freeze({
  amx40: {
    load: () => import('./profiles/amx40-source-geometry.js'),
    pick: (m) => m.buildAMX40SourceGeometry,
  },
  fv510: {
    load: () => import('./profiles/fv510-source-geometry.js'),
    pick: (m) => m.buildFv510SourceGeometry,
  },
  k1a1: {
    load: () => import('./profiles/k1a1-source-geometry.js'),
    pick: (m) => m.buildK1A1SourceGeometry,
  },
  leo2_revolution: {
    load: () => import('./profiles/leopard-revolution-source-geometry.js'),
    pick: (m) => m.buildLeopardRevolutionSourceUpper,
  },
  leo2a4: {
    load: () => import('./profiles/leopard2a4-source-geometry.js'),
    pick: (m) => m.buildLeopard2A4SourceGeometry,
  },
  leo2a7v: {
    load: () => import('./profiles/leopard2a7-source-geometry.js'),
    pick: (m) => m.replaceLeopard2A7SourceUpper,
  },
  t14: {
    load: () => import('./profiles/t14-source-geometry.js'),
    pick: (m) => m.buildT14SourceGeometry,
  },
  type10: {
    load: () => import('./profiles/type10-source-geometry.js'),
    pick: (m) => m.buildType10SourceGeometry,
  },
  type99a: {
    load: () => import('./profiles/type99a-source-geometry.js'),
    pick: (m) => m.buildType99ASourceGeometry,
  },
});

const loaded = new Map();
const pending = new Map();

/** Return a synchronously usable source builder, or null until preloaded. */
export function getLoadedSourceGeometry(specId) {
  return loaded.get(specId) || null;
}

export function hasSourceGeometry(specId) {
  return !!SOURCES[specId];
}

async function loadOne(specId) {
  if (!SOURCES[specId]) return false;
  if (loaded.has(specId)) return true;
  if (pending.has(specId)) return pending.get(specId);

  const source = SOURCES[specId];
  const job = source.load()
    .then((module) => {
      const builder = source.pick(module);
      if (typeof builder !== 'function') {
        throw new TypeError(`Missing generated source builder for ${specId}`);
      }
      loaded.set(specId, builder);
      return true;
    })
    .catch((error) => {
      // A failed chunk must remain retryable.  The procedural fallback keeps
      // the game usable now; a later selection/rematch gets another attempt.
      console.warn(`[source-geometry] ${specId} lazy load failed; using procedural fallback`, error);
      return false;
    })
    .finally(() => pending.delete(specId));
  pending.set(specId, job);
  return job;
}

/**
 * Fetch/evaluate only source-exact tanks that are about to be constructed.
 * Loads run in parallel and failures resolve false instead of trapping the
 * player on a loading screen; every mapped tank has a procedural fallback.
 */
export async function preloadTankSourceGeometry(specIds) {
  const ids = Array.isArray(specIds) ? specIds : [specIds];
  const wanted = [...new Set(ids)].filter((id) => SOURCES[id] && !loaded.has(id));
  if (!wanted.length) return { requested: 0, loaded: 0, failed: [] };

  const results = await Promise.all(wanted.map(async (id) => [id, await loadOne(id)]));
  return {
    requested: wanted.length,
    loaded: results.filter(([, ok]) => ok).length,
    failed: results.filter(([, ok]) => !ok).map(([id]) => id),
  };
}

/** Lightweight diagnostics for boot/perf probes. */
export function sourceGeometryLoadState() {
  return {
    available: Object.keys(SOURCES),
    loaded: [...loaded.keys()],
    pending: [...pending.keys()],
  };
}
