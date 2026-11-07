// battleAtmosphereLanding.selftest.mjs — which sky parts a battle atmosphere prepare's landing holds
// (2026-11-02 audit R6, round 5 U8 review). Copyright © 2026 Kevin B. Liu.
//
// A Studio light apply (a prepare without `entry`) never waits on a sky part's re-ask (the grounded light model's,
// the cloudscapes'): the part still in flight is its prepare's `landing`, and once that lands the Studio lights the
// same light again with `{ relight: true }` (game/studioLightLanding.selftest.mjs). (round 5 U8) A relight applies
// its light again whatever was applied before (the runtime's reset, main.ts's restore of the Studio's plan), so a
// part installed by the time its light applies is no landing of it, though the part's chunk may still read 'loading'
// (its load installs it the moment before the chunk reads 'ready'); counted, it lit the Studio once more for nothing.
// That rule has two bounds, each held here:
// - a relight still counts a part that is not installed (cases 2 and 4): left out, the part lands and the Studio is
//   never lit with it (round 4's regression, for a relight);
// - a prepare that is no relight still counts an installed part whose chunk is loading (case 3): its runtime apply
//   may be kept (the runtime keeps a light it applied for the same battlefield, seed and time), so its light may
//   lack the part.
// In the product the install window is one microtask (app/lazyChunk.ts moves the state when the loader's promise
// settles, the turn after the install); a relight meets it because a landing in that turn starts it
// (studioLightLanding case 1). Here the window is held open: lightModelCore.ts importGroundedLightModel, the install
// the Node receipts call, installs the light model while the chunk's own re-ask hangs.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let clock = 1000;
performance.now = () => clock; // the lazy chunks' default clock
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });

