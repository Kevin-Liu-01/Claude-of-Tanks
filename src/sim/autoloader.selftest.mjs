import assert from 'node:assert/strict';
import {
  createCombatState,
  magazineReloadDenialReason,
  selectShell,
  startMagazineReload,
  startPostShotReload,
  tickReload,
} from './damage.ts';

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
  assert.equal(magazineReloadDenialReason(combat), 'MAGAZINE_RELOADING');
  assert.equal(startMagazineReload(combat, spec), false, 'cannot restart an active magazine reload');
  tickReload(combat, 21);
  assert.equal(magazineReloadDenialReason(combat), 'MAGAZINE_FULL');
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
  const spec = makeSpec({
    gun: {
      shells: [
        { name: 'APFSDS', type: 'APFSDS', caliberMm: 120 },
        { name: 'HEAT', type: 'HEAT', caliberMm: 120 },
        { name: 'ATGM', type: 'HEAT', caliberMm: 120, guided: true, reloadS: 2.5 },
      ],
    },
  });
  const combat = createCombatState(spec);
  startPostShotReload(combat, spec);
  tickReload(combat, 2.5);
  assert.equal(combat.magazine.rounds, 2);
  selectShell(combat, 2, spec);
  startPostShotReload(combat, spec);
  const launcher = combat.reload;
  assert.equal(launcher.t, 2.5);
  assert.equal(combat.magazine.rounds, 2,
    'an auxiliary missile never consumes the cannon magazine');

  assert.equal(startMagazineReload(combat, spec), true,
    'a partial cannon magazine can reload while the missile remains selected');
  assert.equal(combat.reload, launcher,
    'manual cannon reload does not replace the selected launcher');
  assert.equal(combat.gunReload.kind, 'magazine');
  assert.equal(magazineReloadDenialReason(combat), 'MAGAZINE_RELOADING');
  tickReload(combat, 2.5);
  assert.equal(launcher.t, 0, 'launcher and cannon channels advance together');
  assert.equal(combat.gunReload.t, 18.5);

  selectShell(combat, 0, spec);
  assert.equal(combat.reload, combat.gunReload);
  const elapsedReload = combat.reload.t;
  selectShell(combat, 1, spec);
  assert.equal(combat.reload.t, elapsedReload,
    'changing cannon ammo during a full magazine reload preserves elapsed time');
  tickReload(combat, elapsedReload);
  assert.equal(combat.magazine.rounds, 3);
  assert.equal(combat.reload.kind, 'ready');
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

await import('../vehicles/tankFactory.ts');
const { getSpec } = await import('../vehicles/specs.ts');
for (const [id, capacity, cycleS, reloadS] of [
  ['leclerc', 3, 2.4, 16.5],
  ['leclerc_xlr', 3, 2.2, 15.5],
  ['amx56', 3, 2.0, 14.5],
  ['type90', 3, 2.2, 18.5],
  ['pl01', 3, 2.2, 15],
  ['pl01_105', 4, 1.8, 13.5],
  ['carro45t', 4, 2.5, 21],
]) {
  const spec = getSpec(id);
  assert.equal(spec.gun.autoloader.magazineSize, capacity, `${id}: magazine capacity`);
  assert.equal(spec.gun.autoloader.intraClipS, cycleS, `${id}: intra-magazine cycle`);
  assert.equal(spec.gun.autoloader.fullReloadS, reloadS, `${id}: full reload`);
  assert.equal(createCombatState(spec).magazine.rounds, capacity, `${id}: starts battle full`);
}
assert.equal(getSpec('pl01_105').gun.caliberMm, 105);
assert.equal(getSpec('pl01_105').gun.shells[0].caliberMm, 105);
assert.equal(getSpec('carro45t').armor.crew.some(({ crew }) => crew === 'loader'), false,
  'carro45t: bustle autoloader replaces the manual loader station');
assert.equal(getSpec('carro45t').armor.modules.some(({ module }) => module === 'autoloader'), true,
  'carro45t: damage anatomy exposes the autoloader mechanism');

console.log('autoloader.selftest: all assertions passed');
