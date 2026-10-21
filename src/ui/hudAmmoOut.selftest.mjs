// Owner 2026-10-17: "if you are out of ammo, the reload indicators should have a special edge case, including
// autoloader/missile indicators. and for special modes like juggernaut, ammo should be endless."
//
// The simulation keeps cycling an empty gun (startPostShotReload runs after the last round; a full magazine reload
// refills to capacity whatever is stowed; a salvo counter wraps), and the determinism audit hashes that reload state,
// so the edge case lives in presentation. This receipt fires real hulls dry through the simulation and reads every
// indicator the way a battle does: the aim frame from the real aim controller (shared by solo and the network client),
// then the HUD's derivations: the reticle sweep and countdown, the autoloader/salvo rack, the launcher and magazine
// controls. Unlimited rounds (the ruleset's mark on the shell cards) never run dry. hudAmmoOutPaint.selftest paints
// the same states through the live HUD; tools/hud-ammo-states.browser.mjs renders them in Chrome.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { getSpec } from '../vehicles/specs.ts';
import { consumeAmmunition, hasAmmunition } from '../sim/ammunition.ts';
import { createCombatState, selectFirstAvailableShell, startMagazineReload, startPostShotReload, tickReload }
  from '../sim/damage.ts';
import { magazineFedRounds, magazineFeedRounds } from '../sim/magazineIndicator.ts';
import { matchRulesetFor, refillUnlimitedAmmunition } from '../sim/matchRuleset.ts';
import { createAimController } from '../game/aimController.ts';
import { ammunitionSlotViewState, autoloaderHudState, reloadHudFraction, reticleWeaponDry } from './hud.ts';
import { depletedMissileLabel, magazineFeedEmpty } from './vehicleSpecialAction.ts';

// --- the feed derivation (sim/magazineIndicator) ---
{
  const spec = { gun: { shells: [{}, { guided: true }, { reloadGroup: 'coax' }, { guided: false }] } };
  assert.equal(magazineFedRounds({ ammo: [3, 2, 9, 4] }, spec), 7,
    'a cannon magazine feeds from every slot that is neither guided nor on its own reload group');
  assert.equal(magazineFedRounds({ ammo: null }, spec), Infinity, 'no inventory, no cap (fixtures)');
  assert.equal(magazineFedRounds({ ammo: [1] }, null), Infinity, 'no weapon table, no cap');
  assert.equal(magazineFeedRounds({ shellSlot: 1, ammo: [3, 2, 9, 4] }, spec, { launcher: true }, false), 2,
    'a salvo rack loads from its guided slot');
  assert.equal(magazineFeedRounds({ shellSlot: 0, ammo: [3, 2, 9, 4] }, spec, { launcher: false }, false), 7);
  assert.equal(magazineFeedRounds({ shellSlot: 0, ammo: [0, 0, 0, 0] }, spec, { launcher: false }, true), Infinity,
    'unlimited rounds never cap a group');
  assert.equal(magazineFeedRounds({ shellSlot: 0, ammo: [0] }, spec, null, false), Infinity, 'no group, no cap');
}

