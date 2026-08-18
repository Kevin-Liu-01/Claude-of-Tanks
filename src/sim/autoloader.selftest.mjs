import assert from 'node:assert/strict';
import {
  createCombatState,
  selectShell,
  startMagazineReload,
  startPostShotReload,
  tickReload,
} from './damage.js';

function makeSpec(overrides = {}) {
  const base = {
    id: 'test_autoloader',
    era: 'modern',
    hp: 1800,
    armor: {
      modules: [
        { module: 'gun' },
        { module: 'ammoRack' },
        { module: 'autoloader' },
      ],
      crew: [
        { crew: 'commander' },
        { crew: 'gunner' },
        { crew: 'driver' },
      ],
    },
    gun: {
      reloadS: 6,
      autoloader: { magazineSize: 3, intraClipS: 2.5, fullReloadS: 21 },
      shells: [
        { name: 'APFSDS', type: 'APFSDS', caliberMm: 120 },
        { name: 'HEAT', type: 'HEAT', caliberMm: 120 },
      ],
    },
  };
  return {
    ...base,
    ...overrides,
    armor: { ...base.armor, ...(overrides.armor || {}) },
    gun: { ...base.gun, ...(overrides.gun || {}) },
  };
}

{
  const spec = makeSpec();
  const combat = createCombatState(spec);
  assert.deepEqual(combat.magazine, { rounds: 3, capacity: 3 });
  assert.equal(combat.reload.kind, 'ready');

  startPostShotReload(combat, spec);
  assert.equal(combat.magazine.rounds, 2);
  assert.equal(combat.reload.kind, 'intraClip');
  assert.equal(combat.reload.totalS, 2.5);
  assert.equal(tickReload(combat, 2.4), false);
  assert.equal(tickReload(combat, 0.1), true);
  assert.equal(combat.magazine.rounds, 2);
  assert.equal(combat.reload.kind, 'ready');

  startPostShotReload(combat, spec);
  tickReload(combat, 3);
  startPostShotReload(combat, spec);
  assert.equal(combat.magazine.rounds, 0);
  assert.equal(combat.reload.kind, 'magazine');
  assert.equal(combat.reload.totalS, 21);
  tickReload(combat, 21);
  assert.deepEqual(combat.magazine, { rounds: 3, capacity: 3 });
  assert.equal(combat.reload.kind, 'ready');
}

{
  const spec = makeSpec();
  const combat = createCombatState(spec);
  startPostShotReload(combat, spec);
  tickReload(combat, 3);
  assert.equal(startMagazineReload(combat, spec), true);
  assert.equal(combat.magazine.rounds, 0, 'manual reload discards the partial magazine');
  assert.equal(combat.reload.kind, 'magazine');
  assert.equal(startMagazineReload(combat, spec), false, 'cannot restart an active magazine reload');
  tickReload(combat, 21);
  assert.equal(startMagazineReload(combat, spec), false, 'a full magazine needs no reload');
}

{
  const spec = makeSpec();
  const combat = createCombatState(spec);
  combat.modules.autoloader.state = 'yellow';
  combat.magazine.rounds = 2;
  startMagazineReload(combat, spec);
  assert.equal(combat.reload.totalS, 21 * 1.35);
  combat.modules.autoloader.state = 'red';
  tickReload(combat, 60);
  combat.magazine.rounds = 2;
  startMagazineReload(combat, spec);
  assert.equal(combat.reload.totalS, 42);
}

{
  const spec = makeSpec();
  const combat = createCombatState(spec);
  startPostShotReload(combat, spec);
  tickReload(combat, 3);
  selectShell(combat, 1, spec);
  assert.equal(combat.shellSlot, 1);
  assert.equal(combat.magazine.rounds, 0);
  assert.equal(combat.reload.kind, 'magazine');
}

{
  const spec = makeSpec({ gun: { autoloader: undefined } });
  const combat = createCombatState(spec);
  assert.equal(combat.magazine, null);
  startPostShotReload(combat, spec);
  assert.equal(combat.reload.kind, 'shell');
  assert.equal(combat.reload.totalS, 6);
  tickReload(combat, 6);
  assert.equal(combat.reload.kind, 'ready');
}

await import('../vehicles/tankFactory.js');
const { getSpec } = await import('../vehicles/specs.js');
for (const [id, capacity, cycleS, reloadS] of [
  ['leclerc', 3, 2.5, 18.5],
  ['type90', 3, 2.2, 18.5],
  ['pl01', 3, 2.4, 20],
  ['pl01_105', 4, 2.0, 18],
]) {
  const spec = getSpec(id);
  assert.equal(spec.gun.autoloader.magazineSize, capacity, `${id}: magazine capacity`);
  assert.equal(spec.gun.autoloader.intraClipS, cycleS, `${id}: intra-magazine cycle`);
  assert.equal(spec.gun.autoloader.fullReloadS, reloadS, `${id}: full reload`);
  assert.equal(createCombatState(spec).magazine.rounds, capacity, `${id}: starts battle full`);
}
assert.equal(getSpec('pl01_105').gun.caliberMm, 105);
assert.equal(getSpec('pl01_105').gun.shells[0].caliberMm, 105);

console.log('autoloader.selftest: all assertions passed');
