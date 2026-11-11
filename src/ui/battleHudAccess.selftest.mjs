import assert from 'node:assert/strict';
import { createBattleHudAccess } from './battleHudAccess.ts';

const events = [];
let hudAttempts = 0;
const loaders = {
  hud: async () => {
    hudAttempts++;
    if (hudAttempts === 1) throw new Error('simulated HUD transfer failure');
    return {
      initHud(bus) {
        events.push(['hud', bus]);
        return {
          setDamagePanel(panel) { events.push(['attach', panel]); },
        };
      },
    };
  },
  damagePanel: async () => ({
    createDamagePanel() {
      const panel = { id: 'damage-panel', clear() { events.push(['clear', panel]); } };
      events.push(['panel', panel]);
      return panel;
    },
  }),
  tankThumbs: async () => ({
    initTopMaskRig(engineCtx) { events.push(['mask', engineCtx]); },
  }),
};

const listeners = new Map();
const bus = { id: 'bus', on(event, listener) { listeners.set(event, [...(listeners.get(event) || []), listener]); return () => {}; } };
const emitBus = (event, payload) => { for (const listener of listeners.get(event) || []) listener(payload); };
const engineCtx = { id: 'engine' };
const access = createBattleHudAccess(bus, engineCtx, loaders);

await assert.rejects(access.preload(), /simulated HUD transfer failure/);
assert.equal(access.current, null, 'a failed transfer must not poison the owner');

const first = access.preload();
const shared = access.preload();
assert.equal(first, shared, 'concurrent consumers must join one runtime request');
const bundle = await first;

assert.equal(access.current, bundle);
assert.equal(hudAttempts, 2);
assert.deepEqual(events.map(([kind]) => kind), ['mask', 'hud', 'panel', 'attach']);
assert.equal(events[0][1], engineCtx);
assert.equal(events[1][1], bus);
assert.equal(events[2][1], bundle.damagePanel);
assert.equal(events[3][1], bundle.damagePanel);

assert.equal(await access.preload(), bundle, 'a ready runtime must be reused');

// 2026-11-02 audit (04-ui-1 #7): the return to the Garage clears the panel (a pending mask retry never runs there)
emitBus('phase:change', { phase: 'battle' });
assert.equal(events.filter(([kind]) => kind === 'clear').length, 0, 'a battle phase keeps the panel');
emitBus('phase:change', { phase: 'garage' });
assert.deepEqual(events.filter(([kind]) => kind === 'clear'), [['clear', bundle.damagePanel]], 'the Garage phase clears it');

// 2026-11-02 audit R6: offline the HUD's stylesheet (aerialHud.css) and a module of the bundle both fail, and which one
// rejects first is a race. A module's failure first must not hide the stylesheet's: asked again, Vite's preload would
// skip the failed sheet and the HUD would run unstyled, so the bundle's failure stands (the battle button reloads).
{
  let asks = 0;
  const offline = createBattleHudAccess(bus, engineCtx, {
    hud: () => { asks++; return new Promise((_, reject) => setTimeout(() => reject(new Error('Unable to preload CSS for /assets/aerialHud-12345678.css')), 5)); },
    damagePanel: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/damagePanel-12345678.js')),
    tankThumbs: loaders.tankThumbs,
  });
  await assert.rejects(offline.preload(), /Unable to preload CSS/, "the stylesheet's failure is the bundle's");
  await assert.rejects(offline.preload(), /Unable to preload CSS/);
  assert.equal(asks, 1, 'a bundle whose stylesheet failed is never asked again');
}
console.log('battleHudAccess.selftest: retryable battle-only HUD owner passed; a failed stylesheet in any part stands');
