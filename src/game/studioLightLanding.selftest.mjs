// studioLightLanding.selftest.mjs — the Studio's light is lit again once a chunk it was applied without lands
// (2026-11-02 audit R6, round 4 F2 review). Copyright © 2026 Kevin B. Liu.
//
// A Studio light apply (studio.ts applyStudioLight, the entry's and a battlefield change's prepareAtmosphere -> main.ts
// prepareStudioAtmosphere) waits on a chunk's first ask but never on a re-ask after a failure (round 4 F2: a re-ask's
// transfer may hang until the browser gives up, and the Studio's light and its busy 'light' hold waited on it). That left
// a regression: after a battle entry failed the grounded light model and the cloudscapes in an outage, with the network
// back, the Studio's first apply started their re-ask and lit at once with the authored rig and deck-only clouds; the parts
// landed a moment later and nothing lit the Studio again until the player moved a dial (base awaited the fast re-ask and
// was lit). The same for the atmosphere runtime's re-ask and the map's air. Now what an apply lit without is its prepare's
// landing (battleAtmosphereAccess.ts, mapAmbienceAccess.ts), and once it lands the Studio lights the same light again
// through its own guarded change (an uncovered applyStudioLight with `relight`: the battle runtime and the Studio's plan
// apply again, where both keep a light they already applied), only in the session that asked and never inside a take.
//
// This runs studio.ts's own prepareAtmosphere, applyStudioLight and busy (read from the source) over main.ts's own
// prepareStudioAtmosphere and restoreStudioAtmosphere (read from main.ts), the real battle atmosphere access and runtime,
// the real Studio light runtime and the real map-air access. A chunk "fails" the way a browser's import does when the
// network drops (its resolve or loader throws) and "hangs" the way a slow transfer does (it arrives when the test lets it).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import ts from 'typescript-compiler-api';
import * as THREE from 'three';

let clock = 1000;
performance.now = () => clock; // the lazy chunks' default clock
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });

// ---- the sky's two parts: stand-ins that record their install; 'down' (the resolve throws), 'hang' (the module waits on
// a gate this test opens) or 'up'
const LIGHT = './lightModel.ts';
const CLOUDS = './cloudscapeLayer.ts';
const parentOf = new Map([[LIGHT, '/src/engine/lightModelCore.ts'], [CLOUDS, '/src/engine/cloudPresets.ts']]);
const BODY = new Map([
  [LIGHT, 'export function groundedLightModel() { globalThis.__cotGrounded = (globalThis.__cotGrounded ?? 0) + 1; return () => null; }'],
  [CLOUDS, 'export function cloudscapeLayer() { globalThis.__cotCloudscape = (globalThis.__cotCloudscape ?? 0) + 1; return (legacy) => legacy; }'],
]);
let partsNetwork = 'down', partsAsked = 0;
let openParts = () => {};
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (parentOf.has(specifier) && (context.parentURL ?? '').endsWith(parentOf.get(specifier))) {
      partsAsked += 1;
      if (partsNetwork === 'down') throw new TypeError(`Failed to fetch dynamically imported module: ${specifier}`);
      const wait = partsNetwork === 'hang' ? 'await globalThis.__cotPartsGate;\n' : '';
      return { url: `data:text/javascript,${encodeURIComponent(`// ask ${partsAsked}\n${wait}${BODY.get(specifier)}`)}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const lit = () => `${globalThis.__cotGrounded ?? 0}/${globalThis.__cotCloudscape ?? 0}`;
const turns = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((resolve) => setImmediate(resolve)); };
const track = (promise) => {
  const step = { settled: false };
  promise.then(() => { step.settled = true; }, () => { step.settled = true; });
  return step;
};

// ---- studio.ts's own light functions, over the session's real holders
const studioText = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
const studioSource = ts.createSourceFile('studio.ts', studioText, ts.ScriptTarget.Latest, true);
const STUDIO_FUNCTIONS = ['prepareAtmosphere', 'applyStudioLight', 'busy', 'busyFlags'];
const found = new Map();
(function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name && STUDIO_FUNCTIONS.includes(node.name.text) && !found.has(node.name.text)) {
    found.set(node.name.text, node.getText(studioSource));
  }
  ts.forEachChild(node, visit);
})(studioSource);
for (const name of STUDIO_FUNCTIONS) assert.ok(found.has(name), `studio.ts declares ${name}`);
// ---- main.ts's own preparation and restore
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const property = (from, to) => {
  const start = main.indexOf(from);
  assert.ok(start > 0, `main.ts declares ${from}`);
  return main.slice(start, main.indexOf(to, start));
};
const preparation = property('prepareStudioAtmosphere: async (', 'setAmbienceEnabled:');
const restore = property('restoreStudioAtmosphere: () => {', 'getStudioLight:');

