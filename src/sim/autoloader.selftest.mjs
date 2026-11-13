import assert from 'node:assert/strict';
import {
  createCombatState,
  magazineReloadDenialReason,
  selectFirstAvailableShell,
  selectShell,
  startMagazineReload,
  startPostShotReload,
  startReload,
  tickReload,
} from './damage.ts';
import { FIRE_CYCLE_FLOOR_S, ROTARY_FIRE_CYCLE_FLOOR_S, createRotaryShotThinning } from './fireCycleFloor.ts';
import { SIM_DT } from './movement.ts';

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
  assert.equal(combat.magazine.rounds, 2, 'switching ammo preserves the partial magazine');
  assert.equal(combat.reload.kind, 'ready');
  assert.equal(combat.reload.t, 0);
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
  const launcher = combat.reload;
  assert.equal(launcher.t, 0);
  assert.equal(launcher.kind, 'ready',
    'selecting an unfired ATGM keeps its launcher ready');
  tickReload(combat, 2.5);
  startPostShotReload(combat, spec);
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
  assert.equal(combat.reload.t, 18.5,
    'switching back preserves the cannon magazine reload progress');
  tickReload(combat, 4);
  selectShell(combat, 1, spec);
  assert.equal(combat.reload.t, 14.5,
    'changing ammo in the same cannon preserves the shared reload progress');
  tickReload(combat, 21);
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

{
  const spec = makeSpec({
    gun: {
      reloadS: 0,
      autoloader: { magazineSize: 0, intraClipS: 0, fullReloadS: 0 },
      shells: [
        { name: 'Cannon', type: 'AP', caliberMm: 120 },
        { name: 'Fallback launcher', type: 'HEAT', caliberMm: 120, guided: true },
      ],
    },
  });
  const combat = createCombatState(spec);
  assert.deepEqual(combat.magazine, { rounds: 1, capacity: 1 },
    'invalid authored magazine capacity clamps to one round');
  assert.equal(combat.reloadChannels[1].totalS, 0,
    'guided channel falls back to the authored gun reload when reloadS is absent');
  startPostShotReload(combat, spec);
  assert.equal(combat.reload.totalS, 0.05,
    'invalid full-magazine duration clamps to the minimum safe load time');
  tickReload(combat, 1);
  assert.equal(combat.magazine.rounds, 1);
  startPostShotReload(combat, spec);
  assert.equal(combat.reload.totalS, 0.05,
    'invalid intra-magazine duration also clamps to the minimum safe cycle');
}

{
  const spec = makeSpec({
    gun: {
      reloadS: 0,
      autoloader: { magazineSize: 2, intraClipS: 0, fullReloadS: 6 },
    },
  });
  const combat = createCombatState(spec);
  startPostShotReload(combat, spec);
  assert.equal(combat.magazine.rounds, 1);
  assert.equal(combat.reload.totalS, 0.05,
    'invalid intra-magazine duration clamps while rounds remain in the magazine');
}

