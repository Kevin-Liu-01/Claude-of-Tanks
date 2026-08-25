import assert from 'node:assert/strict';
import { resetBattleTankForGarage } from './garageTankLifecycle.js';

const order = [];
resetBattleTankForGarage({
  fx: { resetAll() { order.push('fx'); } },
  visual: { resetForGaragePresentation() { order.push('visual'); } },
});
assert.deepEqual(order, ['fx', 'visual'],
  'tank-parented FX detach before the visual becomes a garage hero');

let fallbackResets = 0;
resetBattleTankForGarage({
  fx: { resetAll() {} },
  visual: { resetDestroyed() { fallbackResets++; } },
});
assert.equal(fallbackResets, 1, 'legacy visuals still restore their intact state');

let emptyFxResets = 0;
resetBattleTankForGarage({
  fx: { resetAll() { emptyFxResets++; } },
  visual: null,
});
assert.equal(emptyFxResets, 1, 'battle FX clear even when no visual was fielded');

assert.throws(
  () => resetBattleTankForGarage({ fx: null, visual: null }),
  /FX reset owner/,
  'the phase boundary cannot silently omit the external FX owner',
);

console.log('garageTankLifecycle.selftest: FX and tank state end at the garage boundary');

await import('./garageDressingLifecycle.selftest.mjs');