// --- the HUD derivations ---
{
  assert.equal(reticleWeaponDry({ type: 'APFSDS', count: 0 }), true, 'a finite card with no round is dry');
  assert.equal(reticleWeaponDry({ type: 'APFSDS', count: 1 }), false);
  assert.equal(reticleWeaponDry({ type: 'HE', count: 0, unlimited: true }), false, 'unlimited rounds never run dry');
  assert.equal(reticleWeaponDry({ type: 'APFSDS', count: 0 }, true), false, 'a pending host selection keeps its own read');
  assert.equal(reticleWeaponDry({ type: 'APFSDS' }), false, 'a card without a count is the authored default, not empty');
  assert.equal(reticleWeaponDry(null), false);
  // The reticle's reuse keys (count, unlimited mark, pending) cover the dry read: it is the tray's empty state.
  for (const card of [{ type: 'HE', count: 0 }, { type: 'HE', count: 2 }, { type: 'HE' }, { type: 'HE', count: Number.NaN },
    { type: 'HE', count: 0, unlimited: true }, { type: 'X', count: -1 }]) {
    for (const pending of [false, true]) {
      assert.equal(reticleWeaponDry(card, pending), !pending && ammunitionSlotViewState(card).empty, JSON.stringify(card));
    }
  }
  const loading = { t: 3, totalS: 6, kind: 'shell' };
  assert.equal(reloadHudFraction(loading), 0.5);
  assert.equal(reloadHudFraction(loading, false, true), 0, 'a dry weapon sweeps nothing (and so counts nothing down)');
  assert.equal(reloadHudFraction(loading, true, true), 1, 'a pending selection keeps its full unavailable ring');
  const magazine = { rounds: 4, capacity: 4, feed: 2 };
  const capped = autoloaderHudState(magazine, { t: 0, totalS: 1, kind: 'ready' });
  assert.deepEqual([capped.readyShells, capped.feedShells, capped.visibleShells], [2, 2, 4],
    'a rack never shows more ready rounds than stowage feeds; the rest are spent slots');
  const refill = autoloaderHudState({ rounds: 0, capacity: 4, feed: 2 }, { t: 5, totalS: 10, kind: 'magazine' });
  assert.equal(refill.fullReload, true);
  assert.equal(refill.feedShells, 2, 'a full reload fills only the shells that will load');
  const dry = autoloaderHudState({ rounds: 3, capacity: 4 }, { t: 5, totalS: 10, kind: 'magazine' }, null, true);
  assert.deepEqual([dry.dry, dry.readyShells, dry.feedShells, dry.overflow, dry.fullReload, dry.reloading],
    [true, 0, 0, 0, false, false], 'a dry rack: every shell spent, nothing loading, no +N');
  const dryCycling = autoloaderHudState({ rounds: 2, capacity: 4 }, { t: 1, totalS: 2, kind: 'intraClip' }, null, true);
  assert.deepEqual([dryCycling.intraClip, dryCycling.reloading], [false, false], 'a dry rack never cycles its clip');
  const cycling = autoloaderHudState({ rounds: 2, capacity: 4 }, { t: 1, totalS: 2, kind: 'intraClip' });
  assert.deepEqual([cycling.intraClip, cycling.reloading], [true, true]);
  const big = autoloaderHudState({ rounds: 8, capacity: 8, feed: 6 }, null);
  assert.deepEqual([big.rounds, big.readyShells, big.overflow], [6, 4, 2], 'the +N overflow counts fed rounds only');
  const unknown = autoloaderHudState({ rounds: 2, capacity: 3 }, null);
  assert.equal(unknown.feedShells, 3, 'an indicator without a feed (staged shots, snapshot fixtures) is fully fed');
}

// --- real hulls through the simulation, read through the real aim controller ---
await ensureAuthorityFleet(['m1a1_abrams_hc', 'm1a3', 'ztz100_prototype', 'bwp1']);
const DT = 1 / 60;
const busy = (combat) => combat.reload.t > 0 || (combat.gunReload?.t ?? 0) > 0;
const settle = (combat) => { for (let guard = 0; busy(combat) && guard < 200000; guard++) tickReload(combat, DT); };
function fire(tank, ruleset = null) {
  const { combat, spec } = tank;
  settle(combat);
  const slot = combat.shellSlot;
  if (!consumeAmmunition(combat, slot)) return false;
  if (ruleset) refillUnlimitedAmmunition(ruleset, combat, slot);
  startPostShotReload(combat, spec);
  if (!hasAmmunition(combat, slot)) selectFirstAvailableShell(combat, spec);
  return true;
}
function tankOf(id, ammo = null) {
  const spec = getSpec(id);
  const combat = createCombatState(spec);
  if (ammo) ammo.forEach((count, slot) => { combat.ammo[slot] = count; });
  return { id: 'player', team: 'alpha', isPlayer: true, spec, combat,
    state: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0, speed: 0,
      atGunLimit: false, gunLimitSpec: false },
    visual: { gunMuzzleWorld(out) { out.set(0, 2, 0); }, gunDirWorld(out) { out.set(0, 0, 1); } } };
}
let current = null;
let unlimitedRounds = false;
// The shell cards as game/playerBattleActions builds them: the ruleset's unlimited mark rides every card.
const cards = () => current.spec.gun.shells.map((shell) => ({ name: shell.name, type: shell.guided ? 'ATGM' : shell.type,
  dmg: shell.dmg, penLabel: '', count: 0, ...(unlimitedRounds ? { unlimited: true } : {}) }));
