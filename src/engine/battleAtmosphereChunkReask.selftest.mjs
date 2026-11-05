// battleAtmosphereChunkReask.selftest.mjs — the battle atmosphere's light model and cloudscape chunks are asked again by
// the next battle after a failure (2026-11-02 audit R6, round 2 U35 review). Copyright © 2026 Kevin B. Liu.
//
// The grounded light model (lightModelCore.ts loadGroundedLightModel, chunk lightModel.ts) and the maps' cloudscapes
// (cloudPresets.ts loadCloudscapeLayers, chunk cloudscapeLayer.ts) never reject: a failed chunk leaves the authored rig and
// the deck derivation, and its memo is cleared so the next call asks again. Their only product caller was the battle
// atmosphere runtime's first acquisition (battleAtmosphereAccess.ts), a lazy runtime owner that never loads again once it
// is ready: one failed transfer left every later battle's sky without them for the document. Now every prepare (one per
// battle entry) asks them again; a loaded one answers at once. A chunk "fails" the way a browser's import does when the
// network drops: its resolve throws.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const LIGHT = './lightModel.ts';
const CLOUDS = './cloudscapeLayer.ts';
const asked = new Map([[LIGHT, 0], [CLOUDS, 0]]);
const failing = new Map([[LIGHT, 1], [CLOUDS, 1]]);
const parentOf = new Map([[LIGHT, '/src/engine/lightModelCore.ts'], [CLOUDS, '/src/engine/cloudPresets.ts']]);
const data = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
// stand-ins that record their install (the real modules only refine the light and the layer)
const STUBS = new Map([
  [LIGHT, data('export function groundedLightModel() { globalThis.__cotGrounded = (globalThis.__cotGrounded ?? 0) + 1; return () => null; }')],
  [CLOUDS, data('export function cloudscapeLayer() { globalThis.__cotCloudscape = (globalThis.__cotCloudscape ?? 0) + 1; return (legacy) => legacy; }')],
]);
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (asked.has(specifier) && (context.parentURL ?? '').endsWith(parentOf.get(specifier))) {
      asked.set(specifier, asked.get(specifier) + 1);
      const left = failing.get(specifier);
      if (left > 0) {
        failing.set(specifier, left - 1);
        throw new TypeError(`Failed to fetch dynamically imported module: ${specifier}`);
      }
      return { url: STUBS.get(specifier), shortCircuit: true };
    }
    return next(specifier, context);
  },
});

try {
  const { createBattleAtmosphereAccess } = await import('./battleAtmosphereAccess.ts');
  let loads = 0, prepares = 0;
  const access = createBattleAtmosphereAccess(() => ({}), async () => {
    loads += 1;
    return { createBattleAtmosphereRuntime: () => ({ prepare() { prepares += 1; }, reset() {} }) };
  });
  const counts = () => `${asked.get(LIGHT)} light model, ${asked.get(CLOUDS)} cloudscape asks`;

  // the first battle: the runtime loads, the light model and the cloudscapes fail (the sky keeps its fallbacks)
  await access.prepare(1, 'fjord');
  assert.equal(loads, 1);
  assert.equal(prepares, 1, 'the battle is prepared without them');
  assert.equal(counts(), '1 light model, 1 cloudscape asks');
  assert.equal(globalThis.__cotGrounded ?? 0, 0);

  // the next battle asks them again and installs them
  await access.prepare(2, 'delta');
  assert.equal(counts(), '2 light model, 2 cloudscape asks',
    `the next battle asks the failed chunks again (${counts()}: the runtime owner had loaded, and nothing asked them again)`);
  assert.equal(globalThis.__cotGrounded, 1, 'the grounded light model is installed');
  assert.equal(globalThis.__cotCloudscape, 1, 'the cloudscape resolver is installed');
  assert.equal(loads, 1, 'the runtime is loaded once');
  assert.equal(prepares, 2);

  // loaded: later battles ask nothing
  await access.prepare(3, 'fjord');
  assert.equal(counts(), '2 light model, 2 cloudscape asks', 'a loaded chunk is never asked again');
} finally {
  hook.deregister();
}
console.log('battleAtmosphereChunkReask.selftest: OK (a failed light model or cloudscape chunk is asked again by the next battle)');
