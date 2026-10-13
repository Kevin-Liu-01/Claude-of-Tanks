// damagePanelEntryMasks.selftest.mjs — a slow top-down mask link never refuses a covered battle entry (2026-10-09, the
// black-screen lane: production 207 refused cold entries under load with "Player top-down view could not be prepared").
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { prepareEntryPanelMasks } = await import('./damagePanelEntryMasks.ts');

const spec = { id: 'm1a2' };
const visual = { root: {} };
let passed = 0;

{
  // the masks linked in time: painted, nothing deferred
  const deferred = [];
  const calls = [];
  const panel = { prepareTankMasks: async (s, v) => { calls.push([s, v]); return true; } };
  assert.equal(await prepareEntryPanelMasks(panel, spec, visual, (id) => deferred.push(id)), true);
  assert.deepEqual(calls, [[spec, visual]], 'the entry waits for the real masks of the player\'s own visual');
  assert.deepEqual(deferred, []);
  passed++;
}

{
  // the 5 s link cap ran out (a loaded machine): the entry goes on, the panel finishes the masks itself
  const deferred = [];
  let settled = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const panel = { prepareTankMasks: async () => { await gate; return false; } };
  const work = prepareEntryPanelMasks(panel, spec, undefined, (id) => deferred.push(id)).then((value) => { settled = true; return value; });
  await Promise.resolve();
  assert.equal(settled, false, 'the covered entry still waits for the panel\'s own bounded preparation');
  release();
  assert.equal(await work, false, 'a slow link resolves; it never throws into covered entry recovery');
  assert.deepEqual(deferred, ['m1a2'], 'the deferral is reported once, by spec id');
  passed++;
}

{
  // a throwing diagnostic sink cannot turn the deferral into a refusal
  const panel = { prepareTankMasks: async () => false };
  assert.equal(await prepareEntryPanelMasks(panel, spec, visual, () => { throw new Error('sink failed'); }), false);
  passed++;
}

{
  // an exception from the panel is a wiring fault, not a slow link: it still belongs to covered entry recovery
  const panel = { prepareTankMasks: async () => { throw new Error('panel wiring broke'); } };
  await assert.rejects(prepareEntryPanelMasks(panel, spec, visual, () => {}), /panel wiring broke/);
  passed++;
}

{
  // both covered entries (solo deployment and the network round) route through the tolerant preparation
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /Player top-down view could not be prepared/, 'no entry refuses on a slow mask link');
  assert.equal((main.match(/await prepareEntryPanelMasks\(panel, (player|entity)\.spec, \1\.visual, deferredPanelMasks\)/g) ?? []).length, 2,
    'solo preparePlayerPanel and the network playerPanel warm both use it');
  assert.match(main, /if \(!player \|\| !panel\) throw new Error\('Player damage panel was not prepared'\)/,
    'a missing panel (a wiring fault) still refuses the solo entry');
  assert.match(main, /if \(!panel\) throw new Error\('network panel warm requires the prepared battle HUD'\)/);
  passed++;
}

console.log(`damagePanelEntryMasks.selftest: ${passed} tolerant covered-entry mask cases passed`);
