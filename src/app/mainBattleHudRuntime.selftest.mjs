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

// 2026-11-02 audit F8: a HUD that owns its display takes the veil as one of its reasons (hud.ts setVeiled) and the
// root's style is never written here
{
  const veils = [];
  const owning = { root: { style: { display: 'block' } }, setVeiled: (on) => veils.push(on), shotInfo: { statsRoot: { style: { visibility: '' } } } };
  const owner = createMainBattleHudRuntime({
    bus: { emit() {} }, engineContext: {}, perfMeterEnabled: () => true, directionalHitValuesEnabled: () => true,
    queueMinimap() {}, access: { current: { hud: owning, damagePanel: null }, async preload() { return this.current; } },
  });
  owner.veil(true);
  owner.veil(false);
  assert.deepEqual(veils, [true, false]);
  assert.equal(owning.root.style.display, 'block', 'the runtime leaves the root\'s display to the HUD');
  assert.equal(owning.shotInfo.statsRoot.style.visibility, '');
}

console.log('mainBattleHudRuntime.selftest: acquisition, preference sync, and atomic veiling passed');