const controller = createAimController({
  getGame: () => ({ player: current, tanks: [current] }),
  getRig: () => ({ aimPoint: new THREE.Vector3(0, 2, 200), aimDist: 200, mode: 'CHASE', zoom: 1 }),
  worldRaycast: () => null,
  targetVisible: () => true,
  getShellCards: cards,
  computeDispersion: () => 0.3,
  now: () => 0,
});
/** One battle frame's indicator read: the aim frame, then what the HUD paints from it. */
function read(tank) {
  current = tank;
  const frame = {
    singleReticle: false, point: new THREE.Vector3(), distM: 0, dispersionRadM: 0, gunLimitSpec: false,
    reload: { t: 0, totalS: 0 }, magazine: { rounds: 0, capacity: 0, launcher: false }, shellSlot: 0, shells: [],
    zoom: 1, gunDistM: 0, gunTargetId: null, gunMarker: new THREE.Vector3(), blockedDistM: null, blockedLabel: false,
    penRatio: null,
  };
  controller.update(frame);
  const dry = reticleWeaponDry(frame.shells[frame.shellSlot], frame.ammoSelectionPending);
  return { frame, dry, sweep: reloadHudFraction(frame.reload, frame.ammoSelectionPending, dry),
    rack: autoloaderHudState(frame.magazine, frame.reload, null, dry),
    magazineControlSpent: magazineFeedEmpty(tank.combat, tank.spec, frame.shells[frame.shellSlot]?.unlimited === true) };
}

// 1. A conventional gun fired to its last round: the reload still runs in the sim, the HUD shows none of it.
{
  const tank = tankOf('m1a1_abrams_hc');
  let shots = 0;
  while (tank.combat.ammo.some((count) => count > 0)) {
    assert.equal(read(tank).dry, false, 'a gun with any round left is never dry');
    assert.ok(fire(tank) && ++shots < 500);
  }
  const view = read(tank);
  assert.equal(shots, 52, 'the whole authored loadout fires, falling back slot to slot');
  assert.ok(tank.combat.reload.t > 0, 'the simulation still runs the post-shot reload (hashed state, unchanged)');
  assert.ok(reloadHudFraction(view.frame.reload) > 0, 'without the edge case the reticle would sweep and count down');
  assert.equal(view.dry, true);
  assert.equal(view.sweep, 0, 'no amber sweep, no countdown');
  assert.equal(view.rack, null, 'a single-shot gun has no rack; the HUD draws one struck round instead');
}