const { createStudioSession, createSessionHolder, studioBusy, transportHeld, StudioSessionEnded } = await import('./studioSession.ts');
const { createStudioLightRuntime } = await import('./studioLightRuntime.ts');
const { createBattleAtmosphereAccess } = await import('../engine/battleAtmosphereAccess.ts');
const { createMapAmbienceAccess } = await import('../world/mapAmbienceAccess.ts');

const AUTHORED = Object.freeze({
  sunElevationDeg: 32, sunAzimuthDeg: 115, turbidity: 4, rayleigh: 1.2, mieCoefficient: 0.006, mieDirectionalG: 0.82,
  fogDensity: 0.00074, fogTintHex: 0x7e97b8, fogMix: 0.55, envIntensity: 0.2, cloudOpacity: 1, cloudOpacity2: 0.6,
  cloudTintHex: 0xffffff, sunIntensity: 4.5, sunColorHex: 0xfff1dc, hemiIntensity: 0.32,
});

/**
 * One Studio over one battlefield: the real battle atmosphere access (its runtime loaded through `loadRuntime`, else the
 * real module), the real Studio light runtime, the real map-air access (through `loadAir`); `applied` records each light
 * the battlefield takes (the battle runtime's or the Studio plan's) with the parts installed when it took it.
 */
function makeStudio({ loadRuntime, loadAir } = {}) {
  const applied = [];
  const world = { mapId: 'verdant', group: new THREE.Group(), config: { sky: { ...AUTHORED } } };
  const scene = new THREE.Scene();
  scene.userData.sunDirWorld = new THREE.Vector3(0.3, 0.5, -0.2).normalize();
  const battleAtmosphere = createBattleAtmosphereAccess(() => ({
    getAuthoredPreset: () => ({ ...AUTHORED }), getWorldRoot: () => world.group,
    applyPreset: () => applied.push(`battle ${lit()}`),
  }), loadRuntime);
  const airRuntime = { prepared: [], setEnabled() {}, setDensityOverride() {}, refreshTier() {}, reset() {}, isActive: () => false };
  airRuntime.prepare = (seed, mapId, time) => airRuntime.prepared.push(time);
  const mapAmbience = createMapAmbienceAccess(() => ({}), loadAir ?? (async () => ({ createMapAmbience: () => airRuntime })));
  const light = createStudioLightRuntime({
    scene, getWorld: () => world, cloudIdentity: () => ({ offset: [0, 0], windDirRad: 0 }),
    applySky: () => applied.push(`studio ${lit()}`),
  });
  const mainPorts = {
    battleAtmosphere, mapAmbience, currentWorld: () => world, game: { mapId: 'verdant' },
    studioLightRuntime: { load: async () => light }, studioLightLive: light,
  };
  const ctx = new Function('ports', `${stripTypeScriptTypes(`
    function makeMainContext(ports) {
    const { battleAtmosphere, currentWorld, game, mapAmbience } = ports;
    // main.ts's own (the light runtime's chunk is loaded)
    let studioLightRuntime = ports.studioLightRuntime, studioLightLive = ports.studioLightLive;
    let battleWatchdogRadianceScale = 1, baseFogDensity = 0;
    return { ${preparation} ${restore} };
    }
  `)}\nreturn makeMainContext(ports);`)(mainPorts);
  const ports = {
    ctx, session: createStudioSession(), createSessionHolder, studioBusy, transportHeld, StudioSessionEnded, t: (key) => key,
    transition: { run: async (work) => work(() => {}) }, lighting: { updateFrustums() {}, update() {} },
    panel: { refreshMap() {} }, invalidate() {},
  };
  const studio = new Function('ports', `${stripTypeScriptTypes(`
    function makeStudioHarness(ports) {
    const { ${Object.keys(ports).join(', ')} } = ports;
    const sceneLoad = createSessionHolder(), staging = createSessionHolder(), historyRestore = createSessionHolder();
    const relighting = createSessionHolder();
    let recording = null, filming = false, filmExport = null, mapChange = null, timeOfDay = 'day', studioLight = null;
    ${[...found.values()].join('\n')}
    session.open(session.beginEntry());
    return {
      session, busy: () => busy(),
      // the entry's light (studio.ts doEnter: prepareAtmosphere(timeOfDay, studioLight)) and a time-of-day change
      enterLight: (time) => { timeOfDay = time; return prepareAtmosphere(time, null); },
      setTime: (time) => applyStudioLight(time, null, true),
      get timeOfDay() { return timeOfDay; }, set recording(value) { recording = value; },
    };
    }
  `)}\nreturn makeStudioHarness(ports);`)(ports);
  return { studio, ctx, applied, battleAtmosphere, mapAmbience, airRuntime };
}
const ENTRY = Object.freeze({ entry: true });
const problems = [];

