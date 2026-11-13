// battleAtmosphereChunkReask.selftest.mjs — the battle atmosphere's light model and cloudscape chunks are asked again by
// the next battle after a failure, under the one lazy-chunk policy, never per Studio light apply (2026-11-02 audit R6,
// round 2 U35 review; round 3 A4). Copyright © 2026 Kevin B. Liu.
//
// The grounded light model (battleAtmosphereAccess.ts loadGroundedLightModel over lightModelCore.ts
// importGroundedLightModel, chunk lightModel.ts) and the maps' cloudscapes (cloudPresets.ts loadCloudscapeLayers, chunk
// cloudscapeLayer.ts) never reject: a failed chunk leaves the authored rig and the deck derivation. Their only product
// caller was the battle atmosphere runtime's first acquisition, a lazy runtime owner that never loads again once it is
// ready: one failed transfer left every later battle's sky without them for the document (round 2). So every prepare asks
// them again; but the Studio prepares once per sun-dial or slider move (studio.ts applyStudioLight -> main.ts
// prepareStudioAtmosphere -> prepare(0, map, ['day'])), and their memos were cleared on a failure and asked again at once
// by every call: a drag after one failure asked both chunks once per move, offline too (round 3 A4). Both are held in
// app/lazyChunk.ts now: asked again at once after one failure, then past the backoff, never offline. (round 4 F2) A battle
// entry passes `{ entry: true }` (main.ts's solo and network entries), as these battles do: it asks at once whatever the
// backoff (battleAtmosphereEntryAsk.selftest.mjs). A chunk "fails" the way a browser's import does when the network
// drops: its resolve throws.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let clock = 1000;
performance.now = () => clock; // the lazy chunks' default clock
let onLine = true;
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
Object.defineProperty(globalThis.navigator, 'onLine', { get: () => onLine, configurable: true });

const LIGHT = './lightModel.ts';
const CLOUDS = './cloudscapeLayer.ts';
const asked = new Map([[LIGHT, 0], [CLOUDS, 0]]);
let networkUp = false;
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
      if (!networkUp) throw new TypeError(`Failed to fetch dynamically imported module: ${specifier}`);
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
  const ENTRY = { entry: true };
  /** The Studio's sun dial: one prepare per move, as main.ts prepareStudioAtmosphere makes it. */
  const drag = async (moves) => { for (let i = 0; i < moves; i++) await access.prepare(0, 'fjord', ['day']); };

  // the first battle: the runtime loads, the light model and the cloudscapes fail (the sky keeps its fallbacks)
  await access.prepare(1, 'fjord', undefined, ENTRY);
  assert.equal(loads, 1);
  assert.equal(prepares, 1, 'the battle is prepared without them');
  assert.equal(counts(), '1 light model, 1 cloudscape asks');
  assert.equal(globalThis.__cotGrounded ?? 0, 0);

  // 1. a Studio sun-dial drag: asked again at once after the one failure, then held by the backoff (2 s)
  await drag(40);
  assert.equal(prepares, 41, 'every move is prepared');
  assert.equal(counts(), '2 light model, 2 cloudscape asks',
    `forty dial moves ask each chunk once more, then wait for the backoff (${counts()}: the memos cleared on failure were `
    + 'asked again by every move)');

  // 2. offline: no move asks, however long since the last failure
  onLine = false;
  clock += 60_000;
  await drag(20);
  assert.equal(counts(), '2 light model, 2 cloudscape asks', `no ask while the browser is offline (${counts()})`);

  // 3. online again: the next battle's entry asks them again at once, whatever the backoff, and installs them
  onLine = true;
  networkUp = true;
  await access.prepare(2, 'delta', undefined, ENTRY);
  assert.equal(counts(), '3 light model, 3 cloudscape asks',
    `the next battle asks the failed chunks again (${counts()}: the runtime owner had loaded, and nothing asked them again)`);
  assert.equal(globalThis.__cotGrounded, 1, 'the grounded light model is installed');
  assert.equal(globalThis.__cotCloudscape, 1, 'the cloudscape resolver is installed');
  assert.equal(loads, 1, 'the runtime is loaded once');
  assert.equal(prepares, 62);

  // loaded: later battles and dial moves ask nothing
  await access.prepare(3, 'fjord', undefined, ENTRY);
  await drag(10);
  assert.equal(counts(), '3 light model, 3 cloudscape asks', 'a loaded chunk is never asked again');
} finally {
  hook.deregister();
}
console.log('battleAtmosphereChunkReask.selftest: OK (a failed light model or cloudscape chunk is asked again by the next battle, under the lazy-chunk policy: never per Studio dial move, never offline)');
