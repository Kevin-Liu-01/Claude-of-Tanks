import assert from 'node:assert/strict';
import { createContext, runInContext } from 'node:vm';
import { startMotionSample, stopMotionSample } from './multiplayer-motion-probe.mjs';

let time = 0, next = 0;
const rafs = new Map();
const vector = () => ({ x: 0, y: 0, z: 0 });
const root = { position: vector(), rotation: vector() };
const state = { pos: vector(), yaw: 0, visualPitch: 0, visualRoll: 0, speed: 4, yawRate: .2 };
const debug = { game: { phase: 'battle', preBattleS: 0, result: null,
  player: { state, visual: { root } },
  get tanks() { assert.fail('local motion observer cannot read enemies'); } },
  camera: { position: vector(), rotation: vector() },
  frameLoopScheduler: { animationTicks: 0 }, network: { prediction: { reconciliations: 0 } } };
const document = { hidden: false, hasFocus: () => true };
const context = createContext({ window: { __DEBUG: debug }, document,
  performance: { now: () => time },
  requestAnimationFrame(callback) { rafs.set(++next, callback); return next; },
  cancelAnimationFrame(id) { rafs.delete(id); } });
const evaluate = (fn) => runInContext(`(${fn.toString()})()`, context);
function tick(advance = true) {
  time += 1000 / 60;
  if (advance) debug.frameLoopScheduler.animationTicks++;
  const callbacks = [...rafs.values()]; rafs.clear();
  callbacks.forEach(fn => fn());
}
const before = JSON.stringify({state, root, camera: debug.camera});
evaluate(startMotionSample);
tick(); tick(false);
assert.equal(context.window.__COT_MOTION_SAMPLE.count, 1, 'one observation per actual game frame');
document.hidden = true; tick(); document.hidden = false;
document.hasFocus = () => false; tick(); document.hasFocus = () => true;
debug.game.preBattleS = 1; tick(); debug.game.preBattleS = 0;
debug.game.result = {}; tick(); debug.game.result = null;
assert.equal(context.window.__COT_MOTION_SAMPLE.count, 1, 'exclude hidden/unfocused/countdown/result');
for (let n = 0; n < 12010; n++) tick();
const sample = evaluate(stopMotionSample);
assert.equal(sample.rows.length, 12000);
assert.equal(sample.dropped, 11);
assert.equal(rafs.size, 0);
assert.equal(context.window.__COT_MOTION_SAMPLE, undefined);
assert.equal(JSON.stringify({state, root, camera: debug.camera}), before, 'read-only observation');
evaluate(startMotionSample); evaluate(startMotionSample);
assert.equal(rafs.size, 1, 'replacement disposes prior frame subscription');
evaluate(stopMotionSample);
assert.equal(rafs.size, 0);
console.log('multiplayer motion probe: PASS');