// release 270, the rotary floor (fireCycleFloor.ts): a gun marked `rotary` cycles once a tick, the fixed step itself, and
// the step that ticks the reload before it fires fires it again on the next tick: one round a tick, 60 a second. The same
// authored cycle on a gun without the mark stays at the 0.05 s floor, three ticks.
{
  assert.equal(ROTARY_FIRE_CYCLE_FLOOR_S, SIM_DT, 'the rotary floor is the simulation step');
  assert.equal(FIRE_CYCLE_FLOOR_S, 0.05, 'every other gun keeps its floor');
  const shotsInOneSecond = (autoloader) => {
    const spec = makeSpec({ gun: { reloadS: 2, autoloader, shells: [{ name: 'M53 API', type: 'AP', caliberMm: 20 }] } });
    const combat = createCombatState(spec);
    let shots = 0;
    for (let tick = 0; tick < 60; tick++) {
      tickReload(combat, SIM_DT);
      if (combat.reload.t > 0 || combat.magazine.rounds <= 0) continue;
      shots++;
      startPostShotReload(combat, spec);
    }
    return { shots, combat };
  };
  const rotary = shotsInOneSecond({ magazineSize: 300, intraClipS: SIM_DT, fullReloadS: 2, rotary: true });
  assert.equal(rotary.shots, 60, 'a rotary gun fires once a tick');
  assert.equal(rotary.combat.reload.totalS, SIM_DT, 'its cycle is the step');
  assert.equal(rotary.combat.magazine.rounds, 240, 'one round of the burst a tick');
  assert.equal(shotsInOneSecond({ magazineSize: 300, intraClipS: 0, fullReloadS: 2, rotary: true }).combat.reload.totalS,
    2, 'an unauthored rotary cycle falls back to the gun reload above the floor');
  const held = shotsInOneSecond({ magazineSize: 300, intraClipS: SIM_DT, fullReloadS: 2 });
  assert.equal(held.shots, 20, 'the same cycle without the mark: every third tick');
  assert.equal(held.combat.reload.totalS, 0.05, 'held at the 0.05 s floor');
  assert.equal(shotsInOneSecond({ magazineSize: 300, intraClipS: SIM_DT, fullReloadS: 2, rotary: false }).shots, 20,
    'rotary is opt-in');
}

// ... and its presentation at the floor's density (createRotaryShotThinning): the flash, report and kick of every third
// round at one round a tick; a gun at the floor is never thinned; shooters apart; a clock run back starts over
{
  const thin = createRotaryShotThinning();
  const full = [];
  for (let tick = 0; tick < 60; tick++) if (!thin('m163_a', tick * SIM_DT)) full.push(tick);
  assert.equal(full.length, 20, 'one round in three in full');
  assert.deepEqual(full.slice(0, 4), [0, 3, 6, 9], 'every third tick');
  const floor = createRotaryShotThinning();
  for (let shot = 0; shot < 40; shot++) assert.equal(floor('gepard', shot * FIRE_CYCLE_FLOOR_S), false, 'the floor in full');
  assert.equal(thin('m163_b', 59 * SIM_DT), false, 'another shooter in full');
  assert.equal(thin('m163_a', 0), false, 'a new battle starts the shooter over');
  assert.equal(thin('m163_a', SIM_DT), true, '... and thins from there');
}

{
  assert.equal(magazineReloadDenialReason(null), 'NO_MAGAZINE');
  assert.equal(tickReload(null, 1), false, 'reload ticker safely ignores missing combat state');

  const spec = makeSpec();
  const combat = createCombatState(spec);
  combat.magazine.rounds = 2;
  combat.gunReload = undefined;
  assert.equal(startMagazineReload(combat, spec), true,
    'legacy combat state without gunReload uses its active channel');
  assert.equal(magazineReloadDenialReason(combat), 'MAGAZINE_RELOADING');

  const legacy = createCombatState(makeSpec({ gun: { autoloader: undefined } }));
  legacy.reloadChannels = undefined;
  legacy.reload.t = 1;
  legacy.reload.kind = 'shell';
  assert.equal(tickReload(legacy, 1), true,
    'legacy single-channel reload reaches ready through the active fallback');

  const mismatchedSpec = makeSpec({ gun: { autoloader: undefined } });
  const mismatched = createCombatState(mismatchedSpec);
  mismatched.magazine = { rounds: 1, capacity: 3 };
  assert.equal(startMagazineReload(mismatched, mismatchedSpec), false,
    'magazine state cannot reload when the vehicle has no authored autoloader');
}

