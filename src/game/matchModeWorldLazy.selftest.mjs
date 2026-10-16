// matchModeWorldLazy.ts (2026-10-16, the perf lane: 226's bundle budget): the battle modes' world presentation behind its
// own chunk keeps the presentation's contract — one stable root in the scene, nothing drawn until the module lands, the
// latest state handed over the moment it does, a failed load retried by the next mode state, disposal forwarded.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createLazyMatchModeWorldPresentation } from './matchModeWorldLazy.ts';

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

{
  const scene = new THREE.Scene();
  let idle = null, loads = 0;
  const updates = [], disposed = [];
  let resolveLoad;
  const lazy = createLazyMatchModeWorldPresentation(scene, { mapId: () => 'verdant' }, {
    whenIdle: (run) => { idle = run; },
    load: () => { loads++; return new Promise((resolve) => { resolveLoad = resolve; }); },
  });
  assert.equal(lazy.root.parent, scene, 'one stable root in the scene from the start');
  lazy.update(null, 1);
  assert.equal(loads, 0, 'a Garage frame (no mode) loads nothing');
  idle();
  assert.equal(loads, 1, 'the module is fetched once the boot is idle');
  let ready = false;
  const readyPromise = lazy.ready().then(() => { ready = true; });
  await flush();
  assert.equal(ready, false, 'ready() waits for the module (a slow network holds the battle load, never the markers)');
  const state = { mode: 'conquest' };
  lazy.update(state, 2);
  assert.equal(loads, 1, 'never fetched twice');
  resolveLoad({
    createMatchModeWorldPresentation(parent, options) {
      assert.equal(parent, lazy.root, 'the real presentation hangs under the stable root');
      assert.equal(options.mapId(), 'verdant', 'with the options it was given');
      const root = new THREE.Group(); parent.add(root);
      return { root, update: (s, t) => updates.push([s, t]), dispose: () => disposed.push(true) };
    },
  });
  await flush();
  assert.deepEqual(updates, [[state, 2]], 'the latest state is handed over the moment the module lands');
  await readyPromise;
  assert.equal(ready, true, 'and resolves once it is in');
  lazy.update(null, 3);
  assert.deepEqual(updates.at(-1), [null, 3], 'then every frame goes straight through');
  lazy.dispose();
  assert.deepEqual(disposed, [true]);
  assert.equal(lazy.root.parent, null, 'disposal leaves the scene');
}

{
  // a failed load is retried by the next mode state; a state before idle fetches at once
  const scene = new THREE.Scene();
  let attempt = 0;
  const errors = [];
  const lazy = createLazyMatchModeWorldPresentation(scene, {}, {
    whenIdle: () => {},
    load: async () => {
      attempt++;
      if (attempt === 1) throw new Error('offline');
      return { createMatchModeWorldPresentation: (parent) => ({ root: new THREE.Group(), update() {}, dispose() {} }) };
    },
    onError: (error) => errors.push(String(error)),
  });
  lazy.update({ mode: 'ctf' }, 1);
  await flush();
  assert.equal(attempt, 1, 'a mode state before the idle fetch loads at once');
  assert.deepEqual(errors, ['Error: offline']);
  lazy.update({ mode: 'ctf' }, 2);
  await flush();
  assert.equal(attempt, 2, 'the next mode state tries again');
}

// the wiring: main.ts builds the lazy presentation, and nothing on the boot graph imports the module itself
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /const matchModeWorld = createLazyMatchModeWorldPresentation\(scene, \{/);
assert.match(main, /async function ensureBattleHud\(\) \{[\s\S]{0,600}?await Promise\.all\(\[battleHudRuntime\.preload\(\), matchModeWorld\.ready\(\)\]\)/,
  'every battle\'s interface load (ensureBattleHud) waits for the presentation');
for (const [file, call] of [['./soloBattleLoadingRuntime.ts', /ensureBattleHud\(\),/], ['../main.ts', /loadModules: \(\) => Promise\.all\(\[\s*preloadBattleClientRuntime\(\),\s*ensureBattleHud\(\),/]]) {
  assert.match(readFileSync(new URL(file, import.meta.url), 'utf8'), call, `${file}: its battle load joins ensureBattleHud`);
}
assert.doesNotMatch(main, /from '\.\/game\/matchModeWorldPresentation\.ts'/, 'main.ts imports no part of the presentation module');
const lazySource = readFileSync(new URL('./matchModeWorldLazy.ts', import.meta.url), 'utf8');
assert.doesNotMatch(lazySource, /^import \{[^}]*\} from '\.\/matchModeWorldPresentation\.ts'/m, 'the wrapper imports only its types');

console.log('matchModeWorldLazy.selftest: a stable root, nothing until the module lands, the latest state handed over, retried on failure, disposal forwarded, out of the boot graph');
