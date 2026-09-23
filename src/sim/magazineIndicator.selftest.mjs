// Round 41 (owner 2026-09-22): "there are some missile tanks that seem to fire twice like the ZTZ 100 prototype and if
// so we need to show the autoloader ammo indicator even if they fire on their own ... verify all tanks for this."
//
// The mechanical criterion: a weapon that cycles INSIDE a group after a shot (reload kind 'intraClip' — the cannon
// autoloader's intra-clip delay or a guided rack's intra-salvo interval) fires again before its long reload, so the
// reticle must show the multi-round indicator. This receipt fires every shell slot of every playable hull through the
// real simulation (createCombatState → startPostShotReload → tickReload) and checks the one indicator derivation the
// solo aim frame, the authoritative snapshot and the reload event read (sim/magazineIndicator), plus the HUD state it
// produces. Single-shot weapons show nothing; an autocannon belt (authored sub-second per-shell cycle, dozens of
// rounds) is continuous fire, not a group, and is listed for information.
import assert from 'node:assert/strict';
// The fleet spec modules register themselves into the registry when the factory loads (fleetSpecRegistry); without
// this import the frontline hulls — the two salvo racks among them — would be invisible to the census.
import '../vehicles/tankFactory.ts';
import { ALL_TANK_IDS, TANK_SPECS } from '../vehicles/specs.ts';
import { createCombatState, selectShell, startPostShotReload, tickReload } from './damage.ts';
import { hasMultiRoundGroup, magazineIndicator } from './magazineIndicator.ts';
import { autoloaderHudState } from '../ui/hud.ts';

const DT = 1 / 60;
function settle(combat) {
  let guard = 0;
  while (combat.reload.t > 0 && guard++ < 200000) tickReload(combat, DT);
  assert.ok(combat.reload.t <= 0, 'a reload completes');
}

// Pure derivation contracts.
assert.equal(magazineIndicator(null, null), null, 'no state, no indicator');
{
  const salvoSpec = { gun: { shells: [{ guided: true }, { guided: false }], launcherSalvo: { rounds: 2 } } };
  const fresh = { shellSlot: 0, reload: { t: 0, kind: 'ready' }, magazine: null };
  assert.deepEqual(magazineIndicator(fresh, salvoSpec), { rounds: 2, capacity: 2, launcher: true },
    'a fresh salvo rack shows the full group');
  assert.deepEqual(magazineIndicator({ ...fresh, launcherSalvoShots: 1, reload: { t: 0.3, kind: 'intraClip' } }, salvoSpec),
    { rounds: 1, capacity: 2, launcher: true }, 'one missile away inside the group leaves one ready');
  assert.deepEqual(magazineIndicator({ ...fresh, launcherSalvoShots: 0, reload: { t: 9, kind: 'shell' } }, salvoSpec),
    { rounds: 0, capacity: 2, launcher: true }, 'after the last missile the launcher reloads the whole group');
  assert.equal(magazineIndicator({ ...fresh, shellSlot: 1 }, salvoSpec), null,
    'the same hull with its autocannon selected shows no group');
  const mirror = { shellSlot: 0, reload: { t: 0, kind: 'ready' }, magazine: null,
    magazineIndicator: { rounds: 3, capacity: 4, launcher: true } };
  assert.deepEqual(magazineIndicator(mirror, salvoSpec), { rounds: 3, capacity: 4, launcher: true },
    'a network mirror reports the authority\'s indicator verbatim');
  assert.equal(magazineIndicator({ ...mirror, magazineIndicator: null }, salvoSpec), null,
    'a mirror of a single-shot weapon reports none even when its spec could derive one');
  const scratch = { rounds: 0, capacity: 0, launcher: false };
  assert.equal(magazineIndicator(fresh, salvoSpec, scratch), scratch, 'the live paths reuse their scratch object');
  assert.deepEqual(magazineIndicator({ shellSlot: 0, reload: { t: 0, kind: 'ready' }, magazine: { rounds: 2, capacity: 3 } },
    { gun: { shells: [{ guided: false }] } }), { rounds: 2, capacity: 3, launcher: false },
    'a cannon magazine reads through unchanged');
  assert.deepEqual(magazineIndicator({ magazine: { rounds: 1, capacity: 3 } }, null), { rounds: 1, capacity: 3, launcher: false },
    'a cannon magazine needs no weapon table (snapshot fixtures carry none)');
  assert.equal(hasMultiRoundGroup(salvoSpec), true);
  assert.equal(hasMultiRoundGroup({ gun: { shells: [{ guided: false }], launcherSalvo: { rounds: 2 } } }), false,
    'a salvo field without a guided round is no group');
  assert.equal(hasMultiRoundGroup({ gun: { shells: [{}], autoloader: { magazineSize: 1 } } }), false);
}

