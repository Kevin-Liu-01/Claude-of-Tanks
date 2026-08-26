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
      const panel = { id: 'damage-panel' };
      events.push(['panel', panel]);
      return panel;
    },
  }),
  tankThumbs: async () => ({
    initTopMaskRig(engineCtx) { events.push(['mask', engineCtx]); },
  }),
};

const bus = { id: 'bus' };
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
console.log('battleHudAccess.selftest: retryable battle-only HUD owner passed');