try {
  // ---- 1. a battle entry fails the light model and the cloudscapes in an outage; the network comes back (their next
  // transfers arrive a moment after they are asked); the player opens the Studio at golden hour. Its first light starts
  // the re-ask and must not wait on it, and once the parts land the Studio's light must be lit by them with no dial move
  {
    const h = makeStudio();
    await h.battleAtmosphere.prepare(1, 'verdant', undefined, ENTRY);
    assert.equal(partsAsked, 2, 'the entry asked both parts');
    assert.deepEqual(h.applied, ['battle 0/0'], 'the battle is lit without them');
    partsNetwork = 'hang';
    globalThis.__cotPartsGate = new Promise((resolve) => { openParts = resolve; });
    const entered = track(h.studio.enterLight('golden'));
    await turns();
    assert.equal(partsAsked, 4, 'the Studio\'s first light asks both parts again at once');
    if (!entered.settled) problems.push('the Studio\'s first light waited on the parts\' re-ask (a hung transfer holds it)');
    openParts(); // the transfers arrive
    await turns();
    if (!entered.settled) problems.push('the Studio\'s first light was still waiting after the parts landed');
    assert.equal(lit(), '1/1', 'the parts are installed');
    if (h.applied.at(-1) !== 'studio 1/1') {
      problems.push(`once the parts landed the Studio kept the light it had without them, with no dial move (its lights: ${h.applied.join(', ')})`);
    }
    // nothing is left in flight: the Studio's next lights ask nothing and light with the parts
    const asked = partsAsked;
    await h.studio.setTime('dusk');
    assert.equal(partsAsked, asked);
    assert.equal(h.applied.at(-1), 'studio 1/1');
  }

  // ---- 2. the atmosphere runtime's re-ask: after a battle entry failed it, the Studio's authored-day light (the battle
  // runtime's own: the Studio's plan applies nothing over the authored day) neither waits on its hung re-ask nor fails;
  // once it lands, the battle runtime lights the Studio
  {
    let mode = 'down', arrive = () => {};
    const gate = new Promise((resolve) => { arrive = resolve; });
    const h = makeStudio({
      loadRuntime: async () => {
        if (mode === 'down') throw new TypeError('Failed to fetch dynamically imported module: ./battleAtmosphereRuntime.ts');
        await gate;
        return import('../engine/battleAtmosphereRuntime.ts');
      },
    });
    await assert.rejects(h.battleAtmosphere.prepare(1, 'verdant', undefined, ENTRY), /dynamically imported module/);
    mode = 'hang';
    const entered = track(h.studio.enterLight('day'));
    await turns();
    if (!entered.settled) problems.push('the Studio\'s first light waited on the atmosphere runtime\'s hung re-ask');
    assert.deepEqual(h.applied, [], 'no light is applied while the runtime is in flight (the Studio\'s own sky stands)');
    arrive();
    await turns();
    if (h.applied.at(-1) !== 'battle 1/1') {
      problems.push(`once the atmosphere runtime landed nothing lit the Studio's authored day (its lights: ${h.applied.join(', ') || 'none'})`);
    }
  }

  // ---- 3. the guards: a landing after the session ended lights nothing (its exit restored the battlefield), nor one
  // inside a take (a recording keeps the light it began with), nor one a later light replaced (the later one lights)
  for (const guard of ['ended', 'recording', 'replaced']) {
    let mode = 'down', arrive = () => {};
    const gate = new Promise((resolve) => { arrive = resolve; });
    const h = makeStudio({
      loadRuntime: async () => {
        if (mode === 'down') throw new TypeError('Failed to fetch dynamically imported module: ./battleAtmosphereRuntime.ts');
        await gate;
        return import('../engine/battleAtmosphereRuntime.ts');
      },
    });
    await assert.rejects(h.battleAtmosphere.prepare(1, 'verdant', undefined, ENTRY), /dynamically imported module/);
    mode = 'hang';
    const entered = track(h.studio.enterLight('day'));
    await turns();
    if (!entered.settled) { problems.push(`(${guard}) the Studio's light waited on the runtime's hung re-ask`); continue; }
    if (guard === 'ended') {
      h.studio.session.beginExit();
      h.ctx.restoreStudioAtmosphere();
      h.studio.session.close();
    } else if (guard === 'recording') {
      h.studio.recording = {};
    } else {
      await h.studio.setTime('golden'); // a later light while the runtime is in flight
      assert.deepEqual(h.applied, ['studio 1/1'], 'the later light applies its plan');
    }
    arrive();
    await turns();
    if (guard === 'replaced') {
      assert.deepEqual(h.applied, ['studio 1/1', 'battle 1/1', 'studio 1/1'],
        'the later light is lit again once (the battle runtime, then its plan over it); the earlier one never');
      assert.equal(h.studio.timeOfDay, 'golden');
    } else {
      assert.deepEqual(h.applied, [], `(${guard}) a landing lights nothing`);
    }
  }

  // ---- 4. the map's air: after a battle entry failed it, the Studio's light neither waits on its hung re-ask nor fails;
  // once it lands the Studio prepares it at its own hour
  {
    let mode = 'down', arrive = () => {};
    const gate = new Promise((resolve) => { arrive = resolve; });
    const airRuntime = { prepared: [], setEnabled() {}, setDensityOverride() {}, refreshTier() {}, reset() {}, isActive: () => false };
    airRuntime.prepare = (seed, mapId, time) => airRuntime.prepared.push(time);
    const h = makeStudio({
      loadAir: async () => {
        if (mode === 'down') throw new TypeError('Failed to fetch dynamically imported module: ./mapAmbience.ts');
        await gate;
        return { createMapAmbience: () => airRuntime };
      },
    });
    // the battle entry's air fails (main.ts's solo entry: an optional warm)
    await assert.rejects(h.mapAmbience.prepare(1, 'verdant', 'day', undefined, ENTRY), /dynamically imported module/);
    mode = 'hang';
    const entered = track(h.studio.enterLight('golden'));
    await turns();
    if (!entered.settled) {
      problems.push('the Studio\'s first light waited on the map air\'s hung re-ask');
    } else {
      assert.deepEqual(airRuntime.prepared, [], 'no air while its module is in flight');
      arrive();
      await turns();
      if (airRuntime.prepared.at(-1) !== 'golden') {
        problems.push(`once the map's air landed nothing prepared it at the Studio's hour (prepared: ${airRuntime.prepared.join(', ') || 'none'})`);
      }
    }
  }
} finally {
  hook.deregister();
}
assert.deepEqual(problems, [], `the Studio's light after a re-ask:\n  ${problems.join('\n  ')}`);
console.log('studioLightLanding.selftest: OK (a Studio light never waits on a re-ask, and is lit again once what it was applied without lands: the light model, the cloudscapes, the atmosphere runtime, the map\'s air; never after its session, inside a take or over a later light)');
