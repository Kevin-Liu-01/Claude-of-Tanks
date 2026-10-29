// One shared game core, two thin drivers (the owner, 2026-10-29: "lets do this please"; docs/ARCHITECTURE.md "One core,
// two drivers"). The core (src/sim, the bots, the world's collision and kernels) imports no driver code; a local battle
// (solo, campaign, Proving Ground, Watch, replays, the Jev opponent) runs the core on the page and never reaches the
// online driver (src/mp, the room host's actor); main.ts names the online driver only where it composes it, and its local
// battle entries name none of it. The third rule, the same step on both drivers, is src/sim/driverStepParity.selftest.mjs.
// Each check runs on the tree, then on a seeded violation that it must catch (tools/driver-boundaries.mjs).
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { checkoutReader, coreViolations, localDriverViolations, mainDriverViolations } from './driver-boundaries.mjs';

/**
 * Render-side modules the core reached when the rule was written (2026-10-29): world/terrain.ts's water, horizon and sourced
 * texture builders, the map catalog's i18n and the flag codes. Node-safe (every core receipt imports them in Node) but not
 * simulation; the world lane owns their split. Shrink-only: a module the core stops reaching must leave this list.
 */
const CORE_RENDER_PIN = Object.freeze([
  'src/engine/atmosphere.ts', 'src/engine/cloudscapes.ts', 'src/engine/frameScheduler.ts', 'src/engine/fullscreenProgramWarm.ts',
  'src/engine/groundBounce.ts', 'src/engine/lightModel.ts', 'src/engine/lightModelCore.ts', 'src/engine/marsAtmosphere.ts',
  'src/engine/quality.ts', 'src/engine/resourceLifetime.ts', 'src/engine/simplexFast.ts',
  'src/ui/flagCodes.ts', 'src/ui/i18n.ts', 'src/ui/i18nCatalogEnUS.ts', 'src/ui/i18nCatalogZhCN.ts', 'src/ui/i18nChunkImport.ts',
  'src/ui/i18nDictionaries.ts', 'src/ui/i18nPseudo.ts', 'src/ui/localeRouting.ts',
  'src/world/edgeWater.ts', 'src/world/horizonAutumnGround.ts', 'src/world/horizonRingFinish.ts', 'src/world/horizonSeam.ts',
  'src/world/oceanFft.ts', 'src/world/proceduralTexture.ts', 'src/world/shallowWater.ts', 'src/world/sourcedBuildingDataSource.ts',
  'src/world/sourcedTextureCompositionClient.ts', 'src/world/sourcedTextureCompositionWorker.ts', 'src/world/sourcedTextures.ts',
  'src/world/terrain.ts', 'src/world/waterRipples.ts',
]);

// ---- (a) the core imports no driver code ----------------------------------------------------------------------------
const read = checkoutReader();
const core = coreViolations({ read, pinned: CORE_RENDER_PIN });
assert.deepEqual(core.violations, [], `the core reaches what it must not:\n${core.violations.join('\n')}`);
assert.ok(core.closure.has('src/sim/authoritativeMatch.ts') && core.closure.has('src/game/ai.ts') && core.closure.has('src/world/collision.ts'),
  'the core is the simulation, the bots and the world\'s collision');
