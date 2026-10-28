// mode-battle-director (home page r2 captures): the page-side director's frame clock, freezes, bursts, selectors and
// staging helpers, run in a minimal fake page (no browser, no GPU).
import assert from 'node:assert/strict';
import { installModeBattleDirector } from './mode-battle-director.mjs';
import { RECIPES, recipeFor } from './mode-battle-recipes.mjs';

let now = 1000;
const queued = [];
const fakeWindow = {
  requestAnimationFrame: (cb) => { queued.push(cb); return queued.length; },
};
globalThis.window = fakeWindow;
globalThis.performance = { now: () => now };
globalThis.document = {
  getElementById: () => null, createElement: () => ({}), head: { appendChild() {} },
  documentElement: { classList: { toggle() {} } },
};
const flush = () => { const batch = queued.splice(0); for (const cb of batch) cb(now); };

installModeBattleDirector();
const MB = window.__MB;
assert.ok(MB && MB.H, 'the director installs on the page');
installModeBattleDirector();
assert.equal(window.__MB, MB, 'a second install keeps the first director');

// the wrapped clock delivers callbacks with frozen time removed
let seen = [];
const tick = (ts) => { seen.push(ts); window.requestAnimationFrame(tick); };
window.requestAnimationFrame(tick);
flush();
assert.deepEqual(seen, [1000]);
now = 1016;
assert.equal(MB.freezeIn(0, { type: 'manual' }), true);
assert.equal(MB.freezeIn(0, { type: 'manual' }), false, 'one pending freeze at a time');
flush();
assert.equal(MB.frozen, true, 'the frame at or after the freeze time is held');
assert.equal(MB.meta.reason.type, 'manual');
now = 3016;
flush();
assert.deepEqual(seen, [1000, 1016], 'no frame runs while frozen');
assert.equal(MB.resume(), true);
flush();
now = 3032;
flush();
assert.deepEqual(seen.slice(2), [1016, 1032], 'the two frozen seconds never reach the game clock');

// a burst queues freezes on presentation time and is drained by the per-frame hook while armed
MB.arm({ triggers: [], periodicMs: 0 });
assert.equal(MB.burstIn([200, 50, 100]), 3);
assert.deepEqual(MB.burstQueue.map((b) => b.reason.delayMs), [50, 100, 200], 'bursts run in time order');
MB.arm(null);
assert.equal(MB.burstQueue.length, 0, 'disarming drops a pending burst');

// selectors: points and recipe-defined selectors
const p = MB.H.sel('point:10,20,30');
assert.deepEqual([p.x, p.y, p.z], [10, 20, 30]);
MB.defineSelector('fixed', 'return H.point(1, 2, 3, { id: "x" });');
assert.equal(MB.H.sel('fixed').id, 'x');
assert.equal(MB.H.sel('nope'), null);

// staging: a placed tank sits on the ground with its motion cleared
const pos = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
const tank = { state: { pos, yaw: 0, speed: 9, verticalSpeed: 2, yawRate: 1, _ride: { y: 0, v: 3 } }, input: {}, combat: {} };
window.__DEBUG = { world: { heightField: { getHeightAt: (x, z) => x * 0.01 + z * 0.02 } } };
MB.H.place(tank, 100, 50, Math.PI * 3);
assert.deepEqual([pos.x, pos.y, pos.z], [100, 2, 50]);
assert.ok(Math.abs(Math.abs(tank.state.yaw) - Math.PI) < 1e-9, 'yaw wraps into (-pi, pi]');
assert.equal(tank.state.speed, 0);
assert.equal(tank.state._ride.v, 0);

// every recipe either runs a battle or drives its own pages
for (const [slot, recipe] of Object.entries(RECIPES)) {
  assert.equal(recipeFor(slot), recipe);
  assert.ok(typeof recipe.run === 'function' || typeof recipe.custom === 'function', `${slot} has a run or custom step`);
  // (deploy/<mode>: a Deploy plate's still, the media lane's deploy-r1 panels, bf50a803fe)
  assert.ok(/^(modes|mechanics|features|deploy)\//.test(slot), `${slot} is a home-page or Deploy plate slot`);
}
assert.equal(recipeFor('modes/none'), null);

console.log('mode-battle-director.selftest: clock, freezes, bursts, selectors, placement and recipes pass');
