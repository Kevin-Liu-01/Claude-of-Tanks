import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import coastal from './maps/coastal.ts';

// Exact c12e4bab inputs and contour/dressing laws for pre-existing immutable
// geometry and pixel receipts. Current banks, masks and support are exercised
// separately by shoreline, Polders, streaming, boat and jetty tests.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/shorelineContinuityOrigin.json', import.meta.url)));
for (const entry of Object.values(fixture.sources)) {
  assert.equal(createHash('sha256').update(entry.source).digest('hex'), entry.sha256);
}
const currentCoast = structuredClone({ lakes: coastal.terrain.lakes, marshes: coastal.terrain.marshes });
export function beforeShorelineContinuity(cfg) {
  if (cfg.id === 'coastal') {
    assert.deepEqual({ lakes: cfg.terrain.lakes, marshes: cfg.terrain.marshes }, currentCoast,
      'current Coastal authoring must match its canonical contour before historical projection');
    return { ...cfg, terrain: { ...cfg.terrain, ...structuredClone(fixture.coastal) } };
  }
  if (cfg.id === 'polders' && cfg.terrain.lakes[0]?.bankBand === 4) {
    return { ...cfg, terrain: { ...cfg.terrain, lakes: cfg.terrain.lakes.map((lake, index) => {
      if (index !== 0) return lake;
      const { bankBand: _laterDrainApron, ...prior } = lake;
      return prior;
    }) } };
  }
  return cfg;
}

/** Load a private historical world graph; production imports stay live. */
export async function loadShorelineHistory(moduleURL, rootSource) {
  const world = new URL('./', import.meta.url).href;
  const base = new URL(moduleURL); base.search = '';
  const suffix = '?shoreline-continuity-origin';
  const root = base.href + suffix;
  const hook = registerHooks({
    resolve(specifier, context, next) {
      const result = next(specifier, context);
      if (context.parentURL?.endsWith(suffix) && specifier.startsWith('.')
        && result.url.startsWith(world) && result.url.endsWith('.ts')) {
        return { ...result, url: result.url + suffix };
      }
      return result;
    },
    load(url, context, next) {
      if (!url.endsWith(suffix)) return next(url, context);
      const clean = url.slice(0, -suffix.length);
      const source = clean === base.href && rootSource !== undefined ? rootSource
        : fixture.sources[clean.slice(world.length)]?.source;
      return source === undefined ? next(url, context)
        : { format: 'module-typescript', source, shortCircuit: true };
    },
  });
  try { return await import(root); } finally { hook.deregister(); }
}