// 2. An autoloader (M1A3: four-round magazine, cannon rounds in slots 0 and 2, a guided round in slot 1).
{
  const tank = tankOf('m1a3', [2, 4, 0]);
  let view = read(tank);
  assert.deepEqual([view.frame.magazine.rounds, view.frame.magazine.feed, view.frame.magazine.capacity], [2, 2, 4],
    'two rounds stowed: the full magazine reads two ready, not four');
  assert.deepEqual([view.rack.readyShells, view.rack.feedShells], [2, 2]);
  fire(tank); fire(tank);
  view = read(tank);
  assert.equal(tank.combat.shellSlot, 1, 'the empty cannon falls back to the guided round');
  assert.equal(view.dry, false, 'the guided round is still loaded: the weapon is not dry');
  assert.equal(tank.combat.magazine.rounds, 2, 'the simulation still holds two rounds in the magazine');
  assert.deepEqual([view.rack.readyShells, view.rack.feedShells], [0, 0], 'the cannon rack shows every shell spent');
  assert.equal(view.magazineControlSpent, true, 'the magazine-reload control is spent: no countdown, no pointless reload');
  while (fire(tank));
  view = read(tank);
  assert.equal(view.dry, true, 'every channel spent: dry');
  assert.equal(view.sweep, 0);
  assert.deepEqual([view.rack.dry, view.rack.readyShells, view.rack.fullReload, view.rack.reloading], [true, 0, false, false]);
  // A manual magazine reload at zero is still accepted by the simulation (it refills to capacity): the rack stays spent.
  settle(tank.combat);
  assert.equal(startMagazineReload(tank.combat, tank.spec), true, 'the sim accepts a manual reload at zero (unchanged)');
  assert.equal(read(tank).rack.fullReload, false, 'a manual reload at zero fills no shell');
  settle(tank.combat);
  assert.equal(tank.combat.magazine.rounds, tank.combat.magazine.capacity, 'the sim refilled the magazine');
  view = read(tank);
  assert.equal(view.frame.magazine.rounds, 0, 'the aim frame caps the refilled magazine at the empty stowage');
  assert.equal(view.rack.readyShells, 0, 'never "full and ready" with nothing stowed');
}

// 3. A guided salvo rack (ZTZ-100 prototype, two-missile groups): one missile left in the group, none stowed.
{
  const tank = tankOf('ztz100_prototype', [3, 0, 0]);
  let view = read(tank);
  assert.equal(view.frame.magazine.launcher, true);
  fire(tank);
  view = read(tank);
  assert.deepEqual([view.frame.magazine.rounds, view.rack.readyShells], [1, 1], 'two stowed: one ready in the group');
  fire(tank); fire(tank);
  view = read(tank);
  assert.equal(tank.combat.launcherSalvoShots, 1, 'the salvo counter still says one missile is left in the group');
  assert.equal(view.dry, true, 'nothing stowed anywhere: dry');
  assert.deepEqual([view.frame.magazine.rounds, view.rack.readyShells, view.rack.fullReload], [0, 0, false],
    'the rack never reads a missile that is not there');
}

// 4. An extra ATGM launcher spent while the cannon still fires (BWP-1): the control is struck, the sight is live.
{
  const tank = tankOf('bwp1');
  const slot = tank.spec.gun.shells.findIndex((shell) => shell.guided === true);
  tank.combat.ammo[slot] = 0;
  const view = read(tank);
  assert.equal(view.dry, false, 'the selected autocannon is loaded');
  assert.notEqual(depletedMissileLabel(tank.combat, slot, tank.spec.gun.shells[slot]), null,
    'the launcher control enters its empty state (the count is spoken, the button is struck)');
  assert.equal(view.magazineControlSpent, false, 'a hull without a magazine never shows a spent magazine control');
}

// 5. Unlimited rounds (Juggernaut, Infected and the Horde play them in their ruleset rows since the merged rules head,
// gameplay-modes-227 ab82b3403): counts never run down, nothing ever reads dry.
{
  unlimitedRounds = true;
  for (const mode of ['juggernaut', 'infected', 'endless_horde']) assert.equal(matchRulesetFor(mode).ammo, 'unlimited', mode);
  const ruleset = matchRulesetFor('juggernaut');
  const tank = tankOf('m1a3');
  for (let shot = 0; shot < 120; shot++) assert.ok(fire(tank, ruleset));
  const view = read(tank);
  assert.deepEqual(tank.combat.ammo, tank.combat.ammoCapacity, 'the fired channel refills at every shot');
  assert.equal(view.frame.shells[view.frame.shellSlot].unlimited, true, 'the card carries ∞');
  assert.equal(view.dry, false);
  assert.equal(view.frame.magazine.feed, view.frame.magazine.capacity, 'the clip cadence is untouched');
  assert.equal(reticleWeaponDry({ type: 'APFSDS', count: 0, unlimited: true }), false);
  // The ∞ mark is the one read of "endless" on every path (round 32: an unlimited slot never reads empty, whatever its
  // count): with every stowage counter at zero the rack stays fed, the sight live, the magazine control unstruck — and
  // the loader audible (audioEngine.selftest) — so no indicator contradicts another.
  const empty = tankOf('m1a3', [0, 0, 0]);
  const capped = read(empty);
  assert.deepEqual([capped.frame.magazine.feed, capped.frame.magazine.rounds, capped.frame.magazine.capacity], [4, 4, 4],
    'unlimited rounds never cap the magazine by the stowage counters');
  assert.deepEqual([capped.dry, capped.rack.readyShells, capped.rack.feedShells, capped.magazineControlSpent],
    [false, 4, 4, false], 'rack, sight and magazine control agree under the mark');
  assert.equal(ammunitionSlotViewState({ type: 'APFSDS', count: 0, unlimited: true }).empty, false, 'and so does the tray');
  unlimitedRounds = false;
  const finite = read(empty);
  assert.deepEqual([finite.frame.magazine.feed, finite.rack.readyShells, finite.dry, finite.magazineControlSpent],
    [0, 0, true, true], 'the same counters, finite: every path reads empty');
}