// Every playable hull, every shell slot, through the real simulation.
const groups = [];
const belts = [];
let hulls = 0, slots = 0;
for (const id of ALL_TANK_IDS) {
  const spec = TANK_SPECS[id];
  if (!spec?.gun?.shells?.length) continue;
  hulls++;
  for (let slot = 0; slot < spec.gun.shells.length; slot++) {
    const shell = spec.gun.shells[slot];
    const combat = createCombatState(spec);
    if (slot !== 0) {
      assert.ok(selectShell(combat, slot, spec), `${id}[${slot}] ${shell.name}: stocked and selectable`);
      settle(combat);
    }
    slots++;
    const rest = magazineIndicator(combat, spec);
    startPostShotReload(combat, spec);
    const afterFirst = magazineIndicator(combat, spec);
    if (combat.reload.kind === 'intraClip') {
      // A group weapon: it fires again before the long reload, so the indicator must be there from the start.
      assert.ok(rest && rest.capacity >= 2,
        `${id}[${slot}] ${shell.name}: cycles inside a group (intra-clip) but shows no multi-round indicator`);
      assert.equal(rest.rounds, rest.capacity, `${id}[${slot}]: the group is full at rest`);
      assert.ok(afterFirst && afterFirst.capacity === rest.capacity && afterFirst.rounds === rest.capacity - 1,
        `${id}[${slot}]: the first shot spends one round of the group`);
      const cycling = autoloaderHudState(afterFirst, combat.reload);
      assert.ok(cycling && cycling.intraClip && cycling.reloading && cycling.readyShells === Math.min(4, afterFirst.rounds),
        `${id}[${slot}]: the HUD shows the remaining rounds with the intra-clip keyline`);
      const intervalS = combat.reload.totalS;
      let shots = 1;
      while (combat.reload.kind === 'intraClip') {
        settle(combat);
        startPostShotReload(combat, spec);
        shots++;
        assert.ok(shots <= 64, `${id}[${slot}]: a group ends`);
      }
      assert.equal(shots, rest.capacity, `${id}[${slot}]: the group holds exactly its indicated capacity`);
      const spent = magazineIndicator(combat, spec);
      assert.ok(spent && spent.rounds === 0 && spent.capacity === rest.capacity && spent.launcher === rest.launcher,
        `${id}[${slot}]: nothing is ready while the whole group reloads (kind ${combat.reload.kind})`);
      const loading = autoloaderHudState(spent, combat.reload);
      assert.ok(loading && loading.fullReload && loading.readyShells === 0 && loading.reloading,
        `${id}[${slot}]: the group reload fills the indicator progressively (kind ${combat.reload.kind}, launcher ${spent.launcher})`);
      const groupReloadS = combat.reload.totalS;
      settle(combat);
      const refilled = magazineIndicator(combat, spec);
      assert.ok(refilled && refilled.rounds === rest.capacity, `${id}[${slot}]: the group is full again after its reload`);
      assert.equal(autoloaderHudState(refilled, combat.reload).readyShells, Math.min(4, rest.capacity));
      groups.push({ id, slot, shell: shell.name, kind: rest.launcher ? 'salvo' : 'autoloader',
        capacity: rest.capacity, intervalS: +intervalS.toFixed(2), groupReloadS: +groupReloadS.toFixed(2) });
    } else {
      // A single-shot weapon: no group indicator of its own. A hull whose CANNON has a magazine keeps showing that
      // magazine while its single-shot launcher is selected, exactly as before this round.
      if (spec.gun.autoloader && (spec.gun.autoloader.magazineSize ?? 0) > 1 && shell.guided === true) {
        assert.ok(rest && rest.launcher === false && afterFirst && afterFirst.rounds === rest.rounds,
          `${id}[${slot}] ${shell.name}: a guided round on an autoloader hull neither hides nor spends the cannon magazine`);
      } else {
        assert.ok(rest === null || rest.capacity <= 1,
          `${id}[${slot}] ${shell.name}: a single-shot weapon shows no multi-round indicator (got ${JSON.stringify(rest)})`);
      }
      if (combat.reload.totalS < 1) {
        assert.ok((shell.reloadS ?? 0) > 0 && shell.reloadS < 1 && (shell.count ?? 0) >= 20,
          `${id}[${slot}] ${shell.name}: a sub-second cycle outside a group must be an authored autocannon belt`);
        belts.push({ id, slot, shell: shell.name, cycleS: shell.reloadS, count: shell.count });
      }
    }
    assert.equal(hasMultiRoundGroup(spec), groups.some((g) => g.id === id) || spec.gun.shells.some((s, i) => i > slot && (
      (s.guided === true && (spec.gun.launcherSalvo?.rounds ?? 0) > 1) || ((spec.gun.autoloader?.magazineSize ?? 0) > 1))),
      `${id}: hasMultiRoundGroup agrees with the simulated slots so far`);
  }
}

const salvoIds = [...new Set(groups.filter((g) => g.kind === 'salvo').map((g) => g.id))].sort();
const autoloaderIds = [...new Set(groups.filter((g) => g.kind === 'autoloader').map((g) => g.id))].sort();
assert.ok(salvoIds.includes('ztz100_prototype'), 'the ZTZ-100 prototype twin HJ-P9 rack is a salvo group');
assert.ok(salvoIds.includes('object695_x'), 'the Object 695 quad rack is a salvo group');
assert.ok(autoloaderIds.length >= 10, `cannon autoloaders remain covered (${autoloaderIds.length})`);
for (const g of groups.filter((g) => g.kind === 'salvo')) {
  assert.ok(g.intervalS < 1 && g.groupReloadS > 5, `${g.id}[${g.slot}]: a salvo cycles quickly and reloads slowly`);
}
console.log(JSON.stringify({ hulls, slots, groups: groups.length, salvo: salvoIds, autoloaders: autoloaderIds.length,
  belts: belts.map((b) => `${b.id}[${b.slot}]`) }));
console.log(`magazineIndicator.selftest: ${hulls} hulls / ${slots} shell slots fired through the simulation; every ` +
  `intra-group weapon (${autoloaderIds.length} autoloader hulls, ${salvoIds.length} salvo racks: ${salvoIds.join(', ')}) ` +
  `shows the multi-round indicator in every phase; single-shot weapons show none; ${belts.length} autocannon belts listed`);
