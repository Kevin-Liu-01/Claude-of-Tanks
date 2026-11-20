// couch-split-274 (Main's review of the 2 and 4 seat stills): a couch split pane's HUD read the page player's flag
// (`isPlayer`, seat 1's tank) as its own. In a Teams battle every pane but seat 1's listed seat 1 as itself: highlighted,
// on its own side, and out of its enemy count ("ELIMINATE ALL 6" where seat 1's pane read 7), while its own seat's row
// was not highlighted. Now the HUD asks one predicate, hud.ts isOwnTank: a view that owns its frame's player (initHud's
// view.own 'frame', couchPaneViews.ts mountHud) owns the seat's tank; the page's HUD keeps the player's flag.
// Driven on the real battle HUD (initHud) over the recording DOM: seat 2 on the other side from seat 1, its pane's HUD
// against the page's HUD for seat 1 (the control: the page's HUD is as it was).
import { created } from './hudDomHarness.test-support.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createCombatState } from '../sim/damage.ts';
import { createSpecialActionState } from '../sim/specialActionPolicy.ts';
import { createBus } from '../game/stateCore.ts';
import { initHud } from './hud.ts';

const SPEC = 'm1a1_abrams_hc';
await ensureAuthorityFleet([SPEC]);
const spec = getSpec(SPEC);
const tank = (id, team, isPlayer = false) => ({
  id, team, isPlayer, displayName: id, spec, combat: createCombatState(spec), specialAction: createSpecialActionState(spec),
  state: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0, atGunLimit: false, gunLimitSpec: false },
  visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0, 0, 1); } },
});
// a Teams couch battle: seat 1 drives the battle's first tank (the page's player, flagged), seat 2 a tank on the other side
const seat1 = tank('Seat 1', 'player', true);
const seat2 = tank('Seat 2', 'enemy');
const tanks = [seat1, tank('a1', 'player'), tank('a2', 'player'), seat2, tank('e1', 'enemy')];
const aim = { singleReticle: false, point: new THREE.Vector3(0, 0, 100), distM: 100, dispersionRadM: 1, gunLimitSpec: false,
  reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [], zoom: 1,
  gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false, penRatio: null };
const spotting = { isSpotted: () => true };

/** A HUD's roster as it shows it: each row's name, its side (the ear it sits in) and whether it is the HUD's own. */
function rosterOf(madeFrom) {
  const rows = created.slice(madeFrom).filter((element) => element.classes.has('cot-er') && element.parentNode);
  return rows.map((row) => {
    let ear = row.parentNode;
    while (ear && !ear.classes.has('cot-ear')) ear = ear.parentNode;
    return { name: row.querySelector('.nick').textContent, side: ear?.classes.has('l') ? 'own' : ear?.classes.has('r') ? 'enemy' : '?', me: row.classes.has('me') };
  });
}

/** One HUD through a battle's first frames with `player` as its frame's player. */
function runHud(view, player) {
  const madeFrom = created.length;
  const bus = createBus();
  const hud = initHud(bus, view);
  bus.emit('ui:battleStart', { playerId: player.id, specId: SPEC, mapId: 'steppe' });
  hud.setMode('battle');
  bus.emit('phase:change', { phase: 'battle' });
  let timeS = 0;
  for (let i = 0; i < 4; i++) { timeS += 1 / 60; hud.update({ timeS, mode: 'battle', player, tanks, spotting, aim, camera: null }); }
  return { roster: rosterOf(madeFrom) };
}
const row = (roster, name) => roster.find((entry) => entry.name === name);

// seat 2's pane: its own row is seat 2's, on its own side; seat 1 is an enemy and counts as one
const pane = runHud({ mount: globalThis.document.body, own: 'frame' }, seat2);
assert.ok(pane.roster.length >= tanks.length, `the pane's roster shows every hull (${JSON.stringify(pane.roster)})`);
assert.deepEqual(row(pane.roster, 'Seat 2'), { name: 'Seat 2', side: 'own', me: true }, "seat 2's pane highlights seat 2, on its own side");
assert.deepEqual(row(pane.roster, 'Seat 1'), { name: 'Seat 1', side: 'enemy', me: false }, "and lists seat 1 with the enemy, not as itself");
assert.equal(pane.roster.filter((entry) => entry.me).length, 1, 'one own row');
assert.equal(pane.roster.filter((entry) => entry.side === 'own').length, 2, "seat 2's side: seat 2 and e1");
// (the objective's "ELIMINATE ALL n" is the roster tally's enemy total, hud.ts updateStandardScore: the enemy ear's rows)
assert.equal(pane.roster.filter((entry) => entry.side === 'enemy').length, 3, "seat 2's enemies: seat 1, a1 and a2, so ELIMINATE ALL 3");

// the control: the page's HUD for seat 1 (no view) keeps the player's flag
const page = runHud(null, seat1);
assert.deepEqual(row(page.roster, 'Seat 1'), { name: 'Seat 1', side: 'own', me: true }, "the page's HUD: seat 1 is its own");
assert.deepEqual(row(page.roster, 'Seat 2'), { name: 'Seat 2', side: 'enemy', me: false });
assert.equal(page.roster.filter((entry) => entry.side === 'enemy').length, 2, "seat 1's enemies: seat 2 and e1");

console.log("hudOwnTank.selftest: a couch pane's HUD owns its seat's tank (its own row, its side, its enemy count) with seat 2 across from seat 1, and the page's HUD still owns the flagged player's: PASS");
