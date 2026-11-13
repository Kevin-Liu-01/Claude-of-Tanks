// 2026-11-02 audit F2: the program-link origin watch. Each watch wrapped whatever renderBufferDirect was installed and
// restored its predecessor only if it was still on top, so two watches stopped in arm order (the network reveal's and
// the Garage restore's late links) left the inner wrapper on every draw for good. Runs main's actual watchProgramOrigins.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createProgramOriginWatcher } from './programOriginWatch.ts';

function createRenderer() {
  const draws = [];
  const renderer = {
    info: { programs: [] },
    renderBufferDirect(_camera, _scene, _geometry, material, object) {
      draws.push(object.name);
      if (material.links) renderer.info.programs.push({});
    },
  };
  return { renderer, original: renderer.renderBufferDirect, draws };
}
const node = (name, parent = null) => ({ name, type: 'Mesh', parent });
const draw = (renderer, name, links = false) => renderer.renderBufferDirect.call(renderer, null, null, null,
  { type: 'MeshStandardMaterial', links }, node(name, node('tank', node('scene'))), null);

function timers() {
  const pending = new Map();
  let next = 0;
  return {
    setTimer: (callback) => { pending.set(++next, callback); return next; },
    clearTimer: (handle) => pending.delete(handle),
    fireAll: () => { for (const [handle, callback] of [...pending]) { pending.delete(handle); callback(); } },
    get size() { return pending.size; },
  };
}

// main's actual function, over the shared watcher
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const source = main.match(/\nfunction watchProgramOrigins\([\s\S]*?\n\}\n/)?.[0];
assert.ok(source, "exercise main's actual watchProgramOrigins");
const mainWatch = (renderer, clock) => new Function('renderer', 'programOriginWatcher', 'setTimeout', 'ORIGIN_WATCH_MS',
  `${stripTypeScriptTypes(source)}\nreturn watchProgramOrigins;`)(
  renderer, createProgramOriginWatcher(renderer, { watchMs: 10_000, setTimer: clock.setTimer, clearTimer: clock.clearTimer }),
  clock.setTimer, 10_000);

for (const order of [['first', 'second'], ['second', 'first']]) {
  const { renderer, original, draws } = createRenderer();
  const clock = timers();
  const watchProgramOrigins = mainWatch(renderer, clock);
  const watches = { first: watchProgramOrigins(), second: watchProgramOrigins((object) => ` +${object.name}`) };
  draw(renderer, 'hull', true);
  draw(renderer, 'track', false);
  assert.deepEqual(watches.first.origins, ['MeshStandardMaterial<hull<tank<scene']);
  assert.deepEqual(watches.second.origins, ['MeshStandardMaterial<hull<tank<scene +hull'], 'each watch keeps its own annotation');
  assert.deepEqual(draws, ['hull', 'track'], 'every draw reaches the renderer once');
  watches[order[0]].stop();
  assert.notEqual(renderer.renderBufferDirect, original, 'a watch still armed keeps the wrapper');
  watches[order[1]].stop();
  assert.equal(renderer.renderBufferDirect, original, `stopped ${order.join(' then ')}: the renderer's own draw is back`);
  assert.equal(clock.size, 0, 'a stopped watch clears its window timer');
}

// The window stops a watch by itself; a later patch over the wrapper keeps working, and re-arming under it never
// wraps the wrapper twice (no recursion).
{
  const { renderer, original, draws } = createRenderer();
  const clock = timers();
  const watcher = createProgramOriginWatcher(renderer, { setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const first = watcher.watch();
  clock.fireAll();
  assert.equal(watcher.active, 0);
  assert.equal(renderer.renderBufferDirect, original, 'the window ends the watch');
  const armed = watcher.watch();
  const ours = renderer.renderBufferDirect;
  const patched = function (...args) { return ours.apply(this, args); };
  renderer.renderBufferDirect = patched;
  armed.stop();
  assert.equal(renderer.renderBufferDirect, patched, 'a patch installed over the watch stays');
  const again = watcher.watch();
  assert.equal(renderer.renderBufferDirect, patched);
  draw(renderer, 'turret', true);
  assert.deepEqual(again.origins, ['MeshStandardMaterial<turret<tank<scene'], 'the inert wrapper records again');
  assert.deepEqual(draws, ['turret'], 'one draw, no recursion');
  again.stop();
  first.stop();
}

console.log('programOriginWatch.selftest: one shared wrapper, any stop order restores the draw, no double wrap passed');