// seeded: a sim module importing the wire, a bot brain the battle presentation, a core module a browser global and a mesh
{
  const seeded = coreViolations({ pinned: CORE_RENDER_PIN,
    extraEdges: { 'src/sim/movement.ts': [{ to: 'src/mp/wire/codec.ts', kind: 'static' }], 'src/game/ai.ts': [{ to: 'src/game/battlePresentationRuntime.ts', kind: 'lazy' }] },
    read: checkoutReader(process.cwd(), {
      'src/sim/detMath.ts': `${read('src/sim/detMath.ts')}\nexport const pageTitle = (): string => document.title;\n`,
      'src/sim/ballistics.ts': `import { Mesh } from 'three';\n${read('src/sim/ballistics.ts')}\nexport const tracer = () => new Mesh();\n`,
    }) });
  const caught = (pattern) => seeded.violations.some((violation) => pattern.test(violation));
  assert.ok(caught(/driver code in the core: .*src\/sim\/movement\.ts -> src\/mp\/wire\/codec\.ts \(static\)$/), 'a sim module importing the wire is caught');
  assert.ok(caught(/src\/game outside the core's bots: .*src\/game\/battlePresentationRuntime\.ts/), 'a bot brain reaching the battle presentation is caught');
  assert.ok(caught(/render-side reach outside the pin \(dom:document\): .*src\/sim\/detMath\.ts/), 'a browser global in the core is caught');
  assert.ok(caught(/render-side reach outside the pin \(three:Mesh\): .*src\/sim\/ballistics\.ts/), 'a three.js scene object in the core is caught');
  const stale = coreViolations({ read, pinned: [...CORE_RENDER_PIN, 'src/engine/renderer.ts'] });
  assert.ok(stale.violations.some((violation) => /no longer reached \(unpin it\): src\/engine\/renderer\.ts/.test(violation)), 'the pin only shrinks');
}

// ---- (b) the local driver never reaches the online driver ------------------------------------------------------------
const local = localDriverViolations({ read });
assert.deepEqual(local.violations, [], `the local driver reaches the online driver:\n${local.violations.join('\n')}`);
assert.ok(local.closure.has('src/game/state.ts') && local.closure.has('src/sim/movement.ts'), 'a local battle steps the core on the page');
// seeded: a local battle's entry loading the match client lazily, a Worker entry into the host, and main.ts routing a
// local battle into the online composition (release 261's solo sim Worker and 255's solo host were both this)
{
  const seeded = localDriverViolations({
    extraEdges: {
      'src/game/soloBattleEntryRuntime.ts': [{ to: 'src/mp/match/matchClient.ts', kind: 'lazy' }],
      'src/game/state.ts': [{ to: 'src/mp/host/matchHostWorker.ts', kind: 'worker' }],
    },
    read });
  const caught = (pattern) => seeded.violations.some((violation) => pattern.test(violation));
  assert.ok(caught(/src\/game\/soloBattleEntryRuntime\.ts -> src\/mp\/match\/matchClient\.ts \(lazy\)/), 'a lazy match client in a local battle is caught');
  assert.ok(caught(/src\/game\/state\.ts -> src\/mp\/host\/matchHostWorker\.ts \(worker\)/), 'a host Worker in a local battle is caught');
  const main = read('src/main.ts');
  const routed = main.replace(/(\nfunction beginLocalBattle\([\s\S]*?\}: SoloBattleEntryRequest = \{\}\) \{\n)/, '$1  void onlineMatch.preload();\n');
  assert.notEqual(routed, main, 'the seed found beginLocalBattle');
  const routedViolations = mainDriverViolations({ read: checkoutReader(process.cwd(), { 'src/main.ts': routed }) });
  assert.ok(routedViolations.some((violation) => /the local entry beginLocalBattle names the online driver \(onlineMatch/.test(violation)),
    `a local battle routed into the online composition is caught (${routedViolations.join('; ')})`);
  const stray = `${main}\nconst soloOverRoom = () => import('./mp/session/playMode.ts');\nvoid soloOverRoom;\n`;
  const strayViolations = mainDriverViolations({ read: checkoutReader(process.cwd(), { 'src/main.ts': stray }) });
  assert.ok(strayViolations.some((violation) => /soloOverRoom names the online driver \(import\('\.\/mp\/session\/playMode\.ts'\)/.test(violation)),
    `an online import outside the online composition is caught (${strayViolations.join('; ')})`);
}

console.log(`driver-boundaries.selftest: the core (${core.closure.size} modules) imports no driver code (${CORE_RENDER_PIN.length} pinned `
  + `render-side modules, shrink-only); the local driver (${local.closure.size} modules) never reaches src/mp or the room host; `
  + 'main.ts names the online driver only where it composes it; 8 seeded violations caught');