{
  const emptySpec = makeSpec({ gun: { shells: [] } });
  const empty = createCombatState(emptySpec);
  const emptySlotBefore = empty.shellSlot;
  assert.equal(selectShell(empty, 0, emptySpec), false, 'empty shell catalog cannot be selected');
  assert.equal(selectFirstAvailableShell(empty, emptySpec), -1,
    'depleted loadout has no first available shell');
  assert.equal(empty.shellSlot, emptySlotBefore,
    'failed first-available selection cannot mutate the active shell slot');

  const emptyLegacy = createCombatState(emptySpec);
  const emptyLegacySlot = emptyLegacy.shellSlot;
  assert.equal(selectFirstAvailableShell(emptyLegacy), -1,
    'legacy depleted loadout also reports no available shell');
  assert.equal(emptyLegacy.shellSlot, emptyLegacySlot,
    'legacy depleted selection cannot install the sentinel as a shell slot');

  const stockedSpec = makeSpec({ gun: { autoloader: undefined } });
  const stocked = createCombatState(stockedSpec);
  stocked.shellSlot = 1;
  assert.equal(selectFirstAvailableShell(stocked, stockedSpec), 0,
    'first available shell selection returns the stocked slot directly');
  assert.equal(stocked.shellSlot, 0);

  assert.equal(selectShell(stocked, 99, stockedSpec), true,
    'authored shell selection clamps an oversized slot');
  assert.equal(stocked.shellSlot, stockedSpec.gun.shells.length - 1);

  stocked.reload.t = 2;
  const sameSlot = stocked.shellSlot;
  assert.equal(selectShell(stocked, sameSlot, stockedSpec), true,
    'reselecting the loaded shell is a successful no-op');
  assert.equal(stocked.reload.t, 2,
    'reselecting the loaded shell does not restart its load cycle');

  const legacySelect = createCombatState(stockedSpec);
  legacySelect.reloadChannels = undefined;
  assert.equal(selectShell(legacySelect, 1.9), true,
    'legacy selection without a spec truncates a fractional slot');
  assert.equal(legacySelect.shellSlot, 1);
  assert.equal(legacySelect.reload.t, 0,
    'legacy selection without reload channels preserves the active timer');
}

{
  const guidedSpec = makeSpec({
    armor: {
      modules: [
        { module: 'gun' },
        { module: 'ammoRack' },
        { module: 'autoloader' },
        { module: 'missileRack' },
      ],
    },
    gun: {
      shells: [
        { name: 'Cannon', type: 'APFSDS', caliberMm: 120 },
        { name: 'ATGM', type: 'HEAT', caliberMm: 120, guided: true, reloadS: 4 },
      ],
    },
  });
  const guided = createCombatState(guidedSpec);
  selectShell(guided, 1, guidedSpec);
  guided.modules.missileRack.state = 'yellow';
  startPostShotReload(guided, guidedSpec);
  assert.equal(guided.reload.totalS, 5.6, 'yellow missile rack slows a guided launcher ×1.4');
  guided.modules.missileRack.state = 'red';
  startPostShotReload(guided, guidedSpec);
  assert.equal(guided.reload.totalS, 7.2, 'red missile rack slows a guided launcher ×1.8');

  selectShell(guided, 0, guidedSpec);
  guided.magazine.rounds = 2;
  startMagazineReload(guided, guidedSpec);
  assert.equal(guided.reload.totalS, guidedSpec.gun.autoloader.fullReloadS,
    'missile-rack damage does not slow conventional cannon ammunition');
}

{
  const spec = makeSpec();
  const combat = createCombatState(spec);
  combat.magazine.rounds = 2;
  combat.gunReload.kind = 'shell';
  combat.gunReload.t = 4;
  assert.equal(magazineReloadDenialReason(combat), null,
    'a non-magazine reload does not masquerade as an active magazine cycle');
  combat.gunReload.kind = 'magazine';
  combat.gunReload.t = 0;
  assert.equal(magazineReloadDenialReason(combat), null,
    'a completed magazine cycle is no longer a reload denial');

  combat.reload.kind = 'ready';
  combat.reload.t = 0;
  assert.equal(tickReload(combat, 0), false,
    'a ready zero-duration channel does not emit another ready edge');

  combat.reloadChannels = [
    { t: 2, totalS: 2, kind: 'shell' },
    { t: 1, totalS: 1, kind: 'shell' },
  ];
  combat.reload = combat.reloadChannels[0];
  assert.equal(tickReload(combat, 1), false,
    'an inactive channel completing cannot report the active channel ready');
  assert.equal(combat.reloadChannels[1].kind, 'ready');
  assert.equal(combat.reloadChannels[0].t, 1);

  combat.reloadChannels = undefined;
  combat.reload = { t: 1e-9, totalS: 1, kind: 'shell' };
  assert.equal(tickReload(combat, 0), true,
    'the reload epsilon boundary resolves to an exact ready state');
  assert.equal(combat.reload.t, 0);
}