// 6. The network mirror: the client reads the authority's indicator and its own mirrored ammunition.
{
  const tank = tankOf('m1a3', [1, 0, 0]);
  tank.combat.magazineIndicator = { rounds: 3, capacity: 4, launcher: false };
  const view = read(tank);
  assert.deepEqual([view.frame.magazine.rounds, view.frame.magazine.feed], [1, 1],
    'a mirrored magazine is capped by the mirrored stowage (no wire change)');
}

// 7. The struck controls' danger ink is a HUD token (the live wiring is hudAmmoOutPaint.selftest's).
{
  const hud = readFileSync(new URL('./hud.ts', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('./battleHudLayout.css', import.meta.url), 'utf8');
  const touch = readFileSync(new URL('./touchControls.ts', import.meta.url), 'utf8');
  assert.match(hud, /--hud-danger:#[0-9a-f]{6};/, 'the danger ink is a HUD token');
  assert.match(layout, /\.cot-vehicle-controls>button\.empty \.si::after\{[^}]*background:var\(--hud-danger\)/,
    'the struck control reads the token');
  assert.match(touch, /\.cot-shell\.sel\.empty\{[^}]*border-bottom-color:var\(--hud-danger\)/,
    'the collapsed phone tray shows its selected empty slot in the token, over the amber frame');
  assert.match(touch, /\.cot-shell\.sel\.empty::before\{content:'';[^}]*background:var\(--hud-danger\)[^}]*rotate\(-45deg\)/,
    'struck through like a spent control (r3: the bare danger edge still read as selected)');
  assert.match(touch, /\.cot-shell\.sel\.empty \.cnt\{color:var\(--hud-danger\);\}/, 'its count in the danger ink');
  assert.match(touch, /\.cot-shell\.unlimited \.cnt\{font-size:16px;/, 'the phone ∞ at the numeral\'s size');
  // critic r3: desktop empty slots read OUT the way the phone's do — struck on a danger edge, their 0 in the token
  assert.match(hud, /\.cot-shell\.empty\{[^}]*border-bottom-color:var\(--hud-danger\)[^}]*box-shadow:inset 0 -2px 0 var\(--hud-danger\)/,
    'a desktop empty slot sits on a danger edge');
  // (critic r4 advisory: the values the capture reads are pinned here too — the strike is drawn)
  assert.match(hud, /\.cot-shell\.empty::before\{content:'';[^}]*background:var\(--hud-danger\)[^}]*rotate\(-45deg\)/, 'struck through');
  assert.match(hud, /\.cot-shell\.empty \.cnt\{color:var\(--hud-danger\);\}/, 'its 0 in the danger ink');
  // Release 230 type floor: at 11 px one row cannot hold a type label and its count (APFSDS alone is 41 px of the 62 px
  // slot), so every tray sets them as the stacked and touch trays did since critic r6: the count in the top-right
  // corner, the label alone on the floor, never under 11 px.
  assert.doesNotMatch(hud, /\.cot-shell\.wide \.ty\{/, 'the label keeps its size beside a three-digit count (it no longer shares its row)');
  assert.match(hud, /\n\.cot-shell \.ty\{position:absolute;bottom:2px;left:4px;right:3px;font-size:11px;font-weight:700;/,
    'the type label sits on the slot\'s floor at the 11 px floor');
  assert.match(hud, /\n\.cot-shell\.wide \.cnt\{right:3px;font-size:12px;letter-spacing:0;\}/, 'a three-digit count sets a step smaller in its corner');
  // critic r4: the shell gives way to a three-digit count — shrinking and stepping out from under the touch corner count
  // (the rendered ink gap, 3 px at the least, is the capture's)
  assert.doesNotMatch(hud, /\n\.cot-shell\.wide canvas\{/, 'the desktop shell needs no step for a three-digit count: the count sits above its drum');
  assert.match(touch, /body\.cot-touch-layout \.cot-shell\.wide \.cnt\{top:1px;right:2px;font-size:11px;\}\n/,
    'the phone sets a three-digit count smaller in its corner');
  assert.match(touch, /body\.cot-touch-layout \.cot-shell\.wide canvas\{bottom:12px;transform:translateX\(calc\(-50% - 5px\)\) scale\(\.6\);\}/,
    'and its shell shrinks and steps left, out from under it, 3 px over the label');
  // critic r4b: no marks touch — the shell's tail clears the type label. Desktop raises it 3 px; on touch it stands on
  // the label's floor (bottom-anchored, so every slot height keeps the gap) and shrinks on the shorter slots (the
  // rendered label-to-icon ink gap, 3 px at the least, is the capture's)
  const responsive = readFileSync(new URL('./responsiveSurfaces.css', import.meta.url), 'utf8');
  assert.match(hud, /\n\.cot-shell canvas\{position:absolute;left:50%;top:50%;transform:translate\(-50%,-50%\) scale\(\.78\);\}/,
    'a desktop slot\'s shell stands between its corner count and its type label');
  assert.match(hud, /\n\.cot-shell \.cnt\{position:absolute;top:2px;right:3px;/, 'and its count takes the top-right corner');
  assert.match(touch, /body\.cot-touch-layout \.cot-shell canvas\{top:auto;bottom:11px;transform:translateX\(-50%\) scale\(\.76\);transform-origin:50% 100%;\}/,
    'a touch slot\'s shell stands on the label\'s floor');
  assert.match(responsive, /\[data-cot-orientation='landscape'\] \.cot-shell:not\(\.wide\) canvas\{bottom:12px;transform:translateX\(-50%\) scale\(\.64\)\}/,
    'the 48 px landscape slot\'s shell is smaller, clear of the corner count and the label');
  assert.equal(layout.match(/\.cot-touch-layout \.cot-shell:not\(\.wide\) canvas\{transform:translateX\(-50%\) scale\(\.6\)\}/g)?.length, 1,
    'and the 44 px tall slots\' smaller again (a portrait under 341 px wide)');
  assert.equal(layout.match(/\.cot-touch-layout \.cot-shell:not\(\.wide\) canvas\{transform:translateX\(calc\(-50% - 3px\)\) scale\(\.6\)\}/g)?.length, 1,
    'a landscape under 300 px tall too, its 44 px wide slot stepping the dart left of the corner count');
  assert.match(touch, /body\.cot-gun-dry \.cot-touch \.fire\{[^}]*opacity:\.62/, 'a dry gun dims the FIRE buttons');
  // critic r6: every mouse tray under 1000 px stacks (48x52 slots at 900 px, 44x52 at 640) and its bottom row cannot
  // hold a type label and a count (APFSDS|∞ overlapped by 12 px; the old stacked scale had dropped the desktop raise).
  // The count takes the top-right corner beside a smaller key, the shell stands on the label's floor and gives way to a
  // three-digit count, and an empty slot's strike spans the icon (the rendered 3 px ink gaps are the capture's).
  const stacked = (rule) => new RegExp(`:not\\(\\.cot-touch-layout\\)\\[data-hud-tray='stacked'\\] ${rule}`);
  assert.doesNotMatch(layout, stacked("\\.cot-shell canvas\\{transform:translate\\(-50%,-50%\\)"), 'no centred stacked shell over the label');
  assert.match(layout, stacked("\\.cot-shell canvas\\{top:auto;bottom:14px;transform:translateX\\(-50%\\) scale\\(\\.6\\);transform-origin:50% 100%\\}"),
    'a stacked slot\'s shell stands on the label\'s floor');
  assert.match(layout, stacked("\\.cot-shell\\.wide canvas\\{transform:translateX\\(calc\\(-50% - 3px\\)\\) scale\\(\\.54\\)\\}"),
    'and shrinks and steps left under a three-digit count');
  assert.match(layout, stacked("\\.cot-shell \\.cnt\\{top:2px;right:3px;bottom:auto;font-size:11px\\}"), 'its count takes the top-right corner');
  assert.match(layout, stacked("\\.cot-shell\\.wide \\.cnt\\{top:1px;right:2px;font-size:11px\\}"), 'a three-digit count keeps the 11 px floor there');
  assert.match(layout, stacked("\\.cot-shell \\.ty\\{left:1px;right:1px;text-align:center\\}"), 'the label centres on the narrow slot\'s floor');
  assert.match(layout, stacked("\\.cot-shell\\.unlimited \\.cnt\\{font-size:16px;line-height:11px\\}"), 'the ∞ at the corner numeral\'s size');
  assert.match(layout, stacked(":is\\(\\.cot-shell,\\.cot-con\\) \\.key\\{top:1px;left:1px;padding:0 2px;font-size:11px;line-height:12px\\}"),
    'the key keeps the top-left corner at the 11 px floor (the consumables\' too, so the tray\'s keys match)');
  assert.match(layout, stacked("\\.cot-shell\\.empty::before\\{left:12px;right:12px\\}"), 'an empty slot\'s strike spans its icon');
  assert.match(layout, /\[data-hud-tray='stacked'\]:is\(\[data-cot-width='phone'\],\[data-cot-width='compact'\]\) \.cot-shell:not\(\.wide\) canvas\{transform:translateX\(calc\(-50% - 1px\)\) scale\(\.56\)\}/,
    'the 44 px wide stacked slots draw it smaller and 1 px left, clear of a two-digit count');
  // critic r7: the reload shade dims a slot's picture, never its marks. The stacked and touch counts take the top-right
  // corner, under the shade's top-anchored edge, so a reloading 24 read about 2:1 there while the ∞ beside it stayed
  // white: the key, the count and the type label stand over the shade (the frame's brightness read is the capture's).
  // (a rule's body may hold a ${FONT_COND} interpolation)
  const zOf = (selector) => Number(new RegExp(`\\n${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{(?:\\$\\{[^}]*\\}|[^}])*z-index:(\\d+);`).exec(hud)?.[1]);
  const shadeZ = zOf('.cot-shell .cool');
  assert.ok(shadeZ >= 1, `the reload shade's layer (${shadeZ})`);
  for (const mark of ['.cot-shell .key', '.cot-shell .cnt', '.cot-shell .ty', '.cot-shell.unlimited .cnt']) {
    assert.ok(zOf(mark) > shadeZ, `${mark} stands over the reload shade (${zOf(mark)} over ${shadeZ})`);
  }
  for (const sheet of [layout, touch, responsive]) {
    assert.doesNotMatch(sheet, /\.cot-shell[^{]*\.(cnt|key|ty)\{[^}]*z-index/, 'no layout sheet drops a mark back under it');
  }
  // the rendered proof of these rules is tools/hud-ammo-states.browser.mjs (computed styles of the live tray)
}

console.log('hudAmmoOut.selftest: conventional, autoloader, salvo rack and ATGM fired dry through the simulation show no '
  + 'reload, ready or loaded state; unlimited rounds never run dry; the network mirror is capped without a wire change');