const LIGHT = './lightModel.ts';
const CLOUDS = './cloudscapeLayer.ts';
const parentOf = new Map([[LIGHT, '/src/engine/lightModelCore.ts'], [CLOUDS, '/src/engine/cloudPresets.ts']]);
const asked = new Map([[LIGHT, 0], [CLOUDS, 0]]);
/** Per part: 'down' (the resolve throws), 'hang' (the module waits on that part's gate) or 'up'. */
const network = new Map([[LIGHT, 'down'], [CLOUDS, 'down']]);
const GATE = new Map([[LIGHT, '__cotLightGate'], [CLOUDS, '__cotCloudsGate']]);
// stand-ins that record their install; each ask its own URL, so a module that failed is never the one the next ask gets
const BODY = new Map([
  [LIGHT, 'export function groundedLightModel() { globalThis.__cotGrounded = (globalThis.__cotGrounded ?? 0) + 1;'
    + ' return () => null; }'],
  [CLOUDS, 'export function cloudscapeLayer() { globalThis.__cotCloudscape = (globalThis.__cotCloudscape ?? 0) + 1;'
    + ' return (legacy) => legacy; }'],
]);
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (asked.has(specifier) && (context.parentURL ?? '').endsWith(parentOf.get(specifier))) {
      const n = asked.get(specifier) + 1;
      asked.set(specifier, n);
      const mode = network.get(specifier);
      if (mode === 'down') throw new TypeError(`Failed to fetch dynamically imported module: ${specifier}`);
      const wait = mode === 'hang' ? `await globalThis.${GATE.get(specifier)};\n` : '';
      return { url: `data:text/javascript,${encodeURIComponent(`// ask ${n}\n${wait}${BODY.get(specifier)}`)}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
/** The part's next transfers hang until the returned function lets them arrive. */
const hold = (part) => {
  let open = () => {};
  globalThis[GATE.get(part)] = new Promise((resolve) => { open = resolve; });
  network.set(part, 'hang');
  return () => open();
};
const turns = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((resolve) => setImmediate(resolve)); };
const problems = [];

try {
  const { createBattleAtmosphereAccess } = await import('./battleAtmosphereAccess.ts');
  const { importGroundedLightModel } = await import('./lightModelCore.ts');
  const access = createBattleAtmosphereAccess(() => ({}), async () => ({
    createBattleAtmosphereRuntime: () => ({ prepare() {}, reset() {} }),
  }));
  const RELIGHT = Object.freeze({ relight: true });
  /** One Studio light apply as main.ts prepareStudioAtmosphere makes it (a relight with `{ relight: true }`). */
  const studio = (how) => access.prepare(0, 'fjord', ['day'], how);

  // ---- 0. a battle entered in an outage: its runtime loads and both parts fail. The network comes back for the
  // light model, whose transfer hangs; the cloudscapes fail again and stand failed inside their backoff (two failures
  // in a row: 2 s, and this clock stands still), so the light model is the one part in flight from here to case 3
  await access.prepare(1, 'fjord', undefined, { entry: true });
  const openLight = hold(LIGHT);
  await studio();
  await turns();
  assert.deepEqual([asked.get(LIGHT), asked.get(CLOUDS)], [2, 2], 'the Studio asked both parts again once');
  assert.equal(globalThis.__cotGrounded ?? 0, 0, 'nothing is installed yet');

  // ---- 1. a Studio apply while the light model's re-ask hangs: the part is its landing (the runtime is loaded, so the
  // part alone; studioLightLanding case 1 shows the Studio's first light reports it)
  const plain = await studio();
  if (!(plain?.landing instanceof Promise)) problems.push('a Studio apply lit without the light model in flight reported no landing (the part lands and nothing lights the Studio with it)');

  // ---- 2. a relight while the light model's re-ask hangs and it is not installed: the part is its landing too
  const relit = await studio(RELIGHT);
  if (!(relit?.landing instanceof Promise)) problems.push('a relight lit without the light model in flight (not installed) reported no landing (the part lands and the Studio is never lit with it)');

  // ---- 3. held open: the light model installed while its chunk's own re-ask hangs (the chunk reads 'loading')
  network.set(LIGHT, 'up');
  await importGroundedLightModel();
  assert.equal(globalThis.__cotGrounded, 1, 'the light model is installed');
  assert.equal(asked.get(LIGHT), 3, 'the install asked its own transfer');
  // a relight's light is applied with the installed part: no landing (nothing else is in flight)
  const relitInstalled = await studio(RELIGHT);
  if (relitInstalled?.landing !== null) problems.push('a relight counted a part installed before its light applied (its chunk still loading) as its landing (the Studio is lit once more for nothing)');
  // a prepare that is no relight keeps it: its runtime apply may be kept, so its light may lack the part
  const plainInstalled = await studio();
  if (!(plainInstalled?.landing instanceof Promise)) problems.push('a Studio apply that is no relight left out an installed part whose chunk was loading (its runtime may have kept a light without it, and nothing lights it again)');
  // the chunk's own transfer lands: the latest landing is true, the ones the later prepares replaced false
  openLight();
  if (plainInstalled?.landing instanceof Promise) assert.equal(await plainInstalled.landing, true, 'the latest landing is true once the part lands');
  if (plain?.landing instanceof Promise) assert.equal(await plain.landing, false, 'a later prepare makes an earlier landing false');
  if (relit?.landing instanceof Promise) assert.equal(await relit.landing, false);
  assert.equal(globalThis.__cotGrounded, 2, 'the chunk installed its own transfer');

  // ---- 4. the cloudscapes, past their backoff: asked again, their transfer hangs, and a relight made while they are
  // not installed holds them as its landing, true once they land
  clock += 2000;
  const openClouds = hold(CLOUDS);
  const relitClouds = await studio(RELIGHT);
  assert.equal(asked.get(CLOUDS), 3, 'past the backoff the cloudscapes are asked again');
  assert.equal(globalThis.__cotCloudscape ?? 0, 0);
  if (!(relitClouds?.landing instanceof Promise)) {
    problems.push('a relight lit without the cloudscapes in flight (not installed) reported no landing (they land and the Studio is never lit with them)');
  } else {
    openClouds();
    assert.equal(await relitClouds.landing, true, 'the relight\'s landing is true once the cloudscapes land');
    assert.equal(globalThis.__cotCloudscape, 1);
  }
} finally {
  hook.deregister();
}
assert.deepEqual(problems, [], `a battle atmosphere prepare's landing:\n  ${problems.join('\n  ')}`);
console.log('battleAtmosphereLanding.selftest: OK (a sky part in flight is a prepare\'s landing, a relight\'s too while it is not installed; a relight leaves out a part installed before its light applied, and a prepare that is no relight keeps it)');