{
  const noMagazineSpec = makeSpec();
  const noMagazine = createCombatState(noMagazineSpec);
  noMagazine.magazine = null;
  startPostShotReload(noMagazine, noMagazineSpec);
  assert.equal(noMagazine.reload.kind, 'shell',
    'missing runtime magazine state falls back to a shell reload');

  const noAutoloaderSpec = makeSpec({ gun: { autoloader: undefined } });
  const strayMagazine = createCombatState(noAutoloaderSpec);
  strayMagazine.magazine = { rounds: 2, capacity: 3 };
  startPostShotReload(strayMagazine, noAutoloaderSpec);
  assert.equal(strayMagazine.reload.kind, 'shell',
    'stray magazine state cannot activate magazine behavior without an autoloader');
  startReload(strayMagazine, noAutoloaderSpec);
  assert.equal(strayMagazine.reload.kind, 'shell',
    'ordinary reload also ignores stray magazine state');

  const noShellSpec = makeSpec({ gun: { shells: undefined } });
  const noShell = createCombatState(noShellSpec);
  startPostShotReload(noShell, noShellSpec);
  assert.equal(noShell.reload.kind, 'intraClip',
    'an autoloader with no active shell safely advances its magazine cycle');
  startReload(noShell, noShellSpec);
  assert.equal(noShell.reload.kind, 'magazine');
}

{
  const conventionalSpec = makeSpec({
    gun: { autoloader: undefined },
    armor: {
      modules: [
        { module: 'gun' },
        { module: 'ammoRack' },
        { module: 'missileRack' },
      ],
    },
  });
  const conventional = createCombatState(conventionalSpec);
  conventional.modules.missileRack.state = 'red';
  startPostShotReload(conventional, conventionalSpec);
  assert.equal(conventional.reload.totalS, conventionalSpec.gun.reloadS,
    'missile-rack damage cannot penalize a conventional shell reload');
}

await import('../vehicles/tankFactory.ts');
const { getSpec } = await import('../vehicles/specs.ts');
for (const [id, capacity, cycleS, reloadS] of [
  // balance-265 (FAIRNESS-265, tiers IX and X): the Leclerc S2, SXXI and XLR and the AMX 56 (the S2's gun) take the Type
  // 90's 9 s refill: the 3-round clip was still refilling when they died (fleetBalancePass autoloaderCycle)
  ['leclerc_s2', 3, 2.4, 9],
  ['leclerc_sxxi', 3, 2.2, 9],
  ['leclerc_xlr', 3, 2.4, 9],
  ['amx56', 3, 2.4, 9],
  ['leclerc_s1', 3, 2.0, 14.5],
  // balance-263 (FAIRNESS-263, tier VIII): the Type 90 family's 3-round clip refills in 9 s (fleetBalancePass autoloaderCycle)
  ['type90_kyumaru', 3, 2.2, 9],
  ['pl01', 3, 2.2, 15],
  ['pl01_105', 4, 1.8, 13.5],
  ['carro45t', 4, 2.5, 21],
  ['abramsx', 4, 2.3, 16],
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
assert.equal(getSpec('abramsx').armor.crew.some(({ crew }) => crew === 'loader'), false,
  'abramsx: unmanned autoloading turret has no manual loader station');
assert.equal(getSpec('abramsx').armor.modules.some(({ module }) => module === 'autoloader'), true,
  'abramsx: damage anatomy exposes the bustle-conveyor mechanism');

console.log('autoloader.selftest: all assertions passed');
