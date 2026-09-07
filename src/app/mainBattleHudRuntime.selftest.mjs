import assert from 'node:assert/strict';
import { createMainBattleHudRuntime } from './mainBattleHudRuntime.ts';

const events = [];
let minimapRequests = 0;
const hud = {
  root: { style: { display: '' } },
  shotInfo: { statsRoot: { style: { visibility: '' } } },
};
const damagePanel = { root: { style: { visibility: '' } } };
const bundle = { hud, damagePanel };
let perfMeterEnabled = true;
const access = {
  current: null,
  async preload() {
    this.current = bundle;
    return bundle;
  },
};
const runtime = createMainBattleHudRuntime({
  bus: { emit: (event, payload) => events.push({ event, payload }) },
  engineContext: {},
  perfMeterEnabled: () => perfMeterEnabled,
  directionalHitValuesEnabled: () => true,
  queueMinimap: () => { minimapRequests += 1; },
  access,
});

assert.equal(runtime.currentHud(), null);
assert.equal(runtime.currentDamagePanel(), null);
assert.equal(await runtime.preload(), bundle);
assert.equal(runtime.currentHud(), hud);
assert.equal(runtime.currentDamagePanel(), damagePanel);
assert.deepEqual(events, [
  { event: 'ui:perfMeter', payload: { on: true } },
  { event: 'ui:directionalHitValues', payload: { on: true } },
]);
assert.equal(minimapRequests, 1);

// A later battle entry must resynchronize the live preference even though the
// same demand-loaded HUD instance is reused.
perfMeterEnabled = false;
assert.equal(await runtime.preload(), bundle);
assert.deepEqual(events.slice(-2), [
  { event: 'ui:perfMeter', payload: { on: false } },
  { event: 'ui:directionalHitValues', payload: { on: true } },
]);
assert.equal(minimapRequests, 2);

runtime.veil(true);
assert.equal(hud.root.style.display, 'none');
assert.equal(hud.shotInfo.statsRoot.style.visibility, 'hidden');
assert.equal(damagePanel.root.style.visibility, 'hidden');
runtime.veil(false);
assert.equal(hud.root.style.display, '');
assert.equal(hud.shotInfo.statsRoot.style.visibility, '');
assert.equal(damagePanel.root.style.visibility, '');

console.log('mainBattleHudRuntime.selftest: acquisition, preference sync, and atomic veiling passed');
